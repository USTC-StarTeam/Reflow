import { createSeedData } from './demo-data';
import { dateKey, durationMilliseconds, isLocalDate, isZonedDateTime, localDateOf } from './date-utils';
import { resolveProposalVisibleClassification } from './classification';
import { validateSchedule } from './planning';
import { DEMO_DATA_VERSION, type CapturePipelineState, type CaptureSource, type DomainData, type LocalDate, type TaskItem, type TaskPlanEvent, type VisibleClassification } from './types';

export const PERSISTENCE_KEY = 'reflow.demo.v1';
export const RECOVERY_KEY = 'reflow.demo.v4.recovery';
export const BACKUP_FORMAT = 'reflow.backup';
export const BACKUP_VERSION = 1 as const;

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  backupVersion: typeof BACKUP_VERSION;
  exportedAt: string;
  data: DomainData;
}

export type BackupParseResult =
  | { status: 'success'; data: DomainData; counts: { tasks: number; decisions: number; timeEntries: number; progressLogs: number; taskPlanEvents: number; knowledgeCards: number } }
  | { status: 'failure'; message: string };

type RecordValue = Record<string, unknown>;
const taskStatuses = new Set(['notStarted', 'inProgress', 'completed']);
const taskCategories = new Set(['work', 'communication', 'learning', 'life', 'health', 'unknown']);
const workflowBuckets = new Set(['inbox', 'today', 'waiting', 'someday', 'archived']);
const captureSources = new Set(['webText', 'voice', 'email', 'feishu', 'calendar', 'shareExtension', 'mobileShortcut']);
const captureStates = new Set(['captured', 'proposing', 'proposed', 'proposalFailed', 'resolved']);
const proposalStatuses = new Set(['pending', 'accepted', 'rejected']);
const proposalOutcomes = new Set(['task', 'knowledge']);
const proposalKinds = new Set(['create', 'merge', 'split']);
const progressKinds = new Set(['start', 'pause', 'progress', 'interrupt', 'complete']);
const planEventKinds = new Set(['planned', 'scheduled', 'rescheduled', 'deferred', 'unscheduled', 'movedToSomeday', 'cancelled']);
const planEventSources = new Set(['user', 'proposalDecision', 'migration', 'decisionUndo']);
const proposalProviders = new Set(['mock', 'cloud']);
const suggestedBuckets = new Set(['today', 'waiting', 'someday']);

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasCollections(data: RecordValue): boolean {
  return ['tasks', 'captures', 'proposals', 'timeEntries', 'progressLogs', 'knowledgeCards'].every((key) => Array.isArray(data[key]));
}

function idsAreUnique(collection: unknown[]): boolean {
  const ids = collection.map((item) => isRecord(item) ? item.id : undefined);
  return ids.every((id) => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length;
}

function validPlanSnapshot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const plannedDate = value.plannedDate;
  const startAt = value.plannedStartAt;
  const endAt = value.plannedEndAt;
  if (value.bucket !== undefined && (typeof value.bucket !== 'string' || !workflowBuckets.has(value.bucket))) return false;
  if (plannedDate !== undefined && !isLocalDate(plannedDate)) return false;
  if ((startAt === undefined) !== (endAt === undefined)) return false;
  if (startAt !== undefined && endAt !== undefined) {
    if (typeof startAt !== 'string' || typeof endAt !== 'string') return false;
    const schedule = validateSchedule(startAt, endAt);
    if (!schedule.valid || plannedDate !== schedule.plannedDate) return false;
  }
  return true;
}

function validTask(value: unknown): value is TaskItem {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.createdAt !== 'string' || !isZonedDateTime(value.createdAt)) return false;
  if (typeof value.estimatedMinutes !== 'number' || value.estimatedMinutes < 0 || typeof value.sortIndex !== 'number') return false;
  if (typeof value.status !== 'string' || !taskStatuses.has(value.status) || typeof value.category !== 'string' || !taskCategories.has(value.category) || typeof value.bucket !== 'string' || !workflowBuckets.has(value.bucket)) return false;
  if (typeof value.nextAction !== 'string' || typeof value.sourceSummary !== 'string') return false;
  if (value.completedAt !== undefined && !isZonedDateTime(value.completedAt)) return false;
  if (value.deletedAt !== undefined && !isZonedDateTime(value.deletedAt)) return false;
  return validPlanSnapshot(value);
}

function validWaitingDetailsDraft(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'followUpDate,waitingFor,waitingOn') return false;
  if (!(value.waitingFor === null || typeof value.waitingFor === 'string')) return false;
  if (!(value.waitingOn === null || typeof value.waitingOn === 'string')) return false;
  return value.followUpDate === null || isLocalDate(value.followUpDate);
}

function validProposal(value: unknown, captureIds: Set<string>): boolean {
  if (!isRecord(value) || typeof value.captureId !== 'string' || !captureIds.has(value.captureId)) return false;
  if (typeof value.title !== 'string' || typeof value.category !== 'string' || !taskCategories.has(value.category)) return false;
  if (typeof value.status !== 'string' || !proposalStatuses.has(value.status) || typeof value.outcome !== 'string' || !proposalOutcomes.has(value.outcome) || typeof value.kind !== 'string' || !proposalKinds.has(value.kind)) return false;
  if (!(value.estimatedMinutes === null || (Number.isInteger(value.estimatedMinutes) && Number(value.estimatedMinutes) >= 0 && Number(value.estimatedMinutes) <= 480))) return false;
  if (!(value.nextAction === null || typeof value.nextAction === 'string')) return false;
  if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1 || typeof value.reason !== 'string') return false;
  if (value.suggestedBucket !== undefined && (typeof value.suggestedBucket !== 'string' || !suggestedBuckets.has(value.suggestedBucket))) return false;
  if (value.suggestedDate !== undefined && !isLocalDate(value.suggestedDate)) return false;
  if (!validWaitingDetailsDraft(value.waitingDetails)) return false;
  if (!(value.knowledgeSummary === undefined || value.knowledgeSummary === null || typeof value.knowledgeSummary === 'string')) return false;
  if (value.provider !== undefined && (typeof value.provider !== 'string' || !proposalProviders.has(value.provider))) return false;
  if (value.duplicateTaskId !== undefined && typeof value.duplicateTaskId !== 'string') return false;
  if (value.splitTitles !== undefined && (!Array.isArray(value.splitTitles) || !value.splitTitles.every((title) => typeof title === 'string'))) return false;
  return true;
}

function validateCurrentDomainData(value: unknown): value is DomainData {
  if (!isRecord(value) || value.version !== DEMO_DATA_VERSION || !hasCollections(value) || !Array.isArray(value.decisions) || !Array.isArray(value.taskPlanEvents)) return false;
  const collections = [value.tasks, value.captures, value.proposals, value.decisions, value.timeEntries, value.progressLogs, value.taskPlanEvents, value.knowledgeCards] as unknown[][];
  if (collections.some((collection) => !idsAreUnique(collection))) return false;
  if (!(value.tasks as unknown[]).every(validTask)) return false;

  const taskIds = new Set((value.tasks as RecordValue[]).map((task) => task.id as string));
  const captureIds = new Set((value.captures as RecordValue[]).map((capture) => capture.id as string));
  const proposalIds = new Set((value.proposals as RecordValue[]).map((proposal) => proposal.id as string));

  if (!(value.captures as unknown[]).every((capture) => isRecord(capture) && typeof capture.rawText === 'string' && isZonedDateTime(capture.createdAt) && typeof capture.source === 'string' && captureSources.has(capture.source) && typeof capture.pipelineState === 'string' && captureStates.has(capture.pipelineState))) return false;
  if (!(value.proposals as unknown[]).every((proposal) => validProposal(proposal, captureIds))) return false;
  if (!(value.decisions as unknown[]).every((decision) => isRecord(decision) && typeof decision.captureId === 'string' && captureIds.has(decision.captureId) && typeof decision.proposalId === 'string' && proposalIds.has(decision.proposalId) && isZonedDateTime(decision.appliedAt) && (decision.revertedAt === undefined || isZonedDateTime(decision.revertedAt)) && isRecord(decision.effect))) return false;
  if (!(value.timeEntries as unknown[]).every((entry) => {
    if (!isRecord(entry) || typeof entry.taskId !== 'string' || !taskIds.has(entry.taskId) || !isZonedDateTime(entry.startedAt) || !isZonedDateTime(entry.endedAt)) return false;
    const duration = durationMilliseconds(entry.startedAt, entry.endedAt);
    return duration > 0 && typeof entry.minutes === 'number' && entry.minutes > 0;
  })) return false;
  if (!(value.progressLogs as unknown[]).every((log) => isRecord(log) && typeof log.taskId === 'string' && taskIds.has(log.taskId) && isZonedDateTime(log.createdAt) && typeof log.kind === 'string' && progressKinds.has(log.kind) && typeof log.text === 'string')) return false;
  const planEventIds = new Set((value.taskPlanEvents as RecordValue[]).map((event) => event.id as string));
  if (!(value.taskPlanEvents as unknown[]).every((event) => isRecord(event)
    && typeof event.taskId === 'string'
    && taskIds.has(event.taskId)
    && isZonedDateTime(event.occurredAt)
    && typeof event.kind === 'string'
    && planEventKinds.has(event.kind)
    && typeof event.source === 'string'
    && planEventSources.has(event.source)
    && validPlanSnapshot(event.before)
    && validPlanSnapshot(event.after)
    && (event.compensatesEventIds === undefined || (Array.isArray(event.compensatesEventIds) && event.compensatesEventIds.every((id) => typeof id === 'string' && planEventIds.has(id)))))) return false;
  if (!(value.knowledgeCards as unknown[]).every((card) => isRecord(card) && typeof card.title === 'string' && typeof card.summary === 'string' && typeof card.source === 'string' && isZonedDateTime(card.createdAt))) return false;
  return true;
}

export function isDomainData(value: unknown): value is DomainData {
  return validateCurrentDomainData(value);
}

function migrateSource(source: unknown): CaptureSource {
  if (source === '语音' || source === 'voice') return 'voice';
  if (source === '邮件' || source === 'email') return 'email';
  if (source === '飞书' || source === 'feishu') return 'feishu';
  if (source === '日历' || source === 'calendar') return 'calendar';
  if (source === '分享扩展' || source === 'shareExtension') return 'shareExtension';
  if (source === '移动端快捷入口' || source === 'mobileShortcut') return 'mobileShortcut';
  return 'webText';
}

function migratePipelineState(status: unknown): CapturePipelineState {
  if (status === 'organizing' || status === 'proposing') return 'proposing';
  if (status === 'organized' || status === 'proposed') return 'proposed';
  if (status === 'proposalFailed') return 'proposalFailed';
  if (status === 'captured') return 'captured';
  return 'resolved';
}

function migrateToV3(value: RecordValue): RecordValue | undefined {
  if (!hasCollections(value)) return undefined;
  const copy = JSON.parse(JSON.stringify(value)) as RecordValue;
  const captures = copy.captures as RecordValue[];
  if (value.version === 1) {
    copy.captures = captures.map((capture) => ({
      id: capture.id,
      rawText: capture.rawText,
      source: migrateSource(capture.source),
      createdAt: capture.createdAt,
      pipelineState: migratePipelineState(capture.parseStatus),
    }));
    copy.decisions = [];
    const fallbackCreatedAt = captures[0]?.createdAt ?? '1970-01-01T00:00:00.000Z';
    copy.knowledgeCards = (copy.knowledgeCards as RecordValue[]).map((card) => ({ ...card, createdAt: card.createdAt ?? fallbackCreatedAt }));
    copy.version = 2;
  }
  if (copy.version === 2) {
    const proposals = copy.proposals as RecordValue[];
    copy.proposals = proposals.map((proposal) => ({ ...proposal, suggestedBucket: proposal.suggestedBucket ?? (proposal.outcome === 'task' ? 'today' : undefined) }));
    const decisions = (copy.decisions as RecordValue[] | undefined) ?? [];
    copy.decisions = decisions.map((decision) => {
      const edit = isRecord(decision.edited) ? decision.edited : undefined;
      if (!edit || edit.visibleClassification) return decision;
      const proposal = proposals.find((item) => item.id === decision.proposalId);
      let visibleClassification: VisibleClassification | undefined;
      if (decision.outcome === 'knowledge') visibleClassification = 'knowledge';
      else if (decision.bucket === 'waiting') visibleClassification = 'waiting';
      else if (decision.bucket === 'someday') visibleClassification = 'someday';
      else if (proposal) visibleClassification = resolveProposalVisibleClassification(proposal as never);
      return { ...decision, edited: { ...edit, visibleClassification } };
    });
    copy.version = 3;
  }
  return copy.version === 3 ? copy : undefined;
}

function migrateV3ToV4(value: RecordValue, now: Date): DomainData | undefined {
  const tasks = (value.tasks as RecordValue[]).map((task): RecordValue => {
    const plannedStartAt = typeof task.plannedStartAt === 'string' ? task.plannedStartAt : undefined;
    const plannedDate: LocalDate | undefined = plannedStartAt
      ? localDateOf(plannedStartAt)
      : task.status !== 'completed' && task.bucket === 'today'
        ? dateKey(now)
        : undefined;
    return { ...task, plannedDate };
  });
  const taskPlanEvents: TaskPlanEvent[] = tasks.flatMap((task) => {
    if (!task.plannedDate || typeof task.id !== 'string' || typeof task.createdAt !== 'string') return [];
    return [{
      id: `plan-migration-${task.id}`,
      taskId: task.id,
      kind: task.plannedStartAt ? 'scheduled' : 'planned',
      occurredAt: task.createdAt,
      before: { bucket: task.bucket as TaskItem['bucket'] },
      after: { bucket: task.bucket as TaskItem['bucket'], plannedDate: task.plannedDate as LocalDate, plannedStartAt: task.plannedStartAt as string | undefined, plannedEndAt: task.plannedEndAt as string | undefined },
      source: 'migration',
    }];
  });
  const candidate = { ...value, version: DEMO_DATA_VERSION, tasks, taskPlanEvents };
  return validateCurrentDomainData(candidate) ? candidate : undefined;
}

export function migrateStoredData(value: unknown, now = new Date()): DomainData | undefined {
  if (validateCurrentDomainData(value)) return value;
  if (!isRecord(value) || ![1, 2, 3].includes(value.version as number)) return undefined;
  const v3 = migrateToV3(value);
  return v3 ? migrateV3ToV4(v3, now) : undefined;
}

export function parseStoredData(raw: string | null, fallback = createSeedData(), now = new Date()): DomainData {
  if (!raw) return fallback;
  try {
    return migrateStoredData(JSON.parse(raw) as unknown, now) ?? fallback;
  } catch {
    return fallback;
  }
}

export function parseStoredDataWithRecovery(primary: string | null, recovery: string | null, fallback = createSeedData(), now = new Date()): DomainData {
  if (primary) {
    try {
      const parsed = migrateStoredData(JSON.parse(primary) as unknown, now);
      if (parsed) return parsed;
    } catch {
      // Try the independently validated recovery copy.
    }
  }
  return parseStoredData(recovery, fallback, now);
}

export function serializeBackup(data: DomainData, exportedAt = new Date()): string {
  const envelope: BackupEnvelope = { format: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, exportedAt: exportedAt.toISOString(), data };
  return JSON.stringify(envelope, null, 2);
}

export function parseBackup(raw: string, now = new Date()): BackupParseResult {
  try {
    const envelope = JSON.parse(raw) as unknown;
    if (!isRecord(envelope) || envelope.format !== BACKUP_FORMAT || envelope.backupVersion !== BACKUP_VERSION || !isZonedDateTime(envelope.exportedAt)) {
      return { status: 'failure', message: '备份格式或版本不受支持。' };
    }
    const data = migrateStoredData(envelope.data, now);
    if (!data) return { status: 'failure', message: '备份数据结构、引用或时间字段校验失败。' };
    return {
      status: 'success',
      data,
      counts: {
        tasks: data.tasks.filter((task) => !task.deletedAt).length,
        decisions: data.decisions.length,
        timeEntries: data.timeEntries.length,
        progressLogs: data.progressLogs.length,
        taskPlanEvents: data.taskPlanEvents.length,
        knowledgeCards: data.knowledgeCards.length,
      },
    };
  } catch {
    return { status: 'failure', message: '无法解析备份文件。' };
  }
}
