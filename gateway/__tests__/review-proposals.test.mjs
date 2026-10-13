import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, describe, it } from 'node:test';

import { createLocalServiceHandler } from '../local-service.mjs';
import { createReviewProposalsHandler } from '../review-proposals.mjs';

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
const snapshot = {
  date: '2026-07-17',
  timeZone: 'Asia/Shanghai',
  plannedCount: 4,
  completedAsPlannedCount: 2,
  completedTotalCount: 3,
  recordedMinutes: 110,
  interruptions: 2,
  categoryMinutes: [{ category: 'learning', minutes: 70 }, { category: 'work', minutes: 40 }],
  recordsComplete: true,
};
const requestBody = { schemaVersion: 1, snapshot };
const validSuggestion = {
  title: '给一段执行留出完整时间',
  factIds: ['interruptions', 'recordedMinutes'],
  action: '明天开始时把手机放到视线外，直到这一段自然结束再取回。',
};

function envelope(payload) {
  return {
    id: 'response-review-test',
    object: 'response',
    status: 'completed',
    output: [{
      type: 'message',
      id: 'message-review-test',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify(payload), annotations: [] }],
    }],
    store: false,
  };
}

function upstreamResponse(payload = { suggestions: [validSuggestion] }) {
  return new Response(JSON.stringify(envelope(payload)), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function upstreamStatus(status) {
  return new Response(JSON.stringify({ error: { message: 'upstream detail that must never be forwarded' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const abortingFetch = (_url, init) => new Promise((_resolve, reject) => {
  init.signal.addEventListener('abort', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    reject(error);
  });
});

async function startReview(options = {}) {
  const logs = [];
  const handler = options.handler ?? createReviewProposalsHandler({
    config: { ...baseConfig, ...options.config },
    fetchImpl: options.fetchImpl ?? (async () => upstreamResponse()),
    logger: { info: (entry) => logs.push(entry) },
  });
  const server = createServer(handler);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, logs };
}

async function post(url, body, headers = { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:8081' }) {
  const response = await fetch(`${url}/v1/review-proposals`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null), response };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe('review proposals gateway', () => {
  it('sends one minimal Responses request whose user content is exactly the snapshot', async () => {
    let upstreamCalls = 0;
    let upstreamBody;
    const { url, logs } = await startReview({
      fetchImpl: async (_url, init) => {
        upstreamCalls += 1;
        upstreamBody = JSON.parse(init.body);
        return upstreamResponse();
      },
    });

    const result = await post(url, requestBody);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: 'success', schemaVersion: 1, suggestions: [validSuggestion] });
    assert.equal(upstreamCalls, 1);
    assert.equal(upstreamBody.model, 'deepseek-v4-flash');
    assert.equal(upstreamBody.store, false);
    assert.deepEqual(upstreamBody.reasoning, { effort: 'high' });
    assert.equal(upstreamBody.input[0].role, 'developer');
    assert.match(upstreamBody.input[0].content, /Never state a number/u);
    assert.equal(upstreamBody.text.format.type, 'json_schema');
    assert.equal(upstreamBody.text.format.name, 'reflow_review_proposal_draft');
    assert.equal(upstreamBody.text.format.strict, true);
    assert.deepEqual(upstreamBody.text.format.schema.properties.suggestions.maxItems, 2);
    assert.deepEqual(upstreamBody.text.format.schema.properties.suggestions.items.properties.factIds.items.enum, [
      'plannedCount', 'completedAsPlannedCount', 'completedTotalCount', 'recordedMinutes',
      'interruptions', 'categoryMinutes', 'recordsComplete',
    ]);
    assert.deepEqual(JSON.parse(upstreamBody.input[1].content), snapshot);
    assert.equal(JSON.stringify(logs).includes(baseConfig.apiKey), false);
    assert.equal(JSON.stringify(logs).includes('Authorization'), false);
  });

  it('returns an honest empty result when the model finds the evidence insufficient', async () => {
    const { url } = await startReview({ fetchImpl: async () => upstreamResponse({ suggestions: [] }) });
    const result = await post(url, requestBody);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: 'success', schemaVersion: 1, suggestions: [] });
  });

  it('rejects extra request fields before calling the model', async () => {
    for (const body of [
      { ...requestBody, tasks: [{ id: 'task-private', title: '不应上传的任务标题' }] },
      { ...requestBody, snapshot: { ...snapshot, taskTitles: ['不应上传的任务标题'] } },
      { ...requestBody, snapshot: { ...snapshot, knowledgeCards: [] } },
      { ...requestBody, snapshot: { ...snapshot, progressLogs: ['不应上传的日志原文'] } },
      { ...requestBody, snapshot: { ...snapshot, email: 'user@mail.ustc.edu.cn' } },
    ]) {
      let upstreamCalls = 0;
      const { url } = await startReview({ fetchImpl: async () => { upstreamCalls += 1; return upstreamResponse(); } });
      const result = await post(url, body);
      assert.equal(result.status, 400);
      assert.equal(result.body.error.code, 'invalid_proposal');
      assert.equal(upstreamCalls, 0);
    }
  });

  it('rejects malformed statistics before calling the model', async () => {
    const bodies = [
      { schemaVersion: 2, snapshot },
      { snapshot },
      { schemaVersion: 1, snapshot: { ...snapshot, date: '2026-7-17' } },
      { schemaVersion: 1, snapshot: { ...snapshot, timeZone: 'Not/AZone' } },
      { schemaVersion: 1, snapshot: { ...snapshot, plannedCount: -1 } },
      { schemaVersion: 1, snapshot: { ...snapshot, recordedMinutes: 1.5 } },
      { schemaVersion: 1, snapshot: { ...snapshot, recordsComplete: 'yes' } },
      { schemaVersion: 1, snapshot: { ...snapshot, categoryMinutes: [{ category: 'unknown', minutes: -3 }] } },
      { schemaVersion: 1, snapshot: { ...snapshot, categoryMinutes: [{ category: 'racing', minutes: 3 }] } },
      { schemaVersion: 1, snapshot: { ...snapshot, categoryMinutes: [{ category: 'work' }] } },
      { schemaVersion: 1, snapshot: { ...snapshot, interruptions: null } },
    ];
    for (const body of bodies) {
      let upstreamCalls = 0;
      const { url } = await startReview({ fetchImpl: async () => { upstreamCalls += 1; return upstreamResponse(); } });
      const result = await post(url, body);
      assert.equal(result.status, 400, JSON.stringify(body));
      assert.equal(result.body.error.code, 'invalid_proposal');
      assert.equal(upstreamCalls, 0);
    }
  });

  it('rejects invalid JSON, wrong method, wrong content type and disallowed origins', async () => {
    let upstreamCalls = 0;
    const { url } = await startReview({ fetchImpl: async () => { upstreamCalls += 1; return upstreamResponse(); } });

    const invalidJson = await post(url, '{not json');
    assert.equal(invalidJson.status, 400);

    const wrongMethod = await fetch(`${url}/v1/review-proposals`, { method: 'GET', headers: { Origin: 'http://127.0.0.1:8081' } });
    assert.equal(wrongMethod.status, 405);

    const wrongType = await post(url, requestBody, { 'Content-Type': 'text/plain', Origin: 'http://127.0.0.1:8081' });
    assert.equal(wrongType.status, 415);

    const badOrigin = await post(url, requestBody, { 'Content-Type': 'application/json', Origin: 'http://evil.example' });
    assert.equal(badOrigin.status, 403);
    assert.equal(badOrigin.body.error.retryable, false);
    assert.equal(upstreamCalls, 0);
  });

  it('answers preflight without touching the model and reports closed or unkeyed gateway', async () => {
    const { url } = await startReview();
    const preflight = await fetch(`${url}/v1/review-proposals`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:8081' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');

    const disabled = await startReview({ config: { enabled: false } });
    assert.equal((await post(disabled.url, requestBody)).status, 503);

    const unkeyed = await startReview({ config: { apiKey: '' } });
    const missingKey = await post(unkeyed.url, requestBody);
    assert.equal(missingKey.status, 503);
    assert.equal(missingKey.body.error.retryable, true);
  });

  it('rejects model output that states a number, cites an unknown fact, or exceeds the limit', async () => {
    const payloads = [
      { suggestions: [{ ...validSuggestion, action: '明天提前10分钟开始这一段执行。' }] },
      { suggestions: [{ ...validSuggestion, title: '把投入提高10%' }] },
      { suggestions: [{ ...validSuggestion, action: '明天提前１０分钟开始。' }] },
      { suggestions: [{ ...validSuggestion, factIds: ['completionRate'] }] },
      { suggestions: [{ ...validSuggestion, factIds: ['interruptions', 'interruptions'] }] },
      { suggestions: [{ ...validSuggestion, factIds: [] }] },
      { suggestions: [{ ...validSuggestion, factIds: ['plannedCount', 'completedAsPlannedCount', 'completedTotalCount', 'recordedMinutes'] }] },
      { suggestions: [validSuggestion, validSuggestion, validSuggestion] },
      { suggestions: [{ ...validSuggestion, extra: true }] },
      { suggestions: [{ ...validSuggestion, action: '检查 factIds 字段' }] },
      { suggestions: 'not-an-array' },
      { narrative: '自由文本复盘' },
    ];
    for (const payload of payloads) {
      const { url } = await startReview({ fetchImpl: async () => upstreamResponse(payload) });
      const result = await post(url, requestBody);
      assert.equal(result.status, 502, JSON.stringify(payload));
      assert.equal(result.body.status, 'failure');
      assert.equal(result.body.error.code, 'invalid_proposal');
      assert.equal(result.body.error.message.includes('upstream detail'), false);
    }
  });

  it('maps upstream status, timeout and refusal to safe retryable errors', async () => {
    const expected = [[400, 400, 'invalid_proposal'], [401, 401, 'proposal_unavailable'], [429, 429, 'proposal_rate_limited'], [504, 504, 'proposal_timeout'], [500, 503, 'proposal_unavailable']];
    for (const [upstream, status, code] of expected) {
      const { url } = await startReview({ fetchImpl: async () => upstreamStatus(upstream) });
      const result = await post(url, requestBody);
      assert.equal(result.status, status, `upstream ${upstream}`);
      assert.equal(result.body.error.code, code);
      assert.equal(JSON.stringify(result.body).includes('upstream detail'), false);
    }

    const timeout = await startReview({ fetchImpl: abortingFetch });
    const timedOut = await post(timeout.url, requestBody);
    assert.equal(timedOut.status, 504);
    assert.equal(timedOut.body.error.code, 'proposal_timeout');

    const refusal = await startReview({
      fetchImpl: async () => new Response(JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'blocked' }] }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    });
    const refused = await post(refusal.url, requestBody);
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error.code, 'proposal_refused');

    const badJson = await startReview({
      fetchImpl: async () => new Response(JSON.stringify({ output_text: 'not json' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    });
    assert.equal((await post(badJson.url, requestBody)).status, 502);
  });

  it('logs only a coarse status without statistics, secrets or request bodies', async () => {
    const { url, logs } = await startReview();
    await post(url, requestBody);
    const serialized = JSON.stringify(logs);
    assert.match(serialized, /review_proposal_request/u);
    assert.match(serialized, /"status":"success"/u);
    assert.equal(serialized.includes(baseConfig.apiKey), false);
    assert.equal(serialized.includes('recordedMinutes'), false);
    assert.equal(serialized.includes('110'), false);
    assert.equal(serialized.includes('2026-07-17'), false);
  });

  it('routes the review endpoint through the local service without disturbing existing routes', async () => {
    const schemaNames = [];
    const handler = createLocalServiceHandler({
      config: baseConfig,
      fetchImpl: async (_url, init) => {
        schemaNames.push(JSON.parse(init.body).text.format.name);
        return upstreamResponse();
      },
      logger: { info: () => {} },
      emailAdapter: { listRecent: async () => [], getDetail: async () => ({ uid: 1, subject: 'x', body: 'y' }) },
    });
    const { url } = await startReview({ handler });

    const health = await fetch(`${url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', aiEnabled: true });

    const review = await post(url, requestBody);
    assert.equal(review.status, 200);
    assert.deepEqual(review.body.suggestions, [validSuggestion]);

    await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:8081' },
      body: JSON.stringify({
        schemaVersion: 1,
        capture: { rawText: '明天整理项目说明', source: 'webText' },
        context: { referenceDate: '2026-07-17', timeZone: 'Asia/Shanghai', locale: 'zh-CN' },
      }),
    });
    assert.deepEqual(schemaNames, ['reflow_review_proposal_draft', 'reflow_cloud_proposal_draft']);

    const messages = await fetch(`${url}/messages`, { headers: { Origin: 'http://127.0.0.1:8081' } });
    assert.equal(messages.status, 200);
    assert.deepEqual(await messages.json(), { status: 'success', messages: [] });

    const unknown = await fetch(`${url}/v1/unknown`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:8081' } });
    assert.equal(unknown.status, 404);
  });
});
