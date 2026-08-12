import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { dateKey, formatTime } from '@/core/date-utils';
import { selectCurrentTask, selectTaskMinutes } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { categoryLabels } from '@/core/types';
import { colors, radius } from '../shared/theme';
import { ActionButton, Card, Chip, EmptyState, Page, PageHeader, SectionHeader, textStyles } from '../shared/ui';

export function ActiveScreen() {
  const store = useReflowStore();
  const { data } = store;
  const active = selectCurrentTask(data);
  const [progress, setProgress] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const logs = [...data.progressLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const available = data.tasks.filter((task) => !task.deletedAt && task.plannedDate === dateKey(new Date()) && task.status === 'notStarted');

  function submitProgress() {
    if (!active || !progress.trim()) return;
    store.recordProgress(active.id, progress);
    setProgress('');
  }

  return (
    <Page testID="screen-active">
      <PageHeader title="进行中" subtitle="执行记录与真实时间" right={<Chip label={active ? '记录中' : '空闲'} tone={active ? 'green' : 'neutral'} size="header" />} />
      {active ? (
        <>
          <Card accent="active" testID="current-task-card">
            <View style={styles.activeTop}><View style={styles.activeCopy}><Text style={styles.currentLabel}>当前任务</Text><Text style={styles.activeTitle}>{active.title}</Text><Text style={textStyles.meta}>{categoryLabels[active.category]} · 已记录 {selectTaskMinutes(data, active.id)} / 预计 {active.estimatedMinutes} 分钟</Text></View><View style={styles.timer}><Text style={styles.timerValue}>{selectTaskMinutes(data, active.id)}</Text><Text style={styles.timerUnit}>分钟</Text></View></View>
            <View style={styles.next}><Text style={styles.nextLabel}>下一步</Text><Text style={styles.nextText}>{active.nextAction}</Text></View>
            <TextInput testID="progress-input" value={progress} onChangeText={setProgress} placeholder="追加一句进展…" placeholderTextColor="#A7AFBC" style={styles.progressInput} />
            <View style={styles.actions}>
              <ActionButton testID="record-progress" label="记进展" variant="green" onPress={submitProgress} disabled={!progress.trim()} />
              <ActionButton testID="record-time" label="+15 分钟" onPress={() => store.recordTime(active.id, 15)} />
              <ActionButton label="记录打断" variant="orange" onPress={() => store.recordInterruption(active.id, '突发事项打断当前任务')} />
              <ActionButton label="暂停" onPress={() => store.pauseTask(active.id)} />
              <ActionButton testID="complete-task" label="完成" variant="primary" onPress={() => store.completeTask(active.id)} />
              <ActionButton label="删除" variant="danger" onPress={() => setConfirmDelete(true)} />
            </View>
          </Card>
          <Card><Text style={textStyles.cardTitle}>本地进度估算</Text><Text style={textStyles.meta}>按预计时长还剩约 {Math.max(0, active.estimatedMinutes - selectTaskMinutes(data, active.id))} 分钟。该数字只来自任务预计时长和已记录耗时。</Text></Card>
        </>
      ) : (
        <Card><EmptyState title="当前没有进行中的任务" detail="从今天的任务中选择一项开始，系统会确保同时只有一个当前任务。" />{available.slice(0, 3).map((task) => <View key={task.id} testID={`active-candidate-${task.id}`} style={styles.available}><View style={styles.availableCopy}><Text style={textStyles.cardTitle}>{task.title}</Text><Text style={textStyles.meta}>{categoryLabels[task.category]} · {task.estimatedMinutes} 分钟</Text></View><ActionButton label="开始" variant="primary" onPress={() => store.startTask(task.id)} /></View>)}</Card>
      )}
      <SectionHeader title="执行时间线" meta={`${logs.length} 条`} />
      <View style={styles.timeline}>{logs.map((log) => { const task = data.tasks.find((item) => item.id === log.taskId); return <View key={log.id} style={styles.log}><View style={[styles.dot, log.kind === 'interrupt' && styles.dotInterrupt, log.kind === 'complete' && styles.dotDone]} /><View style={styles.logTime}><Text style={styles.timeText}>{formatTime(log.createdAt)}</Text></View><View style={styles.logCard}><Text style={textStyles.cardTitle}>{log.text}</Text><Text style={textStyles.meta}>{task?.title ?? '已删除任务'}</Text></View></View>; })}</View>

      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <Pressable style={styles.overlay} onPress={() => setConfirmDelete(false)}><Pressable style={styles.confirm} onPress={(event) => event.stopPropagation()}><Text style={styles.confirmTitle}>删除当前任务？</Text><Text style={textStyles.meta}>任务会从当前页面移除，但计划事件和执行事实会保留，用于历史回顾和引用完整性。</Text><View style={styles.actions}><ActionButton label="取消" onPress={() => setConfirmDelete(false)} /><ActionButton label="确认删除" variant="danger" onPress={() => { if (active) store.deleteTask(active.id); setConfirmDelete(false); }} /></View></Pressable></Pressable>
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  activeTop: { flexDirection: 'row', gap: 12, alignItems: 'center' }, activeCopy: { flex: 1, gap: 4 }, currentLabel: { color: colors.green, fontSize: 10, fontWeight: '900' }, activeTitle: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '900' },
  timer: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }, timerValue: { color: colors.green, fontSize: 20, lineHeight: 22, fontWeight: '900' }, timerUnit: { color: colors.green, fontSize: 9, fontWeight: '700' },
  next: { padding: 10, borderRadius: radius.small, backgroundColor: colors.surface }, nextLabel: { color: colors.muted, fontSize: 9, fontWeight: '900' }, nextText: { color: colors.ink, fontSize: 12, marginTop: 3, fontWeight: '700' },
  progressInput: { minHeight: 46, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, paddingHorizontal: 11, fontSize: 13 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  available: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.line }, availableCopy: { flex: 1 },
  timeline: { gap: 0 }, log: { minHeight: 64, flexDirection: 'row', alignItems: 'flex-start', position: 'relative' }, dot: { position: 'absolute', left: 43, top: 17, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, zIndex: 2 }, dotInterrupt: { backgroundColor: colors.orange }, dotDone: { backgroundColor: colors.green },
  logTime: { width: 42, paddingTop: 13 }, timeText: { color: colors.muted, fontSize: 10, fontWeight: '800', textAlign: 'right' }, logCard: { flex: 1, marginLeft: 18, marginBottom: 8, padding: 10, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 18 }, confirm: { width: '100%', maxWidth: 390, borderRadius: 22, backgroundColor: colors.card, padding: 18, gap: 14 }, confirmTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
});
