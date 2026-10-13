import { readProposalServiceConfig, type ProposalServiceConfig } from './proposal-service-config';
import {
  buildReviewSuggestionWireRequest,
  parseReviewSuggestionEnvelope,
  type ReviewSuggestionDraft,
} from './review-suggestion-contract';
import type { DailyReviewSnapshot, PipelineFailure } from './types';

export type ReviewSuggestionFetch = (input: string, init?: RequestInit) => Promise<Response>;
const platformFetch: ReviewSuggestionFetch = (input, init) => globalThis.fetch(input, init);

export type ReviewSuggestionResult =
  | { status: 'success'; suggestions: ReviewSuggestionDraft[] }
  | { status: 'failure'; failure: PipelineFailure };

export interface ReviewSuggestionServiceOptions {
  gatewayUrl: string;
  timeoutMs?: number;
  fetchImpl?: ReviewSuggestionFetch;
}

function unavailable(message = '云端复盘服务暂时不可用，请稍后重试。'): ReviewSuggestionResult {
  return { status: 'failure', failure: { code: 'proposal_unavailable', message, retryable: true } };
}

function gatewayFailure(status: number): PipelineFailure {
  if (status === 429) return { code: 'proposal_rate_limited', message: '云端复盘请求较多，请稍后重试。', retryable: true };
  if (status === 408 || status === 504) return { code: 'proposal_timeout', message: '云端复盘超时，请稍后重试。', retryable: true };
  return { code: 'proposal_unavailable', message: '云端复盘服务暂时不可用，请稍后重试。', retryable: true };
}

export class ReviewSuggestionService {
  private readonly gatewayUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: ReviewSuggestionFetch;

  constructor(options: ReviewSuggestionServiceOptions) {
    this.gatewayUrl = options.gatewayUrl.trim().replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 18_000;
    this.fetchImpl = options.fetchImpl ?? platformFetch;
  }

  async request(snapshot: DailyReviewSnapshot): Promise<ReviewSuggestionResult> {
    if (!this.gatewayUrl) return unavailable('未配置本地 AI Gateway 地址。');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.gatewayUrl}/v1/review-proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(buildReviewSuggestionWireRequest(snapshot)),
      });
      const body = await response.json().catch(() => null);
      const parsed = parseReviewSuggestionEnvelope(body);
      if (!response.ok) {
        if (parsed.status === 'success' && parsed.envelope.status === 'failure') {
          return { status: 'failure', failure: parsed.envelope.error };
        }
        return { status: 'failure', failure: gatewayFailure(response.status) };
      }
      if (parsed.status === 'failure') {
        return { status: 'failure', failure: { code: 'invalid_proposal', message: '云端返回的复盘建议格式无效，请稍后重试。', retryable: true } };
      }
      if (parsed.envelope.status === 'failure') return { status: 'failure', failure: parsed.envelope.error };
      return { status: 'success', suggestions: parsed.envelope.suggestions };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { status: 'failure', failure: { code: 'proposal_timeout', message: '云端复盘超时，请稍后重试。', retryable: true } };
      }
      return unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createReviewSuggestionService(config: ProposalServiceConfig = readProposalServiceConfig()): ReviewSuggestionService {
  return new ReviewSuggestionService({ gatewayUrl: config.gatewayUrl });
}
