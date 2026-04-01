import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useSettingsStore} from '../../settings/settingsStore';
import {AlertVerbosity} from '../../alerts/types';
import {SidebarPosition, Units} from '../../settings/types';
import {Strings} from '../../constants/strings';

interface Props {
  onClose: () => void;
  onAddDevice: () => void;
  onRemoveDevice: (deviceId: string) => void;
}

export function SettingsPanel({onClose, onAddDevice, onRemoveDevice}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const sidebarPosition = useSettingsStore(s => s.sidebarPosition);
  const verbosity = useSettingsStore(s => s.verbosity);
  const units = useSettingsStore(s => s.units);
  const pairedDevices = useSettingsStore(s => s.pairedDevices);
  const setSidebarPosition = useSettingsStore(s => s.setSidebarPosition);
  const setVerbosity = useSettingsStore(s => s.setVerbosity);
  const setUnits = useSettingsStore(s => s.setUnits);
  const removePairedDevice = useSettingsStore(s => s.removePairedDevice);
  const debugMode = useSettingsStore(s => s.debugMode);
  const setDebugMode = useSettingsStore(s => s.setDebugMode);

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
        {/* Sidebar Position */}
        <Text style={labelStyle}>{Strings.settingsSidebarPosition}</Text>
        <View style={styles.segmentRow} testID="sidebar-position-control">
          {(['left', 'right'] as SidebarPosition[]).map(pos => (
            <TouchableOpacity
              key={pos}
              testID={`sidebar-${pos}`}
              accessibilityState={{selected: sidebarPosition === pos}}
              style={[styles.segment, sidebarPosition === pos && styles.segmentActive]}
              onPress={() => setSidebarPosition(pos)}>
              <Text
                style={[
                  styles.segmentText,
                  sidebarPosition === pos && styles.segmentTextActive,
                ]}>
                {pos === 'left' ? Strings.settingsSidebarLeft : Strings.settingsSidebarRight}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Alert Verbosity */}
        <Text style={[labelStyle, styles.sectionSpacing]}>{Strings.settingsVerbosity}</Text>
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
      </ScrollView>
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
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  segmentThird: {flex: 1},
  segmentActive: {borderColor: '#1F2937', backgroundColor: '#1F2937'},
  segmentText: {fontSize: 14, color: '#374151'},
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
});
