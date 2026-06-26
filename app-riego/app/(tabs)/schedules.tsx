import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Switch,
  RefreshControl,
  Alert,
} from 'react-native';
import { router, useNavigation } from 'expo-router';
import { useIrrigationStore } from '@/src/stores/useIrrigationStore';
import { useBleStore } from '@/src/stores/useBleStore';
import { bleService } from '@/src/ble/BleService';
import { cmd, Schedule } from '@/src/ble/bleConstants';
import { getDayLabels, getMonthDays } from '@/src/utils/maskUtils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatRecurrence(schedule: Schedule): string {
  switch (schedule.type) {
    case 'daily':
      return 'Every day';
    case 'weekly': {
      const labels = getDayLabels(schedule.days_mask);
      return labels.length > 0 ? `Every ${labels.join(', ')}` : 'Weekly (no days set)';
    }
    case 'monthly': {
      const days = getMonthDays(schedule.month_mask);
      return days.length > 0 ? `Monthly on day${days.length > 1 ? 's' : ''}: ${days.join(', ')}` : 'Monthly (no days set)';
    }
    case 'interval':
      return `Every ${schedule.interval_days} day${schedule.interval_days !== 1 ? 's' : ''} from ${schedule.date}`;
    case 'once':
      return `Once on ${schedule.date}`;
    default:
      return schedule.type;
  }
}

// ─── Schedule row ─────────────────────────────────────────────────────────────

interface ScheduleRowProps {
  schedule: Schedule;
  isConnected: boolean;
}

function ScheduleRow({ schedule, isConnected }: ScheduleRowProps) {
  const handleToggleActive = () => {
    if (!isConnected) return;
    const updated: Schedule = { ...schedule, active: !schedule.active };
    bleService.sendCommand(cmd.addSchedule(updated));
    // Firmware re-emits full schedule list → accumulation path updates store
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Schedule',
      `Delete this ${schedule.type} schedule at ${formatTime(schedule.hour, schedule.minute)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            bleService.sendCommand(cmd.deleteSchedule(schedule.id));
            // Firmware re-emits full list via sendAllSchedules; accumulation path refreshes store
          },
        },
      ],
    );
  };

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowType}>{schedule.type.charAt(0).toUpperCase() + schedule.type.slice(1)}</Text>
        <Text style={styles.rowTime}>{formatTime(schedule.hour, schedule.minute)}</Text>
        <Text style={styles.rowDuration}>{schedule.duration} min</Text>
        <Text style={styles.rowRecurrence}>{formatRecurrence(schedule)}</Text>
      </View>
      <View style={styles.rowActions}>
        <Switch
          value={schedule.active}
          onValueChange={handleToggleActive}
          disabled={!isConnected}
          trackColor={{ true: '#1a7fd4', false: '#cbd5e1' }}
          thumbColor="#fff"
        />
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDelete}
          disabled={!isConnected}
        >
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Schedules screen ─────────────────────────────────────────────────────────

export default function SchedulesScreen() {
  const navigation = useNavigation();
  const { schedules } = useIrrigationStore();
  const { status: bleStatus } = useBleStore();
  const isConnected = bleStatus === 'connected';

  const [refreshing, setRefreshing] = useState(false);

  // Add "+" button in tab header
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/schedule/new')}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const onRefresh = useCallback(async () => {
    if (!isConnected) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    await bleService.sendCommand(cmd.getStatus());
    // Give the firmware a moment to re-emit the schedule list
    setTimeout(() => setRefreshing(false), 1500);
  }, [isConnected]);

  // Group schedules by zone_id
  const zone1 = schedules.filter((s) => s.zone_id === 1);
  const zone2 = schedules.filter((s) => s.zone_id === 2);

  const sections = [
    { title: 'Zone 1', data: zone1 },
    { title: 'Zone 2', data: zone2 },
  ];

  if (schedules.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No schedules yet</Text>
        <Text style={styles.emptySubtext}>Tap "+ Add" to create your first schedule</Text>
        <TouchableOpacity
          style={styles.addScheduleBtn}
          onPress={() => router.push('/schedule/new')}
        >
          <Text style={styles.addScheduleBtnText}>+ Add Schedule</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a7fd4" />
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
      )}
      renderItem={({ item }) => (
        <ScheduleRow schedule={item} isConnected={isConnected} />
      )}
      ListEmptyComponent={null}
      renderSectionFooter={({ section }) =>
        section.data.length === 0 ? (
          <View style={styles.sectionEmpty}>
            <Text style={styles.sectionEmptyText}>No schedules for this zone</Text>
          </View>
        ) : null
      }
    />
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionEmpty: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionEmptyText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  row: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  rowTime: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a7fd4',
    letterSpacing: 0.5,
  },
  rowDuration: {
    fontSize: 13,
    color: '#64748b',
  },
  rowRecurrence: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  rowActions: {
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
  },
  deleteBtn: {
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  deleteBtnText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  addScheduleBtn: {
    marginTop: 8,
    backgroundColor: '#1a7fd4',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  addScheduleBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  addBtn: {
    marginRight: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  addBtnText: {
    color: '#1a7fd4',
    fontWeight: '700',
    fontSize: 15,
  },
});
