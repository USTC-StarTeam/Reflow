import { StyleSheet, Text, View } from 'react-native';

import { formatShortDate } from '@/core/date-utils';
import { selectPendingProposals } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { categoryLabels, type TaskCategory } from '@/core/types';
import { QuickComposer } from '../shared/quick-composer';
import { ReorderableTaskList } from '../shared/reorderable-task-list';
import { Card, Chip, Page, PageHeader, SectionHeader, textStyles } from '../shared/ui';

const categoryOrder: TaskCategory[] = ['work', 'communication', 'learning', 'life', 'health', 'unknown'];

export function TodayScreen() {
  const { data } = useReflowStore();
  const tasks = data.tasks.filter((task) => task.bucket === 'today').sort((a, b) => a.sortIndex - b.sortIndex);
  const pending = selectPendingProposals(data).length;
  const waiting = data.tasks.filter((task) => task.bucket === 'waiting').length;
  const someday = data.tasks.filter((task) => task.bucket === 'someday').length;

  return (
    <Page testID="screen-today">
      <PageHeader title="今天" subtitle="轻量捕捉与今日重点" right={<Chip label={formatShortDate(new Date())} tone="primary" />} />
      <QuickComposer />
      <View style={styles.summary}>
        <View><Text style={styles.summaryValue}>{tasks.filter((task) => task.status !== 'completed').length}</Text><Text style={styles.summaryLabel}>待完成</Text></View>
        <View style={styles.summaryDivider} />
        <View><Text style={styles.summaryValue}>{pending}</Text><Text style={styles.summaryLabel}>待确认</Text></View>
        <View style={styles.summaryDivider} />
        <View><Text style={styles.summaryValue}>{waiting + someday}</Text><Text style={styles.summaryLabel}>等待/稍后</Text></View>
      </View>
      {categoryOrder.map((category) => {
        const items = tasks.filter((task) => task.category === category);
        if (!items.length) return null;
        return <View key={category} style={styles.group}><SectionHeader title={categoryLabels[category]} meta={`${items.length} 项`} /><ReorderableTaskList tasks={items} /></View>;
      })}
      <SectionHeader title="AI 建议" />
      <Card accent="ai">
        <Text style={textStyles.cardTitle}>报价跟进建议排在当前开发任务之后</Text>
        <Text style={textStyles.meta}>它依赖当前方案中的预算口径说明。先完成手头行动块，可以减少来回切换。</Text>
        <View style={styles.chips}><Chip label="保持当前顺序" tone="orange" /><Chip label="可随时手动调整" /></View>
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  summary: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E7F0' },
  summaryValue: { color: '#18202D', fontSize: 21, lineHeight: 25, textAlign: 'center', fontWeight: '900' },
  summaryLabel: { color: '#788395', fontSize: 10, lineHeight: 14, marginTop: 2, textAlign: 'center', fontWeight: '700' },
  summaryDivider: { width: 1, height: 32, backgroundColor: '#E1E7F0' },
  group: { gap: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
