import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import { createEmptyData } from '@/core/demo-data';
import { createReviewSuggestionService, type ReviewSuggestionResult, type ReviewSuggestionService } from '@/core/review-suggestion-service';
import { deriveDailyReviewSnapshot } from '@/core/selectors';
import { useReflowStore, type ReflowStoreValue, type StoreCommandResult } from '@/core/store';
import type { CaptureSource, DailyReviewSnapshot, DomainData } from '@/core/types';
import { ShellContext } from '@/features/shared/shell-context';
import { TomorrowSuggestion } from '../tomorrow-suggestion';

jest.mock('@/core/store', () => ({ useReflowStore: jest.fn() }));
jest.mock('@/core/review-suggestion-service', () => ({ createReviewSuggestionService: jest.fn() }));

// 进程内首次挂载 RN Modal 需要数秒一次性初始化，默认 5 秒会被这套冷启动吃掉。
jest.setTimeout(20_000);

const mockedUseReflowStore = jest.mocked(useReflowStore);
const mockedCreateService = jest.mocked(createReviewSuggestionService);

const today = '2026-07-17';
const tomorrow = '2026-07-18';

const recordedDay: DomainData = {
  ...createEmptyData(),
  tasks: [
    {
      id: 'task-a', title: '整理实验数据', status: 'completed', category: 'learning', bucket: 'today', estimatedMinutes: 60,
      nextAction: '导出原始数据', sourceSummary: 'Web 文本', sortIndex: 0, createdAt: '2026-07-17T08:00:00+08:00',
      plannedDate: '2026-07-17', completedAt: '2026-07-17T11:00:00+08:00',
    },
    {
      id: 'task-b', title: '整理周报', status: 'notStarted', category: 'work', bucket: 'today', estimatedMinutes: 30,
      nextAction: '列出要点', sourceSummary: 'Web 文本', sortIndex: 1, createdAt: '2026-07-17T08:00:00+08:00', plannedDate: '2026-07-17',
    },
  ],
  taskPlanEvents: [
    { id: 'plan-a', taskId: 'task-a', kind: 'planned', occurredAt: '2026-07-17T08:30:00+08:00', before: {}, after: { plannedDate: '2026-07-17' }, source: 'user' },
    { id: 'plan-b', taskId: 'task-b', kind: 'planned', occurredAt: '2026-07-17T08:30:00+08:00', before: {}, after: { plannedDate: '2026-07-17' }, source: 'user' },
  ],
  timeEntries: [{ id: 'te-a', taskId: 'task-a', startedAt: '2026-07-17T09:00:00+08:00', endedAt: '2026-07-17T10:30:00+08:00', minutes: 90 }],
  progressLogs: [{ id: 'log-interrupt', taskId: 'task-a', createdAt: '2026-07-17T09:30:00+08:00', text: '被打断', kind: 'interrupt' }],
};

const suggestion = {
  title: '给一段执行留出完整时间',
  factIds: ['interruptions', 'recordedMinutes'] as ('interruptions' | 'recordedMinutes')[],
  action: '明天开始时把手机放到视线外，直到这一段自然结束再取回。',
};

function storeValue(data: DomainData, overrides: Partial<ReflowStoreValue> = {}): ReflowStoreValue {
  return {
    data,
    hydrated: true,
    recoveryFailure: false,
    persistenceFailure: false,
    capturing: false,
    proposalServiceKind: 'cloud',
    lastActionFailure: null,
    capture: captureMock({ status: 'success' }),
    retryCapture: jest.fn(), retryCaptureWithLocalRules: jest.fn(), submitUserDecision: jest.fn(), undoLastDecision: jest.fn(),
    startTask: jest.fn(), pauseTask: jest.fn(), completeTask: jest.fn(), restoreTask: jest.fn(), updateTaskDetails: jest.fn(), moveTask: jest.fn(), updateWaitingFollowUp: jest.fn(),
    recordTime: jest.fn(), correctTimeEntry: jest.fn(), recordProgress: jest.fn(), recordInterruption: jest.fn(), planTaskForDate: jest.fn(), scheduleTask: jest.fn(), unscheduleTask: jest.fn(), deferTask: jest.fn(), deleteTask: jest.fn(), reorderTasks: jest.fn(),
    exportBackup: jest.fn(), retryPersistence: jest.fn(), importBackup: jest.fn(), startEmpty: jest.fn(), resetDemo: jest.fn(),
    ...overrides,
  } as ReflowStoreValue;
}

type RequestFn = (snapshot: DailyReviewSnapshot) => Promise<ReviewSuggestionResult>;
type CaptureFn = (text: string, source?: CaptureSource) => Promise<StoreCommandResult>;

function requestMock(result: ReviewSuggestionResult) {
  return jest.fn<RequestFn>().mockResolvedValue(result);
}

function captureMock(result: StoreCommandResult) {
  return jest.fn<CaptureFn>().mockResolvedValue(result);
}

function useService(request: ReturnType<typeof requestMock>) {
  mockedCreateService.mockReturnValue({ request } as unknown as ReviewSuggestionService);
  return request;
}

async function renderSuggestion(store: ReflowStoreValue) {
  mockedUseReflowStore.mockReturnValue(store);
  const screen = await render(
    <ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}>
      <TomorrowSuggestion today={today} />
    </ShellContext.Provider>,
  );
  await act(async () => {});
  return screen;
}

describe('TomorrowSuggestion', () => {
  it('stays completely hidden in Mock mode instead of imitating a real review', async () => {
    const screen = await renderSuggestion(storeValue(recordedDay, { proposalServiceKind: 'mock' }));
    expect(screen.queryByTestId('review-tomorrow-suggestion')).toBeNull();
    expect(screen.queryByTestId('review-tomorrow-suggestion-gate')).toBeNull();
  });

  it('explains missing records instead of calling the model', async () => {
    const request = useService(requestMock({ status: 'success', suggestions: [] }));
    const screen = await renderSuggestion(storeValue(createEmptyData()));
    expect(screen.getByTestId('review-tomorrow-suggestion-gate')).toHaveTextContent(/今天还没有已结束的执行记录/);
    expect(screen.queryByTestId('generate-tomorrow-suggestion')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('points at the existing correction flow when an abnormal TimeEntry affects the day', async () => {
    const request = useService(requestMock({ status: 'success', suggestions: [] }));
    const data: DomainData = {
      ...recordedDay,
      timeEntries: [{ id: 'te-forgotten', taskId: 'task-a', startedAt: '2026-07-16T23:30:00+08:00', endedAt: '2026-07-17T11:53:00+08:00', minutes: 743 }],
    };
    const screen = await renderSuggestion(storeValue(data));
    expect(screen.getByTestId('review-tomorrow-suggestion-gate')).toHaveTextContent(/尚未核对的执行记录/);
    expect(screen.getByTestId('review-tomorrow-suggestion-gate')).toHaveTextContent(/核对记录/);
    expect(request).not.toHaveBeenCalled();
  });

  it('points at Active when a cross-day execution segment is still open', async () => {
    const request = useService(requestMock({ status: 'success', suggestions: [] }));
    const data: DomainData = {
      ...recordedDay,
      tasks: [...recordedDay.tasks, { ...recordedDay.tasks[1], id: 'task-open', status: 'inProgress' }],
      progressLogs: [...recordedDay.progressLogs, { id: 'log-open', taskId: 'task-open', kind: 'start', text: '昨日开始', createdAt: '2026-07-16T23:30:00+08:00' }],
    };
    const screen = await renderSuggestion(storeValue(data));
    expect(screen.getByTestId('review-tomorrow-suggestion-gate')).toHaveTextContent(/跨日仍进行中的执行段/);
    expect(request).not.toHaveBeenCalled();
  });

  it('sends only the aggregate snapshot and renders every number itself', async () => {
    const request = useService(requestMock({ status: 'success', suggestions: [suggestion] }));
    const screen = await renderSuggestion(storeValue(recordedDay));
    expect(screen.getByTestId('review-tomorrow-suggestion')).toHaveTextContent(/仅发送统计事实，不含任务内容/);

    await fireEvent.press(screen.getByTestId('generate-tomorrow-suggestion'));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toEqual({
      date: today,
      timeZone: expect.any(String),
      plannedCount: 2,
      completedAsPlannedCount: 1,
      completedTotalCount: 1,
      recordedMinutes: 90,
      interruptions: 1,
      categoryMinutes: [{ category: 'learning', minutes: 90 }],
      recordsComplete: true,
    });
    expect(JSON.stringify(request.mock.calls[0][0])).not.toContain('整理实验数据');

    const card = screen.getByTestId('tomorrow-suggestion-0');
    expect(card).toHaveTextContent(/给一段执行留出完整时间/);
    expect(card).toHaveTextContent(/明天开始时把手机放到视线外/);
    expect(screen.queryByTestId('tomorrow-suggestion-fact-0-interruptions')).toBeNull();

    await fireEvent.press(screen.getByTestId('tomorrow-suggestion-basis-0'));
    expect(screen.getByTestId('tomorrow-suggestion-fact-0-interruptions')).toHaveTextContent(/中断 1 次/);
    expect(screen.getByTestId('tomorrow-suggestion-fact-0-recordedMinutes')).toHaveTextContent(/已记录投入.*1小时30分/);
    expect(card).toHaveTextContent(/以上数字由程序从今天的事实直接渲染/);
  });

  it('keeps an honest empty result and never writes to the domain on view, generate or dismiss', async () => {
    useService(requestMock({ status: 'success', suggestions: [] }));
    const store = storeValue(recordedDay);
    const screen = await renderSuggestion(store);
    await fireEvent.press(screen.getByTestId('generate-tomorrow-suggestion'));
    expect(screen.getByTestId('tomorrow-suggestion-empty')).toHaveTextContent(/还不足以给出有依据的调整建议/);
    expect(store.capture).not.toHaveBeenCalled();
    expect(store.submitUserDecision).not.toHaveBeenCalled();
    expect(store.correctTimeEntry).not.toHaveBeenCalled();
  });

  it('dismisses a suggestion without touching domain state', async () => {
    useService(requestMock({ status: 'success', suggestions: [suggestion] }));
    const store = storeValue(recordedDay);
    const screen = await renderSuggestion(store);
    await fireEvent.press(screen.getByTestId('generate-tomorrow-suggestion'));
    expect(screen.getByTestId('tomorrow-suggestion-0')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tomorrow-suggestion-dismiss-0'));
    expect(screen.queryByTestId('tomorrow-suggestion-0')).toBeNull();
    expect(store.capture).not.toHaveBeenCalled();
    expect(store.submitUserDecision).not.toHaveBeenCalled();
  });

  it('adopts through Capture only, prefilling tomorrow and leaving the formal task to Inbox', async () => {
    useService(requestMock({ status: 'success', suggestions: [suggestion] }));
    const store = storeValue(recordedDay);
    const screen = await renderSuggestion(store);
    await fireEvent.press(screen.getByTestId('generate-tomorrow-suggestion'));
    await fireEvent.press(screen.getByTestId('tomorrow-suggestion-adopt-0'));

    expect(screen.getByTestId('tomorrow-action-draft')).toBeTruthy();
    expect(screen.getByTestId('tomorrow-action-input').props.value).toBe(suggestion.action);
    expect(screen.getByTestId('tomorrow-action-date')).toHaveTextContent(/7月18日/);
    expect(store.capture).not.toHaveBeenCalled();
    expect(store.submitUserDecision).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('tomorrow-action-submit'));
    expect(store.capture).toHaveBeenCalledTimes(1);
    expect(store.capture).toHaveBeenCalledWith(`${suggestion.action}（${tomorrow}）`);
    expect(store.submitUserDecision).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tomorrow-action-draft')).toBeNull();
    expect(screen.getByTestId('tomorrow-suggestion-adopted')).toHaveTextContent(/去收件箱确认后才会在所选日期创建任务/);
  });

  it('lets the user change the date and keeps the ISO date in the capture text', async () => {
    useService(requestMock({ status: 'success', suggestions: [suggestion] }));
    const store = storeValue(recordedDay);
    const screen = await renderSuggestion(store);
    await fireEvent.press(screen.getByTestId('generate-tomorrow-suggestion'));
    await fireEvent.press(screen.getByTestId('tomorrow-suggestion-adopt-0'));
    await fireEvent.press(screen.getByTestId('tomorrow-action-date'));
    await fireEvent.press(screen.getByTestId('proposal-date-option-2026-07-20'));

    await fireEvent.press(screen.getByTestId('tomorrow-action-submit'));
    expect(store.capture).toHaveBeenCalledWith(`${suggestion.action}（2026-07-20）`);
  });

  it('blocks wording that would make the gateway drop the planned date', async () => {
    useService(requestMock({ status: 'success', suggestions: [suggestion] }));
    const store = storeValue(recordedDay);
    const screen = await renderSuggestion(store);
    await fireEvent.press(screen.getByTestId('generate-tomorrow-suggestion'));
    await fireEvent.press(screen.getByTestId('tomorrow-suggestion-adopt-0'));

    await fireEvent.changeText(screen.getByTestId('tomorrow-action-input'), '先整理数据；然后回复邮件');
    expect(screen.getByTestId('tomorrow-action-blocked')).toHaveTextContent(/请保持单一行动/);
    expect(screen.getByTestId('tomorrow-action-submit')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('tomorrow-action-submit'));
    expect(store.capture).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('tomorrow-action-input'), '   ');
    expect(screen.getByTestId('tomorrow-action-submit')).toBeDisabled();
  });

  it('keeps the edited draft when saving fails and retries without duplicating', async () => {
    useService(requestMock({ status: 'success', suggestions: [suggestion] }));
    const capture = captureMock({ status: 'failure', failure: { code: 'proposal_unavailable', message: '本地保存失败，输入仍保留在当前页面，请先重试保存。', retryable: true } });
    const screen = await renderSuggestion(storeValue(recordedDay, { capture }));
    await fireEvent.press(screen.getByTestId('generate-tomorrow-suggestion'));
    await fireEvent.press(screen.getByTestId('tomorrow-suggestion-adopt-0'));
    await fireEvent.changeText(screen.getByTestId('tomorrow-action-input'), '明天开始时把电脑通知全部关闭');

    await fireEvent.press(screen.getByTestId('tomorrow-action-submit'));
    expect(screen.getByTestId('tomorrow-action-error')).toHaveTextContent(/输入仍保留在当前页面/);
    expect(screen.getByTestId('tomorrow-action-input').props.value).toBe('明天开始时把电脑通知全部关闭');
    expect(screen.queryByTestId('tomorrow-suggestion-adopted')).toBeNull();

    capture.mockResolvedValue({ status: 'success' });
    await fireEvent.press(screen.getByTestId('tomorrow-action-submit'));
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenLastCalledWith(`明天开始时把电脑通知全部关闭（${tomorrow}）`);
    expect(screen.getByTestId('tomorrow-suggestion-adopted')).toBeTruthy();
  });

  it('locks submission while a capture is in flight so a second tap cannot duplicate it', async () => {
    useService(requestMock({ status: 'success', suggestions: [suggestion] }));
    let settle: (value: StoreCommandResult) => void = () => {};
    const capture = jest.fn<CaptureFn>().mockImplementation(() => new Promise<StoreCommandResult>((resolve) => { settle = resolve; }));
    const screen = await renderSuggestion(storeValue(recordedDay, { capture }));
    await fireEvent.press(screen.getByTestId('generate-tomorrow-suggestion'));
    await fireEvent.press(screen.getByTestId('tomorrow-suggestion-adopt-0'));

    // 只保留一个在飞的 act 作用域：嵌套 act 会破坏 RNTL v14 的渲染队列。
    const inFlight = fireEvent.press(screen.getByTestId('tomorrow-action-submit'));
    await Promise.resolve();
    await Promise.resolve();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('tomorrow-action-submit')).toBeDisabled();
    expect(screen.getByTestId('tomorrow-action-submit')).toHaveTextContent(/提交中/);

    settle({ status: 'success' });
    await inFlight;
    expect(capture).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('tomorrow-action-draft')).toBeNull();
    expect(screen.getByTestId('tomorrow-suggestion-adopted')).toBeTruthy();
  });

  it('keeps the deterministic review usable and retryable when the cloud call fails', async () => {
    const request = useService(requestMock({ status: 'failure', failure: { code: 'proposal_timeout', message: '云端复盘超时，请稍后重试。', retryable: true } }));
    const screen = await renderSuggestion(storeValue(recordedDay));
    await fireEvent.press(screen.getByTestId('generate-tomorrow-suggestion'));

    expect(screen.getByTestId('tomorrow-suggestion-failure')).toHaveTextContent(/云端复盘超时/);
    expect(screen.getByTestId('review-tomorrow-suggestion')).toHaveTextContent(/上面的确定性回顾事实不受影响/);
    expect(screen.queryByTestId('tomorrow-suggestion-0')).toBeNull();

    request.mockResolvedValue({ status: 'success', suggestions: [suggestion] });
    await fireEvent.press(screen.getByTestId('tomorrow-suggestion-regenerate'));
    expect(screen.getByTestId('tomorrow-suggestion-0')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('invalidates suggestions when the underlying facts change and requires regeneration before adopting', async () => {
    const request = useService(requestMock({ status: 'success', suggestions: [suggestion] }));
    const store = storeValue(recordedDay);
    const screen = await renderSuggestion(store);
    await fireEvent.press(screen.getByTestId('generate-tomorrow-suggestion'));
    expect(screen.getByTestId('tomorrow-suggestion-0')).toBeTruthy();
    expect(request.mock.calls[0][0].recordedMinutes).toBe(90);

    const corrected: DomainData = {
      ...recordedDay,
      timeEntries: [{ ...recordedDay.timeEntries[0], endedAt: '2026-07-17T09:40:00+08:00', minutes: 40 }],
    };
    const rerendered = { ...store, data: corrected };
    mockedUseReflowStore.mockReturnValue(rerendered);
    await screen.rerender(
      <ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}>
        <TomorrowSuggestion today={today} />
      </ShellContext.Provider>,
    );
    expect(deriveDailyReviewSnapshot(rerendered.data, today, 'Asia/Shanghai').recordedMinutes).toBe(40);

    expect(screen.getByTestId('tomorrow-suggestion-stale')).toHaveTextContent(/已经变化/);
    expect(screen.getByTestId('tomorrow-suggestion-stale')).toHaveTextContent(/重新生成/);
    expect(screen.queryByTestId('tomorrow-suggestion-0')).toBeNull();
    expect(screen.queryByTestId('tomorrow-suggestion-adopt-0')).toBeNull();
    expect(store.capture).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('tomorrow-suggestion-regenerate'));
    expect(request.mock.calls[1][0].recordedMinutes).toBe(40);
    expect(screen.getByTestId('tomorrow-suggestion-0')).toBeTruthy();
    expect(screen.queryByTestId('tomorrow-suggestion-stale')).toBeNull();
  });

  it('invalidates suggestions when the local date rolls over', async () => {
    useService(requestMock({ status: 'success', suggestions: [suggestion] }));
    const twoDays: DomainData = {
      ...recordedDay,
      timeEntries: [
        ...recordedDay.timeEntries,
        { id: 'te-next-day', taskId: 'task-a', startedAt: '2026-07-18T09:00:00+08:00', endedAt: '2026-07-18T09:30:00+08:00', minutes: 30 },
      ],
    };
    const store = storeValue(twoDays);
    const screen = await renderSuggestion(store);
    await fireEvent.press(screen.getByTestId('generate-tomorrow-suggestion'));
    expect(screen.getByTestId('tomorrow-suggestion-0')).toBeTruthy();

    await screen.rerender(
      <ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}>
        <TomorrowSuggestion today="2026-07-18" />
      </ShellContext.Provider>,
    );
    expect(screen.getByTestId('tomorrow-suggestion-stale')).toHaveTextContent(/已经变化/);
    expect(screen.queryByTestId('tomorrow-suggestion-0')).toBeNull();
    expect(store.capture).not.toHaveBeenCalled();
  });
});
