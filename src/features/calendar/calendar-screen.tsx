import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { addDays, dateKey, formatShortDate, formatTime, localDateToDate, minutesOfDay, startOfWeek } from '@/core/date-utils';
import { selectCalendarEntriesForDate, selectFirstAvailableSlot } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { categoryLabels, type CalendarTaskEntry, type CalendarViewMode, type LocalDate, type TaskItem } from '@/core/types';
import { colors, radius } from '../shared/theme';
import { ActionButton, Card, Chip, EmptyState, Page, PageHeader, SectionHeader, SegmentedControl, textStyles } from '../shared/ui';
import { ScheduleTaskModal } from './schedule-task-modal';

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const pixelsPerMinute = 0.8;

function monthCells(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  return Array.from({ length: 42 }, (_, index) => addDays(first, index - first.getDay()));
}

function entryMeta(entry: CalendarTaskEntry): string {
  const category = categoryLabels[entry.task.category];
  const plannedRange = `${formatTime(entry.plannedStartAt)}${entry.plannedEndAt ? `–${formatTime(entry.plannedEndAt)}` : ''}`;
  if (entry.kind === 'plannedCompleted') return `计划 ${plannedRange} · ${formatTime(entry.completedAt)} 实际完成 · ${category}`;
  if (entry.kind === 'completed') return `${formatTime(entry.completedAt)} 实际完成${entry.task.plannedDate ? ` · 原计划 ${entry.task.plannedDate}` : ''} · ${category}`;
  if (entry.kind === 'unscheduled') return `未排期 · ${entry.task.plannedDate} · ${category}`;
  return `${entry.task.status === 'completed' ? '原计划' : '计划'} ${plannedRange}${entry.task.completedAt ? ` · 实际完成 ${formatShortDate(entry.task.completedAt)}` : ''} · ${category}`;
}

function entryChip(entry: CalendarTaskEntry): { label: string; tone: 'primary' | 'green' | 'orange' } {
  if (entry.kind === 'completed') return { label: '实际完成', tone: 'green' };
  if (entry.kind === 'plannedCompleted') return { label: '已完成', tone: 'green' };
  if (entry.kind === 'unscheduled') return { label: '未排期', tone: 'orange' };
  return { label: entry.task.status === 'completed' ? '原计划' : entry.task.status === 'inProgress' ? '进行中' : '未开始', tone: entry.task.status === 'inProgress' ? 'green' : 'primary' };
}

function TimeGrid({ dates, data, selected, onSelectDate, onTaskPress }: { dates: LocalDate[]; data: ReturnType<typeof useReflowStore>['data']; selected: LocalDate; onSelectDate: (date: LocalDate) => void; onTaskPress: (task: TaskItem) => void }) {
  const entriesByDate = dates.map((date) => selectCalendarEntriesForDate(data, date).filter((entry) => entry.plannedStartAt && entry.plannedEndAt));
  const allEntries = entriesByDate.flat();
  const earliest = allEntries.reduce((value, entry) => Math.min(value, minutesOfDay(entry.plannedStartAt!)), 7 * 60);
  const latest = allEntries.reduce((value, entry) => Math.max(value, minutesOfDay(entry.plannedEndAt!)), 23 * 60);
  const startMinute = Math.floor(earliest / 60) * 60;
  const endMinute = Math.min(24 * 60, Math.ceil(latest / 60) * 60);
  const hours = Array.from({ length: (endMinute - startMinute) / 60 + 1 }, (_, index) => startMinute / 60 + index);
  const gridHeight = (endMinute - startMinute) * pixelsPerMinute;
  return (
    <Card style={styles.gridCard}>
      <Text style={textStyles.meta}>默认显示 07:00–23:00；如有范围外任务，网格会自动扩展。</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.timelineScroll}>
        <View style={styles.timeAxis}><View style={styles.gridHeaderSpacer} />{hours.slice(0, -1).map((hour) => <Text key={hour} style={[styles.timeLabel, { top: (hour * 60 - startMinute) * pixelsPerMinute + 45 }]}>{String(hour).padStart(2, '0')}:00</Text>)}</View>
        {dates.map((date, dateIndex) => (
          <View key={date} style={[styles.dayColumn, dates.length === 1 && styles.dayColumnWide]}>
            <Pressable onPress={() => onSelectDate(date)} style={[styles.gridHeader, selected === date && styles.gridHeaderActive]}><Text style={[styles.gridHeaderText, selected === date && styles.gridHeaderTextActive]}>{weekdays[localDateToDate(date).getDay()]} · {formatShortDate(date)}</Text></Pressable>
            <View style={[styles.dayGrid, { height: gridHeight }]}>
              {hours.map((hour) => <View key={hour} style={[styles.hourLine, { top: (hour * 60 - startMinute) * pixelsPerMinute }]} />)}
              {entriesByDate[dateIndex].map((entry) => {
                const top = (minutesOfDay(entry.plannedStartAt!) - startMinute) * pixelsPerMinute;
                const height = Math.max(30, (minutesOfDay(entry.plannedEndAt!) - minutesOfDay(entry.plannedStartAt!)) * pixelsPerMinute);
                return <Pressable key={entry.task.id} testID={`calendar-grid-${entry.task.id}`} accessibilityLabel={`调整 ${entry.task.title}`} onPress={() => onTaskPress(entry.task)} style={[styles.timeBlock, entry.task.status === 'completed' && styles.timeBlockDone, { top, height }]}><Text numberOfLines={2} style={styles.timeBlockTitle}>{entry.task.title}</Text><Text style={styles.timeBlockMeta}>{formatTime(entry.plannedStartAt)}–{formatTime(entry.plannedEndAt)}</Text></Pressable>;
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </Card>
  );
}

export function CalendarScreen() {
  const store = useReflowStore();
  const today = useMemo(() => dateKey(new Date()), []);
  const [mode, setMode] = useState<CalendarViewMode>('month');
  const [selected, setSelected] = useState<LocalDate>(today);
  const [scheduleTask, setScheduleTask] = useState<TaskItem | undefined>();
  const selectedDate = localDateToDate(selected);
  const cells = monthCells(selectedDate);
  const weekDates = Array.from({ length: 7 }, (_, index) => dateKey(addDays(startOfWeek(selectedDate), index)));
  const gridDates = mode === 'day' ? [selected] : weekDates;
  const entries = selectCalendarEntriesForDate(store.data, selected);
  const candidate = store.data.tasks.find((task) => !task.deletedAt && task.status !== 'completed' && task.plannedDate === selected && !task.plannedStartAt && !task.plannedEndAt);
  const suggestion = candidate ? selectFirstAvailableSlot(store.data, selected, Math.min(candidate.estimatedMinutes, 120)) : undefined;

  function acceptSuggestion() {
    if (!candidate || !suggestion) return;
    store.scheduleTask(candidate.id, suggestion.startAt, suggestion.endAt);
  }

  return (
    <>
      <Page testID="screen-calendar">
        <PageHeader title={`${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月`} subtitle="当前计划、未排期与实际完成" right={<SegmentedControl values={[{ value: 'day', label: '日' }, { value: 'week', label: '周' }, { value: 'month', label: '月' }]} selected={mode} onChange={setMode} />} />
        {mode === 'month' ? (
          <Card style={styles.calendarCard}>
            <View style={styles.weekdays}>{weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
            <View style={styles.monthGrid}>{cells.map((date) => { const key = dateKey(date); const isSelected = key === selected; const isToday = key === today; const dim = date.getMonth() !== selectedDate.getMonth(); const count = selectCalendarEntriesForDate(store.data, key).length; return <Pressable key={key} accessibilityLabel={`${formatShortDate(date)}，${count}项任务`} onPress={() => setSelected(key)} style={[styles.day, isSelected && styles.daySelected, isToday && !isSelected && styles.dayToday]}><Text style={[styles.dayText, dim && styles.dayDim, isSelected && styles.dayTextSelected]}>{date.getDate()}</Text>{count ? <View style={[styles.eventDot, isSelected && styles.eventDotSelected]} /> : null}</Pressable>; })}</View>
          </Card>
        ) : <TimeGrid dates={gridDates} data={store.data} selected={selected} onSelectDate={setSelected} onTaskPress={setScheduleTask} />}

        <SectionHeader title={`选中 · ${formatShortDate(selected)}`} meta={`${entries.length} 项`} />
        {entries.length ? entries.map((entry) => { const chip = entryChip(entry); return <Card key={entry.task.id} testID={`calendar-entry-${entry.task.id}`}><View style={styles.taskTop}><View style={styles.taskCopy}><Text style={textStyles.cardTitle}>{entry.task.title}</Text><Text style={textStyles.meta}>{entryMeta(entry)}</Text></View><Chip label={chip.label} tone={chip.tone} /></View>{entry.task.status !== 'completed' ? <View style={styles.actions}><ActionButton testID={`calendar-schedule-${entry.task.id}`} label={entry.task.plannedStartAt ? '调整时间' : '安排时间'} onPress={() => setScheduleTask(entry.task)} />{entry.task.plannedStartAt ? <ActionButton label="取消具体时间" onPress={() => store.unscheduleTask(entry.task.id)} /> : null}</View> : null}</Card>; }) : <EmptyState title="这一天还没有事项" detail="只有 plannedDate 属于这一天的任务和当天实际完成记录会显示在这里。" />}

        <SectionHeader title="规则建议" />
        <Card accent="ai" testID="calendar-suggestion"><Text style={textStyles.cardTitle}>{candidate && suggestion ? `${formatTime(suggestion.startAt)} 有空档，可安排“${candidate.title}”` : '当前没有可安排的未排期任务'}</Text><Text style={textStyles.meta}>{candidate && suggestion ? '建议由本地规则计算，不会自动修改任何任务。' : '可以保留缓冲时间，或先把任务加入选中日期。'}</Text>{candidate && suggestion ? <View style={styles.actions}><ActionButton testID="accept-calendar-suggestion" label="采用这个时间" variant="orange" onPress={acceptSuggestion} /><ActionButton label="手动安排" onPress={() => setScheduleTask(candidate)} /></View> : null}</Card>
      </Page>
      {scheduleTask ? <ScheduleTaskModal key={scheduleTask.id} task={scheduleTask} initialDate={selected} visible onClose={() => setScheduleTask(undefined)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  calendarCard: { padding: 10 }, weekdays: { flexDirection: 'row' }, weekday: { width: '14.285%', color: colors.muted, fontSize: 10, textAlign: 'center', fontWeight: '800', paddingVertical: 5 }, monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.285%', height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 3 }, daySelected: { backgroundColor: colors.primary }, dayToday: { backgroundColor: colors.primarySoft }, dayText: { color: colors.ink, fontSize: 13, fontWeight: '800' }, dayTextSelected: { color: '#FFFFFF' }, dayDim: { color: '#B2B9C5' }, eventDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.green }, eventDotSelected: { backgroundColor: '#FFFFFF' },
  taskTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, taskCopy: { flex: 1 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gridCard: { paddingHorizontal: 8, overflow: 'hidden' }, timelineScroll: { alignItems: 'flex-start' }, timeAxis: { width: 50, position: 'relative' }, gridHeaderSpacer: { height: 45 }, timeLabel: { position: 'absolute', right: 6, color: colors.muted, fontSize: 9, fontWeight: '700' }, dayColumn: { width: 150, borderLeftWidth: 1, borderLeftColor: colors.line }, dayColumnWide: { width: 310 }, gridHeader: { height: 45, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, gridHeaderActive: { backgroundColor: colors.primarySoft }, gridHeaderText: { color: colors.muted, fontSize: 11, fontWeight: '800' }, gridHeaderTextActive: { color: colors.primary }, dayGrid: { position: 'relative', backgroundColor: '#FBFCFE' }, hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.line },
  timeBlock: { position: 'absolute', left: 5, right: 5, minHeight: 30, borderRadius: radius.small, padding: 6, backgroundColor: colors.primarySoft, borderLeftWidth: 3, borderLeftColor: colors.primary, overflow: 'hidden' }, timeBlockDone: { backgroundColor: colors.greenSoft, borderLeftColor: colors.green }, timeBlockTitle: { color: colors.ink, fontSize: 10, lineHeight: 13, fontWeight: '900' }, timeBlockMeta: { color: colors.muted, fontSize: 8, marginTop: 2 },
});
