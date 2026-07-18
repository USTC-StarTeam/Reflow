import { describe, expect, it } from '@jest/globals';

import { MockProposalService } from '../mock-proposal-service';
import type { InboxCapture, TaskItem } from '../types';

const capture: InboxCapture = {
  id: 'capture-1', rawText: '下午回复客户报价', source: 'webText', createdAt: '2026-07-17T08:00:00.000Z', pipelineState: 'proposing',
};

describe('MockProposalService', () => {
  it('returns deterministic structured suggestions without mutating task context', async () => {
    const service = new MockProposalService(0);
    const tasks: TaskItem[] = [{ id: 'task-1', title: '已有任务', status: 'notStarted', category: 'work', bucket: 'today', estimatedMinutes: 20, nextAction: '开始', sourceSummary: 'Web 文本', sortIndex: 0, createdAt: capture.createdAt }];
    const before = JSON.stringify(tasks);
    const first = await service.propose({ capture, existingTasks: tasks });
    const second = await service.propose({ capture, existingTasks: tasks });
    expect(second).toEqual(first);
    expect(first).toMatchObject({ status: 'success' });
    if (first.status === 'success') expect(first.proposals[0]).toMatchObject({ category: 'communication', status: 'pending', outcome: 'task' });
    expect(JSON.stringify(tasks)).toBe(before);
  });

  it('creates split, unknown, and knowledge proposals deterministically', async () => {
    const service = new MockProposalService(0);
    const compound = { ...capture, id: 'capture-2', rawText: '买药和预约体检' };
    const ambiguous = { ...capture, id: 'capture-3', rawText: '记得那件事情' };
    const knowledge = { ...capture, id: 'capture-4', rawText: '沉淀报价沟通原则：先确认预算口径' };
    const compoundResult = await service.propose({ capture: compound, existingTasks: [] });
    const ambiguousResult = await service.propose({ capture: ambiguous, existingTasks: [] });
    const knowledgeResult = await service.propose({ capture: knowledge, existingTasks: [] });
    expect(compoundResult).toMatchObject({ status: 'success' });
    expect(ambiguousResult).toMatchObject({ status: 'success' });
    expect(knowledgeResult).toMatchObject({ status: 'success' });
    if (compoundResult.status === 'success') expect(compoundResult.proposals[0]).toMatchObject({ kind: 'split', category: 'health', splitTitles: ['买药', '预约体检'] });
    if (ambiguousResult.status === 'success') expect(ambiguousResult.proposals[0]).toMatchObject({ category: 'unknown', confidence: 0.58 });
    if (knowledgeResult.status === 'success') expect(knowledgeResult.proposals[0]).toMatchObject({ outcome: 'knowledge', category: 'learning' });
  });

  it('returns an explicit service failure when configured', async () => {
    const service = new MockProposalService({ delayMs: 0, failure: { code: 'proposal_unavailable', message: '离线', retryable: true } });
    await expect(service.propose({ capture, existingTasks: [] })).resolves.toEqual({ status: 'failure', failure: { code: 'proposal_unavailable', message: '离线', retryable: true } });
  });
});
