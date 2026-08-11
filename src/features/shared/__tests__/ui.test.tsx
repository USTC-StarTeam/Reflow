import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import type { TaskItem } from '@/core/types';
import { ShellContext } from '../shell-context';
import { TaskRow } from '../task-row';
import { ActionButton, Card, ModalSurface, PageHeader, SectionLabel } from '../ui';

const task: TaskItem = {
  id: 'task-ui',
  title: '整理产品方案',
  status: 'notStarted',
  category: 'work',
  bucket: 'today',
  estimatedMinutes: 45,
  nextAction: '列出三个关键结论',
  sourceSummary: '网页输入',
  sortIndex: 0,
  createdAt: '2026-08-11T09:00:00+08:00',
  plannedDate: '2026-08-11',
};

describe('shared UI foundation', () => {
  it('renders the V18-aligned header structure without changing its settings action', async () => {
    const openSettings = jest.fn();
    const screen = await render(
      <ShellContext.Provider value={{ openCapture: jest.fn(), openSettings }}>
        <PageHeader title="今天" subtitle="轻量捕捉与今日重点" />
      </ShellContext.Provider>,
    );

    expect(screen.getByText('P')).toBeTruthy();
    expect(screen.getByText('今天')).toBeTruthy();
    expect(screen.getByText('轻量捕捉与今日重点')).toBeTruthy();
    expect(screen.getByText('AI')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('打开设置'));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps semantic card accents visual-only', async () => {
    const screen = await render(<Card testID="ai-card" accent="ai"><Text>建议</Text></Card>);
    const style = StyleSheet.flatten(screen.getByTestId('ai-card').props.style);

    expect(style.borderLeftWidth).toBe(4);
    expect(style.borderLeftColor).toBe('#F97316');
    expect(screen.getByText('建议')).toBeTruthy();
  });

  it('renders compact section labels and honors disabled buttons', async () => {
    const onPress = jest.fn();
    const screen = await render(<><SectionLabel title="今日重点" meta="2 项" /><ActionButton label="保存" disabled onPress={onPress} /></>);

    expect(screen.getByText('今日重点')).toBeTruthy();
    expect(screen.getByText('2 项')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('保存'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps TaskRow behavior while using the compact visual foundation', async () => {
    const onStart = jest.fn();
    const screen = await render(<TaskRow task={task} minutes={15} onStart={onStart} onPause={jest.fn()} />);

    expect(screen.getByText('整理产品方案')).toBeTruthy();
    expect(screen.getByText(/15\/45 分钟/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('开始 整理产品方案'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('provides a minimal reusable modal surface and close affordance', async () => {
    const onClose = jest.fn();
    const screen = await render(<ModalSurface visible title="快速捕捉" subtitle="先记下来" onClose={onClose} testID="modal-surface"><Text>正文</Text></ModalSurface>);

    expect(screen.getByTestId('modal-surface')).toBeTruthy();
    expect(screen.getByText('正文')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('关闭'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
