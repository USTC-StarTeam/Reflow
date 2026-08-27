import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useReflowStore } from '@/core/store';
import { border, colors, radius, spacing, typography } from '@/features/shared/theme';
import { ActionButton, ModalSurface, textStyles } from '@/features/shared/ui';
import { createUstcEmailClient, type UstcEmailClient, type UstcEmailDetail, type UstcEmailSummary } from './ustc-email-client';

const defaultClient = createUstcEmailClient();

function senderLabel(message: UstcEmailSummary): string {
  return message.from.name || message.from.address || '未知发件人';
}

function timeLabel(receivedAt: string | null): string {
  if (!receivedAt) return '时间未知';
  const date = new Date(receivedAt);
  if (!Number.isFinite(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}

export function emailCaptureText(message: UstcEmailDetail): string {
  const sender = message.from.name && message.from.address
    ? `${message.from.name} <${message.from.address}>`
    : message.from.name || message.from.address || '未知发件人';
  const received = message.receivedAt ? new Date(message.receivedAt).toLocaleString('zh-CN') : '时间未知';
  const prefix = [
    `邮件标题：${message.subject || '无主题'}`,
    `发件人：${sender}`,
    `接收时间：${received}`,
    '',
    '正文：',
  ].join('\n');
  const body = message.body || '（无可显示的文本正文）';
  return `${prefix}\n${body}`.slice(0, 1_000);
}

export function UstcEmailModal({ visible, onClose, client = defaultClient }: { visible: boolean; onClose: () => void; client?: UstcEmailClient }) {
  const { capture } = useReflowStore();
  const [messages, setMessages] = useState<UstcEmailSummary[]>([]);
  const [detail, setDetail] = useState<UstcEmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    let active = true;
    client.listRecent().then(
      (items) => { if (active) setMessages(items); },
      (reason) => { if (active) setError(reason instanceof Error ? reason.message : '最近邮件读取失败。'); },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, visible]);

  async function openMessage(message: UstcEmailSummary) {
    setLoading(true);
    setError('');
    try {
      setDetail(await client.getDetail(message.uid));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '邮件详情读取失败。');
    } finally {
      setLoading(false);
    }
  }

  async function addToReflow() {
    if (!detail) return;
    setImporting(true);
    setError('');
    const result = await capture(emailCaptureText(detail), 'email');
    setImporting(false);
    if (result.status === 'failure') {
      setError(result.failure.message);
      return;
    }
    onClose();
  }

  return (
    <ModalSurface
      visible={visible}
      onClose={onClose}
      title={detail ? detail.subject || '无主题' : '学校邮箱'}
      subtitle={detail ? `${senderLabel(detail)} · ${timeLabel(detail.receivedAt)}` : '最近 10 封邮件，仅在打开时读取正文'}
      testID="ustc-email-modal"
      placement="center"
    >
      {error ? <View testID="ustc-email-error" style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading ? <Text testID="ustc-email-loading" style={textStyles.meta}>正在读取学校邮箱…</Text> : null}
      {!loading && !detail ? (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {messages.map((message) => (
            <Pressable
              key={message.id}
              testID={`ustc-email-message-${message.uid}`}
              accessibilityRole="button"
              accessibilityLabel={`查看邮件：${message.subject || '无主题'}`}
              onPress={() => { void openMessage(message); }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.rowTop}>
                <Text numberOfLines={1} style={styles.sender}>{senderLabel(message)}</Text>
                <Text style={styles.time}>{timeLabel(message.receivedAt)}</Text>
              </View>
              <Text numberOfLines={2} style={styles.subject}>{message.subject || '无主题'}</Text>
            </Pressable>
          ))}
          {!messages.length ? <Text style={textStyles.meta}>邮箱中暂无邮件。</Text> : null}
        </ScrollView>
      ) : null}
      {!loading && detail ? (
        <>
          <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detail} showsVerticalScrollIndicator={false}>
            <Text testID="ustc-email-body" selectable style={styles.body}>{detail.body || '这封邮件没有可显示的文本正文。'}</Text>
          </ScrollView>
          <View style={styles.actions}>
            <ActionButton label="返回邮件列表" onPress={() => { setDetail(null); setError(''); }} />
            <ActionButton testID="ustc-email-import" label={importing ? '正在加入…' : '加入 Reflow'} variant="primary" disabled={importing} onPress={() => { void addToReflow(); }} />
          </View>
        </>
      ) : null}
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { gap: spacing.xs, padding: spacing.xl, borderWidth: border.width, borderColor: border.color, borderRadius: radius.medium, backgroundColor: colors.card },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  sender: { flex: 1, color: colors.ink, ...typography.cardTitle },
  time: { color: colors.muted, ...typography.meta },
  subject: { color: colors.ink, ...typography.body, fontWeight: '600' },
  detailScroll: { maxHeight: 430 },
  detail: { paddingVertical: spacing.sm },
  body: { color: colors.ink, ...typography.body },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm },
  error: { padding: spacing.lg, borderRadius: radius.small, backgroundColor: colors.dangerSoft },
  errorText: { color: colors.danger, ...typography.meta, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});
