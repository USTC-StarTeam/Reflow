import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { createSeedData } from '@/core/demo-data';
import { dateKey } from '@/core/date-utils';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import type { TaskItem } from '@/core/types';
import { ShellContext } from '@/features/shared/shell-context';
import { CalendarScreen } from '../calendar-screen';

jest.mock('@/core/store', () => ({ useReflowStore: jest.fn() }));
jest.mock('../schedule-task-modal', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ScheduleTaskModal: ({ task, visible }: { task: TaskItem; visible: boolean }) => visible
      ? React.createElement(ReactNative.View, { testID: 'calendar-schedule-modal' }, React.createElement(ReactNative.Text, null, task.title))
      : null,
  };
});

const mockedUseReflowStore = jest.mocked(useReflowStore);

function storeValue(): ReflowStoreValue {
  const now = new Date('2026-07-17T12:00:00+08:00');
  const data = createSeedData(now);
  const dateOnly: TaskItem = {
    ...data.tasks.find((task) => task.id === 'task-client-quote')!,
    id: 'task-date-only',
    title: '整理会议纪要',
    status: 'notStarted',
    plannedDate: dateKey(now),
    plannedStartAt: undefined,
    plannedEndAt: undefined,
    completedAt: undefined,
    estimatedMinutes: 30,
  };
  return {
    data: { ...data, tasks: [...data.tasks, dateOnly] },
    hydrated: true,
    recoveryFailure: false,
    persistenceFailure: false,
    capturing: false,
    proposalServiceKind: 'mock',
    lastActionFailure: null,
    capture: jest.fn(),
    retryCapture: jest.fn(),
    retryCaptureWithLocalRules: jest.fn(),
    submitUserDecision: jest.fn(),
    undoLastDecision: jest.fn(),
    updateTaskDetails: jest.fn(),
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
    retryPersistence: jest.fn(),
    importBackup: jest.fn(),
    startEmpty: jest.fn(),
    resetDemo: jest.fn(),
  } as ReflowStoreValue;
}

async function renderCalendar(store: ReflowStoreValue) {
  mockedUseReflowStore.mockReturnValue(store);
  return render(
    <ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}>
      <CalendarScreen />
    </ShellContext.Provider>,
  );
}

describe('CalendarScreen planning surface', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
  });

  it('defaults to Month and separates exact-time, date-only, suggestion, and completed sections', async () => {
    const screen = await renderCalendar(storeValue());

    expect(screen.getByText('日历')).toBeTruthy();
    expect(screen.getByText('多尺度规划')).toBeTruthy();
    expect(screen.getByTestId('calendar-mode-month').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('calendar-day-2026-07-17')).toBeTruthy();
    expect(screen.getByText('时间安排')).toBeTruthy();
    expect(screen.getByText('当天事项')).toBeTruthy();
    expect(screen.getByText('规划建议')).toBeTruthy();
    expect(screen.getByText('已完成')).toBeTruthy();
    expect(screen.getByText('整理会议纪要')).toBeTruthy();
    expect(screen.queryByText('未排期')).toBeNull();
  });

  it('shows a weekly load overview instead of the dense time grid', async () => {
    const screen = await renderCalendar(storeValue());

    await fireEvent.press(screen.getByTestId('calendar-mode-week'));

    expect(screen.getByTestId('calendar-week-overview')).toBeTruthy();
    expect(screen.queryByTestId('calendar-day-grid')).toBeNull();
    expect(screen.getAllByTestId(/^calendar-week-day-/)).toHaveLength(7);
    expect(screen.getByText('4 项')).toBeTruthy();
  });

  it('uses Day for exact-time planning and reuses schedule and unschedule actions', async () => {
    const store = storeValue();
    const screen = await renderCalendar(store);

    await fireEvent.press(screen.getByTestId('calendar-mode-day'));
    expect(screen.getByTestId('calendar-day-grid')).toBeTruthy();
    expect(screen.getByTestId('calendar-grid-task-reflow-demo')).toBeTruthy();
    expect(screen.queryByText('时间安排')).toBeNull();

    await fireEvent.press(screen.getByLabelText('安排时间 整理会议纪要'));
    expect(screen.getByTestId('calendar-schedule-modal')).toHaveTextContent('整理会议纪要');

    await fireEvent.press(screen.getByTestId('calendar-grid-unschedule-task-reflow-demo'));
    expect(store.unscheduleTask).toHaveBeenCalledWith('task-reflow-demo');
  });
});
