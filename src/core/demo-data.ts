import { addDays, addMinutes, atTime, dateKey } from './date-utils';
import { DEMO_DATA_VERSION, type DomainData } from './types';

export function createSeedData(baseDate = new Date()): DomainData {
  const today = new Date(baseDate);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const workStart = atTime(today, 10);
  const quoteStart = atTime(today, 16);
  const lifeStart = atTime(today, 18, 30);

  return {
    version: DEMO_DATA_VERSION,
    tasks: [
      {
        id: 'task-reflow-demo', title: '完成 Reflow Demo 页面结构', status: 'inProgress', category: 'work',
        bucket: 'today', estimatedMinutes: 90, nextAction: '补齐收件箱确认流程', sourceSummary: '手动输入', sortIndex: 0,
        createdAt: atTime(yesterday, 19).toISOString(), plannedStartAt: workStart.toISOString(),
        plannedEndAt: addMinutes(workStart, 90).toISOString(),
      },
      {
        id: 'task-client-quote', title: '16:30 前跟进客户报价', status: 'notStarted', category: 'communication',
        bucket: 'today', estimatedMinutes: 30, nextAction: '确认预算口径并回复客户', sourceSummary: '飞书 + 邮件', sortIndex: 1,
        createdAt: atTime(today, 8, 40).toISOString(), plannedStartAt: quoteStart.toISOString(),
        plannedEndAt: addMinutes(quoteStart, 30).toISOString(),
      },
      {
        id: 'task-inbox-cleanup', title: '晨间整理收件箱', status: 'completed', category: 'work', bucket: 'today',
        estimatedMinutes: 15, nextAction: '无', sourceSummary: '每日例行', sortIndex: 2,
        createdAt: atTime(today, 8).toISOString(), completedAt: atTime(today, 9, 25).toISOString(),
        plannedStartAt: atTime(today, 9, 10).toISOString(), plannedEndAt: atTime(today, 9, 25).toISOString(),
      },
      {
        id: 'task-expo-reading', title: '阅读 Expo Router 版本文档', status: 'notStarted', category: 'learning',
        bucket: 'today', estimatedMinutes: 30, nextAction: '整理静态导出注意事项', sourceSummary: '手动输入', sortIndex: 3,
        createdAt: atTime(today, 9).toISOString(), plannedStartAt: atTime(tomorrow, 9, 30).toISOString(),
        plannedEndAt: atTime(tomorrow, 10).toISOString(),
      },
      {
        id: 'task-pickup-medicine', title: '取快递并买药', status: 'notStarted', category: 'life', bucket: 'today',
        estimatedMinutes: 25, nextAction: '下班后经过驿站', sourceSummary: '语音记录', sortIndex: 4,
        createdAt: atTime(today, 9, 5).toISOString(), plannedStartAt: lifeStart.toISOString(),
        plannedEndAt: addMinutes(lifeStart, 25).toISOString(),
      },
    ],
    captures: [
      { id: 'capture-contract', rawText: '合同条款今晚前审阅，注意付款周期', source: 'email', createdAt: atTime(today, 11, 20).toISOString(), pipelineState: 'proposed' },
      { id: 'capture-health', rawText: '买药和预约体检', source: 'voice', createdAt: atTime(today, 11, 42).toISOString(), pipelineState: 'proposed' },
      { id: 'capture-duplicate-quote', rawText: '客户报价今天必须确认', source: 'email', createdAt: atTime(today, 12, 5).toISOString(), pipelineState: 'proposed' },
      { id: 'capture-waiting', rawText: '等供应商确认送货时间', source: 'webText', createdAt: atTime(today, 12, 20).toISOString(), pipelineState: 'proposed' },
      { id: 'capture-someday', rawText: '下周再整理旅行报销材料', source: 'webText', createdAt: atTime(today, 12, 30).toISOString(), pipelineState: 'proposed' },
      { id: 'capture-knowledge', rawText: '沉淀报价沟通原则：先确认预算口径', source: 'webText', createdAt: atTime(today, 12, 40).toISOString(), pipelineState: 'proposed' },
      { id: 'capture-unknown', rawText: '记得那件事情', source: 'webText', createdAt: atTime(today, 12, 50).toISOString(), pipelineState: 'proposed' },
    ],
    proposals: [
      {
        id: 'proposal-contract', captureId: 'capture-contract', outcome: 'task', title: '审阅合同付款条款', category: 'work',
        estimatedMinutes: 45, confidence: 0.91, reason: '识别到明确截止时间与审阅行动。', kind: 'create', status: 'pending',
        nextAction: '先标出付款周期风险点', suggestedBucket: 'today',
      },
      {
        id: 'proposal-health', captureId: 'capture-health', outcome: 'task', title: '买药并预约体检', category: 'health',
        estimatedMinutes: 30, confidence: 0.86, reason: '一句话包含两个可独立完成的健康事项。', kind: 'split', status: 'pending',
        nextAction: '拆成买药、预约体检两件事', suggestedBucket: 'today', splitTitles: ['购买常用药', '预约年度体检'],
      },
      {
        id: 'proposal-duplicate-quote', captureId: 'capture-duplicate-quote', outcome: 'task', title: '确认客户报价',
        category: 'communication', estimatedMinutes: 20, confidence: 0.94, reason: '与今天已有的客户报价任务高度相似。',
        kind: 'merge', status: 'pending', nextAction: '合并来源并保留邮件记录', suggestedBucket: 'today', duplicateTaskId: 'task-client-quote',
      },
      {
        id: 'proposal-waiting', captureId: 'capture-waiting', outcome: 'task', title: '等待供应商确认送货时间',
        category: 'communication', estimatedMinutes: 10, confidence: 0.92, reason: '下一步取决于供应商确认，当前不需要你继续行动。',
        kind: 'create', status: 'pending', nextAction: `等待供应商确认，${dateKey(addDays(today, 3))} 跟进`, suggestedBucket: 'waiting',
        waitingDetails: { waitingFor: '供应商', waitingOn: '确认送货时间', followUpDate: dateKey(addDays(today, 3)) },
      },
      {
        id: 'proposal-someday', captureId: 'capture-someday', outcome: 'task', title: '整理旅行报销材料',
        category: 'life', estimatedMinutes: 25, confidence: 0.86, reason: '输入表达了暂不安排的意图，建议先保存到稍后列表。',
        kind: 'create', status: 'pending', nextAction: '保留到稍后列表，合适时再安排', suggestedBucket: 'someday',
      },
      {
        id: 'proposal-knowledge', captureId: 'capture-knowledge', outcome: 'knowledge', title: '报价沟通原则',
        category: 'learning', estimatedMinutes: 0, confidence: 0.9, reason: '识别到适合长期复用的经验或结论，建议沉淀为知识卡片。',
        kind: 'create', status: 'pending', nextAction: '确认摘要后保存到知识卡片', knowledgeSummary: '回复客户前先确认预算口径。',
      },
      {
        id: 'proposal-unknown', captureId: 'capture-unknown', outcome: 'task', title: '记得那件事情',
        category: 'unknown', estimatedMinutes: 25, confidence: 0.58, reason: '信息较少，先补充要做什么、何时做或和谁有关。',
        kind: 'create', status: 'pending', nextAction: '补充具体行动和背景后再决定去向', suggestedBucket: 'today',
      },
    ],
    decisions: [],
    timeEntries: [
      {
        id: 'time-inbox-cleanup', taskId: 'task-inbox-cleanup', startedAt: atTime(today, 9, 10).toISOString(),
        endedAt: atTime(today, 9, 25).toISOString(), minutes: 15,
      },
      {
        id: 'time-reflow-demo', taskId: 'task-reflow-demo', startedAt: atTime(today, 10).toISOString(),
        endedAt: atTime(today, 10, 45).toISOString(), minutes: 45,
      },
    ],
    progressLogs: [
      { id: 'log-start-demo', taskId: 'task-reflow-demo', createdAt: atTime(today, 10).toISOString(), text: '开始搭建五页应用外壳', kind: 'start' },
      { id: 'log-progress-demo', taskId: 'task-reflow-demo', createdAt: atTime(today, 10, 40).toISOString(), text: '完成 Today 页面结构和设计令牌', kind: 'progress' },
      { id: 'log-interrupt-demo', taskId: 'task-reflow-demo', createdAt: atTime(today, 11, 15).toISOString(), text: '突发：客户询问报价口径', kind: 'interrupt' },
    ],
    knowledgeCards: [
      { id: 'knowledge-quote', title: '报价沟通检查单', summary: '回复客户前先核对预算口径、付款周期和有效期。', source: '历史任务与邮件', createdAt: atTime(yesterday, 18).toISOString() },
      { id: 'knowledge-focus', title: '个人执行模式', summary: '沟通跟进通常比预估多花约 20 分钟，排程时需要留缓冲。', source: '过去 7 天复盘', createdAt: atTime(today, 8).toISOString() },
    ],
  };
}
