import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Strings} from '../../constants/strings';

interface Props {
  onSearch: () => void;
}

export function PairingStep1({onSearch}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, isDark && styles.containerDark]}
      testID="pairing-step1">
      <View style={[styles.content, {paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40}]}>
        <Text style={styles.progress} testID="step-progress">
          {Strings.pairingStep1Progress}
        </Text>

        {/* Varia device illustration + Search button */}
        <View style={styles.illustrationContainer} testID="varia-illustration">
          <View style={styles.variaBody}>
            <View style={styles.variaLight} />
          </View>
          <Text style={[styles.variaLabel, isDark && styles.textDark]}>Varia Radar</Text>

          <TouchableOpacity
            testID="search-button"
            style={styles.button}
            onPress={onSearch}>
            <Text style={styles.buttonText}>{Strings.pairingStep1Button}</Text>
          </TouchableOpacity>
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
  progress: {
    fontSize: 13,
    color: '#9CA3AF',
    alignSelf: 'flex-start',
  },
  illustrationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  variaBody: {
    width: 80,
    height: 140,
    backgroundColor: '#374151',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  variaLight: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#9CA3AF',
  },
  variaLabel: {
    fontSize: 14,
    color: '#374151',
  },
  textDark: {color: '#F9FAFB'},
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
