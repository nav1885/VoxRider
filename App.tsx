import React, {useEffect, useState} from 'react';
import {StatusBar, useColorScheme, GestureResponderEvent} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator, CardStyleInterpolators} from '@react-navigation/stack';
import {GestureHandlerRootView} from 'react-native-gesture-handler';

import {PairingStep1} from './src/ui/screens/PairingStep1';
import {PairingStep2} from './src/ui/screens/PairingStep2';
import {MainScreen} from './src/ui/screens/MainScreen';
import {SettingsPanel} from './src/ui/screens/SettingsPanel';
import {useSettingsStore} from './src/settings/settingsStore';
import {useRadarStore} from './src/ble/radarStore';
import {MockBLEManager} from './src/ble/MockBLEManager';
import {DeviceInfo} from './src/ble/types';
import {AlertEngine} from './src/alerts/AlertEngine';
import {TTSEngine} from './src/alerts/TTSEngine';
import {NativeTTSBackend} from './src/alerts/NativeTTSBackend';
import {ConnectionAlertEngine} from './src/alerts/ConnectionAlertEngine';
import {AlertVerbosity} from './src/alerts/types';
import {Strings} from './src/constants/strings';

export type RootStackParamList = {
  PairingStep1: undefined;
  PairingStep2: undefined;
  Main: undefined;
  Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

// Using MockBLEManager until RealBLEManager is implemented (M1 native tasks)
const bleManager = new MockBLEManager();

// Alert + TTS pipeline — NativeTTSBackend wraps react-native-tts
const ttsBackend = new NativeTTSBackend();
const alertEngine = new AlertEngine(() => {});
const ttsEngine = new TTSEngine(ttsBackend, alertEngine, AlertVerbosity.Detailed);
const connectionAlertEngine = new ConnectionAlertEngine(msg =>
  ttsBackend.speak(msg, () => {}),
);

// Subscribe to radar store — drive alert + connection engines from BLE state
useRadarStore.subscribe(state => {
  ttsEngine.updateState(state.threats, state.connectionStatus);
  alertEngine.evaluate(state.threats, state.connectionStatus);
  connectionAlertEngine.onStatusChange(state.connectionStatus);
});

// Keep TTSEngine verbosity in sync with settings
useSettingsStore.subscribe(state => {
  ttsEngine.setVerbosity(state.verbosity);
});

export default function App(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const [initialRoute, setInitialRoute] = useState<'PairingStep1' | 'Main' | null>(null);

  const loadSettings = useSettingsStore(s => s.loadFromStorage);

  useEffect(() => {
    const init = async () => {
      await ttsBackend.initialize();
      await loadSettings();
      const {pairedDevices} = useSettingsStore.getState();
      setInitialRoute(pairedDevices.length > 0 ? 'Main' : 'PairingStep1');
    };
    init();
  }, [loadSettings]);

  if (initialRoute === null) {
    return <></>;
  }

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{headerShown: false}}>
            <Stack.Screen name="PairingStep1">
              {({navigation}) => (
                <PairingStep1 onSearch={() => navigation.navigate('PairingStep2')} />
              )}
            </Stack.Screen>

            <Stack.Screen name="PairingStep2">
              {({navigation}) => (
                <PairingStep2
                  bleManager={bleManager}
                  onConnected={(device: DeviceInfo) => {
                    useSettingsStore.getState().addPairedDevice(device);
                    useSettingsStore.getState().updateLastConnected(device.id);
                    connectionAlertEngine.onFirstConnect();
                    navigation.reset({index: 0, routes: [{name: 'Main'}]});
                  }}
                />
              )}
            </Stack.Screen>

            <Stack.Screen
              name="Main"
              options={{gestureEnabled: false}}>
              {({navigation}) => (
                <MainScreen
                  onTestAlert={() => ttsEngine.speakImmediate(Strings.ttsTestAlert)}
                  onSwipeLeft={() => navigation.navigate('Settings')}
                />
              )}
            </Stack.Screen>

            <Stack.Screen
              name="Settings"
              options={{
                cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
                gestureDirection: 'horizontal-inverted',
              }}>
              {({navigation}) => (
                <SettingsPanel
                  onClose={() => navigation.goBack()}
                  onAddDevice={() => {
                    navigation.navigate('PairingStep1');
                  }}
                />
              )}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
