import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { dateKey, formatShortDate, formatTime, toZonedISOString } from '@/core/date-utils';
import { executionDurationMinutes, executionNeedsConfirmation } from '@/core/execution';
import { selectCurrentExecutionSession, selectCurrentTask, selectTaskExecutionMinutes } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import type { ExecutionTimeDecision, ProgressLog, TaskItem } from '@/core/types';
import { colors, radius } from '../shared/theme';
import { ExecutionCorrectionModal } from '../shared/execution-correction-modal';
import { ActionButton, Card, Chip, EmptyState, Page, PageHeader, textStyles } from '../shared/ui';
import { useCurrentTime } from '../shared/use-current-time';

function executionSummary(logs: ProgressLog[], currentMinutes: number, totalMinutes: number): string {
  const pauses = logs.filter((log) => log.kind === 'pause').length;
  const interruptions = logs.filter((log) => log.kind === 'interrupt').length;
  return `当前执行段 ${currentMinutes} 分 · 任务累计 ${totalMinutes} 分 · 暂停 ${pauses} 次 · 被打断 ${interruptions} 次`;
}

function CandidateRow({ task, onStart, pausedAt, today }: { task: TaskItem; onStart: () => void; pausedAt?: string; today: string }) {
  const isPaused = Boolean(pausedAt);
  const pausedLabel = pausedAt && dateKey(pausedAt) !== today ? `${formatShortDate(pausedAt)}暂停` : undefined;
  const metadata = [pausedLabel, task.estimatedMinutes ? `预计 ${task.estimatedMinutes} 分钟` : undefined].filter(Boolean).join(' · ');
  return (
    <View testID={`active-candidate-${task.id}`} style={styles.candidate}>
      <View style={styles.candidateCopy}>
        <Text style={textStyles.cardTitle}>{task.title}{isPaused ? '（已暂停）' : ''}</Text>
        {metadata ? <Text style={textStyles.meta}>{metadata}</Text> : null}
      </View>
      <ActionButton label={isPaused ? '继续' : '开始'} variant="primary" onPress={onStart} />
    </View>
  );
}

export function ActiveScreen() {
  const store = useReflowStore();
  const { data } = store;
  const active = selectCurrentTask(data);
  const [progress, setProgress] = useState('');
  const [recordingInterruption, setRecordingInterruption] = useState(false);
  const [interruptionReason, setInterruptionReason] = useState('');
  const [pendingExecutionAction, setPendingExecutionAction] = useState<'pause' | 'complete'>();
  const clock = useCurrentTime(30_000);
  const today = dateKey(clock);
  const latestPause = [...data.progressLogs]
    .filter((log) => log.kind === 'pause')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .find((log) => data.tasks.some((task) => task.id === log.taskId && !task.deletedAt && task.status === 'notStarted'));
  const pausedTask = latestPause ? data.tasks.find((task) => task.id === latestPause.taskId) : undefined;
  const activeLogs = active ? data.progressLogs.filter((log) => log.taskId === active.id) : [];
  const currentExecution = active ? selectCurrentExecutionSession(data, active.id) : undefined;
  const recentProgress = [...activeLogs].filter((log) => log.kind === 'progress').sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 2);
  const executionMinutes = active ? selectTaskExecutionMinutes(data, active.id, clock) : { currentSegmentMinutes: 0, totalMinutes: 0 };
  const todayCandidates = data.tasks
    .filter((task) => !task.deletedAt && task.plannedDate === today && task.status === 'notStarted')
    .sort((left, right) => left.sortIndex - right.sortIndex);
  const available = [pausedTask, ...todayCandidates]
    .filter((task, index, tasks): task is TaskItem => Boolean(task) && tasks.findIndex((candidate) => candidate?.id === task?.id) === index)
    .slice(0, 3);

  function submitProgress() {
    if (!active || !progress.trim()) return;
    store.recordProgress(active.id, progress);
    setProgress('');
  }

  function requestExecutionAction(action: 'pause' | 'complete') {
    if (!active) return;
    setRecordingInterruption(false);
    setInterruptionReason('');
    if (currentExecution && executionNeedsConfirmation(currentExecution.startedAt, toZonedISOString(clock))) {
      setPendingExecutionAction(action);
      return;
    }
    if (action === 'pause') store.pauseTask(active.id);
    else store.completeTask(active.id);
  }

  function recordInterruption() {
    if (!active) return;
    store.recordInterruption(active.id, interruptionReason);
    setRecordingInterruption(false);
    setInterruptionReason('');
  }

  function cancelInterruption() {
    setRecordingInterruption(false);
    setInterruptionReason('');
  }

  function confirmExecutionTime(decision: ExecutionTimeDecision) {
    if (!active) return;
    if (pendingExecutionAction === 'pause') store.pauseTask(active.id, decision);
    if (pendingExecutionAction === 'complete') store.completeTask(active.id, decision);
    setPendingExecutionAction(undefined);
  }

  return (
    <Page testID="screen-active">
      <PageHeader title="进行中" subtitle="专注当下，持续推进" right={<Chip label={active ? '进行中' : '空闲'} tone={active ? 'green' : 'neutral'} size="header" />} />
      {active ? (
        <>
          <Card testID="current-task-card" style={styles.currentCard}>
            <View style={styles.titleRow}><View style={styles.statusDot} /><View style={styles.titleCopy}><Text style={styles.activeTitle}>{active.title}</Text><Text style={textStyles.meta}>当前执行段 {executionMinutes.currentSegmentMinutes} 分 · 任务累计 {executionMinutes.totalMinutes} 分{active.estimatedMinutes ? ` · 预计 ${active.estimatedMinutes} 分钟` : ''}</Text></View></View>
            {active.estimatedMinutes ? <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, Math.round((executionMinutes.totalMinutes / active.estimatedMinutes) * 100))}%` }]} /></View> : null}
          </Card>

          {active.nextAction ? <Card style={styles.nextCard}><Text style={styles.nextLabel}>下一步</Text><Text style={styles.nextText}>{active.nextAction}</Text></Card> : null}

          <Card style={styles.recordCard}>
            <View style={styles.progressComposerRow}>
              <TextInput testID="progress-input" value={progress} onChangeText={setProgress} placeholder="记录一下进展…" placeholderTextColor={colors.subtle} style={styles.progressInput} />
              <ActionButton testID="record-progress" label="记录进展" variant="green" onPress={submitProgress} disabled={!progress.trim()} />
            </View>
            {recordingInterruption ? (
              <View testID="interruption-form" style={styles.interruptionForm}>
                <Text style={styles.interruptionTitle}>被什么打断了？</Text>
                <TextInput
                  testID="interruption-input"
                  value={interruptionReason}
                  onChangeText={setInterruptionReason}
                  placeholder="临时消息、电话、同学找我……"
                  placeholderTextColor={colors.subtle}
                  style={styles.interruptionInput}
                />
                <View style={styles.interruptionActions}>
                  <ActionButton testID="cancel-interruption" label="取消" onPress={cancelInterruption} />
                  <ActionButton testID="save-interruption" label="记录" variant="primary" onPress={recordInterruption} />
                </View>
              </View>
            ) : (
              <Pressable testID="open-interruption" accessibilityRole="button" onPress={() => setRecordingInterruption(true)} style={styles.interruptionTrigger}>
                <Text style={styles.interruptionTriggerText}>记录中断</Text>
              </Pressable>
            )}
          </Card>

          <View style={styles.primaryActions}>
            <View style={styles.primaryAction}><ActionButton testID="pause-task" label="暂停" onPress={() => requestExecutionAction('pause')} /></View>
            <View style={styles.primaryAction}><ActionButton testID="complete-task" label="完成" variant="primary" onPress={() => requestExecutionAction('complete')} /></View>
          </View>

          <Card testID="execution-summary" style={styles.summaryCard}>
            <Text style={textStyles.cardTitle}>执行概况</Text>
            <Text style={styles.summaryText}>{executionSummary(activeLogs, executionMinutes.currentSegmentMinutes, executionMinutes.totalMinutes)}</Text>
            {recentProgress.length ? <View style={styles.recentProgress}><Text style={styles.recentTitle}>最近进展</Text>{recentProgress.map((log) => <View key={log.id} style={styles.progressRow}><View style={styles.progressDot} /><Text style={styles.progressTime}>{formatTime(log.createdAt)}</Text><Text style={styles.progressText}>{log.text}</Text></View>)}</View> : null}
          </Card>
        </>
      ) : (
        <Card testID="active-empty-state" style={styles.emptyCard}>
          <EmptyState title="当前没有进行中的任务" detail="从今天的事项中选择一项开始，系统会保持一次只专注一个任务。" />
          {available.map((task) => <CandidateRow key={task.id} task={task} pausedAt={task.id === pausedTask?.id ? latestPause?.createdAt : undefined} today={today} onStart={() => store.startTask(task.id)} />)}
        </Card>
      )}
      {pendingExecutionAction && currentExecution ? (
        <ExecutionCorrectionModal
          elapsedMinutes={executionDurationMinutes(currentExecution.startedAt, toZonedISOString(clock))}
          onClose={() => setPendingExecutionAction(undefined)}
          onDecision={confirmExecutionTime}
        />
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  currentCard: { padding: 15, gap: 12 }, titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, statusDot: { width: 9, height: 9, borderRadius: 5, marginTop: 6, backgroundColor: colors.primary }, titleCopy: { flex: 1, minWidth: 0, gap: 4 }, activeTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  progressTrack: { height: 5, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.line }, progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  nextCard: { padding: 14 }, nextLabel: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '900' }, nextText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  recordCard: { gap: 10 }, progressComposerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, progressInput: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, paddingHorizontal: 11, fontSize: 13 },
  interruptionTrigger: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 }, interruptionTriggerText: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  interruptionForm: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }, interruptionTitle: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '900' }, interruptionInput: { minHeight: 44, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, paddingHorizontal: 11, fontSize: 13 }, interruptionActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  primaryActions: { flexDirection: 'row', gap: 8 }, primaryAction: { flex: 1 },
  summaryCard: { padding: 14, gap: 8 }, summaryText: { color: colors.primary, fontSize: 13, lineHeight: 19, fontWeight: '800' }, recentProgress: { gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }, recentTitle: { color: colors.ink, fontSize: 12, lineHeight: 17, fontWeight: '900' }, progressRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, progressDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green }, progressTime: { width: 34, color: colors.muted, fontSize: 10, fontWeight: '800' }, progressText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 },
  emptyCard: { paddingBottom: 12 }, candidate: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.line }, candidateCopy: { flex: 1, minWidth: 0 },
});
