import type { AccessibilityProfile } from '@naebangsik/kiosk-accessibility-sdk';
import type { CivilV2QrAutoMode } from './central-v2-development-relay.js';

export function isCivilGQrProfile(profile: AccessibilityProfile): boolean {
  return profile.textSize === 'large'
    && profile.buttonSize === 'large'
    && profile.contrast === 'high'
    && profile.viewportMode?.mode === 'bottom'
    && profile.viewportMode.heightPercent === 70
    && profile.easyLanguage
    && profile.smartGuide
    && profile.scrollGuidance
    && !profile.voiceGuidance;
}

export function selectCivilQrAutoV2Backend(
  profile: AccessibilityProfile,
  isDevelopment: boolean,
  mode: CivilV2QrAutoMode,
): Exclude<CivilV2QrAutoMode, 'off'> | null {
  if (!isDevelopment || mode === 'off' || !isCivilGQrProfile(profile)) return null;
  return mode;
}
