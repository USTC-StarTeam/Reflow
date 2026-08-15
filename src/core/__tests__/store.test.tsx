import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createEmptyData, createSeedData } from '../demo-data';
import { PERSISTENCE_KEY, RECOVERY_KEY, serializeBackup } from '../persistence';
import { ReflowProvider, useReflowStore } from '../store';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const mockedStorage = jest.mocked(AsyncStorage);

async function settlePersistence() {
  await act(async () => {
    await Promise.resolve();
  });
}

function StoreProbe() {
  const store = useReflowStore();
  return (
    <>
      <Text testID="hydrated">{String(store.hydrated)}</Text>
      <Text testID="recovery-failure">{String(store.recoveryFailure)}</Text>
      <Text testID="persistence-failure">{String(store.persistenceFailure)}</Text>
      <Text testID="task-count">{store.data.tasks.length}</Text>
      <Text testID="progress-log-count">{store.data.progressLogs.length}</Text>
      <Text testID="decision-count">{store.data.decisions.length}</Text>
      <Text testID="plan-event-count">{store.data.taskPlanEvents.length}</Text>
      <Pressable testID="start-empty" onPress={store.startEmpty}><Text>开始空白空间</Text></Pressable>
      <Pressable testID="load-demo" onPress={store.resetDemo}><Text>加载演示数据</Text></Pressable>
      <Pressable testID="record-progress-first" onPress={() => store.recordProgress('task-reflow-demo', '第一次保存')}><Text>记录第一次进度</Text></Pressable>
      <Pressable testID="record-progress-second" onPress={() => store.recordProgress('task-reflow-demo', '第二次保存')}><Text>记录第二次进度</Text></Pressable>
      <Pressable testID="retry-persistence" onPress={() => { void store.retryPersistence(); }}><Text>重试保存</Text></Pressable>
      <Pressable testID="import-empty-backup" onPress={() => { void store.importBackup(serializeBackup(createEmptyData())); }}><Text>导入空白备份</Text></Pressable>
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

    fireEvent.press(screen.getByTestId('load-demo'));

    await waitFor(() => expect(screen.getByTestId('task-count').props.children).toBeGreaterThan(0));
    await settlePersistence();
  });
});

const seedAt = new Date('2026-07-17T12:00:00+08:00');

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
    expect(JSON.parse(latestPrimarySnapshot()).progressLogs).toHaveLength(4);
  });

  it('keeps changed domain data in memory and marks a failed automatic write', async () => {
    const { screen } = await renderHydratedSeed();
    mockedStorage.setItem.mockRejectedValue(new Error('storage unavailable'));

    await press(screen, 'record-progress-first');

    await waitFor(() => expect(screen.getByTestId('persistence-failure').props.children).toBe('true'));
    expect(screen.getByTestId('progress-log-count').props.children).toBe(4);
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
    expect(screen.getByTestId('progress-log-count').props.children).toBe(4);
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
    expect(JSON.parse(latestPrimarySnapshot()).progressLogs).toHaveLength(5);
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
