import { stableId } from './date-utils';
import {
  CLOUD_PROPOSAL_SCHEMA_VERSION,
  parseCloudProposalGatewayEnvelope,
  type CloudProposalDraft,
  type CloudProposalWireRequest,
} from './cloud-proposal-contract';
import type { AIProposal, PipelineFailure, ProposalRequest, ProposalResult, ProposalService } from './types';

type FetchLike = typeof fetch;
const platformFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

export interface CloudProposalServiceOptions {
  gatewayUrl: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

function unavailable(message = '云端整理服务暂时不可用，请稍后重试。'): ProposalResult {
  return { status: 'failure', failure: { code: 'proposal_unavailable', message, retryable: true } };
}

export function buildCloudProposalWireRequest(request: ProposalRequest): CloudProposalWireRequest {
  return {
    schemaVersion: CLOUD_PROPOSAL_SCHEMA_VERSION,
    capture: {
      rawText: request.capture.rawText,
      source: request.capture.source,
    },
    context: {
      referenceDate: request.context.referenceDate,
      timeZone: request.context.timeZone,
      locale: request.context.locale,
    },
  };
}

function gatewayFailure(status: number): PipelineFailure {
  if (status === 429) return { code: 'proposal_rate_limited', message: '云端整理请求较多，请稍后重试。', retryable: true };
  if (status === 408 || status === 504) return { code: 'proposal_timeout', message: '云端整理超时，请重试或使用本地规则。', retryable: true };
  return { code: 'proposal_unavailable', message: '云端整理服务暂时不可用，请稍后重试。', retryable: true };
}

function mapProposal(request: ProposalRequest, draft: CloudProposalDraft): AIProposal {
  return {
    id: stableId('proposal', `${request.capture.id}:cloud:${JSON.stringify(draft)}`),
    captureId: request.capture.id,
    outcome: draft.outcome,
    title: draft.title,
    category: draft.category,
    estimatedMinutes: draft.estimatedMinutes,
    confidence: draft.confidence,
    reason: draft.reason,
    kind: 'create',
    status: 'pending',
    nextAction: draft.nextAction,
    suggestedBucket: draft.suggestedBucket ?? undefined,
    suggestedDate: draft.suggestedDate ?? undefined,
    waitingDetails: draft.waitingDetails,
    knowledgeSummary: draft.knowledgeSummary,
    provider: 'cloud',
  };
}

export class CloudProposalService implements ProposalService {
  readonly kind = 'cloud' as const;
  private readonly gatewayUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: CloudProposalServiceOptions) {
    this.gatewayUrl = options.gatewayUrl.trim().replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 18_000;
    this.fetchImpl = options.fetchImpl ?? platformFetch;
  }

  async propose(request: ProposalRequest): Promise<ProposalResult> {
    if (!this.gatewayUrl) return unavailable('未配置本地 AI Gateway 地址。');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.gatewayUrl}/v1/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(buildCloudProposalWireRequest(request)),
      });
      const body = await response.json().catch(() => null);
      const parsed = parseCloudProposalGatewayEnvelope(body);
      if (!response.ok) {
        if (parsed.status === 'success' && parsed.envelope.status === 'failure') {
          return { status: 'failure', failure: parsed.envelope.error };
        }
        return { status: 'failure', failure: gatewayFailure(response.status) };
      }
      if (parsed.status === 'failure') {
        return { status: 'failure', failure: { code: 'invalid_proposal', message: '云端返回的建议格式无效，请重试或使用本地规则。', retryable: true } };
      }
      if (parsed.envelope.status === 'failure') return { status: 'failure', failure: parsed.envelope.error };
      return { status: 'success', proposals: [mapProposal(request, parsed.envelope.draft)] };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { status: 'failure', failure: { code: 'proposal_timeout', message: '云端整理超时，请重试或使用本地规则。', retryable: true } };
      }
      return unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }
}
