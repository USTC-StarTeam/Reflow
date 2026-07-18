import type { AIProposal, InboxCapture, PipelineFailure, ProposalService, TaskItem } from './types';

export type ProposalPipelineResult =
  | { status: 'success'; captureId: string; proposals: AIProposal[] }
  | { status: 'failure'; captureId: string; failure: PipelineFailure };

function invalidProposalFailure(): PipelineFailure {
  return { code: 'invalid_proposal', message: '建议结果格式无效，请重试。', retryable: true };
}

export async function runProposalPipeline(input: {
  capture: InboxCapture;
  existingTasks: readonly TaskItem[];
  proposalService: ProposalService;
}): Promise<ProposalPipelineResult> {
  try {
    const result = await input.proposalService.propose({ capture: input.capture, existingTasks: input.existingTasks });
    if (result.status === 'failure') return { status: 'failure', captureId: input.capture.id, failure: result.failure };
    if (!result.proposals.length || result.proposals.some((proposal) => proposal.captureId !== input.capture.id || proposal.status !== 'pending')) {
      return { status: 'failure', captureId: input.capture.id, failure: invalidProposalFailure() };
    }
    return { status: 'success', captureId: input.capture.id, proposals: result.proposals };
  } catch {
    return {
      status: 'failure',
      captureId: input.capture.id,
      failure: { code: 'proposal_unavailable', message: '建议服务暂时不可用，请稍后重试。', retryable: true },
    };
  }
}
