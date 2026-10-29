import type { AccessibilityProfile } from '@naebangsik/kiosk-accessibility-sdk';

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
