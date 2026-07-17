import { addDays, dateKey, startOfDay, startOfWeek } from './date-utils';
import { categoryLabels, type DomainData, type ReviewPeriod, type ReviewSummary, type TaskCategory } from './types';

export function selectTaskMinutes(data: DomainData, taskId: string): number {
  return data.timeEntries.filter((entry) => entry.taskId === taskId).reduce((sum, entry) => sum + entry.minutes, 0);
}

export function selectCurrentTask(data: DomainData) {
  return data.tasks.find((task) => task.status === 'inProgress');
}

export function selectPendingProposals(data: DomainData) {
  return data.proposals.filter((proposal) => proposal.status === 'pending');
}

export function selectTasksForDate(data: DomainData, selected: string) {
  return data.tasks
    .filter((task) => task.plannedStartAt && dateKey(task.plannedStartAt) === selected)
    .sort((a, b) => (a.plannedStartAt ?? '').localeCompare(b.plannedStartAt ?? ''));
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

export function deriveReview(data: DomainData, period: ReviewPeriod, now = new Date()): ReviewSummary {
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
  const top = categoryMinutes[0];
  const periodLabel = period === 'daily' ? '今天' : period === 'weekly' ? '本周' : '本月';

  return {
    period,
    total: tasks.length,
    completed,
    completionRate: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
    actualMinutes,
    interruptions,
    categoryMinutes,
    headline: `${periodLabel}完成 ${completed}/${tasks.length} 项，记录 ${actualMinutes} 分钟。`,
    suggestion: top
      ? `${categoryLabels[top.category]}占用最多（${top.minutes} 分钟），下一次排程建议预留 15 分钟缓冲。`
      : `${dateKey(now)} 暂无足够执行记录，可以先从一个 15 分钟行动块开始。`,
  };
}
