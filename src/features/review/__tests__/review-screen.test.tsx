import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import { createSeedData } from '@/core/demo-data';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import type { DomainData } from '@/core/types';
import { ShellContext } from '@/features/shared/shell-context';
import { ReviewScreen } from '../review-screen';

jest.mock('@/core/store', () => ({ useReflowStore: jest.fn() }));

const mockedUseReflowStore = jest.mocked(useReflowStore);

function storeValue(data: DomainData): ReflowStoreValue {
  return {
    data,
    hydrated: true,
    recoveryFailure: false,
    persistenceFailure: false,
    capturing: false,
    proposalServiceKind: 'mock',
    lastActionFailure: null,
    capture: jest.fn(), retryCapture: jest.fn(), retryCaptureWithLocalRules: jest.fn(), submitUserDecision: jest.fn(), undoLastDecision: jest.fn(),
    startTask: jest.fn(), pauseTask: jest.fn(), completeTask: jest.fn(), restoreTask: jest.fn(), updateTaskDetails: jest.fn(), moveTask: jest.fn(), updateWaitingFollowUp: jest.fn(),
    recordTime: jest.fn(), correctTimeEntry: jest.fn(), recordProgress: jest.fn(), recordInterruption: jest.fn(), planTaskForDate: jest.fn(), scheduleTask: jest.fn(), unscheduleTask: jest.fn(), deferTask: jest.fn(), deleteTask: jest.fn(), reorderTasks: jest.fn(),
    exportBackup: jest.fn(), retryPersistence: jest.fn(), importBackup: jest.fn(), startEmpty: jest.fn(), resetDemo: jest.fn(),
  } as ReflowStoreValue;
}

async function renderReview(store: ReflowStoreValue) {
  mockedUseReflowStore.mockReturnValue(store);
  return render(
    <ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}>
      <ReviewScreen />
    </ShellContext.Provider>,
  );
}

describe('ReviewScreen presentation', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('keeps Today light with four primary facts and one needs-attention summary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    const data = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const source = data.tasks.find((task) => task.id === 'task-client-quote')!;
    const attentionData = {
      ...data,
      tasks: [
        ...data.tasks,
        { ...source, id: 'task-overdue-review', plannedDate: '2026-07-16', plannedStartAt: undefined, plannedEndAt: undefined },
        { ...source, id: 'task-waiting-review', bucket: 'waiting' as const, plannedDate: undefined, plannedStartAt: undefined, plannedEndAt: undefined, waitingDetails: { waitingFor: '供应商', waitingOn: '确认时间', followUpDate: '2026-07-17' } },
      ],
      progressLogs: [
        ...data.progressLogs.filter((log) => log.taskId !== 'task-reflow-demo' || log.kind === 'interrupt'),
        { id: 'cross-day-start', taskId: 'task-reflow-demo', kind: 'start' as const, text: '开始', createdAt: '2026-07-16T23:30:00+08:00' },
      ],
    };
    const screen = await renderReview(storeValue(attentionData));
    const daily = screen.getByTestId('review-daily');

    expect(daily).toHaveTextContent(/统计范围：7月17日/);
    expect(screen.getAllByTestId(/^review-metric-/)).toHaveLength(4);
    expect(daily).toHaveTextContent(/原计划/);
    expect(daily).toHaveTextContent(/完成/);
    expect(daily).toHaveTextContent(/实际投入.*1小时/);
    expect(daily).toHaveTextContent(/中断.*1 次/);
    expect(screen.queryByTestId('review-metric-unfinished')).toBeNull();
    expect(screen.queryByTestId('review-metric-reschedule')).toBeNull();
    expect(screen.getByTestId('review-needs-attention')).toHaveTextContent(/需要处理 3 项.*1 项重新安排.*1 项等待跟进.*1 项跨日进行中/);
  });

  it('switches among deterministic daily, weekly and monthly facts without domain writes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    const store = storeValue(createSeedData(new Date('2026-07-17T12:00:00+08:00')));
    const screen = await renderReview(store);

    expect(screen.getByTestId('review-daily')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('本周'));
    expect(screen.getByTestId('review-weekly')).toHaveTextContent(/计划任务.*按计划完成.*完成率.*实际投入.*中断 1 次.*主要投入/);
    await fireEvent.press(screen.getByLabelText('本月'));
    expect(screen.getByTestId('review-monthly')).toHaveTextContent(/计划任务.*按计划完成.*完成率.*实际投入.*主要投入/);
    expect(store.correctTimeEntry).not.toHaveBeenCalled();
    expect(store.pauseTask).not.toHaveBeenCalled();
    expect(store.completeTask).not.toHaveBeenCalled();
  });

  it('shows and corrects an existing abnormal TimeEntry without guessing its duration', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    const data = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
    const store = storeValue({
      ...data,
      timeEntries: [{ id: 'forgotten-stop', taskId: 'task-reflow-demo', startedAt: '2026-07-16T23:30:00+08:00', endedAt: '2026-07-17T11:53:00+08:00', minutes: 743 }],
    });
    const screen = await renderReview(store);

    expect(screen.getByTestId('review-time-correction-notice')).toHaveTextContent(/发现 1 条/);
    await fireEvent.press(screen.getByTestId('open-time-correction'));
    expect(screen.getByTestId('time-correction-forgotten-stop')).toHaveTextContent(/完成 Reflow Demo 页面结构.*原记录 12小时23分/);
    expect(screen.getByTestId('save-time-correction-forgotten-stop')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('time-correction-input-forgotten-stop'), '50');
    await fireEvent.press(screen.getByTestId('save-time-correction-forgotten-stop'));
    expect(store.correctTimeEntry).toHaveBeenCalledWith('forgotten-stop', 50);
  });

  it('changes the daily review range after midnight without reopening the app', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T23:59:30+08:00'));
    const screen = await renderReview(storeValue(createSeedData(new Date('2026-07-17T12:00:00+08:00'))));
    expect(screen.getByTestId('review-daily')).toHaveTextContent(/7月17日/);

    await act(async () => {
      jest.setSystemTime(new Date('2026-07-18T00:00:30+08:00'));
      jest.advanceTimersByTime(60_000);
    });

    expect(screen.getByTestId('review-daily')).toHaveTextContent(/7月18日/);
  });

  it('keeps the real knowledge list available', async () => {
    const screen = await renderReview(storeValue(createSeedData()));
    await fireEvent.press(screen.getByLabelText('查看知识沉淀'));
    expect(screen.getByTestId('knowledge-list')).toHaveTextContent(/报价沟通检查单/);
    expect(screen.queryByText('AI 观察')).toBeNull();
  });
});
