import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { bleService } from '@/src/ble/BleService';
import { useBleStore } from '@/src/stores/useBleStore';

export default function RootLayout() {
  useEffect(() => {
    // Initialize BleService once at app startup
    bleService.init();

    // Reconnect on foreground resume when disconnected
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const { status } = useBleStore.getState();
        if (status === 'disconnected' || status === 'idle') {
          bleService.connect();
        }
      }
    });

    // Start initial scan
    bleService.connect();

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="schedule/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: 'Add Schedule',
            headerTintColor: '#1a7fd4',
          }}
        />
      </Stack>
    </>
  );
}
