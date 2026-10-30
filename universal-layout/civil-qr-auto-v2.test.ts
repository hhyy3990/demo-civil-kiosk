import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ACCESSIBILITY_PROFILE,
  type AccessibilityProfile,
} from '@naebangsik/kiosk-accessibility-sdk';
import {
  isCivilGQrProfile,
  selectCivilQrAutoV2Backend,
} from './civil-qr-auto-v2.js';

const civilGProfile: AccessibilityProfile = {
  ...DEFAULT_ACCESSIBILITY_PROFILE,
  textSize: 'large',
  buttonSize: 'large',
  contrast: 'high',
  viewportMode: { mode: 'bottom', heightPercent: 70 },
  easyLanguage: true,
  smartGuide: true,
  scrollGuidance: true,
  voiceGuidance: false,
};

test('only the approved Civil G accessibility combination enables automatic v2', () => {
  assert.equal(isCivilGQrProfile(civilGProfile), true);
  assert.equal(isCivilGQrProfile(DEFAULT_ACCESSIBILITY_PROFILE), false);
  assert.equal(isCivilGQrProfile({ ...civilGProfile, textSize: 'extraLarge' }), false);
  assert.equal(isCivilGQrProfile({
    ...civilGProfile,
    viewportMode: { mode: 'bottom', heightPercent: 60 },
  }), false);
  assert.equal(isCivilGQrProfile({ ...civilGProfile, voiceGuidance: true }), false);
  assert.equal(isCivilGQrProfile({ ...civilGProfile, scrollGuidance: false }), false);
  assert.equal(isCivilGQrProfile({ ...civilGProfile, easyLanguage: false }), false);
});

test('automatic QR mode selects exactly one development backend and respects the OpenAI gate', () => {
  assert.equal(selectCivilQrAutoV2Backend(civilGProfile, true, 'local-fake'), 'local-fake');
  assert.equal(selectCivilQrAutoV2Backend(civilGProfile, true, 'central-openai'), 'central-openai');
  assert.equal(selectCivilQrAutoV2Backend(civilGProfile, true, 'off'), null);
  assert.equal(selectCivilQrAutoV2Backend(civilGProfile, false, 'central-openai'), null);
  assert.equal(selectCivilQrAutoV2Backend(DEFAULT_ACCESSIBILITY_PROFILE, true, 'central-openai'), null);
});
