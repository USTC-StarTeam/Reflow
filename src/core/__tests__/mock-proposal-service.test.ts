import { describe, expect, it } from '@jest/globals';

import { MockProposalService } from '../mock-proposal-service';
import type { InboxCapture } from '../types';

describe('MockProposalService', () => {
  it('returns deterministic suggestions for the same input', async () => {
    const service = new MockProposalService(0);
    const capture: InboxCapture = { id: 'capture-1', rawText: '下午回复客户报价', source: '手动输入', createdAt: '2026-07-17T08:00:00.000Z', parseStatus: 'organizing' };
    const first = await service.propose(capture, []);
    const second = await service.propose(capture, []);
    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({ category: 'communication', status: 'pending', outcome: 'task' });
  });

  it('creates a split suggestion for compound input and unknown for ambiguous input', async () => {
    const service = new MockProposalService(0);
    const compound: InboxCapture = { id: 'capture-2', rawText: '买药和预约体检', source: '语音', createdAt: '2026-07-17T08:00:00.000Z', parseStatus: 'organizing' };
    const ambiguous: InboxCapture = { ...compound, id: 'capture-3', rawText: '记得那件事情' };
    expect((await service.propose(compound))[0]).toMatchObject({ kind: 'split', category: 'health', splitTitles: ['买药', '预约体检'] });
    expect((await service.propose(ambiguous))[0]).toMatchObject({ category: 'unknown', confidence: 0.58 });
  });
});
