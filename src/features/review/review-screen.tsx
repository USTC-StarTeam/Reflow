import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { addLocalDays, dateKey } from '@/core/date-utils';
import { deriveDailyReviewFacts, deriveReview } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { categoryLabels, type ReviewPeriod } from '@/core/types';
import { colors, radius } from '../shared/theme';
import { ActionButton, Card, Chip, Page, PageHeader, SectionHeader, SegmentedControl, textStyles } from '../shared/ui';

export function ReviewScreen() {
  const store = useReflowStore();
  const [period, setPeriod] = useState<ReviewPeriod>('daily');
  const today = useMemo(() => dateKey(new Date()), []);
  const review = deriveReview(store.data, period);
  const daily = deriveDailyReviewFacts(store.data, today);
  const maxMinutes = Math.max(1, ...review.categoryMinutes.map((item) => item.minutes));
  const tasksById = new Map(store.data.tasks.map((task) => [task.id, task]));

  return (
    <Page testID="screen-review">
      <PageHeader title="回顾" subtitle="计划历史、实际耗时与明确收尾" right={<Chip label="确定性统计" tone="purple" size="header" />} />
      <SegmentedControl values={[{ value: 'daily', label: '每日' }, { value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }]} selected={period} onChange={setPeriod} />
      <View style={styles.metrics}>
        <Card style={styles.metricCard}><Text style={textStyles.metric}>{period === 'daily' ? daily.plannedCompletionRate : review.completionRate}%</Text><Text style={styles.metricLabel}>计划完成率</Text></Card>
        <Card style={styles.metricCard}><Text style={textStyles.metric}>{period === 'daily' ? daily.actualMinutes : review.actualMinutes}</Text><Text style={styles.metricLabel}>实际分钟</Text></Card>
        <Card style={styles.metricCard}><Text style={textStyles.metric}>{period === 'daily' ? daily.interruptions : review.interruptions}</Text><Text style={styles.metricLabel}>突发打断</Text></Card>
      </View>
      <Card accent="review" testID="review-summary">
        <Text style={textStyles.cardTitle}>{period === 'daily' ? '今日计划结果' : period === 'weekly' ? '本周计划结果' : '本月计划结果'}</Text>
        {period === 'daily' ? <><Text style={styles.reviewHeadline}>原计划 {daily.plannedCount} 项，按计划完成 {daily.completedAsPlannedCount} 项。</Text><Text style={textStyles.meta}>今天共完成 {daily.completedTotalCount} 项，其中额外完成 {daily.extraCompletedCount} 项；未按计划完成 {daily.unfinishedCount} 项，实际记录 {daily.actualMinutes} 分钟。</Text></> : <><Text style={styles.reviewHeadline}>{review.headline}</Text><Text style={textStyles.meta}>{review.suggestion}</Text></>}
      </Card>

      {period === 'daily' ? <><SectionHeader title="今日计划去向" meta={`${daily.taskOutcomes.length} 项`} />{daily.taskOutcomes.map((item) => { const task = tasksById.get(item.taskId); if (!task) return null; const label = item.outcome === 'completedAsPlanned' ? '按计划完成' : item.outcome === 'deferred' ? `顺延到 ${item.deferredTo === 'someday' ? '稍后' : item.deferredTo}` : item.outcome === 'deleted' ? '已删除' : '未完成'; return <Card key={item.taskId} testID={`review-outcome-${item.taskId}`}><View style={styles.outcomeTop}><View style={styles.outcomeCopy}><Text style={textStyles.cardTitle}>{task.title}</Text><Text style={textStyles.meta}>{label}</Text></View><Chip label={label} tone={item.outcome === 'completedAsPlanned' ? 'green' : item.outcome === 'deferred' ? 'orange' : 'neutral'} /></View>{item.outcome === 'unfinished' && !task.deletedAt ? <View style={styles.actions}><ActionButton testID={`defer-tomorrow-${task.id}`} label="移到明天" onPress={() => store.deferTask(task.id, { date: addLocalDays(today, 1) })} /><ActionButton label="保存到稍后" onPress={() => store.deferTask(task.id, { bucket: 'someday' })} /></View> : null}</Card>; })}</> : null}

      <SectionHeader title="时间流向" meta="按 TimeEntry 实际重叠计算" />
      <Card>{review.categoryMinutes.length ? review.categoryMinutes.map((item) => <View key={item.category} style={styles.barRow}><View style={styles.barLabel}><Text style={styles.barName}>{categoryLabels[item.category]}</Text><Text style={styles.barValue}>{item.minutes} 分钟</Text></View><View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(4, Math.round((item.minutes / maxMinutes) * 100))}%` }]} /></View></View>) : <Text style={textStyles.meta}>还没有耗时记录。</Text>}</Card>
      <SectionHeader title="知识沉淀" meta={`${store.data.knowledgeCards.length} 张`} />
      {store.data.knowledgeCards.map((card) => <Card key={card.id}><Text style={textStyles.cardTitle}>{card.title}</Text><Text style={textStyles.meta}>{card.summary}</Text><View style={styles.actions}><Chip label={card.source} tone="purple" /></View></Card>)}
    </Page>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', gap: 8 }, metricCard: { flex: 1, alignItems: 'center', paddingHorizontal: 6, boxShadow: 'none' }, metricLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', textAlign: 'center' }, reviewHeadline: { color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: '800' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  outcomeTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, outcomeCopy: { flex: 1 }, barRow: { gap: 5, marginBottom: 7 }, barLabel: { flexDirection: 'row', justifyContent: 'space-between' }, barName: { color: colors.ink, fontSize: 11, fontWeight: '800' }, barValue: { color: colors.muted, fontSize: 10, fontWeight: '700' }, barTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.purpleSoft, overflow: 'hidden' }, barFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.purple },
});
