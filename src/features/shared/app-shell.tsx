import { usePathname, useRouter, type Href } from 'expo-router';
import { type PropsWithChildren, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { selectPendingProposals } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { parseBackup } from '@/core/persistence';
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
  const store = useReflowStore();
  const { data, resetDemo } = store;
  const [captureOpen, setCaptureOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [importCandidate, setImportCandidate] = useState<{ raw: string; counts: Record<string, number> } | null>(null);
  const pending = selectPendingProposals(data).length;
  const cloudMode = store.proposalServiceKind === 'cloud';
  const contextValue = useMemo(() => ({ openCapture: () => setCaptureOpen(true), openSettings: () => setSettingsOpen(true) }), []);

  function exportData() {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setSettingsMessage('当前 MVP 先支持 Web 下载备份。');
      return;
    }
    const blob = new Blob([store.exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    // 部分环境的下载管理器异步读取 blob，立即 revoke 可能导致下载失败。
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setSettingsMessage('备份已下载。文件未加密，请妥善保管。');
  }

  function chooseImportFile() {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setSettingsMessage('当前 MVP 先支持 Web 导入备份。');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const raw = await file.text();
      const parsed = parseBackup(raw);
      if (parsed.status === 'failure') {
        setImportCandidate(null);
        setSettingsMessage(parsed.message);
        return;
      }
      setImportCandidate({ raw, counts: parsed.counts });
      setSettingsMessage('备份验证通过。确认后才会替换当前数据。');
    };
    input.click();
  }

  async function confirmImport() {
    if (!importCandidate) return;
    const result = await store.importBackup(importCandidate.raw);
    if (result.status === 'failure') {
      setSettingsMessage(result.failure.message);
      return;
    }
    setSettingsMessage('备份已恢复，替换前的数据已保存为本地恢复副本。');
    setImportCandidate(null);
  }

  return (
    <ShellContext.Provider value={contextValue}>
      <View style={styles.viewport}>
        <SafeAreaView style={[styles.app, Platform.OS === 'web' && styles.appWeb, Platform.OS === 'web' && pathname === '/calendar' && styles.appWebWide]} edges={['top', 'left', 'right']}>
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
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>快速捕捉</Text><Text style={textStyles.meta}>先记下来，分类和排期交给建议层。</Text></View><Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={() => setCaptureOpen(false)} style={styles.close}><Text>×</Text></Pressable></View>
            <QuickComposer autoFocus onSubmitted={() => setCaptureOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setSettingsOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Reflow 设置</Text><Text style={textStyles.meta}>V1 · 本地优先时间规划</Text></View><Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={() => setSettingsOpen(false)} style={styles.close}><Text>×</Text></Pressable></View>
            <View style={styles.settingsInfo}><Text style={textStyles.cardTitle}>{cloudMode ? '云端 AI（本地开发模式）' : '本地规则模式'}</Text><Text style={textStyles.meta}>{cloudMode ? '整理时只发送当前输入、来源、参考日期、时区和语言到本地 Gateway，再由 Gateway 调用第三方模型。不会发送任务库、日历、日志、知识卡片、回顾或备份。' : '整理建议在浏览器内由确定性规则生成，不产生第三方 AI 请求。'}</Text></View>
            <View style={styles.settingsInfo}><Text style={textStyles.cardTitle}>正式数据仍保存在这个设备</Text><Text style={textStyles.meta}>无账号、无云同步、无遥测。浏览器存储和导出的 JSON 均不加密；开发用 Gateway 不保存 Capture 或任务数据。</Text></View>
            <View style={styles.settingsActions}><ActionButton testID="export-backup" label="导出备份" onPress={exportData} /><ActionButton testID="import-backup" label="导入备份" onPress={chooseImportFile} /></View>
            {importCandidate ? <View testID="import-preview" style={styles.settingsInfo}><Text style={textStyles.cardTitle}>确认替换当前数据？</Text><Text style={textStyles.meta}>{importCandidate.counts.tasks} 个任务 · {importCandidate.counts.taskPlanEvents} 条计划事件 · {importCandidate.counts.timeEntries} 条耗时记录</Text><ActionButton testID="confirm-import-backup" label="确认恢复备份" variant="primary" onPress={confirmImport} /></View> : null}
            {settingsMessage ? <Text style={textStyles.meta}>{settingsMessage}</Text> : null}
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
  appWebWide: { maxWidth: 1120 },
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
  settingsActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
});
