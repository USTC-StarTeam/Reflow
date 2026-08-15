import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PERSISTENCE_KEY, RECOVERY_KEY } from '../persistence';
import { ReflowProvider, useReflowStore } from '../store';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const mockedStorage = jest.mocked(AsyncStorage);

function StoreProbe() {
  const store = useReflowStore();
  return (
    <>
      <Text testID="hydrated">{String(store.hydrated)}</Text>
      <Text testID="recovery-failure">{String(store.recoveryFailure)}</Text>
      <Text testID="task-count">{store.data.tasks.length}</Text>
      <Pressable testID="start-empty" onPress={store.startEmpty}><Text>开始空白空间</Text></Pressable>
      <Pressable testID="load-demo" onPress={store.resetDemo}><Text>加载演示数据</Text></Pressable>
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
  });
});
