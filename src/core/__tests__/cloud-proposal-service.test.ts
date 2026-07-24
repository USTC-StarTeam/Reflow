import { describe, expect, it, jest } from '@jest/globals';

import {
  buildCloudProposalWireRequest,
  CloudProposalService,
} from '../cloud-proposal-service';
import type { ProposalRequest } from '../types';

const request: ProposalRequest = {
  capture: {
    id: 'capture-cloud',
    rawText: '明天整理项目说明',
    source: 'webText',
    createdAt: '2026-07-24T10:00:00+08:00',
  },
  context: {
    referenceDate: '2026-07-24',
    timeZone: 'Asia/Shanghai',
    locale: 'zh-CN',
  },
  existingTaskCandidates: [
    { id: 'task-private', title: '不应上传的任务标题' },
  ],
};

const validDraft = {
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
  reason: '这是明天需要处理的工作事项。',
} as const;

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('CloudProposalService', () => {
  it('serializes only the current Capture and date context', () => {
    const wire = buildCloudProposalWireRequest(request);
    expect(wire).toEqual({
      schemaVersion: 1,
      capture: { rawText: request.capture.rawText, source: 'webText' },
      context: request.context,
    });
    const serialized = JSON.stringify(wire);
    expect(serialized).not.toContain('task-private');
    expect(serialized).not.toContain('不应上传的任务标题');
    expect(serialized).not.toContain(request.capture.id);
  });

  it('maps one valid Draft to a deterministic pending create Proposal', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(response({
      status: 'success',
      schemaVersion: 1,
      draft: validDraft,
    }));
    const service = new CloudProposalService({ gatewayUrl: 'http://127.0.0.1:8787/', fetchImpl });
    const first = await service.propose(request);
    const second = await service.propose(request);
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      status: 'success',
      proposals: [{
        captureId: request.capture.id,
        kind: 'create',
        status: 'pending',
        provider: 'cloud',
        suggestedDate: '2026-07-25',
      }],
    });
    if (first.status === 'success') {
      expect(first.proposals[0].id).toMatch(/^proposal-/);
      expect(first.proposals).toHaveLength(1);
      expect(first.proposals[0].duplicateTaskId).toBeUndefined();
      expect(first.proposals[0].splitTitles).toBeUndefined();
    }
    const sent = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(sent).toEqual(buildCloudProposalWireRequest(request));
  });

  it('keeps nullable Draft fields for Inbox completion instead of inventing defaults', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(response({
      status: 'success',
      schemaVersion: 1,
      draft: { ...validDraft, suggestedDate: null, estimatedMinutes: null, nextAction: null },
    }));
    const result = await new CloudProposalService({ gatewayUrl: 'http://gateway.test', fetchImpl }).propose(request);
    expect(result).toMatchObject({
      status: 'success',
      proposals: [{ estimatedMinutes: null, nextAction: null, suggestedDate: undefined }],
    });
  });

  it('maps timeout, rate limit, refusal and invalid output to structured failures', async () => {
    const timeoutFetch = ((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })) as typeof fetch;
    await expect(new CloudProposalService({
      gatewayUrl: 'http://gateway.test',
      timeoutMs: 5,
      fetchImpl: timeoutFetch,
    }).propose(request)).resolves.toMatchObject({
      status: 'failure',
      failure: { code: 'proposal_timeout', retryable: true },
    });

    for (const [status, code] of [[429, 'proposal_rate_limited'], [504, 'proposal_timeout']] as const) {
      const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(response(null, status));
      await expect(new CloudProposalService({ gatewayUrl: 'http://gateway.test', fetchImpl }).propose(request))
        .resolves.toMatchObject({ status: 'failure', failure: { code } });
    }

    const refused = jest.fn<typeof fetch>().mockResolvedValue(response({
      status: 'failure',
      error: { code: 'proposal_refused', message: '无法整理', retryable: false },
    }, 422));
    await expect(new CloudProposalService({ gatewayUrl: 'http://gateway.test', fetchImpl: refused }).propose(request))
      .resolves.toEqual({ status: 'failure', failure: { code: 'proposal_refused', message: '无法整理', retryable: false } });

    const invalid = jest.fn<typeof fetch>().mockResolvedValue(response({
      status: 'success',
      schemaVersion: 1,
      draft: { ...validDraft, suggestedBucket: 'someday', suggestedDate: '2026-07-25' },
    }));
    await expect(new CloudProposalService({ gatewayUrl: 'http://gateway.test', fetchImpl: invalid }).propose(request))
      .resolves.toMatchObject({ status: 'failure', failure: { code: 'invalid_proposal' } });
  });

  it('returns a safe unavailable failure when the Gateway is not configured', async () => {
    await expect(new CloudProposalService({ gatewayUrl: '' }).propose(request)).resolves.toMatchObject({
      status: 'failure',
      failure: { code: 'proposal_unavailable' },
    });
  });
});
