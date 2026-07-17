import { addMinutes, runtimeId } from './date-utils';
import type { AIProposal, DomainData, InboxCapture, ProgressKind, TaskCategory, WorkflowBucket } from './types';

export type EditedProposal = Pick<AIProposal, 'title' | 'category' | 'estimatedMinutes' | 'nextAction'>;

export type DomainAction =
  | { type: 'captureOrganized'; capture: InboxCapture; proposals: AIProposal[] }
  | { type: 'acceptProposal'; proposalId: string; edited: EditedProposal; bucket: WorkflowBucket; at: string }
  | { type: 'rejectProposal'; proposalId: string }
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

function resolveCapture(data: DomainData, captureId: string): InboxCapture[] {
  return data.captures.map((capture) => capture.id === captureId ? { ...capture, parseStatus: 'resolved' } : capture);
}

function markProposal(data: DomainData, proposalId: string, status: 'accepted' | 'rejected') {
  return data.proposals.map((proposal) => proposal.id === proposalId ? { ...proposal, status } : proposal);
}

function appendLog(data: DomainData, taskId: string, text: string, kind: ProgressKind, at: string) {
  return [...data.progressLogs, { id: runtimeId('log'), taskId, text, kind, createdAt: at }];
}

export function domainReducer(data: DomainData, action: DomainAction): DomainData {
  switch (action.type) {
    case 'captureOrganized':
      return { ...data, captures: [...data.captures, { ...action.capture, parseStatus: 'organized' }], proposals: [...data.proposals, ...action.proposals] };
    case 'acceptProposal': {
      const proposal = data.proposals.find((item) => item.id === action.proposalId);
      if (!proposal || proposal.status !== 'pending') return data;
      const capture = data.captures.find((item) => item.id === proposal.captureId);
      if (proposal.kind === 'merge' && proposal.duplicateTaskId) {
        return {
          ...data,
          tasks: data.tasks.map((task) => task.id === proposal.duplicateTaskId
            ? { ...task, bucket: action.bucket, sourceSummary: `${task.sourceSummary} + ${capture?.source ?? '新来源'}` }
            : task),
          captures: resolveCapture(data, proposal.captureId),
          proposals: markProposal(data, proposal.id, 'accepted'),
        };
      }
      const titles = proposal.kind === 'split' && proposal.splitTitles?.length && action.edited.title === proposal.title
        ? proposal.splitTitles
        : [action.edited.title];
      const maxSort = data.tasks.reduce((max, task) => Math.max(max, task.sortIndex), -1);
      const tasks = titles.map((title, index) => ({
        id: runtimeId(`task-${index}`),
        title,
        status: 'notStarted' as const,
        category: action.edited.category,
        bucket: action.bucket,
        estimatedMinutes: Math.max(5, Math.round(action.edited.estimatedMinutes / titles.length)),
        nextAction: action.edited.nextAction,
        sourceSummary: capture?.source ?? '手动输入',
        sortIndex: maxSort + index + 1,
        createdAt: action.at,
      }));
      return {
        ...data,
        tasks: [...data.tasks, ...tasks],
        captures: resolveCapture(data, proposal.captureId),
        proposals: markProposal(data, proposal.id, 'accepted'),
      };
    }
    case 'rejectProposal': {
      const proposal = data.proposals.find((item) => item.id === action.proposalId);
      if (!proposal || proposal.status !== 'pending') return data;
      return { ...data, captures: resolveCapture(data, proposal.captureId), proposals: markProposal(data, proposal.id, 'rejected') };
    }
    case 'startTask':
      return {
        ...data,
        tasks: data.tasks.map((task) => task.id === action.taskId
          ? { ...task, status: 'inProgress', bucket: 'today' }
          : task.status === 'inProgress' ? { ...task, status: 'notStarted' } : task),
        progressLogs: appendLog(data, action.taskId, '开始执行任务', 'start', action.at),
      };
    case 'pauseTask':
      return {
        ...data,
        tasks: data.tasks.map((task) => task.id === action.taskId && task.status === 'inProgress' ? { ...task, status: 'notStarted' } : task),
        progressLogs: appendLog(data, action.taskId, '暂停任务，保留当前进度', 'pause', action.at),
      };
    case 'completeTask':
      return {
        ...data,
        tasks: data.tasks.map((task) => task.id === action.taskId ? { ...task, status: 'completed', completedAt: action.at } : task),
        progressLogs: appendLog(data, action.taskId, '完成任务', 'complete', action.at),
      };
    case 'moveTask':
      return { ...data, tasks: data.tasks.map((task) => task.id === action.taskId ? { ...task, bucket: action.bucket } : task) };
    case 'recordTime': {
      const endedAt = new Date(action.at);
      const startedAt = addMinutes(endedAt, -action.minutes);
      return {
        ...data,
        timeEntries: [...data.timeEntries, { id: runtimeId('time'), taskId: action.taskId, minutes: action.minutes, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() }],
      };
    }
    case 'recordProgress':
      return { ...data, progressLogs: appendLog(data, action.taskId, action.text, action.kind, action.at) };
    case 'recordInterruption':
      return { ...data, progressLogs: appendLog(data, action.taskId, action.text, 'interrupt', action.at) };
    case 'scheduleTask':
      return { ...data, tasks: data.tasks.map((task) => task.id === action.taskId ? { ...task, bucket: 'today', plannedStartAt: action.startAt, plannedEndAt: action.endAt } : task) };
    case 'deleteTask':
      return { ...data, tasks: data.tasks.filter((task) => task.id !== action.taskId), timeEntries: data.timeEntries.filter((entry) => entry.taskId !== action.taskId), progressLogs: data.progressLogs.filter((log) => log.taskId !== action.taskId) };
    case 'reorderTasks': {
      const positions = new Map(action.taskIds.map((id, index) => [id, index]));
      return { ...data, tasks: data.tasks.map((task) => positions.has(task.id) ? { ...task, sortIndex: positions.get(task.id)! } : task) };
    }
    default:
      return data;
  }
}

export function editProposal(proposal: AIProposal, title: string, category: TaskCategory, estimatedMinutes: number, nextAction: string): EditedProposal {
  return { title: title.trim() || proposal.title, category, estimatedMinutes, nextAction: nextAction.trim() || proposal.nextAction };
}
