import { addDays, dateKey, startOfDay, startOfWeek } from './date-utils';
import { resolveProposalVisibleClassification } from './classification';
import { categoryLabels, type CalendarTaskEntry, type DomainData, type ReviewFacts, type ReviewPeriod, type ReviewSummary, type TaskCategory } from './types';

export function selectTaskMinutes(data: DomainData, taskId: string): number {
  return data.timeEntries.filter((entry) => entry.taskId === taskId).reduce((sum, entry) => sum + entry.minutes, 0);
}

export function selectCurrentTask(data: DomainData) {
  return data.tasks.find((task) => task.status === 'inProgress');
}

export function selectPendingProposals(data: DomainData) {
  return data.proposals.filter((proposal) => proposal.status === 'pending');
}

export function selectProposalVisibleClassification(data: DomainData, proposalId: string) {
  const proposal = data.proposals.find((item) => item.id === proposalId);
  if (!proposal) return undefined;
  return resolveProposalVisibleClassification(proposal);
}

export function selectRecentDecisions(data: DomainData, limit = 5) {
  return [...data.decisions]
    .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt))
    .slice(0, limit);
}

export function selectFailedCaptures(data: DomainData) {
  return data.captures.filter((capture) => capture.pipelineState === 'proposalFailed');
}

export function selectLatestUndoableDecision(data: DomainData) {
  return [...data.decisions
    .filter((decision) => decision.status === 'applied')
  ].sort((left, right) => right.appliedAt.localeCompare(left.appliedAt))[0];
}

export function selectCalendarEntriesForDate(data: DomainData, selected: string, today = new Date()): CalendarTaskEntry[] {
  const todayKey = dateKey(today);
  return data.tasks.flatMap((task): CalendarTaskEntry[] => {
    const plannedOnDate = Boolean(task.plannedStartAt && dateKey(task.plannedStartAt) === selected);
    const completedOnDate = Boolean(task.completedAt && dateKey(task.completedAt) === selected);
    const unscheduledToday = selected === todayKey
      && task.bucket === 'today'
      && task.status !== 'completed'
      && !task.plannedStartAt;
    if (!plannedOnDate && !completedOnDate && !unscheduledToday) return [];

    const kind = plannedOnDate && completedOnDate
      ? 'plannedCompleted'
      : completedOnDate
        ? 'completed'
        : plannedOnDate
          ? 'planned'
          : 'unscheduled';
    return [{
      task,
      date: selected,
      kind,
      plannedStartAt: task.plannedStartAt,
      plannedEndAt: task.plannedEndAt,
      completedAt: task.completedAt,
    }];
  }).sort((left, right) => {
    const leftTime = left.kind === 'planned' || left.kind === 'plannedCompleted'
      ? left.plannedStartAt ?? ''
      : left.kind === 'completed'
        ? left.completedAt ?? ''
        : `z-${String(left.task.sortIndex).padStart(6, '0')}`;
    const rightTime = right.kind === 'planned' || right.kind === 'plannedCompleted'
      ? right.plannedStartAt ?? ''
      : right.kind === 'completed'
        ? right.completedAt ?? ''
        : `z-${String(right.task.sortIndex).padStart(6, '0')}`;
    return leftTime.localeCompare(rightTime);
  });
}

function periodStart(period: ReviewPeriod, now: Date): Date {
  if (period === 'daily') return startOfDay(now);
  if (period === 'weekly') return startOfWeek(now);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function periodEnd(period: ReviewPeriod, start: Date): Date {
  if (period === 'daily') return addDays(start, 1);
  if (period === 'weekly') return addDays(start, 7);
  return new Date(start.getFullYear(), start.getMonth() + 1, 1);
}

export function deriveReviewFacts(data: DomainData, period: ReviewPeriod, now = new Date()): ReviewFacts {
  const start = periodStart(period, now).getTime();
  const end = periodEnd(period, new Date(start)).getTime();
  const inPeriod = (value: string) => {
    const timestamp = new Date(value).getTime();
    return timestamp >= start && timestamp < end;
  };
  const tasks = data.tasks.filter((task) => {
    const reference = task.plannedStartAt ?? task.createdAt;
    return inPeriod(reference);
  });
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const periodEntries = data.timeEntries.filter((entry) => inPeriod(entry.endedAt));
  const actualMinutes = periodEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  const interruptions = data.progressLogs.filter((log) => log.kind === 'interrupt' && inPeriod(log.createdAt)).length;
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
  const categories = new Map<TaskCategory, number>();
  periodEntries.forEach((entry) => {
    const category = tasksById.get(entry.taskId)?.category ?? 'unknown';
    categories.set(category, (categories.get(category) ?? 0) + entry.minutes);
  });
  const categoryMinutes = [...categories.entries()]
    .map(([category, minutes]) => ({ category, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
  return {
    period,
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    taskCount: tasks.length,
    completedCount: completed,
    actualMinutes,
    interruptions,
    categoryMinutes,
  };
}

export function deriveReview(data: DomainData, period: ReviewPeriod, now = new Date()): ReviewSummary {
  const facts = deriveReviewFacts(data, period, now);
  const top = facts.categoryMinutes[0];
  const periodLabel = period === 'daily' ? '今天' : period === 'weekly' ? '本周' : '本月';
  return {
    ...facts,
    total: facts.taskCount,
    completed: facts.completedCount,
    completionRate: facts.taskCount ? Math.round((facts.completedCount / facts.taskCount) * 100) : 0,
    headline: `${periodLabel}完成 ${facts.completedCount}/${facts.taskCount} 项，记录 ${facts.actualMinutes} 分钟。`,
    suggestion: top
      ? `${categoryLabels[top.category]}占用最多（${top.minutes} 分钟），下一次排程建议预留 15 分钟缓冲。`
      : `${dateKey(now)} 暂无足够执行记录，可以先从一个 15 分钟行动块开始。`,
  };
}
