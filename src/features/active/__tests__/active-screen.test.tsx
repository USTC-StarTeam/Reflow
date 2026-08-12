import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { createSeedData } from '@/core/demo-data';
import { toZonedISOString } from '@/core/date-utils';
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
    expect(screen.getByText('已执行 45 分 · 预计 90 分钟')).toBeTruthy();
    expect(screen.getByText('补齐收件箱确认流程')).toBeTruthy();
    expect(screen.getByText('本次执行 45 分 · 暂停 0 次 · 被打断 1 次')).toBeTruthy();
    expect(screen.getByText('完成 Today 页面结构和设计令牌')).toBeTruthy();
    expect(screen.queryByText('工作推进')).toBeNull();
    expect(screen.queryByText('+15 分钟')).toBeNull();
    expect(screen.queryByText('记录打断')).toBeNull();
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

  it('shows at most three candidates only when idle and marks the latest paused task to continue', async () => {
    const data = createSeedData();
    data.tasks = data.tasks.map((task) => task.id === 'task-reflow-demo' ? { ...task, status: 'notStarted' } : task);
    data.progressLogs = [
      ...data.progressLogs,
      {
        id: 'log-pause-latest',
        taskId: 'task-reflow-demo',
        kind: 'pause',
        text: '暂停任务',
        createdAt: toZonedISOString(new Date()),
      },
    ];
    const store = storeValue(data);
    const screen = await renderActive(store);

    expect(screen.getByTestId('active-empty-state')).toBeTruthy();
    expect(screen.getByText('完成 Reflow Demo 页面结构（已暂停）')).toBeTruthy();
    expect(screen.getByLabelText('继续')).toBeTruthy();
    expect(screen.getAllByTestId(/^active-candidate-/)).toHaveLength(3);

    await fireEvent.press(screen.getByLabelText('继续'));
    expect(store.startTask).toHaveBeenCalledWith('task-reflow-demo');
  });
});
