import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays, dateKey, formatShortDate, localDateToDate } from '@/core/date-utils';
import type { LocalDate } from '@/core/types';
import { colors, radius } from './theme';
import { ActionButton, ModalSurface } from './ui';

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

function firstDayOfMonth(date: LocalDate): Date {
  const value = localDateToDate(date);
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function moveMonth(anchor: Date, amount: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth() + amount, 1);
}

function monthCells(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  return Array.from({ length: 42 }, (_, index) => addDays(first, index - first.getDay()));
}

export function LocalDatePicker({ value, onSelect, onClose }: { value?: LocalDate; onSelect: (date: LocalDate) => void; onClose: () => void }) {
  const today = dateKey(new Date());
  const [month, setMonth] = useState(() => firstDayOfMonth(value ?? today));
  const cells = monthCells(month);

  return (
    <ModalSurface visible title="选择计划日期" subtitle={value ? `当前选择：${formatShortDate(value)}` : '尚未选择日期'} onClose={onClose} testID="proposal-date-picker">
      <View style={styles.monthHeader}>
        <ActionButton testID="proposal-date-previous-month" label="上个月" onPress={() => setMonth((current) => moveMonth(current, -1))} />
        <Text style={styles.monthTitle}>{month.getFullYear()}年{month.getMonth() + 1}月</Text>
        <ActionButton testID="proposal-date-next-month" label="下个月" onPress={() => setMonth((current) => moveMonth(current, 1))} />
      </View>
      <View style={styles.weekdays}>{weekdays.map((weekday) => <Text key={weekday} style={styles.weekday}>{weekday}</Text>)}</View>
      <View style={styles.grid}>
        {cells.map((date) => {
          const key = dateKey(date);
          const selected = key === value;
          const isToday = key === today;
          const dim = date.getMonth() !== month.getMonth();
          return (
            <Pressable key={key} testID={`proposal-date-option-${key}`} accessibilityRole="button" accessibilityLabel={`选择 ${formatShortDate(key)}`} accessibilityState={{ selected }} onPress={() => onSelect(key)} style={({ pressed }) => [styles.day, selected && styles.daySelected, isToday && !selected && styles.dayToday, pressed && styles.dayPressed]}>
              <Text style={[styles.dayText, dim && styles.dayDim, selected && styles.dayTextSelected]}>{date.getDate()}</Text>
            </Pressable>
          );
        })}
      </View>
      <ActionButton testID="proposal-date-today" label={`今天 · ${formatShortDate(today)}`} onPress={() => onSelect(today)} />
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  monthTitle: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '900', textAlign: 'center' },
  weekdays: { flexDirection: 'row', marginTop: 8 },
  weekday: { width: '14.285%', color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 4 },
  day: { width: '14.285%', height: 44, borderRadius: radius.small, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: colors.primary }, dayToday: { backgroundColor: colors.primarySoft }, dayPressed: { opacity: 0.72 },
  dayText: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '800' }, dayDim: { color: colors.subtle }, dayTextSelected: { color: colors.card },
});
