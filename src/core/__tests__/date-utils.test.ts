import { describe, expect, it } from '@jest/globals';

import { addLocalDays, compareLocalDates, formatDuration, intervalOverlapMilliseconds, isLocalDate, isZonedDateTime, localDateOf, localDayInterval, toZonedISOString } from '../date-utils';

describe('local date utilities', () => {
  it('validates local dates and offset ISO values', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isZonedDateTime('2026-07-17T09:15:00+08:00')).toBe(true);
    expect(isZonedDateTime('2026-07-17T09:15:00')).toBe(false);
  });

  it('keeps local YYYY-MM-DD semantics across month boundaries', () => {
    expect(addLocalDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(compareLocalDates('2026-07-31', '2026-08-01')).toBeLessThan(0);
    expect(localDateOf(new Date('2026-07-17T12:00:00+08:00'))).toBe('2026-07-17');
  });

  it('serializes new timestamps with an explicit local offset', () => {
    expect(toZonedISOString(new Date('2026-07-17T12:00:00+08:00'))).toMatch(/(?:Z|[+-]\d{2}:\d{2})$/);
  });

  it('computes interval overlap using actual instants', () => {
    const range = localDayInterval('2026-07-17');
    expect(intervalOverlapMilliseconds('2026-07-17T23:50:00+08:00', '2026-07-18T00:10:00+08:00', range.start, range.end) / 60_000).toBe(10);
  });

  it('formats longer durations as natural hours and minutes', () => {
    expect(formatDuration(45)).toBe('45 分');
    expect(formatDuration(95)).toBe('1小时35分');
    expect(formatDuration(743)).toBe('12小时23分');
  });
});
