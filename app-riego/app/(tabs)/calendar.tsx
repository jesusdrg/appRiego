import { useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { useIrrigationStore } from '../../src/stores/useIrrigationStore';
import { aggregateMarkedDates, computeFireDates } from '../../src/utils/scheduleUtils';
import { Schedule } from '../../src/ble/bleConstants';

const ZONE_COLORS: Record<number, string> = {
  1: '#3b82f6',
  2: '#22c55e',
};

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function recurrenceSummary(s: Schedule): string {
  switch (s.type) {
    case 'daily':
      return 'Every day';
    case 'weekly': {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const active = days.filter((_, i) => (s.days_mask >> i) & 1);
      return active.length > 0 ? active.join(', ') : 'No days set';
    }
    case 'monthly':
      return `Monthly`;
    case 'interval':
      return `Every ${s.interval_days} day${s.interval_days !== 1 ? 's' : ''}`;
    case 'once':
      return `Once on ${s.date}`;
    default:
      return s.type;
  }
}

interface ScheduleRowProps {
  schedule: Schedule;
}

function ScheduleRow({ schedule }: ScheduleRowProps) {
  const dotColor = ZONE_COLORS[schedule.zone_id] ?? '#6b7280';
  return (
    <View style={styles.scheduleRow}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.scheduleInfo}>
        <Text style={styles.scheduleTitle}>
          Zone {schedule.zone_id} — {formatTime(schedule.hour, schedule.minute)}
        </Text>
        <Text style={styles.scheduleMeta}>
          {recurrenceSummary(schedule)} · {schedule.duration} min
        </Text>
      </View>
    </View>
  );
}

export default function CalendarScreen() {
  const schedules = useIrrigationStore((s) => s.schedules);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const markedDates = aggregateMarkedDates(schedules);

  // Add selected day marker merged with existing dots
  const markedDatesWithSelected: typeof markedDates = selectedDate
    ? {
        ...markedDates,
        [selectedDate]: {
          dots: markedDates[selectedDate]?.dots ?? [],
          selected: true,
          selectedColor: '#0f172a',
        } as { dots: { color: string }[]; selected?: boolean; selectedColor?: string },
      }
    : markedDates;

  // Schedules that fire on the selected date
  const schedulesForDay: Schedule[] = selectedDate
    ? schedules.filter((s) => {
        const [year, month, day] = selectedDate.split('-').map(Number);
        const from = new Date(year, month - 1, day, 0, 0, 0, 0);
        const fires = computeFireDates(s, from, 1);
        return fires.length > 0;
      })
    : [];

  function handleDayPress(day: DateData) {
    setSelectedDate(day.dateString);
  }

  return (
    <View style={styles.container}>
      <Calendar
        markingType="multi-dot"
        markedDates={markedDatesWithSelected}
        onDayPress={handleDayPress}
        theme={{
          todayTextColor: '#3b82f6',
          selectedDayBackgroundColor: '#0f172a',
          arrowColor: '#0f172a',
        }}
      />

      {selectedDate && (
        <View style={styles.dayPanel}>
          <Text style={styles.dayPanelTitle}>
            {selectedDate}
          </Text>
          {schedulesForDay.length === 0 ? (
            <Text style={styles.emptyText}>No schedules for this day</Text>
          ) : (
            <FlatList
              data={schedulesForDay}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => <ScheduleRow schedule={item} />}
              contentContainerStyle={styles.dayList}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  dayPanel: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  dayPanelTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  dayList: {
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 24,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  scheduleMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
});
