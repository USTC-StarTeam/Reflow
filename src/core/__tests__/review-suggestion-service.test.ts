import { describe, expect, it, jest } from '@jest/globals';

import { buildReviewSuggestionWireRequest } from '../review-suggestion-contract';
import { ReviewSuggestionService, type ReviewSuggestionFetch } from '../review-suggestion-service';
import type { DailyReviewSnapshot } from '../types';

const snapshot: DailyReviewSnapshot = {
  date: '2026-07-17',
  timeZone: 'Asia/Shanghai',
  plannedCount: 4,
  completedAsPlannedCount: 2,
  completedTotalCount: 3,
  recordedMinutes: 110,
  interruptions: 2,
  categoryMinutes: [{ category: 'learning', minutes: 70 }, { category: 'work', minutes: 40 }],
  recordsComplete: true,
};

const validDraft = {
  title: '给一段执行留出完整时间',
  factIds: ['interruptions', 'recordedMinutes'],
  action: '明天开始时把手机放到视线外，直到这一段自然结束再取回。',
};

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function service(fetchImpl: ReviewSuggestionFetch, gatewayUrl = 'http://127.0.0.1:8787/') {
  return new ReviewSuggestionService({ gatewayUrl, fetchImpl });
}

describe('ReviewSuggestionService', () => {
  it('posts the whitelisted snapshot to the review endpoint', async () => {
    const fetchImpl = jest.fn<ReviewSuggestionFetch>().mockResolvedValue(response({ status: 'success', schemaVersion: 1, suggestions: [validDraft] }));
    const result = await service(fetchImpl).request(snapshot);

    expect(result).toEqual({ status: 'success', suggestions: [validDraft] });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:8787/v1/review-proposals');
    expect(fetchImpl.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual(buildReviewSuggestionWireRequest(snapshot));
  });

  it('accepts an honest empty result when the evidence is insufficient', async () => {
    const fetchImpl = jest.fn<ReviewSuggestionFetch>().mockResolvedValue(response({ status: 'success', schemaVersion: 1, suggestions: [] }));
    await expect(service(fetchImpl).request(snapshot)).resolves.toEqual({ status: 'success', suggestions: [] });
  });

  it('maps timeout and rate limiting to retryable failures', async () => {
    const timeoutFetch: ReviewSuggestionFetch = (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
    await expect(new ReviewSuggestionService({ gatewayUrl: 'http://gateway.test', timeoutMs: 5, fetchImpl: timeoutFetch }).request(snapshot))
      .resolves.toMatchObject({ status: 'failure', failure: { code: 'proposal_timeout', retryable: true } });

    for (const [status, code] of [[429, 'proposal_rate_limited'], [504, 'proposal_timeout'], [503, 'proposal_unavailable']] as const) {
      const fetchImpl = jest.fn<ReviewSuggestionFetch>().mockResolvedValue(response(null, status));
      await expect(service(fetchImpl, 'http://gateway.test').request(snapshot))
        .resolves.toMatchObject({ status: 'failure', failure: { code } });
    }
  });

  it('keeps a gateway failure envelope instead of inventing a result', async () => {
    const fetchImpl = jest.fn<ReviewSuggestionFetch>().mockResolvedValue(response({
      status: 'failure',
      error: { code: 'proposal_refused', message: '模型无法根据这些统计事实给出复盘建议。', retryable: false },
    }, 422));
    await expect(service(fetchImpl).request(snapshot))
      .resolves.toEqual({ status: 'failure', failure: { code: 'proposal_refused', message: '模型无法根据这些统计事实给出复盘建议。', retryable: false } });
  });

  it('rejects a model suggestion that smuggles in a number', async () => {
    const fetchImpl = jest.fn<ReviewSuggestionFetch>().mockResolvedValue(response({
      status: 'success',
      schemaVersion: 1,
      suggestions: [{ ...validDraft, action: '明天提前10分钟开始这一段执行。' }],
    }));
    await expect(service(fetchImpl).request(snapshot))
      .resolves.toMatchObject({ status: 'failure', failure: { code: 'invalid_proposal', retryable: true } });
  });

  it('fails safely without a gateway and never degrades to a local substitute', async () => {
    await expect(new ReviewSuggestionService({ gatewayUrl: '  ' }).request(snapshot))
      .resolves.toMatchObject({ status: 'failure', failure: { code: 'proposal_unavailable' } });

    const throwing = jest.fn<ReviewSuggestionFetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await service(throwing, 'http://gateway.test').request(snapshot);
    expect(result).toMatchObject({ status: 'failure', failure: { code: 'proposal_unavailable', retryable: true } });
    expect(result.status === 'success' && result.suggestions.length).toBe(false);
  });
});
