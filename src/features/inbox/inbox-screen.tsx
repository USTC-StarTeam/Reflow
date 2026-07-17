import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { selectPendingProposals } from '@/core/selectors';
import { editProposal } from '@/core/reducer';
import { useReflowStore } from '@/core/store';
import { categoryLabels, type AIProposal, type TaskCategory, type WorkflowBucket } from '@/core/types';
import { colors, radius } from '../shared/theme';
import { ActionButton, Card, Chip, EmptyState, Page, PageHeader, SectionHeader, textStyles } from '../shared/ui';

const categories = Object.keys(categoryLabels) as TaskCategory[];

function ProposalCard({ proposal }: { proposal: AIProposal }) {
  const { data, acceptProposal, rejectProposal } = useReflowStore();
  const capture = data.captures.find((item) => item.id === proposal.captureId);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [category, setCategory] = useState(proposal.category);
  const [minutes, setMinutes] = useState(String(proposal.estimatedMinutes));
  const [nextAction, setNextAction] = useState(proposal.nextAction);

  function accept(bucket: WorkflowBucket) {
    acceptProposal(proposal.id, editProposal(proposal, title, category, Number(minutes) || proposal.estimatedMinutes, nextAction), bucket);
  }

  return (
    <Card accent="ai" testID={`proposal-${proposal.id}`}>
      <View style={styles.proposalTop}><View style={styles.proposalMain}><Text style={textStyles.cardTitle}>{proposal.kind === 'merge' ? '合并建议' : proposal.kind === 'split' ? '拆分建议' : '任务建议'}</Text><Text style={styles.source}>{capture?.source ?? '未知来源'} · 置信度 {Math.round(proposal.confidence * 100)}%</Text></View><Chip label={categoryLabels[category]} tone="orange" /></View>
      {editing ? (
        <View style={styles.editor}>
          <Text style={styles.fieldLabel}>任务名称</Text>
          <TextInput testID={`proposal-title-${proposal.id}`} value={title} onChangeText={setTitle} style={styles.input} />
          <Text style={styles.fieldLabel}>内容类别</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {categories.map((item) => <ActionButton key={item} label={categoryLabels[item]} variant={item === category ? 'primary' : 'secondary'} onPress={() => setCategory(item)} />)}
          </ScrollView>
          <View style={styles.editorRow}><View style={styles.editorField}><Text style={styles.fieldLabel}>预计分钟</Text><TextInput value={minutes} onChangeText={setMinutes} keyboardType="number-pad" style={styles.input} /></View></View>
          <Text style={styles.fieldLabel}>下一步</Text>
          <TextInput value={nextAction} onChangeText={setNextAction} style={styles.input} />
        </View>
      ) : (
        <View style={styles.copy}><Text style={styles.proposalTitle}>{title}</Text><Text style={textStyles.meta}>{proposal.reason}</Text><Text style={textStyles.meta}>预计 {minutes} 分钟 · 下一步：{nextAction}</Text>{proposal.splitTitles?.length ? <Text style={styles.split}>建议拆分：{proposal.splitTitles.join(' / ')}</Text> : null}</View>
      )}
      <View style={styles.actions}>
        <ActionButton testID={`accept-${proposal.id}`} label="加入今天" variant="primary" onPress={() => accept('today')} />
        <ActionButton label="等待他人" onPress={() => accept('waiting')} />
        <ActionButton label="稍后处理" onPress={() => accept('someday')} />
        <ActionButton label={editing ? '收起编辑' : '编辑'} onPress={() => setEditing((value) => !value)} />
        <ActionButton label="忽略" variant="danger" onPress={() => rejectProposal(proposal.id)} />
      </View>
    </Card>
  );
}

export function InboxScreen() {
  const { data, lastDecisionLabel, undoLastDecision } = useReflowStore();
  const proposals = selectPendingProposals(data);
  return (
    <Page testID="screen-inbox">
      <PageHeader title="收件箱" subtitle={`AI 已整理，剩 ${proposals.length} 个待确认`} right={<Chip label="Mock" tone="orange" />} />
      {lastDecisionLabel ? <Card style={styles.undo}><View style={styles.undoCopy}><Text style={textStyles.cardTitle}>{lastDecisionLabel}</Text><Text style={textStyles.meta}>最近一次收件箱决策可以撤销。</Text></View><ActionButton testID="undo-decision" label="撤销" onPress={undoLastDecision} /></Card> : null}
      <Card accent="ai"><Text style={textStyles.cardTitle}>Mock AI 自动整理</Text><Text style={textStyles.meta}>分类、合并和拆分均为确定性演示规则。所有正式变更都需要你的确认。</Text></Card>
      <SectionHeader title="待确认" meta={`${proposals.length} 条`} />
      {proposals.length ? proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />) : <EmptyState title="收件箱已清空" detail="从任意页面使用“+”捕捉新事项，建议会先回到这里。" />}
    </Page>
  );
}

const styles = StyleSheet.create({
  proposalTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }, proposalMain: { flex: 1 },
  source: { color: colors.muted, fontSize: 10, marginTop: 3, fontWeight: '700' }, copy: { gap: 4 }, proposalTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '900' }, split: { color: colors.orange, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, editor: { gap: 6, padding: 10, backgroundColor: colors.surface, borderRadius: radius.medium },
  fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: '800' }, input: { minHeight: 42, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, paddingHorizontal: 11, fontSize: 13 },
  categoryScroll: { gap: 6 }, editorRow: { flexDirection: 'row', gap: 8 }, editorField: { flex: 1, gap: 5 },
  undo: { flexDirection: 'row', alignItems: 'center' }, undoCopy: { flex: 1 },
});
