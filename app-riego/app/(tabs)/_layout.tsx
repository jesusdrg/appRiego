import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#1a7fd4',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { borderTopColor: '#e2e8f0' },
      }}
    >
      <Tabs.Screen
        name="tests"
        options={{ title: 'Tests', tabBarLabel: 'Tests' }}
      />
      <Tabs.Screen
        name="schedules"
        options={{ title: 'Schedules', tabBarLabel: 'Schedules' }}
      />
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarLabel: 'Dashboard' }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarLabel: 'Calendar' }}
      />
      <Tabs.Screen
        name="log"
        options={{ title: 'Log', tabBarLabel: 'Log' }}
      />
    </Tabs>
  );
}
