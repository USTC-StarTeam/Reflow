import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { createSeedData } from '@/core/demo-data';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import { AppShell } from '../app-shell';

jest.mock('expo-router', () => ({
  usePathname: () => '/inbox',
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@/core/store', () => ({
  useReflowStore: jest.fn(),
}));

const mockedUseReflowStore = jest.mocked(useReflowStore);

function storeValue(hydrated: boolean): ReflowStoreValue {
  return {
    data: createSeedData(new Date('2026-07-17T12:00:00+08:00')),
    hydrated,
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

describe('AppShell hydration boundary', () => {
  it('does not mount interactive domain content before local data is hydrated', async () => {
    mockedUseReflowStore.mockReturnValue(storeValue(false));

    const screen = await render(
      <AppShell>
        <Text testID="domain-content">应用内容</Text>
      </AppShell>,
    );

    expect(screen.getByTestId('app-hydrating')).toBeTruthy();
    expect(screen.queryByTestId('domain-content')).toBeNull();
    expect(screen.queryByTestId('global-capture')).toBeNull();
  });
});
