import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dateKey } from '@/core/date-utils';
import { isTaskDelayed, selectCurrentExecutionSession, selectCurrentTask, selectTodaySections } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { QuickComposer } from '../shared/quick-composer';
import { colors, spacing, typography } from '../shared/theme';
import { ActionButton, Card, Page, PageHeader, SectionLabel } from '../shared/ui';
import { TodayTaskRow } from './today-task-row';
import { TaskDetailModal } from './task-detail-modal';

function todaySuggestion(activeTitle: string | undefined, delayedCount: number, scheduledCount: number, dateOnlyCount: number, completedCount: number): string {
  if (activeTitle) return `当前正在进行“${activeTitle}”，继续推进即可。`;
  if (delayedCount > 0) return delayedCount === 1
    ? '今天有 1 项计划开始时间已过，建议确认是否继续处理。'
    : `今天有 ${delayedCount} 项计划开始时间已过，建议先重新确认优先级。`;
  if (scheduledCount > 0) return `今天有 ${scheduledCount} 个明确时间事项，建议先处理最早开始的一项。`;
  if (dateOnlyCount > 0) return `今天有 ${dateOnlyCount} 件要做，先从一件需要完整注意力的任务开始。`;
  if (completedCount > 0) return '今天的事项已处理完，可以留一点时间整理收尾。';
  return '今天还没有安排事项，可以先记下一件要推进的事。';
}

function TodayEmptyRow({ children }: { children: string }) {
  return <View style={styles.emptyRow}><Text style={styles.emptyText}>{children}</Text></View>;
}

const unavailableSuggestionAction = () => undefined;

export function TodayScreen() {
  const store = useReflowStore();
  const now = new Date();
  const today = useMemo(() => dateKey(new Date()), []);
  const sections = selectTodaySections(store.data, today);
  const activeTask = selectCurrentTask(store.data);
  const delayedCount = sections.scheduled.filter((task) => isTaskDelayed(task, now)).length;
  const suggestion = todaySuggestion(activeTask?.title, delayedCount, sections.scheduled.length, sections.unscheduled.length, sections.completed.length);
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const selectedTask = selectedTaskId ? store.data.tasks.find((task) => task.id === selectedTaskId && !task.deletedAt && task.status !== 'completed') : undefined;

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
              <ActionButton testID="accept-today-order" label="接受排序" variant="green" disabled onPress={unavailableSuggestionAction} />
              <ActionButton testID="manual-adjust-today" label="手动调整" disabled onPress={unavailableSuggestionAction} />
            </View>
          </Card>
        </View>

        <View style={styles.sectionGroup}>
          <SectionLabel title="时间安排" meta={`${sections.scheduled.length} 项`} />
          {sections.scheduled.length ? sections.scheduled.map((task) => <TodayTaskRow key={task.id} task={task} variant="scheduled" delayed={isTaskDelayed(task, now)} execution={task.status === 'inProgress' ? selectCurrentExecutionSession(store.data, task.id) : undefined} onOpen={() => setSelectedTaskId(task.id)} onComplete={() => store.completeTask(task.id)} />) : <TodayEmptyRow>今天还没有明确时间事项。</TodayEmptyRow>}
        </View>

        <View style={styles.sectionGroup}>
          <SectionLabel title="今天要做" meta={`${sections.unscheduled.length} 项`} />
          {sections.unscheduled.length ? sections.unscheduled.map((task) => <TodayTaskRow key={task.id} task={task} variant="dateOnly" execution={task.status === 'inProgress' ? selectCurrentExecutionSession(store.data, task.id) : undefined} onOpen={() => setSelectedTaskId(task.id)} onComplete={() => store.completeTask(task.id)} />) : <TodayEmptyRow>今天没有其他要做的事项。</TodayEmptyRow>}
        </View>

        <View style={styles.sectionGroup}>
          <SectionLabel title="已完成" meta={`${sections.completed.length} 项`} />
          {sections.completed.length ? sections.completed.map((task) => <TodayTaskRow key={task.id} task={task} variant="completed" />) : <TodayEmptyRow>今天还没有完成记录。</TodayEmptyRow>}
        </View>
      </Page>
      {selectedTask ? <TaskDetailModal task={selectedTask} visible onClose={() => setSelectedTaskId(undefined)} /> : null}
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
