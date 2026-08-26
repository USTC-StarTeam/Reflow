import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { dateKey, formatDuration, formatShortDate, formatTime } from '@/core/date-utils';
import { executionDurationMinutes } from '@/core/execution';
import { deriveDailyReviewFacts, deriveReview, selectNeedsAttention, selectTimeEntriesNeedingCorrection } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { categoryLabels, type ReviewPeriod, type TimeEntry } from '@/core/types';
import { colors, radius, spacing } from '../shared/theme';
import { ActionButton, Card, EmptyState, ModalSurface, Page, PageHeader, SegmentedControl, textStyles } from '../shared/ui';
import { useCurrentTime } from '../shared/use-current-time';

const reviewPeriods: { value: ReviewPeriod; label: string }[] = [
  { value: 'daily', label: '今天' },
  { value: 'weekly', label: '本周' },
  { value: 'monthly', label: '本月' },
];

function attentionDetail(overdue: number, waiting: number, crossDay: number): string {
  return [
    overdue ? `${overdue} 项重新安排` : '',
    waiting ? `${waiting} 项等待跟进` : '',
    crossDay ? `${crossDay} 项跨日进行中` : '',
  ].filter(Boolean).join(' · ');
}

function periodName(period: Exclude<ReviewPeriod, 'daily'>): string {
  return period === 'weekly' ? '本周' : '本月';
}

export function ReviewScreen() {
  const store = useReflowStore();
  const now = useCurrentTime();
  const today = dateKey(now);
  const [period, setPeriod] = useState<ReviewPeriod>('daily');
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [timeCorrectionOpen, setTimeCorrectionOpen] = useState(false);
  const daily = deriveDailyReviewFacts(store.data, today);
  const attention = selectNeedsAttention(store.data, today);
  const overdueCount = attention.filter((item) => item.kind === 'overdue').length;
  const waitingDueCount = attention.filter((item) => item.kind === 'waitingDue').length;
  const crossDayActiveCount = attention.filter((item) => item.kind === 'crossDayActive').length;
  const timeEntriesNeedingCorrection = selectTimeEntriesNeedingCorrection(store.data);

  return (
    <Page testID="screen-review">
      <PageHeader title="回顾" subtitle="计划事实与实际投入" />
      <View style={styles.periodSwitch} testID="review-period-switch">
        <SegmentedControl values={reviewPeriods} selected={period} onChange={setPeriod} />
      </View>

      {period === 'daily' ? (
        <Card accent="review" testID="review-daily" style={styles.entryCard}>
          <Text style={textStyles.cardTitle}>今日回顾</Text>
          <Text style={styles.summary}>统计范围：{formatShortDate(today)} 当天的计划事实与实际记录。</Text>
          <View style={styles.metrics}>
            <Metric testID="review-metric-planned" label="原计划" value={daily.plannedCount} />
            <Metric testID="review-metric-completed" label="完成" value={daily.completedTotalCount} />
            <Metric testID="review-metric-actual-minutes" label="实际投入" value={formatDuration(daily.actualMinutes)} />
            <Metric testID="review-metric-interruptions" label="中断" value={`${daily.interruptions} 次`} />
          </View>
          <View testID="review-needs-attention" style={styles.attentionSummary}>
            <Text style={styles.attentionTitle}>需要处理 {attention.length} 项</Text>
            <Text style={styles.attentionDetail}>{attention.length ? attentionDetail(overdueCount, waitingDueCount, crossDayActiveCount) : '当前没有需要重新安排或跟进的事项'}</Text>
          </View>
        </Card>
      ) : <PeriodReview period={period} now={now} data={store.data} />}

      {timeEntriesNeedingCorrection.length ? (
        <Card accent="ai" testID="review-time-correction-notice" style={styles.noticeCard}>
          <View style={styles.noticeCopy}>
            <Text style={textStyles.cardTitle}>发现 {timeEntriesNeedingCorrection.length} 条可能异常的执行记录</Text>
            <Text style={styles.summary}>这些记录目前仍按原时间计入回顾，核对后会立即重新计算。</Text>
          </View>
          <ActionButton testID="open-time-correction" label="核对记录" variant="orange" onPress={() => setTimeCorrectionOpen(true)} />
        </Card>
      ) : null}

      <ReviewEntry
        testID="review-knowledge"
        title="知识沉淀"
        summary="发现值得保留的经验、结论和个人偏好。"
        detail={`当前已保存 ${store.data.knowledgeCards.length} 张知识卡片。`}
        actionLabel="查看知识沉淀"
        onPress={() => setKnowledgeOpen(true)}
      />
      {timeCorrectionOpen ? (
        <ModalSurface visible title="核对执行记录" subtitle="只修正明显跨日或超长的单次记录。" onClose={() => setTimeCorrectionOpen(false)} testID="time-correction-list">
          <ScrollView contentContainerStyle={styles.correctionList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {timeEntriesNeedingCorrection.map((entry) => (
              <TimeCorrectionRow
                key={entry.id}
                entry={entry}
                taskTitle={store.data.tasks.find((task) => task.id === entry.taskId)?.title ?? '已删除任务'}
                onCorrect={(actualMinutes) => store.correctTimeEntry(entry.id, actualMinutes)}
              />
            ))}
          </ScrollView>
        </ModalSurface>
      ) : null}
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

function PeriodReview({ period, now, data }: { period: Exclude<ReviewPeriod, 'daily'>; now: Date; data: ReturnType<typeof useReflowStore>['data'] }) {
  const review = deriveReview(data, period, now);
  const mainCategory = review.categoryMinutes[0];
  const name = periodName(period);
  return (
    <Card accent="review" testID={`review-${period}`} style={styles.entryCard}>
      <Text style={textStyles.cardTitle}>{name}回顾</Text>
      <Text style={styles.summary}>直接根据计划事件、完成记录、TimeEntry 和中断记录汇总。</Text>
      <View style={styles.metrics}>
        <Metric testID="review-metric-period-planned" label="计划任务" value={review.taskCount} />
        <Metric testID="review-metric-period-completed" label="按计划完成" value={review.completedCount} />
        <Metric testID="review-metric-period-rate" label="完成率" value={`${review.completionRate}%`} />
        <Metric testID="review-metric-actual-minutes" label="实际投入" value={formatDuration(review.actualMinutes)} />
      </View>
      <View style={styles.periodDetail}>
        <Text style={styles.periodDetailText}>中断 {review.interruptions} 次</Text>
        <Text style={styles.periodDetailText}>主要投入：{mainCategory ? `${categoryLabels[mainCategory.category]} · ${formatDuration(mainCategory.minutes)}` : '暂无记录'}</Text>
      </View>
    </Card>
  );
}

function TimeCorrectionRow({ entry, taskTitle, onCorrect }: { entry: TimeEntry; taskTitle: string; onCorrect: (minutes: number) => void }) {
  const [minutes, setMinutes] = useState('');
  const elapsed = executionDurationMinutes(entry.startedAt, entry.endedAt);
  const actualMinutes = Number(minutes);
  const valid = /^\d+$/.test(minutes) && Number.isInteger(actualMinutes) && actualMinutes > 0 && actualMinutes <= Math.ceil(elapsed);
  return (
    <Card testID={`time-correction-${entry.id}`} style={styles.correctionCard}>
      <Text style={textStyles.cardTitle}>{taskTitle}</Text>
      <Text style={styles.summary}>{formatShortDate(entry.startedAt)} {formatTime(entry.startedAt)} – {formatShortDate(entry.endedAt)} {formatTime(entry.endedAt)}</Text>
      <Text style={styles.recordedDuration}>原记录 {formatDuration(elapsed)}</Text>
      <View style={styles.correctionRow}>
        <TextInput
          testID={`time-correction-input-${entry.id}`}
          accessibilityLabel={`${taskTitle}实际投入分钟`}
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="number-pad"
          placeholder="实际分钟"
          placeholderTextColor={colors.subtle}
          style={styles.correctionInput}
        />
        <ActionButton testID={`save-time-correction-${entry.id}`} label="保存修正" variant="primary" disabled={!valid} onPress={() => onCorrect(actualMinutes)} />
      </View>
      {minutes && !valid ? <Text style={styles.correctionError}>请输入不超过原记录的正整数分钟。</Text> : null}
    </Card>
  );
}

function ReviewEntry({ testID, title, summary, detail, actionLabel, onPress }: { testID: string; title: string; summary: string; detail?: string; actionLabel: string; onPress: () => void }) {
  return (
    <Card accent="review" testID={testID} style={styles.entryCard}>
      <Text style={textStyles.cardTitle}>{title}</Text>
      <Text style={styles.summary}>{summary}</Text>
      {detail ? <Text style={textStyles.meta}>{detail}</Text> : null}
      <View style={styles.actionRow}><ActionButton label={actionLabel} variant="purple" onPress={onPress} /></View>
    </Card>
  );
}

function Metric({ testID, label, value }: { testID: string; label: string; value: string | number }) {
  return <View testID={testID} style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  periodSwitch: { alignItems: 'center' },
  entryCard: { padding: spacing.xl, gap: spacing.sm },
  summary: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { width: '48%', minHeight: 58, justifyContent: 'center', borderRadius: 10, backgroundColor: '#F7F4FF', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  metricLabel: { color: colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  metricValue: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  attentionSummary: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, gap: spacing.xxs },
  attentionTitle: { color: colors.ink, fontSize: 12, lineHeight: 17, fontWeight: '900' },
  attentionDetail: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  periodDetail: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, gap: spacing.xs },
  periodDetailText: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  noticeCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  noticeCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  actionRow: { alignItems: 'flex-start', marginTop: spacing.xs },
  correctionList: { gap: spacing.md },
  correctionCard: { padding: spacing.lg },
  recordedDuration: { color: colors.orange, fontSize: 12, lineHeight: 17, fontWeight: '900' },
  correctionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  correctionInput: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, paddingHorizontal: spacing.md, fontSize: 13 },
  correctionError: { color: colors.danger, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  knowledgeList: { gap: spacing.md },
  knowledgeCard: { padding: spacing.lg },
});
