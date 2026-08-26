import { addMinutes, localDateOf, toZonedISOString } from './date-utils';
import type { DomainData, ExecutionTimeDecision, ProgressLog, TimeEntry } from './types';

export const EXECUTION_CONFIRMATION_THRESHOLD_MINUTES = 6 * 60;

export interface OpenExecutionSegment {
  startedAt: string;
  resumed: boolean;
}

function executionBoundaries(data: DomainData, taskId: string): ProgressLog[] {
  return data.progressLogs
    .map((log, index) => ({ log, index }))
    .filter(({ log }) => log.taskId === taskId && (log.kind === 'start' || log.kind === 'pause' || log.kind === 'complete'))
    .filter(({ log }) => Number.isFinite(new Date(log.createdAt).getTime()))
    .sort((left, right) => new Date(left.log.createdAt).getTime() - new Date(right.log.createdAt).getTime() || left.index - right.index)
    .map(({ log }) => log);
}

export function findOpenExecutionSegment(data: DomainData, taskId: string): OpenExecutionSegment | undefined {
  const boundaries = executionBoundaries(data, taskId);
  const latest = boundaries.at(-1);
  if (latest?.kind !== 'start') return undefined;
  return {
    startedAt: latest.createdAt,
    resumed: boundaries.filter((log) => log.kind === 'start').length > 1,
  };
}

export function executionDurationMinutes(startedAt: string, endedAt: string): number {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60_000 : 0;
}

export function executionNeedsConfirmation(startedAt: string, endedAt: string): boolean {
  const minutes = executionDurationMinutes(startedAt, endedAt);
  return minutes > 0 && (localDateOf(startedAt) !== localDateOf(endedAt) || minutes > EXECUTION_CONFIRMATION_THRESHOLD_MINUTES);
}

export function timeEntryNeedsCorrection(entry: TimeEntry): boolean {
  return !entry.confirmedAt && executionNeedsConfirmation(entry.startedAt, entry.endedAt);
}

export function closeOpenExecutionSegment(data: DomainData, taskId: string, endedAt: string, id: string, decision?: ExecutionTimeDecision): TimeEntry | undefined {
  const segment = findOpenExecutionSegment(data, taskId);
  if (!segment) return undefined;
  const minutes = executionDurationMinutes(segment.startedAt, endedAt);
  if (minutes <= 0) return undefined;
  const correctedEnd = decision?.kind === 'adjust'
    ? toZonedISOString(addMinutes(new Date(segment.startedAt), decision.minutes))
    : endedAt;
  return {
    id,
    taskId,
    startedAt: segment.startedAt,
    endedAt: correctedEnd,
    minutes: decision?.kind === 'adjust' ? decision.minutes : minutes,
    confirmedAt: decision ? endedAt : undefined,
  };
}
