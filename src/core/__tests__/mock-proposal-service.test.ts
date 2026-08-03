import { describe, expect, it } from '@jest/globals';

import { MockProposalService } from '../mock-proposal-service';
import type { InboxCapture, ProposalRequest, ProposalTaskCandidate } from '../types';

const capture: InboxCapture = {
  id: 'capture-1', rawText: '下午回复客户报价', source: 'webText', createdAt: '2026-07-17T08:00:00.000Z', pipelineState: 'proposing',
};

function request(
  source: InboxCapture,
  existingTaskCandidates: ProposalTaskCandidate[] = [],
): ProposalRequest {
  return {
    capture: source,
    context: {
      referenceDate: '2026-07-17',
      timeZone: 'Asia/Shanghai',
      locale: 'zh-CN',
    },
    existingTaskCandidates,
  };
}

describe('MockProposalService', () => {
  it('returns deterministic structured suggestions without mutating task context', async () => {
    const service = new MockProposalService(0);
    const candidates = [{ id: 'task-1', title: '已有任务' }];
    const before = JSON.stringify(candidates);
    const first = await service.propose(request(capture, candidates));
    const second = await service.propose(request(capture, candidates));
    expect(second).toEqual(first);
    expect(first).toMatchObject({ status: 'success' });
    if (first.status === 'success') expect(first.proposals[0]).toMatchObject({ category: 'communication', status: 'pending', outcome: 'task' });
    expect(JSON.stringify(candidates)).toBe(before);
  });

  it('creates split, unknown, and knowledge proposals deterministically', async () => {
    const service = new MockProposalService(0);
    const compound = { ...capture, id: 'capture-2', rawText: '买药和预约体检' };
    const ambiguous = { ...capture, id: 'capture-3', rawText: '记得那件事情' };
    const knowledge = { ...capture, id: 'capture-4', rawText: '沉淀报价沟通原则：先确认预算口径' };
    const compoundResult = await service.propose(request(compound));
    const ambiguousResult = await service.propose(request(ambiguous));
    const knowledgeResult = await service.propose(request(knowledge));
    expect(compoundResult).toMatchObject({ status: 'success' });
    expect(ambiguousResult).toMatchObject({ status: 'success' });
    expect(knowledgeResult).toMatchObject({ status: 'success' });
    if (compoundResult.status === 'success') expect(compoundResult.proposals[0]).toMatchObject({ kind: 'split', category: 'health', splitTitles: ['买药', '预约体检'] });
    if (ambiguousResult.status === 'success') expect(ambiguousResult.proposals[0]).toMatchObject({ category: 'unknown', confidence: 0.58 });
    if (knowledgeResult.status === 'success') expect(knowledgeResult.proposals[0]).toMatchObject({ outcome: 'knowledge', category: 'learning' });
  });

  it('extracts waiting context and later handling without treating active replies as waiting', async () => {
    const service = new MockProposalService(0);
    const waiting = { ...capture, id: 'capture-waiting', rawText: '等供应商确认送货时间' };
    const someday = { ...capture, id: 'capture-someday', rawText: '下周再整理旅行报销材料' };
    const activeReply = { ...capture, id: 'capture-reply', rawText: '下午回复客户报价' };
    const [waitingResult, somedayResult, replyResult] = await Promise.all([
      service.propose(request(waiting)),
      service.propose(request(someday)),
      service.propose(request(activeReply)),
    ]);
    if (waitingResult.status === 'success') expect(waitingResult.proposals[0]).toMatchObject({
      suggestedBucket: 'waiting',
      waitingDetails: { waitingFor: '供应商', waitingOn: '确认送货时间', followUpDate: '2026-07-20' },
    });
    if (somedayResult.status === 'success') expect(somedayResult.proposals[0]).toMatchObject({ suggestedBucket: 'someday' });
    if (replyResult.status === 'success') expect(replyResult.proposals[0]).toMatchObject({ category: 'communication', suggestedBucket: 'today' });
  });

  it('uses the matched verb instead of hardcoding 确认 in waitingOn', async () => {
    const service = new MockProposalService(0);
    // verb=回复：修复前会被错误改写成「确认报价」，修复后应保留「回复报价」。
    const reply = { ...capture, id: 'capture-waiting-reply', rawText: '等客户回复报价' };
    const result = await service.propose(request(reply));
    if (result.status === 'success') expect(result.proposals[0]).toMatchObject({
      suggestedBucket: 'waiting',
      waitingDetails: { waitingFor: '客户', waitingOn: '回复报价', followUpDate: '2026-07-20' },
    });
  });

  it('returns an explicit service failure when configured', async () => {
    const service = new MockProposalService({ delayMs: 0, failure: { code: 'proposal_unavailable', message: '离线', retryable: true } });
    await expect(service.propose(request(capture))).resolves.toEqual({ status: 'failure', failure: { code: 'proposal_unavailable', message: '离线', retryable: true } });
  });
});
