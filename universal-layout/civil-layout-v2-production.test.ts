import assert from 'node:assert/strict';
import test from 'node:test';
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
  bottomControls: true,
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
  assert.equal(model.components[0]?.itemOrderHash, civilProductionV2ItemOrderHash());
  assert.equal(model.components[0]?.allowedColumns.length, 1);
  assert.equal(model.components[0]?.allowedColumns[0], 1);
  assert.equal(model.components[0]?.minimumTouchTargetPx, 44);
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
});
