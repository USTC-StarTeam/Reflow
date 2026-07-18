import { describe, expect, it } from '@jest/globals';

import { createSeedData } from '../demo-data';
import { domainReducer, reduceDomain } from '../reducer';

const now = '2026-07-17T08:00:00.000Z';
const taskEdit = { title: '审阅新版合同', category: 'work' as const, estimatedMinutes: 35, nextAction: '标记风险条款' };

describe('domain reducer', () => {
  it('creates formal tasks only after an explicit user decision and can undo it', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    const beforeTaskCount = seed.tasks.length;
    const transition = reduceDomain(seed, { type: 'submitUserDecision', decisionId: 'decision-contract', at: now, decision: { kind: 'accept', proposalId: 'proposal-contract', bucket: 'today', edited: taskEdit } });
    expect(transition).toMatchObject({ status: 'success' });
    if (transition.status !== 'success') throw new Error('expected success');
    expect(transition.data.tasks).toHaveLength(beforeTaskCount + 1);
    expect(transition.data.decisions[0]).toMatchObject({ id: 'decision-contract', outcome: 'task', status: 'applied' });
    const undone = reduceDomain(transition.data, { type: 'undoUserDecision', decisionId: 'decision-contract', at: '2026-07-17T08:05:00.000Z' });
    expect(undone).toMatchObject({ status: 'success' });
    expect(undone.data.tasks).toHaveLength(beforeTaskCount);
    expect(undone.data.proposals.find((item) => item.id === 'proposal-contract')?.status).toBe('pending');
    expect(undone.data.decisions[0].status).toBe('reverted');
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

    const waiting = reduceDomain(seed, { type: 'submitUserDecision', decisionId: 'decision-waiting', at: now, decision: { kind: 'accept', proposalId: 'proposal-contract', bucket: 'waiting', edited: taskEdit } });
    expect(waiting.data.tasks.find((task) => task.title === taskEdit.title)?.bucket).toBe('waiting');

    const merged = reduceDomain(seed, { type: 'submitUserDecision', decisionId: 'decision-merge', at: now, decision: { kind: 'accept', proposalId: 'proposal-duplicate-quote', bucket: 'someday', edited: { title: '确认客户报价', category: 'communication', estimatedMinutes: 20, nextAction: '回复客户' } } });
    expect(merged.data.tasks.find((task) => task.id === 'task-client-quote')?.bucket).toBe('someday');
  });

  it('returns explicit failures for invalid actions and unsafe undo', () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00'));
    expect(reduceDomain(seed, { type: 'recordTime', taskId: 'missing', minutes: 15, at: now })).toMatchObject({ status: 'failure', failure: { code: 'task_not_found' } });
    expect(reduceDomain(seed, { type: 'recordTime', taskId: 'task-reflow-demo', minutes: 0, at: now })).toMatchObject({ status: 'failure', failure: { code: 'invalid_time' } });
    expect(reduceDomain(seed, { type: 'scheduleTask', taskId: 'task-reflow-demo', startAt: now, endAt: now })).toMatchObject({ status: 'failure', failure: { code: 'invalid_schedule' } });

    const accepted = domainReducer(seed, { type: 'submitUserDecision', decisionId: 'decision-exec', at: now, decision: { kind: 'accept', proposalId: 'proposal-contract', bucket: 'today', edited: taskEdit } });
    const createdTask = accepted.tasks.find((task) => task.title === taskEdit.title);
    if (!createdTask) throw new Error('expected created task');
    const executed = domainReducer(accepted, { type: 'recordTime', taskId: createdTask.id, minutes: 15, at: now });
    expect(reduceDomain(executed, { type: 'undoUserDecision', decisionId: 'decision-exec', at: now })).toMatchObject({ status: 'failure', failure: { code: 'decision_not_reversible' } });
  });

  it('allows only one current task and records execution facts separately', () => {
    let data = createSeedData(new Date('2026-07-17T12:00:00'));
    data = domainReducer(data, { type: 'startTask', taskId: 'task-client-quote', at: now });
    expect(data.tasks.filter((task) => task.status === 'inProgress')).toHaveLength(1);
    data = domainReducer(data, { type: 'recordInterruption', taskId: 'task-client-quote', text: '临时会议', at: now });
    data = domainReducer(data, { type: 'completeTask', taskId: 'task-client-quote', at: now });
    expect(data.progressLogs.some((log) => log.kind === 'interrupt')).toBe(true);
    expect(data.tasks.find((task) => task.id === 'task-client-quote')?.status).toBe('completed');
  });
});
