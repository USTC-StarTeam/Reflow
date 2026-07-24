import { CloudProposalService } from './cloud-proposal-service';
import { MockProposalService } from './mock-proposal-service';
import type { ProposalService, ProposalServiceKind } from './types';

export interface ProposalServiceConfig {
  mode: ProposalServiceKind;
  gatewayUrl: string;
}

export function readProposalServiceConfig(): ProposalServiceConfig {
  return {
    mode: process.env.EXPO_PUBLIC_PROPOSAL_MODE === 'cloud' ? 'cloud' : 'mock',
    gatewayUrl: process.env.EXPO_PUBLIC_AI_GATEWAY_URL?.trim() ?? '',
  };
}

export function createProposalService(config = readProposalServiceConfig()): ProposalService {
  return config.mode === 'cloud'
    ? new CloudProposalService({ gatewayUrl: config.gatewayUrl })
    : new MockProposalService();
}
