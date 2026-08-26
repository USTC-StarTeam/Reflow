import type { PropsWithChildren, ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useShell } from './shell-context';
import { border, colors, radius, shadows, spacing, typography } from './theme';

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
      <View style={styles.headerSide}>
        <Pressable testID="page-header-brand" accessibilityRole="button" accessibilityLabel="打开设置" onPress={openSettings} style={({ pressed }) => [styles.brand, pressed && styles.pressed]}>
          <Text style={styles.brandText}>P</Text>
          <View style={styles.brandDot} />
        </Pressable>
      </View>
      <View style={styles.headerCopy}>
        <Text testID="page-header-title" style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>
      <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
    </View>
  );
}

export function Card({ children, accent, style, testID }: PropsWithChildren<{ accent?: 'ai' | 'active' | 'review'; style?: ViewStyle; testID?: string }>) {
  const accentStyle = accent === 'ai' ? styles.cardAI : accent === 'active' ? styles.cardActive : accent === 'review' ? styles.cardReview : undefined;
  return <View testID={testID} style={[styles.card, accentStyle, style]}>{children}</View>;
}

export function SectionLabel({ title, meta }: { title: string; meta?: string }) {
  return <View style={styles.sectionLabel}><Text style={styles.sectionTitle}>{title}</Text>{meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}</View>;
}

// 保留现有页面 API；后续页面重构可以逐步采用语义更明确的 SectionLabel 名称。
export const SectionHeader = SectionLabel;

type ButtonVariant = 'primary' | 'secondary' | 'green' | 'orange' | 'purple' | 'danger';

export function ActionButton({ label, onPress, variant = 'secondary', disabled = false, testID }: { label: string; onPress: () => void; variant?: ButtonVariant; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[`button_${variant}`], pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{label}</Text>
    </Pressable>
  );
}

export function MiniAction({ label, glyph = label, onPress, disabled = false }: { label: string; glyph?: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled || !onPress}
      hitSlop={5}
      onPress={onPress}
      style={({ pressed }) => [styles.miniAction, pressed && styles.pressed, (disabled || !onPress) && styles.disabled]}
    >
      <Text style={styles.miniActionText}>{glyph}</Text>
    </Pressable>
  );
}

export function Chip({ label, tone = 'neutral', size = 'default' }: { label: string; tone?: 'neutral' | 'primary' | 'green' | 'orange' | 'purple'; size?: 'default' | 'header' }) {
  return <View style={[styles.chip, size === 'header' && styles.chipHeader, styles[`chip_${tone}`]]}><Text style={[styles.chipText, size === 'header' && styles.chipTextHeader, styles[`chipText_${tone}`]]}>{label}</Text></View>;
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

export function ModalSurface({ visible, title, subtitle, onClose, children, testID, placement = 'bottom' }: PropsWithChildren<{ visible: boolean; title: string; subtitle?: string; onClose: () => void; testID?: string; placement?: 'bottom' | 'center' }>) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, placement === 'center' && styles.overlayCenter]} onPress={onClose}>
        <Pressable testID={testID} accessibilityViewIsModal style={styles.modalSurface} onPress={(event) => event.stopPropagation()}>
          <View style={styles.modalHeader}>
            <View style={styles.modalCopy}>
              <Text style={styles.modalTitle}>{title}</Text>
              {subtitle ? <Text style={textStyles.meta}>{subtitle}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.empty}><Text style={styles.emptyIcon}>◇</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text></View>;
}

export const textStyles = StyleSheet.create({
  cardTitle: { color: colors.ink, ...typography.cardTitle },
  body: { color: colors.ink, ...typography.body },
  meta: { color: colors.muted, ...typography.meta },
  metric: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '900' },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  pageContent: { paddingHorizontal: spacing.page, paddingTop: spacing.sm, paddingBottom: 132, gap: spacing.lg },
  header: { minHeight: 74, flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  headerSide: { width: 74, alignItems: 'flex-start' },
  brand: { width: 46, height: 46, borderRadius: radius.pill, borderWidth: border.width, borderColor: border.color, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  brandText: { color: colors.primary, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  brandDot: { position: 'absolute', width: 12, height: 12, borderRadius: radius.pill, backgroundColor: colors.ink, right: 0, bottom: 1, borderWidth: 2, borderColor: colors.card },
  headerCopy: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: spacing.xs },
  headerTitle: { color: colors.ink, textAlign: 'center', ...typography.appTitle },
  headerSubtitle: { color: colors.muted, marginTop: spacing.xxs, textAlign: 'center', ...typography.meta },
  headerRight: { alignItems: 'flex-end' },
  card: { backgroundColor: colors.card, borderWidth: border.width, borderColor: border.color, borderRadius: radius.medium, padding: 11, gap: spacing.sm, ...shadows.soft },
  cardAI: { backgroundColor: '#FFFCF8', borderLeftWidth: 4, borderLeftColor: colors.orange },
  cardActive: { backgroundColor: '#FBFFFD', borderLeftWidth: 4, borderLeftColor: colors.green },
  cardReview: { backgroundColor: '#FDFBFF', borderLeftWidth: 4, borderLeftColor: colors.purple },
  sectionLabel: { minHeight: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  sectionTitle: { color: colors.muted, letterSpacing: 0.35, ...typography.label },
  sectionMeta: { color: colors.muted, ...typography.label },
  button: { minHeight: 44, borderRadius: radius.pill, borderWidth: border.width, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  button_primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  button_secondary: { backgroundColor: colors.card, borderColor: colors.line },
  button_green: { backgroundColor: colors.greenSoft, borderColor: colors.greenSoft },
  button_orange: { backgroundColor: colors.orangeSoft, borderColor: colors.orangeSoft },
  button_purple: { backgroundColor: colors.purpleSoft, borderColor: colors.purpleSoft },
  button_danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  buttonText: { ...typography.control },
  buttonText_primary: { color: colors.card },
  buttonText_secondary: { color: '#526070' },
  buttonText_green: { color: colors.green },
  buttonText_orange: { color: colors.orange },
  buttonText_purple: { color: colors.purple },
  buttonText_danger: { color: colors.danger },
  miniAction: { width: 32, height: 34, borderRadius: radius.small, borderWidth: border.width, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  miniActionText: { color: colors.muted, ...typography.control },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  chip: { minHeight: 26, paddingHorizontal: 9, borderRadius: radius.pill, borderWidth: border.width, borderColor: colors.line, backgroundColor: colors.card, justifyContent: 'center' },
  chipHeader: { minWidth: 62, minHeight: 40, paddingHorizontal: spacing.xl, alignItems: 'center' },
  chip_neutral: {},
  chip_primary: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  chip_green: { backgroundColor: colors.greenSoft, borderColor: colors.greenSoft },
  chip_orange: { backgroundColor: colors.orangeSoft, borderColor: colors.orangeSoft },
  chip_purple: { backgroundColor: colors.purpleSoft, borderColor: colors.purpleSoft },
  chipText: { color: colors.muted, ...typography.label },
  chipTextHeader: { ...typography.control },
  chipText_neutral: {},
  chipText_primary: { color: colors.primary },
  chipText_green: { color: colors.green },
  chipText_orange: { color: colors.orange },
  chipText_purple: { color: colors.purple },
  segmented: { flexDirection: 'row', padding: 3, backgroundColor: '#E9EDF4', borderRadius: radius.pill, gap: spacing.xxs },
  segment: { minWidth: 40, minHeight: 34, borderRadius: radius.pill, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.card, ...shadows.soft },
  segmentText: { color: colors.muted, ...typography.meta, fontWeight: '800' },
  segmentTextSelected: { color: colors.primary },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', alignItems: 'center', padding: spacing.xxl },
  overlayCenter: { justifyContent: 'center' },
  modalSurface: { width: '100%', maxWidth: 452, maxHeight: '88%', borderRadius: radius.sheet, backgroundColor: colors.card, padding: spacing.xxxl, gap: spacing.xl, ...shadows.floating },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.xl },
  modalCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  modalTitle: { color: colors.ink, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  close: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: border.width, borderColor: border.color },
  closeText: { color: colors.muted, fontSize: 20, lineHeight: 22 },
  empty: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 18, gap: spacing.sm },
  emptyIcon: { color: colors.primary, fontSize: 28 },
  emptyTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  emptyDetail: { color: colors.muted, textAlign: 'center', ...typography.meta },
});
