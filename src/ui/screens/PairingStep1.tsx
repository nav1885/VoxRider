import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Strings} from '../../constants/strings';
import {DebugWordmark} from '../components/DebugWordmark';

const logo = require('../../assets/logo.png');
const radarImage = require('../../assets/radar.png');
import {useSettingsStore} from '../../settings/settingsStore';

interface Props {
  onSearch: () => void;
  onSkip: () => void;
}

export function PairingStep1({onSearch, onSkip}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const debugMode = useSettingsStore(s => s.debugMode);

  return (
    <View
      style={[styles.container, isDark && styles.containerDark]}
      testID="pairing-step1">
      <View style={[styles.content, {paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40}]}>
        <View style={styles.topRow}>
          <Text style={styles.progress} testID="step-progress">
            {Strings.pairingStep1Progress}
          </Text>
          <DebugWordmark color={isDark ? '#9CA3AF' : '#6B7280'} />
        </View>

        {/* Logo */}
        <Image source={logo} style={styles.logo} resizeMode="contain" />

        {/* Radar illustration + Search button */}
        <View style={styles.illustrationContainer} testID="radar-illustration">
          <Image source={radarImage} style={styles.radarImage} resizeMode="contain" />

          <TouchableOpacity
            testID="search-button"
            style={styles.button}
            onPress={onSearch}>
            <Text style={styles.buttonText}>{Strings.pairingStep1Button}</Text>
          </TouchableOpacity>

          {debugMode && (
            <TouchableOpacity testID="debug-skip-button" onPress={onSkip}>
              <Text style={[styles.skipLabel, isDark && styles.textDark]}>Skip (debug)</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#FFFFFF'},
  containerDark: {backgroundColor: '#111827'},
  content: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  progress: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  logo: {width: 240, height: 160, marginTop: 8},

  illustrationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  radarImage: {
    width: 320,
    height: 300,
  },
  textDark: {color: '#F9FAFB'},
  skipLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 8,
    textDecorationLine: 'underline',
  },
  button: {
    width: 200,
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
