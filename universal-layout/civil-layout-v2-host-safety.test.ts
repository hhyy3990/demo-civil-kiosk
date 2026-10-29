import assert from 'node:assert/strict';
import test from 'node:test';
import { CIVIL_V2_ITEM_IDS } from './civil-layout-v2-fake-constants';
import {
  getCivilV2HostSafetyFailure,
} from './civil-layout-v2-host-safety';

const request = {
  screenId: 'civil.main-menu',
  itemIds: CIVIL_V2_ITEM_IDS,
  viewport: { width: 1080, height: 1920, gridWidth: 470 },
  accessibility: {
    textScale: 'standard',
    buttonScale: 'standard',
    contrast: 'standard',
    viewportMode: null,
  },
  layoutCapabilities: ['reserved-bottom-controls'],
};

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
};

test('shared Civil v2 host safety accepts only a fully measured safe 18-item menu', async (t) => {
  assert.equal(getCivilV2HostSafetyFailure(request, eligibility), null);

  const cases: Array<[string, unknown, unknown, string]> = [
    ['not on main menu', request, { ...eligibility, screenIsMainMenu: false }, 'SCREEN_NOT_MAIN_MENU'],
    ['unsupported viewport', { ...request, viewport: { ...request.viewport, width: 759 } }, eligibility, 'VIEWPORT_NOT_ALLOWED'],
    ['viewport gate false', request, { ...eligibility, viewportAllowed: false }, 'VIEWPORT_NOT_ALLOWED'],
    ['wrong menu order', { ...request, itemIds: [...CIVIL_V2_ITEM_IDS].reverse() }, eligibility, 'MENU_STRUCTURE_INVALID'],
    ['missing geometry', request, { ...eligibility, geometryKnown: false }, 'GEOMETRY_UNAVAILABLE'],
    ['hidden footer', request, { ...eligibility, footerVisible: false, reservedBottomCapability: false }, 'FOOTER_NOT_SAFE'],
    ['fixed footer', request, { ...eligibility, footerInFlow: false, reservedBottomCapability: false }, 'FOOTER_NOT_SAFE'],
    ['hidden QR dock', request, { ...eligibility, qrDockVisible: false, reservedBottomCapability: false }, 'QR_DOCK_NOT_SAFE'],
    ['QR dock not reserving space', request, { ...eligibility, qrDockReservesBottom: false, reservedBottomCapability: false }, 'QR_DOCK_NOT_SAFE'],
    ['footer overlap', request, { ...eligibility, menuClearOfFooter: false }, 'MENU_CONTROLS_OVERLAP'],
    ['QR dock overlap', request, { ...eligibility, menuClearOfQrDock: false }, 'MENU_CONTROLS_OVERLAP'],
    ['touch target too small', request, { ...eligibility, minimumTouchTargetPx: 43 }, 'TOUCH_TARGET_TOO_SMALL'],
    ['visible menu item fails hit test', request, { ...eligibility, menuHitTestSafe: false }, 'MENU_HIT_TEST_FAILED'],
    ['capability absent', { ...request, layoutCapabilities: [] }, { ...eligibility, reservedBottomCapability: false }, 'RESERVED_BOTTOM_CONTROLS_UNAVAILABLE'],
    ['capability claim mismatches DOM', request, { ...eligibility, reservedBottomCapability: false }, 'RESERVED_BOTTOM_CONTROLS_UNAVAILABLE'],
    ['unknown measurement shape', request, { ...eligibility, unexpected: true }, 'HOST_SAFETY_MEASUREMENT_INVALID'],
  ];

  for (const [name, model, state, expected] of cases) {
    await t.test(name, () => {
      assert.equal(getCivilV2HostSafetyFailure(model, state), expected);
    });
  }
});
