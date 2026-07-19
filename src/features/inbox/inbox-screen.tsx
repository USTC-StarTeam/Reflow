import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { isTaskCategory, resolveProposalVisibleClassification } from '@/core/classification';
import { addDays, dateKey, formatShortDate } from '@/core/date-utils';
import { editProposal } from '@/core/reducer';
import { selectFailedCaptures, selectLatestUndoableDecision, selectPendingProposals, selectRecentDecisions } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { type AIProposal, type ProposalEdit, type TaskCategory, type VisibleClassification, visibleClassificationLabels, type WaitingDetails, type WorkflowBucket } from '@/core/types';
import { colors, radius } from '../shared/theme';
import { ActionButton, Card, Chip, EmptyState, Page, PageHeader, SectionHeader, textStyles } from '../shared/ui';

const visibleClassifications: VisibleClassification[] = ['work', 'communication', 'learning', 'life', 'health', 'waiting', 'someday', 'knowledge', 'unknown'];

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function suggestedDestination(classification: VisibleClassification): string {
  if (classification === 'waiting') return '等待列表';
  if (classification === 'someday') return '稍后列表';
  if (classification === 'knowledge') return '知识卡片';
  if (classification === 'unknown') return '补充信息后再决定';
  return '今天';
}

function defaultWaitingDetails(proposal: AIProposal, captureCreatedAt?: string): WaitingDetails {
  const sourceDate = captureCreatedAt ? new Date(captureCreatedAt) : new Date();
  return proposal.waitingDetails ?? {
    waitingFor: '对方',
    waitingOn: proposal.nextAction || proposal.title,
    followUpDate: dateKey(addDays(sourceDate, 3)),
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
  const { data, submitUserDecision } = useReflowStore();
  const capture = data.captures.find((item) => item.id === proposal.captureId);
  const originalClassification = resolveProposalVisibleClassification(proposal);
  const [classification, setClassification] = useState<VisibleClassification>(originalClassification);
  const [editing, setEditing] = useState(false);
  const [classificationOpen, setClassificationOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDateDraft, setFollowUpDateDraft] = useState(defaultWaitingDetails(proposal, capture?.createdAt).followUpDate);
  const [followUpError, setFollowUpError] = useState('');
  const [title, setTitle] = useState(proposal.title);
  const [category, setCategory] = useState<TaskCategory>(proposal.category);
  const [minutes, setMinutes] = useState(String(proposal.estimatedMinutes));
  const [nextAction, setNextAction] = useState(proposal.nextAction);
  const [knowledgeSummary, setKnowledgeSummary] = useState(proposal.knowledgeSummary ?? '');
  const [waitingDetails, setWaitingDetails] = useState<WaitingDetails>(defaultWaitingDetails(proposal, capture?.createdAt));
  const followUpSourceDate = capture?.createdAt ? new Date(capture.createdAt) : new Date();
  const waitingDatePresets = [
    { label: '明天', value: dateKey(addDays(followUpSourceDate, 1)) },
    { label: '3 天后', value: dateKey(addDays(followUpSourceDate, 3)) },
    { label: '一周后', value: dateKey(addDays(followUpSourceDate, 7)) },
  ];

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
      Number(minutes) || proposal.estimatedMinutes,
      nextAction,
      knowledgeSummary,
      { visibleClassification, waitingDetails: visibleClassification === 'waiting' ? waitingDetails : undefined },
    );
  }

  function acceptTask(bucket: WorkflowBucket, classificationOverride?: VisibleClassification) {
    submitUserDecision({ kind: 'accept', proposalId: proposal.id, edited: buildEdit(classificationOverride), bucket });
  }

  function acceptKnowledge() {
    submitUserDecision({ kind: 'accept', proposalId: proposal.id, edited: buildEdit('knowledge') });
  }

  function chooseClassification(next: VisibleClassification) {
    setClassification(next);
    if (isTaskCategory(next)) setCategory(next);
    if (next === 'waiting') setWaitingDetails((current) => current ?? defaultWaitingDetails(proposal, capture?.createdAt));
    setClassificationOpen(false);
  }

  function saveFollowUpDate(value: string) {
    if (!isValidDate(value)) {
      setFollowUpError('请输入有效日期，例如 2026-07-22。');
      return;
    }
    setWaitingDetails((current) => ({ ...current, followUpDate: value }));
    setFollowUpDateDraft(value);
    setFollowUpError('');
    setFollowUpOpen(false);
  }

  function ignoreProposal() {
    setMoreOpen(false);
    submitUserDecision({ kind: 'ignore', proposalId: proposal.id });
  }

  function openEditor() {
    setMoreOpen(false);
    setEditing(true);
  }

  function moreAction(action: () => void) {
    setMoreOpen(false);
    action();
  }

  return (
    <Card accent="ai" testID={`proposal-${proposal.id}`}>
      <Field label="原始输入">{capture?.rawText ?? '原始输入不可用'}</Field>
      <Field label="AI 整理后的标题" emphasis>{title}</Field>
      <Field label="AI 归类结果">
        <Pressable testID={`proposal-classification-${proposal.id}`} accessibilityRole="button" accessibilityLabel={`修改 AI 归类结果：${visibleClassificationLabels[classification]}`} onPress={() => setClassificationOpen(true)} style={styles.classificationButton}>
          <Chip label={visibleClassificationLabels[classification]} tone="orange" />
          <Text style={styles.disclosure}>修改</Text>
        </Pressable>
      </Field>
      <Field label="预计耗时">{isKnowledge ? '无需执行耗时' : `${minutes} 分钟`}</Field>
      <Field label="下一步行动">{nextAction}</Field>
      <Field label="建议去向">{suggestedDestination(classification)}</Field>
      <Field label="理解理由">{proposal.reason}</Field>

      {isWaiting ? (
        <View style={styles.waitingBlock}>
          <Text style={styles.waitingHint}>目前无需你行动，等对方回复或处理后再继续。</Text>
          <Field label="等待对象">{waitingDetails.waitingFor}</Field>
          <Field label="等待内容">{waitingDetails.waitingOn}</Field>
          <Field label="建议跟进">{`${formatShortDate(waitingDetails.followUpDate)}（${waitingDetails.followUpDate}）`}</Field>
        </View>
      ) : null}

      {proposal.splitTitles?.length ? <Text style={styles.split}>建议拆分：{proposal.splitTitles.join(' / ')}</Text> : null}

      {editing ? (
        <View style={styles.editor}>
          <Text style={styles.editorTitle}>修改整理结果</Text>
          <Text style={styles.fieldLabel}>{isKnowledge ? '标题' : '任务标题'}</Text>
          <TextInput testID={`proposal-title-${proposal.id}`} value={title} onChangeText={setTitle} style={styles.input} />
          {isKnowledge ? (
            <><Text style={styles.fieldLabel}>知识摘要</Text><TextInput multiline value={knowledgeSummary} onChangeText={setKnowledgeSummary} style={[styles.input, styles.summaryInput]} /></>
          ) : (
            <>
              <Text style={styles.fieldLabel}>预计分钟</Text>
              <TextInput value={minutes} onChangeText={setMinutes} keyboardType="number-pad" style={styles.input} />
              <Text style={styles.fieldLabel}>下一步行动</Text>
              <TextInput value={nextAction} onChangeText={setNextAction} style={styles.input} />
              {isWaiting ? <><Text style={styles.fieldLabel}>等待对象</Text><TextInput value={waitingDetails.waitingFor} onChangeText={(waitingFor) => setWaitingDetails((current) => ({ ...current, waitingFor }))} style={styles.input} /><Text style={styles.fieldLabel}>等待内容</Text><TextInput value={waitingDetails.waitingOn} onChangeText={(waitingOn) => setWaitingDetails((current) => ({ ...current, waitingOn }))} style={styles.input} /></> : null}
            </>
          )}
          <ActionButton label="完成修改" onPress={() => setEditing(false)} />
        </View>
      ) : null}

      <View style={styles.actions}>
        {isKnowledge ? <><ActionButton testID={`accept-knowledge-${proposal.id}`} label="保存为知识" variant="purple" onPress={acceptKnowledge} /><ActionButton label="改成任务" onPress={() => acceptTask('today', isTaskCategory(category) ? category : 'learning')} /></> : null}
        {isWaiting ? <><ActionButton testID={`accept-waiting-${proposal.id}`} label="放入等待列表" variant="primary" onPress={() => acceptTask('waiting')} /><ActionButton label="设置跟进时间" onPress={() => { setFollowUpDateDraft(waitingDetails.followUpDate); setFollowUpError(''); setFollowUpOpen(true); }} /></> : null}
        {isSomeday ? <><ActionButton testID={`accept-someday-${proposal.id}`} label="保存到稍后" variant="primary" onPress={() => acceptTask('someday')} /><ActionButton label="加入今天" onPress={() => acceptTask('today')} /></> : null}
        {isUnknown ? <><ActionButton label="补充信息" variant="primary" onPress={() => setEditing(true)} /><ActionButton label="忽略" variant="danger" onPress={ignoreProposal} /></> : null}
        {!isKnowledge && !isWaiting && !isSomeday && !isUnknown ? <><ActionButton testID={`accept-${proposal.id}`} label="确认并加入今天" variant="primary" onPress={() => acceptTask('today')} /><ActionButton label="修改" onPress={() => setEditing(true)} /></> : null}
        <ActionButton label="更多" onPress={() => setMoreOpen(true)} />
      </View>

      <Sheet visible={classificationOpen} onClose={() => setClassificationOpen(false)} title="选择 AI 归类结果">
        <ScrollView contentContainerStyle={styles.optionList}>
          {visibleClassifications.map((item) => <ActionButton key={item} testID={`classification-option-${item}`} label={visibleClassificationLabels[item]} variant={item === classification ? 'primary' : 'secondary'} onPress={() => chooseClassification(item)} />)}
        </ScrollView>
      </Sheet>

      <Sheet visible={followUpOpen} onClose={() => setFollowUpOpen(false)} title="设置跟进时间">
        <Text style={textStyles.meta}>选择日期后，放入等待列表时会一并保存。</Text>
        <View style={styles.optionList}>{waitingDatePresets.map((item) => <ActionButton key={item.value} label={`${item.label} · ${item.value}`} variant={item.value === followUpDateDraft ? 'primary' : 'secondary'} onPress={() => saveFollowUpDate(item.value)} />)}</View>
        <Text style={styles.fieldLabel}>自定义日期</Text>
        <TextInput testID={`follow-up-date-${proposal.id}`} value={followUpDateDraft} onChangeText={setFollowUpDateDraft} placeholder="YYYY-MM-DD" style={styles.input} />
        {followUpError ? <Text style={styles.inputError}>{followUpError}</Text> : null}
        <ActionButton label="保存日期" variant="primary" onPress={() => saveFollowUpDate(followUpDateDraft)} />
      </Sheet>

      <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} title="更多操作">
        <View style={styles.optionList}>
          {!isWaiting ? <ActionButton label="放入等待列表" onPress={() => moreAction(() => acceptTask('waiting', 'waiting'))} /> : null}
          {!isSomeday ? <ActionButton label="保存到稍后" onPress={() => moreAction(() => acceptTask('someday', 'someday'))} /> : null}
          {!isKnowledge ? <ActionButton label="保存为知识" variant="purple" onPress={() => moreAction(acceptKnowledge)} /> : null}
          {isWaiting || isSomeday || isKnowledge ? <ActionButton label="修改" onPress={openEditor} /> : null}
          {!isUnknown ? <ActionButton label="忽略" variant="danger" onPress={ignoreProposal} /> : null}
        </View>
      </Sheet>
    </Card>
  );
}

function FailedCaptureCard({ captureId }: { captureId: string }) {
  const { data, retryCapture, capturing } = useReflowStore();
  const capture = data.captures.find((item) => item.id === captureId);
  if (!capture?.failure) return null;
  return <Card testID={`failed-capture-${capture.id}`} accent="ai"><Field label="原始输入">{capture.rawText}</Field><Text style={textStyles.cardTitle}>暂未能整理这条输入</Text><Text style={textStyles.meta}>{capture.failure.message}</Text>{capture.failure.retryable ? <ActionButton label={capturing ? '正在重试…' : '重新整理'} disabled={capturing} onPress={() => { void retryCapture(capture.id); }} /> : null}</Card>;
}

function RecentDecisionCard({ decisionId, undoable }: { decisionId: string; undoable: boolean }) {
  const { data, undoLastDecision } = useReflowStore();
  const decision = data.decisions.find((item) => item.id === decisionId);
  const proposal = decision ? data.proposals.find((item) => item.id === decision.proposalId) : undefined;
  const capture = decision ? data.captures.find((item) => item.id === decision.captureId) : undefined;
  if (!decision || !proposal) return null;
  const classification = decision.edited?.visibleClassification ?? resolveProposalVisibleClassification(proposal);
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
            : '已加入今天';
  return <Card testID={`recent-decision-${decision.id}`}><View style={styles.recentTop}><View style={styles.recentCopy}><Text style={textStyles.cardTitle}>{decision.edited?.title ?? proposal.title}</Text><Text style={textStyles.meta}>{capture?.rawText ?? '原始输入不可用'}</Text></View><Chip label={visibleClassificationLabels[classification]} tone="orange" /></View><Text style={textStyles.meta}>{result} · {formatShortDate(decision.appliedAt)}</Text>{undoable ? <ActionButton testID="undo-decision" label="撤销最近决定" onPress={undoLastDecision} /> : null}</Card>;
}

export function InboxScreen() {
  const { data, lastActionFailure } = useReflowStore();
  const proposals = selectPendingProposals(data);
  const failedCaptures = selectFailedCaptures(data);
  const latestDecision = selectLatestUndoableDecision(data);
  const recentDecisions = selectRecentDecisions(data);
  const pendingCount = proposals.length + failedCaptures.length;
  return (
    <Page testID="screen-inbox">
      <PageHeader title="收件箱" subtitle={pendingCount ? `有 ${pendingCount} 项等你处理` : '收件箱已整理完毕'} right={<Chip label="待处理" tone="orange" />} />
      {lastActionFailure ? <Card style={styles.failure}><Text style={textStyles.cardTitle}>操作未完成</Text><Text style={textStyles.meta}>{lastActionFailure.message}</Text></Card> : null}
      <SectionHeader title="待你确认" meta={`${pendingCount} 条`} />
      {failedCaptures.map((capture) => <FailedCaptureCard key={capture.id} captureId={capture.id} />)}
      {proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)}
      {!pendingCount ? <EmptyState title="收件箱已清空" detail="从任意页面使用“+”捕捉新事项，AI 整理后会回到这里等待你确认。" /> : null}
      <SectionHeader title="最近处理" meta={`${recentDecisions.length} 条`} />
      {recentDecisions.length ? recentDecisions.map((decision) => <RecentDecisionCard key={decision.id} decisionId={decision.id} undoable={decision.id === latestDecision?.id} />) : <EmptyState title="还没有处理记录" detail="确认、保存、忽略后的结果会显示在这里。" />}
    </Page>
  );
}

const styles = StyleSheet.create({
  field: { gap: 2 }, fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: '800' }, fieldValue: { minHeight: 18, justifyContent: 'center' }, fieldText: { color: colors.ink, fontSize: 13, lineHeight: 19 }, fieldTextEmphasis: { fontWeight: '900', fontSize: 15, lineHeight: 21 },
  classificationButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, minHeight: 34 }, disclosure: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  waitingBlock: { gap: 7, borderRadius: radius.small, padding: 10, backgroundColor: colors.primarySoft }, waitingHint: { color: colors.primary, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  split: { color: colors.orange, fontSize: 11, lineHeight: 17, fontWeight: '700' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  editor: { gap: 6, padding: 10, backgroundColor: colors.surface, borderRadius: radius.medium }, editorTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' }, input: { minHeight: 42, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, paddingHorizontal: 11, fontSize: 13 }, summaryInput: { minHeight: 74, paddingTop: 9, textAlignVertical: 'top' }, inputError: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24, 32, 45, 0.34)', padding: 14 }, sheet: { gap: 10, maxHeight: '76%', borderRadius: radius.large, backgroundColor: colors.card, padding: 14 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, optionList: { gap: 8 },
  recentTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }, recentCopy: { flex: 1 }, failure: { borderLeftWidth: 4, borderLeftColor: colors.danger },
});
