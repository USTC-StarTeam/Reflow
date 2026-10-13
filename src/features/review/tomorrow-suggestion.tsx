import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { addLocalDays, formatDuration, formatShortDate } from '@/core/date-utils';
import { deviceTimeZone } from '@/core/proposal-pipeline';
import type { ReviewSuggestionDraft } from '@/core/review-suggestion-contract';
import { createReviewSuggestionService } from '@/core/review-suggestion-service';
import { deriveDailyReviewSnapshot, selectCurrentExecutionSession, selectCurrentTask, selectDailyReviewRecordIssue } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { categoryLabels, type DailyReviewSnapshot, type LocalDate, type ReviewFactId } from '@/core/types';
import { LocalDatePicker } from '../shared/local-date-picker';
import { colors, radius, spacing } from '../shared/theme';
import { ActionButton, Card, ModalSurface, textStyles } from '../shared/ui';

// 这些措辞会让 Gateway 的确定性后处理丢弃计划日期，所以提交前先挡住。
const draftBlockedPattern = /[；;]|然后|接着|随后|以后有空|以后再|有空再|有时间再|将来再说|稍后再|暂缓|哪天再|回头再|暂时不急/u;

const factLabels: Record<ReviewFactId, (snapshot: DailyReviewSnapshot) => string> = {
  plannedCount: (snapshot) => `原计划 ${snapshot.plannedCount} 项`,
  completedAsPlannedCount: (snapshot) => `按计划完成 ${snapshot.completedAsPlannedCount} 项`,
  completedTotalCount: (snapshot) => `当天完成 ${snapshot.completedTotalCount} 项`,
  recordedMinutes: (snapshot) => `已记录投入 ${formatDuration(snapshot.recordedMinutes)}`,
  interruptions: (snapshot) => `中断 ${snapshot.interruptions} 次`,
  categoryMinutes: (snapshot) => (snapshot.categoryMinutes.length
    ? `分类投入：${snapshot.categoryMinutes.map((item) => `${categoryLabels[item.category]} ${formatDuration(item.minutes)}`).join('、')}`
    : '暂无分类投入记录'),
  recordsComplete: (snapshot) => (snapshot.recordsComplete ? '当天记录已核对完整' : '当天记录尚不完整'),
};

const gateCopy: Record<NonNullable<ReturnType<typeof selectDailyReviewRecordIssue>>, { title: string; detail: string }> = {
  noClosedExecution: {
    title: '今天还没有已结束的执行记录',
    detail: '先在「进行中」暂停或完成一次执行，回顾才会有可依据的确定性事实。',
  },
  unconfirmedTimeEntry: {
    title: '今天有尚未核对的执行记录',
    detail: '请先用下方「核对记录」确认实际时长，核对后再生成建议。',
  },
  pendingOpenSegment: {
    title: '有跨日仍进行中的执行段',
    detail: '请先在「进行中」暂停或完成，并核对实际时长后再生成建议。',
  },
};

function buildCaptureText(action: string, date: LocalDate): string {
  return `${action.trim()}（${date}）`;
}

export function TomorrowSuggestion({ today }: { today: LocalDate }) {
  const store = useReflowStore();
  const [service] = useState(() => createReviewSuggestionService());
  const [timeZone] = useState(() => deviceTimeZone());
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<{ date: LocalDate; key: string; suggestions: ReviewSuggestionDraft[] } | null>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ action: string; date: LocalDate } | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [adopted, setAdopted] = useState(false);

  if (store.proposalServiceKind !== 'cloud') return null;

  const snapshot = deriveDailyReviewSnapshot(store.data, today, timeZone);
  const issue = selectDailyReviewRecordIssue(store.data, today);
  const currentTask = selectCurrentTask(store.data);
  const openSegment = currentTask ? selectCurrentExecutionSession(store.data, currentTask.id) : undefined;
  const stale = Boolean(result) && (result?.date !== today || result?.key !== JSON.stringify(snapshot));

  async function generate() {
    if (loading) return;
    setLoading(true);
    setFailure(null);
    setAdopted(false);
    setDismissed([]);
    setExpanded(null);
    setDraft(null);
    const response = await service.request(snapshot);
    setLoading(false);
    if (response.status === 'failure') {
      setResult(null);
      setFailure(response.failure.message);
      return;
    }
    setResult({ date: today, key: JSON.stringify(snapshot), suggestions: response.suggestions });
  }

  async function submitDraft() {
    if (!draft || submitting) return;
    setSubmitting(true);
    const response = await store.capture(buildCaptureText(draft.action, draft.date));
    setSubmitting(false);
    if (response.status === 'failure') {
      setSubmitError(response.failure.message);
      return;
    }
    setDraft(null);
    setSubmitError(null);
    setAdopted(true);
  }

  const draftBlocked = draft ? !draft.action.trim() || draftBlockedPattern.test(draft.action) : false;

  if (issue) {
    return (
      <Card accent="ai" testID="review-tomorrow-suggestion-gate" style={styles.card}>
        <Text style={textStyles.cardTitle}>{gateCopy[issue].title}</Text>
        <Text style={styles.summary}>{gateCopy[issue].detail}</Text>
        {openSegment ? <Text style={styles.hint}>进行中任务的当前执行段尚未结束，不计入已记录投入。</Text> : null}
      </Card>
    );
  }

  return (
    <Card accent="ai" testID="review-tomorrow-suggestion" style={styles.card}>
      <Text style={textStyles.cardTitle}>明天试一件事</Text>
      <Text style={styles.summary}>根据今天的确定性事实，生成最多两条可以明天试一试的小调整。仅发送统计事实，不含任务内容。</Text>
      {openSegment ? <Text style={styles.hint}>进行中任务的当前执行段尚未结束，不计入已记录投入；暂停或完成时才会成为事实。</Text> : null}
      {adopted ? <Text testID="tomorrow-suggestion-adopted" style={styles.adopted}>已保存为捕捉，去收件箱确认后才会在所选日期创建任务。</Text> : null}

      {stale ? (
        <View style={styles.block}>
          <Text testID="tomorrow-suggestion-stale" style={styles.stale}>今天的事实已经变化，之前的建议已失效，需要重新生成。</Text>
        </View>
      ) : null}

      {failure ? (
        <View style={styles.block}>
          <Text testID="tomorrow-suggestion-failure" style={styles.error}>{failure}</Text>
          <Text style={styles.summary}>上面的确定性回顾事实不受影响，可以重试。</Text>
        </View>
      ) : null}

      {!stale && result && !result.suggestions.length ? (
        <Text testID="tomorrow-suggestion-empty" style={styles.summary}>今天的事实还不足以给出有依据的调整建议。</Text>
      ) : null}

      {!stale && result ? result.suggestions.map((suggestion, index) => (dismissed.includes(index) ? null : (
        <View key={`${suggestion.title}-${index}`} testID={`tomorrow-suggestion-${index}`} style={styles.suggestion}>
          <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
          <Text style={styles.action}>{suggestion.action}</Text>
          <Pressable
            testID={`tomorrow-suggestion-basis-${index}`}
            accessibilityRole="button"
            accessibilityLabel={expanded === index ? '收起依据' : '展开依据'}
            onPress={() => setExpanded(expanded === index ? null : index)}
          >
            <Text style={styles.toggle}>{expanded === index ? '收起依据' : '展开依据'}</Text>
          </Pressable>
          {expanded === index ? (
            <View style={styles.facts}>
              {suggestion.factIds.map((factId) => (
                <Text key={factId} testID={`tomorrow-suggestion-fact-${index}-${factId}`} style={styles.fact}>{factLabels[factId](snapshot)}</Text>
              ))}
              <Text style={styles.factNote}>以上数字由程序从今天的事实直接渲染，建议本身只提供一项可尝试的行动。</Text>
            </View>
          ) : null}
          <View style={styles.actionRow}>
            <ActionButton
              testID={`tomorrow-suggestion-adopt-${index}`}
              label="准备明日行动"
              variant="primary"
              disabled={loading}
              onPress={() => { setDraft({ action: suggestion.action, date: addLocalDays(today, 1) }); setSubmitError(null); setDatePickerOpen(false); }}
            />
            <ActionButton
              testID={`tomorrow-suggestion-dismiss-${index}`}
              label="暂时不采用"
              onPress={() => setDismissed([...dismissed, index])}
            />
          </View>
        </View>
      ))) : null}

      <View style={styles.actionRow}>
        <ActionButton
          testID={result || failure ? 'tomorrow-suggestion-regenerate' : 'generate-tomorrow-suggestion'}
          label={loading ? '生成中…' : result || failure ? '重新生成' : '生成建议'}
          variant="purple"
          disabled={loading}
          onPress={generate}
        />
      </View>

      {draft && !stale ? (
        <ModalSurface
          visible
          title="准备明日行动"
          subtitle="提交后先可靠保存为捕捉，再走现有建议与收件箱确认流程。"
          onClose={() => { setDraft(null); setSubmitError(null); setDatePickerOpen(false); }}
          testID="tomorrow-action-draft"
        >
          <TextInput
            testID="tomorrow-action-input"
            accessibilityLabel="明日行动草稿"
            value={draft.action}
            onChangeText={(text) => setDraft({ ...draft, action: text })}
            multiline
            style={styles.draftInput}
          />
          <ActionButton
            testID="tomorrow-action-date"
            label={`计划日期 · ${formatShortDate(draft.date)}`}
            onPress={() => setDatePickerOpen(true)}
          />
          <Text style={styles.summary}>日期已按当前本地日期填入，可以修改。不会自动安排具体时间，也不会顺延其他任务。</Text>
          {draftBlocked ? (
            <Text testID="tomorrow-action-blocked" style={styles.error}>请保持单一行动，并避免「然后」「接着」「以后有空」这类措辞，否则计划日期可能无法自动带入。</Text>
          ) : null}
          {submitError ? <Text testID="tomorrow-action-error" style={styles.error}>{submitError}</Text> : null}
          <View style={styles.actionRow}>
            <ActionButton
              testID="tomorrow-action-submit"
              label={submitting ? '提交中…' : '提交到收件箱'}
              variant="primary"
              disabled={submitting || draftBlocked}
              onPress={submitDraft}
            />
            <ActionButton testID="tomorrow-action-cancel" label="取消" onPress={() => { setDraft(null); setSubmitError(null); setDatePickerOpen(false); }} />
          </View>
        </ModalSurface>
      ) : null}

      {draft && datePickerOpen && !stale ? (
        <LocalDatePicker
          value={draft.date}
          onSelect={(date) => { setDraft({ ...draft, date }); setDatePickerOpen(false); }}
          onClose={() => setDatePickerOpen(false)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.xl, gap: spacing.sm },
  summary: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  adopted: { color: colors.green, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  block: { gap: spacing.xxs },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  stale: { color: colors.orange, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  suggestion: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, gap: spacing.xs },
  suggestionTitle: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  action: { color: colors.ink, fontSize: 13, lineHeight: 20 },
  toggle: { color: colors.purple, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  facts: { borderRadius: radius.small, backgroundColor: '#F7F4FF', padding: spacing.md, gap: spacing.xxs },
  fact: { color: colors.ink, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  factNote: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  draftInput: { minHeight: 88, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 13, textAlignVertical: 'top' },
});
