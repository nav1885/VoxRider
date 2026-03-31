module.exports = {
  preset: 'react-native',
  setupFiles: ['react-native-gesture-handler/jestSetup'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleNameMapper: {
    '@react-native-async-storage/async-storage':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-ble-plx|react-native-tts|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|@react-native-async-storage)/)',
  ],
};
