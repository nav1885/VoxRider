import {cleanup, device, init} from 'detox';
import config from '../.detoxrc.js';

beforeAll(async () => {
  await init(config, {launchApp: false});
});

afterAll(async () => {
  await cleanup();
});
