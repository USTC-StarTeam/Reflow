import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createEmptyData, createSeedData } from '../demo-data';
import { PERSISTENCE_KEY, RECOVERY_KEY, serializeBackup } from '../persistence';
import { ReflowProvider, useReflowStore } from '../store';
import type { ReflowStoreValue } from '../store';
import type { ProposalRequest, ProposalResult, ProposalService } from '../types';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const mockedStorage = jest.mocked(AsyncStorage);
let probedStore: ReflowStoreValue | undefined;

async function settlePersistence() {
  await act(async () => {
    await Promise.resolve();
  });
}

function StoreProbe() {
  const store = useReflowStore();
  useEffect(() => {
    probedStore = store;
  }, [store]);
  return (
    <>
      <Text testID="hydrated">{String(store.hydrated)}</Text>
      <Text testID="recovery-failure">{String(store.recoveryFailure)}</Text>
      <Text testID="persistence-failure">{String(store.persistenceFailure)}</Text>
      <Text testID="task-count">{store.data.tasks.length}</Text>
      <Text testID="progress-log-count">{store.data.progressLogs.length}</Text>
      <Text testID="decision-count">{store.data.decisions.length}</Text>
      <Text testID="plan-event-count">{store.data.taskPlanEvents.length}</Text>
      <Text testID="capture-count">{store.data.captures.length}</Text>
      <Text testID="capture-states">{store.data.captures.map((capture) => capture.pipelineState).join(',')}</Text>
      <Pressable testID="start-empty" onPress={store.startEmpty}><Text>开始空白空间</Text></Pressable>
      <Pressable testID="load-demo" onPress={store.resetDemo}><Text>加载演示数据</Text></Pressable>
      <Pressable testID="record-progress-first" onPress={() => store.recordProgress('task-reflow-demo', '第一次保存')}><Text>记录第一次进度</Text></Pressable>
      <Pressable testID="record-progress-second" onPress={() => store.recordProgress('task-reflow-demo', '第二次保存')}><Text>记录第二次进度</Text></Pressable>
      <Pressable testID="retry-persistence" onPress={() => { void store.retryPersistence(); }}><Text>重试保存</Text></Pressable>
      <Pressable testID="import-empty-backup" onPress={() => { void store.importBackup(serializeBackup(createEmptyData())); }}><Text>导入空白备份</Text></Pressable>
      <Pressable testID="capture-first" onPress={() => { void store.capture('第一条捕捉'); }}><Text>捕捉第一条</Text></Pressable>
      <Pressable testID="capture-second" onPress={() => { void store.capture('第二条捕捉'); }}><Text>捕捉第二条</Text></Pressable>
    </>
  );
}

describe('store hydration recovery failure', () => {
  it('does not overwrite invalid local data until the user explicitly starts an empty space', async () => {
    mockedStorage.getItem
      .mockResolvedValueOnce('{broken')
      .mockResolvedValueOnce(JSON.stringify({ version: 99 }));
    mockedStorage.setItem.mockResolvedValue();

    const screen = await render(<ReflowProvider><StoreProbe /></ReflowProvider>);

    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
    expect(screen.getByTestId('recovery-failure').props.children).toBe('true');
    expect(mockedStorage.setItem).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('start-empty'));

    await waitFor(() => expect(mockedStorage.setItem).toHaveBeenCalledWith(PERSISTENCE_KEY, expect.any(String)));
    await settlePersistence();
    expect(screen.getByTestId('recovery-failure').props.children).toBe('false');
    expect(screen.getByTestId('task-count').props.children).toBe(0);
    expect(mockedStorage.setItem).not.toHaveBeenCalledWith(RECOVERY_KEY, expect.any(String));
  });

  it('loads seed data only after the user explicitly chooses the demo action', async () => {
    mockedStorage.getItem.mockReset();
    mockedStorage.setItem.mockReset();
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue();

    const screen = await render(<ReflowProvider><StoreProbe /></ReflowProvider>);

    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
    expect(screen.getByTestId('task-count').props.children).toBe(0);

    await act(async () => {
      await probedStore?.resetDemo();
    });

    await waitFor(() => expect(screen.getByTestId('task-count').props.children).toBeGreaterThan(0));
    await settlePersistence();
    expect(mockedStorage.setItem).toHaveBeenCalledWith(RECOVERY_KEY, JSON.stringify(createEmptyData()));
    expect(mockedStorage.setItem).toHaveBeenCalledWith(PERSISTENCE_KEY, expect.stringContaining('task-reflow-demo'));
  });
});

const seedAt = new Date('2026-07-17T12:00:00+08:00');
const seedProgressLogCount = createSeedData(seedAt).progressLogs.length;

async function renderHydratedSeed() {
  const seed = createSeedData(seedAt);
  mockedStorage.getItem.mockReset();
  mockedStorage.setItem.mockReset();
  mockedStorage.getItem
    .mockResolvedValueOnce(JSON.stringify(seed))
    .mockResolvedValueOnce(null);
  mockedStorage.setItem.mockResolvedValue();

  const screen = await render(<ReflowProvider><StoreProbe /></ReflowProvider>);
  await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
  await waitFor(() => expect(mockedStorage.setItem).toHaveBeenCalledWith(PERSISTENCE_KEY, JSON.stringify(seed)));
  mockedStorage.setItem.mockClear();
  return { screen, seed };
}

function latestPrimarySnapshot(): string {
  const write = mockedStorage.setItem.mock.calls.filter(([key]) => key === PERSISTENCE_KEY).at(-1);
  if (!write) throw new Error('expected a primary persistence write');
  return write[1];
}

async function press(screen: Awaited<ReturnType<typeof render>>, testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

function pendingWrite() {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((complete) => { resolve = complete; }),
    resolve: () => resolve(),
  };
}

describe('store persistence write failures', () => {
  it('keeps persistence failure clear after a successful automatic write', async () => {
    const { screen } = await renderHydratedSeed();

    await press(screen, 'record-progress-first');

    await waitFor(() => expect(mockedStorage.setItem).toHaveBeenCalledWith(PERSISTENCE_KEY, expect.any(String)));
    expect(screen.getByTestId('persistence-failure').props.children).toBe('false');
    expect(JSON.parse(latestPrimarySnapshot()).progressLogs).toHaveLength(seedProgressLogCount + 1);
  });

  it('keeps changed domain data in memory and marks a failed automatic write', async () => {
    const { screen } = await renderHydratedSeed();
    mockedStorage.setItem.mockRejectedValue(new Error('storage unavailable'));

    await press(screen, 'record-progress-first');

    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('true'));
    expect(screen.getByTestId('progress-log-count').props.children).toBe(seedProgressLogCount + 1);
  });

  it('retries the current snapshot without replaying domain actions and keeps failure visible if retry fails', async () => {
    const { screen, seed } = await renderHydratedSeed();
    mockedStorage.setItem.mockRejectedValue(new Error('storage unavailable'));
    await press(screen, 'record-progress-first');
    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('true'));

    mockedStorage.setItem.mockClear();
    await press(screen, 'retry-persistence');
    await waitFor(() => expect(mockedStorage.setItem).toHaveBeenCalled());
    expect(screen.getByTestId('persistence-failure').props.children).toBe('true');

    mockedStorage.setItem.mockReset();
    mockedStorage.setItem.mockResolvedValue();
    await press(screen, 'retry-persistence');
    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('false'));
    expect(screen.getByTestId('progress-log-count').props.children).toBe(seedProgressLogCount + 1);
    expect(screen.getByTestId('decision-count').props.children).toBe(seed.decisions.length);
    expect(screen.getByTestId('plan-event-count').props.children).toBe(seed.taskPlanEvents.length);
  });

  it('clears a prior persistence failure after a successful backup import', async () => {
    const { screen } = await renderHydratedSeed();
    mockedStorage.setItem.mockRejectedValue(new Error('storage unavailable'));
    await press(screen, 'record-progress-first');
    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('true'));

    mockedStorage.setItem.mockReset();
    mockedStorage.setItem.mockResolvedValue();
    await press(screen, 'import-empty-backup');

    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('false'));
    expect(screen.getByTestId('task-count').props.children).toBe(0);
  });

  it('retries the latest in-memory snapshot after another automatic write also fails', async () => {
    const { screen } = await renderHydratedSeed();
    mockedStorage.setItem.mockRejectedValue(new Error('storage unavailable'));
    await press(screen, 'record-progress-first');
    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('true'));

    mockedStorage.setItem.mockClear();
    await press(screen, 'record-progress-second');
    await waitFor(() => expect(mockedStorage.setItem).toHaveBeenCalled());

    mockedStorage.setItem.mockReset();
    mockedStorage.setItem.mockResolvedValue();
    await press(screen, 'retry-persistence');
    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('false'));
    expect(JSON.parse(latestPrimarySnapshot()).progressLogs.map((log: { text: string }) => log.text)).toEqual(expect.arrayContaining(['第一次保存', '第二次保存']));
  });

  it('does not clear a current failure when an older queued snapshot later succeeds', async () => {
    const { screen } = await renderHydratedSeed();
    mockedStorage.setItem.mockRejectedValue(new Error('storage unavailable'));
    await press(screen, 'record-progress-first');
    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('true'));

    const retryPrimary = pendingWrite();
    const latestPrimary = pendingWrite();
    mockedStorage.setItem.mockReset();
    mockedStorage.setItem
      .mockResolvedValueOnce()
      .mockImplementationOnce(() => retryPrimary.promise)
      .mockResolvedValueOnce()
      .mockImplementationOnce(() => latestPrimary.promise);
    await press(screen, 'retry-persistence');
    await waitFor(() => expect(mockedStorage.setItem).toHaveBeenCalledWith(PERSISTENCE_KEY, expect.any(String)));

    await press(screen, 'record-progress-second');
    retryPrimary.resolve();
    await waitFor(() => expect(mockedStorage.setItem.mock.calls.filter(([key]) => key === RECOVERY_KEY)).toHaveLength(2));
    expect(screen.getByTestId('persistence-failure').props.children).toBe('true');

    latestPrimary.resolve();
    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('false'));
  });

  it('clears a prior failure when a later automatic write saves the latest snapshot', async () => {
    const { screen } = await renderHydratedSeed();
    mockedStorage.setItem.mockRejectedValue(new Error('storage unavailable'));
    await press(screen, 'record-progress-first');
    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('true'));

    mockedStorage.setItem.mockReset();
    mockedStorage.setItem.mockResolvedValue();
    await press(screen, 'record-progress-second');

    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('false'));
    expect(JSON.parse(latestPrimarySnapshot()).progressLogs).toHaveLength(seedProgressLogCount + 2);
  });

  it('keeps the prior successful snapshot for recovery when primary write fails after recovery succeeds', async () => {
    const { screen, seed } = await renderHydratedSeed();
    mockedStorage.setItem
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('primary unavailable'));
    await press(screen, 'record-progress-first');

    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('true'));
    expect(mockedStorage.setItem.mock.calls).toEqual([
      [RECOVERY_KEY, JSON.stringify(seed)],
      [PERSISTENCE_KEY, expect.any(String)],
    ]);

    mockedStorage.setItem.mockReset();
    mockedStorage.setItem.mockResolvedValue();
    await press(screen, 'record-progress-second');
    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('false'));
    expect(mockedStorage.setItem.mock.calls[0]).toEqual([RECOVERY_KEY, JSON.stringify(seed)]);
  });
});

function proposalFor(request: ProposalRequest): ProposalResult {
  return {
    status: 'success',
    proposals: [{
      id: `proposal-${request.capture.id}`,
      captureId: request.capture.id,
      outcome: 'task',
      title: request.capture.rawText,
      category: 'unknown',
      estimatedMinutes: 25,
      confidence: 0.6,
      reason: '测试',
      kind: 'create',
      status: 'pending',
      nextAction: '确认下一步',
    }],
  };
}

describe('durable Capture queue', () => {
  it('queues each Capture only after its own durable write succeeds', async () => {
    mockedStorage.getItem.mockReset();
    mockedStorage.setItem.mockReset();
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue();
    const propose = jest.fn<ProposalService['propose']>(async (request) => proposalFor(request));
    const service: ProposalService = { kind: 'mock', propose };
    const screen = await render(<ReflowProvider proposalService={service}><StoreProbe /></ReflowProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
    await settlePersistence();

    const firstPrimary = pendingWrite();
    const secondPrimary = pendingWrite();
    mockedStorage.setItem.mockReset();
    mockedStorage.setItem.mockImplementation((key, raw) => {
      if (key !== PERSISTENCE_KEY) return Promise.resolve();
      const texts = JSON.parse(raw).captures.map((capture: { rawText: string }) => capture.rawText);
      if (texts.includes('第二条捕捉')) return secondPrimary.promise;
      if (texts.includes('第一条捕捉')) return firstPrimary.promise;
      return Promise.resolve();
    });

    let firstCapture!: ReturnType<ReflowStoreValue['capture']>;
    let secondCapture!: ReturnType<ReflowStoreValue['capture']>;
    await act(async () => {
      firstCapture = probedStore!.capture('第一条捕捉');
      await Promise.resolve();
      secondCapture = probedStore!.capture('第二条捕捉');
      await Promise.resolve();
    });

    expect(screen.getByTestId('capture-states').props.children).toBe('captured,captured');
    expect(propose).not.toHaveBeenCalled();

    firstPrimary.resolve();
    await act(async () => { await firstCapture; });
    await waitFor(() => expect(propose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedStorage.setItem.mock.calls.some(([key, raw]) => key === PERSISTENCE_KEY && JSON.parse(raw).captures.some((capture: { rawText: string }) => capture.rawText === '第二条捕捉'))).toBe(true));
    await act(async () => { await Promise.resolve(); });
    expect(propose.mock.calls.map(([request]) => request.capture.rawText)).toEqual(['第一条捕捉']);

    secondPrimary.resolve();
    await act(async () => { await secondCapture; });
    await waitFor(() => expect(propose).toHaveBeenCalledTimes(2));
    expect(propose.mock.calls.map(([request]) => request.capture.rawText)).toEqual(['第一条捕捉', '第二条捕捉']);
  });

  it('keeps a Capture visible after its first persistence failure and queues it after retry', async () => {
    mockedStorage.getItem.mockReset();
    mockedStorage.setItem.mockReset();
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue();
    const propose = jest.fn<ProposalService['propose']>(async (request) => proposalFor(request));
    const service: ProposalService = { kind: 'mock', propose };
    const screen = await render(<ReflowProvider proposalService={service}><StoreProbe /></ReflowProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
    await settlePersistence();

    mockedStorage.setItem.mockReset();
    mockedStorage.setItem.mockRejectedValue(new Error('storage unavailable'));
    let result: Awaited<ReturnType<ReflowStoreValue['capture']>> | undefined;
    await act(async () => {
      result = await probedStore?.capture('第一条捕捉');
    });

    expect(result?.status).toBe('failure');
    expect(screen.getByTestId('capture-count').props.children).toBe(1);
    expect(screen.getByTestId('capture-states').props.children).toBe('captured');
    expect(propose).not.toHaveBeenCalled();

    mockedStorage.setItem.mockReset();
    mockedStorage.setItem.mockResolvedValue();
    await press(screen, 'retry-persistence');

    await waitFor(() => expect(propose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('capture-states').props.children).toBe('proposed'));
    expect(screen.getByTestId('persistence-failure').props.children).toBe('false');
  });

  it('persists the raw Capture before calling ProposalService', async () => {
    mockedStorage.getItem.mockReset();
    mockedStorage.setItem.mockReset();
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue();
    const propose = jest.fn(async (request: ProposalRequest) => {
      const snapshots = mockedStorage.setItem.mock.calls
        .filter(([key]) => key === PERSISTENCE_KEY)
        .map(([, raw]) => JSON.parse(raw));
      expect(snapshots.some((data) => data.captures.some((capture: { rawText: string }) => capture.rawText === '第一条捕捉'))).toBe(true);
      return proposalFor(request);
    });
    const service: ProposalService = { kind: 'mock', propose };
    const screen = await render(<ReflowProvider proposalService={service}><StoreProbe /></ReflowProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));

    await press(screen, 'capture-first');

    await waitFor(() => expect(propose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('capture-states').props.children).toContain('proposed'));
  });

  it('accepts rapid captures while Proposal generation remains serial', async () => {
    mockedStorage.getItem.mockReset();
    mockedStorage.setItem.mockReset();
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue();
    let active = 0;
    let maxActive = 0;
    const propose = jest.fn<ProposalService['propose']>(async (request) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return proposalFor(request);
    });
    const service: ProposalService = { kind: 'cloud', propose };
    const screen = await render(<ReflowProvider proposalService={service}><StoreProbe /></ReflowProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));

    await act(async () => {
      await Promise.all([
        probedStore?.capture('第一条捕捉'),
        probedStore?.capture('第二条捕捉'),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    await waitFor(() => expect(screen.getByTestId('capture-count').props.children).toBe(2));
    await waitFor(() => expect(screen.getByTestId('capture-states').props.children).toBe('proposed,proposed'));
    expect(propose).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

});
