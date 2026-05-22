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

  // Threat banner
  bannerClear: 'All Clear',
  bannerWarning: (count: number, speedLabel: string) =>
    `Warning: ${count === 1 ? '1 vehicle' : `${count} vehicles`} approaching, ${speedLabel} speed`,

  // Pairing flow
  pairingStep1Title: 'Turn on your radar',
  pairingStep1Instruction: 'Turn on your radar',
  pairingStep1Progress: 'Step 1 of 2',
  pairingStep1Button: 'Search',

  pairingStep2Title: 'Select your radar',
  pairingStep2Searching: 'Searching for your radar...',
  pairingStep2Progress: 'Step 2 of 2',
  pairingStep2DeviceName: 'Cycling Radar',
  pairingStep2NotFound: "Radar not found — make sure it's turned on",
  pairingStep2TryAgain: 'Try again',
  pairingStep2ConnectError: "Couldn't connect — tap to try again",

  // Conflict hint
  conflictHint: 'Is another app connected to your radar?',

  // Battery optimization (Android)
  batteryBannerText: 'Battery restriction detected — radar may disconnect during rides',
  batteryBannerButton: 'Fix this',

  // Bluetooth permission
  bluetoothPermissionBanner: 'Bluetooth permission required',
  bluetoothPermissionButton: 'Open Settings',
  bluetoothPermissionRationale:
    "VoxRider needs Bluetooth access to connect to your cycling radar. On older Android versions this also requires location permission — your location is never stored or shared.",

  // Settings
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
