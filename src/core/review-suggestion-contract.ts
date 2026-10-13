import {
  REVIEW_FACT_IDS,
  type DailyReviewSnapshot,
  type PipelineFailureCode,
  type ReviewFactId,
} from './types';

export const REVIEW_SUGGESTION_SCHEMA_VERSION = 1 as const;
export const MAX_REVIEW_SUGGESTIONS = 2;

export interface ReviewSuggestionDraft {
  title: string;
  factIds: ReviewFactId[];
  action: string;
}

export interface ReviewSuggestionWireRequest {
  schemaVersion: typeof REVIEW_SUGGESTION_SCHEMA_VERSION;
  snapshot: DailyReviewSnapshot;
}

export type ReviewSuggestionErrorCode =
  | Extract<PipelineFailureCode, 'proposal_timeout' | 'proposal_rate_limited' | 'proposal_refused' | 'proposal_unavailable' | 'invalid_proposal'>;

export type ReviewSuggestionEnvelope =
  | {
    status: 'success';
    schemaVersion: typeof REVIEW_SUGGESTION_SCHEMA_VERSION;
    suggestions: ReviewSuggestionDraft[];
  }
  | {
    status: 'failure';
    error: {
      code: ReviewSuggestionErrorCode;
      message: string;
      retryable: boolean;
    };
  };

type RecordValue = Record<string, unknown>;

const draftKeys = ['title', 'factIds', 'action'];
const factIds = new Set<string>(REVIEW_FACT_IDS);
const errorCodes = new Set<ReviewSuggestionErrorCode>([
  'proposal_timeout',
  'proposal_rate_limited',
  'proposal_refused',
  'proposal_unavailable',
  'invalid_proposal',
]);
// 指标数字一律由程序从快照渲染，模型给出的文本里出现数字即视为越界。
const numericPattern = /[0-9０-９%％]/;
const internalTermPattern = /\b(?:DailyReviewSnapshot|ReviewSuggestionDraft|ReviewFactId|factIds|recordedMinutes|categoryMinutes|recordsComplete|JSON\s*Schema)\b/i;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isActionText(value: unknown, maxLength: number): boolean {
  return typeof value === 'string'
    && Boolean(value.trim())
    && value.length <= maxLength
    && !numericPattern.test(value)
    && !internalTermPattern.test(value);
}

export function buildReviewSuggestionWireRequest(snapshot: DailyReviewSnapshot): ReviewSuggestionWireRequest {
  return {
    schemaVersion: REVIEW_SUGGESTION_SCHEMA_VERSION,
    snapshot: {
      date: snapshot.date,
      timeZone: snapshot.timeZone,
      plannedCount: snapshot.plannedCount,
      completedAsPlannedCount: snapshot.completedAsPlannedCount,
      completedTotalCount: snapshot.completedTotalCount,
      recordedMinutes: snapshot.recordedMinutes,
      interruptions: snapshot.interruptions,
      categoryMinutes: snapshot.categoryMinutes.map((item) => ({ category: item.category, minutes: item.minutes })),
      recordsComplete: snapshot.recordsComplete,
    },
  };
}

export function validateReviewSuggestionDraft(value: unknown):
  | { status: 'success'; draft: ReviewSuggestionDraft }
  | { status: 'failure'; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { status: 'failure', errors: ['建议必须是对象。'] };
  if (!hasExactKeys(value, draftKeys)) errors.push('建议字段集合不合法。');
  if (!isActionText(value.title, 40)) errors.push('title 无效。');
  if (!isActionText(value.action, 120)) errors.push('action 无效。');
  if (!Array.isArray(value.factIds) || !value.factIds.length || value.factIds.length > 3) {
    errors.push('factIds 必须引用 1 至 3 项事实。');
  } else {
    const ids = value.factIds as unknown[];
    if (ids.some((id) => typeof id !== 'string' || !factIds.has(id))) errors.push('factIds 含未知事实引用。');
    if (new Set(ids).size !== ids.length) errors.push('factIds 含重复事实引用。');
  }

  return errors.length
    ? { status: 'failure', errors }
    : { status: 'success', draft: value as unknown as ReviewSuggestionDraft };
}

export function parseReviewSuggestionEnvelope(value: unknown):
  | { status: 'success'; envelope: ReviewSuggestionEnvelope }
  | { status: 'failure'; errors: string[] } {
  if (!isRecord(value)) return { status: 'failure', errors: ['Gateway 响应必须是对象。'] };
  if (value.status === 'success') {
    if (value.schemaVersion !== REVIEW_SUGGESTION_SCHEMA_VERSION) return { status: 'failure', errors: ['Gateway Schema 版本不受支持。'] };
    if (!Array.isArray(value.suggestions) || value.suggestions.length > MAX_REVIEW_SUGGESTIONS) {
      return { status: 'failure', errors: ['建议数量不合法。'] };
    }
    const suggestions: ReviewSuggestionDraft[] = [];
    for (const item of value.suggestions) {
      const draft = validateReviewSuggestionDraft(item);
      if (draft.status === 'failure') return draft;
      suggestions.push(draft.draft);
    }
    return {
      status: 'success',
      envelope: { status: 'success', schemaVersion: REVIEW_SUGGESTION_SCHEMA_VERSION, suggestions },
    };
  }
  if (value.status === 'failure' && isRecord(value.error)
    && typeof value.error.code === 'string'
    && errorCodes.has(value.error.code as ReviewSuggestionErrorCode)
    && typeof value.error.message === 'string'
    && typeof value.error.retryable === 'boolean') {
    return {
      status: 'success',
      envelope: {
        status: 'failure',
        error: {
          code: value.error.code as ReviewSuggestionErrorCode,
          message: value.error.message,
          retryable: value.error.retryable,
        },
      },
    };
  }
  return { status: 'failure', errors: ['Gateway 响应 Envelope 无效。'] };
}
