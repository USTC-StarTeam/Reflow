import { describe, expect, it } from '@jest/globals';

import { createSeedData } from '../demo-data';
import { runProposalPipeline } from '../proposal-pipeline';
import type { InboxCapture, ProposalRequest, ProposalService } from '../types';

const capture: InboxCapture = { id: 'capture-pipeline', rawText: '回复客户', source: 'webText', createdAt: '2026-07-17T08:00:00.000Z', pipelineState: 'proposing' };

describe('Proposal Pipeline', () => {
  it('returns the service output without writing domain data', async () => {
    const service: ProposalService = { propose: async () => ({ status: 'success', proposals: [{ id: 'proposal-pipeline', captureId: capture.id, outcome: 'task', title: '回复客户', category: 'communication', estimatedMinutes: 20, confidence: 0.8, reason: '测试', kind: 'create', status: 'pending', nextAction: '发送回复' }] }) };
    const result = await runProposalPipeline({ capture, existingTasks: [], proposalService: service });
    expect(result).toMatchObject({ status: 'success', captureId: capture.id });
  });

  it('keeps a retryable structured failure from the service', async () => {
    const service: ProposalService = { propose: async () => ({ status: 'failure', failure: { code: 'proposal_unavailable', message: '离线', retryable: true } }) };
    await expect(runProposalPipeline({ capture, existingTasks: [], proposalService: service })).resolves.toEqual({ status: 'failure', captureId: capture.id, failure: { code: 'proposal_unavailable', message: '离线', retryable: true } });
  });

  it('exposes only candidate IDs and titles and leaves formal data unchanged before confirmation', async () => {
    const data = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const before = JSON.stringify(data);
    let received: ProposalRequest | undefined;
    const service: ProposalService = {
      kind: 'cloud',
      propose: async (request) => {
        received = request;
        return {
          status: 'success',
          proposals: [{
            id: 'proposal-cloud',
            captureId: capture.id,
            outcome: 'task',
            title: '回复客户',
            category: 'communication',
            estimatedMinutes: null,
            confidence: 0.8,
            reason: '测试',
            kind: 'create',
            status: 'pending',
            nextAction: null,
            provider: 'cloud',
          }],
        };
      },
    };
    const result = await runProposalPipeline({ capture, existingTasks: data.tasks, proposalService: service });
    expect(result).toMatchObject({ status: 'success' });
    expect(received?.existingTaskCandidates[0]).toEqual({
      id: data.tasks[0].id,
      title: data.tasks[0].title,
    });
    expect(Object.keys(received?.existingTaskCandidates[0] ?? {}).sort()).toEqual(['id', 'title']);
    expect(JSON.stringify(received)).not.toContain('plannedStartAt');
    expect(JSON.stringify(received)).not.toContain('progressLogs');
    expect(JSON.stringify(data)).toBe(before);
  });
});
