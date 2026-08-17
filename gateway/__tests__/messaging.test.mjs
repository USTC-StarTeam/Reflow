import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, describe, it } from 'node:test';

import { createLocalServiceHandler } from '../local-service.mjs';
import { createFakeQueryableConnector } from '../messaging/connectors/fake.mjs';
import { EXTERNAL_TRUST } from '../messaging/contracts.mjs';
import { messagingError } from '../messaging/errors.mjs';
import { createMessagingHandler } from '../messaging/handler.mjs';
import { createConnectorRegistry } from '../messaging/registry.mjs';
import { validateProviderHints } from '../messaging/validation.mjs';

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

const summary = {
  schemaVersion: 1,
  ref: { source: 'email', provider: 'fixture', accountId: 'fixture-account', externalId: 'fixture-item' },
  kind: 'email',
  occurredAt: '2026-08-17T18:21:00+08:00',
  title: 'Fixture message',
  actor: { displayName: 'Fixture sender', address: 'sender@example.test' },
  preview: 'Fixture preview',
  hasAttachments: false,
  trust: EXTERNAL_TRUST,
};

function createFixtureConnector(overrides = {}) {
  const { descriptor: descriptorOverrides = {}, ...connectorOverrides } = overrides;
  return {
    descriptor: {
      id: 'fixture',
      source: 'email',
      provider: 'fixture',
      mode: 'queryable',
      capabilities: ['search', 'pagination'],
      ...descriptorOverrides,
    },
    providerHintKeys: connectorOverrides.providerHintKeys,
    async probe() {
      return { status: 'ready' };
    },
    async listItems() {
      return { items: [structuredClone(summary)], nextCursor: null };
    },
    async getItem() {
      return {
        ...structuredClone(summary),
        content: { text: 'Fixture content', truncated: false },
        attachments: [],
      };
    },
    ...connectorOverrides,
  };
}

async function startHandler(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function startMessaging(connector = createFakeQueryableConnector(), options = {}) {
  const logs = [];
  const registry = createConnectorRegistry([connector]);
  const handler = createMessagingHandler({
    config: { ...baseConfig, ...options.config },
    registry,
    logger: { info: (entry) => logs.push(entry) },
  });
  return { url: await startHandler(handler), logs };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe('local service composition', () => {
  it('serves the existing health and proposal routes beside messaging routes', async () => {
    const draft = {
      title: '整理项目说明',
      category: 'work',
      outcome: 'task',
      suggestedBucket: 'today',
      suggestedDate: '2026-08-18',
      estimatedMinutes: 45,
      nextAction: '整理项目说明',
      waitingDetails: null,
      knowledgeSummary: null,
      confidence: 0.92,
      reason: '这是明天需要处理的具体工作任务。',
    };
    const fetchImpl = async () => new Response(JSON.stringify({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(draft) }],
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const handler = createLocalServiceHandler({ config: baseConfig, fetchImpl, logger: { info() {} } });
    const url = await startHandler(handler);

    const health = await fetch(`${url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', aiEnabled: true });

    const proposal = await fetch(`${url}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        capture: { rawText: '明天整理项目说明', source: 'webText' },
        context: { referenceDate: '2026-08-17', timeZone: 'Asia/Shanghai', locale: 'zh-CN' },
      }),
    });
    assert.equal(proposal.status, 200);
    assert.deepEqual(await proposal.json(), { status: 'success', schemaVersion: 1, draft });

    const connectors = await fetch(`${url}/v1/messaging/connectors`);
    assert.equal(connectors.status, 200);
    assert.equal((await connectors.json()).connectors[0].id, 'fake-email');
  });
});

describe('messaging HTTP API', () => {
  it('lists the fake connector descriptor and probes its account', async () => {
    const { url } = await startMessaging();
    const connectorsResponse = await fetch(`${url}/v1/messaging/connectors`);
    assert.equal(connectorsResponse.status, 200);
    assert.deepEqual(await connectorsResponse.json(), {
      status: 'success',
      schemaVersion: 1,
      connectors: [{
        id: 'fake-email',
        source: 'email',
        provider: 'fake',
        mode: 'queryable',
        capabilities: ['search', 'pagination'],
      }],
    });

    const healthResponse = await fetch(`${url}/v1/messaging/connectors/fake-email/health?accountId=fake-account`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), {
      status: 'success',
      schemaVersion: 1,
      health: { status: 'ready' },
    });
  });

  it('returns paginated summaries without content and supports search', async () => {
    const { url } = await startMessaging();
    const firstResponse = await fetch(`${url}/v1/messaging/items?connectorId=fake-email&accountId=fake-account&limit=2`);
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.equal(first.status, 'success');
    assert.equal(first.schemaVersion, 1);
    assert.equal(first.items.length, 2);
    assert.equal(first.nextCursor, 'fake-cursor-2');
    for (const item of first.items) {
      assert.equal(item.trust, EXTERNAL_TRUST);
      assert.deepEqual(
        { source: item.ref.source, provider: item.ref.provider, accountId: item.ref.accountId },
        { source: 'email', provider: 'fake', accountId: 'fake-account' },
      );
      assert.equal(Object.hasOwn(item, 'content'), false);
      assert.equal(Object.hasOwn(item, 'attachments'), false);
    }

    const secondResponse = await fetch(`${url}/v1/messaging/items?connectorId=fake-email&accountId=fake-account&limit=2&cursor=${first.nextCursor}`);
    assert.equal((await secondResponse.json()).nextCursor, null);

    const searchResponse = await fetch(`${url}/v1/messaging/items?connectorId=fake-email&accountId=fake-account&query=${encodeURIComponent('教务处')}`);
    const search = await searchResponse.json();
    assert.equal(search.items.length, 1);
    assert.equal(search.items[0].ref.externalId, 'fake-message-002');
  });

  it('returns detail content and attachments while preserving opaque external ids', async () => {
    const { url } = await startMessaging();
    const response = await fetch(`${url}/v1/messaging/items/detail?connectorId=fake-email&accountId=fake-account&externalId=fake-message-001`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.item.ref.externalId, 'fake-message-001');
    assert.equal(typeof body.item.content.text, 'string');
    assert.equal(body.item.content.truncated, false);
    assert.equal(body.item.attachments[0].name, '汇报模板.pdf');
  });

  it('round-trips a provider-owned external id containing URL punctuation', async () => {
    const externalId = 'mailbox/uid+part:%value';
    const connector = createFixtureConnector({
      async getItem(input) {
        assert.equal(input.externalId, externalId);
        return {
          ...structuredClone(summary),
          ref: { ...summary.ref, externalId },
          content: { text: 'Opaque identity detail', truncated: false },
          attachments: [],
        };
      },
    });
    const { url } = await startMessaging(connector);
    const response = await fetch(`${url}/v1/messaging/items/detail?connectorId=fixture&accountId=fixture-account&externalId=${encodeURIComponent(externalId)}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).item.ref.externalId, externalId);
  });

  for (const scenario of [
    { url: '/v1/messaging/items?connectorId=missing&accountId=fake-account', status: 404, code: 'unknown_connector' },
    { url: '/v1/messaging/items?connectorId=fake-email&accountId=missing', status: 404, code: 'account_not_found' },
    { url: '/v1/messaging/items/detail?connectorId=fake-email&accountId=fake-account&externalId=missing', status: 404, code: 'item_not_found' },
    { url: '/v1/messaging/items?connectorId=fake-email&accountId=fake-account&limit=101', status: 400, code: 'invalid_request' },
  ]) {
    it(`returns safe ${scenario.code} failures`, async () => {
      const { url } = await startMessaging();
      const response = await fetch(`${url}${scenario.url}`);
      const body = await response.json();
      assert.equal(response.status, scenario.status);
      assert.equal(body.status, 'failure');
      assert.equal(body.error.code, scenario.code);
      assert.equal(typeof body.error.retryable, 'boolean');
    });
  }

  it('rejects query and cursor when the connector lacks the capabilities', async () => {
    const connector = createFixtureConnector({ descriptor: { capabilities: [] } });
    const { url } = await startMessaging(connector);
    for (const suffix of ['query=test', 'cursor=fixture-cursor']) {
      const response = await fetch(`${url}/v1/messaging/items?connectorId=fixture&accountId=fixture-account&${suffix}`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'unsupported_capability');
    }
  });

  it('uses provider-neutral auth and network error mappings', async () => {
    for (const scenario of [
      { code: 'provider_auth_error', status: 502, retryable: false },
      { code: 'network_error', status: 503, retryable: true },
    ]) {
      const connector = createFixtureConnector({
        async probe() { throw messagingError(scenario.code); },
      });
      const { url } = await startMessaging(connector);
      const response = await fetch(`${url}/v1/messaging/connectors/fixture/health?accountId=fixture-account`);
      const body = await response.json();
      assert.equal(response.status, scenario.status);
      assert.equal(body.error.code, scenario.code);
      assert.equal(body.error.retryable, scenario.retryable);
    }
  });
});

describe('strict connector output validation', () => {
  it('rejects a next cursor when pagination is not declared', async () => {
    const connector = createFixtureConnector({
      descriptor: { capabilities: [] },
      async listItems() {
        return { items: [structuredClone(summary)], nextCursor: 'fixture-cursor' };
      },
    });
    const { url } = await startMessaging(connector);
    const response = await fetch(`${url}/v1/messaging/items?connectorId=fixture&accountId=fixture-account`);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, 'provider_error');
  });

  for (const scenario of [
    { name: 'summary openUrl without deepLink', field: 'openUrl', value: 'https://example.test/item', detail: false },
    { name: 'detail openUrl without deepLink', field: 'openUrl', value: 'https://example.test/item', detail: true },
    { name: 'summary threadRef without threadRef capability', field: 'threadRef', value: 'fixture-thread', detail: false },
    { name: 'detail threadRef without threadRef capability', field: 'threadRef', value: 'fixture-thread', detail: true },
  ]) {
    it(`rejects ${scenario.name}`, async () => {
      const output = { ...structuredClone(summary), [scenario.field]: scenario.value };
      const connector = createFixtureConnector({
        descriptor: { capabilities: [] },
        async listItems() {
          return { items: [output], nextCursor: null };
        },
        async getItem() {
          return {
            ...output,
            content: { text: 'Fixture content', truncated: false },
            attachments: [],
          };
        },
      });
      const { url } = await startMessaging(connector);
      const path = scenario.detail
        ? '/v1/messaging/items/detail?connectorId=fixture&accountId=fixture-account&externalId=fixture-item'
        : '/v1/messaging/items?connectorId=fixture&accountId=fixture-account';
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, 'provider_error');
    });
  }

  it('allows declared capabilities without requiring their output fields', async () => {
    const connector = createFixtureConnector({
      descriptor: { capabilities: ['pagination', 'deepLink', 'threadRef'] },
    });
    const { url } = await startMessaging(connector);

    const listResponse = await fetch(`${url}/v1/messaging/items?connectorId=fixture&accountId=fixture-account`);
    assert.equal(listResponse.status, 200);
    const page = await listResponse.json();
    assert.equal(page.nextCursor, null);
    assert.equal(Object.hasOwn(page.items[0], 'openUrl'), false);
    assert.equal(Object.hasOwn(page.items[0], 'threadRef'), false);

    const detailResponse = await fetch(`${url}/v1/messaging/items/detail?connectorId=fixture&accountId=fixture-account&externalId=fixture-item`);
    assert.equal(detailResponse.status, 200);
    const detail = (await detailResponse.json()).item;
    assert.equal(Object.hasOwn(detail, 'openUrl'), false);
    assert.equal(Object.hasOwn(detail, 'threadRef'), false);
  });

  it('fails the entire list when a summary contains content', async () => {
    const connector = createFixtureConnector({
      async listItems() {
        return { items: [{ ...structuredClone(summary), content: { text: 'private body', truncated: false } }], nextCursor: null };
      },
    });
    const { url } = await startMessaging(connector);
    const response = await fetch(`${url}/v1/messaging/items?connectorId=fixture&accountId=fixture-account`);
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.error.code, 'provider_error');
    assert.equal(JSON.stringify(body).includes('private body'), false);
  });

  for (const mismatch of [
    { name: 'accountId', ref: { accountId: 'another-account' } },
    { name: 'source', ref: { source: 'slack' } },
    { name: 'provider', ref: { provider: 'another-provider' } },
  ]) {
    it(`rejects a list item with the wrong ${mismatch.name} binding`, async () => {
      const connector = createFixtureConnector({
        async listItems() {
          return { items: [{ ...structuredClone(summary), ref: { ...summary.ref, ...mismatch.ref } }], nextCursor: null };
        },
      });
      const { url } = await startMessaging(connector);
      const response = await fetch(`${url}/v1/messaging/items?connectorId=fixture&accountId=fixture-account`);
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, 'provider_error');
    });
  }

  it('rejects detail with the wrong externalId binding', async () => {
    const connector = createFixtureConnector({
      async getItem() {
        return {
          ...structuredClone(summary),
          ref: { ...summary.ref, externalId: 'another-item' },
          content: { text: 'wrong item', truncated: false },
          attachments: [],
        };
      },
    });
    const { url } = await startMessaging(connector);
    const response = await fetch(`${url}/v1/messaging/items/detail?connectorId=fixture&accountId=fixture-account&externalId=fixture-item`);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, 'provider_error');
  });

  it('redacts arbitrary connector failures from responses and logs', async () => {
    const marker = 'SECRET_MARKER';
    const connector = createFixtureConnector({
      async listItems() {
        const error = new Error(`${marker} raw provider failure`);
        error.rawObject = { authorization: marker };
        throw error;
      },
    });
    const { url, logs } = await startMessaging(connector);
    const response = await fetch(`${url}/v1/messaging/items?connectorId=fixture&accountId=fixture-account`);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error.code, 'provider_error');
    assert.equal(JSON.stringify(body).includes(marker), false);
    assert.equal(JSON.stringify(logs).includes(marker), false);
    assert.equal(Object.hasOwn(body.error, 'stack'), false);
  });
});

describe('immutable connector registry', () => {
  it('constructs from a valid connector and exposes frozen descriptors', () => {
    const registry = createConnectorRegistry([createFakeQueryableConnector()]);
    assert.equal(registry.getConnector('fake-email').descriptor.id, 'fake-email');
    assert.equal(registry.getConnector('missing'), undefined);
    assert.equal(Object.isFrozen(registry.listDescriptors()), true);
    assert.equal(Object.isFrozen(registry.listDescriptors()[0]), true);
  });

  it('rejects duplicate ids, event mode, and invalid descriptors', () => {
    assert.throws(
      () => createConnectorRegistry([createFakeQueryableConnector(), createFakeQueryableConnector()]),
      /Duplicate connector id/,
    );
    assert.throws(
      () => createConnectorRegistry([createFixtureConnector({ descriptor: { mode: 'event' } })]),
      /Invalid queryable connector descriptor/,
    );
    assert.throws(
      () => createConnectorRegistry([createFixtureConnector({ descriptor: { provider: '' } })]),
      /Invalid queryable connector descriptor/,
    );
  });
});

describe('providerHints validation', () => {
  it('accepts only allow-listed bounded scalar values and small string arrays', () => {
    const hints = { mailbox: 'INBOX', count: 2, flagged: true, labelIds: ['important', 'school'] };
    assert.equal(validateProviderHints(hints, ['mailbox', 'count', 'flagged', 'labelIds']), hints);
  });

  for (const scenario of [
    { name: 'unknown key', hints: { unknown: 'value' }, allowed: [] },
    { name: 'nested object', hints: { mailbox: { name: 'INBOX' } }, allowed: ['mailbox'] },
    { name: 'binary value', hints: { mailbox: Buffer.from('INBOX') }, allowed: ['mailbox'] },
    { name: 'oversized string', hints: { mailbox: 'x'.repeat(257) }, allowed: ['mailbox'] },
    { name: 'oversized array', hints: { labelIds: Array.from({ length: 21 }, (_, index) => String(index)) }, allowed: ['labelIds'] },
    { name: 'sensitive key', hints: { token: 'credential' }, allowed: ['token'] },
  ]) {
    it(`rejects ${scenario.name}`, () => {
      assert.throws(
        () => validateProviderHints(scenario.hints, scenario.allowed),
        (error) => error?.code === 'provider_error',
      );
    });
  }
});

describe('messaging CORS', () => {
  it('rejects disallowed origins', async () => {
    const { url } = await startMessaging();
    const response = await fetch(`${url}/v1/messaging/connectors`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).status, 'failure');
  });

  it('advertises GET and OPTIONS only for an allowed preflight', async () => {
    const { url } = await startMessaging();
    const response = await fetch(`${url}/v1/messaging/items`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://127.0.0.1:8081' },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8081');
    assert.equal(response.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  });
});
