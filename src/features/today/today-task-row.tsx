import { StyleSheet, Text, View } from 'react-native';

import { formatDateTimeRange } from '@/core/date-utils';
import type { TaskItem } from '@/core/types';
import { border, colors, radius, spacing, typography } from '../shared/theme';

type TodayTaskRowVariant = 'scheduled' | 'dateOnly' | 'completed';

interface TodayTaskRowProps {
  task: TaskItem;
  variant: TodayTaskRowVariant;
}

function estimateLabel(task: TaskItem): string | undefined {
  return task.estimatedMinutes > 0 ? `预计 ${task.estimatedMinutes} 分` : undefined;
}

function statusLabel(task: TaskItem): string {
  return task.status === 'inProgress' ? '进行中' : '待开始';
}

export function TodayTaskRow({ task, variant }: TodayTaskRowProps) {
  const completed = variant === 'completed';
  const isInProgress = task.status === 'inProgress';
  const time = variant === 'scheduled' ? formatDateTimeRange(task.plannedStartAt, task.plannedEndAt) : undefined;
  const estimate = completed ? undefined : estimateLabel(task);

  return (
    <View testID={`task-${task.id}`} style={[styles.row, completed && styles.completedRow]}>
      {completed ? (
        <View testID={`today-completed-${task.id}`} style={styles.completedMark} accessibilityLabel="已完成">
          <Text style={styles.completedGlyph}>✓</Text>
        </View>
      ) : <View accessibilityLabel={statusLabel(task)} style={[styles.statusMark, isInProgress && styles.statusMarkInProgress]} />}

      {time ? <Text style={styles.time}>{time}</Text> : null}
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, completed && styles.completedTitle]}>{task.title}</Text>
      </View>

      {estimate ? <Text style={styles.estimate}>{estimate}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.medium, borderWidth: border.width, borderColor: border.color, backgroundColor: colors.card },
  completedRow: { minHeight: 46, backgroundColor: '#FBFCFE' },
  statusMark: { width: 8, height: 8, borderRadius: radius.pill, flexShrink: 0, backgroundColor: colors.primary },
  statusMarkInProgress: { backgroundColor: colors.green },
  completedMark: { width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2F6' },
  completedGlyph: { color: colors.subtle, fontSize: 12, lineHeight: 14, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, ...typography.task },
  completedTitle: { color: colors.muted, fontWeight: '700' },
  time: { color: colors.muted, flexShrink: 0, ...typography.meta, fontWeight: '800' },
  estimate: { color: colors.primary, flexShrink: 0, ...typography.meta, fontWeight: '800' },
});
