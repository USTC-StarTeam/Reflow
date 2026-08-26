import { describe, expect, it } from '@jest/globals';

import { createSeedData } from '../demo-data';
import { domainReducer, reduceDomain } from '../reducer';

const now = '2026-07-17T08:00:00.000+08:00';
const taskEdit = { title: '审阅新版合同', category: 'work' as const, estimatedMinutes: 35, nextAction: '标记风险条款' };

describe('domain reducer', () => {
  it('creates formal tasks only after an explicit user decision and can undo it', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const beforeTaskCount = seed.tasks.length;
    const transition = reduceDomain(seed, { type: 'submitUserDecision', decisionId: 'decision-contract', at: now, decision: { kind: 'accept', proposalId: 'proposal-contract', bucket: 'today', plannedDate: '2026-07-17', edited: taskEdit } });
    expect(transition).toMatchObject({ status: 'success' });
    if (transition.status !== 'success') throw new Error('expected success');
    expect(transition.data.tasks).toHaveLength(beforeTaskCount + 1);
    expect(transition.data.decisions[0]).toMatchObject({ id: 'decision-contract', outcome: 'task', status: 'applied' });
    const undone = reduceDomain(transition.data, { type: 'undoUserDecision', decisionId: 'decision-contract', at: '2026-07-17T08:05:00.000Z' });
    expect(undone).toMatchObject({ status: 'success' });
    expect(undone.data.tasks.filter((task) => !task.deletedAt)).toHaveLength(beforeTaskCount);
    expect(undone.data.taskPlanEvents.some((event) => event.source === 'decisionUndo' && event.kind === 'cancelled')).toBe(true);
    expect(undone.data.proposals.find((item) => item.id === 'proposal-contract')?.status).toBe('pending');
    expect(undone.data.decisions[0].status).toBe('reverted');
  });

  it('keeps Cloud suggestions as drafts until required fields are completed and confirmed', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const capture = {
      id: 'capture-cloud',
      rawText: '下周整理项目说明',
      source: 'webText' as const,
      createdAt: now,
      pipelineState: 'proposing' as const,
    };
    const proposal = {
      id: 'proposal-cloud',
      captureId: capture.id,
      outcome: 'task' as const,
      title: '整理项目说明',
      category: 'work' as const,
      estimatedMinutes: null,
      confidence: 0.76,
      reason: '识别为工作任务，但需要补充执行信息。',
      kind: 'create' as const,
      status: 'pending' as const,
      nextAction: null,
      suggestedBucket: 'today' as const,
      suggestedDate: '2026-07-21' as const,
      waitingDetails: null,
      knowledgeSummary: null,
      provider: 'cloud' as const,
    };
    const pipelineData = { ...seed, captures: [...seed.captures, capture] };
    const received = reduceDomain(pipelineData, {
      type: 'proposalReceived',
      captureId: capture.id,
      proposals: [proposal],
    });
    expect(received).toMatchObject({ status: 'success' });
    expect(received.data.tasks).toHaveLength(seed.tasks.length);
    expect(received.data.knowledgeCards).toHaveLength(seed.knowledgeCards.length);

    const invalid = reduceDomain(received.data, {
      type: 'submitUserDecision',
      decisionId: 'decision-cloud-invalid',
      at: now,
      decision: {
        kind: 'accept',
        proposalId: proposal.id,
        bucket: 'today',
        plannedDate: proposal.suggestedDate,
        edited: {
          title: proposal.title,
          category: proposal.category,
          estimatedMinutes: 0,
          nextAction: '',
        },
      },
    });
    expect(invalid).toMatchObject({
      status: 'failure',
      failure: { code: 'invalid_decision' },
      data: received.data,
    });

    const accepted = reduceDomain(received.data, {
      type: 'submitUserDecision',
      decisionId: 'decision-cloud',
      at: now,
      decision: {
        kind: 'accept',
        proposalId: proposal.id,
        bucket: 'today',
        plannedDate: proposal.suggestedDate,
        edited: {
          title: proposal.title,
          category: proposal.category,
          estimatedMinutes: 45,
          nextAction: '列出项目说明的三个章节',
        },
      },
    });
    expect(accepted).toMatchObject({ status: 'success' });
    expect(accepted.data.tasks.find((task) => task.title === proposal.title))
      .toMatchObject({ plannedDate: '2026-07-21', estimatedMinutes: 45 });
    expect(accepted.data.decisions.at(-1)).toMatchObject({
      outcome: 'task',
      edited: { nextAction: '列出项目说明的三个章节' },
    });
  });

  it('does not infer today when a confirmed task omitted its planned date', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const beforeTaskCount = seed.tasks.length;
    const result = reduceDomain(seed, {
      type: 'submitUserDecision',
      decisionId: 'decision-no-today-fallback',
      at: now,
      decision: { kind: 'accept', proposalId: 'proposal-contract', bucket: 'today', edited: taskEdit },
    });
    expect(result).toMatchObject({
      status: 'failure',
      failure: { code: 'invalid_schedule' },
    });
    expect(result.data.tasks).toHaveLength(beforeTaskCount);
  });

  it('creates a knowledge outcome without creating a task', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const capture = { id: 'capture-knowledge', rawText: '沉淀报价原则', source: 'webText' as const, createdAt: now, pipelineState: 'proposed' as const };
    const proposal = { id: 'proposal-knowledge', captureId: capture.id, outcome: 'knowledge' as const, title: '报价沟通原则', category: 'learning' as const, estimatedMinutes: 0, confidence: 0.9, reason: '测试', kind: 'create' as const, status: 'pending' as const, nextAction: '保存', knowledgeSummary: '先确认预算口径' };
    const data = { ...seed, captures: [...seed.captures, capture], proposals: [...seed.proposals, proposal] };
    const result = reduceDomain(data, { type: 'submitUserDecision', decisionId: 'decision-knowledge', at: now, decision: { kind: 'accept', proposalId: proposal.id, edited: { title: proposal.title, category: proposal.category, estimatedMinutes: 0, nextAction: '保存', knowledgeSummary: '先确认预算口径' } } });
    expect(result).toMatchObject({ status: 'success' });
    expect(result.data.tasks).toHaveLength(seed.tasks.length);
    expect(result.data.knowledgeCards.some((card) => card.title === proposal.title)).toBe(true);
  });

  it('supports ignored, waiting, someday and merged decisions', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const ignored = reduceDomain(seed, { type: 'submitUserDecision', decisionId: 'decision-ignore', at: now, decision: { kind: 'ignore', proposalId: 'proposal-contract' } });
    expect(ignored).toMatchObject({ status: 'success' });
    expect(ignored.data.decisions[0].outcome).toBe('ignored');

    const waiting = reduceDomain(seed, { type: 'submitUserDecision', decisionId: 'decision-waiting', at: now, decision: { kind: 'accept', proposalId: 'proposal-waiting', bucket: 'waiting', edited: { title: '等待供应商确认送货时间', category: 'communication', estimatedMinutes: 10, nextAction: '等待确认', visibleClassification: 'waiting', waitingDetails: { waitingFor: '供应商', waitingOn: '确认送货时间', followUpDate: '2026-07-20' } } } });
    expect(waiting.data.tasks.find((task) => task.title === '等待供应商确认送货时间')).toMatchObject({ bucket: 'waiting', waitingDetails: { waitingFor: '供应商', followUpDate: '2026-07-20' } });

    const merged = reduceDomain(seed, { type: 'submitUserDecision', decisionId: 'decision-merge', at: now, decision: { kind: 'accept', proposalId: 'proposal-duplicate-quote', bucket: 'someday', edited: { title: '确认客户报价', category: 'communication', estimatedMinutes: 20, nextAction: '回复客户' } } });
    expect(merged.data.tasks.find((task) => task.id === 'task-client-quote')).toMatchObject({
      title: '确认客户报价',
      category: 'communication',
      bucket: 'someday',
      estimatedMinutes: 20,
      nextAction: '回复客户',
    });
  });

  it('trims whitespace from accepted task title and next action', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const created = reduceDomain(seed, { type: 'submitUserDecision', decisionId: 'decision-trim-create', at: now, decision: { kind: 'accept', proposalId: 'proposal-contract', bucket: 'today', plannedDate: '2026-07-17', edited: { title: '  审阅新版合同  ', category: 'work', estimatedMinutes: 35, nextAction: ' 标记风险条款 ' } } });
    expect(created).toMatchObject({ status: 'success' });
    expect(created.data.tasks.find((task) => task.id === 'task-decision-trim-create-0'))
      .toMatchObject({ title: '审阅新版合同', nextAction: '标记风险条款' });

    const merged = reduceDomain(seed, { type: 'submitUserDecision', decisionId: 'decision-trim-merge', at: now, decision: { kind: 'accept', proposalId: 'proposal-duplicate-quote', bucket: 'someday', edited: { title: '  确认客户报价  ', category: 'communication', estimatedMinutes: 20, nextAction: ' 回复客户 ' } } });
    expect(merged).toMatchObject({ status: 'success' });
    expect(merged.data.tasks.find((task) => task.id === 'task-client-quote'))
      .toMatchObject({ title: '确认客户报价', nextAction: '回复客户' });
    expect(merged.data.decisions[0]).toMatchObject({ edited: { title: '确认客户报价', nextAction: '回复客户' } });
  });

  it('persists a custom waiting follow-up date in the decision and restores the proposal on undo', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const result = reduceDomain(seed, {
      type: 'submitUserDecision', decisionId: 'decision-custom-follow-up', at: now,
      decision: { kind: 'accept', proposalId: 'proposal-waiting', bucket: 'waiting', edited: { title: '等待供应商确认送货时间', category: 'communication', estimatedMinutes: 10, nextAction: '7 月 24 日跟进', visibleClassification: 'waiting', waitingDetails: { waitingFor: '供应商', waitingOn: '确认送货时间', followUpDate: '2026-07-24' } } },
    });
    expect(result).toMatchObject({ status: 'success' });
    if (result.status !== 'success') throw new Error('expected waiting decision');
    expect(result.data.decisions[0].edited?.waitingDetails?.followUpDate).toBe('2026-07-24');
    const undone = reduceDomain(result.data, { type: 'undoUserDecision', decisionId: 'decision-custom-follow-up', at: '2026-07-17T08:05:00.000Z' });
    expect(undone).toMatchObject({ status: 'success' });
    expect(undone.data.proposals.find((proposal) => proposal.id === 'proposal-waiting')?.status).toBe('pending');
  });

  it('uses the selected visible classification to create knowledge or convert it back into a task', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const asKnowledge = reduceDomain(seed, {
      type: 'submitUserDecision', decisionId: 'decision-as-knowledge', at: now,
      decision: { kind: 'accept', proposalId: 'proposal-contract', edited: { ...taskEdit, visibleClassification: 'knowledge', knowledgeSummary: '合同付款条款风险' } },
    });
    expect(asKnowledge.data.knowledgeCards.some((card) => card.title === taskEdit.title)).toBe(true);

    const asTask = reduceDomain(seed, {
      type: 'submitUserDecision', decisionId: 'decision-as-task', at: now,
      decision: { kind: 'accept', proposalId: 'proposal-knowledge', bucket: 'today', plannedDate: '2026-07-17', edited: { title: '整理报价原则', category: 'learning', estimatedMinutes: 20, nextAction: '形成行动清单', visibleClassification: 'learning' } },
    });
    expect(asTask.data.tasks.find((task) => task.title === '整理报价原则')).toMatchObject({ category: 'learning', bucket: 'today' });
    expect(asTask.data.decisions[0]).toMatchObject({ outcome: 'task', edited: { visibleClassification: 'learning' } });
  });

  it('rejects an invalid waiting date without writing any domain data', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const result = reduceDomain(seed, {
      type: 'submitUserDecision', decisionId: 'decision-invalid-follow-up', at: now,
      decision: { kind: 'accept', proposalId: 'proposal-waiting', bucket: 'waiting', edited: { title: '等待供应商确认送货时间', category: 'communication', estimatedMinutes: 10, nextAction: '等待确认', visibleClassification: 'waiting', waitingDetails: { waitingFor: '供应商', waitingOn: '确认送货时间', followUpDate: 'not-a-date' } } },
    });
    expect(result).toMatchObject({ status: 'failure', failure: { code: 'invalid_follow_up' }, data: seed });
  });

  it('returns explicit failures for invalid actions and unsafe undo', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    expect(reduceDomain(seed, { type: 'recordTime', taskId: 'missing', minutes: 15, at: now })).toMatchObject({ status: 'failure', failure: { code: 'task_not_found' } });
    expect(reduceDomain(seed, { type: 'recordTime', taskId: 'task-reflow-demo', minutes: 0, at: now })).toMatchObject({ status: 'failure', failure: { code: 'invalid_time' } });
    expect(reduceDomain(seed, { type: 'scheduleTask', taskId: 'task-reflow-demo', startAt: now, endAt: now, at: now })).toMatchObject({ status: 'failure', failure: { code: 'invalid_schedule' } });

    const accepted = domainReducer(seed, { type: 'submitUserDecision', decisionId: 'decision-exec', at: now, decision: { kind: 'accept', proposalId: 'proposal-contract', bucket: 'today', plannedDate: '2026-07-17', edited: taskEdit } });
    const createdTask = accepted.tasks.find((task) => task.title === taskEdit.title);
    if (!createdTask) throw new Error('expected created task');
    const executed = domainReducer(accepted, { type: 'recordTime', taskId: createdTask.id, minutes: 15, at: now });
    expect(reduceDomain(executed, { type: 'undoUserDecision', decisionId: 'decision-exec', at: now })).toMatchObject({ status: 'failure', failure: { code: 'decision_not_reversible' } });
  });

  it('closes start, pause, resume, and complete into actual execution intervals', () => {
    let data = createSeedData(new Date('2026-07-17T09:00:00+08:00'));
    data = { ...data, tasks: data.tasks.map((task) => ({ ...task, status: 'notStarted' })), progressLogs: [], timeEntries: [] };
    data = domainReducer(data, { type: 'startTask', taskId: 'task-client-quote', at: '2026-07-17T10:00:00+08:00' });
    data = domainReducer(data, { type: 'pauseTask', taskId: 'task-client-quote', at: '2026-07-17T10:35:00+08:00' });
    data = domainReducer(data, { type: 'startTask', taskId: 'task-client-quote', at: '2026-07-17T11:20:00+08:00' });
    data = domainReducer(data, { type: 'completeTask', taskId: 'task-client-quote', at: '2026-07-17T11:50:00+08:00' });

    expect(data.timeEntries.map((entry) => ({ startedAt: entry.startedAt, endedAt: entry.endedAt, minutes: entry.minutes }))).toEqual([
      { startedAt: '2026-07-17T10:00:00+08:00', endedAt: '2026-07-17T10:35:00+08:00', minutes: 35 },
      { startedAt: '2026-07-17T11:20:00+08:00', endedAt: '2026-07-17T11:50:00+08:00', minutes: 30 },
    ]);
    expect(data.tasks.find((task) => task.id === 'task-client-quote')?.status).toBe('completed');
  });

  it('requires an explicit decision for cross-day or overlong execution and never caps it automatically', () => {
    let crossDay = createSeedData(new Date('2026-07-17T09:00:00+08:00'));
    crossDay = { ...crossDay, tasks: crossDay.tasks.map((task) => ({ ...task, status: 'notStarted' })), progressLogs: [], timeEntries: [] };
    crossDay = domainReducer(crossDay, { type: 'startTask', taskId: 'task-client-quote', at: '2026-07-16T23:30:00+08:00' });

    expect(reduceDomain(crossDay, { type: 'pauseTask', taskId: 'task-client-quote', at: '2026-07-17T12:00:00+08:00' })).toMatchObject({
      status: 'failure',
      failure: { code: 'invalid_time' },
      data: crossDay,
    });

    const kept = domainReducer(crossDay, { type: 'pauseTask', taskId: 'task-client-quote', at: '2026-07-17T12:00:00+08:00', timeDecision: { kind: 'keep' } });
    expect(kept.timeEntries).toEqual([expect.objectContaining({ minutes: 750, endedAt: '2026-07-17T12:00:00+08:00', confirmedAt: '2026-07-17T12:00:00+08:00' })]);

    let overlong = createSeedData(new Date('2026-07-17T09:00:00+08:00'));
    overlong = { ...overlong, tasks: overlong.tasks.map((task) => ({ ...task, status: 'notStarted' })), progressLogs: [], timeEntries: [] };
    overlong = domainReducer(overlong, { type: 'startTask', taskId: 'task-client-quote', at: '2026-07-17T08:00:00+08:00' });
    expect(reduceDomain(overlong, { type: 'completeTask', taskId: 'task-client-quote', at: '2026-07-17T15:00:00+08:00' })).toMatchObject({ status: 'failure', failure: { code: 'invalid_time' } });

    const adjusted = domainReducer(overlong, { type: 'completeTask', taskId: 'task-client-quote', at: '2026-07-17T15:00:00+08:00', timeDecision: { kind: 'adjust', minutes: 45 } });
    expect(adjusted.timeEntries).toEqual([expect.objectContaining({ minutes: 45, startedAt: '2026-07-17T08:00:00+08:00', confirmedAt: '2026-07-17T15:00:00+08:00' })]);
    expect(new Date(adjusted.timeEntries[0].endedAt).getTime() - new Date(adjusted.timeEntries[0].startedAt).getTime()).toBe(45 * 60_000);
  });

  it('corrects an existing abnormal TimeEntry through one explicit domain action', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const data = {
      ...seed,
      timeEntries: [{ id: 'time-forgotten-stop', taskId: 'task-reflow-demo', startedAt: '2026-07-16T23:30:00+08:00', endedAt: '2026-07-17T11:53:00+08:00', minutes: 743 }],
    };
    const corrected = domainReducer(data, { type: 'correctTimeEntry', timeEntryId: 'time-forgotten-stop', actualMinutes: 50, at: '2026-07-17T12:00:00+08:00' });
    expect(corrected.timeEntries).toEqual([expect.objectContaining({
      id: 'time-forgotten-stop',
      minutes: 50,
      confirmedAt: '2026-07-17T12:00:00+08:00',
    })]);
    expect(new Date(corrected.timeEntries[0].endedAt).getTime() - new Date(corrected.timeEntries[0].startedAt).getTime()).toBe(50 * 60_000);
  });

  it('explicitly pauses and records the old task before starting another one', () => {
    let data = createSeedData(new Date('2026-07-17T09:00:00+08:00'));
    data = { ...data, tasks: data.tasks.map((task) => ({ ...task, status: 'notStarted' })), progressLogs: [], timeEntries: [] };
    data = domainReducer(data, { type: 'startTask', taskId: 'task-reflow-demo', at: '2026-07-17T10:00:00+08:00' });
    data = domainReducer(data, { type: 'startTask', taskId: 'task-client-quote', at: '2026-07-17T10:25:00+08:00' });

    expect(data.tasks.find((task) => task.id === 'task-reflow-demo')?.status).toBe('notStarted');
    expect(data.tasks.find((task) => task.id === 'task-client-quote')?.status).toBe('inProgress');
    expect(data.timeEntries).toEqual([expect.objectContaining({ taskId: 'task-reflow-demo', minutes: 25 })]);
    expect(data.progressLogs.slice(-2)).toEqual([
      expect.objectContaining({ taskId: 'task-reflow-demo', kind: 'pause' }),
      expect.objectContaining({ taskId: 'task-client-quote', kind: 'start' }),
    ]);
  });

  it('restores a completed task to an unfinished state', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const restored = domainReducer(seed, { type: 'restoreTask', taskId: 'task-inbox-cleanup' });
    expect(restored.tasks.find((task) => task.id === 'task-inbox-cleanup')).toMatchObject({ status: 'notStarted', completedAt: undefined });
  });

  it('moves a scheduled task to another date as unscheduled and appends immutable history', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const previousEvents = seed.taskPlanEvents;
    const result = reduceDomain(seed, { type: 'planTaskForDate', taskId: 'task-client-quote', date: '2026-07-18', at: now });
    expect(result).toMatchObject({ status: 'success' });
    expect(result.data.tasks.find((task) => task.id === 'task-client-quote')).toMatchObject({ plannedDate: '2026-07-18', plannedStartAt: undefined, plannedEndAt: undefined });
    expect(result.data.taskPlanEvents.slice(0, previousEvents.length)).toEqual(previousEvents);
    expect(result.data.taskPlanEvents.at(-1)).toMatchObject({ kind: 'rescheduled', before: { plannedDate: '2026-07-17' }, after: { plannedDate: '2026-07-18', plannedStartAt: undefined } });
  });

  it('updates a waiting follow-up and clears waiting metadata when it returns to normal planning', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const waiting = {
      ...seed.tasks[1],
      id: 'task-waiting',
      bucket: 'waiting' as const,
      plannedDate: undefined,
      plannedStartAt: undefined,
      plannedEndAt: undefined,
      waitingDetails: { waitingFor: '供应商', waitingOn: '送货时间', followUpDate: '2026-07-17' },
    };
    let data = { ...seed, tasks: [...seed.tasks, waiting] };
    data = domainReducer(data, { type: 'updateWaitingFollowUp', taskId: waiting.id, followUpDate: '2026-07-19' });
    expect(data.tasks.find((task) => task.id === waiting.id)?.waitingDetails?.followUpDate).toBe('2026-07-19');
    data = domainReducer(data, { type: 'planTaskForDate', taskId: waiting.id, date: '2026-07-18', at: now });
    expect(data.tasks.find((task) => task.id === waiting.id)).toMatchObject({ bucket: 'today', plannedDate: '2026-07-18', waitingDetails: undefined });
  });

  it('enforces same-day schedules and half-open conflicts with explicit override', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const crossDay = reduceDomain(seed, { type: 'scheduleTask', taskId: 'task-client-quote', startAt: '2026-07-17T23:30:00+08:00', endAt: '2026-07-18T00:15:00+08:00', at: now });
    expect(crossDay).toMatchObject({ status: 'failure', failure: { code: 'invalid_schedule' }, data: seed });

    const touching = reduceDomain(seed, { type: 'scheduleTask', taskId: 'task-client-quote', startAt: '2026-07-17T11:30:00+08:00', endAt: '2026-07-17T12:00:00+08:00', at: now });
    expect(touching.status).toBe('success');

    const conflict = reduceDomain(seed, { type: 'scheduleTask', taskId: 'task-client-quote', startAt: '2026-07-17T10:30:00+08:00', endAt: '2026-07-17T11:00:00+08:00', at: now });
    expect(conflict).toMatchObject({ status: 'failure', failure: { code: 'schedule_conflict' }, data: seed });
    const overridden = reduceDomain(seed, { type: 'scheduleTask', taskId: 'task-client-quote', startAt: '2026-07-17T10:30:00+08:00', endAt: '2026-07-17T11:00:00+08:00', allowConflict: true, at: now });
    expect(overridden).toMatchObject({ status: 'success' });
  });

  it('accepts a schedule outside the default visible range', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const result = reduceDomain(seed, { type: 'scheduleTask', taskId: 'task-client-quote', startAt: '2026-07-17T02:00:00+08:00', endAt: '2026-07-17T02:30:00+08:00', at: now });
    expect(result).toMatchObject({ status: 'success' });
  });

  it('excludes the task itself from conflicts and treats an unchanged date plan as a no-op', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const sameSchedule = reduceDomain(seed, {
      type: 'scheduleTask', taskId: 'task-client-quote',
      startAt: '2026-07-17T16:00:00+08:00', endAt: '2026-07-17T16:30:00+08:00', at: now,
    });
    expect(sameSchedule.status).toBe('success');
    const sameDate = reduceDomain(seed, { type: 'planTaskForDate', taskId: 'task-client-quote', date: '2026-07-17', at: now });
    expect(sameDate).toMatchObject({ status: 'success', data: seed });
    expect(sameDate.data.tasks.find((task) => task.id === 'task-client-quote')).toMatchObject({
      plannedDate: '2026-07-17',
      plannedStartAt: '2026-07-17T16:00:00.000+08:00',
      plannedEndAt: '2026-07-17T16:30:00.000+08:00',
    });
  });

  it('appends events for unscheduling and both defer destinations', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const unscheduled = domainReducer(seed, { type: 'unscheduleTask', taskId: 'task-client-quote', at: now });
    expect(unscheduled.tasks.find((task) => task.id === 'task-client-quote')).toMatchObject({ plannedDate: '2026-07-17', plannedStartAt: undefined, plannedEndAt: undefined });
    expect(unscheduled.taskPlanEvents.at(-1)).toMatchObject({ kind: 'unscheduled', before: { plannedDate: '2026-07-17' }, after: { plannedDate: '2026-07-17' } });

    const deferred = domainReducer(seed, { type: 'deferTask', taskId: 'task-client-quote', destination: { date: '2026-07-18' }, at: now });
    expect(deferred.taskPlanEvents.at(-1)).toMatchObject({ kind: 'deferred', after: { plannedDate: '2026-07-18', plannedStartAt: undefined } });

    const someday = domainReducer(seed, { type: 'deferTask', taskId: 'task-client-quote', destination: { bucket: 'someday' }, at: now });
    expect(someday.tasks.find((task) => task.id === 'task-client-quote')).toMatchObject({ bucket: 'someday', plannedDate: undefined });
    expect(someday.taskPlanEvents.at(-1)).toMatchObject({ kind: 'movedToSomeday', after: { plannedDate: undefined } });
  });

  it('updates only editable task details through an explicit domain action', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const before = seed.tasks.find((task) => task.id === 'task-client-quote')!;
    const result = reduceDomain(seed, {
      type: 'updateTaskDetails',
      taskId: before.id,
      title: '  确认客户报价终稿  ',
      estimatedMinutes: 45,
      nextAction: '  核对付款条款  ',
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('expected success');
    expect(result.data.tasks.find((task) => task.id === before.id)).toEqual({
      ...before,
      title: '确认客户报价终稿',
      estimatedMinutes: 45,
      nextAction: '核对付款条款',
    });
    expect(result.data.taskPlanEvents).toEqual(seed.taskPlanEvents);
  });

  it.each([
    ['missing task', { taskId: 'missing', title: '有效标题', estimatedMinutes: 30, nextAction: '执行下一步' }, 'task_not_found'],
    ['empty title', { taskId: 'task-client-quote', title: ' ', estimatedMinutes: 30, nextAction: '执行下一步' }, 'invalid_decision'],
    ['invalid duration', { taskId: 'task-client-quote', title: '有效标题', estimatedMinutes: 0, nextAction: '执行下一步' }, 'invalid_time'],
    ['empty next action', { taskId: 'task-client-quote', title: '有效标题', estimatedMinutes: 30, nextAction: ' ' }, 'invalid_decision'],
  ])('rejects %s task detail edits without changing data', (_name, details, code) => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const result = reduceDomain(seed, { type: 'updateTaskDetails', ...details });
    expect(result).toMatchObject({ status: 'failure', data: seed, failure: { code } });
  });

  it('deletes tasks logically and preserves their execution and plan history', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const result = domainReducer(seed, { type: 'deleteTask', taskId: 'task-reflow-demo', at: now });
    expect(result.tasks.find((task) => task.id === 'task-reflow-demo')?.deletedAt).toBe(now);
    expect(result.timeEntries.some((entry) => entry.taskId === 'task-reflow-demo')).toBe(true);
    expect(result.progressLogs.some((log) => log.taskId === 'task-reflow-demo')).toBe(true);
    expect(result.taskPlanEvents.at(-1)).toMatchObject({ kind: 'cancelled', taskId: 'task-reflow-demo', source: 'user' });
  });
});
