import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import {Strings} from '../../constants/strings';

interface Props {
  onSearch: () => void;
}

export function PairingStep1({onSearch}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';

  return (
    <SafeAreaView
      style={[styles.container, isDark && styles.containerDark]}
      testID="pairing-step1">
      <View style={styles.content}>
        <Text style={styles.progress} testID="step-progress">
          {Strings.pairingStep1Progress}
        </Text>

        {/* Varia device illustration */}
        <View style={styles.illustrationContainer} testID="varia-illustration">
          <View style={styles.variaBody}>
            <View style={styles.variaLight} />
          </View>
          <Text style={[styles.variaLabel, isDark && styles.textDark]}>Varia Radar</Text>
        </View>

        <Text
          style={[styles.title, isDark && styles.textDark]}
          testID="step-title">
          {Strings.pairingStep1Title}
        </Text>
        <Text
          style={[styles.instruction, isDark && styles.textDim]}
          testID="step-instruction">
          {Strings.pairingStep1Instruction}
        </Text>

        <TouchableOpacity
          testID="search-button"
          style={styles.button}
          onPress={onSearch}>
          <Text style={styles.buttonText}>{Strings.pairingStep1Button}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#FFFFFF'},
  containerDark: {backgroundColor: '#111827'},
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'space-between',
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
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  instruction: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  textDark: {color: '#F9FAFB'},
  textDim: {color: '#9CA3AF'},
  button: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
