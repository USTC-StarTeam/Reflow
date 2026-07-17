export const DEMO_DATA_VERSION = 1 as const;

export type TaskStatus = 'notStarted' | 'inProgress' | 'completed';
export type TaskCategory = 'work' | 'communication' | 'learning' | 'life' | 'health' | 'unknown';
export type WorkflowBucket = 'inbox' | 'today' | 'waiting' | 'someday' | 'archived';
export type CaptureOutcome = 'task' | 'knowledge' | 'ignored';
export type ProposalKind = 'create' | 'merge' | 'split';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected';
export type ProgressKind = 'start' | 'pause' | 'progress' | 'interrupt' | 'complete';
export type ReviewPeriod = 'daily' | 'weekly' | 'monthly';
export type CalendarViewMode = 'day' | 'week' | 'month';

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
}

export interface InboxCapture {
  id: string;
  rawText: string;
  source: '手动输入' | '邮件' | '飞书' | '语音';
  createdAt: string;
  parseStatus: 'organizing' | 'organized' | 'resolved';
}

export interface AIProposal {
  id: string;
  captureId: string;
  outcome: CaptureOutcome;
  title: string;
  category: TaskCategory;
  estimatedMinutes: number;
  confidence: number;
  reason: string;
  kind: ProposalKind;
  status: ProposalStatus;
  nextAction: string;
  duplicateTaskId?: string;
  splitTitles?: string[];
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
}

export interface DomainData {
  version: typeof DEMO_DATA_VERSION;
  tasks: TaskItem[];
  captures: InboxCapture[];
  proposals: AIProposal[];
  timeEntries: TimeEntry[];
  progressLogs: ProgressLog[];
  knowledgeCards: KnowledgeCard[];
}

export interface ReviewSummary {
  period: ReviewPeriod;
  total: number;
  completed: number;
  completionRate: number;
  actualMinutes: number;
  interruptions: number;
  categoryMinutes: { category: TaskCategory; minutes: number }[];
  headline: string;
  suggestion: string;
}

export interface ProposalService {
  propose(capture: InboxCapture, tasks?: TaskItem[]): Promise<AIProposal[]>;
}

export const categoryLabels: Record<TaskCategory, string> = {
  work: '工作推进',
  communication: '沟通跟进',
  learning: '学习研究',
  life: '生活事务',
  health: '健康',
  unknown: '未识别',
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
