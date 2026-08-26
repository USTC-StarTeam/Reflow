import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDuration } from '@/core/date-utils';
import type { ExecutionTimeDecision } from '@/core/types';
import { colors, radius } from './theme';
import { ActionButton, ModalSurface } from './ui';

export function ExecutionCorrectionModal({ elapsedMinutes, onClose, onDecision }: { elapsedMinutes: number; onClose: () => void; onDecision: (decision: ExecutionTimeDecision) => void }) {
  const [adjusting, setAdjusting] = useState(false);
  const [minutes, setMinutes] = useState('');
  const actualMinutes = Number(minutes);
  const valid = /^\d+$/.test(minutes) && Number.isInteger(actualMinutes) && actualMinutes > 0 && actualMinutes <= Math.ceil(elapsedMinutes);
  return (
    <ModalSurface
      visible
      title="核对执行时间"
      subtitle={`这次执行已经持续 ${formatDuration(elapsedMinutes)}，这段时间是否准确？`}
      onClose={onClose}
      placement="center"
      testID="execution-correction"
    >
      {adjusting ? (
        <View style={styles.form}>
          <Text style={styles.label}>实际投入时长（分钟）</Text>
          <TextInput
            testID="execution-correction-minutes"
            accessibilityLabel="实际投入时长（分钟）"
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="number-pad"
            placeholder="例如 45"
            placeholderTextColor={colors.subtle}
            style={styles.input}
          />
          {minutes && !valid ? <Text style={styles.error}>请输入不超过原记录的正整数分钟。</Text> : null}
          <View style={styles.actions}>
            <ActionButton label="返回" onPress={() => setAdjusting(false)} />
            <ActionButton testID="save-execution-correction" label="保存实际时长" variant="primary" disabled={!valid} onPress={() => onDecision({ kind: 'adjust', minutes: actualMinutes })} />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <ActionButton testID="adjust-execution-time" label="调整实际时长" onPress={() => setAdjusting(true)} />
          <ActionButton testID="keep-execution-time" label="按原记录保存" variant="primary" onPress={() => onDecision({ kind: 'keep' })} />
        </View>
      )}
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  label: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  input: { minHeight: 44, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, paddingHorizontal: 11, fontSize: 13 },
  error: { color: colors.danger, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
});
