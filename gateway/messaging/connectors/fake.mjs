import { EXTERNAL_TRUST, MESSAGING_SCHEMA_VERSION, OPTIONAL_CAPABILITIES, QUERYABLE_MODE } from '../contracts.mjs';
import { messagingError } from '../errors.mjs';

const ACCOUNT_ID = 'fake-account';
const CURSOR_PREFIX = 'fake-cursor-';

const items = Object.freeze([
  {
    schemaVersion: MESSAGING_SCHEMA_VERSION,
    ref: { source: 'email', provider: 'fake', accountId: ACCOUNT_ID, externalId: 'fake-message-001' },
    kind: 'email',
    occurredAt: '2026-08-17T18:21:00+08:00',
    title: '下周组会与阶段汇报',
    actor: { displayName: '张老师', address: 'zhang@example.edu' },
    preview: '请大家准备下周组会的阶段汇报，并提前整理当前进展。',
    hasAttachments: true,
    trust: EXTERNAL_TRUST,
    content: { text: '请大家准备下周组会的阶段汇报，并提前整理当前进展与下一步计划。', truncated: false },
    attachments: [{ name: '汇报模板.pdf', contentType: 'application/pdf', size: 24_576 }],
  },
  {
    schemaVersion: MESSAGING_SCHEMA_VERSION,
    ref: { source: 'email', provider: 'fake', accountId: ACCOUNT_ID, externalId: 'fake-message-002' },
    kind: 'email',
    occurredAt: '2026-08-17T16:40:00+08:00',
    title: '秋季学期选课通知',
    actor: { displayName: '教务处', address: 'registrar@example.edu' },
    preview: '秋季学期选课将于本周三开放，请按培养方案确认课程。',
    hasAttachments: false,
    trust: EXTERNAL_TRUST,
    content: { text: '秋季学期选课将于本周三开放，请按培养方案确认课程，并在截止日前提交。', truncated: false },
    attachments: [],
  },
  {
    schemaVersion: MESSAGING_SCHEMA_VERSION,
    ref: { source: 'email', provider: 'fake', accountId: ACCOUNT_ID, externalId: 'fake-message-003' },
    kind: 'email',
    occurredAt: '2026-08-17T14:32:00+08:00',
    title: 'Re: 实验数据',
    actor: { displayName: '王同学', address: 'wang@example.edu' },
    preview: '新一批实验数据已经上传，异常点也做了标记。',
    hasAttachments: false,
    trust: EXTERNAL_TRUST,
    content: { text: '新一批实验数据已经上传，异常点也做了标记。方便时请帮忙复核一下。', truncated: false },
    attachments: [],
  },
  {
    schemaVersion: MESSAGING_SCHEMA_VERSION,
    ref: { source: 'email', provider: 'fake', accountId: ACCOUNT_ID, externalId: 'fake-message-004' },
    kind: 'email',
    occurredAt: '2026-08-16T10:05:00+08:00',
    title: '项目材料提交提醒',
    actor: { displayName: '科研办公室', address: 'research@example.edu' },
    preview: '项目中期材料提交将在周五截止。',
    hasAttachments: false,
    trust: EXTERNAL_TRUST,
    content: { text: '项目中期材料提交将在周五截止，请确认申请书、预算说明和签字页齐全。', truncated: false },
    attachments: [],
  },
]);

function requireAccount(accountId) {
  if (accountId !== ACCOUNT_ID) throw messagingError('account_not_found');
}

function summaryOf(item) {
  const { content: _content, attachments: _attachments, ...summary } = item;
  return structuredClone(summary);
}

function cursorOffset(cursor) {
  if (cursor === undefined) return 0;
  if (!cursor.startsWith(CURSOR_PREFIX)) throw messagingError('invalid_request');
  const offset = Number(cursor.slice(CURSOR_PREFIX.length));
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > items.length) throw messagingError('invalid_request');
  return offset;
}

export function createFakeQueryableConnector() {
  return Object.freeze({
    descriptor: Object.freeze({
      id: 'fake-email',
      source: 'email',
      provider: 'fake',
      mode: QUERYABLE_MODE,
      capabilities: Object.freeze([OPTIONAL_CAPABILITIES.SEARCH, OPTIONAL_CAPABILITIES.PAGINATION]),
    }),
    async probe({ accountId }) {
      requireAccount(accountId);
      return { status: 'ready' };
    },
    async listItems({ accountId, limit, cursor, query }) {
      requireAccount(accountId);
      const normalizedQuery = query?.trim().toLocaleLowerCase('zh-CN');
      const filtered = normalizedQuery
        ? items.filter((item) => [item.title, item.preview, item.actor?.displayName, item.actor?.address]
          .some((value) => value?.toLocaleLowerCase('zh-CN').includes(normalizedQuery)))
        : items;
      const offset = cursorOffset(cursor);
      const pageItems = filtered.slice(offset, offset + limit).map(summaryOf);
      const nextOffset = offset + pageItems.length;
      return {
        items: pageItems,
        nextCursor: nextOffset < filtered.length ? `${CURSOR_PREFIX}${nextOffset}` : null,
      };
    },
    async getItem({ accountId, externalId }) {
      requireAccount(accountId);
      const item = items.find((candidate) => candidate.ref.externalId === externalId);
      if (!item) throw messagingError('item_not_found');
      return structuredClone(item);
    },
  });
}
