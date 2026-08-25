import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { createSeedData } from '@/core/demo-data';
import { useReflowStore, type ReflowStoreValue } from '@/core/store';
import { ShellContext } from '@/features/shared/shell-context';
import { ReviewScreen } from '../review-screen';

jest.mock('@/core/store', () => ({
  useReflowStore: jest.fn(),
}));

const mockedUseReflowStore = jest.mocked(useReflowStore);

describe('ReviewScreen presentation', () => {
  it('presents five lightweight review entries without the analytics dashboard', async () => {
    mockedUseReflowStore.mockReturnValue({ data: createSeedData() } as ReflowStoreValue);
    const screen = await render(
      <ShellContext.Provider value={{ openCapture: jest.fn(), openSettings: jest.fn() }}>
        <ReviewScreen />
      </ShellContext.Provider>,
    );

    expect(screen.getByText('复盘、知识和个人模式')).toBeTruthy();
    expect(screen.getAllByTestId(/^review-/).map((node) => node.props.testID)).toEqual([
      'review-nightly',
      'review-weekly',
      'review-monthly',
      'review-ai-observation',
      'review-knowledge',
    ]);
    expect(screen.getByText(/回顾今天：完成 \d+ 项，未完成 \d+ 项/)).toBeTruthy();
    expect(screen.getByText('AI：你低估了沟通跟进耗时')).toBeTruthy();

    for (const label of ['生成今晚复盘', '查看本周', '查看本月']) {
      expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    }
    expect(screen.getByLabelText('查看知识沉淀').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByLabelText('查看知识沉淀'));
    expect(screen.getByTestId('knowledge-list')).toHaveTextContent(/报价沟通检查单/);
    expect(screen.getByTestId('knowledge-list')).toHaveTextContent(/回复客户前先核对预算口径、付款周期和有效期。/);

    expect(screen.queryByText('确定性统计')).toBeNull();
    expect(screen.queryByText('计划完成率')).toBeNull();
    expect(screen.queryByText('今日计划结果')).toBeNull();
    expect(screen.queryByText('今日计划去向')).toBeNull();
    expect(screen.queryByText('移到明天')).toBeNull();
    expect(screen.queryByText('保存到稍后')).toBeNull();
    expect(screen.queryByText('时间流向')).toBeNull();
  });
});
