import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useBleStore } from '@/src/stores/useBleStore';
import { useIrrigationStore } from '@/src/stores/useIrrigationStore';
import { bleService } from '@/src/ble/BleService';
import { computeFireDates } from '@/src/utils/scheduleUtils';
import { Schedule } from '@/src/ble/bleConstants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(ms?: number): string {
  if (!ms) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function nextEvent(schedules: Schedule[]): { label: string; when: string } | null {
  const now = new Date();
  let earliest: Date | null = null;
  let target: Schedule | null = null;

  for (const s of schedules) {
    if (!s.active) continue;
    const fires = computeFireDates(s, now, 30);
    if (fires.length > 0 && (!earliest || fires[0] < earliest)) {
      earliest = fires[0];
      target = s;
    }
  }

  if (!earliest || !target) return null;

  const diffMs = earliest.getTime() - now.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffM = Math.floor((diffMs % 3600000) / 60000);

  let when = '';
  if (diffH < 1) when = `in ${diffM}m`;
  else if (diffH < 24) when = `in ${diffH}h ${diffM}m`;
  else {
    const days = Math.floor(diffH / 24);
    when = days === 1 ? 'tomorrow' : `in ${days} days`;
  }

  const timeStr = `${String(earliest.getHours()).padStart(2, '0')}:${String(earliest.getMinutes()).padStart(2, '0')}`;

  return {
    label: `Zone ${target.zone_id} · ${target.type} · ${timeStr}`,
    when,
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { status: bleStatus } = useBleStore();
  const { zones, schedules, systemStatus } = useIrrigationStore();

  const isConnected = bleStatus === 'connected';
  const zone1Active = zones[1].active;
  const zone2Active = zones[2].active;
  const anyActive = zone1Active || zone2Active;

  const next = useMemo(() => nextEvent(schedules), [schedules]);

  const zone1Count = schedules.filter((s) => s.zone_id === 1).length;
  const zone2Count = schedules.filter((s) => s.zone_id === 2).length;

  return (
    <View style={styles.root}>
      {/* Connection pill */}
      <View style={styles.pillRow}>
        <View style={[styles.pill, isConnected ? styles.pillConnected : styles.pillDisconnected]}>
          <View style={[styles.dot, isConnected ? styles.dotConnected : styles.dotDisconnected]} />
          <Text style={styles.pillText}>
            {bleStatus === 'connected' && 'Connected'}
            {bleStatus === 'scanning' && 'Scanning…'}
            {bleStatus === 'disconnected' && 'Disconnected'}
            {bleStatus === 'idle' && 'Not connected'}
          </Text>
          {bleStatus === 'disconnected' && (
            <TouchableOpacity onPress={() => bleService.connect()} style={styles.reconnectInline}>
              <Text style={styles.reconnectText}>Reconnect</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main status card */}
      <View style={styles.statusCard}>
        {anyActive ? (
          <>
            <Text style={styles.statusIcon}>💧</Text>
            <Text style={styles.statusTitle}>Irrigating</Text>
            {zone1Active && <Text style={styles.statusSub}>Zone 1 active</Text>}
            {zone2Active && <Text style={styles.statusSub}>Zone 2 active</Text>}
          </>
        ) : (
          <>
            <Text style={styles.statusIcon}>✅</Text>
            <Text style={styles.statusTitle}>All clear</Text>
            <Text style={styles.statusSub}>No active irrigation</Text>
          </>
        )}
      </View>

      {/* Next event */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Next event</Text>
        {next ? (
          <>
            <Text style={styles.nextLabel}>{next.label}</Text>
            <Text style={styles.nextWhen}>{next.when}</Text>
          </>
        ) : (
          <Text style={styles.nextEmpty}>No upcoming schedules</Text>
        )}
      </View>

      {/* Zone summary */}
      <View style={styles.row}>
        <View style={[styles.zoneCard, zone1Active && styles.zoneCardActive]}>
          <Text style={styles.zoneTitle}>Zone 1</Text>
          <Text style={styles.zoneStatus}>{zone1Active ? '● Active' : '○ Idle'}</Text>
          <Text style={styles.zoneSched}>{zone1Count} schedule{zone1Count !== 1 ? 's' : ''}</Text>
        </View>
        <View style={[styles.zoneCard, zone2Active && styles.zoneCardActive]}>
          <Text style={styles.zoneTitle}>Zone 2</Text>
          <Text style={styles.zoneStatus}>{zone2Active ? '● Active' : '○ Idle'}</Text>
          <Text style={styles.zoneSched}>{zone2Count} schedule{zone2Count !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* System row */}
      <View style={styles.sysRow}>
        <Text style={styles.sysItem}>{systemStatus?.local_time ?? '—'}</Text>
        <Text style={styles.sysDivider}>·</Text>
        <Text style={styles.sysItem}>Auto {systemStatus?.auto_mode ? '✓' : '✗'}</Text>
        <Text style={styles.sysDivider}>·</Text>
        <Text style={styles.sysItem}>Up {formatUptime(systemStatus?.uptime)}</Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  pillRow: {
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 6,
  },
  pillConnected: {
    backgroundColor: '#dcfce7',
  },
  pillDisconnected: {
    backgroundColor: '#fee2e2',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotConnected: {
    backgroundColor: '#22c55e',
  },
  dotDisconnected: {
    backgroundColor: '#ef4444',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  reconnectInline: {
    marginLeft: 4,
  },
  reconnectText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444',
    textDecorationLine: 'underline',
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statusIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
  },
  statusSub: {
    fontSize: 14,
    color: '#64748b',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  nextLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  nextWhen: {
    fontSize: 13,
    color: '#1a7fd4',
    fontWeight: '500',
  },
  nextEmpty: {
    fontSize: 14,
    color: '#94a3b8',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  zoneCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  zoneCardActive: {
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#1a7fd4',
  },
  zoneTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  zoneStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  zoneSched: {
    fontSize: 12,
    color: '#94a3b8',
  },
  sysRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  sysItem: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  sysDivider: {
    fontSize: 12,
    color: '#cbd5e1',
  },
});
