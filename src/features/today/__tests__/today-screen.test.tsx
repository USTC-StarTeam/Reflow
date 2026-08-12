import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { createSeedData } from '@/core/demo-data';
import { dateKey } from '@/core/date-utils';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import type { TaskItem } from '@/core/types';
import { ShellContext } from '../../shared/shell-context';
import { TodayScreen } from '../today-screen';

jest.mock('@/core/store', () => ({
  useReflowStore: jest.fn(),
}));

const mockedUseReflowStore = jest.mocked(useReflowStore);

function storeValue(): ReflowStoreValue {
  const now = new Date('2026-07-17T12:00:00+08:00');
  const data = createSeedData(now);
  const today = dateKey(now);
  const dateOnlyTask: TaskItem = {
    ...data.tasks.find((task) => task.id === 'task-client-quote')!,
    id: 'task-today-date-only',
    title: '整理本周实验报告',
    status: 'notStarted',
    plannedDate: today,
    plannedStartAt: undefined,
    plannedEndAt: undefined,
    completedAt: undefined,
    estimatedMinutes: 60,
  };
  return {
    data: { ...data, tasks: [...data.tasks, dateOnlyTask] },
    hydrated: true,
    capturing: false,
    proposalServiceKind: 'mock',
    lastActionFailure: null,
    capture: jest.fn(),
    retryCapture: jest.fn(),
    retryCaptureWithLocalRules: jest.fn(),
    submitUserDecision: jest.fn(),
    undoLastDecision: jest.fn(),
    startTask: jest.fn(),
    pauseTask: jest.fn(),
    completeTask: jest.fn(),
    moveTask: jest.fn(),
    recordTime: jest.fn(),
    recordProgress: jest.fn(),
    recordInterruption: jest.fn(),
    planTaskForDate: jest.fn(),
    scheduleTask: jest.fn(),
    unscheduleTask: jest.fn(),
    deferTask: jest.fn(),
    deleteTask: jest.fn(),
    reorderTasks: jest.fn(),
    exportBackup: jest.fn(),
    importBackup: jest.fn(),
    resetDemo: jest.fn(),
  } as ReflowStoreValue;
}

async function renderToday() {
  return render(
    <ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}>
      <TodayScreen />
    </ShellContext.Provider>,
  );
}

describe('TodayScreen information hierarchy', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps Quick Capture and separates exact-time, date-only, and completed tasks', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    mockedUseReflowStore.mockReturnValue(storeValue());

    const screen = await renderToday();

    expect(screen.getByTestId('quick-capture-input')).toBeTruthy();
    expect(screen.getByText(/今天有 3 个明确时间事项/)).toBeTruthy();
    expect(screen.getByText('时间安排')).toBeTruthy();
    expect(screen.getByText('今天要做')).toBeTruthy();
    expect(screen.getByText('已完成')).toBeTruthy();
    expect(screen.getByTestId('task-task-reflow-demo')).toBeTruthy();
    expect(screen.getByText('10:00–11:30')).toBeTruthy();
    expect(screen.getByTestId('task-task-today-date-only')).toBeTruthy();
    expect(screen.getByText('整理本周实验报告')).toBeTruthy();
    expect(screen.getByText('预计 60 分')).toBeTruthy();
    expect(screen.getByTestId('today-completed-task-inbox-cleanup')).toBeTruthy();
    expect(screen.getByLabelText('进行中')).toBeTruthy();
    expect(screen.getAllByLabelText('待开始')).toHaveLength(3);
  });

  it('keeps first-level rows scan-only without execution controls or task metadata', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    mockedUseReflowStore.mockReturnValue(storeValue());

    const screen = await renderToday();
    const completedRow = screen.getByTestId('task-task-inbox-cleanup');

    expect(screen.queryByTestId('open-daily-planning')).toBeNull();
    expect(screen.queryByText('规划今天')).toBeNull();
    expect(screen.queryByText('今日未排期')).toBeNull();
    expect(screen.getByText('晨间整理收件箱')).toBeTruthy();
    expect(screen.getByText('10:00–11:30')).toBeTruthy();
    expect(screen.getByText('预计 90 分')).toBeTruthy();
    expect(completedRow).not.toHaveTextContent(/工作推进/);
    expect(completedRow).not.toHaveTextContent(/分钟/);
    expect(completedRow).not.toHaveTextContent(/09:25/);
    expect(completedRow).not.toHaveTextContent(/补齐收件箱确认流程/);
    expect(screen.getByTestId('task-task-today-date-only')).not.toHaveTextContent(/尚未排期/);
    expect(screen.getByTestId('task-task-today-date-only')).not.toHaveTextContent(/工作推进/);
    expect(screen.getByTestId('task-task-today-date-only')).not.toHaveTextContent(/补齐收件箱确认流程/);
    expect(screen.queryByLabelText('开始 完成 Reflow Demo 页面结构')).toBeNull();
    expect(screen.queryByLabelText('暂停 完成 Reflow Demo 页面结构')).toBeNull();
    expect(screen.queryByLabelText('开始 整理本周实验报告')).toBeNull();
    expect(screen.queryByLabelText('暂停 整理本周实验报告')).toBeNull();
    expect(screen.queryByLabelText('开始 晨间整理收件箱')).toBeNull();
    expect(screen.queryByLabelText('暂停 晨间整理收件箱')).toBeNull();
  });
});
