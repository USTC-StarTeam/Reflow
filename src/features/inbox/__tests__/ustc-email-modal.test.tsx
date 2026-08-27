import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import { ShellContext } from '@/features/shared/shell-context';
import { emailCaptureText, UstcEmailModal } from '../ustc-email-modal';
import type { UstcEmailClient, UstcEmailDetail } from '../ustc-email-client';

jest.mock('@/core/store', () => ({ useReflowStore: jest.fn() }));

const mockedUseReflowStore = jest.mocked(useReflowStore);
const detail: UstcEmailDetail = {
  id: '777:12',
  uid: 12,
  messageId: '<message-12@ustc.edu.cn>',
  subject: '下周组会安排',
  from: { name: '张老师', address: 'teacher@ustc.edu.cn' },
  receivedAt: '2026-08-27T06:32:00.000Z',
  seen: false,
  body: '请准备阶段汇报，并在周五前提交材料。',
};

async function renderModal({ capture = jest.fn(async () => ({ status: 'success' as const })) } = {}) {
  const client: UstcEmailClient = {
    listRecent: jest.fn(async () => [{ ...detail }]),
    getDetail: jest.fn(async () => detail),
  };
  mockedUseReflowStore.mockReturnValue({ capture } as unknown as ReflowStoreValue);
  const screen = await render(
    <ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}>
      <UstcEmailModal visible onClose={jest.fn()} client={client} />
    </ShellContext.Provider>,
  );
  return { screen, client, capture };
}

describe('USTC email import flow', () => {
  it('bounds imported content to the existing cloud Proposal contract', () => {
    expect(emailCaptureText({ ...detail, body: '正文'.repeat(1_000) }).length).toBeLessThanOrEqual(1_000);
  });

  it('reads metadata first and makes no Domain write when the user only views email', async () => {
    const { screen, client, capture } = await renderModal();

    await waitFor(() => expect(screen.getByText('下周组会安排')).toBeTruthy());
    expect(client.listRecent).toHaveBeenCalledTimes(1);
    expect(client.getDetail).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(screen.getByTestId('ustc-email-message-12')); });
    await waitFor(() => expect(screen.getByText(/请准备阶段汇报/)).toBeTruthy());
    expect(client.getDetail).toHaveBeenCalledWith(12);
    expect(capture).not.toHaveBeenCalled();
  });

  it('creates an email Capture only after the explicit add action', async () => {
    const { screen, capture } = await renderModal();
    await waitFor(() => expect(screen.getByTestId('ustc-email-message-12')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByTestId('ustc-email-message-12')); });
    await waitFor(() => expect(screen.getByTestId('ustc-email-import')).toBeTruthy());

    await act(async () => { fireEvent.press(screen.getByTestId('ustc-email-import')); });

    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    expect(capture).toHaveBeenCalledWith(expect.stringContaining('邮件标题：下周组会安排'), 'email');
    expect(capture).toHaveBeenCalledWith(expect.stringContaining('请准备阶段汇报'), 'email');
  });
});
