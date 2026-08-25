import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { dateKey, formatShortDate } from '@/core/date-utils';
import { deriveDailyReviewFacts, selectNeedsAttention } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { colors, spacing } from '../shared/theme';
import { ActionButton, Card, EmptyState, ModalSurface, Page, PageHeader, textStyles } from '../shared/ui';
import { useCurrentTime } from '../shared/use-current-time';

export function ReviewScreen() {
  const store = useReflowStore();
  const now = useCurrentTime();
  const today = dateKey(now);
  const daily = deriveDailyReviewFacts(store.data, today);
  const attention = selectNeedsAttention(store.data, today);
  const overdueCount = attention.filter((item) => item.kind === 'overdue').length;
  const waitingDueCount = attention.filter((item) => item.kind === 'waitingDue').length;
  const crossDayActiveCount = attention.filter((item) => item.kind === 'crossDayActive').length;
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);

  return (
    <Page testID="screen-review">
      <PageHeader title="回顾" subtitle="今日事实与知识沉淀" />

      <Card accent="review" testID="review-daily" style={styles.entryCard}>
        <Text style={textStyles.cardTitle}>今日回顾</Text>
        <Text style={styles.summary}>统计范围：{formatShortDate(today)} 当天的计划事实与实际记录。</Text>
        <View style={styles.metrics}>
          <Metric testID="review-metric-planned" label="今日原计划" value={daily.plannedCount} />
          <Metric testID="review-metric-completed" label="今日完成" value={daily.completedTotalCount} />
          <Metric testID="review-metric-unfinished" label="今日未完成" value={daily.unfinishedCount} />
          <Metric testID="review-metric-reschedule" label="需要重新安排" value={overdueCount} />
          <Metric testID="review-metric-waiting-due" label="到期等待" value={waitingDueCount} />
          <Metric testID="review-metric-cross-day" label="跨日进行中" value={crossDayActiveCount} />
          <Metric testID="review-metric-actual-minutes" label="实际投入时间" value={`${daily.actualMinutes} 分`} />
          <Metric testID="review-metric-interruptions" label="中断次数" value={daily.interruptions} />
        </View>
      </Card>

      <ReviewEntry
        testID="review-knowledge"
        title="知识沉淀"
        summary="发现值得保留的经验、结论和个人偏好。"
        detail={`当前已保存 ${store.data.knowledgeCards.length} 张知识卡片。`}
        actionLabel="查看知识沉淀"
        onPress={() => setKnowledgeOpen(true)}
      />
      {knowledgeOpen ? (
        <ModalSurface visible title="知识沉淀" subtitle="已保存的结论和经验会一直留在这里。" onClose={() => setKnowledgeOpen(false)} testID="knowledge-list">
          <ScrollView contentContainerStyle={styles.knowledgeList} showsVerticalScrollIndicator={false}>
            {store.data.knowledgeCards.length ? store.data.knowledgeCards.map((card) => (
              <Card key={card.id} style={styles.knowledgeCard}>
                <Text style={textStyles.cardTitle}>{card.title}</Text>
                <Text style={styles.summary}>{card.summary}</Text>
                <Text style={textStyles.meta}>来源：{card.source}</Text>
              </Card>
            )) : <EmptyState title="还没有知识卡片" detail="在收件箱确认保存为知识后，会出现在这里。" />}
          </ScrollView>
        </ModalSurface>
      ) : null}
    </Page>
  );
}

function ReviewEntry({ testID, title, summary, detail, actionLabel, onPress }: {
  testID: string;
  title: string;
  summary: string;
  detail?: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <Card accent="review" testID={testID} style={styles.entryCard}>
      <Text style={textStyles.cardTitle}>{title}</Text>
      <Text style={styles.summary}>{summary}</Text>
      {detail ? <Text style={textStyles.meta}>{detail}</Text> : null}
      <View style={styles.actionRow}>
        <ActionButton label={actionLabel} variant="purple" onPress={onPress} />
      </View>
    </Card>
  );
}

function Metric({ testID, label, value }: { testID: string; label: string; value: string | number }) {
  return <View testID={testID} style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  entryCard: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  summary: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { width: '48%', minHeight: 58, justifyContent: 'center', borderRadius: 10, backgroundColor: '#F7F4FF', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  metricLabel: { color: colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  metricValue: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  actionRow: {
    alignItems: 'flex-start',
    marginTop: spacing.xs,
  },
  knowledgeList: { gap: spacing.md },
  knowledgeCard: { padding: spacing.lg },
});
