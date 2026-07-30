import { addMinutes, isLocalDate, localDateOf, runtimeId, toZonedISOString } from './date-utils';
import { categoryForVisibleClassification, defaultSuggestedBucket, resolveProposalVisibleClassification } from './classification';
import { createTaskPlanEvent, findScheduleConflicts, samePlan, taskPlanSnapshot, validateSchedule } from './planning';
import { captureSourceLabels, type AIProposal, type DomainData, type InboxCapture, type LocalDate, type PipelineFailure, type ProgressKind, type ProposalEdit, type TaskCategory, type TaskItem, type TaskPlanEvent, type TaskPlanEventKind, type TaskPlanEventSource, type UserDecision, type UserDecisionInput, type WaitingDetails, type WaitingDetailsDraft, type WorkflowBucket } from './types';

export type EditedProposal = ProposalEdit;

export type DomainAction =
  | { type: 'captureCreated'; capture: InboxCapture }
  | { type: 'proposalRequested'; captureId: string }
  | { type: 'proposalReceived'; captureId: string; proposals: AIProposal[] }
  | { type: 'proposalFailed'; captureId: string; failure: PipelineFailure }
  | { type: 'submitUserDecision'; decisionId: string; decision: UserDecisionInput; at: string }
  | { type: 'undoUserDecision'; decisionId: string; at: string }
  | { type: 'startTask'; taskId: string; at: string }
  | { type: 'pauseTask'; taskId: string; at: string }
  | { type: 'completeTask'; taskId: string; at: string }
  | { type: 'moveTask'; taskId: string; bucket: WorkflowBucket; at: string }
  | { type: 'recordTime'; taskId: string; minutes: number; at: string }
  | { type: 'recordProgress'; taskId: string; text: string; kind: ProgressKind; at: string }
  | { type: 'recordInterruption'; taskId: string; text: string; at: string }
  | { type: 'planTaskForDate'; taskId: string; date: LocalDate; at: string }
  | { type: 'scheduleTask'; taskId: string; startAt: string; endAt: string; allowConflict?: boolean; at: string }
  | { type: 'unscheduleTask'; taskId: string; at: string }
  | { type: 'deferTask'; taskId: string; destination: { date: LocalDate } | { bucket: 'someday' }; at: string }
  | { type: 'deleteTask'; taskId: string; at: string }
  | { type: 'reorderTasks'; taskIds: string[] }
  | { type: 'restoreBackup'; data: DomainData };

export type DomainActionResult = { type: DomainAction['type']; decision?: UserDecision };

export type DomainTransition =
  | { status: 'success'; data: DomainData; result: DomainActionResult }
  | { status: 'failure'; data: DomainData; failure: PipelineFailure };

const taskBuckets: WorkflowBucket[] = ['today', 'waiting', 'someday'];

function failure(data: DomainData, code: PipelineFailure['code'], message: string, retryable = false): DomainTransition {
  return { status: 'failure', data, failure: { code, message, retryable } };
}

function success(data: DomainData, type: DomainAction['type'], decision?: UserDecision): DomainTransition {
  return { status: 'success', data, result: { type, decision } };
}

function findTask(data: DomainData, taskId: string): TaskItem | undefined {
  return data.tasks.find((task) => task.id === taskId && !task.deletedAt);
}

function planEvent(input: {
  task: TaskItem;
  next: TaskItem;
  kind: TaskPlanEventKind;
  at: string;
  source?: TaskPlanEventSource;
  compensatesEventIds?: string[];
}): TaskPlanEvent {
  return createTaskPlanEvent({
    taskId: input.task.id,
    kind: input.kind,
    occurredAt: input.at,
    before: taskPlanSnapshot(input.task),
    after: taskPlanSnapshot(input.next),
    source: input.source ?? 'user',
    compensatesEventIds: input.compensatesEventIds,
  });
}

function resolveCapture(data: DomainData, captureId: string): InboxCapture[] {
  return data.captures.map((capture) => capture.id === captureId
    ? { ...capture, pipelineState: 'resolved', failure: undefined }
    : capture);
}

function markProposal(data: DomainData, proposalId: string, status: 'accepted' | 'rejected') {
  return data.proposals.map((proposal) => proposal.id === proposalId ? { ...proposal, status } : proposal);
}

function appendLog(data: DomainData, taskId: string, text: string, kind: ProgressKind, at: string) {
  return [...data.progressLogs, { id: runtimeId('log'), taskId, text, kind, createdAt: at }];
}

function isTaskBucket(bucket: WorkflowBucket | undefined): bucket is WorkflowBucket {
  return Boolean(bucket && taskBuckets.includes(bucket));
}

function isValidFollowUpDate(value: string | undefined): value is string {
  return isLocalDate(value);
}

function normalizeWaitingDetails(details: WaitingDetails | WaitingDetailsDraft | null | undefined): WaitingDetails | undefined {
  if (!details) return undefined;
  return {
    waitingFor: details.waitingFor?.trim() ?? '',
    waitingOn: details.waitingOn?.trim() ?? '',
    followUpDate: details.followUpDate?.trim() ?? '',
  };
}

function taskSource(capture: InboxCapture): string {
  return captureSourceLabels[capture.source];
}

function sameTask(left: TaskItem | undefined, right: TaskItem): boolean {
  return Boolean(left && JSON.stringify(left) === JSON.stringify(right));
}

function buildTaskOutcome(input: {
  data: DomainData;
  proposal: AIProposal;
  capture: InboxCapture;
  edit: ProposalEdit;
  bucket: WorkflowBucket;
  waitingDetails?: WaitingDetails;
  plannedDate?: LocalDate;
  decisionId: string;
  at: string;
}): { tasks: TaskItem[]; taskPlanEvents: TaskPlanEvent[]; effect: UserDecision['effect'] } | PipelineFailure {
  const { data, proposal, capture, edit, bucket, waitingDetails, plannedDate, decisionId, at } = input;
  if (proposal.kind === 'merge') {
    const previousTask = proposal.duplicateTaskId ? findTask(data, proposal.duplicateTaskId) : undefined;
    if (!previousTask) return { code: 'task_not_found', message: '要合并的任务已不存在。', retryable: false };
    const targetDate = plannedDate ?? (bucket === 'today' ? localDateOf(at) : undefined);
    const keepTimes = Boolean(targetDate && previousTask.plannedDate === targetDate);
    const appliedTask: TaskItem = {
      ...previousTask,
      title: edit.title,
      category: edit.category,
      bucket,
      estimatedMinutes: edit.estimatedMinutes,
      nextAction: edit.nextAction,
      plannedDate: targetDate,
      plannedStartAt: keepTimes ? previousTask.plannedStartAt : undefined,
      plannedEndAt: keepTimes ? previousTask.plannedEndAt : undefined,
      waitingDetails: bucket === 'waiting' ? waitingDetails : undefined,
      sourceSummary: `${previousTask.sourceSummary} + ${taskSource(capture)}`,
    };
    const changedPlan = !samePlan(taskPlanSnapshot(previousTask), taskPlanSnapshot(appliedTask));
    const kind: TaskPlanEventKind = bucket === 'someday' ? 'movedToSomeday' : targetDate ? (previousTask.plannedDate ? 'rescheduled' : 'planned') : 'unscheduled';
    return {
      tasks: data.tasks.map((task) => task.id === previousTask.id ? appliedTask : task),
      taskPlanEvents: changedPlan ? [planEvent({ task: previousTask, next: appliedTask, kind, at, source: 'proposalDecision' })] : [],
      effect: { type: 'mergedTask', previousTask, appliedTask },
    };
  }

  const titles = proposal.kind === 'split' && proposal.splitTitles?.length && edit.title === proposal.title
    ? proposal.splitTitles
    : [edit.title];
  const maxSort = data.tasks.reduce((max, task) => Math.max(max, task.sortIndex), -1);
  const createdTasks = titles.map((title, index): TaskItem => ({
    id: `task-${decisionId}-${index}`,
    title: title.trim() || proposal.title,
    status: 'notStarted',
    category: edit.category,
    bucket,
    estimatedMinutes: Math.max(5, Math.round(edit.estimatedMinutes / titles.length)),
    nextAction: edit.nextAction,
    sourceSummary: taskSource(capture),
    sortIndex: maxSort + index + 1,
    createdAt: at,
    plannedDate: plannedDate ?? (bucket === 'today' ? localDateOf(at) : undefined),
    waitingDetails: bucket === 'waiting' ? waitingDetails : undefined,
  }));
  const taskPlanEvents = createdTasks
    .filter((task) => task.plannedDate)
    .map((task) => createTaskPlanEvent({
      taskId: task.id,
      kind: 'planned',
      occurredAt: at,
      before: { bucket },
      after: taskPlanSnapshot(task),
      source: 'proposalDecision',
    }));
  return { tasks: [...data.tasks, ...createdTasks], taskPlanEvents, effect: { type: 'createdTasks', tasks: createdTasks } };
}

function decisionBase(input: { decisionId: string; captureId: string; proposalId: string; kind: UserDecision['kind']; outcome: UserDecision['outcome']; at: string; bucket?: WorkflowBucket; edited?: ProposalEdit; effect: UserDecision['effect'] }): UserDecision {
  return {
    id: input.decisionId,
    captureId: input.captureId,
    proposalId: input.proposalId,
    kind: input.kind,
    outcome: input.outcome,
    bucket: input.bucket,
    edited: input.edited,
    appliedAt: input.at,
    status: 'applied',
    effect: input.effect,
  };
}

function undoDecision(data: DomainData, decision: UserDecision, at: string): DomainTransition {
  const proposal = data.proposals.find((item) => item.id === decision.proposalId);
  const capture = data.captures.find((item) => item.id === decision.captureId);
  if (!proposal || !capture) return failure(data, 'invalid_decision', '该决策缺少对应的捕捉或建议，无法撤销。');

  let tasks = data.tasks;
  let knowledgeCards = data.knowledgeCards;
  let taskPlanEvents = data.taskPlanEvents;
  const effect = decision.effect;
  if (effect.type === 'createdTasks') {
    const changed = effect.tasks.some((task) => !sameTask(findTask(data, task.id), task))
      || effect.tasks.some((task) => data.timeEntries.some((entry) => entry.taskId === task.id) || data.progressLogs.some((log) => log.taskId === task.id));
    if (changed) return failure(data, 'decision_not_reversible', '该决策产生的任务已有后续执行记录，不能安全撤销。');
    const ids = new Set(effect.tasks.map((task) => task.id));
    const cancelledEvents: TaskPlanEvent[] = [];
    tasks = data.tasks.map((task) => {
      if (!ids.has(task.id)) return task;
      const next: TaskItem = { ...task, bucket: 'archived', plannedDate: undefined, plannedStartAt: undefined, plannedEndAt: undefined, deletedAt: at };
      const compensated = data.taskPlanEvents.filter((event) => event.taskId === task.id && event.source === 'proposalDecision').map((event) => event.id);
      cancelledEvents.push(planEvent({ task, next, kind: 'cancelled', at, source: 'decisionUndo', compensatesEventIds: compensated }));
      return next;
    });
    taskPlanEvents = [...taskPlanEvents, ...cancelledEvents];
  }
  if (effect.type === 'mergedTask') {
    const current = findTask(data, effect.appliedTask.id);
    if (!sameTask(current, effect.appliedTask)) return failure(data, 'decision_not_reversible', '合并后的任务已被修改，不能安全撤销。');
    tasks = data.tasks.map((task) => task.id === effect.previousTask.id ? effect.previousTask : task);
    if (!samePlan(taskPlanSnapshot(effect.appliedTask), taskPlanSnapshot(effect.previousTask))) {
      const compensated = data.taskPlanEvents.filter((event) => event.taskId === effect.appliedTask.id && event.source === 'proposalDecision' && event.occurredAt === decision.appliedAt).map((event) => event.id);
      taskPlanEvents = [...taskPlanEvents, planEvent({ task: effect.appliedTask, next: effect.previousTask, kind: 'cancelled', at, source: 'decisionUndo', compensatesEventIds: compensated })];
    }
  }
  if (effect.type === 'createdKnowledge') {
    const changed = effect.cards.some((card) => !data.knowledgeCards.some((item) => JSON.stringify(item) === JSON.stringify(card)));
    if (changed) return failure(data, 'decision_not_reversible', '知识卡片已被修改，不能安全撤销。');
    const ids = new Set(effect.cards.map((card) => card.id));
    knowledgeCards = data.knowledgeCards.filter((card) => !ids.has(card.id));
  }

  return success({
    ...data,
    tasks,
    knowledgeCards,
    taskPlanEvents,
    captures: data.captures.map((item) => item.id === capture.id ? { ...item, pipelineState: 'proposed', failure: undefined } : item),
    proposals: data.proposals.map((item) => item.id === proposal.id ? { ...item, status: 'pending' } : item),
    decisions: data.decisions.map((item) => item.id === decision.id ? { ...item, status: 'reverted', revertedAt: at } : item),
  }, 'undoUserDecision');
}

export function reduceDomain(data: DomainData, action: DomainAction): DomainTransition {
  switch (action.type) {
    case 'captureCreated': {
      if (data.captures.some((capture) => capture.id === action.capture.id)) return failure(data, 'invalid_decision', '该捕捉已存在。');
      return success({ ...data, captures: [...data.captures, { ...action.capture, pipelineState: 'proposing', failure: undefined }] }, action.type);
    }
    case 'proposalRequested': {
      const capture = data.captures.find((item) => item.id === action.captureId);
      if (!capture || (capture.pipelineState !== 'proposalFailed' && capture.pipelineState !== 'captured')) {
        return failure(data, 'invalid_proposal', '该捕捉当前不能重新生成建议。');
      }
      return success({
        ...data,
        captures: data.captures.map((item) => item.id === action.captureId ? { ...item, pipelineState: 'proposing', failure: undefined } : item),
      }, action.type);
    }
    case 'proposalReceived': {
      const capture = data.captures.find((item) => item.id === action.captureId);
      if (!capture || capture.pipelineState !== 'proposing') return failure(data, 'invalid_proposal', '该捕捉当前不能接收建议。', true);
      if (!action.proposals.length || action.proposals.some((proposal) => proposal.captureId !== action.captureId || proposal.status !== 'pending')) {
        return failure(data, 'invalid_proposal', '建议结果无效，请重试。', true);
      }
      return success({
        ...data,
        captures: data.captures.map((item) => item.id === action.captureId ? { ...item, pipelineState: 'proposed', failure: undefined } : item),
        proposals: [...data.proposals, ...action.proposals],
      }, action.type);
    }
    case 'proposalFailed': {
      const capture = data.captures.find((item) => item.id === action.captureId);
      if (!capture) return failure(data, 'invalid_proposal', '找不到需要重试的捕捉。');
      return success({
        ...data,
        captures: data.captures.map((item) => item.id === action.captureId ? { ...item, pipelineState: 'proposalFailed', failure: action.failure } : item),
      }, action.type);
    }
    case 'submitUserDecision': {
      const proposal = data.proposals.find((item) => item.id === action.decision.proposalId);
      if (!proposal || proposal.status !== 'pending') return failure(data, 'invalid_decision', '这条建议已经处理，不能再次决定。');
      const capture = data.captures.find((item) => item.id === proposal.captureId);
      if (!capture || capture.pipelineState !== 'proposed') return failure(data, 'invalid_decision', '建议尚未准备好确认。');
      if (data.decisions.some((decision) => decision.id === action.decisionId)) return failure(data, 'invalid_decision', '该决策已存在。');

      if (action.decision.kind === 'ignore') {
        const decision = decisionBase({
          decisionId: action.decisionId, captureId: capture.id, proposalId: proposal.id, kind: 'ignore', outcome: 'ignored', at: action.at, effect: { type: 'ignored' },
        });
        return success({
          ...data,
          captures: resolveCapture(data, capture.id),
          proposals: markProposal(data, proposal.id, 'rejected'),
          decisions: [...data.decisions, decision],
        }, action.type, decision);
      }

      const { edited, bucket } = action.decision;
      const visibleClassification = resolveProposalVisibleClassification(proposal, edited);
      const waitingDetails = normalizeWaitingDetails(edited.waitingDetails ?? proposal.waitingDetails);
      const normalizedEdit: ProposalEdit = {
        ...edited,
        category: categoryForVisibleClassification(visibleClassification, edited.category),
        visibleClassification,
        waitingDetails: visibleClassification === 'waiting' ? waitingDetails : undefined,
      };
      if (!normalizedEdit.title.trim()) return failure(data, 'invalid_decision', '请填写有效标题。');
      if (visibleClassification === 'knowledge') {
        const summary = normalizedEdit.knowledgeSummary?.trim() || proposal.knowledgeSummary?.trim() || '';
        if (!summary) return failure(data, 'invalid_decision', '保存知识前请补充有效摘要。');
        const card = {
          id: `knowledge-${action.decisionId}`,
          title: normalizedEdit.title,
          summary,
          source: taskSource(capture),
          createdAt: action.at,
        };
        const decision = decisionBase({
          decisionId: action.decisionId, captureId: capture.id, proposalId: proposal.id, kind: 'accept', outcome: 'knowledge', at: action.at, edited: normalizedEdit, effect: { type: 'createdKnowledge', cards: [card] },
        });
        return success({
          ...data,
          captures: resolveCapture(data, capture.id),
          proposals: markProposal(data, proposal.id, 'accepted'),
          knowledgeCards: [...data.knowledgeCards, card],
          decisions: [...data.decisions, decision],
        }, action.type, decision);
      }
      const resolvedBucket = visibleClassification === 'waiting'
        ? 'waiting'
        : visibleClassification === 'someday'
          ? bucket ?? 'someday'
          : bucket ?? defaultSuggestedBucket(visibleClassification);
      if (!isTaskBucket(resolvedBucket)) return failure(data, 'invalid_decision', '任务建议需要选择今天、等待他人或稍后处理。');
      if (!Number.isInteger(normalizedEdit.estimatedMinutes) || normalizedEdit.estimatedMinutes < 5 || normalizedEdit.estimatedMinutes > 480) {
        return failure(data, 'invalid_decision', '确认任务前请填写 5～480 分钟的预计耗时。');
      }
      if (!normalizedEdit.nextAction.trim()) return failure(data, 'invalid_decision', '确认任务前请补充下一步行动。');
      if (resolvedBucket === 'waiting' && (!waitingDetails?.waitingFor || !waitingDetails.waitingOn || !isValidFollowUpDate(waitingDetails.followUpDate))) {
        return failure(data, 'invalid_follow_up', '请填写有效的等待对象、等待内容和跟进日期。');
      }
      if (action.decision.plannedDate && !isLocalDate(action.decision.plannedDate)) return failure(data, 'invalid_schedule', '计划日期无效。');
      const outcome = buildTaskOutcome({ data, proposal, capture, edit: normalizedEdit, bucket: resolvedBucket, waitingDetails, plannedDate: action.decision.plannedDate, decisionId: action.decisionId, at: action.at });
      if ('code' in outcome) return failure(data, outcome.code, outcome.message, outcome.retryable);
      const decision = decisionBase({
        decisionId: action.decisionId, captureId: capture.id, proposalId: proposal.id, kind: 'accept', outcome: 'task', bucket: resolvedBucket, edited: normalizedEdit, at: action.at, effect: outcome.effect,
      });
      return success({
        ...data,
        tasks: outcome.tasks,
        taskPlanEvents: [...data.taskPlanEvents, ...outcome.taskPlanEvents],
        captures: resolveCapture(data, capture.id),
        proposals: markProposal(data, proposal.id, 'accepted'),
        decisions: [...data.decisions, decision],
      }, action.type, decision);
    }
    case 'undoUserDecision': {
      const decision = data.decisions.find((item) => item.id === action.decisionId);
      if (!decision || decision.status !== 'applied') return failure(data, 'invalid_decision', '这条决策不能撤销。');
      return undoDecision(data, decision, action.at);
    }
    case 'startTask': {
      const task = findTask(data, action.taskId);
      if (!task || task.status === 'completed') return failure(data, 'task_not_found', '找不到可开始的任务。');
      return success({
        ...data,
        tasks: data.tasks.map((item) => item.id === action.taskId
          ? { ...item, status: 'inProgress' }
          : item.status === 'inProgress' ? { ...item, status: 'notStarted' } : item),
        progressLogs: appendLog(data, action.taskId, '开始执行任务', 'start', action.at),
      }, action.type);
    }
    case 'pauseTask': {
      const task = findTask(data, action.taskId);
      if (!task || task.status !== 'inProgress') return failure(data, 'invalid_decision', '只有进行中的任务可以暂停。');
      return success({
        ...data,
        tasks: data.tasks.map((item) => item.id === action.taskId ? { ...item, status: 'notStarted' } : item),
        progressLogs: appendLog(data, action.taskId, '暂停任务，保留当前进度', 'pause', action.at),
      }, action.type);
    }
    case 'completeTask': {
      const task = findTask(data, action.taskId);
      if (!task || task.status === 'completed') return failure(data, 'task_not_found', '找不到可完成的任务。');
      return success({
        ...data,
        tasks: data.tasks.map((item) => item.id === action.taskId ? { ...item, status: 'completed', completedAt: action.at } : item),
        progressLogs: appendLog(data, action.taskId, '完成任务', 'complete', action.at),
      }, action.type);
    }
    case 'moveTask': {
      const task = findTask(data, action.taskId);
      if (!task) return failure(data, 'task_not_found', '找不到需要移动的任务。');
      const targetDate = action.bucket === 'today' ? localDateOf(action.at) : undefined;
      const keepTimes = Boolean(targetDate && targetDate === task.plannedDate);
      const next: TaskItem = {
        ...task,
        bucket: action.bucket,
        plannedDate: targetDate,
        plannedStartAt: keepTimes ? task.plannedStartAt : undefined,
        plannedEndAt: keepTimes ? task.plannedEndAt : undefined,
      };
      if (samePlan(taskPlanSnapshot(task), taskPlanSnapshot(next))) return success(data, action.type);
      const kind: TaskPlanEventKind = action.bucket === 'someday' ? 'movedToSomeday' : targetDate ? (task.plannedDate ? 'rescheduled' : 'planned') : 'unscheduled';
      return success({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? next : item), taskPlanEvents: [...data.taskPlanEvents, planEvent({ task, next, kind, at: action.at })] }, action.type);
    }
    case 'recordTime': {
      if (!findTask(data, action.taskId)) return failure(data, 'task_not_found', '找不到需要记录耗时的任务。');
      if (!Number.isFinite(action.minutes) || action.minutes <= 0 || action.minutes > 1440) return failure(data, 'invalid_time', '耗时必须是大于 0 且不超过 1440 分钟的数值。');
      const endedAt = new Date(action.at);
      if (Number.isNaN(endedAt.getTime())) return failure(data, 'invalid_time', '耗时记录的时间无效。');
      const startedAt = addMinutes(endedAt, -action.minutes);
      return success({
        ...data,
        timeEntries: [...data.timeEntries, { id: runtimeId('time'), taskId: action.taskId, minutes: action.minutes, startedAt: toZonedISOString(startedAt), endedAt: toZonedISOString(endedAt) }],
      }, action.type);
    }
    case 'recordProgress': {
      if (!findTask(data, action.taskId)) return failure(data, 'task_not_found', '找不到需要记录进展的任务。');
      if (!action.text.trim()) return failure(data, 'invalid_decision', '进展内容不能为空。');
      return success({ ...data, progressLogs: appendLog(data, action.taskId, action.text.trim(), action.kind, action.at) }, action.type);
    }
    case 'recordInterruption': {
      if (!findTask(data, action.taskId)) return failure(data, 'task_not_found', '找不到需要记录打断的任务。');
      if (!action.text.trim()) return failure(data, 'invalid_decision', '打断内容不能为空。');
      return success({ ...data, progressLogs: appendLog(data, action.taskId, action.text.trim(), 'interrupt', action.at) }, action.type);
    }
    case 'planTaskForDate': {
      const task = findTask(data, action.taskId);
      if (!task || task.status === 'completed') return failure(data, 'task_not_found', '找不到可规划的任务。');
      if (!isLocalDate(action.date)) return failure(data, 'invalid_schedule', '计划日期无效。');
      if (task.plannedDate === action.date) return success(data, action.type);
      const next: TaskItem = { ...task, bucket: 'today', plannedDate: action.date, plannedStartAt: undefined, plannedEndAt: undefined };
      const kind: TaskPlanEventKind = task.plannedDate ? 'rescheduled' : 'planned';
      return success({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? next : item), taskPlanEvents: [...data.taskPlanEvents, planEvent({ task, next, kind, at: action.at })] }, action.type);
    }
    case 'scheduleTask': {
      const task = findTask(data, action.taskId);
      if (!task || task.status === 'completed') return failure(data, 'task_not_found', '找不到可排期的任务。');
      const validation = validateSchedule(action.startAt, action.endAt);
      if (!validation.valid) return failure(data, 'invalid_schedule', validation.message);
      const conflicts = findScheduleConflicts(data.tasks, task.id, action.startAt, action.endAt);
      if (conflicts.length && !action.allowConflict) return failure(data, 'schedule_conflict', `与“${conflicts.map((item) => item.title).join('、')}”时间冲突。`);
      const next: TaskItem = { ...task, bucket: 'today', plannedDate: validation.plannedDate, plannedStartAt: action.startAt, plannedEndAt: action.endAt };
      if (samePlan(taskPlanSnapshot(task), taskPlanSnapshot(next))) return success(data, action.type);
      const kind: TaskPlanEventKind = task.plannedStartAt || task.plannedDate !== validation.plannedDate ? 'rescheduled' : 'scheduled';
      return success({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? next : item), taskPlanEvents: [...data.taskPlanEvents, planEvent({ task, next, kind, at: action.at })] }, action.type);
    }
    case 'unscheduleTask': {
      const task = findTask(data, action.taskId);
      if (!task || task.status === 'completed') return failure(data, 'task_not_found', '找不到可取消排期的任务。');
      if (!task.plannedStartAt && !task.plannedEndAt) return success(data, action.type);
      const next: TaskItem = { ...task, plannedStartAt: undefined, plannedEndAt: undefined };
      return success({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? next : item), taskPlanEvents: [...data.taskPlanEvents, planEvent({ task, next, kind: 'unscheduled', at: action.at })] }, action.type);
    }
    case 'deferTask': {
      const task = findTask(data, action.taskId);
      if (!task || task.status === 'completed') return failure(data, 'task_not_found', '找不到可顺延的任务。');
      if ('date' in action.destination && !isLocalDate(action.destination.date)) return failure(data, 'invalid_schedule', '顺延日期无效。');
      const next: TaskItem = 'date' in action.destination
        ? { ...task, bucket: 'today', plannedDate: action.destination.date, plannedStartAt: undefined, plannedEndAt: undefined }
        : { ...task, bucket: 'someday', plannedDate: undefined, plannedStartAt: undefined, plannedEndAt: undefined };
      if (samePlan(taskPlanSnapshot(task), taskPlanSnapshot(next))) return success(data, action.type);
      const kind: TaskPlanEventKind = 'date' in action.destination ? 'deferred' : 'movedToSomeday';
      return success({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? next : item), taskPlanEvents: [...data.taskPlanEvents, planEvent({ task, next, kind, at: action.at })] }, action.type);
    }
    case 'deleteTask': {
      const task = findTask(data, action.taskId);
      if (!task) return failure(data, 'task_not_found', '找不到需要删除的任务。');
      const next: TaskItem = { ...task, bucket: 'archived', plannedDate: undefined, plannedStartAt: undefined, plannedEndAt: undefined, deletedAt: action.at };
      return success({
        ...data,
        tasks: data.tasks.map((item) => item.id === task.id ? next : item),
        taskPlanEvents: [...data.taskPlanEvents, planEvent({ task, next, kind: 'cancelled', at: action.at })],
      }, action.type);
    }
    case 'reorderTasks': {
      const currentIds = new Set(data.tasks.map((task) => task.id));
      if (action.taskIds.some((id) => !currentIds.has(id))) return failure(data, 'task_not_found', '排序中包含不存在的任务。');
      const positions = new Map(action.taskIds.map((id, index) => [id, index]));
      return success({ ...data, tasks: data.tasks.map((task) => positions.has(task.id) ? { ...task, sortIndex: positions.get(task.id)! } : task) }, action.type);
    }
    case 'restoreBackup':
      return success(action.data, action.type);
    default:
      return failure(data, 'invalid_decision', '未知领域动作。');
  }
}

export function domainReducer(data: DomainData, action: DomainAction): DomainData {
  return reduceDomain(data, action).data;
}

export function editProposal(proposal: AIProposal, title: string, category: TaskCategory, estimatedMinutes: number, nextAction: string, knowledgeSummary?: string, options?: Pick<ProposalEdit, 'visibleClassification' | 'waitingDetails'>): EditedProposal {
  return {
    title: title.trim() || proposal.title,
    category,
    estimatedMinutes: Math.max(0, estimatedMinutes),
    nextAction: nextAction.trim() || proposal.nextAction?.trim() || '',
    visibleClassification: options?.visibleClassification,
    waitingDetails: options?.waitingDetails,
    knowledgeSummary: knowledgeSummary?.trim() || proposal.knowledgeSummary?.trim() || undefined,
  };
}
