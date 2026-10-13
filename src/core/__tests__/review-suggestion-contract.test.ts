import { describe, expect, it } from '@jest/globals';

import { createEmptyData } from '../demo-data';
import {
  MAX_REVIEW_SUGGESTIONS,
  buildReviewSuggestionWireRequest,
  parseReviewSuggestionEnvelope,
  validateReviewSuggestionDraft,
} from '../review-suggestion-contract';
import { deriveDailyReviewSnapshot } from '../selectors';
import type { DomainData } from '../types';

const validDraft = {
  title: '给一段执行留出完整时间',
  factIds: ['interruptions', 'recordedMinutes'],
  action: '明天开始时把手机放到视线外，直到这一段自然结束再取回。',
};

function envelope(suggestions: unknown = [validDraft]) {
  return { status: 'success', schemaVersion: 1, suggestions };
}

describe('review suggestion contract', () => {
  it('serializes only whitelisted aggregate statistics and never task content', () => {
    const data: DomainData = {
      ...createEmptyData(),
      tasks: [{
        id: 'task-secret', title: '不应上传的任务标题', status: 'completed', category: 'work', bucket: 'today',
        estimatedMinutes: 30, nextAction: '不应上传的下一步行动', sourceSummary: '不应上传的来源', sortIndex: 0,
        createdAt: '2026-07-17T08:00:00+08:00', plannedDate: '2026-07-17', completedAt: '2026-07-17T09:00:00+08:00',
      }],
      taskPlanEvents: [{ id: 'plan-secret', taskId: 'task-secret', kind: 'planned', occurredAt: '2026-07-17T08:00:00+08:00', before: {}, after: { plannedDate: '2026-07-17' }, source: 'user' }],
      timeEntries: [{ id: 'te-secret', taskId: 'task-secret', startedAt: '2026-07-17T08:10:00+08:00', endedAt: '2026-07-17T08:40:00+08:00', minutes: 30 }],
      progressLogs: [{ id: 'log-secret', taskId: 'task-secret', createdAt: '2026-07-17T08:20:00+08:00', text: '不应上传的进展原文', kind: 'progress' }],
      knowledgeCards: [{ id: 'knowledge-secret', title: '不应上传的知识', summary: '不应上传的知识正文', source: '不应上传的来源', createdAt: '2026-07-17T08:00:00+08:00' }],
    };

    const wire = buildReviewSuggestionWireRequest(deriveDailyReviewSnapshot(data, '2026-07-17', 'Asia/Shanghai'));
    expect(Object.keys(wire).sort()).toEqual(['schemaVersion', 'snapshot']);
    expect(Object.keys(wire.snapshot).sort()).toEqual([
      'categoryMinutes', 'completedAsPlannedCount', 'completedTotalCount', 'date', 'interruptions',
      'plannedCount', 'recordedMinutes', 'recordsComplete', 'timeZone',
    ]);
    expect(Object.keys(wire.snapshot.categoryMinutes[0]).sort()).toEqual(['category', 'minutes']);

    const serialized = JSON.stringify(wire);
    for (const forbidden of ['不应上传的任务标题', '不应上传的下一步行动', '不应上传的来源', '不应上传的进展原文', '不应上传的知识', 'task-secret', 'te-secret', 'log-secret', 'knowledge-secret']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('accepts a grounded suggestion and rejects numbers the program must render instead', () => {
    expect(validateReviewSuggestionDraft(validDraft)).toEqual({ status: 'success', draft: validDraft });
    expect(validateReviewSuggestionDraft({ ...validDraft, factIds: ['plannedCount'] })).toMatchObject({ status: 'success' });

    for (const action of ['明天提前10分钟开始', '明天提前１０分钟开始', '把完成率提高几个%']) {
      expect(validateReviewSuggestionDraft({ ...validDraft, action })).toMatchObject({ status: 'failure' });
    }
    expect(validateReviewSuggestionDraft({ ...validDraft, title: `给一段执行留出${1}分钟` })).toMatchObject({ status: 'failure' });
  });

  it('documents that the deterministic layer cannot catch Chinese numerals', () => {
    expect(validateReviewSuggestionDraft({ ...validDraft, action: '明天提前十分钟开始这一段执行。' })).toMatchObject({ status: 'success' });
  });

  it('rejects unknown, duplicated, empty and excessive fact references', () => {
    expect(validateReviewSuggestionDraft({ ...validDraft, factIds: ['completionRate'] })).toMatchObject({ status: 'failure' });
    expect(validateReviewSuggestionDraft({ ...validDraft, factIds: ['interruptions', 'interruptions'] })).toMatchObject({ status: 'failure' });
    expect(validateReviewSuggestionDraft({ ...validDraft, factIds: [] })).toMatchObject({ status: 'failure' });
    expect(validateReviewSuggestionDraft({
      ...validDraft,
      factIds: ['plannedCount', 'completedAsPlannedCount', 'completedTotalCount', 'recordedMinutes'],
    })).toMatchObject({ status: 'failure' });
    expect(validateReviewSuggestionDraft({ ...validDraft, factIds: [7] })).toMatchObject({ status: 'failure' });
  });

  it('rejects malformed shapes, oversized text and internal identifiers', () => {
    expect(validateReviewSuggestionDraft(null)).toMatchObject({ status: 'failure' });
    expect(validateReviewSuggestionDraft({ ...validDraft, extra: true })).toMatchObject({ status: 'failure' });
    expect(validateReviewSuggestionDraft({ title: validDraft.title, action: validDraft.action })).toMatchObject({ status: 'failure' });
    expect(validateReviewSuggestionDraft({ ...validDraft, title: '标'.repeat(41) })).toMatchObject({ status: 'failure' });
    expect(validateReviewSuggestionDraft({ ...validDraft, action: '动'.repeat(121) })).toMatchObject({ status: 'failure' });
    expect(validateReviewSuggestionDraft({ ...validDraft, action: '   ' })).toMatchObject({ status: 'failure' });
    expect(validateReviewSuggestionDraft({ ...validDraft, title: '检查 factIds 字段' })).toMatchObject({ status: 'failure' });
  });

  it('accepts zero to two suggestions and fails closed on anything else', () => {
    expect(parseReviewSuggestionEnvelope(envelope([]))).toMatchObject({ status: 'success', envelope: { status: 'success', suggestions: [] } });
    expect(parseReviewSuggestionEnvelope(envelope([validDraft, { ...validDraft, title: '少排一项看看' }]))).toMatchObject({ status: 'success' });
    expect(parseReviewSuggestionEnvelope(envelope([validDraft, validDraft, validDraft]))).toMatchObject({ status: 'failure' });
    expect(MAX_REVIEW_SUGGESTIONS).toBe(2);

    expect(parseReviewSuggestionEnvelope({ ...envelope(), schemaVersion: 2 })).toMatchObject({ status: 'failure' });
    expect(parseReviewSuggestionEnvelope(envelope([{ ...validDraft, action: '明天提前10分钟开始' }]))).toMatchObject({ status: 'failure' });
    expect(parseReviewSuggestionEnvelope(envelope('not-an-array'))).toMatchObject({ status: 'failure' });
    expect(parseReviewSuggestionEnvelope(null)).toMatchObject({ status: 'failure' });
  });

  it('passes through safe gateway failures and rejects unknown failure codes', () => {
    expect(parseReviewSuggestionEnvelope({
      status: 'failure',
      error: { code: 'proposal_timeout', message: '云端复盘超时，请稍后重试。', retryable: true },
    })).toMatchObject({ status: 'success', envelope: { status: 'failure', error: { code: 'proposal_timeout' } } });

    expect(parseReviewSuggestionEnvelope({
      status: 'failure',
      error: { code: 'invalid_backup', message: '不属于该合同的错误码。', retryable: true },
    })).toMatchObject({ status: 'failure' });
  });
});
