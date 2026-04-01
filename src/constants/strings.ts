export const Strings = {
  // Connection status
  connected: (deviceName: string) => `Connected · ${deviceName}`,
  searching: 'Searching...',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting...',

  // TTS announcements
  ttsRadarConnected: 'Radar connected',
  ttsRadarDisconnected: 'Radar disconnected',
  ttsRadarReconnected: 'Radar reconnected',
  ttsNoRadarSignal: 'No radar signal',
  ttsClear: 'Clear',

  // Threat alerts — Detailed
  ttsDetailedSingle: (level: string) => `1 vehicle, ${level} speed`,
  ttsDetailedMultiple: (count: number, level: string) => `${count} vehicles, ${level} speed`,

  // Threat alerts — Balanced
  ttsBalancedSingle: '1 vehicle',
  ttsBalancedMultiple: (count: number) => `${count} vehicles`,

  // Threat alerts — Minimal
  ttsMinimalSingle: 'car',
  ttsMinimalMultiple: (count: number) => `${count} cars`,

  // Speed descriptors
  speedMedium: 'medium',
  speedHigh: 'high',

  // Threat state display (main screen)
  clear: 'Clear',
  vehiclesDisplay: (count: number, distance: string) => `${count > 1 ? `${count} vehicles` : '1 vehicle'} · ${distance}`,

  // Pairing flow
  pairingStep1Title: 'Turn on your Varia',
  pairingStep1Instruction: 'Turn on your Varia',
  pairingStep1Progress: 'Step 1 of 2',
  pairingStep1Button: 'Search',

  pairingStep2Title: 'Select your Varia',
  pairingStep2Searching: 'Searching for your Varia...',
  pairingStep2Progress: 'Step 2 of 2',
  pairingStep2DeviceName: 'Varia Radar',
  pairingStep2NotFound: "Varia not found — make sure it's turned on",
  pairingStep2TryAgain: 'Try again',
  pairingStep2ConnectError: "Couldn't connect — tap to try again",

  // Conflict hint
  conflictHint: 'Is another app connected to your Varia?',

  // Battery optimization (Android)
  batteryBannerText: 'Battery restriction detected — radar may disconnect during rides',
  batteryBannerButton: 'Fix this',

  // Bluetooth permission
  bluetoothPermissionBanner: 'Bluetooth permission required',
  bluetoothPermissionButton: 'Open Settings',
  bluetoothPermissionRationale:
    "VoxRider needs Bluetooth access to connect to your Varia radar. On older Android versions this also requires location permission — your location is never stored or shared.",

  // Settings
  settingsSidebarPosition: 'Sidebar Position',
  settingsSidebarLeft: 'Left',
  settingsSidebarRight: 'Right',
  settingsVerbosity: 'Alert Verbosity',
  settingsVerbosityDetailed: 'Detailed',
  settingsVerbosityBalanced: 'Balanced',
  settingsVerbosityMinimal: 'Minimal',
  settingsUnits: 'Units',
  settingsUnitsImperial: 'Imperial',
  settingsUnitsMetric: 'Metric',
  settingsPairedDevices: 'Paired Devices',
  settingsNoPairedDevices: 'No devices paired',
  settingsAddDevice: 'Add Device',
  settingsRemoveDevice: 'Remove',
};
