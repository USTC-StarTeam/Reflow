import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dateKey, formatShortDate } from '@/core/date-utils';
import { selectTodaySections } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { QuickComposer } from '../shared/quick-composer';
import { colors, spacing, typography } from '../shared/theme';
import { Chip, Page, PageHeader, SectionLabel } from '../shared/ui';
import { TodayTaskRow } from './today-task-row';

function todaySuggestion(scheduledCount: number, dateOnlyCount: number, completedCount: number): string {
  if (scheduledCount > 0) return `今天有 ${scheduledCount} 个明确时间事项，建议先处理最早开始的一项。`;
  if (dateOnlyCount > 0) return `今天有 ${dateOnlyCount} 件要做，先从一件需要完整注意力的任务开始。`;
  if (completedCount > 0) return '今天的事项已处理完，可以留一点时间整理收尾。';
  return '今天还没有安排事项，可以先记下一件要推进的事。';
}

function TodayEmptyRow({ children }: { children: string }) {
  return <View style={styles.emptyRow}><Text style={styles.emptyText}>{children}</Text></View>;
}

export function TodayScreen() {
  const store = useReflowStore();
  const today = useMemo(() => dateKey(new Date()), []);
  const sections = selectTodaySections(store.data, today);
  const suggestion = todaySuggestion(sections.scheduled.length, sections.unscheduled.length, sections.completed.length);

  return (
    <>
      <Page testID="screen-today">
        <PageHeader title="今天" subtitle="先决定今天做什么，再安排具体时间" right={<Chip label={formatShortDate(today)} tone="primary" size="header" />} />
        <QuickComposer />
        <View testID="today-suggestion" style={styles.suggestion}><Text style={styles.suggestionLabel}>今日建议</Text><Text style={styles.suggestionText}>{suggestion}</Text></View>

        <SectionLabel title="时间安排" meta={`${sections.scheduled.length} 项`} />
        {sections.scheduled.length ? sections.scheduled.map((task) => <TodayTaskRow key={task.id} task={task} variant="scheduled" />) : <TodayEmptyRow>今天还没有明确时间事项。</TodayEmptyRow>}

        <SectionLabel title="今天要做" meta={`${sections.unscheduled.length} 项`} />
        {sections.unscheduled.length ? sections.unscheduled.map((task) => <TodayTaskRow key={task.id} task={task} variant="dateOnly" />) : <TodayEmptyRow>今天没有其他要做的事项。</TodayEmptyRow>}

        <SectionLabel title="已完成" meta={`${sections.completed.length} 项`} />
        {sections.completed.length ? sections.completed.map((task) => <TodayTaskRow key={task.id} task={task} variant="completed" />) : <TodayEmptyRow>今天还没有完成记录。</TodayEmptyRow>}
      </Page>
    </>
  );
}

const styles = StyleSheet.create({
  suggestion: { gap: spacing.xxs, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  suggestionLabel: { color: colors.orange, ...typography.label },
  suggestionText: { color: colors.muted, ...typography.meta },
  emptyRow: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md },
  emptyText: { color: colors.subtle, ...typography.meta },
});
