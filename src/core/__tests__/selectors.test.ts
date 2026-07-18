import { describe, expect, it } from '@jest/globals';

import { createSeedData } from '../demo-data';
import { domainReducer } from '../reducer';
import { deriveReview, deriveReviewFacts, selectCurrentTask, selectTaskMinutes } from '../selectors';

describe('selectors', () => {
  it('derives time and review from fact records', () => {
    const now = new Date('2026-07-17T12:00:00');
    const seed = createSeedData(now);
    expect(selectTaskMinutes(seed, 'task-reflow-demo')).toBe(45);
    const review = deriveReview(seed, 'daily', now);
    expect(review.actualMinutes).toBe(60);
    expect(review.interruptions).toBe(1);
    expect(review.total).toBeGreaterThan(0);
  });

  it('exposes deterministic facts separately from the display summary', () => {
    const now = new Date('2026-07-17T12:00:00');
    const facts = deriveReviewFacts(createSeedData(now), 'daily', now);
    expect(facts).toMatchObject({ taskCount: expect.any(Number), completedCount: expect.any(Number), actualMinutes: 60, interruptions: 1 });
    expect(facts).not.toHaveProperty('headline');
  });

  it('reflects start and completion changes without saved review snapshots', () => {
    const now = new Date('2026-07-17T12:00:00');
    let data = createSeedData(now);
    data = domainReducer(data, { type: 'startTask', taskId: 'task-client-quote', at: now.toISOString() });
    expect(selectCurrentTask(data)?.id).toBe('task-client-quote');
    data = domainReducer(data, { type: 'recordTime', taskId: 'task-client-quote', minutes: 15, at: now.toISOString() });
    data = domainReducer(data, { type: 'completeTask', taskId: 'task-client-quote', at: now.toISOString() });
    expect(deriveReview(data, 'daily', now).actualMinutes).toBe(75);
  });

  it('does not leak next-day tasks into a daily review', () => {
    const now = new Date('2026-07-17T23:30:00');
    const seed = createSeedData(now);
    const review = deriveReview(seed, 'daily', now);
    expect(review.total).toBe(seed.tasks.filter((task) => task.plannedStartAt?.startsWith('2026-07-17')).length);
  });
});
