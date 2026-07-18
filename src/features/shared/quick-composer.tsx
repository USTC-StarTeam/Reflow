import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useReflowStore } from '@/core/store';
import { colors, radius, shadow } from './theme';

export function QuickComposer({ autoFocus = false, onSubmitted }: { autoFocus?: boolean; onSubmitted?: () => void }) {
  const { capture, capturing } = useReflowStore();
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
        placeholderTextColor="#B6BECA"
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
      {submitted ? <Text style={styles.success}>已交给 Mock AI 整理，请到收件箱确认。</Text> : null}
      {error ? <Text testID="quick-capture-error" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 116, borderRadius: radius.large, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, padding: 13, gap: 8, ...shadow },
  input: { minHeight: 55, color: colors.ink, fontSize: 15, lineHeight: 22, padding: 0, textAlignVertical: 'top' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  toolPrimary: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  tool: { color: '#99A2AF', fontSize: 12, fontWeight: '800' },
  send: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sendActive: { backgroundColor: colors.primary },
  sendText: { color: '#9AA3B0', fontSize: 14, fontWeight: '900' },
  sendTextActive: { color: '#FFFFFF' },
  success: { color: colors.green, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 11, lineHeight: 16, fontWeight: '700' },
});
