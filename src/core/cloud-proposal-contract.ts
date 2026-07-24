import { isLocalDate } from './date-utils';
import type { CaptureSource, LocalDate, PipelineFailureCode, TaskCategory, WaitingDetailsDraft } from './types';

export const CLOUD_PROPOSAL_SCHEMA_VERSION = 1 as const;

export interface CloudProposalDraft {
  title: string;
  category: TaskCategory;
  outcome: 'task' | 'knowledge';
  suggestedBucket: 'today' | 'waiting' | 'someday' | null;
  suggestedDate: LocalDate | null;
  estimatedMinutes: number | null;
  nextAction: string | null;
  waitingDetails: WaitingDetailsDraft | null;
  knowledgeSummary: string | null;
  confidence: number;
  reason: string;
}

export interface CloudProposalWireRequest {
  schemaVersion: typeof CLOUD_PROPOSAL_SCHEMA_VERSION;
  capture: {
    rawText: string;
    source: CaptureSource;
  };
  context: {
    referenceDate: LocalDate;
    timeZone: string;
    locale: 'zh-CN';
  };
}

export type CloudProposalGatewayErrorCode =
  | Extract<PipelineFailureCode, 'proposal_timeout' | 'proposal_rate_limited' | 'proposal_refused' | 'proposal_unavailable' | 'invalid_proposal'>;

export type CloudProposalGatewayEnvelope =
  | {
    status: 'success';
    schemaVersion: typeof CLOUD_PROPOSAL_SCHEMA_VERSION;
    draft: CloudProposalDraft;
  }
  | {
    status: 'failure';
    error: {
      code: CloudProposalGatewayErrorCode;
      message: string;
      retryable: boolean;
    };
  };

type RecordValue = Record<string, unknown>;

const draftKeys = [
  'title',
  'category',
  'outcome',
  'suggestedBucket',
  'suggestedDate',
  'estimatedMinutes',
  'nextAction',
  'waitingDetails',
  'knowledgeSummary',
  'confidence',
  'reason',
];
const waitingKeys = ['waitingFor', 'waitingOn', 'followUpDate'];
const categories = new Set<TaskCategory>(['work', 'communication', 'learning', 'life', 'health', 'unknown']);
const buckets = new Set(['today', 'waiting', 'someday']);
const gatewayErrorCodes = new Set<CloudProposalGatewayErrorCode>([
  'proposal_timeout',
  'proposal_rate_limited',
  'proposal_refused',
  'proposal_unavailable',
  'invalid_proposal',
]);
const internalTermPattern = /\b(?:CloudProposalDraft|AIProposal|suggestedBucket|estimatedMinutes|waitingFor|waitingOn|followUpDate|knowledgeSummary|JSON\s*Schema)\b/i;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nullableText(value: unknown, maxLength: number): value is string | null {
  return value === null || (typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength);
}

function containsInternalTerm(value: unknown): boolean {
  return typeof value === 'string' && internalTermPattern.test(value);
}

export function validateCloudProposalDraft(value: unknown):
  | { status: 'success'; draft: CloudProposalDraft }
  | { status: 'failure'; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { status: 'failure', errors: ['Draft 必须是对象。'] };
  if (!hasExactKeys(value, draftKeys)) errors.push('Draft 字段集合不合法。');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 80) errors.push('title 无效。');
  if (typeof value.category !== 'string' || !categories.has(value.category as TaskCategory)) errors.push('category 无效。');
  if (value.outcome !== 'task' && value.outcome !== 'knowledge') errors.push('outcome 无效。');
  if (!(value.suggestedBucket === null || (typeof value.suggestedBucket === 'string' && buckets.has(value.suggestedBucket)))) errors.push('suggestedBucket 无效。');
  if (!(value.suggestedDate === null || isLocalDate(value.suggestedDate))) errors.push('suggestedDate 无效。');
  if (!(value.estimatedMinutes === null || (Number.isInteger(value.estimatedMinutes) && Number(value.estimatedMinutes) >= 5 && Number(value.estimatedMinutes) <= 480))) errors.push('estimatedMinutes 无效。');
  if (!nullableText(value.nextAction, 240)) errors.push('nextAction 无效。');
  if (!nullableText(value.knowledgeSummary, 600)) errors.push('knowledgeSummary 无效。');
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) errors.push('confidence 无效。');
  if (typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 240) errors.push('reason 无效。');

  if (value.waitingDetails !== null) {
    if (!isRecord(value.waitingDetails) || !hasExactKeys(value.waitingDetails, waitingKeys)) {
      errors.push('waitingDetails 必须为 null 或完整对象。');
    } else {
      if (!nullableText(value.waitingDetails.waitingFor, 120)) errors.push('waitingFor 无效。');
      if (!nullableText(value.waitingDetails.waitingOn, 240)) errors.push('waitingOn 无效。');
      if (!(value.waitingDetails.followUpDate === null || isLocalDate(value.waitingDetails.followUpDate))) errors.push('followUpDate 无效。');
    }
  }

  if (!errors.length) {
    if (value.outcome === 'knowledge') {
      if (value.suggestedBucket !== null || value.suggestedDate !== null || value.estimatedMinutes !== null || value.nextAction !== null || value.waitingDetails !== null || value.knowledgeSummary === null) {
        errors.push('knowledge 字段组合无效。');
      }
    } else {
      if (value.suggestedBucket === null || value.knowledgeSummary !== null) errors.push('task 字段组合无效。');
      if (value.suggestedBucket === 'waiting') {
        if (value.suggestedDate !== null || value.waitingDetails === null) errors.push('waiting 字段组合无效。');
      } else if (value.waitingDetails !== null) {
        errors.push('非 waiting 任务不能包含 waitingDetails。');
      }
      if (value.suggestedBucket === 'someday' && value.suggestedDate !== null) errors.push('someday 不能包含日期。');
    }
  }

  const waiting = isRecord(value.waitingDetails) ? value.waitingDetails : null;
  const visibleValues = [
    value.title,
    value.nextAction,
    value.reason,
    value.knowledgeSummary,
    waiting?.waitingFor,
    waiting?.waitingOn,
  ];
  if (visibleValues.some(containsInternalTerm)) errors.push('用户字段包含内部名称。');

  return errors.length
    ? { status: 'failure', errors }
    : { status: 'success', draft: value as unknown as CloudProposalDraft };
}

export function parseCloudProposalGatewayEnvelope(value: unknown):
  | { status: 'success'; envelope: CloudProposalGatewayEnvelope }
  | { status: 'failure'; errors: string[] } {
  if (!isRecord(value)) return { status: 'failure', errors: ['Gateway 响应必须是对象。'] };
  if (value.status === 'success') {
    if (value.schemaVersion !== CLOUD_PROPOSAL_SCHEMA_VERSION) return { status: 'failure', errors: ['Gateway Schema 版本不受支持。'] };
    const draft = validateCloudProposalDraft(value.draft);
    return draft.status === 'success'
      ? { status: 'success', envelope: { status: 'success', schemaVersion: CLOUD_PROPOSAL_SCHEMA_VERSION, draft: draft.draft } }
      : draft;
  }
  if (value.status === 'failure' && isRecord(value.error)
    && typeof value.error.code === 'string'
    && gatewayErrorCodes.has(value.error.code as CloudProposalGatewayErrorCode)
    && typeof value.error.message === 'string'
    && typeof value.error.retryable === 'boolean') {
    return {
      status: 'success',
      envelope: {
        status: 'failure',
        error: {
          code: value.error.code as CloudProposalGatewayErrorCode,
          message: value.error.message,
          retryable: value.error.retryable,
        },
      },
    };
  }
  return { status: 'failure', errors: ['Gateway 响应 Envelope 无效。'] };
}
