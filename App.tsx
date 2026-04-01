import React, {useEffect, useState} from 'react';
import {StatusBar, useColorScheme} from 'react-native';
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
import {RealBLEManager} from './src/ble/RealBLEManager';
import {DeviceInfo, ConnectionStatus} from './src/ble/types';
import {NativeTTSBackend} from './src/alerts/NativeTTSBackend';
import {ConnectionAlertEngine} from './src/alerts/ConnectionAlertEngine';
import {buildAlertMessage} from './src/alerts/buildAlertMessage';
import {getMaxThreatLevel} from './src/ble/parseRadarPacket';
import {Strings} from './src/constants/strings';

export type RootStackParamList = {
  PairingStep1: undefined;
  PairingStep2: undefined;
  Main: undefined;
  Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

// Real BLE — connects to Garmin Varia RTL515 via react-native-ble-plx
const bleManager = new RealBLEManager();

// TTS backend
const ttsBackend = new NativeTTSBackend();
const connectionAlertEngine = new ConnectionAlertEngine(msg =>
  ttsBackend.speak(msg, () => {}),
);

// Announce threat changes, respecting the user's verbosity setting
let lastAnnouncedCount = 0;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function announceThreats(count: number, maxLevel: ReturnType<typeof getMaxThreatLevel>) {
  if (count === lastAnnouncedCount) return;

  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }

  lastAnnouncedCount = count;

  if (count === 0) {
    // Debounce "Clear" by 2s — avoids false clears when a car briefly dips to 0
    clearTimer = setTimeout(() => {
      const msg = Strings.ttsClear;
      useRadarStore.getState().setDebugLastAnnouncement(msg);
      ttsBackend.speak(msg, () => {});
      clearTimer = null;
    }, 2000);
  } else {
    const verbosity = useSettingsStore.getState().verbosity;
    const msg = buildAlertMessage(
      {count, maxLevel, isEscalation: false, isClear: false},
      verbosity,
    );
    useRadarStore.getState().setDebugLastAnnouncement(msg);
    ttsBackend.speak(msg, () => {});
  }
}

// Subscribe to radar store
useRadarStore.subscribe(state => {
  announceThreats(state.threats.length, getMaxThreatLevel(state.threats));
  if (!useSettingsStore.getState().debugMode) {
    connectionAlertEngine.onStatusChange(state.connectionStatus);
  }
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
      if (pairedDevices.length > 0) {
        // Auto-connect to last paired device
        const lastDevice = pairedDevices[pairedDevices.length - 1];
        bleManager
          .connect(lastDevice.id)
          .then(() => {
            connectionAlertEngine.onFirstConnect();
            bleManager.watchBluetoothState(lastDevice.id);
          })
          .catch(() => {
            bleManager.startReconnectLoop(lastDevice.id);
            bleManager.watchBluetoothState(lastDevice.id);
          });
        setInitialRoute('Main');
      } else {
        setInitialRoute('PairingStep1');
      }
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
                  onRemoveDevice={(deviceId: string) => {
                    bleManager.disconnect();
                    useSettingsStore.getState().removePairedDevice(deviceId);
                    useRadarStore.getState().setConnectionStatus(ConnectionStatus.Disconnected);
                    useRadarStore.getState().setConnectedDevice(null);
                    useRadarStore.getState().setThreats([]);
                    useRadarStore.getState().setBatteryLevel(0);
                    navigation.reset({index: 0, routes: [{name: 'PairingStep1'}]});
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
