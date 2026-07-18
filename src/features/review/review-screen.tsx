import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { deriveReview } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { categoryLabels, type ReviewPeriod } from '@/core/types';
import { colors, radius } from '../shared/theme';
import { ActionButton, Card, Chip, Page, PageHeader, SectionHeader, SegmentedControl, textStyles } from '../shared/ui';

export function ReviewScreen() {
  const { data } = useReflowStore();
  const [period, setPeriod] = useState<ReviewPeriod>('daily');
  const [generated, setGenerated] = useState(false);
  const review = deriveReview(data, period);
  const maxMinutes = Math.max(1, ...review.categoryMinutes.map((item) => item.minutes));

  return (
    <Page testID="screen-review">
      <PageHeader title="回顾" subtitle="复盘、知识与个人模式" right={<Chip label="派生统计" tone="purple" />} />
      <SegmentedControl values={[{ value: 'daily', label: '每晚' }, { value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }]} selected={period} onChange={(value) => { setPeriod(value); setGenerated(false); }} />
      <View style={styles.metrics}>
        <Card style={styles.metricCard}><Text style={textStyles.metric}>{review.completionRate}%</Text><Text style={styles.metricLabel}>完成率</Text></Card>
        <Card style={styles.metricCard}><Text style={textStyles.metric}>{review.actualMinutes}</Text><Text style={styles.metricLabel}>记录分钟</Text></Card>
        <Card style={styles.metricCard}><Text style={textStyles.metric}>{review.interruptions}</Text><Text style={styles.metricLabel}>突发打断</Text></Card>
      </View>
      <Card accent="review" testID="review-summary"><Text style={textStyles.cardTitle}>{generated ? '今晚复盘已生成' : period === 'daily' ? '每晚复盘' : period === 'weekly' ? '每周复盘' : '每月复盘'}</Text><Text style={styles.reviewHeadline}>{review.headline}</Text><Text style={textStyles.meta}>{review.suggestion}</Text>{period === 'daily' ? <View style={styles.actions}><ActionButton testID="generate-review" label={generated ? '已根据最新记录更新' : '生成今晚复盘'} variant="purple" onPress={() => setGenerated(true)} /></View> : null}</Card>
      <SectionHeader title="时间流向" meta="来自 TimeEntry" />
      <Card>{review.categoryMinutes.length ? review.categoryMinutes.map((item) => <View key={item.category} style={styles.barRow}><View style={styles.barLabel}><Text style={styles.barName}>{categoryLabels[item.category]}</Text><Text style={styles.barValue}>{item.minutes} 分钟</Text></View><View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(4, Math.round((item.minutes / maxMinutes) * 100))}%` }]} /></View></View>) : <Text style={textStyles.meta}>还没有耗时记录。</Text>}</Card>
      <SectionHeader title="知识沉淀" meta={`${data.knowledgeCards.length} 张`} />
      {data.knowledgeCards.map((card) => <Card key={card.id}><Text style={textStyles.cardTitle}>{card.title}</Text><Text style={textStyles.meta}>{card.summary}</Text><View style={styles.actions}><Chip label={card.source} tone="purple" /></View></Card>)}
      <Card accent="ai"><Text style={textStyles.cardTitle}>个人模式：沟通任务经常被低估</Text><Text style={textStyles.meta}>当前 Demo 根据种子记录给出这一提示；真实版本会从长期 TimeEntry 和用户反馈中学习。</Text></Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', gap: 8 }, metricCard: { flex: 1, alignItems: 'center', paddingHorizontal: 6, boxShadow: 'none' }, metricLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', textAlign: 'center' },
  reviewHeadline: { color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: '800' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  barRow: { gap: 5, marginBottom: 7 }, barLabel: { flexDirection: 'row', justifyContent: 'space-between' }, barName: { color: colors.ink, fontSize: 11, fontWeight: '800' }, barValue: { color: colors.muted, fontSize: 10, fontWeight: '700' }, barTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.purpleSoft, overflow: 'hidden' }, barFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.purple },
});
