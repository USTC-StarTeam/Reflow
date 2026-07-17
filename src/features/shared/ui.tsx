import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useShell } from './shell-context';
import { colors, radius, shadow } from './theme';

export function Page({ children, testID }: PropsWithChildren<{ testID: string }>) {
  return (
    <ScrollView testID={testID} style={styles.page} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle: string; right?: ReactNode }) {
  const { openSettings } = useShell();
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="打开设置" onPress={openSettings} style={styles.brand}>
        <Text style={styles.brandText}>R</Text>
        <View style={styles.brandDot} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.headerRight}>{right ?? <View style={styles.aiPill}><Text style={styles.aiPillText}>AI</Text></View>}</View>
    </View>
  );
}

export function Card({ children, accent, style, testID }: PropsWithChildren<{ accent?: 'ai' | 'active' | 'review'; style?: ViewStyle; testID?: string }>) {
  const accentStyle = accent === 'ai' ? styles.cardAI : accent === 'active' ? styles.cardActive : accent === 'review' ? styles.cardReview : undefined;
  return <View testID={testID} style={[styles.card, accentStyle, style]}>{children}</View>;
}

export function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'green' | 'orange' | 'purple' | 'danger';

export function ActionButton({ label, onPress, variant = 'secondary', disabled = false, testID }: { label: string; onPress: () => void; variant?: ButtonVariant; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[`button_${variant}`], pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'primary' | 'green' | 'orange' | 'purple' }) {
  return <View style={[styles.chip, styles[`chip_${tone}`]]}><Text style={[styles.chipText, styles[`chipText_${tone}`]]}>{label}</Text></View>;
}

export function SegmentedControl<T extends string>({ values, selected, onChange }: { values: { value: T; label: string }[]; selected: T; onChange: (value: T) => void }) {
  return (
    <View style={styles.segmented}>
      {values.map((item) => (
        <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: item.value === selected }} onPress={() => onChange(item.value)} style={[styles.segment, item.value === selected && styles.segmentSelected]}>
          <Text style={[styles.segmentText, item.value === selected && styles.segmentTextSelected]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.empty}><Text style={styles.emptyIcon}>◇</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text></View>;
}

export const textStyles = StyleSheet.create({
  cardTitle: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  body: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  metric: { color: colors.ink, fontSize: 26, lineHeight: 32, fontWeight: '900' },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  pageContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 142, gap: 12 },
  header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  brand: { width: 46, height: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  brandText: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  brandDot: { position: 'absolute', width: 12, height: 12, borderRadius: radius.pill, backgroundColor: colors.ink, right: 0, bottom: 1, borderWidth: 2, borderColor: colors.card },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: { color: colors.ink, fontSize: 21, lineHeight: 25, fontWeight: '900' },
  headerSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  headerRight: { width: 72, alignItems: 'flex-end' },
  aiPill: { minWidth: 52, height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  aiPillText: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, padding: 13, gap: 8, ...shadow },
  cardAI: { backgroundColor: '#FFFCF8', borderLeftWidth: 4, borderLeftColor: colors.orange },
  cardActive: { backgroundColor: '#FBFFFD', borderLeftWidth: 4, borderLeftColor: colors.green },
  cardReview: { backgroundColor: '#FDFBFF', borderLeftWidth: 4, borderLeftColor: colors.purple },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  sectionMeta: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  button: { minHeight: 40, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  button_primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  button_secondary: { backgroundColor: colors.card, borderColor: colors.line },
  button_green: { backgroundColor: colors.greenSoft, borderColor: colors.greenSoft },
  button_orange: { backgroundColor: colors.orangeSoft, borderColor: colors.orangeSoft },
  button_purple: { backgroundColor: colors.purpleSoft, borderColor: colors.purpleSoft },
  button_danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  buttonText: { fontSize: 12, fontWeight: '800' },
  buttonText_primary: { color: '#FFFFFF' },
  buttonText_secondary: { color: '#526070' },
  buttonText_green: { color: colors.green },
  buttonText_orange: { color: colors.orange },
  buttonText_purple: { color: colors.purple },
  buttonText_danger: { color: colors.danger },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  chip: { minHeight: 26, paddingHorizontal: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, justifyContent: 'center' },
  chip_neutral: {}, chip_primary: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }, chip_green: { backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }, chip_orange: { backgroundColor: colors.orangeSoft, borderColor: colors.orangeSoft }, chip_purple: { backgroundColor: colors.purpleSoft, borderColor: colors.purpleSoft },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  chipText_neutral: {}, chipText_primary: { color: colors.primary }, chipText_green: { color: colors.green }, chipText_orange: { color: colors.orange }, chipText_purple: { color: colors.purple },
  segmented: { flexDirection: 'row', padding: 3, backgroundColor: '#E9EDF4', borderRadius: radius.pill, gap: 2 },
  segment: { minWidth: 42, minHeight: 34, borderRadius: radius.pill, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.card, ...shadow },
  segmentText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  segmentTextSelected: { color: colors.primary },
  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 6 },
  emptyIcon: { color: colors.primary, fontSize: 30 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  emptyDetail: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
