import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, describe, it } from 'node:test';

import { createGatewayHandler } from '../app.mjs';

const servers = [];
const baseConfig = {
  enabled: true,
  diagnosticsEnabled: false,
  apiKey: 'test-only-secret',
  responsesUrl: 'https://api.deepseek.invalid/responses',
  model: 'deepseek-v4-flash',
  reasoningEffort: 'high',
  upstreamTimeoutMs: 50,
  maxOutputTokens: 4096,
  maxBodyBytes: 8192,
  allowedOrigins: ['http://127.0.0.1:8081'],
};
const requestBody = {
  schemaVersion: 1,
  capture: { rawText: '明天整理项目说明', source: 'webText' },
  context: { referenceDate: '2026-07-24', timeZone: 'Asia/Shanghai', locale: 'zh-CN' },
};
const validDraft = {
  title: '整理项目说明',
  category: 'work',
  outcome: 'task',
  suggestedBucket: 'today',
  suggestedDate: '2026-07-25',
  estimatedMinutes: 45,
  nextAction: '整理项目说明',
  waitingDetails: null,
  knowledgeSummary: null,
  confidence: 0.92,
  reason: '这是明天需要处理的具体工作任务。',
};

function deepSeekResponsesEnvelope(draft = validDraft) {
  return {
    id: 'response-deepseek-test',
    object: 'response',
    status: 'completed',
    model: 'deepseek-v4-flash',
    output: [
      { type: 'reasoning', id: 'reasoning-test', status: 'completed', content: [] },
      {
        type: 'message',
        id: 'message-test',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(draft), annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 50,
      output_tokens_details: { reasoning_tokens: 10 },
      total_tokens: 150,
    },
    store: false,
    previous_response_id: null,
  };
}

function upstreamResponse(draft = validDraft) {
  return new Response(JSON.stringify(deepSeekResponsesEnvelope(draft)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function startGateway(options = {}) {
  const logs = [];
  const handler = createGatewayHandler({
    config: { ...baseConfig, ...options.config },
    fetchImpl: options.fetchImpl ?? (async () => upstreamResponse()),
    logger: { info: (entry) => logs.push(entry) },
  });
  const server = createServer(handler);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { url: `http://127.0.0.1:${address.port}`, logs };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe('local proposal gateway', () => {
  it('sends one minimal DeepSeek Responses request and accepts its compatible envelope', async () => {
    let upstreamCalls = 0;
    let upstreamBody;
    const { url, logs } = await startGateway({
      fetchImpl: async (_url, init) => {
        upstreamCalls += 1;
        upstreamBody = JSON.parse(init.body);
        return upstreamResponse();
      },
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:8081' },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'success', schemaVersion: 1, draft: validDraft });
    assert.equal(upstreamCalls, 1);
    assert.equal(upstreamBody.model, 'deepseek-v4-flash');
    assert.equal(upstreamBody.store, false);
    assert.deepEqual(upstreamBody.reasoning, { effort: 'high' });
    assert.equal(upstreamBody.max_output_tokens, 4096);
    assert.equal(upstreamBody.input[0].role, 'developer');
    assert.equal(upstreamBody.text.format.type, 'json_schema');
    assert.equal(upstreamBody.text.format.strict, true);
    assert.deepEqual(
      upstreamBody.text.format.schema.properties.suggestedBucket.type,
      ['string', 'null'],
    );
    assert.deepEqual(
      upstreamBody.text.format.schema.properties.suggestedBucket.enum,
      ['today', 'waiting', 'someday', null],
    );
    assert.deepEqual(JSON.parse(upstreamBody.input[1].content), {
      referenceDate: '2026-07-24',
      timeZone: 'Asia/Shanghai',
      locale: 'zh-CN',
      capture: { rawText: '明天整理项目说明', source: 'webText' },
    });
    assert.equal(JSON.stringify(logs).includes(requestBody.capture.rawText), false);
    assert.equal(JSON.stringify(logs).includes(baseConfig.apiKey), false);
  });

  it('rejects extra request fields before calling the model', async () => {
    let upstreamCalls = 0;
    const { url } = await startGateway({ fetchImpl: async () => { upstreamCalls += 1; return upstreamResponse(); } });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody, tasks: [{ title: '不应上传' }] }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid_proposal');
    assert.equal(upstreamCalls, 0);
  });

  for (const mapping of [
    { upstream: 400, gateway: 400, code: 'invalid_proposal', retryable: false, message: '云端模型请求格式无效，请检查本地模型配置。' },
    { upstream: 401, gateway: 401, code: 'proposal_unavailable', retryable: false, message: '云端模型认证失败，请检查本地 API Key。' },
    { upstream: 402, gateway: 402, code: 'proposal_unavailable', retryable: false, message: '云端模型账户余额不足，请充值或更换 API Key。' },
    { upstream: 403, gateway: 403, code: 'proposal_unavailable', retryable: false, message: '当前 API Key 无权访问所请求的模型或接口。' },
    { upstream: 404, gateway: 404, code: 'proposal_unavailable', retryable: false, message: '未找到所请求的模型或接口，请检查本地模型配置。' },
    { upstream: 422, gateway: 422, code: 'invalid_proposal', retryable: false, message: '云端模型参数无效，请检查本地模型配置。' },
    { upstream: 429, gateway: 429, code: 'proposal_rate_limited', retryable: true, message: '云端模型请求较多，请稍后重试。' },
    { upstream: 500, gateway: 503, code: 'proposal_unavailable', retryable: true, message: '云端模型暂时不可用。' },
    { upstream: 502, gateway: 503, code: 'proposal_unavailable', retryable: true, message: '云端模型暂时不可用。' },
    { upstream: 503, gateway: 503, code: 'proposal_unavailable', retryable: true, message: '云端模型暂时不可用。' },
    { upstream: 408, gateway: 504, code: 'proposal_timeout', retryable: true, message: '云端模型响应超时。' },
    { upstream: 504, gateway: 504, code: 'proposal_timeout', retryable: true, message: '云端模型响应超时。' },
  ]) {
    it(`maps DeepSeek ${mapping.upstream} to a safe ${mapping.code} failure`, async () => {
      const secretUpstreamDetail = `SENSITIVE_UPSTREAM_${mapping.upstream}`;
      const { url } = await startGateway({
        fetchImpl: async () => new Response(JSON.stringify({ error: { message: secretUpstreamDetail } }), { status: mapping.upstream }),
      });
      const response = await fetch(`${url}/v1/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const body = await response.json();
      assert.equal(response.status, mapping.gateway);
      assert.equal(body.error.code, mapping.code);
      assert.equal(body.error.retryable, mapping.retryable);
      assert.equal(body.error.message, mapping.message);
      assert.equal(JSON.stringify(body).includes(secretUpstreamDetail), false);
    });
  }

  it('maps a successful non-JSON upstream body to a safe failure with a redacted diagnostic', async () => {
    const secretNonJsonBody = 'SENSITIVE_NON_JSON_UPSTREAM_BODY';
    const { url, logs } = await startGateway({
      config: { diagnosticsEnabled: true },
      fetchImpl: async () => new Response(secretNonJsonBody, { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      status: 'failure',
      error: { code: 'invalid_proposal', message: '模型返回的建议格式无效。', retryable: true },
    });
    const diagnostic = logs.find((entry) => entry.event === 'proposal_diagnostic');
    assert.deepEqual(diagnostic, {
      event: 'proposal_diagnostic',
      failureStage: 'response_parsing',
      classification: 'api_adapter',
      issues: [{ path: '$', code: 'invalid_response_envelope_json', expected: 'JSON Responses API envelope' }],
    });
    assert.equal(JSON.stringify(logs).includes(secretNonJsonBody), false);
  });

  it('aborts a slow upstream request', async () => {
    const secretNetworkDetail = 'SENSITIVE_SLOW_FETCH_DETAIL';
    const { url, logs } = await startGateway({
      config: { diagnosticsEnabled: true, upstreamTimeoutMs: 5 },
      fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException(secretNetworkDetail, 'AbortError')));
      }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, 'proposal_timeout');
    assert.deepEqual(logs.find((entry) => entry.event === 'proposal_diagnostic'), {
      event: 'proposal_diagnostic',
      failureStage: 'upstream_request',
      classification: 'api_adapter',
      issues: [{ path: '$', code: 'upstream_timeout', expected: 'Responses API response within configured timeout' }],
    });
    assert.equal(JSON.stringify(logs).includes(secretNetworkDetail), false);
  });

  it('keeps the upstream deadline active while reading a slow response body', async () => {
    const secretBodyMarker = 'SENSITIVE_SLOW_RESPONSE_BODY';
    const deadlineMs = 20;
    const started = performance.now();
    const { url, logs } = await startGateway({
      config: { diagnosticsEnabled: true, upstreamTimeoutMs: deadlineMs },
      fetchImpl: async (_url, init) => ({
        ok: true,
        status: 200,
        json: () => new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException(secretBodyMarker, 'AbortError')), { once: true });
        }),
      }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const elapsedMs = performance.now() - started;
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), {
      status: 'failure',
      error: { code: 'proposal_timeout', message: '云端模型响应超时。', retryable: true },
    });
    assert.ok(elapsedMs >= deadlineMs - 5, `expected approximately ${deadlineMs}ms, got ${elapsedMs}ms`);
    assert.ok(elapsedMs < 1_000, `request exceeded bounded test duration: ${elapsedMs}ms`);
    const diagnostic = logs.find((entry) => entry.event === 'proposal_diagnostic');
    assert.deepEqual(diagnostic, {
      event: 'proposal_diagnostic',
      failureStage: 'upstream_response',
      classification: 'api_adapter',
      issues: [{ path: '$', code: 'upstream_timeout', expected: 'complete Responses API response body within configured timeout' }],
    });
    assert.deepEqual(Object.keys(diagnostic).sort(), ['classification', 'event', 'failureStage', 'issues']);
    assert.deepEqual(Object.keys(diagnostic.issues[0]).sort(), ['code', 'expected', 'path']);
    assert.equal(JSON.stringify(logs).includes(secretBodyMarker), false);
  });

  it('diagnoses an upstream network failure without logging exception details', async () => {
    const secretNetworkDetail = 'SENSITIVE_NETWORK_EXCEPTION';
    const { url, logs } = await startGateway({
      config: { diagnosticsEnabled: true },
      fetchImpl: async () => { throw new Error(secretNetworkDetail); },
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 503);
    const diagnostic = logs.find((entry) => entry.event === 'proposal_diagnostic');
    assert.deepEqual(diagnostic, {
      event: 'proposal_diagnostic',
      failureStage: 'upstream_request',
      classification: 'api_adapter',
      issues: [{ path: '$', code: 'upstream_network_error', expected: 'reachable Responses API endpoint' }],
    });
    assert.equal(JSON.stringify(logs).includes(secretNetworkDetail), false);
  });

  it('rejects internal names in model-visible fields', async () => {
    const { url } = await startGateway({
      fetchImpl: async () => upstreamResponse({ ...validDraft, title: 'CloudProposalDraft' }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, 'invalid_proposal');
  });

  it('keeps diagnostics disabled by default for invalid model output', async () => {
    const { url, logs } = await startGateway({
      fetchImpl: async () => upstreamResponse({ ...validDraft, suggestedBucket: 'secret-invalid-bucket' }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 502);
    assert.equal(logs.some((entry) => entry.event === 'proposal_diagnostic'), false);
  });

  it('logs only allowlisted schema diagnostics without raw values or secrets', async () => {
    const secretCapture = 'SENSITIVE_CAPTURE_TEXT';
    const secretFieldValue = 'SENSITIVE_FIELD_VALUE';
    const secretEnvelopeValue = 'SENSITIVE_UPSTREAM_ENVELOPE';
    const { url, logs } = await startGateway({
      config: { diagnosticsEnabled: true },
      fetchImpl: async () => new Response(JSON.stringify({
        id: secretEnvelopeValue,
        output: [{ content: [{ type: 'output_text', text: JSON.stringify({ ...validDraft, suggestedBucket: secretFieldValue }) }] }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody, capture: { rawText: secretCapture, source: 'webText' } }),
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.deepEqual(body, {
      status: 'failure',
      error: { code: 'invalid_proposal', message: '模型返回的建议未通过安全校验。', retryable: true },
    });
    const diagnostic = logs.find((entry) => entry.event === 'proposal_diagnostic');
    assert.deepEqual(diagnostic, {
      event: 'proposal_diagnostic',
      failureStage: 'draft_validation',
      classification: 'schema_validation',
      issues: [{ path: '$.suggestedBucket', code: 'bucket_enum_or_null', expected: 'today | waiting | someday | null' }],
    });
    const serialized = JSON.stringify(logs);
    assert.equal(serialized.includes(secretCapture), false);
    assert.equal(serialized.includes(secretFieldValue), false);
    assert.equal(serialized.includes(secretEnvelopeValue), false);
    assert.equal(serialized.includes(baseConfig.apiKey), false);
    assert.equal(serialized.includes('Authorization'), false);
  });

  it('classifies domain validation without logging the invalid field value', async () => {
    const secretFieldValue = 'SENSITIVE_KNOWLEDGE_VALUE';
    const { url, logs } = await startGateway({
      config: { diagnosticsEnabled: true },
      fetchImpl: async () => upstreamResponse({ ...validDraft, knowledgeSummary: secretFieldValue }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 502);
    const diagnostic = logs.find((entry) => entry.event === 'proposal_diagnostic');
    assert.deepEqual(diagnostic, {
      event: 'proposal_diagnostic',
      failureStage: 'draft_validation',
      classification: 'domain_validation',
      issues: [{ path: '$.knowledgeSummary', code: 'task_knowledge_summary_null', expected: 'null when outcome is task' }],
    });
    assert.equal(JSON.stringify(logs).includes(secretFieldValue), false);
  });

  it('diagnoses response parsing without logging malformed output text', async () => {
    const secretMalformedOutput = 'SENSITIVE_MALFORMED_OUTPUT';
    const { url, logs } = await startGateway({
      config: { diagnosticsEnabled: true },
      fetchImpl: async () => new Response(JSON.stringify({
        output: [{ content: [{ type: 'output_text', text: secretMalformedOutput }] }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 502);
    const diagnostic = logs.find((entry) => entry.event === 'proposal_diagnostic');
    assert.deepEqual(diagnostic, {
      event: 'proposal_diagnostic',
      failureStage: 'response_parsing',
      classification: 'response_parsing',
      issues: [{ path: '$.output', code: 'invalid_draft_json', expected: 'valid JSON object text' }],
    });
    assert.equal(JSON.stringify(logs).includes(secretMalformedOutput), false);
  });

  it('normalizes explicit tomorrow without treating the time of day as today', async () => {
    const { url } = await startGateway({
      fetchImpl: async () => upstreamResponse({
        ...validDraft,
        title: '回复客户',
        category: 'communication',
        suggestedDate: null,
        estimatedMinutes: 15,
        nextAction: '回复客户',
      }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...requestBody,
        capture: { rawText: '明天下午回复客户', source: 'webText' },
      }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).draft.suggestedDate, '2026-07-25');
  });

  it('removes a model today fallback when the capture has no date', async () => {
    const { url } = await startGateway({
      fetchImpl: async () => upstreamResponse({ ...validDraft, suggestedDate: null }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody, capture: { rawText: '整理项目说明', source: 'webText' } }),
    });
    assert.equal(response.status, 200);
    const draft = (await response.json()).draft;
    assert.equal(draft.suggestedBucket, null);
    assert.equal(draft.suggestedDate, null);
  });

  it('preserves a legal knowledge Draft before task-only postprocessing', async () => {
    const knowledgeDraft = {
      title: '复盘目标确认原则', category: 'work', outcome: 'knowledge', suggestedBucket: null, suggestedDate: null,
      estimatedMinutes: null, nextAction: null, waitingDetails: null, knowledgeSummary: '先确认目标，再检查数据。', confidence: 0.9, reason: '这是可复用的复盘经验。',
    };
    const { url } = await startGateway({ fetchImpl: async () => upstreamResponse(knowledgeDraft) });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody, capture: { rawText: '复盘经验：先确认目标，然后检查数据', source: 'webText' } }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).draft, knowledgeDraft);
  });

  it('preserves waiting while removing an unsupported model follow-up date', async () => {
    const waitingDraft = {
      title: '等待老师回复', category: 'communication', outcome: 'task', suggestedBucket: 'waiting', suggestedDate: null,
      estimatedMinutes: null, nextAction: null, waitingDetails: { waitingFor: '老师', waitingOn: '回复', followUpDate: '2026-07-31' }, knowledgeSummary: null, confidence: 0.9, reason: '当前需要等待老师回复。',
    };
    const { url } = await startGateway({ fetchImpl: async () => upstreamResponse(waitingDraft) });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody, capture: { rawText: '等老师下周回复', source: 'webText' } }),
    });
    assert.equal(response.status, 200);
    const draft = (await response.json()).draft;
    assert.equal(draft.suggestedBucket, 'waiting');
    assert.equal(draft.waitingDetails.followUpDate, null);
  });

  it('derives a waiting follow-up date only from explicit follow-up intent and a resolvable day', async () => {
    const waitingDraft = {
      title: '等待老师回复', category: 'communication', outcome: 'task', suggestedBucket: 'waiting', suggestedDate: null,
      estimatedMinutes: null, nextAction: null, waitingDetails: { waitingFor: '老师', waitingOn: '回复', followUpDate: '2026-07-31' }, knowledgeSummary: null, confidence: 0.9, reason: '当前需要等待老师回复。',
    };
    const { url } = await startGateway({ fetchImpl: async () => upstreamResponse(waitingDraft) });
    for (const expected of [
      { rawText: '等老师回复', followUpDate: null },
      { rawText: '等老师下周回复', followUpDate: null },
      { rawText: '周五还没回复就提醒我', followUpDate: '2026-07-24' },
    ]) {
      const response = await fetch(`${url}/v1/proposals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestBody, capture: { rawText: expected.rawText, source: 'webText' } }),
      });
      assert.equal(response.status, 200);
      const draft = (await response.json()).draft;
      assert.equal(draft.suggestedBucket, 'waiting');
      assert.equal(draft.waitingDetails.followUpDate, expected.followUpDate);
    }
  });

  it('does not let a waiting Draft hide a later independent action', async () => {
    const waitingDraft = {
      title: '等待老师回复', category: 'communication', outcome: 'task', suggestedBucket: 'waiting', suggestedDate: null,
      estimatedMinutes: null, nextAction: null, waitingDetails: { waitingFor: '老师', waitingOn: '回复', followUpDate: '2026-07-31' }, knowledgeSummary: null, confidence: 0.9, reason: '当前需要等待老师回复。',
    };
    const { url } = await startGateway({ fetchImpl: async () => upstreamResponse(waitingDraft) });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody, capture: { rawText: '等老师回复，然后提交申请', source: 'webText' } }),
    });
    assert.equal(response.status, 200);
    const draft = (await response.json()).draft;
    assert.equal(draft.category, 'unknown');
    assert.equal(draft.suggestedBucket, null);
    assert.equal(draft.title, '等老师回复，然后提交申请');
    assert.match(draft.reason, /拆开/u);
  });

  it('ignores trailing semicolons while retaining multiple independent actions', async () => {
    const { url } = await startGateway();
    for (const rawText of ['交电费；', '交电费；取快递；', '交电费；取快递；报名比赛；']) {
      const response = await fetch(`${url}/v1/proposals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestBody, capture: { rawText, source: 'webText' } }),
      });
      assert.equal(response.status, 200);
      const draft = (await response.json()).draft;
      if (rawText === '交电费；') {
        assert.equal(draft.category, validDraft.category);
      } else {
        assert.equal(draft.category, 'unknown');
        assert.equal(draft.suggestedBucket, null);
        assert.match(draft.reason, /拆开/u);
      }
    }
  });

  it('derives task dates from the capture instead of trusting model-provided dates', async () => {
    const { url } = await startGateway({
      fetchImpl: async () => upstreamResponse({ ...validDraft, suggestedDate: '2026-07-24' }),
    });
    for (const expected of [
      { rawText: '整理项目说明', suggestedBucket: null, suggestedDate: null },
      { rawText: '明天整理项目说明', suggestedBucket: 'today', suggestedDate: '2026-07-25' },
      { rawText: '下周三整理项目说明', suggestedBucket: 'today', suggestedDate: '2026-07-29' },
    ]) {
      const response = await fetch(`${url}/v1/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestBody, capture: { rawText: expected.rawText, source: 'webText' } }),
      });
      assert.equal(response.status, 200);
      const draft = (await response.json()).draft;
      assert.equal(draft.suggestedBucket, expected.suggestedBucket);
      assert.equal(draft.suggestedDate, expected.suggestedDate);
    }
  });

  it('recognizes explicit deferred intent without treating a dated range as someday', async () => {
    const { url } = await startGateway({
      fetchImpl: async () => upstreamResponse({ ...validDraft, suggestedDate: null, suggestedBucket: null }),
    });
    for (const expected of [
      { rawText: '哪天再弄一下个人主页', suggestedBucket: 'someday' },
      { rawText: '个人主页暂时不急', suggestedBucket: 'someday' },
      { rawText: '回头再整理项目说明', suggestedBucket: 'someday' },
      { rawText: '下周再整理项目说明', suggestedBucket: null },
    ]) {
      const response = await fetch(`${url}/v1/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestBody, capture: { rawText: expected.rawText, source: 'webText' } }),
      });
      assert.equal(response.status, 200);
      const draft = (await response.json()).draft;
      assert.equal(draft.suggestedBucket, expected.suggestedBucket);
      assert.equal(draft.suggestedDate, null);
    }
  });

  it('does not call the model when AI_ENABLED is off', async () => {
    let upstreamCalls = 0;
    const { url } = await startGateway({
      config: { enabled: false },
      fetchImpl: async () => {
        upstreamCalls += 1;
        return upstreamResponse();
      },
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'proposal_unavailable');
    assert.equal(upstreamCalls, 0);
  });

  it('maps model refusal without returning the raw refusal', async () => {
    const { url } = await startGateway({
      fetchImpl: async () => new Response(JSON.stringify({
        output: [{ content: [{ type: 'refusal', refusal: 'raw refusal detail' }] }],
      }), { status: 200 }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const body = await response.json();
    assert.equal(response.status, 422);
    assert.equal(body.error.code, 'proposal_refused');
    assert.equal(JSON.stringify(body).includes('raw refusal detail'), false);
  });
});
