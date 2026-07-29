import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatTime, isLocalDate, localDateOf, localDateToDate, toZonedISOString } from '@/core/date-utils';
import { selectScheduleConflicts } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import type { LocalDate, TaskItem } from '@/core/types';
import { colors, radius, shadow } from '../shared/theme';
import { ActionButton, textStyles } from '../shared/ui';

const durationOptions = [15, 30, 45, 60, 90, 120];

function defaultTime(task: TaskItem): string {
  if (!task.plannedStartAt) return '09:00';
  return formatTime(task.plannedStartAt);
}

export function ScheduleTaskModal({ task, initialDate, visible, onClose }: { task: TaskItem; initialDate: LocalDate; visible: boolean; onClose: () => void }) {
  const store = useReflowStore();
  const [date, setDate] = useState(task.plannedDate ?? initialDate);
  const [time, setTime] = useState(defaultTime(task));
  const [duration, setDuration] = useState(String(Math.max(15, task.estimatedMinutes)));
  const [error, setError] = useState('');
  const [pendingConflict, setPendingConflict] = useState<{ startAt: string; endAt: string; names: string[] } | null>(null);

  const validDuration = useMemo(() => Number(duration), [duration]);

  function buildRange() {
    if (!isLocalDate(date)) return { error: '请输入 YYYY-MM-DD 格式的有效日期。' } as const;
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    const hours = match ? Number(match[1]) : -1;
    const minutes = match ? Number(match[2]) : -1;
    if (!match || hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || minutes % 15 !== 0) return { error: '开始时间需按 15 分钟填写，例如 09:15。' } as const;
    if (!Number.isFinite(validDuration) || validDuration <= 0 || validDuration >= 24 * 60) return { error: '时长必须大于 0 且少于 24 小时。' } as const;
    const start = localDateToDate(date);
    start.setHours(hours, minutes, 0, 0);
    const end = new Date(start.getTime() + validDuration * 60_000);
    if (localDateOf(end) !== date) return { error: '单个计划时间块不能跨自然日。' } as const;
    return { startAt: toZonedISOString(start), endAt: toZonedISOString(end) } as const;
  }

  function submit() {
    const range = buildRange();
    if ('error' in range) {
      setError(range.error ?? '排期信息无效。');
      return;
    }
    const conflicts = selectScheduleConflicts(store.data, task.id, range.startAt, range.endAt);
    if (conflicts.length) {
      setPendingConflict({ ...range, names: conflicts.map((item) => item.title) });
      setError('');
      return;
    }
    store.scheduleTask(task.id, range.startAt, range.endAt);
    onClose();
  }

  function confirmConflict() {
    if (!pendingConflict) return;
    store.scheduleTask(task.id, pendingConflict.startAt, pendingConflict.endAt, { allowConflict: true });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}><View style={styles.copy}><Text style={styles.title}>安排任务时间</Text><Text style={textStyles.meta}>{task?.title}</Text></View><Pressable accessibilityLabel="关闭排期" onPress={onClose} style={styles.close}><Text>×</Text></Pressable></View>
          {pendingConflict ? (
            <View testID="schedule-conflict" style={styles.conflict}>
              <Text style={styles.conflictTitle}>这个时间已有安排</Text>
              <Text style={textStyles.meta}>{pendingConflict.names.join('、')}</Text>
              <Text style={textStyles.meta}>Reflow 不会自动挪动任何任务。只有你确认后才会保留冲突安排。</Text>
              <View style={styles.actions}><ActionButton label="返回修改" onPress={() => setPendingConflict(null)} /><ActionButton testID="confirm-schedule-conflict" label="仍然安排" variant="danger" onPress={confirmConflict} /></View>
            </View>
          ) : (
            <>
              <View style={styles.row}><View style={styles.field}><Text style={styles.label}>日期</Text><TextInput testID="schedule-date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={styles.input} /></View><View style={styles.field}><Text style={styles.label}>开始时间</Text><TextInput testID="schedule-time" value={time} onChangeText={setTime} placeholder="09:00" style={styles.input} /></View></View>
              <Text style={styles.label}>预计时长</Text>
              <View style={styles.options}>{durationOptions.map((minutes) => <ActionButton key={minutes} label={`${minutes} 分钟`} variant={duration === String(minutes) ? 'primary' : 'secondary'} onPress={() => setDuration(String(minutes))} />)}</View>
              <TextInput testID="schedule-duration" value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="自定义分钟" style={styles.input} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}><ActionButton label="取消" onPress={onClose} /><ActionButton testID="confirm-schedule" label="确认安排" variant="primary" onPress={submit} /></View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end', alignItems: 'center', padding: 14 },
  sheet: { width: '100%', maxWidth: 520, borderRadius: radius.large, backgroundColor: colors.card, padding: 16, gap: 12, ...shadow },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, copy: { flex: 1 }, title: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  close: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', gap: 8 }, field: { flex: 1, gap: 5 }, label: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: radius.small, paddingHorizontal: 11, color: colors.ink, backgroundColor: colors.surface },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  error: { color: colors.danger, fontSize: 12, fontWeight: '700' }, conflict: { gap: 10, padding: 12, borderRadius: radius.medium, backgroundColor: colors.dangerSoft }, conflictTitle: { color: colors.danger, fontSize: 15, fontWeight: '900' },
});
