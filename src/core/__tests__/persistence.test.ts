import { describe, expect, it } from '@jest/globals';

import { createSeedData } from '../demo-data';
import { isDomainData, parseStoredData } from '../persistence';

describe('persistence', () => {
  const fallback = createSeedData(new Date('2026-07-17T12:00:00'));

  it('round-trips domain data only', () => {
    const restored = parseStoredData(JSON.stringify(fallback), createSeedData(new Date('2026-01-01T12:00:00')));
    expect(restored).toEqual(fallback);
    expect(isDomainData(restored)).toBe(true);
  });

  it('falls back for corrupt or incompatible data', () => {
    expect(parseStoredData('{broken', fallback)).toEqual(fallback);
    expect(parseStoredData(JSON.stringify({ ...fallback, version: 99 }), fallback)).toEqual(fallback);
  });
});
