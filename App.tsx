import React, {useEffect, useState} from 'react';
import {Appearance, StatusBar, useColorScheme, NativeModules, Platform, PermissionsAndroid} from 'react-native';

Appearance.setColorScheme('dark');
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
import {AlertEngine} from './src/alerts/AlertEngine';
import {TTSEngine} from './src/alerts/TTSEngine';
import {ConnectionAlertEngine} from './src/alerts/ConnectionAlertEngine';
import {useDebugStore} from './src/debug/debugStore';

export type RootStackParamList = {
  PairingStep1: undefined;
  PairingStep2: undefined;
  Main: undefined;
  Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

// Real BLE — connects to Garmin Varia RTL515 via react-native-ble-plx
const bleManager = new RealBLEManager();

// TTS backend + alert pipeline (REQ-AUD-002 / REQ-AUD-003)
const ttsBackend = new NativeTTSBackend();
const connectionAlertEngine = new ConnectionAlertEngine(msg =>
  ttsBackend.speak(msg, () => {}),
);
const alertEngine = new AlertEngine(
  () => {},
  line => useDebugStore.getState().appendAlertLog(line),
);
const ttsEngine = new TTSEngine(
  ttsBackend,
  alertEngine,
  useSettingsStore.getState().verbosity,
  msg => useDebugStore.getState().setLastAnnouncement(msg),
);

// Keep verbosity in sync when user changes it in Settings
useSettingsStore.subscribe(state => {
  ttsEngine.setVerbosity(state.verbosity);
});

// Drive the alert pipeline from every BLE state update
useRadarStore.subscribe(state => {
  // In debug mode the simulator owns connectionStatus — the BLE reconnect loop
  // fires every 3s and clobbers it with Connecting/Disconnected, which would
  // silently block alertEngine.evaluate(). Always treat as Connected in debug.
  const effectiveStatus = useSettingsStore.getState().debugMode
    ? ConnectionStatus.Connected
    : state.connectionStatus;

  ttsEngine.updateState(state.threats, effectiveStatus);
  alertEngine.evaluate(state.threats, effectiveStatus);
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
      try { await ttsBackend.initialize(); } catch {};
      await loadSettings();
      const {pairedDevices, voiceId} = useSettingsStore.getState();
      if (Platform.OS === 'android') {
        if (voiceId) {
          NativeModules.VoxTTS?.setVoice(voiceId);
        } else {
          // No voice stored — pick the AU (Nova) voice as default, fall back to system default
          try {
            const voices: {id: string; region: string}[] =
              await NativeModules.VoxTTS?.getVoices();
            const auVoice = voices?.find(v => v.region === 'AU');
            if (auVoice) {
              NativeModules.VoxTTS?.setVoice(auVoice.id);
              useSettingsStore.getState().setVoiceId(auVoice.id);
            }
          } catch {}
        }
        // Android 13+ requires POST_NOTIFICATIONS for the foreground service notification
        if (Platform.Version >= 33) {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }
        // Ensure the foreground service + wake lock are running for background BLE/TTS
        NativeModules.VoxTTS?.startRadarService();
      }
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
                <PairingStep1
                  onSearch={() => navigation.navigate('PairingStep2')}
                  onSkip={() => navigation.reset({index: 0, routes: [{name: 'Main'}]})}
                />
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
