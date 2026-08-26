import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

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
    restoreTask: jest.fn(),
    moveTask: jest.fn(),
    updateWaitingFollowUp: jest.fn(),
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

  afterEach(() => { jest.useRealTimers(); });

  it('defaults to Month and separates exact-time, date-only, suggestion, and completed sections', async () => {
    const screen = await renderCalendar(storeValue());

    expect(screen.getByText('日历')).toBeTruthy();
    expect(screen.getByText('多尺度规划')).toBeTruthy();
    expect(screen.getByTestId('calendar-mode-month').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('calendar-day-2026-07-17')).toBeTruthy();
    expect(screen.getByText('时间安排')).toBeTruthy();
    expect(screen.getByText('当天事项')).toBeTruthy();
    expect(screen.getByText('可用时间')).toBeTruthy();
    expect(screen.getByText(/12:15 有空档/)).toBeTruthy();
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

  it('keeps the plan at 07:00 while showing an actual 17:16 current execution', async () => {
    jest.setSystemTime(new Date('2026-07-17T17:20:00+08:00'));
    const base = storeValue();
    const data = {
      ...base.data,
      tasks: base.data.tasks.map((task) => task.id === 'task-reflow-demo' ? {
        ...task,
        plannedStartAt: '2026-07-17T07:00:00+08:00',
        plannedEndAt: '2026-07-17T07:45:00+08:00',
      } : task),
      progressLogs: [
        ...base.data.progressLogs.filter((log) => !(log.taskId === 'task-reflow-demo' && log.kind === 'start')),
        { id: 'actual-start', taskId: 'task-reflow-demo', kind: 'start' as const, text: '开始', createdAt: '2026-07-17T17:16:00+08:00' },
      ],
    };
    const screen = await renderCalendar({ ...base, data });
    const plannedEntry = screen.getByTestId('calendar-entry-task-reflow-demo');

    expect(plannedEntry).toHaveTextContent(/07:00.*07:45/);
    expect(plannedEntry).toHaveTextContent(/进行中.*17:16.*开始/);

    await fireEvent.press(screen.getByTestId('calendar-mode-day'));
    const gridBlock = screen.getByTestId('calendar-grid-task-reflow-demo');
    expect(gridBlock).toHaveTextContent(/07:00.*07:45.*进行中/);
    expect(gridBlock).not.toHaveTextContent('17:16');
  });

  it('keeps a delayed not-started task at its planned time', async () => {
    jest.setSystemTime(new Date('2026-07-17T17:20:00+08:00'));
    const base = storeValue();
    const data = {
      ...base.data,
      tasks: base.data.tasks.map((task) => task.id === 'task-reflow-demo' ? {
        ...task,
        status: 'notStarted' as const,
        plannedStartAt: '2026-07-17T07:00:00+08:00',
        plannedEndAt: '2026-07-17T07:45:00+08:00',
      } : task),
      progressLogs: base.data.progressLogs.filter((log) => log.taskId !== 'task-reflow-demo'),
    };
    const screen = await renderCalendar({ ...base, data });
    const plannedEntry = screen.getByTestId('calendar-entry-task-reflow-demo');

    expect(plannedEntry).toHaveTextContent(/07:00.*07:45/);
    expect(plannedEntry).toHaveTextContent(/已延迟.*未开始/);

    await fireEvent.press(screen.getByTestId('calendar-mode-day'));
    expect(screen.getByTestId('calendar-grid-task-reflow-demo')).toHaveTextContent(/07:00.*07:45.*已延迟/);
  });

  it('keeps past dates as history without new planning actions', async () => {
    const store = storeValue();
    const source = store.data.tasks.find((task) => task.id === 'task-date-only')!;
    store.data = { ...store.data, tasks: [...store.data.tasks, { ...source, id: 'task-past', title: '过去事项', plannedDate: '2026-07-16' }] };
    const screen = await renderCalendar(store);

    await fireEvent.press(screen.getByTestId('calendar-day-2026-07-16'));
    expect(screen.getByText('过去事项')).toBeTruthy();
    expect(screen.queryByText('可用时间')).toBeNull();
    expect(screen.queryByTestId('calendar-suggestion')).toBeNull();
    expect(screen.queryByLabelText('安排时间 过去事项')).toBeNull();
  });

  it('follows the new local day after midnight when the user was viewing today', async () => {
    jest.setSystemTime(new Date('2026-07-17T23:59:30+08:00'));
    const screen = await renderCalendar(storeValue());
    expect(screen.getByText('选中 · 7月17日')).toBeTruthy();

    await act(async () => {
      jest.setSystemTime(new Date('2026-07-18T00:00:30+08:00'));
      jest.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('选中 · 7月18日')).toBeTruthy();
  });

  it('limits completed history on the primary calendar surface', async () => {
    const store = storeValue();
    const source = store.data.tasks.find((task) => task.id === 'task-inbox-cleanup')!;
    store.data = {
      ...store.data,
      tasks: [...store.data.tasks, ...[13, 14, 15, 16].map((hour, index) => ({ ...source, id: `task-calendar-completed-${index}`, completedAt: `2026-07-17T${hour}:00:00+08:00` }))],
    };
    const screen = await renderCalendar(store);

    expect(screen.getAllByTestId(/^calendar-entry-task-calendar-completed-/)).toHaveLength(3);
    expect(screen.queryByTestId('calendar-entry-task-inbox-cleanup')).toBeNull();
    await fireEvent.press(screen.getByTestId('toggle-calendar-completed'));
    expect(screen.getAllByTestId(/^calendar-entry-task-calendar-completed-/)).toHaveLength(4);
    expect(screen.getByTestId('calendar-entry-task-inbox-cleanup')).toBeTruthy();
  });
});
