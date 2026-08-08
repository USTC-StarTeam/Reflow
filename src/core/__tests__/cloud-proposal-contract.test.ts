import { describe, expect, it } from '@jest/globals';

import {
  parseCloudProposalGatewayEnvelope,
  validateCloudProposalDraft,
  type CloudProposalDraft,
} from '../cloud-proposal-contract';

const taskDraft: CloudProposalDraft = {
  title: '整理项目说明',
  category: 'work',
  outcome: 'task',
  suggestedBucket: 'today',
  suggestedDate: '2026-07-25',
  estimatedMinutes: 45,
  nextAction: '列出项目说明的三个章节',
  waitingDetails: null,
  knowledgeSummary: null,
  confidence: 0.92,
  reason: '这是有明确日期的工作事项。',
};

describe('Cloud Proposal contract', () => {
  it('accepts an undecided task with null bucket/date and preserves nullable execution fields', () => {
    const result = validateCloudProposalDraft({
      ...taskDraft,
      suggestedBucket: null,
      suggestedDate: null,
      estimatedMinutes: null,
      nextAction: null,
    });
    expect(result).toMatchObject({
      status: 'success',
      draft: { suggestedBucket: null, estimatedMinutes: null, nextAction: null, suggestedDate: null },
    });
  });

  it('requires today to carry a valid date', () => {
    expect(validateCloudProposalDraft({ ...taskDraft, suggestedDate: null }))
      .toMatchObject({ status: 'failure' });
    expect(validateCloudProposalDraft(taskDraft)).toMatchObject({ status: 'success' });
  });

  it('requires unknown tasks to keep workflow and execution suggestions empty', () => {
    const unknown = {
      ...taskDraft,
      category: 'unknown' as const,
      suggestedBucket: null,
      suggestedDate: null,
      estimatedMinutes: null,
      nextAction: null,
      confidence: 0.3,
    };
    expect(validateCloudProposalDraft(unknown)).toMatchObject({ status: 'success' });
    expect(validateCloudProposalDraft({ ...unknown, estimatedMinutes: 30 })).toMatchObject({ status: 'failure' });
  });

  it('requires all nullable waiting keys and rejects malformed dates', () => {
    expect(validateCloudProposalDraft({
      ...taskDraft,
      suggestedBucket: 'waiting',
      suggestedDate: null,
      estimatedMinutes: null,
      nextAction: null,
      waitingDetails: { waitingFor: null, waitingOn: null, followUpDate: null },
    })).toMatchObject({ status: 'success' });

    expect(validateCloudProposalDraft({
      ...taskDraft,
      suggestedBucket: 'waiting',
      suggestedDate: null,
      waitingDetails: { waitingFor: '老师', waitingOn: '论文反馈' },
    })).toMatchObject({ status: 'failure' });

    expect(validateCloudProposalDraft({ ...taskDraft, suggestedDate: '2026-02-30' }))
      .toMatchObject({ status: 'failure' });
  });

  it('enforces knowledge, waiting and someday field combinations', () => {
    expect(validateCloudProposalDraft({
      ...taskDraft,
      outcome: 'knowledge',
      suggestedBucket: null,
      suggestedDate: null,
      estimatedMinutes: null,
      nextAction: null,
      knowledgeSummary: '评审前先确认验收口径。',
    })).toMatchObject({ status: 'success' });

    expect(validateCloudProposalDraft({
      ...taskDraft,
      suggestedBucket: 'someday',
      suggestedDate: '2026-08-01',
    })).toMatchObject({ status: 'failure' });
  });

  it('rejects internal contract names in every user-visible field', () => {
    for (const patch of [
      { title: '创建 AIProposal' },
      { nextAction: '填写 estimatedMinutes' },
      { reason: '来自 JSON Schema' },
      { knowledgeSummary: 'CloudProposalDraft 说明' },
    ]) {
      expect(validateCloudProposalDraft({ ...taskDraft, ...patch })).toMatchObject({ status: 'failure' });
    }
  });

  it('rejects unsupported envelope versions and preserves safe gateway failures', () => {
    expect(parseCloudProposalGatewayEnvelope({
      status: 'success',
      schemaVersion: 2,
      draft: taskDraft,
    })).toMatchObject({ status: 'failure' });
    expect(parseCloudProposalGatewayEnvelope({
      status: 'failure',
      error: { code: 'proposal_refused', message: '无法整理', retryable: false },
    })).toEqual({
      status: 'success',
      envelope: {
        status: 'failure',
        error: { code: 'proposal_refused', message: '无法整理', retryable: false },
      },
    });
  });
});
