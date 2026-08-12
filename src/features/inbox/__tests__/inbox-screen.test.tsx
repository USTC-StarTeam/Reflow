import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, within } from '@testing-library/react-native';

import { createSeedData } from '@/core/demo-data';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import { ShellContext } from '@/features/shared/shell-context';
import { InboxScreen } from '../inbox-screen';

jest.mock('@/core/store', () => ({ useReflowStore: jest.fn() }));

const mockedUseReflowStore = jest.mocked(useReflowStore);

function storeValue(data = createSeedData(new Date('2026-07-17T12:00:00+08:00'))): ReflowStoreValue {
  return {
    data,
    hydrated: true,
    capturing: false,
    proposalServiceKind: 'mock',
    lastActionFailure: null,
    capture: jest.fn(), retryCapture: jest.fn(), retryCaptureWithLocalRules: jest.fn(),
    submitUserDecision: jest.fn(), undoLastDecision: jest.fn(), startTask: jest.fn(), pauseTask: jest.fn(), completeTask: jest.fn(), moveTask: jest.fn(), recordTime: jest.fn(), recordProgress: jest.fn(), recordInterruption: jest.fn(), planTaskForDate: jest.fn(), scheduleTask: jest.fn(), unscheduleTask: jest.fn(), deferTask: jest.fn(), deleteTask: jest.fn(), reorderTasks: jest.fn(), exportBackup: jest.fn(), importBackup: jest.fn(), resetDemo: jest.fn(),
  } as ReflowStoreValue;
}

async function renderInbox(store: ReflowStoreValue) {
  mockedUseReflowStore.mockReturnValue(store);
  return render(<ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}><InboxScreen /></ShellContext.Provider>);
}

describe('InboxScreen first-level presentation', () => {
  it('shows compact proposal rows and hides diagnostic metadata until editing', async () => {
    const screen = await renderInbox(storeValue());
    const proposal = screen.getByTestId('proposal-proposal-contract');

    const row = within(proposal);
    expect(row.getByText('审阅合同付款条款')).toBeTruthy();
    expect(row.getByText('工作推进 · 预计 45 分')).toBeTruthy();
    expect(row.queryByText(/合同条款今晚前审阅/)).toBeNull();
    expect(row.queryByText('本地规则')).toBeNull();
    expect(row.queryByText(/识别到明确截止时间/)).toBeNull();
    expect(row.queryByText('先标出付款周期风险点')).toBeNull();
    expect(row.queryByText('AI 归类结果')).toBeNull();
    expect(row.getByText('确认')).toBeTruthy();
    expect(row.getByText('修改')).toBeTruthy();
  });

  it('opens the existing edit fields in a secondary sheet', async () => {
    const screen = await renderInbox(storeValue());
    const proposal = screen.getByTestId('proposal-proposal-contract');

    await fireEvent.press(within(proposal).getByText('修改'));
    expect(screen.getByText('修改整理结果')).toBeTruthy();
    expect(screen.getByTestId('proposal-title-proposal-contract')).toHaveProp('value', '审阅合同付款条款');
    expect(screen.getByTestId('proposal-next-action-proposal-contract')).toHaveProp('value', '先标出付款周期风险点');
    expect(screen.getByTestId('proposal-classification-proposal-contract')).toBeTruthy();
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
    await fireEvent.press(screen.getByText('重新使用本地规则整理'));
    expect(store.retryCapture).toHaveBeenCalledWith('capture-contract');
    const recent = screen.getByTestId('recent-decision-decision-recent');
    const recentRow = within(recent);
    expect(recentRow.getByText('审阅合同付款条款')).toBeTruthy();
    expect(recentRow.getByText(/已加入今天/)).toBeTruthy();
    expect(recentRow.queryByText(/合同条款今晚前审阅/)).toBeNull();
    expect(recentRow.getByText('撤销')).toBeTruthy();
  });
});
