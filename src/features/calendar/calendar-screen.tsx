import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays, addMinutes, atTime, dateKey, formatShortDate, formatTime, startOfWeek } from '@/core/date-utils';
import { selectTasksForDate } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { categoryLabels, type CalendarViewMode } from '@/core/types';
import { colors, radius } from '../shared/theme';
import { ActionButton, Card, Chip, EmptyState, Page, PageHeader, SectionHeader, SegmentedControl, textStyles } from '../shared/ui';

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

function monthCells(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  return Array.from({ length: 42 }, (_, index) => addDays(first, index - first.getDay()));
}

export function CalendarScreen() {
  const { data, scheduleTask } = useReflowStore();
  const today = useMemo(() => new Date(), []);
  const [mode, setMode] = useState<CalendarViewMode>('month');
  const [selected, setSelected] = useState(dateKey(today));
  const selectedDate = new Date(`${selected}T00:00:00`);
  const cells = monthCells(selectedDate);
  const week = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(selectedDate), index));
  const scheduled = selectTasksForDate(data, selected);
  const candidate = data.tasks.find((task) => task.status !== 'completed' && (!task.plannedStartAt || dateKey(task.plannedStartAt) !== selected));

  function acceptSuggestion() {
    if (!candidate) return;
    const start = atTime(selectedDate, 16);
    scheduleTask(candidate.id, start.toISOString(), addMinutes(start, Math.min(candidate.estimatedMinutes, 60)).toISOString());
  }

  return (
    <Page testID="screen-calendar">
      <PageHeader title={`${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月`} subtitle="计划、空档和 AI 建议" right={<SegmentedControl values={[{ value: 'day', label: '日' }, { value: 'week', label: '周' }, { value: 'month', label: '月' }]} selected={mode} onChange={setMode} />} />
      {mode === 'month' ? (
        <Card style={styles.calendarCard}>
          <View style={styles.weekdays}>{weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
          <View style={styles.grid}>{cells.map((date) => { const key = dateKey(date); const isSelected = key === selected; const isToday = key === dateKey(today); const dim = date.getMonth() !== selectedDate.getMonth(); const count = selectTasksForDate(data, key).length; return <Pressable key={key} accessibilityLabel={`${formatShortDate(date)}，${count}项任务`} onPress={() => setSelected(key)} style={[styles.day, isSelected && styles.daySelected, isToday && !isSelected && styles.dayToday]}><Text style={[styles.dayText, dim && styles.dayDim, isSelected && styles.dayTextSelected]}>{date.getDate()}</Text>{count ? <View style={[styles.eventDot, isSelected && styles.eventDotSelected]} /> : null}</Pressable>; })}</View>
        </Card>
      ) : mode === 'week' ? (
        <Card><View style={styles.weekStrip}>{week.map((date) => { const key = dateKey(date); const active = key === selected; return <Pressable key={key} onPress={() => setSelected(key)} style={[styles.weekDay, active && styles.weekDayActive]}><Text style={[styles.weekDayLabel, active && styles.dayTextSelected]}>{weekdays[date.getDay()]}</Text><Text style={[styles.weekDayNumber, active && styles.dayTextSelected]}>{date.getDate()}</Text></Pressable>; })}</View><Text style={textStyles.meta}>周视图首版使用日期条，不构建复杂时间网格。</Text></Card>
      ) : (
        <Card><View style={styles.dayFocus}><ActionButton label="前一天" onPress={() => setSelected(dateKey(addDays(selectedDate, -1)))} /><View><Text style={styles.dayFocusTitle}>{formatShortDate(selectedDate)}</Text><Text style={styles.dayFocusMeta}>{scheduled.length} 项已计划任务</Text></View><ActionButton label="后一天" onPress={() => setSelected(dateKey(addDays(selectedDate, 1)))} /></View></Card>
      )}

      <SectionHeader title={`选中 · ${formatShortDate(selectedDate)}`} meta={`${scheduled.length} 项`} />
      {scheduled.length ? scheduled.map((task) => <Card key={task.id}><View style={styles.taskTop}><View style={styles.taskCopy}><Text style={textStyles.cardTitle}>{task.title}</Text><Text style={textStyles.meta}>{formatTime(task.plannedStartAt)}–{formatTime(task.plannedEndAt)} · {categoryLabels[task.category]}</Text></View><Chip label={task.status === 'completed' ? '已完成' : task.status === 'inProgress' ? '进行中' : '未开始'} tone={task.status === 'inProgress' ? 'green' : 'primary'} /></View></Card>) : <EmptyState title="这一天还没有任务" detail="可以接受下方空档建议，或通过全局“+”捕捉新事项。" />}

      <SectionHeader title="空档建议" />
      <Card accent="ai" testID="calendar-suggestion">
        <Text style={textStyles.cardTitle}>{candidate ? `16:00 有空档，适合安排“${candidate.title}”` : '今天的待办都已安排'}</Text>
        <Text style={textStyles.meta}>{candidate ? `建议预留 ${Math.min(candidate.estimatedMinutes, 60)} 分钟，不影响当前固定任务。` : '可以保留缓冲时间，不需要继续塞入任务。'}</Text>
        {candidate ? <View style={styles.actions}><ActionButton testID="accept-calendar-suggestion" label="放入日历" variant="orange" onPress={acceptSuggestion} /><ActionButton label="查看影响" onPress={() => undefined} /></View> : null}
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  calendarCard: { padding: 10 }, weekdays: { flexDirection: 'row' }, weekday: { width: '14.285%', color: colors.muted, fontSize: 10, textAlign: 'center', fontWeight: '800', paddingVertical: 5 }, grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.285%', height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 3 }, daySelected: { backgroundColor: colors.primary }, dayToday: { backgroundColor: colors.primarySoft }, dayText: { color: colors.ink, fontSize: 13, fontWeight: '800' }, dayTextSelected: { color: '#FFFFFF' }, dayDim: { color: '#B2B9C5' }, eventDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.green }, eventDotSelected: { backgroundColor: '#FFFFFF' },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', gap: 3 }, weekDay: { flex: 1, minHeight: 60, borderRadius: radius.medium, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 4 }, weekDayActive: { backgroundColor: colors.primary }, weekDayLabel: { color: colors.muted, fontSize: 9, fontWeight: '800' }, weekDayNumber: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  dayFocus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, dayFocusTitle: { color: colors.ink, fontSize: 19, fontWeight: '900', textAlign: 'center' }, dayFocusMeta: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 3 },
  taskTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, taskCopy: { flex: 1 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
