import {by, device, element, expect, waitFor} from 'detox';
import {launchFresh, skipToMainScreen} from './helpers';

describe('Settings Panel', () => {
  beforeEach(async () => {
    await launchFresh();
    await skipToMainScreen();
    await element(by.id('main-screen')).swipe('left', 'fast', 0.8);
    await waitFor(element(by.id('settings-panel'))).toBeVisible().withTimeout(3000);
    await element(by.id('settings-scroll')).scrollTo('top');
  });

  afterEach(async () => {
    await device.terminateApp();
  });

  // UI-SET-001
  it('shows verbosity segment control with three options', async () => {
    await expect(element(by.id('verbosity-control'))).toExist();
    await waitFor(element(by.id('verbosity-detailed'))).toBeVisible().withTimeout(3000);
    await waitFor(element(by.id('verbosity-balanced'))).toBeVisible().withTimeout(3000);
    await waitFor(element(by.id('verbosity-minimal'))).toBeVisible().withTimeout(3000);
  });

  // UI-SET-002
  it('shows units segment control', async () => {
    await expect(element(by.id('units-control'))).toExist();
    await waitFor(element(by.id('units-imperial'))).toBeVisible().withTimeout(3000);
    await waitFor(element(by.id('units-metric'))).toBeVisible().withTimeout(3000);
  });

  // UI-SET-003 — Sidebar position toggle
  it('shows sidebar position control with Left and Right', async () => {
    await expect(element(by.id('sidebar-left'))).toBeVisible();
    await expect(element(by.id('sidebar-right'))).toBeVisible();
  });

  // UI-SET-004
  it('close button returns to main screen', async () => {
    await element(by.text('✕')).tap();
    await expect(element(by.id('main-screen'))).toBeVisible();
  });
});
