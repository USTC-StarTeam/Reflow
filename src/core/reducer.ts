import { addMinutes, runtimeId } from './date-utils';
import { captureSourceLabels, type AIProposal, type DomainData, type InboxCapture, type PipelineFailure, type ProgressKind, type ProposalEdit, type TaskCategory, type TaskItem, type UserDecision, type UserDecisionInput, type WorkflowBucket } from './types';

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
  | { type: 'moveTask'; taskId: string; bucket: WorkflowBucket }
  | { type: 'recordTime'; taskId: string; minutes: number; at: string }
  | { type: 'recordProgress'; taskId: string; text: string; kind: ProgressKind; at: string }
  | { type: 'recordInterruption'; taskId: string; text: string; at: string }
  | { type: 'scheduleTask'; taskId: string; startAt: string; endAt: string }
  | { type: 'deleteTask'; taskId: string }
  | { type: 'reorderTasks'; taskIds: string[] };

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
  return data.tasks.find((task) => task.id === taskId);
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
  decisionId: string;
  at: string;
}): { tasks: TaskItem[]; effect: UserDecision['effect'] } | PipelineFailure {
  const { data, proposal, capture, edit, bucket, decisionId, at } = input;
  if (proposal.kind === 'merge') {
    const previousTask = proposal.duplicateTaskId ? findTask(data, proposal.duplicateTaskId) : undefined;
    if (!previousTask) return { code: 'task_not_found', message: '要合并的任务已不存在。', retryable: false };
    const appliedTask: TaskItem = {
      ...previousTask,
      bucket,
      sourceSummary: `${previousTask.sourceSummary} + ${taskSource(capture)}`,
    };
    return {
      tasks: data.tasks.map((task) => task.id === previousTask.id ? appliedTask : task),
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
  }));
  return { tasks: [...data.tasks, ...createdTasks], effect: { type: 'createdTasks', tasks: createdTasks } };
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
  const effect = decision.effect;
  if (effect.type === 'createdTasks') {
    const changed = effect.tasks.some((task) => !sameTask(findTask(data, task.id), task))
      || effect.tasks.some((task) => data.timeEntries.some((entry) => entry.taskId === task.id) || data.progressLogs.some((log) => log.taskId === task.id));
    if (changed) return failure(data, 'decision_not_reversible', '该决策产生的任务已有后续执行记录，不能安全撤销。');
    const ids = new Set(effect.tasks.map((task) => task.id));
    tasks = data.tasks.filter((task) => !ids.has(task.id));
  }
  if (effect.type === 'mergedTask') {
    const current = findTask(data, effect.appliedTask.id);
    if (!sameTask(current, effect.appliedTask)) return failure(data, 'decision_not_reversible', '合并后的任务已被修改，不能安全撤销。');
    tasks = data.tasks.map((task) => task.id === effect.previousTask.id ? effect.previousTask : task);
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
      if (proposal.outcome === 'knowledge') {
        const card = {
          id: `knowledge-${action.decisionId}`,
          title: edited.title,
          summary: edited.knowledgeSummary?.trim() || proposal.knowledgeSummary || edited.nextAction,
          source: taskSource(capture),
          createdAt: action.at,
        };
        const decision = decisionBase({
          decisionId: action.decisionId, captureId: capture.id, proposalId: proposal.id, kind: 'accept', outcome: 'knowledge', at: action.at, edited, effect: { type: 'createdKnowledge', cards: [card] },
        });
        return success({
          ...data,
          captures: resolveCapture(data, capture.id),
          proposals: markProposal(data, proposal.id, 'accepted'),
          knowledgeCards: [...data.knowledgeCards, card],
          decisions: [...data.decisions, decision],
        }, action.type, decision);
      }
      if (!isTaskBucket(bucket)) return failure(data, 'invalid_decision', '任务建议需要选择今天、等待他人或稍后处理。');
      const outcome = buildTaskOutcome({ data, proposal, capture, edit: edited, bucket, decisionId: action.decisionId, at: action.at });
      if ('code' in outcome) return failure(data, outcome.code, outcome.message, outcome.retryable);
      const decision = decisionBase({
        decisionId: action.decisionId, captureId: capture.id, proposalId: proposal.id, kind: 'accept', outcome: 'task', bucket, edited, at: action.at, effect: outcome.effect,
      });
      return success({
        ...data,
        tasks: outcome.tasks,
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
          ? { ...item, status: 'inProgress', bucket: 'today' }
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
      if (!findTask(data, action.taskId)) return failure(data, 'task_not_found', '找不到需要移动的任务。');
      return success({ ...data, tasks: data.tasks.map((task) => task.id === action.taskId ? { ...task, bucket: action.bucket } : task) }, action.type);
    }
    case 'recordTime': {
      if (!findTask(data, action.taskId)) return failure(data, 'task_not_found', '找不到需要记录耗时的任务。');
      if (!Number.isFinite(action.minutes) || action.minutes <= 0) return failure(data, 'invalid_time', '耗时必须是大于 0 的分钟数。');
      const endedAt = new Date(action.at);
      if (Number.isNaN(endedAt.getTime())) return failure(data, 'invalid_time', '耗时记录的时间无效。');
      const startedAt = addMinutes(endedAt, -action.minutes);
      return success({
        ...data,
        timeEntries: [...data.timeEntries, { id: runtimeId('time'), taskId: action.taskId, minutes: action.minutes, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() }],
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
    case 'scheduleTask': {
      if (!findTask(data, action.taskId)) return failure(data, 'task_not_found', '找不到需要排期的任务。');
      const start = new Date(action.startAt);
      const end = new Date(action.endAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return failure(data, 'invalid_schedule', '计划结束时间必须晚于开始时间。');
      return success({ ...data, tasks: data.tasks.map((task) => task.id === action.taskId ? { ...task, bucket: 'today', plannedStartAt: action.startAt, plannedEndAt: action.endAt } : task) }, action.type);
    }
    case 'deleteTask': {
      if (!findTask(data, action.taskId)) return failure(data, 'task_not_found', '找不到需要删除的任务。');
      return success({
        ...data,
        tasks: data.tasks.filter((task) => task.id !== action.taskId),
        timeEntries: data.timeEntries.filter((entry) => entry.taskId !== action.taskId),
        progressLogs: data.progressLogs.filter((log) => log.taskId !== action.taskId),
      }, action.type);
    }
    case 'reorderTasks': {
      const currentIds = new Set(data.tasks.map((task) => task.id));
      if (action.taskIds.some((id) => !currentIds.has(id))) return failure(data, 'task_not_found', '排序中包含不存在的任务。');
      const positions = new Map(action.taskIds.map((id, index) => [id, index]));
      return success({ ...data, tasks: data.tasks.map((task) => positions.has(task.id) ? { ...task, sortIndex: positions.get(task.id)! } : task) }, action.type);
    }
    default:
      return failure(data, 'invalid_decision', '未知领域动作。');
  }
}

export function domainReducer(data: DomainData, action: DomainAction): DomainData {
  return reduceDomain(data, action).data;
}

export function editProposal(proposal: AIProposal, title: string, category: TaskCategory, estimatedMinutes: number, nextAction: string, knowledgeSummary?: string): EditedProposal {
  return {
    title: title.trim() || proposal.title,
    category,
    estimatedMinutes: Math.max(0, estimatedMinutes),
    nextAction: nextAction.trim() || proposal.nextAction,
    knowledgeSummary: knowledgeSummary?.trim() || proposal.knowledgeSummary,
  };
}
