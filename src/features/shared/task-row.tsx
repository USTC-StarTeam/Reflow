import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDateTimeRange } from '@/core/date-utils';
import { categoryLabels, statusLabels, type TaskItem } from '@/core/types';
import { border, colors, radius, spacing, typography } from './theme';
import { MiniAction } from './ui';

export function TaskRow({ task, minutes, onStart, onPause, onMoveUp, onMoveDown }: { task: TaskItem; minutes: number; onStart: () => void; onPause: () => void; onMoveUp?: () => void; onMoveDown?: () => void }) {
  const statusTone = task.status === 'inProgress' ? styles.statusDoing : task.status === 'completed' ? styles.statusDone : styles.statusTodo;
  return (
    <View testID={`task-${task.id}`} style={styles.row}>
      <Text style={styles.handle}>≡</Text>
      <View style={styles.main}>
        <View style={styles.titleLine}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={task.status === 'inProgress' ? `暂停 ${task.title}` : `开始 ${task.title}`}
            disabled={task.status === 'completed'}
            hitSlop={5}
            onPress={task.status === 'inProgress' ? onPause : onStart}
            style={[styles.status, statusTone]}
          ><Text style={[styles.statusText, task.status === 'inProgress' && styles.statusTextDoing]}>{statusLabels[task.status]}</Text></Pressable>
          <Text numberOfLines={1} style={[styles.title, task.status === 'completed' && styles.titleDone]}>{task.title}</Text>
        </View>
        <Text numberOfLines={1} style={styles.meta}>{categoryLabels[task.category]} · {formatDateTimeRange(task.plannedStartAt, task.plannedEndAt)} · {minutes}/{task.estimatedMinutes} 分钟</Text>
      </View>
      {onMoveUp || onMoveDown ? <View style={styles.reorder}><MiniAction label="上移" glyph="↑" onPress={onMoveUp} /><MiniAction label="下移" glyph="↓" onPress={onMoveDown} /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.medium, borderWidth: border.width, borderColor: border.color, backgroundColor: colors.card },
  handle: { width: 15, color: colors.subtle, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  main: { flex: 1, minWidth: 0, gap: spacing.xxs },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  status: { minWidth: 46, height: 24, paddingHorizontal: spacing.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  statusTodo: { backgroundColor: colors.primarySoft }, statusDoing: { backgroundColor: colors.greenSoft }, statusDone: { backgroundColor: '#EEF2F6' },
  statusText: { color: colors.primary, fontSize: 9, lineHeight: 12, fontWeight: '900' },
  statusTextDoing: { color: colors.green },
  title: { flex: 1, color: colors.ink, ...typography.task },
  titleDone: { color: '#98A2B1', textDecorationLine: 'line-through' },
  meta: { color: colors.muted, ...typography.label, fontWeight: '400' },
  reorder: { flexDirection: 'row', gap: spacing.xs },
});
