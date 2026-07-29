import { isZonedDateTime, localDateOf, runtimeId, timestampOf } from './date-utils';
import type { TaskItem, TaskPlanEvent, TaskPlanEventKind, TaskPlanEventSource, TaskPlanSnapshot, ZonedDateTime } from './types';

export function taskPlanSnapshot(task: TaskItem): TaskPlanSnapshot {
  return {
    bucket: task.bucket,
    plannedDate: task.plannedDate,
    plannedStartAt: task.plannedStartAt,
    plannedEndAt: task.plannedEndAt,
  };
}

export function samePlan(left: TaskPlanSnapshot, right: TaskPlanSnapshot): boolean {
  return left.bucket === right.bucket
    && left.plannedDate === right.plannedDate
    && left.plannedStartAt === right.plannedStartAt
    && left.plannedEndAt === right.plannedEndAt;
}

export function validateSchedule(startAt: ZonedDateTime, endAt: ZonedDateTime): { valid: true; plannedDate: string } | { valid: false; message: string } {
  if (!isZonedDateTime(startAt) || !isZonedDateTime(endAt)) return { valid: false, message: '请输入包含时区的有效计划时间。' };
  if (timestampOf(endAt) <= timestampOf(startAt)) return { valid: false, message: '计划结束时间必须晚于开始时间。' };
  const startDate = localDateOf(startAt);
  if (localDateOf(endAt) !== startDate) return { valid: false, message: '单个计划时间块不能跨自然日。' };
  return { valid: true, plannedDate: startDate };
}

export function findScheduleConflicts(tasks: readonly TaskItem[], taskId: string, startAt: ZonedDateTime, endAt: ZonedDateTime): TaskItem[] {
  const start = timestampOf(startAt);
  const end = timestampOf(endAt);
  return tasks.filter((task) => {
    if (task.id === taskId || task.deletedAt || task.status === 'completed' || !task.plannedStartAt || !task.plannedEndAt) return false;
    const existingStart = timestampOf(task.plannedStartAt);
    const existingEnd = timestampOf(task.plannedEndAt);
    return start < existingEnd && end > existingStart;
  });
}

export function createTaskPlanEvent(input: {
  taskId: string;
  kind: TaskPlanEventKind;
  occurredAt: ZonedDateTime;
  before: TaskPlanSnapshot;
  after: TaskPlanSnapshot;
  source: TaskPlanEventSource;
  compensatesEventIds?: string[];
}): TaskPlanEvent {
  return { id: runtimeId('plan'), ...input };
}
