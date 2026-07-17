import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDateTimeRange } from '@/core/date-utils';
import { categoryLabels, statusLabels, type TaskItem } from '@/core/types';
import { colors, radius } from './theme';

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
            onPress={task.status === 'inProgress' ? onPause : onStart}
            style={[styles.status, statusTone]}
          ><Text style={[styles.statusText, task.status === 'inProgress' && styles.statusTextDoing]}>{statusLabels[task.status]}</Text></Pressable>
          <Text numberOfLines={1} style={[styles.title, task.status === 'completed' && styles.titleDone]}>{task.title}</Text>
        </View>
        <Text numberOfLines={1} style={styles.meta}>{categoryLabels[task.category]} · {formatDateTimeRange(task.plannedStartAt, task.plannedEndAt)} · {minutes}/{task.estimatedMinutes} 分钟</Text>
      </View>
      {onMoveUp || onMoveDown ? <View style={styles.reorder}><Pressable accessibilityLabel="上移" onPress={onMoveUp} disabled={!onMoveUp} style={styles.mini}><Text>↑</Text></Pressable><Pressable accessibilityLabel="下移" onPress={onMoveDown} disabled={!onMoveDown} style={styles.mini}><Text>↓</Text></Pressable></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 9, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  handle: { width: 16, color: '#A3ABB7', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  main: { flex: 1, minWidth: 0, gap: 5 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  status: { minWidth: 48, height: 22, paddingHorizontal: 6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  statusTodo: { backgroundColor: colors.primarySoft }, statusDoing: { backgroundColor: colors.greenSoft }, statusDone: { backgroundColor: '#EEF2F6' },
  statusText: { color: colors.primary, fontSize: 9, fontWeight: '900' },
  statusTextDoing: { color: colors.green },
  title: { flex: 1, color: '#263244', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  titleDone: { color: '#98A2B1', textDecorationLine: 'line-through' },
  meta: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  reorder: { flexDirection: 'row', gap: 3 },
  mini: { width: 28, height: 34, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
});
