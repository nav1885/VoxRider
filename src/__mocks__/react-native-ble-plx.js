const BleManager = jest.fn().mockImplementation(() => ({
  startDeviceScan: jest.fn(),
  stopDeviceScan: jest.fn(),
  connectToDevice: jest.fn(),
  cancelDeviceConnection: jest.fn(),
  readCharacteristicForDevice: jest.fn(),
  monitorCharacteristicForDevice: jest.fn().mockReturnValue({remove: jest.fn()}),
  onDeviceDisconnected: jest.fn().mockReturnValue({remove: jest.fn()}),
  onStateChange: jest.fn().mockReturnValue({remove: jest.fn()}),
  destroy: jest.fn(),
}));

const State = {
  Unknown: 'Unknown',
  Resetting: 'Resetting',
  Unsupported: 'Unsupported',
  Unauthorized: 'Unauthorized',
  PoweredOff: 'PoweredOff',
  PoweredOn: 'PoweredOn',
};

module.exports = {
  BleManager,
  State,
};
