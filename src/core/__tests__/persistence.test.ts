import { describe, expect, it } from '@jest/globals';

import { createSeedData } from '../demo-data';
import { isDomainData, parseStoredData } from '../persistence';

describe('persistence', () => {
  const fallback = createSeedData(new Date('2026-07-17T12:00:00'));

  it('round-trips v3 domain data including decision events only', () => {
    const restored = parseStoredData(JSON.stringify(fallback), createSeedData(new Date('2026-01-01T12:00:00')));
    expect(restored).toEqual(fallback);
    expect(isDomainData(restored)).toBe(true);
  });

  it('migrates v1 captures and knowledge cards through v2 into v3 without persisting UI state', () => {
    const legacy = {
      ...fallback,
      version: 1,
      captures: fallback.captures.map((capture) => ({ id: capture.id, rawText: capture.rawText, source: capture.source === 'email' ? '邮件' : '手动输入', createdAt: capture.createdAt, parseStatus: capture.pipelineState === 'proposed' ? 'organized' : 'resolved' })),
      knowledgeCards: fallback.knowledgeCards.map(({ createdAt: _createdAt, ...card }) => card),
    };
    delete (legacy as Partial<typeof legacy>).decisions;
    const restored = parseStoredData(JSON.stringify(legacy), fallback);
    expect(restored.version).toBe(3);
    expect(restored.decisions).toEqual([]);
    expect(restored.captures[0]).toMatchObject({ source: 'email', pipelineState: 'proposed' });
    expect(restored.knowledgeCards[0].createdAt).toBeTruthy();
  });

  it('migrates v2 proposals to suggested destinations and preserves optional waiting fields', () => {
    const legacy = {
      ...fallback,
      version: 2,
      proposals: fallback.proposals.map(({ suggestedBucket: _suggestedBucket, waitingDetails: _waitingDetails, ...proposal }) => proposal),
    };
    const restored = parseStoredData(JSON.stringify(legacy), fallback);
    expect(restored.version).toBe(3);
    expect(restored.proposals.find((proposal) => proposal.id === 'proposal-contract')?.suggestedBucket).toBe('today');
    expect(restored.proposals.find((proposal) => proposal.id === 'proposal-waiting')?.waitingDetails).toBeUndefined();
  });

  it('falls back for corrupt or incompatible data', () => {
    expect(parseStoredData('{broken', fallback)).toEqual(fallback);
    expect(parseStoredData(JSON.stringify({ ...fallback, version: 99 }), fallback)).toEqual(fallback);
  });
});
