import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import { createSeedData } from '@/core/demo-data';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import { ShellContext } from '@/features/shared/shell-context';
import { ReviewScreen } from '../review-screen';

jest.mock('@/core/store', () => ({ useReflowStore: jest.fn() }));

const mockedUseReflowStore = jest.mocked(useReflowStore);

async function renderReview() {
  return render(
    <ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}>
      <ReviewScreen />
    </ShellContext.Provider>,
  );
}

describe('ReviewScreen presentation', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('shows scoped daily facts and removes unimplemented review surfaces', async () => {
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
    mockedUseReflowStore.mockReturnValue({ data: attentionData } as ReflowStoreValue);
    const screen = await renderReview();

    expect(screen.getByText('今日事实与知识沉淀')).toBeTruthy();
    expect(screen.getAllByTestId(/^review-(daily|knowledge)$/).map((node) => node.props.testID)).toEqual(['review-daily', 'review-knowledge']);
    const daily = screen.getByTestId('review-daily');
    expect(daily).toHaveTextContent(/统计范围：7月17日/);
    expect(daily).toHaveTextContent(/今日原计划/);
    expect(daily).toHaveTextContent(/今日完成/);
    expect(daily).toHaveTextContent(/今日未完成/);
    expect(daily).toHaveTextContent(/需要重新安排.*1/);
    expect(daily).toHaveTextContent(/到期等待.*1/);
    expect(daily).toHaveTextContent(/跨日进行中.*1/);
    expect(daily).toHaveTextContent(/实际投入时间.*60 分/);
    expect(daily).toHaveTextContent(/中断次数.*1/);
    expect(screen.queryByText('每周复盘')).toBeNull();
    expect(screen.queryByText('每月复盘')).toBeNull();
    expect(screen.queryByText('AI 观察')).toBeNull();

    await fireEvent.press(screen.getByLabelText('查看知识沉淀'));
    expect(screen.getByTestId('knowledge-list')).toHaveTextContent(/报价沟通检查单/);
  });

  it('changes the daily review range after midnight without reopening the app', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T23:59:30+08:00'));
    mockedUseReflowStore.mockReturnValue({ data: createSeedData(new Date('2026-07-17T12:00:00+08:00')) } as ReflowStoreValue);
    const screen = await renderReview();
    expect(screen.getByTestId('review-daily')).toHaveTextContent(/7月17日/);

    await act(async () => {
      jest.setSystemTime(new Date('2026-07-18T00:00:30+08:00'));
      jest.advanceTimersByTime(60_000);
    });

    expect(screen.getByTestId('review-daily')).toHaveTextContent(/7月18日/);
  });
});
