import assert from 'node:assert/strict';
import test from 'node:test';
import { createQrProfileClient } from '@naebangsik/kiosk-accessibility-sdk';
import {
  CIVIL_V2_PRODUCTION_ITEM_IDS,
  CIVIL_V2_PRODUCTION_SCREEN_ID,
  createCivilProductionV2Model,
  civilProductionV2ItemOrderHash,
} from './civil-layout-v2-production.js';

const request = {
  screenId: CIVIL_V2_PRODUCTION_SCREEN_ID,
  itemIds: [...CIVIL_V2_PRODUCTION_ITEM_IDS],
  viewport: { width: 1080, height: 1920, gridWidth: 470 },
  accessibility: {
    textScale: 'large',
    buttonScale: 'large',
    contrast: 'high',
    viewportMode: { mode: 'bottom', heightPercent: 70 },
  },
  layoutCapabilities: ['reserved-bottom-controls'],
} as const;

const eligibility = {
  screenIsMainMenu: true,
  viewportAllowed: true,
  geometryKnown: true,
  footerVisible: true,
  footerInFlow: true,
  qrDockVisible: true,
  qrDockReservesBottom: true,
  menuClearOfFooter: true,
  menuClearOfQrDock: true,
  minimumTouchTargetPx: 44,
  menuHitTestSafe: true,
  reservedBottomCapability: true,
  targetViewport: true,
  centralProfileAllowed: true,
} as const;

const qrProfile = {
  textSize: 'large',
  buttonSize: 'large',
  contrast: 'high',
  bottomControls: false,
  easyLanguage: true,
  smartGuide: true,
  scrollGuidance: true,
  voiceGuidance: false,
  viewportMode: { mode: 'bottom', heightPercent: 70 },
} as const;

const envelope = { request, eligibility, qrProfile };

test('Production candidate model binds Civil G, 18 ordered items, and reserved bottom controls', () => {
  const model = createCivilProductionV2Model(envelope);
  assert.equal(model.hostId, 'civil-kiosk-production');
  assert.equal(model.screenId, 'civil.main-menu');
  assert.equal(model.structureVersion, 'civil-main-menu.production.v1');
  assert.equal(model.components[0]?.id, 'civil.certificate-grid');
  assert.equal(model.components[0]?.itemCount, 18);
  assert.deepEqual(CIVIL_V2_PRODUCTION_ITEM_IDS, Array.from(
    { length: 18 },
    (_, index) => `civil.certificate.${String(index + 1).padStart(2, '0')}`,
  ));
  assert.equal(model.components[0]?.itemOrderHash, civilProductionV2ItemOrderHash());
  assert.equal(model.structureHash, '820cf03f6613da155cc79f39e0e36a8e99eda671be3b15cb7ec37f01b58ab343');
  assert.equal(model.constraintHash, '67db940ccb6a69a59f0d13cc902dfa610d4e24a929021efbc2270b7e5033d3e9');
  assert.equal(model.components[0]?.itemOrderHash, '1f984cacde0e9014a80a73b90f15ea8a2ca3002ee5a1a65b737cd8fe11e9342c');
  assert.deepEqual(model.layoutCapabilities, ['reserved-bottom-controls']);
  assert.equal(model.components[0]?.allowedColumns.length, 1);
  assert.equal(model.components[0]?.allowedColumns[0], 1);
  assert.equal(model.components[0]?.minimumTouchTargetPx, 44);
  assert.deepEqual(model.components[0]?.optionGroups, [{
    id: 'arrangement',
    optionIds: ['reserved-safe-list'],
  }]);
});

test('Production candidate rejects reordered, missing, or ineligible host snapshots', () => {
  assert.throws(() => createCivilProductionV2Model({
    ...envelope,
    request: { ...request, itemIds: [...request.itemIds].reverse() },
  }));
  assert.throws(() => createCivilProductionV2Model({
    ...envelope,
    request: { ...request, itemIds: request.itemIds.slice(1) },
  }));
  assert.throws(() => createCivilProductionV2Model({
    ...envelope,
    request: { ...request, accessibility: { ...request.accessibility, textScale: 'standard' } },
  }));
  for (const viewport of [
    { width: 1080, height: 1919, gridWidth: 470 },
    { width: 1079, height: 1920, gridWidth: 470 },
    { width: 1200, height: 1920, gridWidth: 470 },
    { width: 1920, height: 1080, gridWidth: 470 },
  ]) {
    assert.throws(() => createCivilProductionV2Model({
      ...envelope,
      request: { ...request, viewport },
    }));
  }
});

test('the installed SDK v5 G profile uses viewportMode for bottom controls and passes the strict host model', async () => {
  const qrClient = createQrProfileClient({
    fetcher: async () => new Response(JSON.stringify({
      schemaVersion: 5,
      updatedAt: '2026-10-31T00:00:00.000Z',
      preferences: {
        textSize: 'large',
        buttonSize: 'large',
        contrast: 'high',
        guideDelaySeconds: 10,
        easyLanguage: true,
        smartGuide: true,
        voiceGuidance: false,
        viewportMode: { mode: 'bottom', heightPercent: 70 },
        language: 'ko',
        stepByStepGuidance: true,
        conciseGuidance: false,
        slowGuidance: false,
        scrollGuidance: true,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  const profile = await qrClient.resolve('synthetic-profile-token-123456');
  assert.equal(profile.bottomControls, false);
  assert.deepEqual(profile.viewportMode, { mode: 'bottom', heightPercent: 70 });
  assert.doesNotThrow(() => createCivilProductionV2Model({
    ...envelope,
    qrProfile: { ...qrProfile, bottomControls: profile.bottomControls },
  }));
});
