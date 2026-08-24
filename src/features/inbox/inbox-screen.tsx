import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { isTaskCategory, resolveProposalVisibleClassification } from '@/core/classification';
import { formatShortDate, isLocalDate, localDateOf } from '@/core/date-utils';
import { editProposal } from '@/core/reducer';
import { selectFailedCaptures, selectLatestUndoableDecision, selectPendingProposals, selectRecentDecisions } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { type AIProposal, type ProposalEdit, type TaskCategory, type VisibleClassification, visibleClassificationLabels, type WaitingDetails, type WorkflowBucket } from '@/core/types';
import { colors, radius } from '../shared/theme';
import { ActionButton, Card, Chip, EmptyState, Page, PageHeader, SectionHeader, textStyles } from '../shared/ui';
import { LocalDatePicker } from '../shared/local-date-picker';

const visibleClassifications: VisibleClassification[] = ['work', 'communication', 'learning', 'life', 'health', 'waiting', 'someday', 'knowledge', 'unknown'];

function isValidDate(value: string): boolean {
  return isLocalDate(value);
}

function proposalMeta(classification: VisibleClassification, plannedDate: string, minutes: string): string {
  const parts: string[] = [];
  if (plannedDate.trim()) parts.push(formatShortDate(plannedDate.trim()));
  parts.push(visibleClassificationLabels[classification]);
  if (classification !== 'knowledge' && minutes) parts.push(`预计 ${minutes} 分`);
  return parts.join(' · ');
}

function editableWaitingDetails(proposal: AIProposal): WaitingDetails {
  return {
    waitingFor: proposal.waitingDetails?.waitingFor ?? '',
    waitingOn: proposal.waitingDetails?.waitingOn ?? '',
    followUpDate: proposal.waitingDetails?.followUpDate ?? '',
  };
}

function Field({ label, children, emphasis = false }: { label: string; children: React.ReactNode; emphasis?: boolean }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.fieldValue}>{typeof children === 'string' ? <Text style={[styles.fieldText, emphasis && styles.fieldTextEmphasis]}>{children}</Text> : children}</View></View>;
}

function Sheet({ children, visible, onClose, title }: { children: React.ReactNode; visible: boolean; onClose: () => void; title: string }) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.sheetHeader}><Text style={textStyles.cardTitle}>{title}</Text><ActionButton label="关闭" onPress={onClose} /></View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function ProposalCard({ proposal }: { proposal: AIProposal }) {
  const { submitUserDecision } = useReflowStore();
  const originalClassification = resolveProposalVisibleClassification(proposal);
  const [classification, setClassification] = useState<VisibleClassification>(originalClassification);
  const [editing, setEditing] = useState(false);
  const [classificationOpen, setClassificationOpen] = useState(false);
  const [datePickerContext, setDatePickerContext] = useState<'firstLevel' | 'editor' | null>(null);
  const initialWaitingDetails = editableWaitingDetails(proposal);
  const [formError, setFormError] = useState('');
  const [title, setTitle] = useState(proposal.title);
  const [category, setCategory] = useState<TaskCategory>(proposal.category);
  const [minutes, setMinutes] = useState(proposal.estimatedMinutes === null ? '' : String(proposal.estimatedMinutes));
  const [nextAction, setNextAction] = useState(proposal.nextAction ?? '');
  const [plannedDate, setPlannedDate] = useState(proposal.suggestedDate ?? '');
  const [knowledgeSummary, setKnowledgeSummary] = useState(proposal.knowledgeSummary ?? '');
  const [waitingDetails, setWaitingDetails] = useState<WaitingDetails>(initialWaitingDetails);

  const isKnowledge = classification === 'knowledge';
  const isWaiting = classification === 'waiting';
  const isSomeday = classification === 'someday';
  const isUnknown = classification === 'unknown';

  function buildEdit(override?: VisibleClassification): ProposalEdit {
    const visibleClassification = override ?? classification;
    return editProposal(
      proposal,
      title,
      isTaskCategory(visibleClassification) ? visibleClassification : category,
      Number(minutes),
      nextAction,
      knowledgeSummary,
      { visibleClassification, waitingDetails: visibleClassification === 'waiting' ? waitingDetails : undefined },
    );
  }

  function validateBeforeAccept(visibleClassification: VisibleClassification, bucket?: WorkflowBucket, acceptedDate?: string): boolean {
    if (!title.trim()) {
      setFormError('请先补充有效标题。');
      return false;
    }
    if (visibleClassification === 'knowledge') {
      if (!knowledgeSummary.trim()) {
        setFormError('保存知识前请补充有效摘要。');
        return false;
      }
      setFormError('');
      return true;
    }
    const parsedMinutes = Number(minutes);
    if (!Number.isInteger(parsedMinutes) || parsedMinutes < 5 || parsedMinutes > 480) {
      setFormError('确认任务前请填写 5～480 分钟的预计耗时。');
      setEditing(true);
      return false;
    }
    if (!nextAction.trim()) {
      setFormError('确认任务前请补充下一步行动。');
      setEditing(true);
      return false;
    }
    if ((bucket === 'waiting' || visibleClassification === 'waiting')
      && (!waitingDetails.waitingFor.trim() || !waitingDetails.waitingOn.trim() || !isValidDate(waitingDetails.followUpDate))) {
      setFormError('放入等待列表前，请补充等待对象、等待内容和跟进日期。');
      setEditing(true);
      return false;
    }
    if (bucket === 'today' && !isValidDate(acceptedDate ?? '')) {
      setFormError('请填写有效的计划日期。');
      setEditing(true);
      return false;
    }
    setFormError('');
    return true;
  }

  function acceptTask(bucket: WorkflowBucket, classificationOverride?: VisibleClassification, acceptedDateOverride?: string) {
    const visibleClassification = classificationOverride ?? classification;
    const acceptedDate = bucket === 'today' ? acceptedDateOverride ?? plannedDate.trim() : undefined;
    if (!validateBeforeAccept(visibleClassification, bucket, acceptedDate)) return;
    submitUserDecision({ kind: 'accept', proposalId: proposal.id, edited: buildEdit(classificationOverride), bucket, plannedDate: acceptedDate });
  }

  function acceptKnowledge() {
    if (!validateBeforeAccept('knowledge')) {
      setEditing(true);
      return;
    }
    submitUserDecision({ kind: 'accept', proposalId: proposal.id, edited: buildEdit('knowledge') });
  }

  function chooseClassification(next: VisibleClassification) {
    setClassification(next);
    if (isTaskCategory(next)) setCategory(next);
    setFormError('');
    setClassificationOpen(false);
  }

  function ignoreProposal() {
    submitUserDecision({ kind: 'ignore', proposalId: proposal.id });
  }

  return (
    <Card testID={`proposal-${proposal.id}`} style={styles.proposalCard}>
      <View style={styles.proposalRow}>
        <View style={styles.reorderMark}><Text style={styles.reorderGlyph}>≡</Text></View>
        <View style={styles.proposalCopy}>
          <Text style={styles.proposalTitle}>{title}</Text>
          <Text style={styles.proposalMeta}>{proposalMeta(classification, plannedDate, minutes)}</Text>
        </View>
        <View style={styles.proposalActions}>
          {isKnowledge ? <ActionButton testID={`accept-knowledge-${proposal.id}`} label="保存为知识" variant="purple" onPress={acceptKnowledge} /> : null}
          {isWaiting ? <ActionButton testID={`accept-waiting-${proposal.id}`} label="放入等待列表" variant="primary" onPress={() => acceptTask('waiting')} /> : null}
          {isSomeday ? <ActionButton testID={`accept-someday-${proposal.id}`} label="保存到稍后" variant="primary" onPress={() => acceptTask('someday')} /> : null}
          {isUnknown ? <ActionButton label="补充信息" variant="primary" onPress={() => setEditing(true)} /> : null}
          {!isKnowledge && !isWaiting && !isSomeday && !isUnknown && plannedDate ? <ActionButton testID={`accept-${proposal.id}`} label="确认" variant="primary" onPress={() => acceptTask('today')} /> : null}
          {!isKnowledge && !isWaiting && !isSomeday && !isUnknown && !plannedDate ? <ActionButton testID={`select-date-${proposal.id}`} label="选择日期" variant="primary" onPress={() => setDatePickerContext('firstLevel')} /> : null}
          {!isUnknown ? <ActionButton label="修改" onPress={() => setEditing(true)} /> : <ActionButton label="忽略" variant="danger" onPress={ignoreProposal} />}
        </View>
      </View>

      <Sheet visible={editing && !classificationOpen && datePickerContext !== 'editor'} onClose={() => setEditing(false)} title="修改整理结果">
        <ScrollView contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.fieldLabel}>{isKnowledge ? '标题' : '任务标题'}</Text>
          <TextInput testID={`proposal-title-${proposal.id}`} value={title} onChangeText={setTitle} style={styles.input} />
          <Text style={styles.fieldLabel}>类型</Text>
          <Pressable testID={`proposal-classification-${proposal.id}`} accessibilityRole="button" accessibilityLabel={`修改类型：${visibleClassificationLabels[classification]}`} onPress={() => setClassificationOpen(true)} style={styles.classificationButton}>
            <Chip label={visibleClassificationLabels[classification]} tone="orange" />
            <Text style={styles.disclosure}>选择</Text>
          </Pressable>
          {isKnowledge ? (
            <><Text style={styles.fieldLabel}>知识摘要</Text><TextInput testID={`proposal-knowledge-summary-${proposal.id}`} multiline value={knowledgeSummary} onChangeText={setKnowledgeSummary} style={[styles.input, styles.summaryInput]} /></>
          ) : (
            <>
              <Text style={styles.fieldLabel}>预计分钟</Text>
              <TextInput testID={`proposal-minutes-${proposal.id}`} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" style={styles.input} />
              <Text style={styles.fieldLabel}>下一步行动</Text>
              <TextInput testID={`proposal-next-action-${proposal.id}`} value={nextAction} onChangeText={setNextAction} style={styles.input} />
              {!isWaiting && !isSomeday ? <><Text style={styles.fieldLabel}>计划日期</Text><Pressable testID={`proposal-date-${proposal.id}`} accessibilityRole="button" accessibilityLabel={plannedDate ? `计划日期 ${formatShortDate(plannedDate)}，点击修改` : '计划日期尚未选择，点击选择'} onPress={() => setDatePickerContext('editor')} style={({ pressed }) => [styles.dateButton, pressed && styles.dateButtonPressed]}><Text style={[styles.dateButtonText, !plannedDate && styles.dateButtonPlaceholder]}>{plannedDate ? formatShortDate(plannedDate) : '选择日期'}</Text><Text style={styles.disclosure}>选择</Text></Pressable></> : null}
              {isWaiting ? <><Text style={styles.fieldLabel}>等待对象</Text><TextInput testID={`proposal-waiting-for-${proposal.id}`} value={waitingDetails.waitingFor} onChangeText={(waitingFor) => setWaitingDetails((current) => ({ ...current, waitingFor }))} style={styles.input} /><Text style={styles.fieldLabel}>等待内容</Text><TextInput testID={`proposal-waiting-on-${proposal.id}`} value={waitingDetails.waitingOn} onChangeText={(waitingOn) => setWaitingDetails((current) => ({ ...current, waitingOn }))} style={styles.input} /><Text style={styles.fieldLabel}>跟进日期</Text><TextInput testID={`follow-up-date-${proposal.id}`} value={waitingDetails.followUpDate} onChangeText={(followUpDate) => setWaitingDetails((current) => ({ ...current, followUpDate }))} placeholder="YYYY-MM-DD" style={styles.input} /></> : null}
            </>
          )}
          {formError ? <Text testID={`proposal-form-error-${proposal.id}`} style={styles.inputError}>{formError}</Text> : null}
          <View style={styles.editorActions}>
            <ActionButton label="保存修改" variant="primary" onPress={() => setEditing(false)} />
            <ActionButton label="忽略这条建议" variant="danger" onPress={ignoreProposal} />
          </View>
        </ScrollView>
      </Sheet>

      {datePickerContext ? <LocalDatePicker value={plannedDate || undefined} onClose={() => setDatePickerContext(null)} onSelect={(date) => { setPlannedDate(date); setFormError(''); setDatePickerContext(null); }} /> : null}

      <Sheet visible={classificationOpen} onClose={() => setClassificationOpen(false)} title="选择 AI 归类结果">
        <ScrollView contentContainerStyle={styles.optionList}>
          {visibleClassifications.map((item) => <ActionButton key={item} testID={`classification-option-${item}`} label={visibleClassificationLabels[item]} variant={item === classification ? 'primary' : 'secondary'} onPress={() => chooseClassification(item)} />)}
        </ScrollView>
      </Sheet>

    </Card>
  );
}

function FailedCaptureCard({ captureId }: { captureId: string }) {
  const { data, retryCapture, retryCaptureWithLocalRules, proposalServiceKind } = useReflowStore();
  const [retrying, setRetrying] = useState(false);
  const capture = data.captures.find((item) => item.id === captureId);
  if (!capture?.failure) return null;
  const retryCaptureId = capture.id;
  async function retry(local = false) {
    setRetrying(true);
    await (local ? retryCaptureWithLocalRules(retryCaptureId) : retryCapture(retryCaptureId));
    setRetrying(false);
  }
  return <Card testID={`failed-capture-${capture.id}`} accent="ai"><Field label="原始输入">{capture.rawText}</Field><Text style={textStyles.cardTitle}>输入已保留，暂未整理完成</Text><Text style={textStyles.meta}>{capture.failure.message}</Text><View style={styles.actions}>{capture.failure.retryable ? <ActionButton label={retrying ? '已加入整理队列' : proposalServiceKind === 'cloud' ? '重新使用云端整理' : '重新使用本地规则整理'} disabled={retrying} onPress={() => { void retry(); }} /> : null}{proposalServiceKind === 'cloud' ? <ActionButton testID={`fallback-local-${capture.id}`} label="使用本地规则整理" disabled={retrying} onPress={() => { void retry(true); }} /> : null}</View></Card>;
}

function RecentDecisionCard({ decisionId, undoable }: { decisionId: string; undoable: boolean }) {
  const { data, undoLastDecision } = useReflowStore();
  const decision = data.decisions.find((item) => item.id === decisionId);
  const proposal = decision ? data.proposals.find((item) => item.id === decision.proposalId) : undefined;
  if (!decision || !proposal) return null;
  const plannedDate = decision.effect.type === 'createdTasks'
    ? decision.effect.tasks.find((task) => task.plannedDate)?.plannedDate
    : decision.effect.type === 'mergedTask'
      ? decision.effect.appliedTask.plannedDate
      : undefined;
  const result = decision.status === 'reverted'
    ? '已撤销'
    : decision.outcome === 'ignored'
      ? '已忽略'
      : decision.outcome === 'knowledge'
        ? '已保存为知识'
        : decision.bucket === 'waiting'
          ? '已放入等待列表'
          : decision.bucket === 'someday'
            ? '已保存到稍后'
            : plannedDate && plannedDate !== localDateOf(decision.appliedAt)
              ? `已安排到 ${formatShortDate(plannedDate)}`
              : '已加入今天';
  return <Card testID={`recent-decision-${decision.id}`} style={styles.recentCard}><View style={styles.recentTop}><View style={styles.recentIcon}><Text style={styles.recentIconText}>↶</Text></View><View style={styles.recentCopy}><Text style={textStyles.cardTitle}>{decision.edited?.title ?? proposal.title}</Text><Text style={textStyles.meta}>{result} · {formatShortDate(decision.appliedAt)}</Text></View>{undoable ? <ActionButton testID="undo-decision" label="撤销" onPress={undoLastDecision} /> : null}</View></Card>;
}

export function InboxScreen() {
  const { data, lastActionFailure } = useReflowStore();
  const proposals = selectPendingProposals(data);
  const failedCaptures = selectFailedCaptures(data);
  const latestDecision = selectLatestUndoableDecision(data);
  const recentDecisions = selectRecentDecisions(data, 1);
  const pendingCount = proposals.length + failedCaptures.length;
  return (
    <Page testID="screen-inbox">
      <PageHeader title="收件箱" subtitle={pendingCount ? `已整理，剩 ${pendingCount} 个待确认` : '收件箱已整理完毕'} right={<Chip label="整理" size="header" />} />
      {lastActionFailure ? <Card style={styles.failure}><Text style={textStyles.cardTitle}>操作未完成</Text><Text style={textStyles.meta}>{lastActionFailure.message}</Text></Card> : null}
      {pendingCount ? <Card accent="ai"><Text style={textStyles.cardTitle}>已整理为 {pendingCount} 条待确认建议</Text><Text style={textStyles.meta}>确认后才会写入任务、等待列表或知识卡片。</Text></Card> : null}
      <SectionHeader title="待你确认" meta={`${pendingCount} 条`} />
      {failedCaptures.map((capture) => <FailedCaptureCard key={capture.id} captureId={capture.id} />)}
      {proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)}
      {!pendingCount ? <EmptyState title="收件箱已清空" detail="从任意页面使用“+”捕捉新事项，AI 整理后会回到这里等待你确认。" /> : null}
      {recentDecisions.length ? <><SectionHeader title="最近处理" /><RecentDecisionCard decisionId={recentDecisions[0].id} undoable={recentDecisions[0].id === latestDecision?.id} /></> : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  field: { gap: 2 }, fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: '800' }, fieldValue: { minHeight: 18, justifyContent: 'center' }, fieldText: { color: colors.ink, fontSize: 13, lineHeight: 19 }, fieldTextEmphasis: { fontWeight: '900', fontSize: 15, lineHeight: 21 },
  classificationButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, minHeight: 34 }, disclosure: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  proposalCard: { padding: 12 }, proposalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, reorderMark: { width: 18, alignItems: 'center' }, reorderGlyph: { color: colors.subtle, fontSize: 18, lineHeight: 20 }, proposalCopy: { flex: 1, minWidth: 0, gap: 3 }, proposalTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '900' }, proposalMeta: { color: colors.muted, fontSize: 11, lineHeight: 16 }, proposalActions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  editor: { gap: 6, padding: 10, backgroundColor: colors.surface, borderRadius: radius.medium }, input: { minHeight: 42, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, paddingHorizontal: 11, fontSize: 13 }, summaryInput: { minHeight: 74, paddingTop: 9, textAlignVertical: 'top' }, inputError: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  dateButton: { minHeight: 44, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dateButtonPressed: { opacity: 0.72 }, dateButtonText: { color: colors.ink, fontSize: 13, fontWeight: '800' }, dateButtonPlaceholder: { color: colors.muted },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(24, 32, 45, 0.34)', padding: 14 }, sheet: { width: '100%', maxWidth: 452, gap: 10, maxHeight: '84%', borderRadius: radius.large, backgroundColor: colors.card, padding: 14 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, optionList: { gap: 8 }, editorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recentCard: { paddingVertical: 9 }, recentTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, recentIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, recentIconText: { color: colors.muted, fontSize: 16 }, recentCopy: { flex: 1, minWidth: 0 }, failure: { borderLeftWidth: 4, borderLeftColor: colors.danger },
});
