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
import {MockBLEManager} from './src/ble/MockBLEManager';
import {DeviceInfo} from './src/ble/types';

export type RootStackParamList = {
  PairingStep1: undefined;
  PairingStep2: undefined;
  Main: undefined;
  Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

// Using MockBLEManager until RealBLEManager is implemented (M1 native tasks)
const bleManager = new MockBLEManager();

export default function App(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const [initialRoute, setInitialRoute] = useState<'PairingStep1' | 'Main' | null>(null);

  const loadSettings = useSettingsStore(s => s.loadFromStorage);

  useEffect(() => {
    const init = async () => {
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
                  onTestAlert={() => {
                    // TTSEngine will be wired here in TASK-023 native integration
                  }}
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
