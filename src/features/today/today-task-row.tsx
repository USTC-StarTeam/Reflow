import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDateTimeRange } from '@/core/date-utils';
import type { TaskItem } from '@/core/types';
import { border, colors, radius, spacing, typography } from '../shared/theme';

type TodayTaskRowProps = {
  task: TaskItem;
  variant: 'scheduled' | 'dateOnly';
  onComplete: () => void;
  onOpen: () => void;
} | {
  task: TaskItem;
  variant: 'completed';
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
  const time = variant === 'scheduled' ? formatDateTimeRange(task.plannedStartAt, task.plannedEndAt) : undefined;
  const estimate = completed ? undefined : estimateLabel(task);

  return (
    <View testID={`task-${task.id}`} style={[styles.row, completed && styles.completedRow]}>
      {completed ? (
        <View style={styles.rowBody}>
          <Text style={styles.reorderGlyph} accessibilityElementsHidden>≡</Text>
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
          <Text style={styles.reorderGlyph} accessibilityElementsHidden>≡</Text>
          {time ? <Text style={styles.time}>{time}</Text> : null}
          <View style={styles.copy}><Text numberOfLines={1} style={styles.title}>{task.title}</Text></View>
          {estimate ? <Text style={styles.estimate}>{estimate}</Text> : null}
        </Pressable>
      )}

      {completed ? (
        <View testID={`today-completed-${task.id}`} style={[styles.actionTouch, styles.completedAction]} accessibilityLabel={`已完成 ${task.title}`}>
          <Text style={styles.completedGlyph}>✓</Text>
        </View>
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
  reorderGlyph: { width: 14, flexShrink: 0, color: colors.subtle, fontSize: 16, lineHeight: 18, fontWeight: '800' },
  actionTouch: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  actionTouchPressed: { backgroundColor: colors.primarySoft, opacity: 0.78 },
  actionCircle: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: border.width, borderColor: colors.line, backgroundColor: colors.card },
  actionCircleInProgress: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  actionGlyph: { color: colors.muted, fontSize: 15, lineHeight: 18, fontWeight: '900' },
  actionGlyphInProgress: { color: colors.green },
  completedAction: { borderWidth: border.width, borderColor: colors.line, backgroundColor: '#F3F5F8' },
  completedGlyph: { color: colors.subtle, fontSize: 15, lineHeight: 18, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  completedTitle: { color: colors.muted, fontWeight: '700' },
  time: { color: colors.ink, flexShrink: 0, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  estimate: { color: colors.primary, flexShrink: 0, ...typography.meta, fontWeight: '800' },
  completedTag: { minHeight: 26, paddingHorizontal: spacing.md, borderRadius: radius.small, backgroundColor: '#F0F2F6', alignItems: 'center', justifyContent: 'center' },
  completedTagText: { color: colors.muted, ...typography.label },
});
