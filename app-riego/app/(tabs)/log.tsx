import { FlatList, View, Text, StyleSheet } from 'react-native';
import { useIrrigationStore } from '../../src/stores/useIrrigationStore';
import { LogEntry } from '../../src/ble/bleConstants';

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  info: '#3b82f6',
  event: '#22c55e',
  error: '#ef4444',
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}:${seconds}`;
}

interface LogRowProps {
  entry: LogEntry;
}

function LogRow({ entry }: LogRowProps) {
  const levelColor = LEVEL_COLORS[entry.level] ?? '#6b7280';
  return (
    <View style={styles.row}>
      <View style={[styles.levelBadge, { backgroundColor: levelColor }]}>
        <Text style={styles.levelText}>{entry.level.toUpperCase()}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.timestamp}>{formatTimestamp(entry.ts)}</Text>
        <Text style={styles.message}>{entry.message}</Text>
      </View>
    </View>
  );
}

export default function LogScreen() {
  const log = useIrrigationStore((s) => s.log);

  if (log.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No activity yet</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={log}
      keyExtractor={(item, index) => `${item.ts}-${index}`}
      renderItem={({ item }) => <LogRow entry={item} />}
      contentContainerStyle={styles.list}
      style={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  list: {
    padding: 16,
    gap: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 10,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  levelBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  levelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  rowContent: {
    flex: 1,
  },
  timestamp: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    color: '#1e293b',
    lineHeight: 18,
  },
});
