import { stableId } from './date-utils';
import type { AIProposal, PipelineFailure, ProposalRequest, ProposalResult, ProposalService, TaskCategory, TaskItem } from './types';

const communicationPattern = /客户|回复|沟通|会议|报价|合同/;
const learningPattern = /学习|阅读|研究|课程|文档/;
const healthPattern = /药|体检|运动|健康|睡眠/;
const lifePattern = /快递|购物|家里|买|生活/;
const workPattern = /项目|需求|开发|完成|推进/;
const knowledgePattern = /笔记|沉淀|灵感|原则|复盘结论|经验/;

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

function findDuplicate(text: string, tasks: readonly TaskItem[]): TaskItem | undefined {
  const tokens = text.replace(/[，。,.!?！？]/g, ' ').split(/\s+/).filter((token) => token.length >= 2);
  return tasks.find((task) => tokens.some((token) => task.title.includes(token)));
}

export interface MockProposalServiceOptions {
  delayMs?: number;
  failure?: PipelineFailure;
}

export class MockProposalService implements ProposalService {
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
    const category = classify(text);
    const isKnowledge = knowledgePattern.test(text);
    const duplicate = findDuplicate(text, request.existingTasks);
    const splitTitles = !isKnowledge && /和|以及|\/|、/.test(text)
      ? text.split(/和|以及|\/|、/).map((part) => part.trim()).filter(Boolean)
      : undefined;
    const kind = duplicate ? 'merge' : splitTitles && splitTitles.length > 1 ? 'split' : 'create';
    const proposal: AIProposal = {
      id: stableId('proposal', `${request.capture.id}:${text}`),
      captureId: request.capture.id,
      outcome: isKnowledge ? 'knowledge' : 'task',
      title: text.length > 28 ? `${text.slice(0, 28)}…` : text,
      category: isKnowledge ? 'learning' : category,
      estimatedMinutes: isKnowledge ? 0 : estimate(category),
      confidence: category === 'unknown' ? 0.58 : duplicate ? 0.94 : 0.88,
      reason: isKnowledge
        ? '识别到适合长期复用的经验或结论，建议沉淀为知识卡片。'
        : duplicate
          ? `与“${duplicate.title}”内容相似，建议合并来源。`
          : category === 'unknown'
            ? '信息较少，先保留为未识别事项。'
            : '根据关键词、行动语气和当前任务上下文生成。',
      kind: isKnowledge ? 'create' : kind,
      status: 'pending',
      nextAction: isKnowledge ? '确认摘要后保存到知识卡片' : splitTitles?.length ? `先处理：${splitTitles[0]}` : '确认后加入今天',
      knowledgeSummary: isKnowledge ? text : undefined,
      duplicateTaskId: isKnowledge ? undefined : duplicate?.id,
      splitTitles,
    };

    return { status: 'success', proposals: [proposal] };
  }
}
