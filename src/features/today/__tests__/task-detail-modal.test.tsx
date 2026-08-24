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
  const data = createSeedData(new Date('2026-07-17T12:00:00+08:00'));
  return {
    data: { ...data, tasks: data.tasks.map((task) => task.id === 'task-reflow-demo' ? { ...task, status: 'notStarted' } : task) },
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

describe('TaskDetailModal', () => {
  afterEach(() => {
    mockPush.mockReset();
  });

  it('saves the three editable fields and a valid plan date through explicit actions', async () => {
    const store = storeValue();
    const task = {
      ...store.data.tasks.find((item) => item.id === 'task-client-quote')!,
      plannedStartAt: undefined,
      plannedEndAt: undefined,
    };
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

  it('requires explicit confirmation before a cross-date change clears an exact time', async () => {
    const store = storeValue();
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await render(<TaskDetailModal task={task} visible onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('task-detail-date'), '2026-07-18');
    await fireEvent.press(screen.getByTestId('save-task-date'));

    expect(store.planTaskForDate).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-task-date-change')).toBeTruthy();
    expect(screen.queryByTestId('today-task-detail')).toBeNull();

    await fireEvent.press(screen.getByTestId('continue-editing-task-date'));
    expect(screen.getByTestId('task-detail-date')).toHaveProp('value', '2026-07-18');
    expect(screen.getByTestId('task-detail-time')).toHaveTextContent('16:00–16:30');
    expect(store.planTaskForDate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('save-task-date'));
    await fireEvent.press(screen.getByTestId('confirm-unscheduled-date-change'));
    expect(store.planTaskForDate).toHaveBeenCalledTimes(1);
    expect(store.planTaskForDate).toHaveBeenCalledWith(task.id, '2026-07-18');
  });

  it('reopens scheduling with the draft date and existing exact duration', async () => {
    const store = storeValue();
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await render(<TaskDetailModal task={task} visible onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('task-detail-date'), '2026-07-18');
    await fireEvent.press(screen.getByTestId('save-task-date'));
    await fireEvent.press(screen.getByTestId('reschedule-task-date'));

    expect(screen.queryByTestId('confirm-task-date-change')).toBeNull();
    expect(screen.queryByTestId('today-task-detail')).toBeNull();
    expect(screen.getByTestId('schedule-date')).toHaveProp('value', '2026-07-18');
    expect(screen.getByTestId('schedule-time')).toHaveProp('value', '16:00');
    expect(screen.getByTestId('schedule-duration')).toHaveProp('value', '30');

    await fireEvent.press(screen.getByTestId('confirm-schedule'));
    expect(store.scheduleTask).toHaveBeenCalledTimes(1);
    expect(store.scheduleTask).toHaveBeenCalledWith(
      task.id,
      expect.stringContaining('2026-07-18T16:00:00'),
      expect.stringContaining('2026-07-18T16:30:00'),
    );
    expect(screen.getByTestId('task-detail-date')).toHaveProp('value', '2026-07-18');
    await fireEvent.press(screen.getByTestId('start-task-from-detail'));
    expect(screen.queryByTestId('discard-task-changes')).toBeNull();
  });

  it('treats saving an unchanged exact-time date as a no-op', async () => {
    const store = storeValue();
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await render(<TaskDetailModal task={task} visible onClose={jest.fn()} />);

    await fireEvent.press(screen.getByTestId('save-task-date'));
    expect(store.planTaskForDate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-task-date-change')).toBeNull();
    expect(screen.getByTestId('task-detail-time')).toHaveTextContent('16:00–16:30');
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

  it('adopts a canonical cross-date schedule without making the returned date dirty', async () => {
    const store = storeValue();
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await render(<TaskDetailModal task={task} visible onClose={jest.fn()} />);

    await fireEvent.press(screen.getByTestId('open-task-schedule'));
    const scheduledTask = {
      ...task,
      plannedDate: '2026-07-18' as const,
      plannedStartAt: '2026-07-18T14:00:00+08:00',
      plannedEndAt: '2026-07-18T14:45:00+08:00',
    };
    await screen.rerender(<TaskDetailModal task={scheduledTask} visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('关闭排期'));

    expect(screen.getByTestId('task-detail-date')).toHaveProp('value', '2026-07-18');
    expect(screen.getByTestId('task-detail-time')).toHaveTextContent('14:00–14:45');
    await fireEvent.press(screen.getByTestId('save-task-date'));
    expect(store.planTaskForDate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('start-task-from-detail'));
    expect(screen.queryByTestId('discard-task-changes')).toBeNull();
  });

  it('does not overwrite a locally dirty date when canonical planning changes elsewhere', async () => {
    const store = storeValue();
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await render(<TaskDetailModal task={task} visible onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('task-detail-date'), '2026-07-19');
    await screen.rerender(<TaskDetailModal task={{
      ...task,
      plannedDate: '2026-07-18',
      plannedStartAt: '2026-07-18T14:00:00+08:00',
      plannedEndAt: '2026-07-18T14:45:00+08:00',
    }} visible onClose={jest.fn()} />);

    expect(screen.getByTestId('task-detail-date')).toHaveProp('value', '2026-07-19');
  });

  it('guards scheduling and closing until the user explicitly discards dirty edits', async () => {
    const store = storeValue();
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    const close = jest.fn();
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await render(<TaskDetailModal task={task} visible onClose={close} />);

    await fireEvent.changeText(screen.getByTestId('task-detail-title'), '尚未保存的标题');
    await fireEvent.press(screen.getByTestId('open-task-schedule'));
    expect(screen.getByText('继续操作将放弃这些修改。')).toBeTruthy();
    expect(screen.queryByTestId('schedule-date')).toBeNull();

    await fireEvent.press(screen.getByTestId('continue-editing-task'));
    expect(screen.getByTestId('task-detail-title')).toHaveProp('value', '尚未保存的标题');
    await fireEvent.press(screen.getByLabelText('关闭'));
    expect(close).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('discard-task-changes-and-continue'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps independently dirty dates guarded after saving content and executes start once after discard', async () => {
    const store = storeValue();
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    const close = jest.fn();
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await render(<TaskDetailModal task={task} visible onClose={close} />);

    await fireEvent.changeText(screen.getByTestId('task-detail-title'), '已保存的标题');
    await fireEvent.changeText(screen.getByTestId('task-detail-date'), '2026-07-18');
    await fireEvent.press(screen.getByTestId('save-task-details'));
    expect(store.updateTaskDetails).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('start-task-from-detail'));
    expect(store.startTask).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('discard-task-changes-and-continue'));
    expect(store.startTask).toHaveBeenCalledTimes(1);
    expect(store.startTask).toHaveBeenCalledWith(task.id);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/active');
    expect(close).toHaveBeenCalledTimes(1);
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

  it('requires an explicit switch before pausing the current task and starting another', async () => {
    const store = storeValue();
    store.data = {
      ...store.data,
      tasks: store.data.tasks.map((task) => task.id === 'task-reflow-demo' ? { ...task, status: 'inProgress' } : task),
    };
    const task = store.data.tasks.find((item) => item.id === 'task-client-quote')!;
    mockedUseReflowStore.mockReturnValue(store);
    const screen = await render(<TaskDetailModal task={task} visible onClose={jest.fn()} />);

    await fireEvent.press(screen.getByTestId('start-task-from-detail'));
    expect(screen.getByTestId('confirm-task-switch')).toBeTruthy();
    expect(screen.getByText(/切换后会先暂停它并保留实际执行时间/)).toBeTruthy();
    expect(store.startTask).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('confirm-task-switch-action'));
    expect(store.startTask).toHaveBeenCalledWith(task.id);
    expect(mockPush).toHaveBeenCalledWith('/active');
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
