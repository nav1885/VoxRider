import {by, device, element, expect, waitFor} from 'detox';
import {launchFreshAtPairing, skipPairingToMain} from './helpers';

describe('Pairing Flow', () => {
  beforeEach(async () => {
    await launchFreshAtPairing();
  });

  afterEach(async () => {
    await device.terminateApp();
  });

  // IOS-E2E-001 / UI-PAIR-001
  it('shows PairingStep1 on first launch', async () => {
    await expect(element(by.id('pairing-step1'))).toBeVisible();
    await expect(element(by.id('search-button'))).toBeVisible();
  });

  // IOS-E2E-002 / UI-PAIR-002
  it('Search button navigates to PairingStep2', async () => {
    await element(by.id('search-button')).tap();
    await expect(element(by.id('pairing-step2'))).toBeVisible();
  });

  // IOS-E2E-003 / UI-PAIR-004
  it('scan timeout shows error and Try Again button', async () => {
    await element(by.id('search-button')).tap();
    await waitFor(element(by.id('timeout-message')))
      .toBeVisible()
      .withTimeout(35000);
    await expect(element(by.id('try-again-button'))).toBeVisible();
  });

  // Skip button (debug path) navigates directly to main screen
  it('Skip (debug) bypasses pairing and shows main screen', async () => {
    await skipPairingToMain();
    await expect(element(by.id('main-screen'))).toBeVisible();
  });
});
