import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, describe, it } from 'node:test';

import { createGatewayHandler } from '../app.mjs';

const servers = [];
const baseConfig = {
  enabled: true,
  apiKey: 'test-only-secret',
  responsesUrl: 'https://upstream.invalid/v1/responses',
  model: 'gpt-5.6-terra',
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

function upstreamResponse(draft = validDraft) {
  return new Response(JSON.stringify({
    id: 'response-test',
    status: 'completed',
    model: 'gpt-5.6-terra',
    output: [{ content: [{ type: 'output_text', text: JSON.stringify(draft) }] }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
  it('sends one minimal structured request upstream and returns a validated draft', async () => {
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
    assert.equal(upstreamBody.model, 'gpt-5.6-terra');
    assert.equal(upstreamBody.store, false);
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

  it('maps upstream rate limits to a safe error', async () => {
    const { url } = await startGateway({
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'secret upstream detail' } }), { status: 429 }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const body = await response.json();
    assert.equal(response.status, 429);
    assert.equal(body.error.code, 'proposal_rate_limited');
    assert.equal(JSON.stringify(body).includes('secret upstream detail'), false);
  });

  it('aborts a slow upstream request', async () => {
    const { url } = await startGateway({
      config: { upstreamTimeoutMs: 5 },
      fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    });
    const response = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, 'proposal_timeout');
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

  it('normalizes unambiguous local date phrases without changing the model contract', async () => {
    const { url } = await startGateway({
      fetchImpl: async () => upstreamResponse({
        ...validDraft,
        title: '下午回复客户',
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
        capture: { rawText: '下午回复客户', source: 'webText' },
      }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).draft.suggestedDate, '2026-07-24');
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
