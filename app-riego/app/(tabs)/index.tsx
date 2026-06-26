import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useBleStore } from '@/src/stores/useBleStore';
import { useIrrigationStore } from '@/src/stores/useIrrigationStore';
import { bleService } from '@/src/ble/BleService';
import { cmd } from '@/src/ble/bleConstants';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format a uptime value (milliseconds) into a human-readable "Xh Ym" string.
 * Returns '—' when the value is absent.
 */
function formatUptime(ms?: number): string {
  if (ms === undefined || ms === null) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'connected':
      return '#22c55e';
    case 'scanning':
      return '#f59e0b';
    case 'disconnected':
      return '#ef4444';
    default:
      return '#94a3b8';
  }
}

// ─── Zone Duration Modal ─────────────────────────────────────────────────────

interface ZoneDurationModalProps {
  visible: boolean;
  zoneId: 1 | 2;
  onCancel: () => void;
  onConfirm: (duration: number) => void;
}

function ZoneDurationModal({ visible, zoneId, onCancel, onConfirm }: ZoneDurationModalProps) {
  const [duration, setDuration] = useState('');

  const handleConfirm = () => {
    const seconds = parseInt(duration, 10);
    if (isNaN(seconds) || seconds <= 0) {
      Alert.alert('Invalid duration', 'Enter a positive number of seconds.');
      return;
    }
    onConfirm(seconds);
    setDuration('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Zone {zoneId} — Duration</Text>
          <Text style={styles.modalLabel}>Duration (seconds)</Text>
          <TextInput
            style={styles.modalInput}
            keyboardType="number-pad"
            value={duration}
            onChangeText={setDuration}
            placeholder="e.g. 300"
            autoFocus
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={onCancel}>
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleConfirm}>
              <Text style={styles.btnPrimaryText}>Start</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { status: bleStatus } = useBleStore();
  const { pump, zones, systemStatus } = useIrrigationStore();

  const [durationModal, setDurationModal] = useState<{ visible: boolean; zoneId: 1 | 2 }>({
    visible: false,
    zoneId: 1,
  });

  const isConnected = bleStatus === 'connected';

  // ─── Pump control ──────────────────────────────────────────────────────────
  const handlePumpToggle = () => {
    if (!isConnected) return;
    bleService.sendCommand(pump ? cmd.pumpOff() : cmd.pumpOn());
  };

  // ─── Zone control ──────────────────────────────────────────────────────────
  const handleZoneTap = (zoneId: 1 | 2) => {
    if (!isConnected) return;
    const zoneActive = zones[zoneId].active;

    if (zoneActive) {
      // Zone is on → turn off immediately
      bleService.sendCommand(cmd.zoneOff(zoneId));
    } else {
      // Zone is off → prompt for duration
      setDurationModal({ visible: true, zoneId });
    }
  };

  const handleZoneConfirm = (duration: number) => {
    bleService.sendCommand(cmd.zoneOn(durationModal.zoneId, duration));
    setDurationModal((prev) => ({ ...prev, visible: false }));
  };

  const handleZoneCancel = () => {
    setDurationModal((prev) => ({ ...prev, visible: false }));
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Connection banner */}
      <View style={[styles.banner, { backgroundColor: statusColor(bleStatus) }]}>
        <Text style={styles.bannerText}>
          {bleStatus === 'idle' && 'Not connected'}
          {bleStatus === 'scanning' && 'Scanning for RiegoESP32…'}
          {bleStatus === 'connected' && 'Connected to RiegoESP32'}
          {bleStatus === 'disconnected' && 'Disconnected'}
        </Text>
        {bleStatus === 'disconnected' && (
          <TouchableOpacity style={styles.reconnectBtn} onPress={() => bleService.connect()}>
            <Text style={styles.reconnectBtnText}>Reconnect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pump card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pump</Text>
        <TouchableOpacity
          style={[styles.controlBtn, pump ? styles.btnActive : styles.btnInactive]}
          onPress={handlePumpToggle}
          disabled={!isConnected}
        >
          <Text style={styles.controlBtnText}>{pump ? 'ON — Tap to turn off' : 'OFF — Tap to turn on'}</Text>
        </TouchableOpacity>
      </View>

      {/* Zone 1 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Zone 1</Text>
        <TouchableOpacity
          style={[styles.controlBtn, zones[1].active ? styles.btnActive : styles.btnInactive]}
          onPress={() => handleZoneTap(1)}
          disabled={!isConnected}
        >
          <Text style={styles.controlBtnText}>
            {zones[1].active ? 'ON — Tap to turn off' : 'OFF — Tap to turn on'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Zone 2 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Zone 2</Text>
        <TouchableOpacity
          style={[styles.controlBtn, zones[2].active ? styles.btnActive : styles.btnInactive]}
          onPress={() => handleZoneTap(2)}
          disabled={!isConnected}
        >
          <Text style={styles.controlBtnText}>
            {zones[2].active ? 'ON — Tap to turn off' : 'OFF — Tap to turn on'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* System stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>System Status</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Uptime</Text>
          <Text style={styles.statValue}>{formatUptime(systemStatus?.uptime)}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Current time</Text>
          <Text style={styles.statValue}>{systemStatus?.local_time ?? '—'}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Auto mode</Text>
          <Text style={styles.statValue}>{systemStatus?.auto_mode ? 'On' : 'Off'}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Time synced</Text>
          <Text style={styles.statValue}>{systemStatus?.time_synced ? 'Yes' : 'No'}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Schedules</Text>
          <Text style={styles.statValue}>{systemStatus?.schedule_count ?? '—'}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Pump manual</Text>
          <Text style={styles.statValue}>{systemStatus?.pump_manual ? 'Yes' : 'No'}</Text>
        </View>
      </View>

      {/* Zone duration modal */}
      <ZoneDurationModal
        visible={durationModal.visible}
        zoneId={durationModal.zoneId}
        onCancel={handleZoneCancel}
        onConfirm={handleZoneConfirm}
      />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  banner: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  bannerText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  reconnectBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  reconnectBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  controlBtn: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnActive: {
    backgroundColor: '#1a7fd4',
  },
  btnInactive: {
    backgroundColor: '#e2e8f0',
  },
  controlBtnText: {
    fontWeight: '600',
    fontSize: 15,
    color: '#1e293b',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  statLabel: {
    color: '#64748b',
    fontSize: 14,
  },
  statValue: {
    color: '#1e293b',
    fontSize: 14,
    fontWeight: '500',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    gap: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  btnPrimary: {
    backgroundColor: '#1a7fd4',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '600',
  },
  btnSecondary: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  btnSecondaryText: {
    color: '#475569',
    fontWeight: '600',
  },
});
