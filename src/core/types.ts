export const DEMO_DATA_VERSION = 4 as const;

export type LocalDate = string;
export type ZonedDateTime = string;

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
export type TaskPlanEventKind = 'planned' | 'scheduled' | 'rescheduled' | 'deferred' | 'unscheduled' | 'movedToSomeday' | 'cancelled';
export type TaskPlanEventSource = 'user' | 'proposalDecision' | 'migration' | 'decisionUndo';

export type CaptureSource = 'webText' | 'voice' | 'email' | 'feishu' | 'calendar' | 'shareExtension' | 'mobileShortcut';
export type CapturePipelineState = 'captured' | 'proposing' | 'proposed' | 'proposalFailed' | 'resolved';
export type PipelineFailureCode = 'empty_capture' | 'proposal_timeout' | 'proposal_rate_limited' | 'proposal_refused' | 'proposal_unavailable' | 'invalid_proposal' | 'invalid_decision' | 'task_not_found' | 'invalid_time' | 'invalid_schedule' | 'schedule_conflict' | 'invalid_follow_up' | 'decision_not_reversible' | 'invalid_backup';

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
  createdAt: ZonedDateTime;
  completedAt?: ZonedDateTime;
  deletedAt?: ZonedDateTime;
  plannedDate?: LocalDate;
  plannedStartAt?: ZonedDateTime;
  plannedEndAt?: ZonedDateTime;
  waitingDetails?: WaitingDetails;
}

export interface TaskPlanSnapshot {
  plannedDate?: LocalDate;
  plannedStartAt?: ZonedDateTime;
  plannedEndAt?: ZonedDateTime;
  bucket?: WorkflowBucket;
}

export interface TaskPlanEvent {
  id: string;
  taskId: string;
  kind: TaskPlanEventKind;
  occurredAt: ZonedDateTime;
  before: TaskPlanSnapshot;
  after: TaskPlanSnapshot;
  source: TaskPlanEventSource;
  compensatesEventIds?: string[];
}

export interface CalendarTaskEntry {
  task: TaskItem;
  date: LocalDate;
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

export interface WaitingDetailsDraft {
  waitingFor: string | null;
  waitingOn: string | null;
  followUpDate: LocalDate | null;
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
  estimatedMinutes: number | null;
  confidence: number;
  reason: string;
  kind: ProposalKind;
  status: ProposalStatus;
  nextAction: string | null;
  suggestedBucket?: SuggestedBucket;
  suggestedDate?: LocalDate;
  waitingDetails?: WaitingDetailsDraft | null;
  knowledgeSummary?: string | null;
  duplicateTaskId?: string;
  splitTitles?: string[];
  provider?: ProposalServiceKind;
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
  | { kind: 'accept'; proposalId: string; edited: ProposalEdit; bucket?: WorkflowBucket; plannedDate?: LocalDate }
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
  taskPlanEvents: TaskPlanEvent[];
  knowledgeCards: KnowledgeCard[];
}

export interface DailyTaskOutcome {
  taskId: string;
  outcome: 'completedAsPlanned' | 'deferred' | 'unfinished' | 'deleted';
  deferredTo?: LocalDate | 'someday';
}

export interface DailyReviewFacts {
  date: LocalDate;
  plannedCount: number;
  completedAsPlannedCount: number;
  completedTotalCount: number;
  extraCompletedCount: number;
  unfinishedCount: number;
  plannedCompletionRate: number;
  taskOutcomes: DailyTaskOutcome[];
  actualMinutes: number;
  interruptions: number;
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

export type ProposalServiceKind = 'mock' | 'cloud';

export interface ProposalTaskCandidate {
  id: string;
  title: string;
}

export interface ProposalRequest {
  capture: Readonly<Pick<InboxCapture, 'id' | 'rawText' | 'source' | 'createdAt'>>;
  context: Readonly<{
    referenceDate: LocalDate;
    timeZone: string;
    locale: 'zh-CN';
  }>;
  existingTaskCandidates: readonly ProposalTaskCandidate[];
}

export type ProposalResult =
  | { status: 'success'; proposals: AIProposal[] }
  | { status: 'failure'; failure: PipelineFailure };

export interface ProposalService {
  readonly kind?: ProposalServiceKind;
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
