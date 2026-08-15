import { addDays, addLocalDays, compareLocalDates, dateKey, durationMilliseconds, intervalOverlapMilliseconds, localDateOf, localDateToDate, localDayInterval, startOfDay, startOfWeek, timestampOf, toZonedISOString } from './date-utils';
import { resolveProposalVisibleClassification } from './classification';
import { findScheduleConflicts } from './planning';
import { categoryLabels, type CalendarTaskEntry, type DailyReviewFacts, type DailyTaskOutcome, type DomainData, type LocalDate, type ReviewFacts, type ReviewPeriod, type ReviewSummary, type TaskCategory, type TaskItem, type ZonedDateTime } from './types';

export interface CurrentExecutionSession {
  startedAt: string;
  resumed: boolean;
}

function activeTasks(data: DomainData): TaskItem[] {
  return data.tasks.filter((task) => !task.deletedAt);
}

function completeTimePair(task: TaskItem): boolean {
  return Boolean(task.plannedStartAt && task.plannedEndAt);
}

export function selectTaskMinutes(data: DomainData, taskId: string): number {
  const milliseconds = data.timeEntries
    .filter((entry) => entry.taskId === taskId)
    .reduce((sum, entry) => sum + Math.max(0, durationMilliseconds(entry.startedAt, entry.endedAt)), 0);
  return Math.round(milliseconds / 60_000);
}

export function selectCurrentTask(data: DomainData) {
  return activeTasks(data).find((task) => task.status === 'inProgress');
}

export function selectCurrentExecutionSession(data: DomainData, taskId: string): CurrentExecutionSession | undefined {
  const task = activeTasks(data).find((candidate) => candidate.id === taskId);
  if (task?.status !== 'inProgress') return undefined;
  const starts = data.progressLogs
    .filter((log) => log.taskId === taskId && log.kind === 'start' && Number.isFinite(new Date(log.createdAt).getTime()))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const latest = starts.at(-1);
  return latest ? { startedAt: latest.createdAt, resumed: starts.length > 1 } : undefined;
}

export function isTaskDelayed(task: TaskItem, now: Date): boolean {
  if (task.status !== 'notStarted' || !task.plannedStartAt) return false;
  const plannedStart = new Date(task.plannedStartAt).getTime();
  return Number.isFinite(plannedStart) && now.getTime() > plannedStart;
}

export function selectPendingProposals(data: DomainData) {
  return data.proposals.filter((proposal) => proposal.status === 'pending');
}

export function selectProposalVisibleClassification(data: DomainData, proposalId: string) {
  const proposal = data.proposals.find((item) => item.id === proposalId);
  return proposal ? resolveProposalVisibleClassification(proposal) : undefined;
}

export function selectRecentDecisions(data: DomainData, limit = 5) {
  return [...data.decisions].sort((left, right) => right.appliedAt.localeCompare(left.appliedAt)).slice(0, limit);
}

export function selectFailedCaptures(data: DomainData) {
  return data.captures.filter((capture) => capture.pipelineState === 'proposalFailed');
}

export function selectLatestUndoableDecision(data: DomainData) {
  return [...data.decisions.filter((decision) => decision.status === 'applied')]
    .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt))[0];
}

export interface TodaySections {
  scheduled: TaskItem[];
  unscheduled: TaskItem[];
  completed: TaskItem[];
}

export function selectTodaySections(data: DomainData, today: LocalDate = dateKey(new Date())): TodaySections {
  const tasks = activeTasks(data);
  const completed = tasks
    .filter((task) => Boolean(task.completedAt && localDateOf(task.completedAt) === today))
    .sort((left, right) => (left.completedAt ?? '').localeCompare(right.completedAt ?? ''));
  const completedIds = new Set(completed.map((task) => task.id));
  const scheduled = tasks
    .filter((task) => task.plannedDate === today && task.status !== 'completed' && completeTimePair(task) && !completedIds.has(task.id))
    .sort((left, right) => (left.plannedStartAt ?? '').localeCompare(right.plannedStartAt ?? ''));
  const scheduledIds = new Set(scheduled.map((task) => task.id));
  const unscheduled = tasks
    .filter((task) => task.plannedDate === today && task.status !== 'completed' && !completeTimePair(task) && !completedIds.has(task.id) && !scheduledIds.has(task.id))
    .sort((left, right) => left.sortIndex - right.sortIndex);
  return { scheduled, unscheduled, completed };
}

export function selectPlanningBacklog(data: DomainData, today: LocalDate = dateKey(new Date())): TaskItem[] {
  return activeTasks(data)
    .filter((task) => task.status !== 'completed' && (task.bucket === 'someday' || Boolean(task.plannedDate && compareLocalDates(task.plannedDate, today) < 0)))
    .sort((left, right) => left.sortIndex - right.sortIndex);
}

export function selectScheduleConflicts(data: DomainData, taskId: string, startAt: ZonedDateTime, endAt: ZonedDateTime): TaskItem[] {
  return findScheduleConflicts(data.tasks, taskId, startAt, endAt);
}

export function selectCalendarEntriesForDate(data: DomainData, selected: LocalDate): CalendarTaskEntry[] {
  return activeTasks(data).flatMap((task): CalendarTaskEntry[] => {
    const plannedOnDate = task.plannedDate === selected;
    const completedOnDate = Boolean(task.completedAt && localDateOf(task.completedAt) === selected);
    const unscheduled = plannedOnDate && task.status !== 'completed' && !completeTimePair(task);
    if (!plannedOnDate && !completedOnDate) return [];
    const kind = plannedOnDate && completedOnDate
      ? 'plannedCompleted'
      : completedOnDate
        ? 'completed'
        : unscheduled
          ? 'unscheduled'
          : 'planned';
    return [{ task, date: selected, kind, plannedStartAt: task.plannedStartAt, plannedEndAt: task.plannedEndAt, completedAt: task.completedAt }];
  }).sort((left, right) => {
    const time = (entry: CalendarTaskEntry) => entry.plannedStartAt ?? entry.completedAt ?? `z-${String(entry.task.sortIndex).padStart(6, '0')}`;
    return time(left).localeCompare(time(right));
  });
}

function activePlanEvents(data: DomainData) {
  const compensatedIds = new Set(data.taskPlanEvents.flatMap((event) => event.compensatesEventIds ?? []));
  return data.taskPlanEvents.filter((event) => !compensatedIds.has(event.id));
}

export function deriveDailyReviewFacts(data: DomainData, date: LocalDate): DailyReviewFacts {
  const { start, end } = localDayInterval(date);
  const events = activePlanEvents(data).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const plannedTaskIds = new Set(events
    .filter((event) => event.after.plannedDate === date && timestampOf(event.occurredAt) < end.getTime())
    .map((event) => event.taskId));
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
  const taskOutcomes: DailyTaskOutcome[] = [];
  const completedAsPlannedIds = new Set<string>();

  plannedTaskIds.forEach((taskId) => {
    const task = tasksById.get(taskId);
    if (!task) return;
    const completionAt = task.completedAt ? timestampOf(task.completedAt) : undefined;
    const completedOnDate = Boolean(task.completedAt && localDateOf(task.completedAt) === date);
    const departure = events.find((event) => event.taskId === taskId
      && event.before.plannedDate === date
      && event.after.plannedDate !== date
      && (!completionAt || timestampOf(event.occurredAt) <= completionAt));
    if (completedOnDate && !departure) {
      completedAsPlannedIds.add(taskId);
      taskOutcomes.push({ taskId, outcome: 'completedAsPlanned' });
      return;
    }
    if (departure && departure.kind !== 'cancelled') {
      taskOutcomes.push({ taskId, outcome: 'deferred', deferredTo: departure.after.plannedDate ?? 'someday' });
      return;
    }
    taskOutcomes.push({ taskId, outcome: task.deletedAt ? 'deleted' : 'unfinished' });
  });

  const completedTodayIds = new Set(data.tasks
    .filter((task) => Boolean(task.completedAt && localDateOf(task.completedAt) === date))
    .map((task) => task.id));
  const overlapMilliseconds = data.timeEntries.reduce((sum, entry) => sum + intervalOverlapMilliseconds(entry.startedAt, entry.endedAt, start, end), 0);
  const completedAsPlannedCount = completedAsPlannedIds.size;
  const plannedCount = plannedTaskIds.size;
  return {
    date,
    plannedCount,
    completedAsPlannedCount,
    completedTotalCount: completedTodayIds.size,
    extraCompletedCount: [...completedTodayIds].filter((id) => !completedAsPlannedIds.has(id)).length,
    unfinishedCount: Math.max(0, plannedCount - completedAsPlannedCount),
    plannedCompletionRate: plannedCount ? Math.round((completedAsPlannedCount / plannedCount) * 100) : 0,
    taskOutcomes,
    actualMinutes: Math.round(overlapMilliseconds / 60_000),
    interruptions: data.progressLogs.filter((log) => log.kind === 'interrupt' && localDateOf(log.createdAt) === date).length,
  };
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
  const start = periodStart(period, now);
  const end = periodEnd(period, start);
  let plannedCount = 0;
  let completedCount = 0;
  for (let cursor = dateKey(start); compareLocalDates(cursor, dateKey(end)) < 0; cursor = addLocalDays(cursor, 1)) {
    const daily = deriveDailyReviewFacts(data, cursor);
    plannedCount += daily.plannedCount;
    completedCount += daily.completedAsPlannedCount;
  }
  const entries = data.timeEntries.map((entry) => ({ entry, overlap: intervalOverlapMilliseconds(entry.startedAt, entry.endedAt, start, end) })).filter((item) => item.overlap > 0);
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
  const categories = new Map<TaskCategory, number>();
  entries.forEach(({ entry, overlap }) => {
    const category = tasksById.get(entry.taskId)?.category ?? 'unknown';
    categories.set(category, (categories.get(category) ?? 0) + overlap);
  });
  return {
    period,
    startAt: toZonedISOString(start),
    endAt: toZonedISOString(end),
    taskCount: plannedCount,
    completedCount,
    actualMinutes: Math.round(entries.reduce((sum, item) => sum + item.overlap, 0) / 60_000),
    interruptions: data.progressLogs.filter((log) => {
      const timestamp = timestampOf(log.createdAt);
      return log.kind === 'interrupt' && timestamp >= start.getTime() && timestamp < end.getTime();
    }).length,
    categoryMinutes: [...categories.entries()]
      .map(([category, milliseconds]) => ({ category, minutes: Math.round(milliseconds / 60_000) }))
      .sort((left, right) => right.minutes - left.minutes),
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
    headline: `${periodLabel}按计划完成 ${facts.completedCount}/${facts.taskCount} 项，记录 ${facts.actualMinutes} 分钟。`,
    suggestion: top ? `${categoryLabels[top.category]}投入最多（${top.minutes} 分钟），下一次排程建议预留缓冲。` : `${dateKey(now)} 暂无执行记录，可以先安排一个行动块。`,
  };
}

export function selectFirstAvailableSlot(data: DomainData, date: LocalDate, durationMinutes: number, startHour = 7, endHour = 23): { startAt: ZonedDateTime; endAt: ZonedDateTime } | undefined {
  const duration = Math.max(15, Math.ceil(durationMinutes / 15) * 15);
  const day = localDateToDate(date);
  for (let minute = startHour * 60; minute + duration <= endHour * 60; minute += 15) {
    const start = new Date(day);
    start.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    const end = new Date(start.getTime() + duration * 60_000);
    const startAt = toZonedISOString(start);
    const endAt = toZonedISOString(end);
    if (!findScheduleConflicts(data.tasks, '', startAt, endAt).length) return { startAt, endAt };
  }
  return undefined;
}
