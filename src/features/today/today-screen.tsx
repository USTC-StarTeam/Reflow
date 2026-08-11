import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { dateKey, formatDateTimeRange, formatShortDate, formatTime } from '@/core/date-utils';
import { selectPendingProposals, selectPlanningBacklog, selectTaskMinutes, selectTodaySections } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { categoryLabels, type TaskItem } from '@/core/types';
import { ScheduleTaskModal } from '../calendar/schedule-task-modal';
import { QuickComposer } from '../shared/quick-composer';
import { colors, radius, shadow } from '../shared/theme';
import { ActionButton, Card, Chip, EmptyState, Page, PageHeader, SectionHeader, textStyles } from '../shared/ui';

function TodayTaskCard({ task, completed, onSchedule }: { task: TaskItem; completed?: boolean; onSchedule: () => void }) {
  const store = useReflowStore();
  const minutes = selectTaskMinutes(store.data, task.id);
  return (
    <Card testID={`task-${task.id}`}>
      <View style={styles.taskTop}><View style={styles.taskCopy}><Text style={[textStyles.cardTitle, completed && styles.completedTitle]}>{task.title}</Text><Text style={textStyles.meta}>{categoryLabels[task.category]} · {task.plannedStartAt ? formatDateTimeRange(task.plannedStartAt, task.plannedEndAt) : '未排期'} · {minutes}/{task.estimatedMinutes} 分钟</Text></View><Chip label={completed ? `${formatTime(task.completedAt)} 完成` : task.status === 'inProgress' ? '进行中' : task.plannedStartAt ? '已排期' : '待安排'} tone={completed ? 'green' : task.status === 'inProgress' ? 'green' : task.plannedStartAt ? 'primary' : 'orange'} /></View>
      {!completed ? <View style={styles.actions}><ActionButton label={task.status === 'inProgress' ? `暂停 ${task.title}` : `开始 ${task.title}`} variant={task.status === 'inProgress' ? 'green' : 'primary'} onPress={() => task.status === 'inProgress' ? store.pauseTask(task.id) : store.startTask(task.id)} /><ActionButton testID={`schedule-task-${task.id}`} label={task.plannedStartAt ? '调整时间' : '安排时间'} onPress={onSchedule} /></View> : null}
    </Card>
  );
}

export function TodayScreen() {
  const store = useReflowStore();
  const today = useMemo(() => dateKey(new Date()), []);
  const sections = selectTodaySections(store.data, today);
  const backlog = selectPlanningBacklog(store.data, today);
  const pending = selectPendingProposals(store.data).length;
  const [planningOpen, setPlanningOpen] = useState(false);
  const [scheduleTask, setScheduleTask] = useState<TaskItem | undefined>();

  return (
    <>
      <Page testID="screen-today">
        <PageHeader title="今天" subtitle="先决定今天做什么，再安排具体时间" right={<Chip label={formatShortDate(today)} tone="primary" size="header" />} />
        <QuickComposer />
        <View style={styles.summary}>
          <View><Text style={styles.summaryValue}>{sections.scheduled.length}</Text><Text style={styles.summaryLabel}>已排期</Text></View><View style={styles.summaryDivider} />
          <View><Text style={styles.summaryValue}>{sections.unscheduled.length}</Text><Text style={styles.summaryLabel}>未排期</Text></View><View style={styles.summaryDivider} />
          <View><Text style={styles.summaryValue}>{sections.completed.length}</Text><Text style={styles.summaryLabel}>今日完成</Text></View>
        </View>
        <Card style={styles.planningCard}><View style={styles.taskTop}><View style={styles.taskCopy}><Text style={textStyles.cardTitle}>规划今天</Text><Text style={textStyles.meta}>{pending ? `收件箱还有 ${pending} 条待确认。` : '收件箱已处理。'} {backlog.length ? `还有 ${backlog.length} 项旧任务或稍后任务可加入今天。` : '没有需要顺延进来的任务。'}</Text></View><ActionButton testID="open-daily-planning" label="开始规划" variant="primary" onPress={() => setPlanningOpen(true)} /></View></Card>

        <SectionHeader title="今日时间安排" meta={`${sections.scheduled.length} 项`} />
        {sections.scheduled.length ? sections.scheduled.map((task) => <TodayTaskCard key={task.id} task={task} onSchedule={() => setScheduleTask(task)} />) : <EmptyState title="还没有具体时间安排" detail="可以先把任务加入今天，再点击“安排时间”。" />}

        <SectionHeader title="今日未排期" meta={`${sections.unscheduled.length} 项`} />
        {sections.unscheduled.length ? sections.unscheduled.map((task) => <TodayTaskCard key={task.id} task={task} onSchedule={() => setScheduleTask(task)} />) : <EmptyState title="没有未排期任务" detail="今天的待办都已有时间，或尚未从规划列表加入。" />}

        <SectionHeader title="今日已完成" meta={`${sections.completed.length} 项`} />
        {sections.completed.length ? sections.completed.map((task) => <TodayTaskCard key={task.id} task={task} completed onSchedule={() => undefined} />) : <EmptyState title="今天还没有完成记录" detail="完成任务后会按实际完成时间出现在这里。" />}
      </Page>

      <Modal visible={planningOpen} transparent animationType="fade" onRequestClose={() => setPlanningOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPlanningOpen(false)}><Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.taskTop}><View style={styles.taskCopy}><Text style={styles.sheetTitle}>规划今天</Text><Text style={textStyles.meta}>只把你明确选择的任务加入今天，不会自动改动日程。</Text></View><Pressable accessibilityLabel="关闭规划" style={styles.close} onPress={() => setPlanningOpen(false)}><Text>×</Text></Pressable></View>
          {backlog.length ? backlog.map((task) => <View key={task.id} style={styles.backlogRow}><View style={styles.taskCopy}><Text style={textStyles.cardTitle}>{task.title}</Text><Text style={textStyles.meta}>{task.plannedDate ? `原计划 ${task.plannedDate}` : '稍后处理'} · {task.estimatedMinutes} 分钟</Text></View><ActionButton label="加入今天" onPress={() => store.planTaskForDate(task.id, today)} /></View>) : <EmptyState title="没有待选择任务" detail="今天之外没有未完成或稍后任务。" />}
          <ActionButton label="完成今日规划" variant="primary" onPress={() => setPlanningOpen(false)} />
        </Pressable></Pressable>
      </Modal>
      {scheduleTask ? <ScheduleTaskModal key={scheduleTask.id} task={scheduleTask} initialDate={today} visible onClose={() => setScheduleTask(undefined)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  summary: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  summaryValue: { color: colors.ink, fontSize: 21, lineHeight: 25, textAlign: 'center', fontWeight: '900' }, summaryLabel: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2, textAlign: 'center', fontWeight: '700' }, summaryDivider: { width: 1, height: 32, backgroundColor: colors.line },
  planningCard: { backgroundColor: colors.primarySoft }, taskTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, taskCopy: { flex: 1, minWidth: 0 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, completedTitle: { color: colors.muted, textDecorationLine: 'line-through' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end', alignItems: 'center', padding: 14 }, sheet: { width: '100%', maxWidth: 520, maxHeight: '82%', borderRadius: radius.large, backgroundColor: colors.card, padding: 16, gap: 10, ...shadow }, sheetTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' }, close: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, backlogRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line },
});
