import { addDays, dateKey, stableId } from './date-utils';
import type { AIProposal, PipelineFailure, ProposalRequest, ProposalResult, ProposalService, ProposalTaskCandidate, TaskCategory, WaitingDetails } from './types';

const communicationPattern = /客户|回复|沟通|会议|报价|合同/;
const learningPattern = /学习|阅读|研究|课程|文档/;
const healthPattern = /药|体检|运动|健康|睡眠/;
const lifePattern = /快递|购物|家里|买|生活/;
const workPattern = /项目|需求|开发|完成|推进/;
const knowledgePattern = /笔记|沉淀|灵感|原则|复盘结论|经验/;
const somedayPattern = /稍后|下周|以后|有空再|暂缓/;
const waitingVerbPattern = /回复|确认|反馈/;
const leadingWaitingPattern = /^(?:等|等待)\s*([^，。,.!?！？]{1,12}?)(回复|确认|反馈)(.*)$/;

function extractWaitingDetails(text: string, createdAt: string): WaitingDetails | undefined {
  const leadingMatch = text.trim().match(leadingWaitingPattern);
  if (leadingMatch) {
    const [, waitingFor, verb, remaining] = leadingMatch;
    const waitingOn = remaining.trim() ? `${verb === '确认' ? '确认' : '确认'}${remaining.trim()}` : `${verb}结果`;
    return {
      waitingFor: waitingFor.trim(),
      waitingOn,
      followUpDate: dateKey(addDays(new Date(createdAt), 3)),
    };
  }

  if (/\b(?:等|等待)\b/.test(text) || /(?:对方|同事|老师|客户|供应商|物业).*(?:回复|确认|反馈)/.test(text)) {
    return {
      waitingFor: text.match(/(同事|老师|客户|供应商|物业|对方|朋友)/)?.[1] ?? '对方',
      waitingOn: '等待对方回复或确认',
      followUpDate: dateKey(addDays(new Date(createdAt), 3)),
    };
  }

  return undefined;
}

function classify(text: string): TaskCategory {
  if (communicationPattern.test(text)) return 'communication';
  if (learningPattern.test(text)) return 'learning';
  if (healthPattern.test(text)) return 'health';
  if (lifePattern.test(text)) return 'life';
  if (workPattern.test(text)) return 'work';
  return 'unknown';
}

function estimate(category: TaskCategory): number {
  if (category === 'work') return 45;
  if (category === 'learning') return 30;
  if (category === 'communication') return 20;
  return 25;
}

function findDuplicate(text: string, tasks: readonly ProposalTaskCandidate[]): ProposalTaskCandidate | undefined {
  const tokens = text.replace(/[，。,.!?！？]/g, ' ').split(/\s+/).filter((token) => token.length >= 2);
  return tasks.find((task) => tokens.some((token) => task.title.includes(token)));
}

export interface MockProposalServiceOptions {
  delayMs?: number;
  failure?: PipelineFailure;
}

export class MockProposalService implements ProposalService {
  readonly kind = 'mock' as const;
  private readonly delayMs: number;
  private readonly failure?: PipelineFailure;

  constructor(options: number | MockProposalServiceOptions = 420) {
    this.delayMs = typeof options === 'number' ? options : options.delayMs ?? 420;
    this.failure = typeof options === 'number' ? undefined : options.failure;
  }

  async propose(request: ProposalRequest): Promise<ProposalResult> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.failure) return { status: 'failure', failure: this.failure };

    const text = request.capture.rawText.trim();
    const isKnowledge = knowledgePattern.test(text);
    const waitingDetails = isKnowledge ? undefined : extractWaitingDetails(text, request.capture.createdAt);
    const isWaiting = Boolean(waitingDetails && (text.startsWith('等') || text.startsWith('等待') || waitingVerbPattern.test(text)));
    const isSomeday = !isKnowledge && !isWaiting && somedayPattern.test(text);
    const category = classify(text);
    const duplicate = findDuplicate(text, request.existingTaskCandidates);
    const splitTitles = !isKnowledge && /和|以及|\/|、/.test(text)
      ? text.split(/和|以及|\/|、/).map((part) => part.trim()).filter(Boolean)
      : undefined;
    const kind = duplicate ? 'merge' : splitTitles && splitTitles.length > 1 ? 'split' : 'create';
    const proposal: AIProposal = {
      id: stableId('proposal', `${request.capture.id}:${text}`),
      captureId: request.capture.id,
      outcome: isKnowledge ? 'knowledge' : 'task',
      title: isWaiting && waitingDetails ? `等待${waitingDetails.waitingFor}${waitingDetails.waitingOn}` : text.length > 28 ? `${text.slice(0, 28)}…` : text,
      category: isKnowledge ? 'learning' : category,
      estimatedMinutes: isKnowledge ? 0 : estimate(category),
      confidence: category === 'unknown' ? 0.58 : duplicate ? 0.94 : 0.88,
      reason: isKnowledge
        ? '识别到适合长期复用的经验或结论，建议沉淀为知识卡片。'
        : isWaiting
          ? '下一步取决于对方回复或处理，当前不需要你继续行动。'
          : isSomeday
            ? '输入表达了暂不安排的意图，建议先保存到稍后列表。'
        : duplicate
          ? `与“${duplicate.title}”内容相似，建议合并来源。`
          : category === 'unknown'
            ? '信息较少，先保留为未识别事项。'
            : '根据关键词、行动语气和当前任务上下文生成。',
      kind: isKnowledge ? 'create' : kind,
      status: 'pending',
      nextAction: isKnowledge
        ? '确认摘要后保存到知识卡片'
        : isWaiting && waitingDetails
          ? `等待${waitingDetails.waitingFor}回复，${waitingDetails.followUpDate} 跟进`
          : isSomeday
            ? '保留到稍后列表，合适时再安排'
            : splitTitles?.length ? `先处理：${splitTitles[0]}` : '确认后加入今天',
      suggestedBucket: isKnowledge ? undefined : isWaiting ? 'waiting' : isSomeday ? 'someday' : 'today',
      waitingDetails,
      knowledgeSummary: isKnowledge ? text : undefined,
      duplicateTaskId: isKnowledge ? undefined : duplicate?.id,
      splitTitles,
      provider: 'mock',
    };

    return { status: 'success', proposals: [proposal] };
  }
}
