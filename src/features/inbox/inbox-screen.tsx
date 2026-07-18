import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { selectFailedCaptures, selectLatestUndoableDecision, selectPendingProposals } from '@/core/selectors';
import { editProposal } from '@/core/reducer';
import { useReflowStore } from '@/core/store';
import { captureSourceLabels, categoryLabels, type AIProposal, type TaskCategory, type WorkflowBucket } from '@/core/types';
import { colors, radius } from '../shared/theme';
import { ActionButton, Card, Chip, EmptyState, Page, PageHeader, SectionHeader, textStyles } from '../shared/ui';

const categories = Object.keys(categoryLabels) as TaskCategory[];

function ProposalCard({ proposal }: { proposal: AIProposal }) {
  const { data, submitUserDecision } = useReflowStore();
  const capture = data.captures.find((item) => item.id === proposal.captureId);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [category, setCategory] = useState(proposal.category);
  const [minutes, setMinutes] = useState(String(proposal.estimatedMinutes));
  const [nextAction, setNextAction] = useState(proposal.nextAction);
  const [knowledgeSummary, setKnowledgeSummary] = useState(proposal.knowledgeSummary ?? '');
  const isKnowledge = proposal.outcome === 'knowledge';
  const edited = () => editProposal(proposal, title, category, Number(minutes) || proposal.estimatedMinutes, nextAction, knowledgeSummary);

  function acceptTask(bucket: WorkflowBucket) {
    submitUserDecision({ kind: 'accept', proposalId: proposal.id, edited: edited(), bucket });
  }

  function acceptKnowledge() {
    submitUserDecision({ kind: 'accept', proposalId: proposal.id, edited: edited() });
  }

  return (
    <Card accent="ai" testID={`proposal-${proposal.id}`}>
      <View style={styles.proposalTop}><View style={styles.proposalMain}><Text style={textStyles.cardTitle}>{isKnowledge ? '知识建议' : proposal.kind === 'merge' ? '合并建议' : proposal.kind === 'split' ? '拆分建议' : '任务建议'}</Text><Text style={styles.source}>{capture ? captureSourceLabels[capture.source] : '未知来源'} · 置信度 {Math.round(proposal.confidence * 100)}%</Text></View><Chip label={isKnowledge ? '知识沉淀' : categoryLabels[category]} tone="orange" /></View>
      {editing ? (
        <View style={styles.editor}>
          <Text style={styles.fieldLabel}>{isKnowledge ? '知识标题' : '任务名称'}</Text>
          <TextInput testID={`proposal-title-${proposal.id}`} value={title} onChangeText={setTitle} style={styles.input} />
          {isKnowledge ? (
            <><Text style={styles.fieldLabel}>知识摘要</Text><TextInput multiline value={knowledgeSummary} onChangeText={setKnowledgeSummary} style={[styles.input, styles.summaryInput]} /></>
          ) : (
            <>
              <Text style={styles.fieldLabel}>内容类别</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                {categories.map((item) => <ActionButton key={item} label={categoryLabels[item]} variant={item === category ? 'primary' : 'secondary'} onPress={() => setCategory(item)} />)}
              </ScrollView>
              <View style={styles.editorRow}><View style={styles.editorField}><Text style={styles.fieldLabel}>预计分钟</Text><TextInput value={minutes} onChangeText={setMinutes} keyboardType="number-pad" style={styles.input} /></View></View>
              <Text style={styles.fieldLabel}>下一步</Text><TextInput value={nextAction} onChangeText={setNextAction} style={styles.input} />
            </>
          )}
        </View>
      ) : (
        <View style={styles.copy}><Text style={styles.proposalTitle}>{title}</Text><Text style={textStyles.meta}>{proposal.reason}</Text>{isKnowledge ? <Text style={textStyles.meta}>{knowledgeSummary || proposal.knowledgeSummary}</Text> : <Text style={textStyles.meta}>预计 {minutes} 分钟 · 下一步：{nextAction}</Text>}{proposal.splitTitles?.length ? <Text style={styles.split}>建议拆分：{proposal.splitTitles.join(' / ')}</Text> : null}</View>
      )}
      <View style={styles.actions}>
        {isKnowledge ? <ActionButton testID={`accept-knowledge-${proposal.id}`} label="保存知识卡片" variant="purple" onPress={acceptKnowledge} /> : <><ActionButton testID={`accept-${proposal.id}`} label="加入今天" variant="primary" onPress={() => acceptTask('today')} /><ActionButton label="等待他人" onPress={() => acceptTask('waiting')} /><ActionButton label="稍后处理" onPress={() => acceptTask('someday')} /></>}
        <ActionButton label={editing ? '收起编辑' : '编辑'} onPress={() => setEditing((value) => !value)} />
        <ActionButton label="忽略" variant="danger" onPress={() => submitUserDecision({ kind: 'ignore', proposalId: proposal.id })} />
      </View>
    </Card>
  );
}

function FailedCaptureCard({ captureId }: { captureId: string }) {
  const { data, retryCapture, capturing } = useReflowStore();
  const capture = data.captures.find((item) => item.id === captureId);
  if (!capture?.failure) return null;
  return (
    <Card testID={`failed-capture-${capture.id}`} accent="ai"><Text style={textStyles.cardTitle}>建议生成失败</Text><Text style={textStyles.body}>{capture.rawText}</Text><Text style={textStyles.meta}>{capture.failure.message}</Text>{capture.failure.retryable ? <ActionButton label={capturing ? '正在重试…' : '重试建议'} disabled={capturing} onPress={() => { void retryCapture(capture.id); }} /> : null}</Card>
  );
}

export function InboxScreen() {
  const { data, lastActionFailure, undoLastDecision } = useReflowStore();
  const proposals = selectPendingProposals(data);
  const failedCaptures = selectFailedCaptures(data);
  const latestDecision = selectLatestUndoableDecision(data);
  return (
    <Page testID="screen-inbox">
      <PageHeader title="收件箱" subtitle={`Pipeline 已整理，剩 ${proposals.length} 个待确认`} right={<Chip label="Mock" tone="orange" />} />
      {latestDecision ? <Card style={styles.undo}><View style={styles.undoCopy}><Text style={textStyles.cardTitle}>最近一次决策可撤销</Text><Text style={textStyles.meta}>{latestDecision.outcome === 'knowledge' ? '知识卡片' : latestDecision.outcome === 'ignored' ? '忽略建议' : '任务去向'} · 刷新后仍可追踪。</Text></View><ActionButton testID="undo-decision" label="撤销" onPress={undoLastDecision} /></Card> : null}
      {lastActionFailure ? <Card style={styles.failure}><Text style={textStyles.cardTitle}>操作未完成</Text><Text style={textStyles.meta}>{lastActionFailure.message}</Text></Card> : null}
      <Card accent="ai"><Text style={textStyles.cardTitle}>显式 Proposal Pipeline</Text><Text style={textStyles.meta}>Mock 只生成结构化建议；任务、知识和执行记录只会在你确认后由领域动作写入。</Text></Card>
      {failedCaptures.length ? <><SectionHeader title="需要重试" meta={`${failedCaptures.length} 条`} />{failedCaptures.map((capture) => <FailedCaptureCard key={capture.id} captureId={capture.id} />)}</> : null}
      <SectionHeader title="待确认" meta={`${proposals.length} 条`} />
      {proposals.length ? proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />) : <EmptyState title="收件箱已清空" detail="从任意页面使用“+”捕捉新事项，建议会先回到这里。" />}
    </Page>
  );
}

const styles = StyleSheet.create({
  proposalTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }, proposalMain: { flex: 1 },
  source: { color: colors.muted, fontSize: 10, marginTop: 3, fontWeight: '700' }, copy: { gap: 4 }, proposalTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '900' }, split: { color: colors.orange, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, editor: { gap: 6, padding: 10, backgroundColor: colors.surface, borderRadius: radius.medium },
  fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: '800' }, input: { minHeight: 42, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, paddingHorizontal: 11, fontSize: 13 }, summaryInput: { minHeight: 74, paddingTop: 9, textAlignVertical: 'top' },
  categoryScroll: { gap: 6 }, editorRow: { flexDirection: 'row', gap: 8 }, editorField: { flex: 1, gap: 5 },
  undo: { flexDirection: 'row', alignItems: 'center' }, undoCopy: { flex: 1 }, failure: { borderLeftWidth: 4, borderLeftColor: colors.danger },
});
