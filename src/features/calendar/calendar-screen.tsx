import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays, compareLocalDates, dateKey, formatShortDate, formatTime, localDateToDate, minutesOfDay, startOfWeek } from '@/core/date-utils';
import { isTaskDelayed, selectCalendarEntriesForDate, selectCurrentExecutionSession, selectFirstAvailableSlot } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import type { CalendarTaskEntry, CalendarViewMode, DomainData, LocalDate, TaskItem } from '@/core/types';
import { colors, radius, shadows, spacing, typography } from '../shared/theme';
import { ActionButton, Card, EmptyState, Page, PageHeader, SectionHeader, textStyles } from '../shared/ui';
import { useCurrentTime } from '../shared/use-current-time';
import { ScheduleTaskModal } from './schedule-task-modal';

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const modes: { value: CalendarViewMode; label: string }[] = [
  { value: 'month', label: '月' },
  { value: 'week', label: '周' },
  { value: 'day', label: '日' },
];
const pixelsPerMinute = 0.8;

function monthCells(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  return Array.from({ length: 42 }, (_, index) => addDays(first, index - first.getDay()));
}

function moveMonth(date: LocalDate, amount: number): LocalDate {
  const current = localDateToDate(date);
  const target = new Date(current.getFullYear(), current.getMonth() + amount, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(current.getDate(), lastDay));
  return dateKey(target);
}

function taskSections(entries: CalendarTaskEntry[]) {
  const completed = entries.filter((entry) => entry.task.status === 'completed' || entry.kind === 'completed' || entry.kind === 'plannedCompleted');
  const completedIds = new Set(completed.map((entry) => entry.task.id));
  const scheduled = entries.filter((entry) => !completedIds.has(entry.task.id) && entry.plannedStartAt && entry.plannedEndAt);
  const dateOnly = entries.filter((entry) => !completedIds.has(entry.task.id) && (!entry.plannedStartAt || !entry.plannedEndAt));
  return { scheduled, dateOnly, completed };
}

function executionStatus(data: DomainData, task: TaskItem, now: Date): string | undefined {
  if (task.status === 'inProgress') {
    const session = selectCurrentExecutionSession(data, task.id);
    return session ? `进行中 · ${formatTime(session.startedAt)} ${session.resumed ? '继续' : '开始'}` : '进行中';
  }
  return isTaskDelayed(task, now) ? '已延迟 · 未开始' : undefined;
}

function CompactModeSwitch({ selected, onChange }: { selected: CalendarViewMode; onChange: (mode: CalendarViewMode) => void }) {
  return (
    <View style={styles.modeSwitch}>
      {modes.map((mode) => (
        <Pressable
          key={mode.value}
          testID={`calendar-mode-${mode.value}`}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === mode.value }}
          onPress={() => onChange(mode.value)}
          style={[styles.modeButton, selected === mode.value && styles.modeButtonSelected]}
        >
          <Text style={[styles.modeText, selected === mode.value && styles.modeTextSelected]}>{mode.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PeriodNavigation({ mode, selected, today, onChange }: { mode: CalendarViewMode; selected: LocalDate; today: LocalDate; onChange: (date: LocalDate) => void }) {
  const date = localDateToDate(selected);
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);
  const title = mode === 'month'
    ? `${date.getFullYear()}年${date.getMonth() + 1}月`
    : mode === 'week'
      ? `${formatShortDate(weekStart)}–${formatShortDate(weekEnd)}`
      : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  const move = (amount: number) => onChange(mode === 'month' ? moveMonth(selected, amount) : dateKey(addDays(date, amount * (mode === 'week' ? 7 : 1))));

  return (
    <View style={styles.periodNavigation}>
      <Pressable accessibilityLabel="上一个时间范围" onPress={() => move(-1)} style={styles.periodArrow}><Text style={styles.periodArrowText}>‹</Text></Pressable>
      <Text style={styles.periodTitle}>{title}</Text>
      {selected !== today ? <Pressable accessibilityLabel="回到今天" onPress={() => onChange(today)} style={styles.todayButton}><Text style={styles.todayButtonText}>今天</Text></Pressable> : null}
      <Pressable accessibilityLabel="下一个时间范围" onPress={() => move(1)} style={styles.periodArrow}><Text style={styles.periodArrowText}>›</Text></Pressable>
    </View>
  );
}

function MonthOverview({ selected, today, data, onSelect }: { selected: LocalDate; today: LocalDate; data: DomainData; onSelect: (date: LocalDate) => void }) {
  const selectedDate = localDateToDate(selected);
  const cells = monthCells(selectedDate);
  return (
    <Card style={styles.monthCard}>
      <View style={styles.weekdays}>{weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
      <View style={styles.monthGrid}>
        {cells.map((date) => {
          const key = dateKey(date);
          const isSelected = key === selected;
          const isToday = key === today;
          const dim = date.getMonth() !== selectedDate.getMonth();
          const entries = selectCalendarEntriesForDate(data, key);
          const markerCount = Math.min(3, entries.length);
          return (
            <Pressable
              key={key}
              testID={`calendar-day-${key}`}
              accessibilityRole="button"
              accessibilityLabel={`${formatShortDate(date)}，${entries.length}项`}
              onPress={() => onSelect(key)}
              style={[styles.day, isSelected && styles.daySelected, isToday && !isSelected && styles.dayToday]}
            >
              <Text style={[styles.dayText, dim && styles.dayDim, isSelected && styles.dayTextSelected]}>{date.getDate()}</Text>
              <View style={styles.markers}>{Array.from({ length: markerCount }, (_, index) => <View key={index} style={[styles.eventDot, isSelected && styles.eventDotSelected]} />)}</View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function WeekOverview({ selected, data, onSelect }: { selected: LocalDate; data: DomainData; onSelect: (date: LocalDate) => void }) {
  const dates = Array.from({ length: 7 }, (_, index) => dateKey(addDays(startOfWeek(localDateToDate(selected)), index)));
  const loads = dates.map((date) => {
    const sections = taskSections(selectCalendarEntriesForDate(data, date));
    return { date, total: sections.scheduled.length + sections.dateOnly.length, scheduled: sections.scheduled.length, dateOnly: sections.dateOnly.length };
  });
  const maxLoad = Math.max(1, ...loads.map((load) => load.total));

  return (
    <Card testID="calendar-week-overview" style={styles.weekCard}>
      <Text style={textStyles.meta}>查看这一周的任务分布，点击某一天继续规划。</Text>
      {loads.map((load) => {
        const date = localDateToDate(load.date);
        const isSelected = load.date === selected;
        return (
          <Pressable key={load.date} testID={`calendar-week-day-${load.date}`} onPress={() => onSelect(load.date)} style={[styles.weekRow, isSelected && styles.weekRowSelected]}>
            <View style={styles.weekDate}><Text style={[styles.weekdayName, isSelected && styles.weekdayNameSelected]}>{weekdays[date.getDay()]}</Text><Text style={styles.weekDateText}>{date.getMonth() + 1}/{date.getDate()}</Text></View>
            <View style={styles.loadTrack}><View style={[styles.loadFill, { width: `${Math.max(load.total ? 12 : 0, (load.total / maxLoad) * 100)}%` }]} /></View>
            <Text style={styles.loadMeta}>{load.total ? `${load.total} 项` : '空'}</Text>
            <View style={styles.loadBreakdown}><Text style={styles.loadBreakdownText}>{load.scheduled ? `${load.scheduled} 定时` : ''}{load.scheduled && load.dateOnly ? ' · ' : ''}{load.dateOnly ? `${load.dateOnly} 当天` : ''}</Text></View>
          </Pressable>
        );
      })}
    </Card>
  );
}

function TimeGrid({ date, data, now, readOnly, onTaskPress, onUnschedule }: { date: LocalDate; data: DomainData; now: Date; readOnly: boolean; onTaskPress: (task: TaskItem) => void; onUnschedule: (taskId: string) => void }) {
  const entries = taskSections(selectCalendarEntriesForDate(data, date)).scheduled;
  const earliest = entries.reduce((value, entry) => Math.min(value, minutesOfDay(entry.plannedStartAt!)), 7 * 60);
  const latest = entries.reduce((value, entry) => Math.max(value, minutesOfDay(entry.plannedEndAt!)), 23 * 60);
  const startMinute = Math.floor(earliest / 60) * 60;
  const endMinute = Math.min(24 * 60, Math.ceil(latest / 60) * 60);
  const hours = Array.from({ length: (endMinute - startMinute) / 60 + 1 }, (_, index) => startMinute / 60 + index);
  const gridHeight = (endMinute - startMinute) * pixelsPerMinute;

  return (
    <Card testID="calendar-day-grid" style={styles.gridCard}>
      <View style={styles.dayGridShell}>
        <View style={styles.timeAxis}>{hours.slice(0, -1).map((hour) => <Text key={hour} style={[styles.timeLabel, { top: (hour * 60 - startMinute) * pixelsPerMinute - 6 }]}>{String(hour).padStart(2, '0')}:00</Text>)}</View>
        <View style={[styles.dayGrid, { height: gridHeight }]}>
          {hours.map((hour) => <View key={hour} style={[styles.hourLine, { top: (hour * 60 - startMinute) * pixelsPerMinute }]} />)}
          {entries.map((entry) => {
            const top = (minutesOfDay(entry.plannedStartAt!) - startMinute) * pixelsPerMinute;
            const height = Math.max(34, (minutesOfDay(entry.plannedEndAt!) - minutesOfDay(entry.plannedStartAt!)) * pixelsPerMinute);
            const status = executionStatus(data, entry.task, now);
            const compactStatus = entry.task.status === 'inProgress' ? '进行中' : status ? '已延迟' : undefined;
            const content = <><Text style={styles.timeBlockMeta}>{formatTime(entry.plannedStartAt)}–{formatTime(entry.plannedEndAt)}{compactStatus ? ` · ${compactStatus}` : ''}</Text><Text numberOfLines={2} style={styles.timeBlockTitle}>{entry.task.title}</Text></>;
            return (
              <View key={entry.task.id} testID={`calendar-grid-${entry.task.id}`} style={[styles.timeBlock, { top, height }]}>
                {readOnly ? <View style={styles.timeBlockMain}>{content}</View> : <Pressable accessibilityLabel={`调整 ${entry.task.title}`} onPress={() => onTaskPress(entry.task)} style={styles.timeBlockMain}>{content}</Pressable>}
                {!readOnly ? <Pressable testID={`calendar-grid-unschedule-${entry.task.id}`} accessibilityLabel={`取消具体时间 ${entry.task.title}`} onPress={() => onUnschedule(entry.task.id)} style={styles.timeBlockAction}><Text style={styles.timeBlockActionText}>×</Text></Pressable> : null}
              </View>
            );
          })}
        </View>
      </View>
    </Card>
  );
}

function TaskRows({ entries, kind, data, now, readOnly = false, onSchedule, onUnschedule }: { entries: CalendarTaskEntry[]; kind: 'scheduled' | 'dateOnly' | 'completed'; data: DomainData; now: Date; readOnly?: boolean; onSchedule: (task: TaskItem) => void; onUnschedule: (taskId: string) => void }) {
  return (
    <Card style={styles.listCard}>
      {entries.map((entry, index) => {
        const status = kind === 'completed' ? undefined : executionStatus(data, entry.task, now);
        const content = <><Text numberOfLines={1} style={[styles.taskTitle, kind === 'completed' && styles.taskTitleDone]}>{entry.task.title}</Text>{kind === 'dateOnly' && entry.task.estimatedMinutes ? <Text style={styles.taskMeta}>预计 {entry.task.estimatedMinutes} 分</Text> : null}{status ? <Text style={[styles.executionStatus, entry.task.status !== 'inProgress' && styles.delayedStatus]}>{status}</Text> : null}</>;
        return (
        <View key={entry.task.id} testID={`calendar-entry-${entry.task.id}`} style={[styles.taskRow, index > 0 && styles.taskRowBorder, kind === 'completed' && styles.completedRow]}>
          {kind === 'scheduled' ? <View style={styles.taskDot} /> : kind === 'completed' ? <View style={styles.completedDot}><Text style={styles.completedDotText}>✓</Text></View> : <View style={styles.dateOnlyDot} />}
          {readOnly || kind === 'completed' ? <View style={styles.taskMain}>{content}</View> : <Pressable accessibilityLabel={`${kind === 'scheduled' ? '调整' : '安排'} ${entry.task.title}`} onPress={() => onSchedule(entry.task)} style={styles.taskMain}>{content}</Pressable>}
          {kind === 'scheduled' ? <Text style={styles.taskTime}>{formatTime(entry.plannedStartAt)}–{formatTime(entry.plannedEndAt)}</Text> : null}
          {kind === 'dateOnly' && !readOnly ? <Pressable accessibilityLabel={`安排时间 ${entry.task.title}`} onPress={() => onSchedule(entry.task)} style={styles.rowAction}><Text style={styles.rowActionText}>›</Text></Pressable> : null}
          {kind === 'scheduled' && !readOnly ? <Pressable testID={`calendar-unschedule-${entry.task.id}`} accessibilityLabel={`取消具体时间 ${entry.task.title}`} onPress={() => onUnschedule(entry.task.id)} style={styles.unscheduleAction}><Text style={styles.unscheduleText}>取消时间</Text></Pressable> : null}
        </View>
        );
      })}
    </Card>
  );
}

function SelectedDateContent({ data, selected, now, showScheduled, onSchedule, onUnschedule, onAcceptSuggestion }: { data: DomainData; selected: LocalDate; now: Date; showScheduled: boolean; onSchedule: (task: TaskItem) => void; onUnschedule: (taskId: string) => void; onAcceptSuggestion: (task: TaskItem, startAt: string, endAt: string) => void }) {
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const entries = selectCalendarEntriesForDate(data, selected);
  const sections = taskSections(entries);
  const candidate = sections.dateOnly[0]?.task;
  const isPast = compareLocalDates(selected, dateKey(now)) < 0;
  const suggestion = candidate ? selectFirstAvailableSlot(data, selected, Math.min(candidate.estimatedMinutes, 120), 7, 23, now) : undefined;
  const hasTasks = sections.scheduled.length || sections.dateOnly.length || sections.completed.length;
  const completedEntries = [...sections.completed].reverse();
  const visibleCompletedEntries = showAllCompleted ? completedEntries : completedEntries.slice(0, 3);

  return (
    <>
      <SectionHeader title={`选中 · ${formatShortDate(selected)}`} meta={`${entries.length} 项`} />
      {!hasTasks ? <EmptyState title="这一天还没有事项" detail="选择其他日期，或先为任务设置计划日期。" /> : null}
      {showScheduled && sections.scheduled.length ? <><SectionHeader title="时间安排" meta={`${sections.scheduled.length} 项`} /><TaskRows entries={sections.scheduled} kind="scheduled" data={data} now={now} readOnly={isPast} onSchedule={onSchedule} onUnschedule={onUnschedule} /></> : null}
      {sections.dateOnly.length ? <><SectionHeader title="当天事项" meta={`${sections.dateOnly.length} 项`} /><TaskRows entries={sections.dateOnly} kind="dateOnly" data={data} now={now} readOnly={isPast} onSchedule={onSchedule} onUnschedule={onUnschedule} /></> : null}
      {!isPast && candidate ? <><SectionHeader title="可用时间" /><Card testID="calendar-suggestion"><Text style={textStyles.cardTitle}>{suggestion ? `${formatTime(suggestion.startAt)} 有空档，可安排“${candidate.title}”` : '当天工作时间内暂时没有足够空档'}</Text><Text style={textStyles.meta}>{suggestion ? '采用后才会写入计划，你也可以手动选择其他时间。' : '可以调整已有安排，或保留为当天事项。'}</Text>{suggestion ? <View style={styles.suggestionActions}><ActionButton testID="accept-calendar-suggestion" label="采用这个时间" variant="orange" onPress={() => onAcceptSuggestion(candidate, suggestion.startAt, suggestion.endAt)} /><ActionButton label="手动安排" onPress={() => onSchedule(candidate)} /></View> : null}</Card></> : null}
      {visibleCompletedEntries.length ? <><SectionHeader title="已完成" meta={`${sections.completed.length} 项`} /><TaskRows entries={visibleCompletedEntries} kind="completed" data={data} now={now} onSchedule={onSchedule} onUnschedule={onUnschedule} />{completedEntries.length > 3 ? <ActionButton testID="toggle-calendar-completed" label={showAllCompleted ? '收起已完成' : `查看全部 ${completedEntries.length} 项`} onPress={() => setShowAllCompleted((current) => !current)} /> : null}</> : null}
    </>
  );
}

export function CalendarScreen() {
  const store = useReflowStore();
  const now = useCurrentTime();
  const today = dateKey(now);
  const [mode, setMode] = useState<CalendarViewMode>('month');
  const [selected, setSelected] = useState<LocalDate>(today);
  const [scheduleTask, setScheduleTask] = useState<TaskItem | undefined>();
  const previousToday = useRef(today);

  useEffect(() => {
    const previous = previousToday.current;
    if (previous === today) return;
    setSelected((current) => current === previous ? today : current);
    previousToday.current = today;
  }, [today]);

  return (
    <>
      <Page testID="screen-calendar">
        <PageHeader title="日历" subtitle="多尺度规划" right={<CompactModeSwitch selected={mode} onChange={setMode} />} />
        <PeriodNavigation mode={mode} selected={selected} today={today} onChange={setSelected} />
        {mode === 'month' ? <MonthOverview selected={selected} today={today} data={store.data} onSelect={setSelected} /> : null}
        {mode === 'week' ? <WeekOverview selected={selected} data={store.data} onSelect={setSelected} /> : null}
        {mode === 'day' ? <TimeGrid date={selected} data={store.data} now={now} readOnly={compareLocalDates(selected, today) < 0} onTaskPress={setScheduleTask} onUnschedule={store.unscheduleTask} /> : null}
        <SelectedDateContent
          key={selected}
          data={store.data}
          selected={selected}
          now={now}
          showScheduled={mode !== 'day'}
          onSchedule={setScheduleTask}
          onUnschedule={store.unscheduleTask}
          onAcceptSuggestion={(task, startAt, endAt) => store.scheduleTask(task.id, startAt, endAt)}
        />
      </Page>
      {scheduleTask ? <ScheduleTaskModal key={scheduleTask.id} task={scheduleTask} initialDate={selected} visible onClose={() => setScheduleTask(undefined)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  modeSwitch: { width: 74, flexDirection: 'row', padding: 2, borderRadius: radius.pill, backgroundColor: '#E9EDF4' },
  modeButton: { flex: 1, minWidth: 0, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  modeButtonSelected: { backgroundColor: colors.card, ...shadows.soft },
  modeText: { color: colors.muted, ...typography.control },
  modeTextSelected: { color: colors.primary },
  periodNavigation: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  periodArrow: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  periodArrowText: { color: colors.ink, fontSize: 28, lineHeight: 30, fontWeight: '400' },
  periodTitle: { flex: 1, color: colors.ink, textAlign: 'center', ...typography.sectionTitle },
  todayButton: { minHeight: 34, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  todayButtonText: { color: colors.muted, ...typography.control },
  monthCard: { width: '100%', padding: spacing.md, overflow: 'hidden' },
  weekdays: { flexDirection: 'row' },
  weekday: { width: '14.285%', color: colors.muted, textAlign: 'center', fontSize: 11, lineHeight: 16, fontWeight: '800', paddingVertical: spacing.sm },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.285%', height: 48, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', gap: 3 },
  daySelected: { backgroundColor: colors.primary },
  dayToday: { backgroundColor: colors.primarySoft },
  dayText: { color: colors.ink, fontSize: 13, lineHeight: 17, fontWeight: '800' },
  dayTextSelected: { color: colors.card },
  dayDim: { color: colors.subtle },
  markers: { height: 4, flexDirection: 'row', gap: 2 },
  eventDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  eventDotSelected: { backgroundColor: colors.card },
  weekCard: { padding: spacing.sm },
  weekRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.small },
  weekRowSelected: { backgroundColor: colors.primarySoft },
  weekDate: { width: 42, alignItems: 'center' },
  weekdayName: { color: colors.ink, ...typography.control },
  weekdayNameSelected: { color: colors.primary },
  weekDateText: { color: colors.muted, ...typography.meta },
  loadTrack: { flex: 1, height: 7, borderRadius: radius.pill, backgroundColor: '#E9EDF4', overflow: 'hidden' },
  loadFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  loadMeta: { width: 35, color: colors.ink, textAlign: 'right', ...typography.meta, fontWeight: '800' },
  loadBreakdown: { width: 70 },
  loadBreakdownText: { color: colors.muted, textAlign: 'right', fontSize: 9, lineHeight: 13 },
  gridCard: { padding: spacing.md, overflow: 'hidden' },
  dayGridShell: { flexDirection: 'row' },
  timeAxis: { width: 48, position: 'relative' },
  timeLabel: { position: 'absolute', right: 8, color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '700' },
  dayGrid: { flex: 1, position: 'relative', backgroundColor: '#FBFCFE', borderLeftWidth: 1, borderLeftColor: colors.line },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.line },
  timeBlock: { position: 'absolute', left: 8, right: 8, minHeight: 34, flexDirection: 'row', backgroundColor: colors.primarySoft, borderRadius: radius.small, borderLeftWidth: 3, borderLeftColor: colors.primary, overflow: 'hidden' },
  timeBlockMain: { flex: 1, minWidth: 0, paddingHorizontal: 9, paddingVertical: 6 },
  timeBlockAction: { width: 34, alignItems: 'center', justifyContent: 'center' },
  timeBlockActionText: { color: colors.primary, fontSize: 18, lineHeight: 20 },
  timeBlockTitle: { color: colors.ink, fontSize: 11, lineHeight: 14, fontWeight: '900' },
  timeBlockMeta: { color: colors.primary, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  listCard: { padding: 0, gap: 0, overflow: 'hidden' },
  taskRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  taskRowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  completedRow: { opacity: 0.58 },
  taskDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.primary },
  dateOnlyDot: { width: 18, height: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.subtle },
  completedDot: { width: 18, height: 18, borderRadius: radius.pill, backgroundColor: colors.subtle, alignItems: 'center', justifyContent: 'center' },
  completedDotText: { color: colors.card, fontSize: 10, fontWeight: '900' },
  taskMain: { flex: 1, minWidth: 0 },
  taskTitle: { color: colors.ink, ...typography.task },
  taskTitleDone: { color: colors.muted, textDecorationLine: 'line-through' },
  taskMeta: { color: colors.primary, ...typography.meta },
  executionStatus: { color: colors.green, fontSize: 9, lineHeight: 13, fontWeight: '800' },
  delayedStatus: { color: colors.orange },
  taskTime: { color: colors.muted, ...typography.meta },
  rowAction: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  rowActionText: { color: colors.subtle, fontSize: 24, lineHeight: 26 },
  unscheduleAction: { minHeight: 34, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  unscheduleText: { color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  suggestionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
