import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dateKey } from '@/core/date-utils';
import { selectTodaySections } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { QuickComposer } from '../shared/quick-composer';
import { colors, spacing, typography } from '../shared/theme';
import { ActionButton, Card, Page, PageHeader, SectionLabel } from '../shared/ui';
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
  const router = useRouter();
  const store = useReflowStore();
  const today = useMemo(() => dateKey(new Date()), []);
  const sections = selectTodaySections(store.data, today);
  const suggestion = todaySuggestion(sections.scheduled.length, sections.unscheduled.length, sections.completed.length);
  const suggestedTaskIds = [...sections.scheduled, ...sections.unscheduled].map((task) => task.id);

  return (
    <>
      <Page testID="screen-today">
        <PageHeader title="今天" subtitle="轻量捕捉与今日重点" />
        <QuickComposer />
        <View style={styles.sectionGroup}>
          <SectionLabel title="今日建议" />
          <Card testID="today-suggestion" accent="ai" style={styles.suggestionCard}>
            <View style={styles.suggestionCopy}><Text style={styles.suggestionAI}>AI:</Text><Text style={styles.suggestionText}>{suggestion}</Text></View>
            <View style={styles.suggestionActions}>
              <ActionButton testID="accept-today-order" label="接受排序" variant="green" disabled={!suggestedTaskIds.length} onPress={() => store.reorderTasks(suggestedTaskIds)} />
              <ActionButton testID="manual-adjust-today" label="手动调整" onPress={() => router.replace('/calendar')} />
            </View>
          </Card>
        </View>

        <View style={styles.sectionGroup}>
          <SectionLabel title="时间安排" meta={`${sections.scheduled.length} 项`} />
          {sections.scheduled.length ? sections.scheduled.map((task) => <TodayTaskRow key={task.id} task={task} variant="scheduled" onComplete={() => store.completeTask(task.id)} />) : <TodayEmptyRow>今天还没有明确时间事项。</TodayEmptyRow>}
        </View>

        <View style={styles.sectionGroup}>
          <SectionLabel title="今天要做" meta={`${sections.unscheduled.length} 项`} />
          {sections.unscheduled.length ? sections.unscheduled.map((task) => <TodayTaskRow key={task.id} task={task} variant="dateOnly" onComplete={() => store.completeTask(task.id)} />) : <TodayEmptyRow>今天没有其他要做的事项。</TodayEmptyRow>}
        </View>

        <View style={styles.sectionGroup}>
          <SectionLabel title="已完成" meta={`${sections.completed.length} 项`} />
          {sections.completed.length ? sections.completed.map((task) => <TodayTaskRow key={task.id} task={task} variant="completed" />) : <TodayEmptyRow>今天还没有完成记录。</TodayEmptyRow>}
        </View>
      </Page>
    </>
  );
}

const styles = StyleSheet.create({
  sectionGroup: { gap: spacing.md },
  suggestionCard: { padding: spacing.xl, gap: spacing.lg },
  suggestionCopy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  suggestionAI: { color: colors.orange, flexShrink: 0, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  suggestionText: { color: colors.muted, flex: 1, fontSize: 13, lineHeight: 21, fontWeight: '500' },
  suggestionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  emptyRow: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md },
  emptyText: { color: colors.subtle, ...typography.meta },
});
