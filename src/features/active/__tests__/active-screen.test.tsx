import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { createSeedData } from '@/core/demo-data';
import { addDays, addLocalDays, dateKey, toZonedISOString } from '@/core/date-utils';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import type { DomainData } from '@/core/types';
import { ShellContext } from '@/features/shared/shell-context';
import { ActiveScreen } from '../active-screen';

jest.mock('@/core/store', () => ({
  useReflowStore: jest.fn(),
}));

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

async function renderActive(store: ReflowStoreValue) {
  mockedUseReflowStore.mockReturnValue(store);
  return render(
    <ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}>
      <ActiveScreen />
    </ShellContext.Provider>,
  );
}

describe('ActiveScreen presentation', () => {
  it('keeps the current task central and summarizes execution without management controls', async () => {
    const data = createSeedData();
    const screen = await renderActive(storeValue(data));

    expect(screen.getByText('完成 Reflow Demo 页面结构')).toBeTruthy();
    expect(screen.getByText(/当前执行段 \d+ 分 · 任务累计 \d+ 分 · 预计 90 分钟/)).toBeTruthy();
    expect(screen.getByText('补齐收件箱确认流程')).toBeTruthy();
    expect(screen.getByText(/当前执行段 \d+ 分 · 任务累计 \d+ 分 · 暂停 1 次 · 被打断 1 次/)).toBeTruthy();
    expect(screen.getByText('执行概况')).toBeTruthy();
    expect(screen.queryByText('本次执行')).toBeNull();
    expect(screen.getByText('完成 Today 页面结构和设计令牌')).toBeTruthy();
    expect(screen.queryByText('工作推进')).toBeNull();
    expect(screen.queryByText('+15 分钟')).toBeNull();
    expect(screen.getByText('记录中断')).toBeTruthy();
    expect(screen.queryByText('删除')).toBeNull();
    expect(screen.queryByText('本地进度估算')).toBeNull();
    expect(screen.queryByText('执行时间线')).toBeNull();
    expect(screen.queryByText('16:30 前跟进客户报价')).toBeNull();
  });

  it('records progress and exposes only pause and complete as task actions', async () => {
    const store = storeValue(createSeedData());
    const screen = await renderActive(store);

    await fireEvent.changeText(screen.getByTestId('progress-input'), '补齐移动端交互');
    await fireEvent.press(screen.getByTestId('record-progress'));
    await fireEvent.press(screen.getByTestId('pause-task'));
    await fireEvent.press(screen.getByTestId('complete-task'));

    expect(store.recordProgress).toHaveBeenCalledTimes(1);
    expect(store.recordProgress).toHaveBeenCalledWith('task-reflow-demo', '补齐移动端交互');
    expect(store.pauseTask).toHaveBeenCalledWith('task-reflow-demo');
    expect(store.completeTask).toHaveBeenCalledWith('task-reflow-demo');
    expect(store.recordTime).not.toHaveBeenCalled();
    expect(store.recordInterruption).not.toHaveBeenCalled();
    expect(store.deleteTask).not.toHaveBeenCalled();
  });

  it('records and cancels an interruption without changing task lifecycle', async () => {
    const store = storeValue(createSeedData());
    const screen = await renderActive(store);

    await fireEvent.press(screen.getByTestId('open-interruption'));
    expect(screen.getByText('被什么打断了？')).toBeTruthy();
    expect(screen.getByTestId('cancel-interruption')).toBeTruthy();
    expect(screen.getByTestId('save-interruption')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('interruption-input'), '同学临时来找');
    await fireEvent.press(screen.getByTestId('save-interruption'));

    expect(store.recordInterruption).toHaveBeenCalledWith('task-reflow-demo', '同学临时来找');
    expect(store.pauseTask).not.toHaveBeenCalled();
    expect(store.completeTask).not.toHaveBeenCalled();
    expect(screen.queryByTestId('interruption-form')).toBeNull();

    await fireEvent.press(screen.getByTestId('open-interruption'));
    await fireEvent.changeText(screen.getByTestId('interruption-input'), '不会保存');
    await fireEvent.press(screen.getByTestId('cancel-interruption'));
    expect(screen.queryByTestId('interruption-form')).toBeNull();
    expect(store.recordInterruption).toHaveBeenCalledTimes(1);
  });

  it('passes an empty interruption reason to the existing Store fallback', async () => {
    const store = storeValue(createSeedData());
    const screen = await renderActive(store);

    await fireEvent.press(screen.getByTestId('open-interruption'));
    await fireEvent.press(screen.getByTestId('save-interruption'));

    expect(store.recordInterruption).toHaveBeenCalledWith('task-reflow-demo', '');
    expect(store.pauseTask).not.toHaveBeenCalled();
    expect(store.completeTask).not.toHaveBeenCalled();
  });

  it('keeps a cross-day paused task first, deduplicates it from today, and limits candidates to three', async () => {
    const data = createSeedData();
    const today = dateKey(new Date());
    data.tasks = data.tasks.map((task) => task.id === 'task-reflow-demo' ? {
      ...task,
      status: 'notStarted',
      plannedDate: addLocalDays(today, -1),
      plannedStartAt: undefined,
      plannedEndAt: undefined,
    } : task);
    data.progressLogs = [
      ...data.progressLogs.filter((log) => log.taskId !== 'task-reflow-demo'),
      {
        id: 'log-pause-latest',
        taskId: 'task-reflow-demo',
        kind: 'pause',
        text: '暂停任务',
        createdAt: toZonedISOString(addDays(new Date(), -1)),
      },
    ];
    const store = storeValue(data);
    const screen = await renderActive(store);

    expect(screen.getByTestId('active-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('open-interruption')).toBeNull();
    expect(screen.getByText('完成 Reflow Demo 页面结构（已暂停）')).toBeTruthy();
    expect(screen.getByText(/暂停 · 预计 90 分钟/)).toBeTruthy();
    expect(screen.getByLabelText('继续')).toBeTruthy();
    expect(screen.getAllByTestId(/^active-candidate-/)).toHaveLength(3);
    expect(screen.getAllByTestId('active-candidate-task-reflow-demo')).toHaveLength(1);

    await fireEvent.press(screen.getByLabelText('继续'));
    expect(store.startTask).toHaveBeenCalledWith('task-reflow-demo');
  });

  it.each(['completed', 'deleted'] as const)('does not surface a %s historical pause', async (state) => {
    const data = createSeedData();
    data.tasks = data.tasks.map((task) => task.id === 'task-reflow-demo' ? {
      ...task,
      status: state === 'completed' ? 'completed' : 'notStarted',
      deletedAt: state === 'deleted' ? toZonedISOString(new Date()) : undefined,
      plannedDate: addLocalDays(dateKey(new Date()), -1),
      plannedStartAt: undefined,
      plannedEndAt: undefined,
    } : task);
    data.progressLogs = [
      ...data.progressLogs,
      {
        id: `log-pause-${state}`,
        taskId: 'task-reflow-demo',
        kind: 'pause',
        text: '暂停任务',
        createdAt: toZonedISOString(new Date()),
      },
    ];

    const screen = await renderActive(storeValue(data));

    expect(screen.queryByTestId('active-candidate-task-reflow-demo')).toBeNull();
    expect(screen.getAllByTestId(/^active-candidate-/)).toHaveLength(2);
  });
});
