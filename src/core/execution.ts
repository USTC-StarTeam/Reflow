import type { DomainData, ProgressLog, TimeEntry } from './types';

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

export function closeOpenExecutionSegment(data: DomainData, taskId: string, endedAt: string, id: string): TimeEntry | undefined {
  const segment = findOpenExecutionSegment(data, taskId);
  if (!segment) return undefined;
  const start = new Date(segment.startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
  return {
    id,
    taskId,
    startedAt: segment.startedAt,
    endedAt,
    minutes: (end - start) / 60_000,
  };
}
