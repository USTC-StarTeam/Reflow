import { afterEach, describe, expect, it } from '@jest/globals';

import { CloudProposalService } from '../cloud-proposal-service';
import { MockProposalService } from '../mock-proposal-service';
import { createProposalService, readProposalServiceConfig } from '../proposal-service-config';

const originalMode = process.env.EXPO_PUBLIC_PROPOSAL_MODE;
const originalGateway = process.env.EXPO_PUBLIC_AI_GATEWAY_URL;

afterEach(() => {
  if (originalMode === undefined) delete process.env.EXPO_PUBLIC_PROPOSAL_MODE;
  else process.env.EXPO_PUBLIC_PROPOSAL_MODE = originalMode;
  if (originalGateway === undefined) delete process.env.EXPO_PUBLIC_AI_GATEWAY_URL;
  else process.env.EXPO_PUBLIC_AI_GATEWAY_URL = originalGateway;
});

describe('Proposal service configuration', () => {
  it('defaults to Mock without a valid explicit Cloud mode', () => {
    delete process.env.EXPO_PUBLIC_PROPOSAL_MODE;
    delete process.env.EXPO_PUBLIC_AI_GATEWAY_URL;
    expect(readProposalServiceConfig()).toEqual({ mode: 'mock', gatewayUrl: '' });
    expect(createProposalService()).toBeInstanceOf(MockProposalService);
  });

  it('selects Cloud with only a public Gateway URL and never reads an API key', () => {
    process.env.EXPO_PUBLIC_PROPOSAL_MODE = 'cloud';
    process.env.EXPO_PUBLIC_AI_GATEWAY_URL = ' http://127.0.0.1:8787 ';
    const config = readProposalServiceConfig();
    expect(config).toEqual({ mode: 'cloud', gatewayUrl: 'http://127.0.0.1:8787' });
    expect(createProposalService(config)).toBeInstanceOf(CloudProposalService);
    expect(config).not.toHaveProperty('apiKey');
  });
});
