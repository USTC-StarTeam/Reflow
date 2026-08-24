import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { dateKey } from '@/core/date-utils';
import { deriveDailyReviewFacts } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { colors, spacing } from '../shared/theme';
import { ActionButton, Card, Chip, EmptyState, ModalSurface, Page, PageHeader, textStyles } from '../shared/ui';

const unavailableAction = () => undefined;

export function ReviewScreen() {
  const store = useReflowStore();
  const today = useMemo(() => dateKey(new Date()), []);
  const daily = deriveDailyReviewFacts(store.data, today);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);

  return (
    <Page testID="screen-review">
      <PageHeader title="回顾" subtitle="复盘、知识和个人模式" />

      <ReviewEntry
        testID="review-nightly"
        title="每晚复盘"
        summary={`回顾今天：完成 ${daily.completedTotalCount} 项，未完成 ${daily.unfinishedCount} 项，记录时间 ${daily.actualMinutes} 分钟，被打断 ${daily.interruptions} 次。`}
        detail="适合在一天结束时梳理进展和明日提醒。"
        actionLabel="生成今晚复盘"
      />

      <ReviewEntry
        testID="review-weekly"
        title="每周复盘"
        summary="从一周尺度回顾任务执行、时间投入和不同事务的节奏。"
        actionLabel="查看本周"
      />

      <ReviewEntry
        testID="review-monthly"
        title="每月复盘"
        summary="从更长周期回顾长期拖延、时间分布和个人模式。"
        actionLabel="查看本月"
      />

      <Card accent="ai" testID="review-ai-observation" style={styles.entryCard}>
        <View style={styles.titleRow}>
          <Text style={textStyles.cardTitle}>AI 观察</Text>
          <Chip label="展示占位" tone="orange" />
        </View>
        <Text style={styles.observation}>AI：你低估了沟通跟进耗时</Text>
        <Text style={textStyles.meta}>示例：未来只基于确定性事实解释个人模式，不会自动修改任务。</Text>
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
  onPress?: () => void;
}) {
  return (
    <Card accent="review" testID={testID} style={styles.entryCard}>
      <Text style={textStyles.cardTitle}>{title}</Text>
      <Text style={styles.summary}>{summary}</Text>
      {detail ? <Text style={textStyles.meta}>{detail}</Text> : null}
      <View style={styles.actionRow}>
        <ActionButton label={actionLabel} variant="purple" disabled={!onPress} onPress={onPress ?? unavailableAction} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  entryCard: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summary: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  observation: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '800',
  },
  actionRow: {
    alignItems: 'flex-start',
    marginTop: spacing.xs,
  },
  knowledgeList: { gap: spacing.md },
  knowledgeCard: { padding: spacing.lg },
});
