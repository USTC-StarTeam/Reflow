import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatShortDate } from '@/core/date-utils';
import type { NeedsAttentionItem } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import type { LocalDate } from '@/core/types';
import { LocalDatePicker } from '../shared/local-date-picker';
import { colors, spacing } from '../shared/theme';
import { ActionButton, Card, SectionLabel, textStyles } from '../shared/ui';

type PickerState = { taskId: string; kind: 'plan' | 'followUp'; value?: LocalDate };

function itemLabel(item: NeedsAttentionItem): string {
  if (item.kind === 'overdue') return `原计划 ${formatShortDate(item.task.plannedDate!)}`;
  if (item.kind === 'waitingDue') return `跟进日期 ${formatShortDate(item.task.waitingDetails!.followUpDate)} 已到`;
  return '进行状态已跨日，请确认是否继续';
}

export function NeedsAttentionSection({ items, today, onOpen }: { items: NeedsAttentionItem[]; today: LocalDate; onOpen: (taskId: string) => void }) {
  const store = useReflowStore();
  const router = useRouter();
  const [picker, setPicker] = useState<PickerState>();
  if (!items.length) return null;

  function selectDate(date: LocalDate) {
    if (!picker) return;
    if (picker.kind === 'followUp') store.updateWaitingFollowUp(picker.taskId, date);
    else store.planTaskForDate(picker.taskId, date);
    setPicker(undefined);
  }

  return (
    <View testID="needs-attention" style={styles.section}>
      <SectionLabel title="需要处理" meta={`${items.length} 项`} />
      {items.map((item) => (
        <Card key={`${item.kind}-${item.task.id}`} testID={`attention-${item.kind}-${item.task.id}`} style={styles.card}>
          <View style={styles.copy}>
            <Text style={textStyles.cardTitle}>{item.task.title}</Text>
            <Text style={styles.meta}>{itemLabel(item)}</Text>
          </View>
          <View style={styles.actions}>
            {item.kind === 'overdue' ? (
              <>
                <ActionButton testID={`attention-today-${item.task.id}`} label="安排到今天" variant="primary" onPress={() => store.planTaskForDate(item.task.id, today)} />
                <ActionButton testID={`attention-date-${item.task.id}`} label="改到其他日期" onPress={() => setPicker({ taskId: item.task.id, kind: 'plan', value: item.task.plannedDate })} />
                <ActionButton testID={`attention-someday-${item.task.id}`} label="移到稍后" onPress={() => store.deferTask(item.task.id, { bucket: 'someday' })} />
              </>
            ) : null}
            {item.kind === 'waitingDue' ? (
              <>
                <ActionButton testID={`attention-continue-${item.task.id}`} label="继续处理" variant="primary" onPress={() => onOpen(item.task.id)} />
                <ActionButton testID={`attention-follow-up-${item.task.id}`} label="调整跟进日期" onPress={() => setPicker({ taskId: item.task.id, kind: 'followUp', value: item.task.waitingDetails?.followUpDate })} />
                <ActionButton testID={`attention-regular-${item.task.id}`} label="转回普通任务" onPress={() => store.moveTask(item.task.id, 'today')} />
              </>
            ) : null}
            {item.kind === 'crossDayActive' ? (
              <>
                <ActionButton testID={`attention-active-${item.task.id}`} label="前往进行中" variant="green" onPress={() => router.push('/active')} />
                <ActionButton testID={`attention-pause-today-${item.task.id}`} label="暂停并安排今天" onPress={() => { store.pauseTask(item.task.id); store.planTaskForDate(item.task.id, today); }} />
              </>
            ) : null}
          </View>
        </Card>
      ))}
      {picker ? <LocalDatePicker value={picker.value} onClose={() => setPicker(undefined)} onSelect={selectDate} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  card: { padding: spacing.lg, gap: spacing.md },
  copy: { gap: spacing.xxs },
  meta: { color: colors.orange, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
