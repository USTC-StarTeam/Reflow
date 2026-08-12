import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDateTimeRange, isLocalDate } from '@/core/date-utils';
import { useReflowStore } from '@/core/store';
import type { LocalDate, TaskItem } from '@/core/types';
import { ScheduleTaskModal } from '../calendar/schedule-task-modal';
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
  const [savedDetails, setSavedDetails] = useState({
    title: task.title,
    estimatedMinutes: String(task.estimatedMinutes),
    nextAction: task.nextAction,
  });
  const [savedDate, setSavedDate] = useState(task.plannedDate ?? '');
  const [pendingAction, setPendingAction] = useState<GuardedAction>();
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
      setError('请输入 YYYY-MM-DD 格式的有效日期。');
      return;
    }
    store.planTaskForDate(task.id, plannedDate);
    setSavedDate(plannedDate);
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
      if (task.status !== 'inProgress') store.startTask(task.id);
      onClose();
      return router.push('/active');
    }
    store.completeTask(task.id);
    return onClose();
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
      {!scheduleOpen && !pendingAction ? (
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
              <TextInput testID="task-detail-date" value={plannedDate} onChangeText={setPlannedDate} placeholder="YYYY-MM-DD" style={styles.input} />
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

      {scheduleOpen ? (
        <ScheduleTaskModal
          key={`${task.id}-${task.plannedDate ?? 'none'}-${task.plannedStartAt ?? 'unscheduled'}`}
          task={task}
          initialDate={(task.plannedDate ?? plannedDate) as LocalDate}
          visible
          onClose={() => setScheduleOpen(false)}
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
  multiline: { minHeight: 72, paddingVertical: spacing.md, textAlignVertical: 'top' },
  timeOverview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.xl, borderRadius: radius.medium, backgroundColor: colors.surface },
  timeCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  primaryActions: { flexDirection: 'row', gap: spacing.md },
  confirmActions: { gap: spacing.md },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, fontWeight: '700' },
});
