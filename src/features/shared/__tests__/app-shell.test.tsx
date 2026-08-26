import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';

import { createSeedData } from '@/core/demo-data';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import { AppShell } from '../app-shell';
import { PageHeader } from '../ui';

jest.mock('expo-router', () => ({
  usePathname: () => '/inbox',
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@/core/store', () => ({
  useReflowStore: jest.fn(),
}));

const mockedUseReflowStore = jest.mocked(useReflowStore);

function storeValue(hydrated: boolean, recoveryFailure = false, persistenceFailure = false): ReflowStoreValue {
  return {
    data: createSeedData(new Date('2026-07-17T12:00:00+08:00')),
    hydrated,
    recoveryFailure,
    persistenceFailure,
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
    correctTimeEntry: jest.fn(),
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
    resetDemo: jest.fn(async () => ({ status: 'success' as const })),
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

  it('mounts interactive domain content after local data is hydrated', async () => {
    mockedUseReflowStore.mockReturnValue(storeValue(true));

    const screen = await render(
      <AppShell>
        <Text testID="domain-content">应用内容</Text>
      </AppShell>,
    );

    expect(screen.queryByTestId('app-hydrating')).toBeNull();
    expect(screen.getByTestId('domain-content')).toBeTruthy();
    expect(screen.getByTestId('global-capture')).toBeTruthy();
  });

  it('blocks domain content after recovery failure until the user imports a backup or starts empty', async () => {
    const value = storeValue(true, true, true);
    mockedUseReflowStore.mockReturnValue(value);

    const screen = await render(
      <AppShell>
        <Text testID="domain-content">应用内容</Text>
      </AppShell>,
    );

    expect(screen.getByTestId('recovery-failure')).toBeTruthy();
    expect(screen.queryByTestId('persistence-failure')).toBeNull();
    expect(screen.queryByTestId('domain-content')).toBeNull();
    fireEvent.press(screen.getByTestId('start-empty-personal-space'));
    expect(value.startEmpty).toHaveBeenCalled();
  });

  it('shows persistence failure actions without blocking normal app content', async () => {
    const value = storeValue(true, false, true);
    mockedUseReflowStore.mockReturnValue(value);

    const screen = await render(
      <AppShell>
        <Text testID="domain-content">应用内容</Text>
      </AppShell>,
    );

    expect(screen.getByTestId('persistence-failure')).toBeTruthy();
    expect(screen.getByText('本地保存失败')).toBeTruthy();
    expect(screen.getByTestId('domain-content')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('retry-persistence'));
    });
    expect(value.retryPersistence).toHaveBeenCalled();

    const originalPlatformOS = Platform.OS;
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const link = { click: jest.fn() };
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: jest.fn(() => link) } });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:backup') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });

    try {
      await act(async () => {
        fireEvent.press(screen.getByTestId('export-persistence-backup'));
      });
      expect(value.exportBackup).toHaveBeenCalled();
      expect(link.click).toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
      if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
      else Reflect.deleteProperty(globalThis, 'document');
      if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
      else Reflect.deleteProperty(URL, 'createObjectURL');
      if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
      else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('preserves the five routes, active state, and inbox badge semantics', async () => {
    mockedUseReflowStore.mockReturnValue(storeValue(true));

    const screen = await render(<AppShell><Text>应用内容</Text></AppShell>);

    for (const label of ['今天', '收件箱', '进行中', '日历', '回顾']) {
      expect(screen.getByTestId(`nav-${label}`)).toBeTruthy();
    }
    expect(screen.getByTestId('nav-收件箱').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('nav-inbox-badge')).toBeTruthy();
  });

  it('keeps the Inbox badge visible when only a failed Capture needs attention', async () => {
    const value = storeValue(true);
    value.data = {
      ...value.data,
      proposals: value.data.proposals.map((proposal) => ({ ...proposal, status: 'accepted' })),
      captures: value.data.captures.map((capture, index) => index === 0 ? {
        ...capture,
        pipelineState: 'proposalFailed',
        failure: { code: 'proposal_unavailable', message: '暂时不可用', retryable: true },
      } : capture),
    };
    mockedUseReflowStore.mockReturnValue(value);
    const screen = await render(<AppShell><PageHeader title="测试" subtitle="设置入口" /></AppShell>);
    expect(screen.getByTestId('nav-inbox-badge')).toHaveTextContent('1');
  });

  it('requires confirmation before replacing personal data with the demo', async () => {
    const value = storeValue(true);
    mockedUseReflowStore.mockReturnValue(value);
    const screen = await render(<AppShell><PageHeader title="测试" subtitle="设置入口" /></AppShell>);

    await fireEvent.press(screen.getByLabelText('打开设置'));
    await fireEvent.press(screen.getByTestId('reset-demo'));
    expect(screen.getByTestId('confirm-demo-reset')).toHaveTextContent(/替换前的个人数据会保存为本地恢复副本/);
    expect(value.resetDemo).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('cancel-demo-reset'));
    expect(screen.getByTestId('settings-modal-surface')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('reset-demo'));
    await fireEvent.press(screen.getByTestId('confirm-demo-reset-action'));
    expect(value.resetDemo).toHaveBeenCalledTimes(1);
  });
});
