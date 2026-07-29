import '@/global.css';

import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ReflowProvider } from '@/core/store';
import { AppShell } from '@/features/shared/app-shell';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ReflowProvider>
        <AppShell>
          <Slot />
        </AppShell>
        <StatusBar style="dark" />
      </ReflowProvider>
    </SafeAreaProvider>
  );
}
