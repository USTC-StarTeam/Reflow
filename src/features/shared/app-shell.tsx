import { usePathname, useRouter, type Href } from 'expo-router';
import { type PropsWithChildren, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { selectPendingProposals } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { QuickComposer } from './quick-composer';
import { ShellContext } from './shell-context';
import { colors, radius, shadow } from './theme';
import { ActionButton, textStyles } from './ui';

const navItems: { href: Href; match: string; label: string; icon: string }[] = [
  { href: '/', match: '/', label: '今天', icon: '⌂' },
  { href: '/inbox', match: '/inbox', label: '收件箱', icon: '▤' },
  { href: '/active', match: '/active', label: '进行中', icon: '◷' },
  { href: '/calendar', match: '/calendar', label: '日历', icon: '▦' },
  { href: '/review', match: '/review', label: '回顾', icon: '◎' },
];

export function AppShell({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, resetDemo } = useReflowStore();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pending = selectPendingProposals(data).length;
  const contextValue = useMemo(() => ({ openCapture: () => setCaptureOpen(true), openSettings: () => setSettingsOpen(true) }), []);

  return (
    <ShellContext.Provider value={contextValue}>
      <View style={styles.viewport}>
        <SafeAreaView style={[styles.app, Platform.OS === 'web' && styles.appWeb]} edges={['top', 'left', 'right']}>
          <View style={styles.content}>{children}</View>
          {pathname !== '/' ? (
            <Pressable testID="global-capture" accessibilityRole="button" accessibilityLabel="快速添加" onPress={() => setCaptureOpen(true)} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
              <Text style={styles.fabText}>＋</Text>
            </Pressable>
          ) : null}
          <View style={styles.nav} accessibilityRole="tablist">
            {navItems.map((item) => {
              const active = pathname === item.match;
              return (
                <Pressable
                  key={item.match}
                  testID={`nav-${item.label}`}
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: active }}
                  onPress={() => router.replace(item.href)}
                  style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed]}
                >
                  <View><Text style={[styles.navIcon, active && styles.navTextActive]}>{item.icon}</Text>{item.label === '收件箱' && pending > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{pending}</Text></View> : null}</View>
                  <Text style={[styles.navLabel, active && styles.navTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </SafeAreaView>
      </View>

      <Modal visible={captureOpen} transparent animationType="fade" onRequestClose={() => setCaptureOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setCaptureOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>快速捕捉</Text><Text style={textStyles.meta}>先记下来，分类和排期交给建议层。</Text></View><Pressable accessibilityLabel="关闭" onPress={() => setCaptureOpen(false)} style={styles.close}><Text>×</Text></Pressable></View>
            <QuickComposer autoFocus onSubmitted={() => setCaptureOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setSettingsOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Reflow 设置</Text><Text style={textStyles.meta}>第一版 Web Demo · 本地数据</Text></View><Pressable accessibilityLabel="关闭" onPress={() => setSettingsOpen(false)} style={styles.close}><Text>×</Text></Pressable></View>
            <View style={styles.settingsInfo}><Text style={textStyles.cardTitle}>数据只保存在这个浏览器</Text><Text style={textStyles.meta}>重置后会恢复用于演示核心闭环的种子任务。</Text></View>
            <ActionButton testID="reset-demo" label="重置 Demo 数据" variant="danger" onPress={() => { resetDemo(); setSettingsOpen(false); }} />
          </Pressable>
        </Pressable>
      </Modal>
    </ShellContext.Provider>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, backgroundColor: colors.page, alignItems: 'center' },
  app: { flex: 1, width: '100%', maxWidth: 480, backgroundColor: colors.surface },
  appWeb: { boxShadow: `0 0 42px ${colors.shadow}` },
  content: { flex: 1 },
  nav: { position: 'absolute', left: 12, right: 12, bottom: 10, minHeight: 66, paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center', borderRadius: 34, borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(255,255,255,0.97)', ...shadow },
  navItem: { flex: 1, minHeight: 52, borderRadius: 27, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navItemActive: { backgroundColor: colors.primarySoft },
  navIcon: { color: colors.muted, fontSize: 18, lineHeight: 20, fontWeight: '800' },
  navLabel: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  navTextActive: { color: colors.primary },
  badge: { position: 'absolute', right: -10, top: -5, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: radius.pill, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  fab: { position: 'absolute', right: 22, bottom: 88, width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadow },
  fabText: { color: '#FFFFFF', fontSize: 30, lineHeight: 32, fontWeight: '400' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end', alignItems: 'center', padding: 14 },
  modalCard: { width: '100%', maxWidth: 452, borderRadius: 24, backgroundColor: colors.surface, padding: 16, gap: 16, ...shadow },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  modalTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginBottom: 3 },
  close: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  settingsInfo: { padding: 14, borderRadius: radius.medium, backgroundColor: colors.card, gap: 5 },
});
