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

// ─── Zone Duration Modal ──────────────────────────────────────────────────────

interface ZoneDurationModalProps {
  visible: boolean;
  zoneId: 1 | 2;
  onCancel: () => void;
  onConfirm: (duration: number) => void;
}

function ZoneDurationModal({ visible, zoneId, onCancel, onConfirm }: ZoneDurationModalProps) {
  const [duration, setDuration] = useState('');
  const [unit, setUnit] = useState<'sec' | 'min'>('sec');

  const handleConfirm = () => {
    const value = parseInt(duration, 10);
    if (isNaN(value) || value <= 0) {
      Alert.alert('Invalid duration', 'Enter a positive number.');
      return;
    }
    const seconds = unit === 'min' ? value * 60 : value;
    onConfirm(seconds);
    setDuration('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Zone {zoneId} — Duration</Text>
          <View style={styles.unitToggle}>
            <TouchableOpacity
              style={[styles.unitBtn, unit === 'sec' && styles.unitBtnActive]}
              onPress={() => setUnit('sec')}
            >
              <Text style={[styles.unitBtnText, unit === 'sec' && styles.unitBtnTextActive]}>Seconds</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.unitBtn, unit === 'min' && styles.unitBtnActive]}
              onPress={() => setUnit('min')}
            >
              <Text style={[styles.unitBtnText, unit === 'min' && styles.unitBtnTextActive]}>Minutes</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalInput}
            keyboardType="number-pad"
            value={duration}
            onChangeText={setDuration}
            placeholder={unit === 'sec' ? 'e.g. 30' : 'e.g. 5'}
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

// ─── Tests screen ─────────────────────────────────────────────────────────────

export default function TestsScreen() {
  const { status: bleStatus } = useBleStore();
  const { pump, zones } = useIrrigationStore();

  const [durationModal, setDurationModal] = useState<{ visible: boolean; zoneId: 1 | 2 }>({
    visible: false,
    zoneId: 1,
  });

  const isConnected = bleStatus === 'connected';

  const handlePumpToggle = () => {
    if (!isConnected) return;
    bleService.sendCommand(pump ? cmd.pumpOff() : cmd.pumpOn());
  };

  const handleZoneTap = (zoneId: 1 | 2) => {
    if (!isConnected) return;
    if (zones[zoneId].active) {
      bleService.sendCommand(cmd.zoneOff(zoneId));
      bleService.sendCommand(cmd.pumpOff());
    } else {
      setDurationModal({ visible: true, zoneId });
    }
  };

  const handleZoneConfirm = (duration: number) => {
    bleService.sendCommand(cmd.zoneOn(durationModal.zoneId, duration));
    setDurationModal((prev) => ({ ...prev, visible: false }));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.hint}>Manual controls for testing and maintenance.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pump</Text>
        <TouchableOpacity
          style={[styles.controlBtn, pump ? styles.btnActive : styles.btnInactive]}
          onPress={handlePumpToggle}
          disabled={!isConnected}
        >
          <Text style={[styles.controlBtnText, pump && styles.controlBtnTextActive]}>
            {pump ? 'ON — Tap to turn off' : 'OFF — Tap to turn on'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Zone 1</Text>
        <TouchableOpacity
          style={[styles.controlBtn, zones[1].active ? styles.btnActive : styles.btnInactive]}
          onPress={() => handleZoneTap(1)}
          disabled={!isConnected}
        >
          <Text style={[styles.controlBtnText, zones[1].active && styles.controlBtnTextActive]}>
            {zones[1].active ? 'ON — Tap to turn off' : 'OFF — Tap to turn on'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Zone 2</Text>
        <TouchableOpacity
          style={[styles.controlBtn, zones[2].active ? styles.btnActive : styles.btnInactive]}
          onPress={() => handleZoneTap(2)}
          disabled={!isConnected}
        >
          <Text style={[styles.controlBtnText, zones[2].active && styles.controlBtnTextActive]}>
            {zones[2].active ? 'ON — Tap to turn off' : 'OFF — Tap to turn on'}
          </Text>
        </TouchableOpacity>
      </View>

      {!isConnected && (
        <Text style={styles.disabledNote}>Connect to the device to enable controls.</Text>
      )}

      <ZoneDurationModal
        visible={durationModal.visible}
        zoneId={durationModal.zoneId}
        onCancel={() => setDurationModal((prev) => ({ ...prev, visible: false }))}
        onConfirm={handleZoneConfirm}
      />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 14,
  },
  hint: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
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
    backgroundColor: '#f1f5f9',
  },
  controlBtnText: {
    fontWeight: '600',
    fontSize: 15,
    color: '#475569',
  },
  controlBtnTextActive: {
    color: '#fff',
  },
  disabledNote: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 4,
  },
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
  unitToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
  },
  unitBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  unitBtnActive: {
    backgroundColor: '#1a7fd4',
  },
  unitBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  unitBtnTextActive: {
    color: '#fff',
  },
});
