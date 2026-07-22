import { describe, expect, it } from '@jest/globals';

import { createSeedData } from '../demo-data';
import { isDomainData, parseBackup, parseStoredData, parseStoredDataWithRecovery, serializeBackup } from '../persistence';

const now = new Date('2026-07-17T12:00:00+08:00');

describe('persistence v4', () => {
  const fallback = createSeedData(now);

  it('round-trips v4 domain data including immutable plan events', () => {
    const restored = parseStoredData(JSON.stringify(fallback), createSeedData(new Date('2026-01-01T12:00:00+08:00')), now);
    expect(restored).toEqual(fallback);
    expect(isDomainData(restored)).toBe(true);
    expect(restored.taskPlanEvents.length).toBeGreaterThan(0);
  });

  it('migrates v3 planned times and legacy today tasks to plannedDate with synthetic events', () => {
    const legacy = JSON.parse(JSON.stringify(fallback)) as Record<string, unknown>;
    legacy.version = 3;
    delete legacy.taskPlanEvents;
    legacy.tasks = (legacy.tasks as Record<string, unknown>[]).map(({ plannedDate: _plannedDate, deletedAt: _deletedAt, ...task }) => task);
    const restored = parseStoredData(JSON.stringify(legacy), fallback, now);
    expect(restored.version).toBe(4);
    expect(restored.tasks.find((task) => task.id === 'task-client-quote')?.plannedDate).toBe('2026-07-17');
    expect(restored.taskPlanEvents.find((event) => event.taskId === 'task-client-quote')).toMatchObject({ source: 'migration', kind: 'scheduled' });
  });

  it('migrates v1 captures through v2 and v3 without UI state', () => {
    const legacy = JSON.parse(JSON.stringify(fallback)) as Record<string, unknown>;
    legacy.version = 1;
    delete legacy.taskPlanEvents;
    delete legacy.decisions;
    legacy.tasks = (legacy.tasks as Record<string, unknown>[]).map(({ plannedDate: _plannedDate, deletedAt: _deletedAt, ...task }) => task);
    legacy.captures = (legacy.captures as Record<string, unknown>[]).map((capture) => ({ id: capture.id, rawText: capture.rawText, source: capture.source === 'email' ? '邮件' : '手动输入', createdAt: capture.createdAt, parseStatus: capture.pipelineState === 'proposed' ? 'organized' : 'resolved' }));
    legacy.knowledgeCards = (legacy.knowledgeCards as Record<string, unknown>[]).map(({ createdAt: _createdAt, ...card }) => card);
    const restored = parseStoredData(JSON.stringify(legacy), fallback, now);
    expect(restored.version).toBe(4);
    expect(restored.decisions).toEqual([]);
    expect(restored.captures[0]).toMatchObject({ source: 'email', pipelineState: 'proposed' });
  });

  it('uses a valid recovery copy when the primary value is corrupt', () => {
    expect(parseStoredDataWithRecovery('{broken', JSON.stringify(fallback), createSeedData(new Date('2026-01-01T12:00:00+08:00')), now)).toEqual(fallback);
  });

  it('serializes and validates a versioned backup envelope', () => {
    const result = parseBackup(serializeBackup(fallback, now), now);
    expect(result).toMatchObject({ status: 'success', counts: { tasks: fallback.tasks.length, taskPlanEvents: fallback.taskPlanEvents.length } });
  });

  it.each([
    ['duplicate IDs', (data: typeof fallback) => ({ ...data, tasks: [...data.tasks, data.tasks[0]] })],
    ['broken references', (data: typeof fallback) => ({ ...data, timeEntries: [{ ...data.timeEntries[0], taskId: 'missing-task' }] })],
    ['cross-day schedule', (data: typeof fallback) => ({ ...data, tasks: data.tasks.map((task) => task.id === 'task-client-quote' ? { ...task, plannedStartAt: '2026-07-17T23:30:00+08:00', plannedEndAt: '2026-07-18T00:30:00+08:00' } : task) })],
  ])('rejects %s without changing the supplied valid state', (_name, mutate) => {
    const before = JSON.stringify(fallback);
    const envelope = JSON.parse(serializeBackup(fallback, now));
    envelope.data = mutate(fallback);
    expect(parseBackup(JSON.stringify(envelope), now)).toMatchObject({ status: 'failure' });
    expect(JSON.stringify(fallback)).toBe(before);
  });

  it('falls back for corrupt or future primary data', () => {
    expect(parseStoredData('{broken', fallback, now)).toEqual(fallback);
    expect(parseStoredData(JSON.stringify({ ...fallback, version: 99 }), fallback, now)).toEqual(fallback);
  });
});
