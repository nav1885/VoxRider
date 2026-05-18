import {by, device, element, expect, waitFor} from 'detox';
import {launchFresh, skipToMainScreen} from './helpers';

describe('Main Screen', () => {
  beforeEach(async () => {
    await launchFresh();
    await skipToMainScreen();
  });

  afterEach(async () => {
    await device.terminateApp();
  });

  // IOS-E2E-010 / UI-MAIN-001
  it('shows header with VOXRIDER wordmark', async () => {
    await expect(element(by.id('header-wordmark'))).toBeVisible();
  });

  // IOS-E2E-011 / UI-MAIN-002
  it('shows connection status indicator', async () => {
    await expect(element(by.id('connection-status'))).toBeVisible();
  });

  // IOS-E2E-014 — Swipe left opens settings
  it('swipe left opens settings panel', async () => {
    await element(by.id('main-screen')).swipe('left', 'fast', 0.8);
    await waitFor(element(by.text('ALERT VERBOSITY')))
      .toBeVisible()
      .withTimeout(3000);
  });

  // Debug Easter egg — 7 taps on wordmark unlocks dev mode
  it('7 taps on wordmark within 8s unlocks debug mode', async () => {
    for (let i = 0; i < 7; i++) {
      await element(by.id('header-wordmark')).tap();
    }
    await waitFor(element(by.id('debug-simulate-button')))
      .toBeVisible()
      .withTimeout(3000);
  });
});
