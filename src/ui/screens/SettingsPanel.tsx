import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  useColorScheme,
  NativeModules,
  Platform,
  ToastAndroid,
  Alert,
} from 'react-native';
import {openBugReport} from '../../utils/bugReport';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useSettingsStore} from '../../settings/settingsStore';
import {AlertVerbosity} from '../../alerts/types';
import {Units, TrafficMode} from '../../settings/types';
import {Strings} from '../../constants/strings';

// Character name + accent label per region
const REGION_VOICE: Record<string, {character: string; label: string}> = {
  US: {character: 'Echo',  label: 'American'},
  GB: {character: 'Scout', label: 'British'},
  AU: {character: 'Nova',  label: 'Australian'},
};

interface VoiceSlot {
  id: string;
  character: string;
  label: string;     // e.g. "American"
}

interface Props {
  onClose: () => void;
  onAddDevice: () => void;
  onRemoveDevice: (deviceId: string) => void;
}

export function SettingsPanel({onClose, onAddDevice, onRemoveDevice}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const verbosity = useSettingsStore(s => s.verbosity);
  const units = useSettingsStore(s => s.units);
  const pairedDevices = useSettingsStore(s => s.pairedDevices);
  const setVerbosity = useSettingsStore(s => s.setVerbosity);
  const setUnits = useSettingsStore(s => s.setUnits);
  const removePairedDevice = useSettingsStore(s => s.removePairedDevice);
  const debugMode = useSettingsStore(s => s.debugMode);
  const setDebugMode = useSettingsStore(s => s.setDebugMode);
  const trafficMode = useSettingsStore(s => s.trafficMode);
  const setTrafficMode = useSettingsStore(s => s.setTrafficMode);
  const voiceId = useSettingsStore(s => s.voiceId);
  const setVoiceId = useSettingsStore(s => s.setVoiceId);

  const [voiceSlots, setVoiceSlots] = useState<VoiceSlot[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    NativeModules.VoxTTS?.getVoices()
      .then((raw: {id: string; region: string}[]) => {
        const slots = raw
          .filter(v => REGION_VOICE[v.region])
          .map(v => ({
            id: v.id,
            character: REGION_VOICE[v.region].character,
            label: REGION_VOICE[v.region].label,
          }));
        setVoiceSlots(slots);
      })
      .catch(() => {});
  }, []);

  const currentCharacter =
    voiceId == null
      ? 'System Default'
      : (voiceSlots.find(s => s.id === voiceId)?.character ?? 'System Default');

  const handleSelect = (id: string | null) => {
    setDropdownOpen(false);
    setVoiceId(id);
    NativeModules.VoxTTS?.setVoice(id ?? '');
    NativeModules.VoxTTS?.speak('1 vehicle, medium speed');
  };

  const handleBugReport = async () => {
    try {
      await openBugReport();
    } catch {
      if (Platform.OS === 'android') {
        ToastAndroid.show("Couldn't open browser", ToastAndroid.SHORT);
      } else {
        Alert.alert('Error', "Couldn't open browser");
      }
    }
  };

  const textStyle = [styles.text, isDark && styles.textDark];
  const labelStyle = [styles.sectionLabel, isDark && styles.textDim];
  const containerStyle = [styles.container, isDark && styles.containerDark];

  return (
    <View style={containerStyle} testID="settings-panel">
      <View style={[styles.header, {paddingTop: insets.top + 12}]}>
        <TouchableOpacity testID="settings-close" onPress={onClose}>
          <Text style={[styles.closeButton, isDark && styles.textDark]}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + 40}]}>
        {/* Alert Verbosity */}
        <Text style={labelStyle}>{Strings.settingsVerbosity}</Text>
        <View style={styles.segmentRow} testID="verbosity-control">
          {([AlertVerbosity.Detailed, AlertVerbosity.Balanced, AlertVerbosity.Minimal] as AlertVerbosity[]).map(v => (
            <TouchableOpacity
              key={v}
              testID={`verbosity-${v}`}
              accessibilityState={{selected: verbosity === v}}
              style={[styles.segment, styles.segmentThird, verbosity === v && styles.segmentActive]}
              onPress={() => setVerbosity(v)}>
              <Text
                style={[
                  styles.segmentText,
                  verbosity === v && styles.segmentTextActive,
                ]}>
                {v === AlertVerbosity.Detailed
                  ? Strings.settingsVerbosityDetailed
                  : v === AlertVerbosity.Balanced
                    ? Strings.settingsVerbosityBalanced
                    : Strings.settingsVerbosityMinimal}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Units */}
        <Text style={[labelStyle, styles.sectionSpacing]}>{Strings.settingsUnits}</Text>
        <View style={styles.segmentRow} testID="units-control">
          {(['imperial', 'metric'] as Units[]).map(u => (
            <TouchableOpacity
              key={u}
              testID={`units-${u}`}
              style={[styles.segment, units === u && styles.segmentActive]}
              onPress={() => setUnits(u)}>
              <Text
                style={[styles.segmentText, units === u && styles.segmentTextActive]}>
                {u === 'imperial' ? Strings.settingsUnitsImperial : Strings.settingsUnitsMetric}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Announcer Voice — Android only */}
        {Platform.OS === 'android' && (
          <>
            <Text style={[labelStyle, styles.sectionSpacing]}>ANNOUNCER VOICE</Text>
            <TouchableOpacity
              testID="voice-dropdown-trigger"
              style={[styles.dropdown, isDark && styles.dropdownDark]}
              onPress={() => setDropdownOpen(true)}>
              <Text style={[styles.dropdownValue, isDark && styles.textDark]}>
                {currentCharacter}
              </Text>
              <Text style={[styles.dropdownCaret, isDark && styles.textDim]}>▾</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Paired Devices */}
        <Text style={[labelStyle, styles.sectionSpacing]}>{Strings.settingsPairedDevices}</Text>
        {pairedDevices.length === 0 ? (
          <Text style={[textStyle, styles.emptyDevices]} testID="no-devices-text">
            {Strings.settingsNoPairedDevices}
          </Text>
        ) : (
          pairedDevices.map(device => (
            <View key={device.id} style={styles.deviceRow} testID={`device-row-${device.id}`}>
              <View style={styles.deviceInfo}>
                <Text style={textStyle}>{Strings.pairingStep2DeviceName}</Text>
                <Text style={[styles.deviceId, isDark && styles.textDim]}>{device.id}</Text>
              </View>
              <TouchableOpacity
                testID={`remove-device-${device.id}`}
                onPress={() => onRemoveDevice(device.id)}>
                <Text style={styles.removeText}>{Strings.settingsRemoveDevice}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {pairedDevices.length === 0 && (
          <TouchableOpacity
            testID="add-device-button"
            style={styles.addDeviceButton}
            onPress={onAddDevice}>
            <Text style={styles.addDeviceText}>{Strings.settingsAddDevice}</Text>
          </TouchableOpacity>
        )}

        {/* Debug Mode */}
        <Text style={[labelStyle, styles.sectionSpacing]}>DEBUG</Text>
        <View style={styles.segmentRow} testID="debug-mode-control">
          {(['off', 'on'] as const).map(val => (
            <TouchableOpacity
              key={val}
              testID={`debug-${val}`}
              accessibilityState={{selected: val === 'on' ? debugMode : !debugMode}}
              style={[styles.segment, (val === 'on' ? debugMode : !debugMode) && styles.segmentActive]}
              onPress={() => setDebugMode(val === 'on')}>
              <Text
                style={[
                  styles.segmentText,
                  (val === 'on' ? debugMode : !debugMode) && styles.segmentTextActive,
                ]}>
                {val === 'on' ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* Traffic Mode — only shown when debug is on */}
        {debugMode && (
          <>
            <Text style={[labelStyle, styles.sectionSpacing]}>TRAFFIC MODE</Text>
            <View style={styles.segmentRow} testID="traffic-mode-control">
              {(['quiet', 'busy', 'very_busy'] as TrafficMode[]).map(mode => (
                <TouchableOpacity
                  key={mode}
                  testID={`traffic-${mode}`}
                  accessibilityState={{selected: trafficMode === mode}}
                  style={[styles.segment, styles.segmentThird, trafficMode === mode && styles.segmentActive]}
                  onPress={() => setTrafficMode(mode)}>
                  <Text style={[styles.segmentText, trafficMode === mode && styles.segmentTextActive]}>
                    {mode === 'quiet' ? 'Quiet' : mode === 'busy' ? 'Busy' : 'Very Busy'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Report a Bug */}
        <View style={styles.bugReportRow}>
          <TouchableOpacity
            testID="report-bug-button"
            style={styles.bugReportButton}
            onPress={handleBugReport}>
            <Text style={styles.bugReportText}>Report a Bug</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Voice dropdown modal */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setDropdownOpen(false)}>
          <View style={[styles.modalSheet, isDark && styles.modalSheetDark]}>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>
              ANNOUNCER VOICE
            </Text>

            {/* System Default */}
            <TouchableOpacity
              testID="voice-option-default"
              style={[styles.option, voiceId == null && styles.optionSelected]}
              onPress={() => handleSelect(null)}>
              <View style={styles.optionContent}>
                <Text style={[styles.optionName, isDark && styles.textDark, voiceId == null && styles.optionNameSelected]}>
                  System Default
                </Text>
                <Text style={[styles.optionHint, isDark && styles.textDim]}>
                  Your device's default voice
                </Text>
              </View>
              {voiceId == null && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>

            {voiceSlots.map(slot => (
              <TouchableOpacity
                key={slot.id}
                testID={`voice-option-${slot.character.toLowerCase()}`}
                style={[styles.option, voiceId === slot.id && styles.optionSelected]}
                onPress={() => handleSelect(slot.id)}>
                <View style={styles.optionContent}>
                  <Text style={[styles.optionName, isDark && styles.textDark, voiceId === slot.id && styles.optionNameSelected]}>
                    {slot.character}
                  </Text>
                  <Text style={[styles.optionHint, isDark && styles.textDim]}>
                    {slot.label} accent · Tap to preview
                  </Text>
                </View>
                {voiceId === slot.id && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#FFFFFF'},
  containerDark: {backgroundColor: '#111827'},
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    alignItems: 'flex-end',
  },
  closeButton: {fontSize: 18, color: '#374151', padding: 4},
  content: {paddingHorizontal: 20},
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionSpacing: {marginTop: 24},
  text: {fontSize: 15, color: '#111827'},
  textDark: {color: '#F9FAFB'},
  textDim: {color: '#9CA3AF'},
  segmentRow: {flexDirection: 'row', gap: 8},
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#374151',
    backgroundColor: '#374151',
    alignItems: 'center',
  },
  segmentThird: {flex: 1},
  segmentActive: {borderColor: '#16A34A', backgroundColor: '#16A34A'},
  segmentText: {fontSize: 14, color: '#FFFFFF'},
  segmentTextActive: {color: '#FFFFFF', fontWeight: '600'},
  emptyDevices: {color: '#6B7280', marginBottom: 12},
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  deviceInfo: {gap: 2},
  deviceId: {fontSize: 11, color: '#6B7280'},
  removeText: {fontSize: 14, color: '#EF4444'},
  addDeviceButton: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: '#1F2937',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addDeviceText: {fontSize: 15, color: '#1F2937', fontWeight: '600'},
  // Dropdown trigger
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dropdownDark: {borderColor: '#374151'},
  dropdownValue: {fontSize: 15, color: '#111827'},
  dropdownCaret: {fontSize: 18, color: '#6B7280'},
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  modalSheetDark: {backgroundColor: '#1F2937'},
  modalTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  optionSelected: {backgroundColor: '#F0FDF4'},
  optionContent: {flex: 1},
  optionName: {fontSize: 16, color: '#111827', fontWeight: '500'},
  optionNameSelected: {color: '#15803D', fontWeight: '700'},
  optionHint: {fontSize: 12, color: '#9CA3AF', marginTop: 2},
  checkmark: {fontSize: 18, color: '#16A34A', fontWeight: '700'},
  bugReportRow: {
    marginTop: 32,
    alignItems: 'flex-end',
  },
  bugReportButton: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  bugReportText: {fontSize: 15, color: '#FFFFFF', fontWeight: '600'},
});
