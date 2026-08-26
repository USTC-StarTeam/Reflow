import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, within } from '@testing-library/react-native';

import { createSeedData } from '@/core/demo-data';
import { addLocalDays, dateKey, formatShortDate } from '@/core/date-utils';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import { ShellContext } from '@/features/shared/shell-context';
import { InboxScreen } from '../inbox-screen';

jest.mock('@/core/store', () => ({ useReflowStore: jest.fn() }));

const mockedUseReflowStore = jest.mocked(useReflowStore);

function storeValue(data = createSeedData(new Date('2026-07-17T12:00:00+08:00'))): ReflowStoreValue {
  return {
    data,
    hydrated: true,
    recoveryFailure: false,
    persistenceFailure: false,
    capturing: false,
    proposalServiceKind: 'mock',
    lastActionFailure: null,
    capture: jest.fn(), retryCapture: jest.fn(), retryCaptureWithLocalRules: jest.fn(),
    submitUserDecision: jest.fn(), undoLastDecision: jest.fn(), updateTaskDetails: jest.fn(), startTask: jest.fn(), pauseTask: jest.fn(), completeTask: jest.fn(), restoreTask: jest.fn(), moveTask: jest.fn(), updateWaitingFollowUp: jest.fn(), recordTime: jest.fn(), correctTimeEntry: jest.fn(), recordProgress: jest.fn(), recordInterruption: jest.fn(), planTaskForDate: jest.fn(), scheduleTask: jest.fn(), unscheduleTask: jest.fn(), deferTask: jest.fn(), deleteTask: jest.fn(), reorderTasks: jest.fn(), exportBackup: jest.fn(), retryPersistence: jest.fn(), importBackup: jest.fn(), startEmpty: jest.fn(), resetDemo: jest.fn(),
  } as ReflowStoreValue;
}

async function renderInbox(store: ReflowStoreValue) {
  mockedUseReflowStore.mockReturnValue(store);
  return render(<ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}><InboxScreen /></ShellContext.Provider>);
}

describe('InboxScreen first-level presentation', () => {
  it('shows compact proposal rows and hides diagnostic metadata until editing', async () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const data = { ...seed, proposals: seed.proposals.map((proposal) => proposal.id === 'proposal-contract' ? { ...proposal, suggestedDate: '2026-07-20' } : proposal) };
    const screen = await renderInbox(storeValue(data));
    const proposal = screen.getByTestId('proposal-proposal-contract');

    const row = within(proposal);
    expect(row.getByText('审阅合同付款条款')).toBeTruthy();
    expect(row.getByText('7月20日 · 工作推进 · 预计 45 分')).toBeTruthy();
    expect(row.queryByText(/合同条款今晚前审阅/)).toBeNull();
    expect(row.queryByText('本地规则')).toBeNull();
    expect(row.queryByText(/识别到明确截止时间/)).toBeNull();
    expect(row.queryByText('先标出付款周期风险点')).toBeNull();
    expect(row.queryByText('AI 归类结果')).toBeNull();
    expect(row.queryByText('≡')).toBeNull();
    expect(row.getByText('确认')).toBeTruthy();
    expect(row.queryByText('修改')).toBeNull();
    expect(row.getByLabelText('修改')).toBeTruthy();
    expect(row.getByText('邮件 · 7月17日 11:20 捕捉')).toBeTruthy();
    expect(screen.getByText('整理完成，等待你的决定')).toBeTruthy();
    expect(screen.getByText('待你确认')).toBeTruthy();
    expect(screen.queryByText(/已整理为 .* 条待确认建议/)).toBeNull();
  });

  it('selects a missing date locally before confirmation writes the decision', async () => {
    const store = storeValue();
    const screen = await renderInbox(store);
    const proposal = screen.getByTestId('proposal-proposal-contract');
    const target = addLocalDays(dateKey(new Date()), 1);

    expect(within(proposal).getByText('选择日期')).toBeTruthy();
    await fireEvent.press(within(proposal).getByText('选择日期'));
    expect(screen.getByTestId('proposal-date-picker')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`proposal-date-option-${target}`));

    expect(screen.queryByTestId('proposal-date-picker')).toBeNull();
    expect(within(proposal).getByText(new RegExp(formatShortDate(target)))).toBeTruthy();
    expect(within(proposal).getByText('确认')).toBeTruthy();
    expect(store.submitUserDecision).not.toHaveBeenCalled();
    await fireEvent.press(within(proposal).getByText('确认'));
    expect(store.submitUserDecision).toHaveBeenCalledTimes(1);
    expect(store.submitUserDecision).toHaveBeenCalledWith(expect.objectContaining({ proposalId: 'proposal-contract', plannedDate: target }));
  });

  it('opens the existing edit fields in a secondary sheet', async () => {
    const screen = await renderInbox(storeValue());
    const proposal = screen.getByTestId('proposal-proposal-contract');

    await fireEvent.press(within(proposal).getByLabelText('修改'));
    expect(screen.getByText('修改整理结果')).toBeTruthy();
    expect(screen.getByTestId('proposal-title-proposal-contract')).toHaveProp('value', '审阅合同付款条款');
    expect(screen.getByTestId('proposal-next-action-proposal-contract')).toHaveProp('value', '先标出付款周期风险点');
    expect(screen.getByTestId('proposal-classification-proposal-contract')).toBeTruthy();
  });

  it('returns to the edit sheet after changing its date and stays pending until confirmation', async () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const data = { ...seed, proposals: seed.proposals.map((proposal) => proposal.id === 'proposal-contract' ? { ...proposal, suggestedDate: '2026-07-20' } : proposal) };
    const store = storeValue(data);
    const screen = await renderInbox(store);
    const proposal = screen.getByTestId('proposal-proposal-contract');

    await fireEvent.press(within(proposal).getByLabelText('修改'));
    await fireEvent.press(screen.getByTestId('proposal-date-proposal-contract'));
    await fireEvent.press(screen.getByTestId('proposal-date-option-2026-07-25'));

    expect(screen.getByText('修改整理结果')).toBeTruthy();
    expect(screen.getByText('7月25日')).toBeTruthy();
    expect(store.submitUserDecision).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('保存修改'));
    expect(screen.getByTestId('proposal-proposal-contract')).toBeTruthy();
    expect(within(proposal).getByText(/7月25日/)).toBeTruthy();
    expect(store.submitUserDecision).not.toHaveBeenCalled();
  });

  it('keeps failed capture raw text visible and recent decisions lightweight', async () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const failed = { ...seed.captures[0], pipelineState: 'proposalFailed' as const, failure: { code: 'proposal_unavailable' as const, message: '暂时不可用。', retryable: true } };
    const decision = {
      id: 'decision-recent', captureId: 'capture-contract', proposalId: 'proposal-contract', kind: 'accept' as const, outcome: 'task' as const, bucket: 'today' as const, status: 'applied' as const,
      appliedAt: new Date().toISOString(), edited: { title: '审阅合同付款条款', category: 'work' as const, estimatedMinutes: 45, nextAction: '标出风险点' }, effect: { type: 'createdTasks' as const, tasks: [] },
    };
    const data = { ...seed, captures: [failed, ...seed.captures.slice(1)], proposals: seed.proposals.map((proposal) => proposal.id === 'proposal-contract' ? { ...proposal, status: 'accepted' as const } : proposal), decisions: [decision] };
    const store = storeValue(data);
    const screen = await renderInbox(store);

    expect(within(screen.getByTestId('failed-capture-capture-contract')).getByText(/合同条款今晚前审阅/)).toBeTruthy();
    expect(screen.getByText('输入已保留，暂未整理完成')).toBeTruthy();
    await fireEvent.press(screen.getByText('重新使用本地规则整理'));
    expect(store.retryCapture).toHaveBeenCalledWith('capture-contract');
    const recent = screen.getByTestId('recent-decision-decision-recent');
    const recentRow = within(recent);
    expect(recentRow.getByText('审阅合同付款条款')).toBeTruthy();
    expect(recentRow.getByText(/已加入今天/)).toBeTruthy();
    expect(recentRow.queryByText(/合同条款今晚前审阅/)).toBeNull();
    expect(recentRow.getByText('撤销')).toBeTruthy();
  });

  it('keeps a captured input visible while local persistence is waiting to recover', async () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const captured = { ...seed.captures[0], pipelineState: 'captured' as const };
    const data = {
      ...seed,
      captures: [captured, ...seed.captures.slice(1)],
      proposals: seed.proposals.map((proposal) => ({ ...proposal, status: 'accepted' as const })),
    };
    const screen = await renderInbox(storeValue(data));

    const card = within(screen.getByTestId('captured-capture-capture-contract'));
    expect(card.getByText(/合同条款今晚前审阅/)).toBeTruthy();
    expect(card.getByText('输入已保留，等待本地保存后继续整理。')).toBeTruthy();
    expect(screen.getByText('1 条')).toBeTruthy();
  });

  it('projects only the latest decision feedback instead of five history cards', async () => {
    const seed = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const decisions = Array.from({ length: 5 }, (_, index) => ({
      id: `decision-${index}`,
      captureId: 'capture-contract',
      proposalId: 'proposal-contract',
      kind: 'ignore' as const,
      outcome: 'ignored' as const,
      appliedAt: `2026-07-17T0${index}:00:00+08:00`,
      status: 'applied' as const,
      effect: { type: 'ignored' as const },
    }));
    const screen = await renderInbox(storeValue({ ...seed, decisions }));
    expect(screen.getAllByTestId(/^recent-decision-/)).toHaveLength(1);
    expect(screen.getByTestId('recent-decision-decision-4')).toBeTruthy();
  });
});
