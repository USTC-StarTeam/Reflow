import { describe, expect, it } from '@jest/globals';

import { createSeedData } from '../demo-data';
import { domainReducer } from '../reducer';

const now = '2026-07-17T08:00:00.000Z';

describe('domainReducer', () => {
  it('accepts an edited proposal into today', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const result = domainReducer(seed, {
      type: 'acceptProposal', proposalId: 'proposal-contract', bucket: 'today', at: now,
      edited: { title: '审阅新版合同', category: 'work', estimatedMinutes: 35, nextAction: '标记风险条款' },
    });
    expect(result.proposals.find((item) => item.id === 'proposal-contract')?.status).toBe('accepted');
    expect(result.tasks.some((task) => task.title === '审阅新版合同' && task.bucket === 'today')).toBe(true);
  });

  it('allows only one current task and supports pause/complete', () => {
    let data = createSeedData(new Date('2026-07-17T12:00:00'));
    data = domainReducer(data, { type: 'startTask', taskId: 'task-client-quote', at: now });
    expect(data.tasks.filter((task) => task.status === 'inProgress')).toHaveLength(1);
    expect(data.tasks.find((task) => task.id === 'task-client-quote')?.status).toBe('inProgress');
    expect(data.tasks.find((task) => task.id === 'task-reflow-demo')?.status).toBe('notStarted');
    data = domainReducer(data, { type: 'completeTask', taskId: 'task-client-quote', at: now });
    expect(data.tasks.find((task) => task.id === 'task-client-quote')?.status).toBe('completed');
  });

  it('records time as a fact separate from task state', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const result = domainReducer(seed, { type: 'recordTime', taskId: 'task-reflow-demo', minutes: 15, at: now });
    expect(result.timeEntries.filter((entry) => entry.taskId === 'task-reflow-demo').reduce((sum, entry) => sum + entry.minutes, 0)).toBe(60);
  });

  it('records interruptions through an explicit domain action', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const result = domainReducer(seed, { type: 'recordInterruption', taskId: 'task-reflow-demo', text: '临时会议', at: now });
    expect(result.progressLogs.some((log) => log.taskId === 'task-reflow-demo' && log.kind === 'interrupt' && log.text === '临时会议')).toBe(true);
  });
});
