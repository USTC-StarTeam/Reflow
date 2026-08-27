import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, describe, it } from 'node:test';

import { createEmailHandler } from '../email/handler.mjs';
import { createUstcImapAdapter } from '../email/ustc-imap-adapter.mjs';

const servers = new Set();

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve) => server.close(resolve))));
  servers.clear();
});

function fakeMessage(uid, subject = `邮件 ${uid}`) {
  return {
    uid,
    envelope: {
      messageId: `<message-${uid}@ustc.edu.cn>`,
      subject,
      from: [{ name: '教务处', address: 'jwc@ustc.edu.cn' }],
      date: new Date('2026-08-27T05:00:00.000Z'),
    },
    internalDate: new Date(`2026-08-${uid === 12 ? '27' : '26'}T06:00:00.000Z`),
    flags: new Set(uid === 12 ? ['\\Seen'] : []),
  };
}

function fakeClientClass({ connectError, readOnly = true } = {}) {
  const calls = [];
  class FakeImapFlow {
    constructor(config) {
      calls.push({ name: 'constructor', config });
    }
    on() {}
    async connect() {
      calls.push({ name: 'connect' });
      if (connectError) throw connectError;
    }
    async mailboxOpen(path, options) {
      calls.push({ name: 'mailboxOpen', path, options });
      return { exists: 12, uidValidity: 777n, readOnly };
    }
    async *fetch(range, query) {
      calls.push({ name: 'fetch', range, query });
      yield fakeMessage(11);
      yield fakeMessage(12);
    }
    async fetchOne(uid, query, options) {
      calls.push({ name: 'fetchOne', uid, query, options });
      return {
        ...fakeMessage(uid, 'HTML 通知'),
        bodyStructure: {
          type: 'multipart/mixed',
          childNodes: [
            { type: 'text/html', part: '1', disposition: 'inline' },
            { type: 'text/plain', part: '2', disposition: 'attachment' },
          ],
        },
      };
    }
    async download(uid, part, options) {
      calls.push({ name: 'download', uid, part, options });
      return { content: Readable.from(['<p>请在<strong>明天</strong>提交材料。</p><img src="cid:test">']) };
    }
    async logout() {
      calls.push({ name: 'logout' });
    }
    close() {
      calls.push({ name: 'close' });
    }
  }
  return { FakeImapFlow, calls };
}

function adapterWith(fake) {
  return createUstcImapAdapter({
    env: { USTC_EMAIL: 'student@mail.ustc.edu.cn', USTC_EMAIL_APP_PASSWORD: 'app-password' },
    ImapFlowClass: fake.FakeImapFlow,
  });
}

async function startEmailHandler(adapter) {
  const handler = createEmailHandler({
    config: { allowedOrigins: ['http://localhost:8081'] },
    adapter,
    logger: { info() {} },
  });
  const server = createServer(handler);
  servers.add(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

describe('USTC IMAP adapter', () => {
  it('opens INBOX read-only and lists only metadata in newest-first order', async () => {
    const fake = fakeClientClass();
    const messages = await adapterWith(fake).listRecent();

    assert.deepEqual(messages.map((message) => message.uid), [12, 11]);
    assert.deepEqual(messages[0], {
      id: '777:12', uid: 12, messageId: '<message-12@ustc.edu.cn>', subject: '邮件 12',
      from: { name: '教务处', address: 'jwc@ustc.edu.cn' },
      receivedAt: '2026-08-27T06:00:00.000Z', seen: true,
    });
    assert.deepEqual(fake.calls.find((call) => call.name === 'mailboxOpen'), {
      name: 'mailboxOpen', path: 'INBOX', options: { readOnly: true },
    });
    const fetch = fake.calls.find((call) => call.name === 'fetch');
    assert.equal(fetch.range, '3:12');
    assert.deepEqual(fetch.query, { uid: true, envelope: true, internalDate: true, flags: true });
    assert.equal(fake.calls.some((call) => ['download', 'messageFlagsAdd', 'messageMove'].includes(call.name)), false);
    assert.equal(fake.calls.at(-1).name, 'logout');
  });

  it('downloads only the selected inline text body part for one opened message', async () => {
    const fake = fakeClientClass();
    const detail = await adapterWith(fake).getDetail(12);

    assert.equal(detail.uid, 12);
    assert.match(detail.body, /请在明天提交材料/u);
    assert.doesNotMatch(detail.body, /<img/u);
    const fetch = fake.calls.find((call) => call.name === 'fetchOne');
    assert.deepEqual(fetch.options, { uid: true });
    assert.equal(fetch.query.bodyStructure, true);
    const download = fake.calls.find((call) => call.name === 'download');
    assert.equal(download.part, '1');
    assert.equal(download.options.uid, true);
  });

  it('fails before connecting when Gateway credentials are missing', async () => {
    const fake = fakeClientClass();
    const adapter = createUstcImapAdapter({ env: {}, ImapFlowClass: fake.FakeImapFlow });
    await assert.rejects(() => adapter.listRecent(), (error) => error.code === 'credentials_missing');
    assert.equal(fake.calls.length, 0);
  });

  it('maps provider authentication failures without exposing the upstream error', async () => {
    const fake = fakeClientClass({ connectError: Object.assign(new Error('raw provider response'), { authenticationFailed: true }) });
    await assert.rejects(() => adapterWith(fake).listRecent(), (error) => error.code === 'authentication_failed' && !error.message.includes('raw'));
  });
});

describe('USTC email Gateway API', () => {
  it('serves list and detail with no-store and safe CORS headers', async () => {
    const adapter = {
      async listRecent() { return [{ uid: 12 }]; },
      async getDetail(uid) { return { uid, body: '正文' }; },
    };
    const url = await startEmailHandler(adapter);
    const list = await fetch(`${url}/messages`, { headers: { Origin: 'http://localhost:8081' } });
    assert.equal(list.status, 200);
    assert.equal(list.headers.get('cache-control'), 'no-store');
    assert.equal(list.headers.get('access-control-allow-origin'), 'http://localhost:8081');
    assert.deepEqual((await list.json()).messages, [{ uid: 12 }]);

    const detail = await fetch(`${url}/messages/12`);
    assert.equal(detail.status, 200);
    assert.deepEqual((await detail.json()).message, { uid: 12, body: '正文' });
  });

  it('returns safe missing-credential and invalid-UID errors', async () => {
    const url = await startEmailHandler(adapterWithMissingCredentials());
    const missing = await fetch(`${url}/messages`);
    assert.equal(missing.status, 503);
    assert.deepEqual(await missing.json(), {
      status: 'failure',
      error: { code: 'credentials_missing', message: '学校邮箱尚未配置。', retryable: false },
    });

    const invalid = await fetch(`${url}/messages/not-a-uid`);
    assert.equal(invalid.status, 404);
    assert.equal((await invalid.json()).error.code, 'message_not_found');
  });
});

function adapterWithMissingCredentials() {
  const fake = fakeClientClass();
  return createUstcImapAdapter({ env: {}, ImapFlowClass: fake.FakeImapFlow });
}
