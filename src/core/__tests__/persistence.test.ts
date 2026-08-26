import { describe, expect, it } from '@jest/globals';

import { createEmptyData, createSeedData } from '../demo-data';
import { isDomainData, loadStoredDataWithRecovery, parseBackup, parseStoredData, parseStoredDataWithRecovery, serializeBackup } from '../persistence';

const now = new Date('2026-07-17T12:00:00+08:00');

describe('persistence v4', () => {
  const fallback = createSeedData(now);

  it('round-trips v4 domain data including immutable plan events', () => {
    const restored = parseStoredData(JSON.stringify(fallback), createSeedData(new Date('2026-01-01T12:00:00+08:00')), now);
    expect(restored).toEqual(fallback);
    expect(isDomainData(restored)).toBe(true);
    expect(restored.taskPlanEvents.length).toBeGreaterThan(0);
  });

  it('round-trips an explicitly confirmed execution correction without changing the persistence version', () => {
    const confirmedAt = '2026-07-17T12:00:00+08:00';
    const data = {
      ...fallback,
      timeEntries: fallback.timeEntries.map((entry, index) => index === 0 ? { ...entry, confirmedAt } : entry),
    };
    const restored = parseStoredData(JSON.stringify(data), createEmptyData(), now);
    expect(restored.timeEntries[0].confirmedAt).toBe(confirmedAt);
    expect(restored.version).toBe(fallback.version);
  });

  it('recovers captured and proposing inputs as visible retryable failures', () => {
    const interrupted = {
      ...fallback,
      captures: fallback.captures.map((capture, index) => index === 0
        ? { ...capture, pipelineState: 'captured' as const }
        : index === 1 ? { ...capture, pipelineState: 'proposing' as const } : capture),
    };
    const restored = parseStoredData(JSON.stringify(interrupted), createEmptyData(), now);
    expect(restored.captures.slice(0, 2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ pipelineState: 'proposalFailed', failure: expect.objectContaining({ retryable: true }) }),
      expect.objectContaining({ pipelineState: 'proposalFailed', failure: expect.objectContaining({ retryable: true }) }),
    ]));
    expect(restored.captures[0].rawText).toBe(interrupted.captures[0].rawText);
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
    expect(loadStoredDataWithRecovery('{broken', JSON.stringify(fallback), now)).toEqual({ status: 'success', data: fallback, source: 'recovery' });
    expect(parseStoredDataWithRecovery('{broken', JSON.stringify(fallback), createSeedData(new Date('2026-01-01T12:00:00+08:00')), now)).toEqual(fallback);
  });

  it('creates, persists, exports and restores valid empty domain data when no local data exists', () => {
    const empty = createEmptyData();
    expect(empty).not.toEqual(fallback);
    expect(isDomainData(empty)).toBe(true);
    expect(loadStoredDataWithRecovery(null, null, now)).toEqual({ status: 'no-data' });
    expect(parseBackup(serializeBackup(empty, now), now)).toMatchObject({ status: 'success', data: empty });
  });

  it('prefers valid primary data over a recovery copy', () => {
    const recovery = createSeedData(new Date('2026-01-01T12:00:00+08:00'));
    expect(loadStoredDataWithRecovery(JSON.stringify(fallback), JSON.stringify(recovery), now)).toEqual({ status: 'success', data: fallback, source: 'primary' });
  });

  it('reports recovery failure when stored values exist but neither is valid', () => {
    expect(loadStoredDataWithRecovery('{broken', JSON.stringify({ version: 99 }), now)).toEqual({ status: 'failure' });
  });

  it('serializes and validates a versioned backup envelope', () => {
    const result = parseBackup(serializeBackup(fallback, now), now);
    expect(result).toMatchObject({ status: 'success', counts: { tasks: fallback.tasks.length, taskPlanEvents: fallback.taskPlanEvents.length } });
  });

  it('round-trips mixed legacy and Cloud proposals with nullable draft fields', () => {
    const captureId = fallback.captures[0].id;
    const cloudProposal = {
      id: 'proposal-cloud-nullable',
      captureId,
      outcome: 'task' as const,
      title: '待补充的云端建议',
      category: 'unknown' as const,
      estimatedMinutes: null,
      confidence: 0.42,
      reason: '输入信息不足，等待用户补充。',
      kind: 'create' as const,
      status: 'pending' as const,
      nextAction: null,
      waitingDetails: null,
      knowledgeSummary: null,
      provider: 'cloud' as const,
    };
    const mixed = {
      ...fallback,
      proposals: [
        ...fallback.proposals.map(({ provider: _provider, ...proposal }) => proposal),
        cloudProposal,
      ],
    };
    const restored = parseStoredData(JSON.stringify(mixed), fallback, now);
    expect(restored.proposals.find((proposal) => proposal.id === cloudProposal.id)).toEqual(cloudProposal);
    expect(restored.proposals[0].provider).toBeUndefined();

    const backup = parseBackup(serializeBackup(mixed, now), now);
    expect(backup).toMatchObject({
      status: 'success',
      data: {
        proposals: expect.arrayContaining([
          expect.objectContaining({
            id: cloudProposal.id,
            estimatedMinutes: null,
            nextAction: null,
            provider: 'cloud',
          }),
        ]),
      },
    });
  });

  it('accepts a full nullable waiting draft and rejects missing waiting keys', () => {
    const waitingProposal = {
      id: 'proposal-cloud-waiting',
      captureId: fallback.captures[0].id,
      outcome: 'task' as const,
      title: '等待反馈',
      category: 'communication' as const,
      estimatedMinutes: null,
      confidence: 0.8,
      reason: '需要等待外部反馈。',
      kind: 'create' as const,
      status: 'pending' as const,
      nextAction: null,
      suggestedBucket: 'waiting' as const,
      waitingDetails: { waitingFor: null, waitingOn: null, followUpDate: null },
      knowledgeSummary: null,
      provider: 'cloud' as const,
    };
    const valid = { ...fallback, proposals: [...fallback.proposals, waitingProposal] };
    expect(isDomainData(valid)).toBe(true);

    const invalid = JSON.parse(JSON.stringify(valid));
    delete invalid.proposals.at(-1).waitingDetails.followUpDate;
    expect(parseStoredData(JSON.stringify(invalid), fallback, now)).toEqual(fallback);
    const envelope = JSON.parse(serializeBackup(valid, now));
    delete envelope.data.proposals.at(-1).waitingDetails.waitingOn;
    expect(parseBackup(JSON.stringify(envelope), now)).toMatchObject({ status: 'failure' });
  });

  it('does not include transient provider mode or Gateway configuration in backups', () => {
    const serialized = serializeBackup(fallback, now);
    expect(serialized).not.toContain('EXPO_PUBLIC_PROPOSAL_MODE');
    expect(serialized).not.toContain('EXPO_PUBLIC_AI_GATEWAY_URL');
    expect(serialized).not.toContain('proposalServiceKind');
  });

  it.each([
    ['duplicate IDs', (data: typeof fallback) => ({ ...data, tasks: [...data.tasks, data.tasks[0]] })],
    ['broken references', (data: typeof fallback) => ({ ...data, timeEntries: [{ ...data.timeEntries[0], taskId: 'missing-task' }] })],
    ['cross-day schedule', (data: typeof fallback) => ({ ...data, tasks: data.tasks.map((task) => task.id === 'task-client-quote' ? { ...task, plannedStartAt: '2026-07-17T23:30:00+08:00', plannedEndAt: '2026-07-18T00:30:00+08:00' } : task) })],
    ['invalid task waitingDetails', (data: typeof fallback) => ({ ...data, tasks: data.tasks.map((task) => task.id === 'task-client-quote' ? { ...task, waitingDetails: { waitingFor: '客户', waitingOn: 123, followUpDate: '2026-07-20' } } : task) })],
    ['blank waiting target', (data: typeof fallback) => ({ ...data, tasks: data.tasks.map((task) => task.id === 'task-client-quote' ? { ...task, waitingDetails: { waitingFor: '   ', waitingOn: '确认报价', followUpDate: '2026-07-20' } } : task) })],
    ['blank waiting content', (data: typeof fallback) => ({ ...data, tasks: data.tasks.map((task) => task.id === 'task-client-quote' ? { ...task, waitingDetails: { waitingFor: '客户', waitingOn: '', followUpDate: '2026-07-20' } } : task) })],
    ['invalid waiting follow-up date', (data: typeof fallback) => ({ ...data, tasks: data.tasks.map((task) => task.id === 'task-client-quote' ? { ...task, waitingDetails: { waitingFor: '客户', waitingOn: '确认报价', followUpDate: '2026-02-30' } } : task) })],
  ])('rejects %s without changing the supplied valid state', (_name, mutate) => {
    const before = JSON.stringify(fallback);
    const envelope = JSON.parse(serializeBackup(fallback, now));
    envelope.data = mutate(fallback);
    expect(parseBackup(JSON.stringify(envelope), now)).toMatchObject({ status: 'failure' });
    expect(JSON.stringify(fallback)).toBe(before);
  });

  it('uses the caller-supplied fallback for corrupt or future primary data', () => {
    const explicitFallback = createEmptyData();
    expect(parseStoredData('{broken', explicitFallback, now)).toEqual(explicitFallback);
    expect(parseStoredData(JSON.stringify({ ...fallback, version: 99 }), explicitFallback, now)).toEqual(explicitFallback);
  });
});
