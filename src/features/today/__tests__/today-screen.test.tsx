import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import { createSeedData } from '@/core/demo-data';
import { dateKey } from '@/core/date-utils';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import type { TaskItem } from '@/core/types';
import { ShellContext } from '../../shared/shell-context';
import { TodayScreen } from '../today-screen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../task-detail-modal', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TaskDetailModal: ({ task, visible, onClose }: { task: TaskItem; visible: boolean; onClose: () => void }) => visible
      ? React.createElement(ReactNative.View, { testID: 'today-task-detail' },
        React.createElement(ReactNative.Text, null, task.title),
        React.createElement(ReactNative.Pressable, { accessibilityLabel: '关闭任务详情', onPress: onClose }))
      : null,
  };
});

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
    startTask: jest.fn(),
    pauseTask: jest.fn(),
    completeTask: jest.fn(),
    restoreTask: jest.fn(),
    updateTaskDetails: jest.fn(),
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
    mockPush.mockReset();
  });

  it('keeps Quick Capture and separates exact-time, date-only, and completed tasks', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    mockedUseReflowStore.mockReturnValue(storeValue());

    const screen = await renderToday();

    expect(screen.getByTestId('quick-capture-input')).toBeTruthy();
    expect(screen.queryByTestId('needs-attention')).toBeNull();
    expect(screen.getByText('轻量捕捉与今日重点')).toBeTruthy();
    expect(screen.queryByText('AI')).toBeNull();
    expect(screen.getByText('当前正在进行“完成 Reflow Demo 页面结构”，继续推进即可。')).toBeTruthy();
    expect(screen.getByText('今日提示')).toBeTruthy();
    expect(screen.queryByTestId('accept-today-order')).toBeNull();
    expect(screen.queryByTestId('manual-adjust-today')).toBeNull();
    expect(screen.getByText('时间安排')).toBeTruthy();
    expect(screen.getByText('今天要做')).toBeTruthy();
    expect(screen.getAllByText('已完成')).toHaveLength(2);
    expect(screen.getByTestId('task-task-reflow-demo')).toBeTruthy();
    expect(screen.getByTestId('task-task-reflow-demo')).toHaveTextContent(/进行中.*11:00.*继续/);
    expect(screen.getByTestId('task-task-reflow-demo')).toHaveTextContent(/原计划.*10:00.*11:30/);
    expect(screen.getByTestId('task-task-today-date-only')).toBeTruthy();
    expect(screen.getByText('整理本周实验报告')).toBeTruthy();
    expect(screen.getByText('预计 60 分')).toBeTruthy();
    expect(screen.getByTestId('restore-completed-task-inbox-cleanup')).toBeTruthy();
    expect(screen.getByLabelText('完成 完成 Reflow Demo 页面结构')).toBeTruthy();
    expect(screen.getByLabelText('完成 整理本周实验报告')).toBeTruthy();
  });

  it('keeps future plans quiet and marks a past planned start as delayed without rescheduling', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    const base = storeValue();
    const data = {
      ...base.data,
      tasks: base.data.tasks.map((task) => task.id === 'task-reflow-demo' ? { ...task, status: 'notStarted' as const } : task),
      progressLogs: base.data.progressLogs.filter((log) => log.taskId !== 'task-reflow-demo'),
    };
    mockedUseReflowStore.mockReturnValue({ ...base, data });

    const screen = await renderToday();
    const delayed = screen.getByTestId('task-task-reflow-demo');
    const future = screen.getByTestId('task-task-client-quote');

    expect(delayed).toHaveTextContent(/10:00.*11:30/);
    expect(delayed).toHaveTextContent(/已延迟.*未开始/);
    expect(future).toHaveTextContent(/16:00.*16:30/);
    expect(future).not.toHaveTextContent('已延迟');
    expect(screen.getByText('今天有 1 项计划开始时间已过，建议确认是否继续处理。')).toBeTruthy();
  });

  it('uses the latest start as a resumed current session and does not invent a legacy start time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T18:05:00+08:00'));
    const resumedBase = storeValue();
    mockedUseReflowStore.mockReturnValue({
      ...resumedBase,
      data: {
        ...resumedBase.data,
        progressLogs: [
          ...resumedBase.data.progressLogs,
          { id: 'pause-late', taskId: 'task-reflow-demo', kind: 'pause', text: '暂停', createdAt: '2026-07-17T17:30:00+08:00' },
          { id: 'resume-late', taskId: 'task-reflow-demo', kind: 'start', text: '继续', createdAt: '2026-07-17T18:00:00+08:00' },
        ],
      },
    });

    const resumed = await renderToday();
    expect(resumed.getByTestId('task-task-reflow-demo')).toHaveTextContent(/进行中.*18:00.*继续/);
    await resumed.unmount();

    const legacyBase = storeValue();
    mockedUseReflowStore.mockReturnValue({
      ...legacyBase,
      data: { ...legacyBase.data, progressLogs: legacyBase.data.progressLogs.filter((log) => log.kind !== 'start') },
    });
    const legacy = await renderToday();
    const legacyRow = legacy.getByTestId('task-task-reflow-demo');
    expect(legacyRow).toHaveTextContent(/●.*进行中/);
    expect(legacyRow).not.toHaveTextContent(/进行中 · \d{2}:\d{2}/);
  });

  it('shows the current session for a date-only task without inventing an original time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T17:20:00+08:00'));
    const base = storeValue();
    const data = {
      ...base.data,
      tasks: base.data.tasks.map((task) => task.id === 'task-reflow-demo'
        ? { ...task, status: 'notStarted' as const }
        : task.id === 'task-today-date-only' ? { ...task, status: 'inProgress' as const } : task),
      progressLogs: [
        ...base.data.progressLogs.filter((log) => log.kind !== 'start'),
        { id: 'date-only-start', taskId: 'task-today-date-only', kind: 'start' as const, text: '开始', createdAt: '2026-07-17T17:16:00+08:00' },
      ],
    };
    mockedUseReflowStore.mockReturnValue({ ...base, data });

    const screen = await renderToday();
    const row = screen.getByTestId('task-task-today-date-only');
    expect(row).toHaveTextContent(/进行中.*17:16.*开始/);
    expect(row).not.toHaveTextContent('原计划');
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
    expect(screen.getByTestId('task-task-reflow-demo')).toHaveTextContent(/10:00.*11:30/);
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

  it('completes the selected unfinished task through the one-tap status control', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    const store = storeValue();
    mockedUseReflowStore.mockReturnValue(store);

    const screen = await renderToday();
    fireEvent.press(screen.getByLabelText('完成 整理本周实验报告'));

    expect(store.completeTask).toHaveBeenCalledTimes(1);
    expect(store.completeTask).toHaveBeenCalledWith('task-today-date-only');
    expect(screen.queryByLabelText('开始 整理本周实验报告')).toBeNull();
    expect(screen.queryByLabelText('暂停 整理本周实验报告')).toBeNull();
  });

  it('opens task detail from the row body without coupling the completion control', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    const store = storeValue();
    mockedUseReflowStore.mockReturnValue(store);

    const screen = await renderToday();
    await fireEvent.press(screen.getByTestId('open-today-task-task-today-date-only'));

    const detail = screen.getByTestId('today-task-detail');
    expect(detail).toBeTruthy();
    expect(detail).toHaveTextContent('整理本周实验报告');
    expect(store.completeTask).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('关闭任务详情'));
    expect(screen.queryByTestId('today-task-detail')).toBeNull();
    await fireEvent.press(screen.getByLabelText('完成 整理本周实验报告'));
    expect(store.completeTask).toHaveBeenCalledWith('task-today-date-only');
    expect(screen.queryByTestId('today-task-detail')).toBeNull();
  });

  it('does not expose unavailable sorting and adjustment actions', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    const store = storeValue();
    mockedUseReflowStore.mockReturnValue(store);

    const screen = await renderToday();
    expect(screen.queryByTestId('accept-today-order')).toBeNull();
    expect(screen.queryByTestId('manual-adjust-today')).toBeNull();
    expect(store.reorderTasks).not.toHaveBeenCalled();
  });

  it('switches Today to the new local day while the app stays open', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T23:59:30+08:00'));
    mockedUseReflowStore.mockReturnValue(storeValue());
    const screen = await renderToday();

    expect(screen.getByText('整理本周实验报告')).toBeTruthy();
    await act(async () => {
      jest.setSystemTime(new Date('2026-07-18T00:00:30+08:00'));
      jest.advanceTimersByTime(60_000);
    });

    expect(screen.queryByText('整理本周实验报告')).toBeNull();
    expect(screen.getByText('今天还没有完成记录。')).toBeTruthy();
  });

  it('shows only the latest completed items until the user asks for history', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T18:00:00+08:00'));
    const store = storeValue();
    const source = store.data.tasks.find((task) => task.id === 'task-inbox-cleanup')!;
    store.data = {
      ...store.data,
      tasks: [
        ...store.data.tasks,
        ...[13, 14, 15, 16].map((hour, index) => ({ ...source, id: `task-completed-${index}`, title: `完成记录 ${index + 1}`, completedAt: `2026-07-17T${hour}:00:00+08:00` })),
      ],
    };
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await renderToday();

    expect(screen.getAllByTestId(/^task-task-completed-/)).toHaveLength(3);
    expect(screen.queryByTestId('task-task-inbox-cleanup')).toBeNull();
    await fireEvent.press(screen.getByTestId('toggle-today-completed'));
    expect(screen.getAllByTestId(/^task-task-completed-/)).toHaveLength(4);
    expect(screen.getByTestId('task-task-inbox-cleanup')).toBeTruthy();
  });

  it('restores a completed task through its explicit recovery control', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    const store = storeValue();
    mockedUseReflowStore.mockReturnValue(store);

    const screen = await renderToday();
    await fireEvent.press(screen.getByLabelText('恢复未完成 晨间整理收件箱'));
    expect(store.restoreTask).toHaveBeenCalledWith('task-inbox-cleanup');
  });

  it('surfaces overdue, due waiting, and cross-day active items with explicit recovery actions', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    const store = storeValue();
    const source = store.data.tasks.find((task) => task.id === 'task-client-quote')!;
    store.data = {
      ...store.data,
      tasks: [
        ...store.data.tasks.map((task) => task.id === 'task-reflow-demo' ? { ...task, plannedDate: '2026-07-16' } : task),
        { ...source, id: 'task-overdue', title: '昨日未完成', plannedDate: '2026-07-16', plannedStartAt: undefined, plannedEndAt: undefined },
        { ...source, id: 'task-waiting-due', title: '等待供应商回复', bucket: 'waiting', plannedDate: undefined, plannedStartAt: undefined, plannedEndAt: undefined, waitingDetails: { waitingFor: '供应商', waitingOn: '确认回复', followUpDate: '2026-07-17' } },
      ],
      progressLogs: [
        ...store.data.progressLogs.filter((log) => log.taskId !== 'task-reflow-demo' || (log.kind !== 'start' && log.kind !== 'pause' && log.kind !== 'complete')),
        { id: 'open-yesterday', taskId: 'task-reflow-demo', kind: 'start', text: '昨日开始', createdAt: '2026-07-16T23:30:00+08:00' },
      ],
    };
    mockedUseReflowStore.mockReturnValue(store);

    const screen = await renderToday();
    expect(screen.getByTestId('needs-attention')).toBeTruthy();
    expect(screen.getByText('1 项逾期 · 1 项待跟进 · 1 项跨日进行中')).toBeTruthy();
    expect(screen.queryByTestId('attention-crossDayActive-task-reflow-demo')).toBeNull();
    await fireEvent.press(screen.getByTestId('open-needs-attention'));
    expect(screen.getByTestId('needs-attention-sheet')).toBeTruthy();
    expect(screen.getByTestId('attention-crossDayActive-task-reflow-demo')).toBeTruthy();
    expect(screen.getByTestId('attention-overdue-task-overdue')).toBeTruthy();
    expect(screen.getByTestId('attention-waitingDue-task-waiting-due')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('attention-today-task-overdue'));
    expect(store.planTaskForDate).toHaveBeenCalledWith('task-overdue', '2026-07-17');
    await fireEvent.press(screen.getByTestId('attention-regular-task-waiting-due'));
    expect(store.moveTask).toHaveBeenCalledWith('task-waiting-due', 'today');
    await fireEvent.press(screen.getByTestId('attention-follow-up-task-waiting-due'));
    await fireEvent.press(screen.getByTestId('proposal-date-today'));
    expect(store.updateWaitingFollowUp).toHaveBeenCalledWith('task-waiting-due', '2026-07-17');
    await fireEvent.press(screen.getByTestId('open-needs-attention'));
    await fireEvent.press(screen.getByTestId('attention-pause-today-task-reflow-demo'));
    expect(store.pauseTask).toHaveBeenCalledWith('task-reflow-demo');
    expect(store.planTaskForDate).toHaveBeenCalledWith('task-reflow-demo', '2026-07-17');
  }, 10_000);

  it('provides a secondary Someday list and can bring an item back to today', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00+08:00'));
    const store = storeValue();
    const source = store.data.tasks.find((task) => task.id === 'task-client-quote')!;
    store.data = {
      ...store.data,
      tasks: [...store.data.tasks, { ...source, id: 'task-someday', title: '整理旅行照片', bucket: 'someday', plannedDate: undefined, plannedStartAt: undefined, plannedEndAt: undefined }],
    };
    mockedUseReflowStore.mockReturnValue(store);

    const screen = await renderToday();
    expect(screen.getByTestId('someday-entry')).toHaveTextContent(/1 件尚未安排的事项/);
    await fireEvent.press(screen.getByTestId('open-someday'));
    expect(screen.getByTestId('someday-list')).toHaveTextContent(/整理旅行照片/);
    await fireEvent.press(screen.getByTestId('someday-today-task-someday'));
    expect(store.planTaskForDate).toHaveBeenCalledWith('task-someday', '2026-07-17');
  });
});
