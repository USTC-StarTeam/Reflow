import { describe, expect, it } from '@jest/globals';

import { createSeedData } from '../demo-data';
import { domainReducer } from '../reducer';
import { deriveReview, deriveReviewFacts, selectCalendarEntriesForDate, selectCurrentTask, selectProposalVisibleClassification, selectRecentDecisions, selectTaskMinutes } from '../selectors';
import type { TaskItem } from '../types';

function calendarTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 'task-calendar',
    title: '整理会议纪要',
    status: 'notStarted',
    category: 'work',
    bucket: 'today',
    estimatedMinutes: 30,
    nextAction: '整理要点',
    sourceSummary: 'Web 文本',
    sortIndex: 0,
    createdAt: '2026-07-17T08:00:00.000',
    ...overrides,
  };
}

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

  it('maps the separated domain dimensions into the nine user-visible classifications', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const contentClassifications = ['work', 'communication', 'learning', 'life', 'health', 'unknown'] as const;
    contentClassifications.forEach((category) => {
      const proposal = { ...seed.proposals[0], id: `proposal-${category}`, category, outcome: 'task' as const, suggestedBucket: 'today' as const };
      const data = { ...seed, proposals: [...seed.proposals, proposal] };
      expect(selectProposalVisibleClassification(data, proposal.id)).toBe(category);
    });
    expect(selectProposalVisibleClassification(seed, 'proposal-waiting')).toBe('waiting');
    expect(selectProposalVisibleClassification(seed, 'proposal-someday')).toBe('someday');
    expect(selectProposalVisibleClassification(seed, 'proposal-knowledge')).toBe('knowledge');
  });

  it('limits recent decisions to five newest records', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const decisions = Array.from({ length: 6 }, (_, index) => ({
      id: `decision-${index}`,
      captureId: 'capture-contract',
      proposalId: 'proposal-contract',
      kind: 'ignore' as const,
      outcome: 'ignored' as const,
      appliedAt: `2026-07-17T0${index}:00:00.000Z`,
      status: 'applied' as const,
      effect: { type: 'ignored' as const },
    }));
    expect(selectRecentDecisions({ ...seed, decisions })).toHaveLength(5);
  });

  it('shows an unscheduled today task and anchors it to the actual completion date', () => {
    const today = new Date('2026-07-17T12:00:00');
    const seed = { ...createSeedData(today), tasks: [calendarTask()] };
    expect(selectCalendarEntriesForDate(seed, '2026-07-17', today)).toMatchObject([{ kind: 'unscheduled' }]);

    const completed = domainReducer(seed, { type: 'completeTask', taskId: 'task-calendar', at: '2026-07-17T16:42:00.000' });
    expect(selectCalendarEntriesForDate(completed, '2026-07-17', today)).toMatchObject([{ kind: 'completed', completedAt: '2026-07-17T16:42:00.000' }]);
    expect(selectCalendarEntriesForDate(completed, '2026-07-18', new Date('2026-07-18T12:00:00'))).toHaveLength(0);
  });

  it('deduplicates a task planned and completed on the same date', () => {
    const today = new Date('2026-07-17T12:00:00');
    const seed = {
      ...createSeedData(today),
      tasks: [calendarTask({ status: 'completed', plannedStartAt: '2026-07-17T09:00:00.000', plannedEndAt: '2026-07-17T09:30:00.000', completedAt: '2026-07-17T09:24:00.000' })],
    };
    expect(selectCalendarEntriesForDate(seed, '2026-07-17', today)).toMatchObject([{ kind: 'plannedCompleted' }]);
  });

  it('keeps different plan and completion dates as separate calendar entries', () => {
    const today = new Date('2026-07-17T12:00:00');
    const seed = {
      ...createSeedData(today),
      tasks: [calendarTask({ status: 'completed', plannedStartAt: '2026-07-18T09:00:00.000', plannedEndAt: '2026-07-18T09:30:00.000', completedAt: '2026-07-17T16:42:00.000' })],
    };
    expect(selectCalendarEntriesForDate(seed, '2026-07-17', today)).toMatchObject([{ kind: 'completed' }]);
    expect(selectCalendarEntriesForDate(seed, '2026-07-18', today)).toMatchObject([{ kind: 'planned' }]);
  });

  it('turns an unscheduled entry into one planned entry after scheduling', () => {
    const today = new Date('2026-07-17T12:00:00');
    const seed = { ...createSeedData(today), tasks: [calendarTask()] };
    const scheduled = domainReducer(seed, { type: 'scheduleTask', taskId: 'task-calendar', startAt: '2026-07-17T16:00:00.000', endAt: '2026-07-17T16:30:00.000' });
    expect(selectCalendarEntriesForDate(scheduled, '2026-07-17', today)).toMatchObject([{ kind: 'planned' }]);
  });
});
