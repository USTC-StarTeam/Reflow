import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { createSeedData } from '@/core/demo-data';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import { TaskDetailModal } from '../task-detail-modal';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/core/store', () => ({
  useReflowStore: jest.fn(),
}));

const mockedUseReflowStore = jest.mocked(useReflowStore);

function storeValue(): ReflowStoreValue {
  return {
    data: createSeedData(new Date('2026-07-17T12:00:00+08:00')),
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
    updateTaskDetails: jest.fn(),
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

describe('TaskDetailModal', () => {
  afterEach(() => {
    mockPush.mockReset();
  });

  it('saves the three editable fields and a valid plan date through explicit actions', async () => {
    const store = storeValue();
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await render(<TaskDetailModal task={task} visible onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('task-detail-title'), '确认客户报价终稿');
    await fireEvent.changeText(screen.getByTestId('task-detail-duration'), '45');
    await fireEvent.changeText(screen.getByTestId('task-detail-next-action'), '核对付款条款');
    await fireEvent.press(screen.getByTestId('save-task-details'));
    expect(store.updateTaskDetails).toHaveBeenCalledWith(task.id, {
      title: '确认客户报价终稿',
      estimatedMinutes: 45,
      nextAction: '核对付款条款',
    });

    await fireEvent.changeText(screen.getByTestId('task-detail-date'), '2026-07-18');
    await fireEvent.press(screen.getByTestId('save-task-date'));
    expect(store.planTaskForDate).toHaveBeenCalledWith(task.id, '2026-07-18');
  });

  it('keeps Detail and Schedule modals mutually exclusive and returns after closing schedule', async () => {
    const store = storeValue();
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await render(<TaskDetailModal task={task} visible onClose={jest.fn()} />);

    await fireEvent.press(screen.getByTestId('open-task-schedule'));
    expect(screen.queryByTestId('today-task-detail')).toBeNull();
    expect(screen.getByText('安排任务时间')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('关闭排期'));
    expect(screen.getByTestId('today-task-detail')).toBeTruthy();
    expect(screen.queryByText('安排任务时间')).toBeNull();
  });

  it('delegates unschedule, someday, start, and completion without adding planning rules', async () => {
    const store = storeValue();
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    mockedUseReflowStore.mockReturnValue(store);
    const close = jest.fn();
    const screen = await render(<TaskDetailModal task={task} visible onClose={close} />);

    await fireEvent.press(screen.getByTestId('unschedule-task'));
    expect(store.unscheduleTask).toHaveBeenCalledWith(task.id);
    await fireEvent.press(screen.getByTestId('start-task-from-detail'));
    expect(store.startTask).toHaveBeenCalledWith(task.id);
    expect(mockPush).toHaveBeenCalledWith('/active');
    expect(close).toHaveBeenCalled();

    const someday = await render(<TaskDetailModal task={task} visible onClose={close} />);
    await fireEvent.press(someday.getByTestId('defer-task-someday'));
    expect(store.deferTask).toHaveBeenCalledWith(task.id, { bucket: 'someday' });

    const complete = await render(<TaskDetailModal task={task} visible onClose={close} />);
    await fireEvent.press(complete.getByTestId('complete-task-from-detail'));
    expect(store.completeTask).toHaveBeenCalledWith(task.id);
  });

  it('rejects empty fields, invalid duration, and invalid dates before dispatch', async () => {
    const store = storeValue();
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await render(<TaskDetailModal task={task} visible onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('task-detail-title'), ' ');
    await fireEvent.press(screen.getByTestId('save-task-details'));
    expect(screen.getByTestId('task-detail-error')).toHaveTextContent('任务标题不能为空。');
    expect(store.updateTaskDetails).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('task-detail-title'), '有效标题');
    await fireEvent.changeText(screen.getByTestId('task-detail-duration'), '481');
    await fireEvent.press(screen.getByTestId('save-task-details'));
    expect(screen.getByTestId('task-detail-error')).toHaveTextContent('预计耗时需填写 5～480 分钟的整数。');
    expect(store.updateTaskDetails).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('task-detail-date'), '2026-02-30');
    await fireEvent.press(screen.getByTestId('save-task-date'));
    expect(screen.getByTestId('task-detail-error')).toHaveTextContent('请输入 YYYY-MM-DD 格式的有效日期。');
    expect(store.planTaskForDate).not.toHaveBeenCalled();
  });
});
