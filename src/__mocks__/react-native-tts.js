const Tts = {
  getInitStatus: jest.fn().mockResolvedValue('success'),
  setDucking: jest.fn().mockResolvedValue(null),
  setIgnoreSilentSwitch: jest.fn().mockResolvedValue(null),
  setDefaultRate: jest.fn().mockResolvedValue(null),
  speak: jest.fn().mockReturnValue(1),
  stop: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

module.exports = {
  __esModule: true,
  default: Tts,
};
