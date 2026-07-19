export const DEMO_DATA_VERSION = 3 as const;

export type TaskStatus = 'notStarted' | 'inProgress' | 'completed';
export type TaskCategory = 'work' | 'communication' | 'learning' | 'life' | 'health' | 'unknown';
export type WorkflowBucket = 'inbox' | 'today' | 'waiting' | 'someday' | 'archived';
export type CaptureOutcome = 'task' | 'knowledge' | 'ignored';
export type SuggestedBucket = Extract<WorkflowBucket, 'today' | 'waiting' | 'someday'>;
export type VisibleClassification = TaskCategory | 'waiting' | 'someday' | 'knowledge';
export type ProposalOutcome = Exclude<CaptureOutcome, 'ignored'>;
export type ProposalKind = 'create' | 'merge' | 'split';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected';
export type ProgressKind = 'start' | 'pause' | 'progress' | 'interrupt' | 'complete';
export type ReviewPeriod = 'daily' | 'weekly' | 'monthly';
export type CalendarViewMode = 'day' | 'week' | 'month';
export type CalendarTaskEntryKind = 'planned' | 'unscheduled' | 'completed' | 'plannedCompleted';

export type CaptureSource = 'webText' | 'voice' | 'email' | 'feishu' | 'calendar' | 'shareExtension' | 'mobileShortcut';
export type CapturePipelineState = 'captured' | 'proposing' | 'proposed' | 'proposalFailed' | 'resolved';
export type PipelineFailureCode = 'empty_capture' | 'proposal_unavailable' | 'invalid_proposal' | 'invalid_decision' | 'task_not_found' | 'invalid_time' | 'invalid_schedule' | 'invalid_follow_up' | 'decision_not_reversible';

export interface PipelineFailure {
  code: PipelineFailureCode;
  message: string;
  retryable: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  category: TaskCategory;
  bucket: WorkflowBucket;
  estimatedMinutes: number;
  nextAction: string;
  sourceSummary: string;
  sortIndex: number;
  createdAt: string;
  completedAt?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  waitingDetails?: WaitingDetails;
}

export interface CalendarTaskEntry {
  task: TaskItem;
  date: string;
  kind: CalendarTaskEntryKind;
  plannedStartAt?: string;
  plannedEndAt?: string;
  completedAt?: string;
}

export interface WaitingDetails {
  waitingFor: string;
  waitingOn: string;
  followUpDate: string;
}

export interface InboxCapture {
  id: string;
  rawText: string;
  source: CaptureSource;
  createdAt: string;
  pipelineState: CapturePipelineState;
  failure?: PipelineFailure;
}

export interface AIProposal {
  id: string;
  captureId: string;
  outcome: ProposalOutcome;
  title: string;
  category: TaskCategory;
  estimatedMinutes: number;
  confidence: number;
  reason: string;
  kind: ProposalKind;
  status: ProposalStatus;
  nextAction: string;
  suggestedBucket?: SuggestedBucket;
  waitingDetails?: WaitingDetails;
  knowledgeSummary?: string;
  duplicateTaskId?: string;
  splitTitles?: string[];
}

export interface ProposalEdit {
  title: string;
  category: TaskCategory;
  estimatedMinutes: number;
  nextAction: string;
  visibleClassification?: VisibleClassification;
  waitingDetails?: WaitingDetails;
  knowledgeSummary?: string;
}

export type UserDecisionInput =
  | { kind: 'accept'; proposalId: string; edited: ProposalEdit; bucket?: WorkflowBucket }
  | { kind: 'ignore'; proposalId: string };

export type DecisionEffect =
  | { type: 'createdTasks'; tasks: TaskItem[] }
  | { type: 'mergedTask'; previousTask: TaskItem; appliedTask: TaskItem }
  | { type: 'createdKnowledge'; cards: KnowledgeCard[] }
  | { type: 'ignored' };

export interface UserDecision {
  id: string;
  captureId: string;
  proposalId: string;
  kind: UserDecisionInput['kind'];
  outcome: CaptureOutcome;
  bucket?: WorkflowBucket;
  edited?: ProposalEdit;
  appliedAt: string;
  status: 'applied' | 'reverted';
  revertedAt?: string;
  effect: DecisionEffect;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
}

export interface ProgressLog {
  id: string;
  taskId: string;
  createdAt: string;
  text: string;
  kind: ProgressKind;
}

export interface KnowledgeCard {
  id: string;
  title: string;
  summary: string;
  source: string;
  createdAt: string;
}

export interface DomainData {
  version: typeof DEMO_DATA_VERSION;
  tasks: TaskItem[];
  captures: InboxCapture[];
  proposals: AIProposal[];
  decisions: UserDecision[];
  timeEntries: TimeEntry[];
  progressLogs: ProgressLog[];
  knowledgeCards: KnowledgeCard[];
}

export interface ReviewFacts {
  period: ReviewPeriod;
  startAt: string;
  endAt: string;
  taskCount: number;
  completedCount: number;
  actualMinutes: number;
  interruptions: number;
  categoryMinutes: { category: TaskCategory; minutes: number }[];
}

export interface ReviewSummary extends ReviewFacts {
  total: number;
  completed: number;
  completionRate: number;
  headline: string;
  suggestion: string;
}

export interface ReviewExplanationService {
  explain(facts: Readonly<ReviewFacts>): Promise<{ narrative: string }>;
}

export interface ProposalRequest {
  capture: Readonly<InboxCapture>;
  existingTasks: readonly TaskItem[];
}

export type ProposalResult =
  | { status: 'success'; proposals: AIProposal[] }
  | { status: 'failure'; failure: PipelineFailure };

export interface ProposalService {
  propose(request: ProposalRequest): Promise<ProposalResult>;
}

export const categoryLabels: Record<TaskCategory, string> = {
  work: '工作推进',
  communication: '沟通跟进',
  learning: '学习研究',
  life: '生活事务',
  health: '健康',
  unknown: '未识别',
};

export const visibleClassificationLabels: Record<VisibleClassification, string> = {
  ...categoryLabels,
  waiting: '等待他人',
  someday: '稍后处理',
  knowledge: '知识沉淀',
};

export const statusLabels: Record<TaskStatus, string> = {
  notStarted: '未开始',
  inProgress: '进行中',
  completed: '已完成',
};

export const bucketLabels: Record<WorkflowBucket, string> = {
  inbox: '收件箱',
  today: '今天',
  waiting: '等待他人',
  someday: '稍后处理',
  archived: '归档',
};

export const captureSourceLabels: Record<CaptureSource, string> = {
  webText: 'Web 文本',
  voice: '语音',
  email: '邮件',
  feishu: '飞书',
  calendar: '日历',
  shareExtension: '分享扩展',
  mobileShortcut: '移动端快捷入口',
};
