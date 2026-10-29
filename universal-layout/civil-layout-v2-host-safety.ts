import { z } from 'zod';
import {
  CIVIL_V2_ITEM_IDS,
  CIVIL_V2_SCREEN_ID,
} from './civil-layout-v2-fake-constants.js';

export const civilV2HostEligibilitySchema = z.object({
  screenIsMainMenu: z.boolean(),
  viewportAllowed: z.boolean(),
  geometryKnown: z.boolean(),
  footerVisible: z.boolean(),
  footerInFlow: z.boolean(),
  qrDockVisible: z.boolean(),
  qrDockReservesBottom: z.boolean(),
  menuClearOfFooter: z.boolean(),
  menuClearOfQrDock: z.boolean(),
  minimumTouchTargetPx: z.number().finite().nonnegative(),
  menuHitTestSafe: z.boolean(),
  reservedBottomCapability: z.boolean(),
  targetViewport: z.boolean(),
  centralProfileAllowed: z.boolean(),
}).strict();

export const civilV2CentralEligibilitySchema = civilV2HostEligibilitySchema.extend({
  targetViewport: z.literal(true),
  centralProfileAllowed: z.literal(true),
}).strict();

export type CivilV2HostEligibility = z.infer<typeof civilV2HostEligibilitySchema>;

const centralAccessibilityProfileSchema = z.union([
  z.object({
    textScale: z.literal('standard'),
    buttonScale: z.literal('standard'),
    contrast: z.literal('standard'),
    viewportMode: z.null(),
  }).strict(),
  z.object({
    textScale: z.literal('large'),
    buttonScale: z.literal('large'),
    contrast: z.literal('high'),
    viewportMode: z.object({
      mode: z.literal('bottom'),
      heightPercent: z.literal(70),
    }).strict(),
  }).strict(),
]);

export function isCivilV2CentralAccessibilityAllowed(value: unknown): boolean {
  return centralAccessibilityProfileSchema.safeParse(value).success;
}

export type CivilV2HostSafetyFailure =
  | 'SCREEN_NOT_MAIN_MENU'
  | 'VIEWPORT_NOT_ALLOWED'
  | 'MENU_STRUCTURE_INVALID'
  | 'GEOMETRY_UNAVAILABLE'
  | 'FOOTER_NOT_SAFE'
  | 'QR_DOCK_NOT_SAFE'
  | 'MENU_CONTROLS_OVERLAP'
  | 'TOUCH_TARGET_TOO_SMALL'
  | 'MENU_HIT_TEST_FAILED'
  | 'RESERVED_BOTTOM_CONTROLS_UNAVAILABLE'
  | 'HOST_SAFETY_MEASUREMENT_INVALID';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function getCivilV2HostSafetyFailure(
  requestValue: unknown,
  eligibilityValue: unknown,
): CivilV2HostSafetyFailure | null {
  const parsedEligibility = civilV2HostEligibilitySchema.safeParse(eligibilityValue);
  const request = asRecord(requestValue);
  if (!parsedEligibility.success || !request) return 'HOST_SAFETY_MEASUREMENT_INVALID';

  const eligibility = parsedEligibility.data;
  if (!eligibility.screenIsMainMenu || request.screenId !== CIVIL_V2_SCREEN_ID) {
    return 'SCREEN_NOT_MAIN_MENU';
  }

  const viewport = asRecord(request.viewport);
  if (
    !eligibility.viewportAllowed
    || typeof viewport?.width !== 'number'
    || !Number.isFinite(viewport.width)
    || viewport.width < 760
  ) {
    return 'VIEWPORT_NOT_ALLOWED';
  }

  const itemIds = request.itemIds;
  if (
    !Array.isArray(itemIds)
    || itemIds.length !== CIVIL_V2_ITEM_IDS.length
    || itemIds.some((itemId, index) => itemId !== CIVIL_V2_ITEM_IDS[index])
  ) {
    return 'MENU_STRUCTURE_INVALID';
  }

  if (!eligibility.geometryKnown) return 'GEOMETRY_UNAVAILABLE';
  if (!eligibility.footerVisible || !eligibility.footerInFlow) return 'FOOTER_NOT_SAFE';
  if (!eligibility.qrDockVisible || !eligibility.qrDockReservesBottom) return 'QR_DOCK_NOT_SAFE';
  if (!eligibility.menuClearOfFooter || !eligibility.menuClearOfQrDock) {
    return 'MENU_CONTROLS_OVERLAP';
  }
  if (eligibility.minimumTouchTargetPx < 44) return 'TOUCH_TARGET_TOO_SMALL';
  if (!eligibility.menuHitTestSafe) return 'MENU_HIT_TEST_FAILED';

  const capabilityIsSupported = eligibility.footerVisible
    && eligibility.footerInFlow
    && eligibility.qrDockVisible
    && eligibility.qrDockReservesBottom;
  const capabilityClaimCount = Array.isArray(request.layoutCapabilities)
    ? request.layoutCapabilities.filter((value) => value === 'reserved-bottom-controls').length
    : 0;
  if (
    !capabilityIsSupported
    || eligibility.reservedBottomCapability !== capabilityIsSupported
    || capabilityClaimCount !== 1
  ) {
    return 'RESERVED_BOTTOM_CONTROLS_UNAVAILABLE';
  }

  return null;
}

export function civilV2HostSafetyMessage(failure: CivilV2HostSafetyFailure): string {
  switch (failure) {
    case 'SCREEN_NOT_MAIN_MENU':
      return '첫 화면에서만 Universal v2 메뉴 계획을 확인할 수 있습니다.';
    case 'VIEWPORT_NOT_ALLOWED':
      return '기존 모바일 적용 제한을 유지합니다. 760px 이상 화면에서만 이 Development preset을 시험할 수 있습니다.';
    case 'MENU_STRUCTURE_INVALID':
      return '증명서 18개 또는 메뉴 순서가 예상과 달라 기본 배치를 유지합니다.';
    case 'GEOMETRY_UNAVAILABLE':
    case 'HOST_SAFETY_MEASUREMENT_INVALID':
      return '필수 화면 요소를 측정할 수 없어 기본 배치를 유지합니다.';
    case 'FOOTER_NOT_SAFE':
      return '하단 조작부의 실제 안전 영역을 확인할 수 없어 기본 배치를 유지합니다.';
    case 'QR_DOCK_NOT_SAFE':
      return 'QR 도크의 고정 하단 영역을 확인할 수 없어 기본 배치를 유지합니다.';
    case 'MENU_CONTROLS_OVERLAP':
      return '증명서 메뉴와 하단 조작 영역이 겹쳐 기본 배치를 유지합니다.';
    case 'TOUCH_TARGET_TOO_SMALL':
      return '실제 메뉴 터치 영역이 44px보다 작아 기본 배치를 유지합니다.';
    case 'MENU_HIT_TEST_FAILED':
      return '화면에 보이는 증명서 버튼을 직접 누를 수 없어 기본 배치를 유지합니다.';
    case 'RESERVED_BOTTOM_CONTROLS_UNAVAILABLE':
      return 'reserved-bottom-controls 영역을 확인할 수 없어 기본 배치를 유지합니다.';
  }
}
