import { describe, expect, it } from '@jest/globals';

import { createSeedData } from '../demo-data';
import { domainReducer } from '../reducer';
import { deriveDailyReviewFacts, deriveReview, deriveReviewFacts, isTaskDelayed, selectCalendarEntriesForDate, selectCurrentExecutionSession, selectCurrentTask, selectInboxAttentionCount, selectNeedsAttention, selectProposalVisibleClassification, selectRecentDecisions, selectTaskMinutes, selectTodaySections } from '../selectors';
import type { TaskItem } from '../types';

const at = '2026-07-17T12:00:00+08:00';

function calendarTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 'task-calendar', title: '整理会议纪要', status: 'notStarted', category: 'work', bucket: 'someday', estimatedMinutes: 30,
    nextAction: '整理要点', sourceSummary: 'Web 文本', sortIndex: 0, createdAt: '2026-07-17T08:00:00+08:00',
    ...overrides,
  };
}

describe('selectors', () => {
  it('derives execution minutes and review facts without saved statistics', () => {
    const now = new Date(at);
    const seed = createSeedData(now);
    expect(selectTaskMinutes(seed, 'task-reflow-demo')).toBe(45);
    const facts = deriveReviewFacts(seed, 'daily', now);
    expect(facts).toMatchObject({ actualMinutes: 60, interruptions: 1 });
    expect(facts).not.toHaveProperty('headline');
    expect(deriveReview(seed, 'daily', now).actualMinutes).toBe(60);
  });

  it('uses plannedDate as the only source for current Today placement', () => {
    const seed = createSeedData(new Date(at));
    const misleadingBucket = calendarTask({ id: 'bucket-only', bucket: 'today' });
    const authoritativeDate = calendarTask({ id: 'planned-date', bucket: 'someday', plannedDate: '2026-07-17' });
    const sections = selectTodaySections({ ...seed, tasks: [misleadingBucket, authoritativeDate] }, '2026-07-17');
    expect(sections.unscheduled.map((task) => task.id)).toEqual(['planned-date']);
  });

  it('keeps Today scheduled, unscheduled and completed regions disjoint', () => {
    const seed = createSeedData(new Date(at));
    const scheduled = calendarTask({ id: 'scheduled', plannedDate: '2026-07-17', plannedStartAt: '2026-07-17T09:00:00+08:00', plannedEndAt: '2026-07-17T09:30:00+08:00' });
    const unscheduled = calendarTask({ id: 'unscheduled', plannedDate: '2026-07-17' });
    const completed = calendarTask({ id: 'completed', status: 'completed', plannedDate: '2026-07-17', plannedStartAt: '2026-07-17T10:00:00+08:00', plannedEndAt: '2026-07-17T10:30:00+08:00', completedAt: '2026-07-17T10:20:00+08:00' });
    const sections = selectTodaySections({ ...seed, tasks: [scheduled, unscheduled, completed] }, '2026-07-17');
    expect(sections.scheduled.map((task) => task.id)).toEqual(['scheduled']);
    expect(sections.unscheduled.map((task) => task.id)).toEqual(['unscheduled']);
    expect(sections.completed.map((task) => task.id)).toEqual(['completed']);
  });

  it('shows current planned and actual completion entries without duplication', () => {
    const seed = createSeedData(new Date(at));
    const sameDay = calendarTask({ status: 'completed', plannedDate: '2026-07-17', plannedStartAt: '2026-07-17T09:00:00+08:00', plannedEndAt: '2026-07-17T09:30:00+08:00', completedAt: '2026-07-17T09:24:00+08:00' });
    expect(selectCalendarEntriesForDate({ ...seed, tasks: [sameDay] }, '2026-07-17')).toMatchObject([{ kind: 'plannedCompleted' }]);

    const splitDates = { ...sameDay, plannedDate: '2026-07-18', plannedStartAt: '2026-07-18T09:00:00+08:00', plannedEndAt: '2026-07-18T09:30:00+08:00' };
    expect(selectCalendarEntriesForDate({ ...seed, tasks: [splitDates] }, '2026-07-17')).toMatchObject([{ kind: 'completed' }]);
    expect(selectCalendarEntriesForDate({ ...seed, tasks: [splitDates] }, '2026-07-18')).toMatchObject([{ kind: 'planned' }]);
  });

  it('keeps the original day planned denominator and deferred outcome after later completion', () => {
    let data = createSeedData(new Date(at));
    const before = deriveDailyReviewFacts(data, '2026-07-17');
    data = domainReducer(data, { type: 'deferTask', taskId: 'task-client-quote', destination: { date: '2026-07-18' }, at: '2026-07-17T20:00:00+08:00' });
    data = domainReducer(data, { type: 'completeTask', taskId: 'task-client-quote', at: '2026-07-18T09:00:00+08:00' });
    const originalDay = deriveDailyReviewFacts(data, '2026-07-17');
    expect(originalDay.plannedCount).toBe(before.plannedCount);
    expect(originalDay.taskOutcomes.find((outcome) => outcome.taskId === 'task-client-quote')).toMatchObject({ outcome: 'deferred', deferredTo: '2026-07-18' });
    expect(deriveDailyReviewFacts(data, '2026-07-18').taskOutcomes.find((outcome) => outcome.taskId === 'task-client-quote')).toMatchObject({ outcome: 'completedAsPlanned' });
  });

  it('splits a TimeEntry by its actual overlap with local day ranges', () => {
    const seed = createSeedData(new Date(at));
    const data = {
      ...seed,
      timeEntries: [{ id: 'cross-midnight', taskId: 'task-reflow-demo', startedAt: '2026-07-17T23:50:00+08:00', endedAt: '2026-07-18T00:10:00+08:00', minutes: 20 }],
    };
    expect(deriveDailyReviewFacts(data, '2026-07-17').actualMinutes).toBe(10);
    expect(deriveDailyReviewFacts(data, '2026-07-18').actualMinutes).toBe(10);
  });

  it('reflects start and completion changes through current task selectors', () => {
    let data = createSeedData(new Date(at));
    data = domainReducer(data, { type: 'startTask', taskId: 'task-client-quote', at });
    expect(selectCurrentTask(data)?.id).toBe('task-client-quote');
    data = domainReducer(data, { type: 'completeTask', taskId: 'task-client-quote', at });
    expect(selectCurrentTask(data)).toBeUndefined();
  });

  it('derives the latest current execution segment and delayed planning state without persisted fields', () => {
    const seed = createSeedData(new Date(at));
    const task = calendarTask({ status: 'inProgress', plannedStartAt: '2026-07-17T07:00:00+08:00', plannedEndAt: '2026-07-17T07:45:00+08:00' });
    const data = {
      ...seed,
      tasks: [task],
      progressLogs: [
        { id: 'start-1', taskId: task.id, kind: 'start' as const, text: '开始', createdAt: '2026-07-17T17:00:00+08:00' },
        { id: 'pause', taskId: task.id, kind: 'pause' as const, text: '暂停', createdAt: '2026-07-17T17:30:00+08:00' },
        { id: 'invalid-start', taskId: task.id, kind: 'start' as const, text: '无效', createdAt: 'invalid-date' },
        { id: 'start-2', taskId: task.id, kind: 'start' as const, text: '继续', createdAt: '2026-07-17T18:00:00+08:00' },
      ],
    };

    expect(selectCurrentExecutionSession(data, task.id)).toEqual({ startedAt: '2026-07-17T18:00:00+08:00', resumed: true });
    expect(selectCurrentExecutionSession({ ...data, progressLogs: [] }, task.id)).toBeUndefined();
    expect(selectCurrentExecutionSession({ ...data, tasks: [{ ...task, status: 'notStarted' }] }, task.id)).toBeUndefined();
    expect(isTaskDelayed({ ...task, status: 'notStarted' }, new Date('2026-07-17T17:00:00+08:00'))).toBe(true);
    expect(isTaskDelayed(task, new Date('2026-07-17T17:00:00+08:00'))).toBe(false);
  });

  it('maps separated dimensions into all visible classifications and limits recent decisions', () => {
    const seed = createSeedData(new Date(at));
    expect(selectProposalVisibleClassification(seed, 'proposal-waiting')).toBe('waiting');
    expect(selectProposalVisibleClassification(seed, 'proposal-someday')).toBe('someday');
    expect(selectProposalVisibleClassification(seed, 'proposal-knowledge')).toBe('knowledge');
    const decisions = Array.from({ length: 6 }, (_, index) => ({ id: `decision-${index}`, captureId: 'capture-contract', proposalId: 'proposal-contract', kind: 'ignore' as const, outcome: 'ignored' as const, appliedAt: `2026-07-17T0${index}:00:00+08:00`, status: 'applied' as const, effect: { type: 'ignored' as const } }));
    expect(selectRecentDecisions({ ...seed, decisions })).toHaveLength(5);
  });

  it('counts failed captures together with pending proposals for Inbox attention', () => {
    const seed = createSeedData(new Date(at));
    const failed = {
      ...seed.captures[0],
      pipelineState: 'proposalFailed' as const,
      failure: { code: 'proposal_unavailable' as const, message: '暂时不可用', retryable: true },
    };
    const data = {
      ...seed,
      captures: [failed, ...seed.captures.slice(1)],
      proposals: seed.proposals.map((proposal) => ({ ...proposal, status: 'accepted' as const })),
    };
    expect(selectInboxAttentionCount(data)).toBe(1);
  });

  it('surfaces overdue, due waiting, and cross-day active tasks without duplicating them', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const overdue = { ...seed.tasks[1], id: 'overdue', status: 'notStarted' as const, plannedDate: '2026-07-16' };
    const waiting = { ...seed.tasks[1], id: 'waiting', status: 'notStarted' as const, bucket: 'waiting' as const, plannedDate: undefined, plannedStartAt: undefined, plannedEndAt: undefined, waitingDetails: { waitingFor: '供应商', waitingOn: '送货时间', followUpDate: '2026-07-17' } };
    const data = {
      ...seed,
      tasks: [
        { ...seed.tasks[0], plannedDate: '2026-07-16' },
        overdue,
        waiting,
      ],
    };

    expect(selectNeedsAttention(data, '2026-07-17').map((item) => [item.kind, item.task.id])).toEqual([
      ['crossDayActive', 'task-reflow-demo'],
      ['overdue', 'overdue'],
      ['waitingDue', 'waiting'],
    ]);
    expect(selectNeedsAttention(data, '2026-07-16')).toEqual([]);
  });
});
