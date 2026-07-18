import { describe, expect, it } from '@jest/globals';

import { createSeedData } from '../demo-data';
import { isDomainData, parseStoredData } from '../persistence';

describe('persistence', () => {
  const fallback = createSeedData(new Date('2026-07-17T12:00:00'));

  it('round-trips v2 domain data including decision events only', () => {
    const restored = parseStoredData(JSON.stringify(fallback), createSeedData(new Date('2026-01-01T12:00:00')));
    expect(restored).toEqual(fallback);
    expect(isDomainData(restored)).toBe(true);
  });

  it('migrates v1 captures and knowledge cards without persisting UI state', () => {
    const legacy = {
      ...fallback,
      version: 1,
      captures: fallback.captures.map((capture) => ({ id: capture.id, rawText: capture.rawText, source: capture.source === 'email' ? '邮件' : '手动输入', createdAt: capture.createdAt, parseStatus: capture.pipelineState === 'proposed' ? 'organized' : 'resolved' })),
      knowledgeCards: fallback.knowledgeCards.map(({ createdAt: _createdAt, ...card }) => card),
    };
    delete (legacy as Partial<typeof legacy>).decisions;
    const restored = parseStoredData(JSON.stringify(legacy), fallback);
    expect(restored.version).toBe(2);
    expect(restored.decisions).toEqual([]);
    expect(restored.captures[0]).toMatchObject({ source: 'email', pipelineState: 'proposed' });
    expect(restored.knowledgeCards[0].createdAt).toBeTruthy();
  });

  it('falls back for corrupt or incompatible data', () => {
    expect(parseStoredData('{broken', fallback)).toEqual(fallback);
    expect(parseStoredData(JSON.stringify({ ...fallback, version: 99 }), fallback)).toEqual(fallback);
  });
});
