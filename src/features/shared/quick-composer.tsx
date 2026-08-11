import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useReflowStore } from '@/core/store';
import { border, colors, radius, shadows, spacing, typography } from './theme';

export function QuickComposer({ autoFocus = false, onSubmitted }: { autoFocus?: boolean; onSubmitted?: () => void }) {
  const { capture, capturing, proposalServiceKind } = useReflowStore();
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (capturing) return;
    const result = await capture(value);
    if (result.status === 'failure') {
      setError(result.failure.message);
      setSubmitted(false);
      return;
    }
    setValue('');
    setError(null);
    setSubmitted(true);
    onSubmitted?.();
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        testID="quick-capture-input"
        accessibilityLabel="快速捕捉输入框"
        autoFocus={autoFocus}
        multiline
        value={value}
        onChangeText={(text) => { setValue(text); setSubmitted(false); setError(null); }}
        placeholder="准备做什么？"
        placeholderTextColor={colors.subtle}
        style={styles.input}
      />
      <View style={styles.toolbar}>
        <View style={styles.tools}><Text style={styles.toolPrimary}>▦ 今天</Text><Text style={styles.tool}>⚑</Text><Text style={styles.tool}>◇</Text><Text style={styles.tool}>•••</Text></View>
        <Pressable
          testID="quick-capture-submit"
          accessibilityRole="button"
          accessibilityLabel={value.trim() ? '提交捕捉' : '语音输入尚未开放'}
          disabled={!value.trim() || capturing}
          onPress={submit}
          style={[styles.send, value.trim() && styles.sendActive]}
        >
          <Text style={[styles.sendText, value.trim() && styles.sendTextActive]}>{capturing ? '…' : value.trim() ? '↑' : '⌁'}</Text>
        </Pressable>
      </View>
      {submitted ? <Text style={styles.success}>{proposalServiceKind === 'cloud' ? '已交给云端 AI 整理，请到收件箱确认。' : '已交给本地规则整理，请到收件箱确认。'}</Text> : null}
      {error ? <Text testID="quick-capture-error" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 112, borderRadius: radius.large, backgroundColor: colors.card, borderWidth: border.width, borderColor: border.color, padding: spacing.xl, gap: spacing.sm, ...shadows.soft },
  input: { minHeight: 54, color: colors.ink, fontSize: 15, lineHeight: 22, padding: 0, textAlignVertical: 'top' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  toolPrimary: { color: colors.primary, ...typography.meta, fontWeight: '800' },
  tool: { color: colors.subtle, fontSize: 12, fontWeight: '800' },
  send: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sendActive: { backgroundColor: colors.primary },
  sendText: { color: colors.subtle, fontSize: 14, fontWeight: '900' },
  sendTextActive: { color: '#FFFFFF' },
  success: { color: colors.green, ...typography.meta, fontWeight: '700' },
  error: { color: colors.danger, ...typography.meta, fontWeight: '700' },
});
