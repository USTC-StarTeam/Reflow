import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDateTimeRange, formatShortDate, isLocalDate, toZonedISOString } from '@/core/date-utils';
import { executionDurationMinutes, executionNeedsConfirmation } from '@/core/execution';
import { selectCurrentExecutionSession, selectCurrentTask } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import type { LocalDate, TaskItem } from '@/core/types';
import { ScheduleTaskModal } from '../calendar/schedule-task-modal';
import { ExecutionCorrectionModal } from '../shared/execution-correction-modal';
import { LocalDatePicker } from '../shared/local-date-picker';
import { colors, radius, spacing, typography } from '../shared/theme';
import { ActionButton, ModalSurface, textStyles } from '../shared/ui';

type GuardedAction = 'close' | 'schedule' | 'unschedule' | 'someday' | 'start' | 'complete';

type TaskDetailModalProps = {
  task: TaskItem;
  visible: boolean;
  onClose: () => void;
};

export function TaskDetailModal({ task, visible, onClose }: TaskDetailModalProps) {
  const router = useRouter();
  const store = useReflowStore();
  const [title, setTitle] = useState(task.title);
  const [estimatedMinutes, setEstimatedMinutes] = useState(String(task.estimatedMinutes));
  const [nextAction, setNextAction] = useState(task.nextAction);
  const [plannedDate, setPlannedDate] = useState(task.plannedDate ?? '');
  const [error, setError] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [savedDetails, setSavedDetails] = useState({
    title: task.title,
    estimatedMinutes: String(task.estimatedMinutes),
    nextAction: task.nextAction,
  });
  const [savedDate, setSavedDate] = useState(task.plannedDate ?? '');
  const [pendingAction, setPendingAction] = useState<GuardedAction>();
  const [confirmDateChange, setConfirmDateChange] = useState(false);
  const [confirmTaskSwitch, setConfirmTaskSwitch] = useState(false);
  const [executionCorrection, setExecutionCorrection] = useState<{ kind: 'complete' | 'switch'; startedAt: string; endedAt: string }>();
  const [scheduleDateOverride, setScheduleDateOverride] = useState<LocalDate>();
  const planningIdentity = `${task.plannedDate ?? ''}|${task.plannedStartAt ?? ''}|${task.plannedEndAt ?? ''}`;
  const [previousPlanningIdentity, setPreviousPlanningIdentity] = useState(planningIdentity);

  const detailsDirty = title !== savedDetails.title
    || estimatedMinutes !== savedDetails.estimatedMinutes
    || nextAction !== savedDetails.nextAction;
  const dateDirty = plannedDate !== savedDate;
  const dirty = detailsDirty || dateDirty;

  if (previousPlanningIdentity !== planningIdentity) {
    setPreviousPlanningIdentity(planningIdentity);
    if (!dateDirty) {
      const canonicalDate = task.plannedDate ?? '';
      setPlannedDate(canonicalDate);
      setSavedDate(canonicalDate);
    }
  }

  function saveDetails() {
    const minutes = Number(estimatedMinutes);
    if (!title.trim()) return setError('任务标题不能为空。');
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) return setError('预计耗时需填写 5～480 分钟的整数。');
    if (!nextAction.trim()) return setError('下一步行动不能为空。');
    const normalized = { title: title.trim(), estimatedMinutes: String(minutes), nextAction: nextAction.trim() };
    store.updateTaskDetails(task.id, { title: normalized.title, estimatedMinutes: minutes, nextAction: normalized.nextAction });
    setTitle(normalized.title);
    setEstimatedMinutes(normalized.estimatedMinutes);
    setNextAction(normalized.nextAction);
    setSavedDetails(normalized);
    setError('');
  }

  function saveDate() {
    if (!isLocalDate(plannedDate)) {
      setError('请先选择计划日期。');
      return;
    }
    if (plannedDate === savedDate) {
      setError('');
      return;
    }
    if (task.plannedStartAt && task.plannedEndAt) {
      setConfirmDateChange(true);
      setError('');
      return;
    }
    store.planTaskForDate(task.id, plannedDate);
    setSavedDate(plannedDate);
    setError('');
  }

  function confirmUnscheduledDateChange() {
    store.planTaskForDate(task.id, plannedDate as LocalDate);
    setSavedDate(plannedDate);
    setConfirmDateChange(false);
    setError('');
  }

  function rescheduleDateChange() {
    setScheduleDateOverride(plannedDate as LocalDate);
    setConfirmDateChange(false);
    setScheduleOpen(true);
  }

  function scheduledOn(date: LocalDate) {
    setPlannedDate(date);
    setSavedDate(date);
    setScheduleDateOverride(undefined);
    setError('');
  }

  function execute(action: GuardedAction) {
    if (action === 'close') return onClose();
    if (action === 'schedule') return setScheduleOpen(true);
    if (action === 'unschedule') return store.unscheduleTask(task.id);
    if (action === 'someday') {
      store.deferTask(task.id, { bucket: 'someday' });
      return onClose();
    }
    if (action === 'start') {
      const current = selectCurrentTask(store.data);
      if (task.status !== 'inProgress' && current && current.id !== task.id) return setConfirmTaskSwitch(true);
      return startAndOpenActive();
    }
    if (task.status === 'inProgress') {
      const execution = selectCurrentExecutionSession(store.data, task.id);
      const endedAt = toZonedISOString(new Date());
      if (execution && executionNeedsConfirmation(execution.startedAt, endedAt)) {
        setExecutionCorrection({ kind: 'complete', startedAt: execution.startedAt, endedAt });
        return;
      }
    }
    store.completeTask(task.id);
    return onClose();
  }

  function startAndOpenActive() {
    const current = selectCurrentTask(store.data);
    if (task.status !== 'inProgress' && current && current.id !== task.id) {
      const execution = selectCurrentExecutionSession(store.data, current.id);
      const endedAt = toZonedISOString(new Date());
      if (execution && executionNeedsConfirmation(execution.startedAt, endedAt)) {
        setConfirmTaskSwitch(false);
        setExecutionCorrection({ kind: 'switch', startedAt: execution.startedAt, endedAt });
        return;
      }
    }
    if (task.status !== 'inProgress') store.startTask(task.id);
    setConfirmTaskSwitch(false);
    onClose();
    router.push('/active');
  }

  function request(action: GuardedAction) {
    if (dirty) return setPendingAction(action);
    execute(action);
  }

  function discardAndContinue() {
    if (!pendingAction) return;
    const action = pendingAction;
    setTitle(savedDetails.title);
    setEstimatedMinutes(savedDetails.estimatedMinutes);
    setNextAction(savedDetails.nextAction);
    setPlannedDate(savedDate);
    setError('');
    setPendingAction(undefined);
    execute(action);
  }

  return (
    <>
      {!datePickerOpen && !scheduleOpen && !pendingAction && !confirmDateChange && !confirmTaskSwitch && !executionCorrection ? (
        <ModalSurface
          visible={visible}
          title="任务详情"
          subtitle={task.status === 'inProgress' ? '正在进行' : '查看并调整今天的事项'}
          onClose={() => request('close')}
          placement="center"
          testID="today-task-detail"
        >
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.field}>
            <Text style={styles.label}>标题</Text>
            <TextInput testID="task-detail-title" value={title} onChangeText={setTitle} style={styles.input} />
          </View>

          <View style={styles.row}>
            <View style={styles.growField}>
              <Text style={styles.label}>计划日期</Text>
              <Pressable
                testID="task-detail-date"
                accessibilityRole="button"
                accessibilityLabel={plannedDate ? `计划日期 ${formatShortDate(plannedDate)}，点击修改` : '计划日期尚未选择，点击选择'}
                onPress={() => setDatePickerOpen(true)}
                style={({ pressed }) => [styles.input, styles.dateButton, pressed && styles.dateButtonPressed]}
              >
                <Text style={textStyles.body}>{plannedDate ? formatShortDate(plannedDate) : '选择日期'}</Text>
                <Text style={styles.dateDisclosure}>选择</Text>
              </Pressable>
            </View>
            <View style={styles.durationField}>
              <Text style={styles.label}>预计耗时</Text>
              <TextInput testID="task-detail-duration" value={estimatedMinutes} onChangeText={setEstimatedMinutes} keyboardType="number-pad" style={styles.input} />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>下一步行动</Text>
            <TextInput testID="task-detail-next-action" value={nextAction} onChangeText={setNextAction} multiline style={[styles.input, styles.multiline]} />
          </View>

          <View style={styles.timeOverview}>
            <View style={styles.timeCopy}>
              <Text style={styles.label}>具体时间</Text>
              <Text testID="task-detail-time" style={textStyles.body}>{task.plannedStartAt ? formatDateTimeRange(task.plannedStartAt, task.plannedEndAt) : '尚未安排具体时间'}</Text>
            </View>
            <ActionButton testID="open-task-schedule" label={task.plannedStartAt ? '调整时间' : '安排时间'} onPress={() => request('schedule')} />
          </View>

          {error ? <Text testID="task-detail-error" style={styles.error}>{error}</Text> : null}

          <View style={styles.inlineActions}>
            <ActionButton testID="save-task-details" label="保存内容" variant="primary" onPress={saveDetails} />
            <ActionButton testID="save-task-date" label="保存日期" onPress={saveDate} />
          </View>
          <View style={styles.inlineActions}>
            {task.plannedStartAt ? <ActionButton testID="unschedule-task" label="取消具体时间" onPress={() => request('unschedule')} /> : null}
            <ActionButton testID="defer-task-someday" label="移到稍后" onPress={() => request('someday')} />
          </View>
          <View style={styles.primaryActions}>
            <ActionButton testID="start-task-from-detail" label={task.status === 'inProgress' ? '前往进行中' : '开始'} variant="green" onPress={() => request('start')} />
            <ActionButton testID="complete-task-from-detail" label="完成" variant="primary" onPress={() => request('complete')} />
          </View>
          </ScrollView>
        </ModalSurface>
      ) : null}

      {datePickerOpen && visible ? (
        <LocalDatePicker
          value={plannedDate || undefined}
          onClose={() => setDatePickerOpen(false)}
          onSelect={(date) => {
            setPlannedDate(date);
            setError('');
            setDatePickerOpen(false);
          }}
        />
      ) : null}

      {pendingAction ? (
        <ModalSurface
          visible
          title="有未保存的修改"
          subtitle="继续操作将放弃这些修改。"
          onClose={() => setPendingAction(undefined)}
          placement="center"
          testID="discard-task-changes"
        >
          <View style={styles.confirmActions}>
            <ActionButton testID="continue-editing-task" label="继续编辑" variant="primary" onPress={() => setPendingAction(undefined)} />
            <ActionButton testID="discard-task-changes-and-continue" label="放弃更改并继续" variant="danger" onPress={discardAndContinue} />
          </View>
        </ModalSurface>
      ) : null}

      {confirmDateChange ? (
        <ModalSurface
          visible
          title="修改计划日期会取消当前具体时间"
          subtitle="你可以取消具体时间后改到新日期，或保留原时间与时长并重新安排。"
          onClose={() => setConfirmDateChange(false)}
          placement="center"
          testID="confirm-task-date-change"
        >
          <View style={styles.confirmActions}>
            <ActionButton testID="continue-editing-task-date" label="继续编辑" variant="primary" onPress={() => setConfirmDateChange(false)} />
            <ActionButton testID="reschedule-task-date" label="重新安排时间" onPress={rescheduleDateChange} />
            <ActionButton testID="confirm-unscheduled-date-change" label="取消具体时间并改日期" variant="danger" onPress={confirmUnscheduledDateChange} />
          </View>
        </ModalSurface>
      ) : null}

      {confirmTaskSwitch ? (
        <ModalSurface
          visible
          title="暂停当前任务并开始新的任务？"
          subtitle={`“${selectCurrentTask(store.data)?.title ?? '当前任务'}”正在进行。切换后会先暂停它并保留实际执行时间。`}
          onClose={() => setConfirmTaskSwitch(false)}
          placement="center"
          testID="confirm-task-switch"
        >
          <View style={styles.confirmActions}>
            <ActionButton testID="cancel-task-switch" label="继续当前任务" variant="primary" onPress={() => setConfirmTaskSwitch(false)} />
            <ActionButton testID="confirm-task-switch-action" label={`暂停并开始“${task.title}”`} onPress={startAndOpenActive} />
          </View>
        </ModalSurface>
      ) : null}

      {executionCorrection ? (
        <ExecutionCorrectionModal
          elapsedMinutes={executionDurationMinutes(executionCorrection.startedAt, executionCorrection.endedAt)}
          onClose={() => setExecutionCorrection(undefined)}
          onDecision={(decision) => {
            if (executionCorrection.kind === 'complete') store.completeTask(task.id, decision);
            else store.startTask(task.id, decision);
            setExecutionCorrection(undefined);
            onClose();
            if (executionCorrection.kind === 'switch') router.push('/active');
          }}
        />
      ) : null}

      {scheduleOpen ? (
        <ScheduleTaskModal
          key={`${task.id}-${task.plannedDate ?? 'none'}-${task.plannedStartAt ?? 'unscheduled'}-${scheduleDateOverride ?? 'canonical'}`}
          task={task}
          initialDate={(task.plannedDate ?? plannedDate) as LocalDate}
          initialDateOverride={scheduleDateOverride}
          initialDurationMinutes={task.plannedStartAt && task.plannedEndAt
            ? Math.round((new Date(task.plannedEndAt).getTime() - new Date(task.plannedStartAt).getTime()) / 60_000)
            : undefined}
          visible
          onScheduled={scheduledOn}
          onClose={() => {
            setScheduleOpen(false);
            setScheduleDateOverride(undefined);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  content: { gap: spacing.xl, paddingBottom: spacing.xs },
  field: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  growField: { flex: 1, minWidth: 0, gap: spacing.sm },
  durationField: { width: 108, gap: spacing.sm },
  label: { color: colors.muted, ...typography.label },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: radius.small, paddingHorizontal: spacing.xl, color: colors.ink, backgroundColor: colors.surface, ...typography.body },
  dateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dateButtonPressed: { opacity: 0.72 },
  dateDisclosure: { color: colors.primary, ...typography.label },
  multiline: { minHeight: 72, paddingVertical: spacing.md, textAlignVertical: 'top' },
  timeOverview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.xl, borderRadius: radius.medium, backgroundColor: colors.surface },
  timeCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  primaryActions: { flexDirection: 'row', gap: spacing.md },
  confirmActions: { gap: spacing.md },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, fontWeight: '700' },
});
