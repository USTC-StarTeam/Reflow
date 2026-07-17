import { stableId } from './date-utils';
import type { AIProposal, InboxCapture, ProposalService, TaskCategory, TaskItem } from './types';

function classify(text: string): TaskCategory {
  if (/客户|回复|沟通|会议|报价|合同/.test(text)) return 'communication';
  if (/学习|阅读|研究|课程|文档/.test(text)) return 'learning';
  if (/药|体检|运动|健康|睡眠/.test(text)) return 'health';
  if (/快递|购物|家里|买|生活/.test(text)) return 'life';
  if (/项目|需求|开发|完成|推进/.test(text)) return 'work';
  return 'unknown';
}

function estimate(category: TaskCategory): number {
  if (category === 'work') return 45;
  if (category === 'learning') return 30;
  if (category === 'communication') return 20;
  return 25;
}

function findDuplicate(text: string, tasks: TaskItem[]): TaskItem | undefined {
  const tokens = text.replace(/[，。,.!?！？]/g, ' ').split(/\s+/).filter((token) => token.length >= 2);
  return tasks.find((task) => tokens.some((token) => task.title.includes(token)));
}

export class MockProposalService implements ProposalService {
  constructor(private readonly delayMs = 420) {}

  async propose(capture: InboxCapture, tasks: TaskItem[] = []): Promise<AIProposal[]> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    const text = capture.rawText.trim();
    const category = classify(text);
    const duplicate = findDuplicate(text, tasks);
    const splitTitles = /和|以及|\/|、/.test(text)
      ? text.split(/和|以及|\/|、/).map((part) => part.trim()).filter(Boolean)
      : undefined;
    const kind = duplicate ? 'merge' : splitTitles && splitTitles.length > 1 ? 'split' : 'create';

    return [{
      id: stableId('proposal', text),
      captureId: capture.id,
      outcome: 'task',
      title: text.length > 28 ? `${text.slice(0, 28)}…` : text,
      category,
      estimatedMinutes: estimate(category),
      confidence: category === 'unknown' ? 0.58 : duplicate ? 0.94 : 0.88,
      reason: duplicate
        ? `与“${duplicate.title}”内容相似，建议合并来源。`
        : category === 'unknown'
          ? '信息较少，先保留为未识别事项。'
          : '根据关键词、行动语气和当前任务上下文生成。',
      kind,
      status: 'pending',
      nextAction: splitTitles?.length ? `先处理：${splitTitles[0]}` : '确认后加入今天',
      duplicateTaskId: duplicate?.id,
      splitTitles,
    }];
  }
}
