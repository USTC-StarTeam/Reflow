import { usePathname, useRouter, type Href } from 'expo-router';
import { type PropsWithChildren, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { selectPendingProposals } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import { parseBackup } from '@/core/persistence';
import { QuickComposer } from './quick-composer';
import { ShellContext } from './shell-context';
import { border, colors, layout, radius, shadows, spacing, typography } from './theme';
import { ActionButton, ModalSurface, textStyles } from './ui';

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

  if (!store.hydrated) {
    return (
      <View testID="app-hydrating" style={styles.hydrating}>
        <ActivityIndicator color={colors.primary} />
        <Text style={textStyles.meta}>正在载入本地数据…</Text>
      </View>
    );
  }

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

  if (store.recoveryFailure) {
    return (
      <ShellContext.Provider value={contextValue}>
        <View testID="recovery-failure" style={styles.recoveryFailure}>
          <Text style={textStyles.cardTitle}>本地数据无法恢复</Text>
          <Text style={textStyles.meta}>请导入之前导出的备份，或明确放弃当前损坏数据后开始空白个人空间。</Text>
          <View style={styles.settingsActions}>
            <ActionButton testID="import-recovery-backup" label="导入备份" onPress={chooseImportFile} />
            <ActionButton testID="start-empty-personal-space" label="放弃并开始空白空间" variant="danger" onPress={store.startEmpty} />
          </View>
          {importCandidate ? <View testID="import-preview" style={styles.settingsInfo}><Text style={textStyles.cardTitle}>确认替换当前数据？</Text><Text style={textStyles.meta}>{importCandidate.counts.tasks} 个任务 · {importCandidate.counts.taskPlanEvents} 条计划事件 · {importCandidate.counts.timeEntries} 条耗时记录</Text><ActionButton testID="confirm-import-backup" label="确认恢复备份" variant="primary" onPress={confirmImport} /></View> : null}
          {settingsMessage ? <Text style={textStyles.meta}>{settingsMessage}</Text> : null}
        </View>
      </ShellContext.Provider>
    );
  }

  return (
    <ShellContext.Provider value={contextValue}>
      <View style={styles.viewport}>
        <SafeAreaView style={[styles.app, Platform.OS === 'web' && styles.appWeb, Platform.OS === 'web' && pathname === '/calendar' && styles.appWebWide]} edges={['top', 'left', 'right']}>
          {store.persistenceFailure ? <View testID="persistence-failure" style={styles.persistenceFailure}><Text style={textStyles.cardTitle}>本地保存失败</Text><Text style={textStyles.meta}>最近修改可能尚未保存。</Text><View style={styles.settingsActions}><ActionButton testID="retry-persistence" label="重试保存" variant="danger" onPress={() => { void store.retryPersistence(); }} /><ActionButton testID="export-persistence-backup" label="导出备份" onPress={exportData} /></View></View> : null}
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
                  <View style={[styles.navIconWrap, active && styles.navIconWrapActive]}><Text style={[styles.navIcon, active && styles.navIconActive]}>{item.icon}</Text>{item.label === '收件箱' && pending > 0 ? <View testID="nav-inbox-badge" style={styles.badge}><Text style={styles.badgeText}>{pending}</Text></View> : null}</View>
                  <Text style={[styles.navLabel, active && styles.navTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </SafeAreaView>
      </View>

      <ModalSurface visible={captureOpen} title="快速捕捉" subtitle="先记下来，分类和排期交给建议层。" onClose={() => setCaptureOpen(false)} testID="capture-modal-surface">
        <QuickComposer autoFocus onSubmitted={() => setCaptureOpen(false)} />
      </ModalSurface>

      <ModalSurface visible={settingsOpen} title="Reflow 设置" subtitle="V1 · 本地优先时间规划" onClose={() => setSettingsOpen(false)} testID="settings-modal-surface">
        <View style={styles.settingsInfo}><Text style={textStyles.cardTitle}>{cloudMode ? '云端 AI（本地开发模式）' : '本地规则模式'}</Text><Text style={textStyles.meta}>{cloudMode ? '整理时只发送当前输入、来源、参考日期、时区和语言到本地 Gateway，再由 Gateway 调用第三方模型。不会发送任务库、日历、日志、知识卡片、回顾或备份。' : '整理建议在浏览器内由确定性规则生成，不产生第三方 AI 请求。'}</Text></View>
        <View style={styles.settingsInfo}><Text style={textStyles.cardTitle}>正式数据仍保存在这个设备</Text><Text style={textStyles.meta}>无账号、无云同步、无遥测。浏览器存储和导出的 JSON 均不加密；开发用 Gateway 不保存 Capture 或任务数据。</Text></View>
        <View style={styles.settingsActions}><ActionButton testID="export-backup" label="导出备份" onPress={exportData} /><ActionButton testID="import-backup" label="导入备份" onPress={chooseImportFile} /></View>
        {importCandidate ? <View testID="import-preview" style={styles.settingsInfo}><Text style={textStyles.cardTitle}>确认替换当前数据？</Text><Text style={textStyles.meta}>{importCandidate.counts.tasks} 个任务 · {importCandidate.counts.taskPlanEvents} 条计划事件 · {importCandidate.counts.timeEntries} 条耗时记录</Text><ActionButton testID="confirm-import-backup" label="确认恢复备份" variant="primary" onPress={confirmImport} /></View> : null}
        {settingsMessage ? <Text style={textStyles.meta}>{settingsMessage}</Text> : null}
        <ActionButton testID="reset-demo" label="加载演示数据" variant="danger" onPress={() => { resetDemo(); setSettingsOpen(false); }} />
      </ModalSurface>
    </ShellContext.Provider>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, backgroundColor: colors.page, alignItems: 'center' },
  hydrating: { flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center', gap: 10 },
  recoveryFailure: { flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  persistenceFailure: { margin: spacing.page, padding: spacing.xl, gap: spacing.xs, borderRadius: radius.medium, backgroundColor: colors.dangerSoft, borderWidth: border.width, borderColor: colors.danger },
  app: { flex: 1, width: '100%', maxWidth: layout.appMaxWidth, backgroundColor: colors.surface },
  appWeb: { boxShadow: '0 12px 30px rgba(31, 38, 51, 0.07)' },
  appWebWide: { maxWidth: layout.calendarMaxWidth },
  content: { flex: 1 },
  nav: { position: 'absolute', left: 12, right: 12, bottom: layout.bottomNavInset, minHeight: layout.bottomNavHeight, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', borderRadius: 30, borderWidth: border.width, borderColor: border.color, backgroundColor: 'rgba(255,255,255,0.97)', ...shadows.soft },
  navItem: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: spacing.xxs },
  navItemActive: { backgroundColor: colors.primarySoft },
  navIconWrap: { width: 22, height: 22, borderRadius: 7, backgroundColor: '#D7DCE4', alignItems: 'center', justifyContent: 'center' },
  navIconWrapActive: { backgroundColor: colors.primary },
  navIcon: { color: colors.card, fontSize: 12, lineHeight: 14, fontWeight: '900' },
  navIconActive: { color: colors.card },
  navLabel: { color: colors.muted, ...typography.label, fontWeight: '700' },
  navTextActive: { color: colors.primary },
  badge: { position: 'absolute', right: -9, top: -6, minWidth: 17, height: 17, paddingHorizontal: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  fab: { position: 'absolute', right: 22, bottom: 82, width: layout.floatingActionSize, height: layout.floatingActionSize, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadows.floating },
  fabText: { color: '#FFFFFF', fontSize: 30, lineHeight: 32, fontWeight: '400' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  settingsInfo: { padding: spacing.xl, borderRadius: radius.medium, backgroundColor: colors.surface, borderWidth: border.width, borderColor: border.color, gap: spacing.xs },
  settingsActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
