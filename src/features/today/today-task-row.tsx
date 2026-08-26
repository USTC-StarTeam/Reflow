import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDateTimeRange, formatTime } from '@/core/date-utils';
import type { CurrentExecutionSession } from '@/core/selectors';
import type { TaskItem } from '@/core/types';
import { border, colors, radius, spacing, typography } from '../shared/theme';

type TodayTaskRowProps = {
  task: TaskItem;
  variant: 'scheduled' | 'dateOnly';
  delayed?: boolean;
  execution?: CurrentExecutionSession;
  onComplete: () => void;
  onOpen: () => void;
} | {
  task: TaskItem;
  variant: 'completed';
  onRestore: () => void;
  onComplete?: never;
  onOpen?: never;
};

function estimateLabel(task: TaskItem): string | undefined {
  return task.estimatedMinutes > 0 ? `预计 ${task.estimatedMinutes} 分` : undefined;
}

function statusLabel(task: TaskItem): string {
  return task.status === 'inProgress' ? '进行中' : '待开始';
}

export function TodayTaskRow(props: TodayTaskRowProps) {
  const { task, variant } = props;
  const completed = variant === 'completed';
  const isInProgress = task.status === 'inProgress';
  const execution = completed ? undefined : props.execution;
  const delayed = completed ? false : props.delayed;
  const plannedTime = variant === 'scheduled' ? formatDateTimeRange(task.plannedStartAt, task.plannedEndAt) : undefined;
  const time = plannedTime && !isInProgress ? plannedTime : undefined;
  const estimate = completed ? undefined : estimateLabel(task);
  const executionLabel = isInProgress
    ? execution ? `进行中 · ${formatTime(execution.startedAt)} ${execution.resumed ? '继续' : '开始'}` : '进行中'
    : undefined;

  return (
    <View testID={`task-${task.id}`} style={[styles.row, completed && styles.completedRow]}>
      {completed ? (
        <View style={styles.rowBody}>
          <View style={styles.copy}><Text numberOfLines={1} style={[styles.title, styles.completedTitle]}>{task.title}</Text></View>
          <View style={styles.completedTag}><Text style={styles.completedTagText}>已完成</Text></View>
        </View>
      ) : (
        <Pressable
          accessibilityLabel={`查看 ${task.title}`}
          accessibilityRole="button"
          onPress={() => props.onOpen()}
          style={({ pressed }) => [styles.rowBody, pressed && styles.rowBodyPressed]}
          testID={`open-today-task-${task.id}`}
        >
          {time ? <Text style={styles.time}>{time}</Text> : null}
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.title}>{task.title}</Text>
            {executionLabel ? <Text style={styles.executionStatus}>● {executionLabel}</Text> : null}
            {isInProgress && plannedTime ? <Text style={styles.plannedMeta}>原计划 {plannedTime}</Text> : null}
            {!isInProgress && delayed ? <Text style={styles.delayedStatus}>已延迟 · 未开始</Text> : null}
          </View>
          {estimate ? <Text style={styles.estimate}>{estimate}</Text> : null}
        </Pressable>
      )}

      {completed ? (
        <Pressable testID={`restore-completed-${task.id}`} style={({ pressed }) => [styles.actionTouch, styles.completedAction, pressed && styles.actionTouchPressed]} accessibilityRole="button" accessibilityLabel={`恢复未完成 ${task.title}`} onPress={props.onRestore}>
          <Text style={styles.completedGlyph}>↶</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityHint={statusLabel(task)}
          accessibilityLabel={`完成 ${task.title}`}
          accessibilityRole="button"
          hitSlop={2}
          onPress={props.onComplete}
          style={({ pressed }) => [styles.actionTouch, pressed && styles.actionTouchPressed]}
          testID={`complete-today-${task.id}`}
        >
          <View style={[styles.actionCircle, isInProgress && styles.actionCircleInProgress]}><Text style={[styles.actionGlyph, isInProgress && styles.actionGlyphInProgress]}>✓</Text></View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.xl, paddingRight: spacing.sm, borderRadius: radius.medium, borderWidth: border.width, borderColor: border.color, backgroundColor: colors.card, overflow: 'hidden' },
  rowBody: { minHeight: 60, flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBodyPressed: { opacity: 0.72 },
  completedRow: { backgroundColor: '#FBFCFE' },
  actionTouch: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  actionTouchPressed: { backgroundColor: colors.primarySoft, opacity: 0.78 },
  actionCircle: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: border.width, borderColor: colors.line, backgroundColor: colors.card },
  actionCircleInProgress: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  actionGlyph: { color: colors.muted, fontSize: 15, lineHeight: 18, fontWeight: '900' },
  actionGlyphInProgress: { color: colors.green },
  completedAction: { borderWidth: border.width, borderColor: colors.line, backgroundColor: '#F3F5F8' },
  completedGlyph: { color: colors.primary, fontSize: 17, lineHeight: 19, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0, gap: 2, paddingVertical: spacing.sm },
  title: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  executionStatus: { color: colors.green, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  plannedMeta: { color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  delayedStatus: { color: colors.orange, fontSize: 10, lineHeight: 14, fontWeight: '800' },
  completedTitle: { color: colors.muted, fontWeight: '700' },
  time: { color: colors.ink, flexShrink: 0, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  estimate: { color: colors.primary, flexShrink: 0, ...typography.meta, fontWeight: '800' },
  completedTag: { minHeight: 26, paddingHorizontal: spacing.md, borderRadius: radius.small, backgroundColor: '#F0F2F6', alignItems: 'center', justifyContent: 'center' },
  completedTagText: { color: colors.muted, ...typography.label },
});
