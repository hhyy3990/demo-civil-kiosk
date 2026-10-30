import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AccessibilityProfile,
} from '@naebangsik/kiosk-accessibility-sdk';
import {
  CIVIL_V2_ITEM_IDS,
  CIVIL_V2_FAKE_HOST_ID,
  CIVIL_V2_COMPONENT_ID,
  CIVIL_V2_OPTION_GROUP_ID,
  CIVIL_V2_SAFE_LIST_OPTION_ID,
  CIVIL_V2_SCREEN_ID,
  CIVIL_V2_STRUCTURE_VERSION,
} from '../universal-layout/civil-layout-v2-fake-constants';
import {
  civilV2HostSafetyMessage,
  getCivilV2HostSafetyFailure,
  isCivilV2CentralAccessibilityAllowed,
  type CivilV2HostSafetyFailure,
  type CivilV2HostEligibility,
} from '../universal-layout/civil-layout-v2-host-safety';
import type { UniversalLayoutV2Plan } from '../universal-layout/v2/universal-v2-contract-export';
import type { KioskStep } from './useKioskAccessibility';

type FakeState = {
  plan: UniversalLayoutV2Plan | null;
  contextKey: string | null;
  requestId: number | null;
  startedAt: number | null;
  pending: boolean;
  message: string;
};

type Backend = 'local-fake' | 'central-fake' | 'central-openai';

function isCentralBackend(backend: Backend): boolean {
  return backend !== 'local-fake';
}

type ContextSnapshot = {
  key: string;
  request: unknown;
  reason: string | null;
  failureClass: ClientDiagnosticFailureClass | null;
  overlapDiagnostic?: ClientOverlapDiagnostic;
};

type DiagnosticRect = {
  x: number;
  y: number;
  width: number;
  height: number;
} | null;

type ClientOverlapDiagnostic = {
  menuClearOfFooter: boolean;
  menuClearOfQrDock: boolean;
  menuRect: DiagnosticRect;
  footerRect: DiagnosticRect;
  qrDockRect: DiagnosticRect;
  footerOverlapAreaPx2: number;
  qrDockOverlapAreaPx2: number;
  viewport: { width: number; height: number };
  stageScrollTop: number | null;
  gridColumns: number | null;
};

type ClientDiagnosticStage =
  | 'request_started'
  | 'qr_auto_request_started'
  | 'client_plan_received'
  | 'client_validator_passed'
  | 'client_validator_rejected'
  | 'active_plan_set'
  | 'layout_attribute_applied'
  | 'first_animation_frame'
  | 'second_animation_frame'
  | 'post_apply_safety_passed'
  | 'post_apply_safety_failed'
  | 'active_plan_cleared';

type DevelopmentLayoutElement = {
  rect: DiagnosticRect;
  style: {
    position: string;
    display: string;
    overflow: string;
    overflowX: string;
    overflowY: string;
    height: string;
    minHeight: string;
    marginTop: string;
    marginBottom: string;
    paddingTop: string;
    paddingBottom: string;
  };
};

type DevelopmentLayoutSnapshot = {
  gProfileConditions: {
    viewport1080x1920: boolean;
    largeText: boolean;
    largeButtons: boolean;
    highContrast: boolean;
    bottomControls: boolean;
    bottomControls70Percent: boolean;
    easyLanguage: boolean;
    reservedSafeListSelectorMatches: boolean;
  };
  viewport: {
    innerWidth: number;
    innerHeight: number;
    visualWidth: number | null;
    visualHeight: number | null;
    visualScale: number | null;
    visualOffsetTop: number | null;
    devicePixelRatio: number;
    windowScrollY: number;
    stageScrollTop: number | null;
  };
  grid: {
    optionId: string | null;
    gridTemplateColumns: string | null;
    columns: number | null;
    gap: string | null;
    marginTop: string | null;
    marginBottom: string | null;
    paddingTop: string | null;
    paddingBottom: string | null;
  };
  elements: Record<string, DevelopmentLayoutElement | null>;
  safety: {
    menuClearOfFooter: boolean;
    menuClearOfQrDock: boolean;
    footerOverlapAreaPx2: number;
    qrDockOverlapAreaPx2: number;
  };
};

type ClientDiagnosticFailureClass =
  | CivilV2HostSafetyFailure
  | 'CENTRAL_TARGET_VIEWPORT'
  | 'CENTRAL_PROFILE_NOT_ALLOWED'
  | 'HTTP_RESPONSE_REJECTED'
  | 'INVALID_PLAN_ENVELOPE'
  | 'STALE_CONTEXT'
  | 'REQUEST_GENERATION_CHANGED'
  | 'REQUEST_FAILED'
  | 'REQUEST_ABORTED'
  | 'CONTEXT_CHANGED'
  | 'MANUAL_PLAN_CLEAR'
  | 'REQUEST_CANCELLED'
  | 'REPLACED_BY_NEW_REQUEST'
  | 'LAYOUT_ATTRIBUTE_NOT_APPLIED'
  | 'APPLIED_PLAN_UNSAFE';

type DiagnosticSafetyResult = 'not_checked' | 'pass' | 'fail';

const CLIENT_DIAGNOSTIC_FAILURE_CLASSES = new Set<ClientDiagnosticFailureClass>([
  'SCREEN_NOT_MAIN_MENU',
  'VIEWPORT_NOT_ALLOWED',
  'MENU_STRUCTURE_INVALID',
  'GEOMETRY_UNAVAILABLE',
  'FOOTER_NOT_SAFE',
  'QR_DOCK_NOT_SAFE',
  'MENU_CONTROLS_OVERLAP',
  'TOUCH_TARGET_TOO_SMALL',
  'MENU_HIT_TEST_FAILED',
  'RESERVED_BOTTOM_CONTROLS_UNAVAILABLE',
  'HOST_SAFETY_MEASUREMENT_INVALID',
  'CENTRAL_TARGET_VIEWPORT',
  'CENTRAL_PROFILE_NOT_ALLOWED',
  'HTTP_RESPONSE_REJECTED',
  'INVALID_PLAN_ENVELOPE',
  'STALE_CONTEXT',
  'REQUEST_GENERATION_CHANGED',
  'REQUEST_FAILED',
  'REQUEST_ABORTED',
  'CONTEXT_CHANGED',
  'MANUAL_PLAN_CLEAR',
  'REQUEST_CANCELLED',
  'REPLACED_BY_NEW_REQUEST',
  'LAYOUT_ATTRIBUTE_NOT_APPLIED',
  'APPLIED_PLAN_UNSAFE',
]);

const emptyState: FakeState = {
  plan: null,
  contextKey: null,
  requestId: null,
  startedAt: null,
  pending: false,
  message: '',
};

function getGridColumnCount(): number | null {
  try {
    const grid = document.querySelector<HTMLElement>('.certificate-grid');
    if (!grid?.isConnected) return null;
    const columns = window.getComputedStyle(grid).gridTemplateColumns.trim();
    if (!columns || columns === 'none') return null;
    const count = columns.split(/\s+/).length;
    return Number.isSafeInteger(count) && count > 0 ? count : null;
  } catch {
    return null;
  }
}

function getAllowedOptionId(value: unknown): typeof CIVIL_V2_SAFE_LIST_OPTION_ID | null {
  if (typeof value !== 'object' || value === null) return null;
  const envelope = value as Record<string, unknown>;
  const plan = envelope.plan;
  if (typeof plan !== 'object' || plan === null) return null;
  const operations = (plan as Record<string, unknown>).operations;
  if (!Array.isArray(operations) || operations.length !== 1) return null;
  const operation = operations[0];
  if (typeof operation !== 'object' || operation === null) return null;
  const optionId = (operation as Record<string, unknown>).optionId;
  return optionId === CIVIL_V2_SAFE_LIST_OPTION_ID ? optionId : null;
}

function getPlanOptionId(
  plan: UniversalLayoutV2Plan | null,
): typeof CIVIL_V2_SAFE_LIST_OPTION_ID | null {
  return getAllowedOptionId({ plan });
}

function logClientDiagnostic({
  stage,
  requestId,
  optionId,
  startedAt,
  safetyResult,
  failureClass = null,
  profile,
  requestSource,
  includeLayoutSnapshot = false,
}: {
  stage: ClientDiagnosticStage;
  requestId: number;
  optionId: string | null;
  startedAt: number;
  safetyResult: DiagnosticSafetyResult;
  failureClass?: ClientDiagnosticFailureClass | null;
  profile?: AccessibilityProfile;
  requestSource?: 'manual' | 'qr-auto';
  includeLayoutSnapshot?: boolean;
}): void {
  if (!import.meta.env.DEV) return;
  const safeOptionId = optionId === CIVIL_V2_SAFE_LIST_OPTION_ID ? optionId : null;
  const safeFailureClass = failureClass && CLIENT_DIAGNOSTIC_FAILURE_CLASSES.has(failureClass)
    ? failureClass
    : null;
  const layoutSnapshot = includeLayoutSnapshot
    ? getDevelopmentLayoutSnapshot(profile)
    : undefined;
  console.info('[civil-universal-layout-v2-client]', JSON.stringify({
    stage,
    requestId,
    optionId: safeOptionId,
    ...(requestSource ? { requestSource } : {}),
    gridColumns: getGridColumnCount(),
    safetyResult,
    failureClass: safeFailureClass,
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
    ...(layoutSnapshot ? { layoutSnapshot } : {}),
  }));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function mapAccessibilityProfile(profile: AccessibilityProfile) {
  return {
    textScale: profile.textSize,
    buttonScale: profile.buttonSize,
    contrast: profile.contrast,
    viewportMode: profile.viewportMode,
  } as const;
}

type GeometrySnapshot = {
  grid: HTMLElement | null;
  gridRect: DOMRect | null;
  footer: HTMLElement | null;
  footerRect: DOMRect | null;
  footerPosition: string;
  dock: HTMLElement | null;
  dockRect: DOMRect | null;
  dockPosition: string;
  measurementsValid: boolean;
  footerVisible: boolean;
  footerInFlow: boolean;
  dockVisible: boolean;
  dockReservesBottom: boolean;
  allIdsMatch: boolean;
  menuHitTestSafe: boolean;
  minimumRenderedHeight: number;
  overlapWithFooter: boolean;
  overlapWithDock: boolean;
  developmentDiagnostic?: ClientOverlapDiagnostic;
};

function hasUsableRect(rect: DOMRect | null | undefined): rect is DOMRect {
  return Boolean(
    rect
    && [rect.left, rect.right, rect.top, rect.bottom, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0
    && rect.height > 0,
  );
}

function toDiagnosticRect(rect: DOMRect | null): DiagnosticRect {
  if (
    !rect
    || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
  ) {
    return null;
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
  };
}

function getIntersectionAreaPx2(a: DOMRect | null, b: DOMRect | null): number {
  if (!hasUsableRect(a) || !hasUsableRect(b)) return 0;
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return Math.round(width * height * 100) / 100;
}

function unavailableGeometry(): GeometrySnapshot {
  return {
    grid: null,
    gridRect: null,
    footer: null,
    footerRect: null,
    footerPosition: 'unavailable',
    dock: null,
    dockRect: null,
    dockPosition: 'unavailable',
    measurementsValid: false,
    footerVisible: false,
    footerInFlow: false,
    dockVisible: false,
    dockReservesBottom: false,
    allIdsMatch: false,
    menuHitTestSafe: false,
    minimumRenderedHeight: 0,
    overlapWithFooter: false,
    overlapWithDock: false,
  };
}

function readGeometry(): GeometrySnapshot {
  try {
    const stage = document.querySelector<HTMLElement>('.stage');
    const stageRect = stage?.getBoundingClientRect() ?? null;
    const grid = document.querySelector<HTMLElement>('.certificate-grid');
    const footer = document.querySelector<HTMLElement>('.device-footer[data-a11y-slot="bottom-controls"]');
    const dock = document.querySelector<HTMLElement>('.a11y-qr-entry-dock');
    const actions = grid
      ? Array.from(grid.querySelectorAll<HTMLElement>('[data-a11y-action-id]'))
      : [];
    const gridRect = grid?.getBoundingClientRect() ?? null;
    const footerRect = footer?.getBoundingClientRect() ?? null;
    const dockRect = dock?.getBoundingClientRect() ?? null;
    const footerStyle = footer ? window.getComputedStyle(footer) : null;
    const dockStyle = dock ? window.getComputedStyle(dock) : null;
    const footerOpacity = Number.parseFloat(footerStyle?.opacity ?? '');
    const dockOpacity = Number.parseFloat(dockStyle?.opacity ?? '');
    const footerVisible = Boolean(
      footer?.isConnected
      && footerStyle?.display !== 'none'
      && footerStyle?.visibility !== 'hidden'
      && footerStyle?.visibility !== 'collapse'
      && Number.isFinite(footerOpacity)
      && footerOpacity > 0
      && hasUsableRect(footerRect),
    );
    const footerInFlow = Boolean(
      footerVisible
      && footerStyle
      && footerStyle.position !== 'fixed'
      && footerStyle.position !== 'sticky',
    );
    const dockVisible = Boolean(
      dock?.isConnected
      && dockStyle?.display !== 'none'
      && dockStyle?.visibility !== 'hidden'
      && dockStyle?.visibility !== 'collapse'
      && Number.isFinite(dockOpacity)
      && dockOpacity > 0
      && hasUsableRect(dockRect),
    );
    const dockReservesBottom = Boolean(
      dockVisible
      && dockStyle
      && (dockStyle.position === 'fixed' || dockStyle.position === 'sticky')
      && dockRect
      && dockRect.bottom > 0
      && dockRect.top < window.innerHeight,
    );
    const allIdsMatch = actions.length === CIVIL_V2_ITEM_IDS.length
      && actions.every((action, index) => action.dataset.a11yActionId === CIVIL_V2_ITEM_IDS[index]);
    const actionRects = actions.map((action) => action.getBoundingClientRect());
    let visibleActionCount = 0;
    let menuHitTestSafe = Boolean(stage && hasUsableRect(stageRect) && actions.length > 0);
    if (stage && hasUsableRect(stageRect)) {
      for (const [index, actionRect] of actionRects.entries()) {
        if (!hasUsableRect(actionRect)) {
          menuHitTestSafe = false;
          continue;
        }
        const centerX = actionRect.left + actionRect.width / 2;
        const centerY = actionRect.top + actionRect.height / 2;
        const insideStage = centerX >= stageRect.left + stage.clientLeft
          && centerX <= stageRect.left + stage.clientLeft + stage.clientWidth
          && centerY >= stageRect.top + stage.clientTop
          && centerY <= stageRect.top + stage.clientTop + stage.clientHeight
          && centerX >= 0
          && centerX <= window.innerWidth
          && centerY >= 0
          && centerY <= window.innerHeight;
        if (!insideStage) continue;
        visibleActionCount += 1;
        const hit = document.elementFromPoint(centerX, centerY);
        if (!hit || (hit !== actions[index] && !actions[index]?.contains(hit))) {
          menuHitTestSafe = false;
        }
      }
    }
    menuHitTestSafe = menuHitTestSafe && visibleActionCount > 0;
    const measurementsValid = Boolean(
      stage?.isConnected
      && hasUsableRect(stageRect)
      && grid?.isConnected
      && footer?.isConnected
      && dock?.isConnected
      && hasUsableRect(gridRect)
      && hasUsableRect(footerRect)
      && hasUsableRect(dockRect)
      && actionRects.length === CIVIL_V2_ITEM_IDS.length
      && actionRects.every(hasUsableRect),
    );
    const minimumRenderedHeight = actionRects.length && actionRects.every(hasUsableRect)
      ? Math.min(...actionRects.map((rect) => rect.height))
      : 0;
    const intersects = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const overlapWithFooter = Boolean(
      hasUsableRect(gridRect) && footerVisible && hasUsableRect(footerRect)
      && intersects(gridRect, footerRect),
    );
    const overlapWithDock = Boolean(
      hasUsableRect(gridRect) && dockVisible && hasUsableRect(dockRect)
      && intersects(gridRect, dockRect),
    );

    const snapshot: GeometrySnapshot = {
      grid,
      gridRect,
      footer,
      footerRect,
      footerPosition: footerStyle?.position ?? 'missing',
      dock,
      dockRect,
      dockPosition: dockStyle?.position ?? 'missing',
      measurementsValid,
      footerVisible,
      footerInFlow,
      dockVisible,
      dockReservesBottom,
      allIdsMatch,
      menuHitTestSafe,
      minimumRenderedHeight,
      overlapWithFooter,
      overlapWithDock,
    };
    if (import.meta.env.DEV) {
      snapshot.developmentDiagnostic = {
        menuClearOfFooter: !overlapWithFooter,
        menuClearOfQrDock: !overlapWithDock,
        menuRect: toDiagnosticRect(gridRect),
        footerRect: toDiagnosticRect(footerRect),
        qrDockRect: toDiagnosticRect(dockRect),
        footerOverlapAreaPx2: footerVisible && hasUsableRect(gridRect)
          ? getIntersectionAreaPx2(gridRect, footerRect)
          : 0,
        qrDockOverlapAreaPx2: dockVisible && hasUsableRect(gridRect)
          ? getIntersectionAreaPx2(gridRect, dockRect)
          : 0,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        stageScrollTop: stage && Number.isFinite(stage.scrollTop) ? stage.scrollTop : null,
        gridColumns: getGridColumnCount(),
      };
    }
    return snapshot;
  } catch {
    return unavailableGeometry();
  }
}

function getDevelopmentLayoutSnapshot(
  profile?: AccessibilityProfile,
): DevelopmentLayoutSnapshot | undefined {
  if (!import.meta.env.DEV) return undefined;

  const selectors = {
    stage: '.stage',
    machine: '.machine',
    machineTop: '.machine-top',
    screenShell: '.screen-shell',
    screenHeader: '.screen-header',
    screenContent: '.screen-content',
    mainView: '.main-view',
    titleBand: '.main-view .title-band',
    demoBanner: '.demo-banner',
    developmentPanel: '.universal-layout-v2-fake',
    menu: '.certificate-grid',
    footer: '.device-footer[data-a11y-slot="bottom-controls"]',
    qrDock: '.a11y-qr-entry-dock',
  } as const;
  const elements = Object.fromEntries(
    Object.entries(selectors).map(([name, selector]) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element?.isConnected) return [name, null];
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return [name, {
        rect: toDiagnosticRect(rect),
        style: {
          position: style.position,
          display: style.display,
          overflow: style.overflow,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          height: style.height,
          minHeight: style.minHeight,
          marginTop: style.marginTop,
          marginBottom: style.marginBottom,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
        },
      }];
    }),
  ) as DevelopmentLayoutSnapshot['elements'];
  const stage = document.querySelector<HTMLElement>(selectors.stage);
  const grid = document.querySelector<HTMLElement>(selectors.menu);
  const gridStyle = grid ? window.getComputedStyle(grid) : null;
  const stageClasses = stage?.classList;
  const viewport1080x1920 = window.matchMedia('(width: 1080px) and (height: 1920px)').matches;
  const reservedSafeListSelectorMatches = Boolean(
    viewport1080x1920
    && stage?.matches(
      '.stage.a11y-qr-entry-dock-home.a11y-qr-entry-dock-scroll-area.a11y-qr-entry-dock-bottom.a11y-text-large.a11y-controls-large.a11y-high-contrast.a11y-easy-language:has(.certificate-grid[data-universal-layout-option="reserved-safe-list"])',
    ),
  );
  const geometry = readGeometry();
  const overlap = geometry.developmentDiagnostic;
  const visualViewport = window.visualViewport;

  return {
    gProfileConditions: {
      viewport1080x1920,
      largeText: Boolean(stageClasses?.contains('a11y-text-large')),
      largeButtons: Boolean(stageClasses?.contains('a11y-controls-large')),
      highContrast: Boolean(stageClasses?.contains('a11y-high-contrast')),
      bottomControls: Boolean(
        stageClasses?.contains('a11y-qr-entry-dock-bottom')
        && stageClasses?.contains('a11y-bottom-viewport-enabled'),
      ),
      bottomControls70Percent: Boolean(
        profile?.viewportMode?.mode === 'bottom'
        && profile.viewportMode.heightPercent === 70
        && stageClasses?.contains('a11y-bottom-viewport-enabled'),
      ),
      easyLanguage: Boolean(stageClasses?.contains('a11y-easy-language')),
      reservedSafeListSelectorMatches,
    },
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: visualViewport ? Math.round(visualViewport.width * 100) / 100 : null,
      visualHeight: visualViewport ? Math.round(visualViewport.height * 100) / 100 : null,
      visualScale: visualViewport ? Math.round(visualViewport.scale * 1000) / 1000 : null,
      visualOffsetTop: visualViewport
        ? Math.round(visualViewport.offsetTop * 100) / 100
        : null,
      devicePixelRatio: window.devicePixelRatio,
      windowScrollY: Math.round(window.scrollY * 100) / 100,
      stageScrollTop: stage ? Math.round(stage.scrollTop * 100) / 100 : null,
    },
    grid: {
      optionId: grid?.dataset.universalLayoutOption === CIVIL_V2_SAFE_LIST_OPTION_ID
        ? CIVIL_V2_SAFE_LIST_OPTION_ID
        : null,
      gridTemplateColumns: gridStyle?.gridTemplateColumns ?? null,
      columns: getGridColumnCount(),
      gap: gridStyle?.gap ?? null,
      marginTop: gridStyle?.marginTop ?? null,
      marginBottom: gridStyle?.marginBottom ?? null,
      paddingTop: gridStyle?.paddingTop ?? null,
      paddingBottom: gridStyle?.paddingBottom ?? null,
    },
    elements,
    safety: {
      menuClearOfFooter: overlap?.menuClearOfFooter ?? false,
      menuClearOfQrDock: overlap?.menuClearOfQrDock ?? false,
      footerOverlapAreaPx2: overlap?.footerOverlapAreaPx2 ?? 0,
      qrDockOverlapAreaPx2: overlap?.qrDockOverlapAreaPx2 ?? 0,
    },
  };
}

function buildRequest(step: KioskStep, profile: AccessibilityProfile, backend: Backend) {
  const geometry = readGeometry();
  const grid = geometry.grid;
  const itemIds = grid
    ? Array.from(grid.querySelectorAll<HTMLElement>('[data-a11y-action-id]'), (element) =>
        element.dataset.a11yActionId ?? '')
    : [];
  const accessibility = mapAccessibilityProfile(profile);
  const reservedBottomCapability = geometry.footerVisible
    && geometry.footerInFlow
    && geometry.dockVisible
    && geometry.dockReservesBottom;
  const layoutCapabilities = reservedBottomCapability
    ? ['reserved-bottom-controls'] as const
    : [] as const;
  const request = {
    screenId: CIVIL_V2_SCREEN_ID,
    itemIds,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      gridWidth: geometry.gridRect ? Math.floor(geometry.gridRect.width) : 0,
    },
    accessibility,
    layoutCapabilities: [...layoutCapabilities],
  };
  const screenIsMainMenu = step === 'main-menu'
    && document.querySelector<HTMLElement>('.screen-content[data-screen="main-menu"]')?.isConnected === true;
  const eligibility: CivilV2HostEligibility = {
    screenIsMainMenu,
    viewportAllowed: window.innerWidth > 520 && window.innerWidth >= 760,
    geometryKnown: geometry.measurementsValid && geometry.allIdsMatch,
    footerVisible: geometry.footerVisible,
    footerInFlow: geometry.footerInFlow,
    qrDockVisible: geometry.dockVisible,
    qrDockReservesBottom: geometry.dockReservesBottom,
    menuClearOfFooter: !geometry.overlapWithFooter,
    menuClearOfQrDock: !geometry.overlapWithDock,
    minimumTouchTargetPx: geometry.minimumRenderedHeight,
    reservedBottomCapability,
    targetViewport: window.innerWidth === 1080 && window.innerHeight === 1920,
    centralProfileAllowed: isCivilV2CentralAccessibilityAllowed(accessibility),
    menuHitTestSafe: geometry.menuHitTestSafe,
  };
  const commonSafetyFailure = getCivilV2HostSafetyFailure(request, eligibility);
  const commonSafetyReason = commonSafetyFailure
    ? civilV2HostSafetyMessage(commonSafetyFailure)
    : null;
  const centralReason = !eligibility.targetViewport
    ? '중앙 v2 시험은 1080×1920 화면에서만 허용됩니다.'
    : !eligibility.centralProfileAllowed
      ? '중앙 v2 시험은 기본 A 또는 승인된 G 접근성 조합에서만 허용됩니다.'
      : commonSafetyReason;
  const failureClass: ClientDiagnosticFailureClass | null = !centralReason
    ? null
    : !eligibility.targetViewport
      ? 'CENTRAL_TARGET_VIEWPORT'
      : !eligibility.centralProfileAllowed
        ? 'CENTRAL_PROFILE_NOT_ALLOWED'
        : commonSafetyFailure;
  const result = {
    request: { request, eligibility },
    eligibility,
    geometry: {
      footerPosition: geometry.footerPosition,
      footerRect: geometry.footerRect ? {
        left: Math.round(geometry.footerRect.left),
        right: Math.round(geometry.footerRect.right),
        top: Math.round(geometry.footerRect.top),
        bottom: Math.round(geometry.footerRect.bottom),
        height: Math.round(geometry.footerRect.height),
      } : null,
      dockRect: geometry.dockVisible && geometry.dockRect ? {
        left: Math.round(geometry.dockRect.left),
        right: Math.round(geometry.dockRect.right),
        top: Math.round(geometry.dockRect.top),
        bottom: Math.round(geometry.dockRect.bottom),
      } : null,
      dockPosition: geometry.dockPosition,
      itemHeight: Math.round(geometry.minimumRenderedHeight),
      measurementsValid: geometry.measurementsValid,
    },
    reason: isCentralBackend(backend) ? centralReason : commonSafetyReason,
    failureClass: isCentralBackend(backend) ? failureClass : commonSafetyFailure,
  };
  if (import.meta.env.DEV && geometry.developmentDiagnostic) {
    return { ...result, overlapDiagnostic: geometry.developmentDiagnostic };
  }
  return result;
}

function isValidatedFakeEnvelope(value: unknown): value is {
  accepted: true;
  model: { structureHash: string; constraintHash: string };
  plan: UniversalLayoutV2Plan;
} {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as Record<string, unknown>;
  if (envelope.accepted !== true || typeof envelope.model !== 'object' || envelope.model === null) {
    return false;
  }
  const model = envelope.model as Record<string, unknown>;
  const plan = envelope.plan as Record<string, unknown> | null;
  if (!plan || typeof plan !== 'object') return false;
  const operations = plan.operations;
  if (!Array.isArray(operations) || operations.length !== 1) return false;
  const operation = operations[0] as Record<string, unknown> | null;
  return model.schemaVersion === 2
    && model.contractVersion === 'universal-layout.v2'
    && model.hostId === CIVIL_V2_FAKE_HOST_ID
    && model.screenId === CIVIL_V2_SCREEN_ID
    && model.structureVersion === CIVIL_V2_STRUCTURE_VERSION
    && plan.schemaVersion === 2
    && plan.contractVersion === 'universal-layout.v2'
    && plan.hostId === CIVIL_V2_FAKE_HOST_ID
    && plan.screenId === CIVIL_V2_SCREEN_ID
    && plan.structureVersion === CIVIL_V2_STRUCTURE_VERSION
    && typeof plan.structureHash === 'string'
    && plan.structureHash === model.structureHash
    && typeof plan.constraintHash === 'string'
    && plan.constraintHash === model.constraintHash
    && operation?.type === 'selectLayoutOption'
    && operation.targetId === CIVIL_V2_COMPONENT_ID
    && operation.groupId === CIVIL_V2_OPTION_GROUP_ID
    && operation.optionId === CIVIL_V2_SAFE_LIST_OPTION_ID;
}

function readContext(step: KioskStep, profile: AccessibilityProfile, backend: Backend): ContextSnapshot {
  const built = buildRequest(step, profile, backend);
  const snapshot: ContextSnapshot = {
    key: stableJson({
      backend,
      step,
      profile,
      request: (built.request as { request: unknown }).request,
    }),
    request: built.request,
    reason: built.reason,
    failureClass: built.failureClass,
  };
  if (import.meta.env.DEV && 'overlapDiagnostic' in built) {
    snapshot.overlapDiagnostic = built.overlapDiagnostic as ClientOverlapDiagnostic;
  }
  return snapshot;
}

export function useUniversalLayoutV2Fake({
  enabled,
  step,
  profile,
  backend = 'local-fake',
}: {
  enabled: boolean;
  step: KioskStep;
  profile: AccessibilityProfile;
  backend?: Backend;
}) {
  const [state, setState] = useState<FakeState>(emptyState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const generation = useRef(0);
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const attributeDiagnosticRequestRef = useRef<number | null>(null);
  const safetyDiagnosticRequestRef = useRef<number | null>(null);
  const profileKey = stableJson(profile);

  const cancel = useCallback((
    message = '',
    clearReason: ClientDiagnosticFailureClass = 'REQUEST_CANCELLED',
  ) => {
    const previous = stateRef.current;
    if (previous.plan && previous.requestId !== null && previous.startedAt !== null) {
      import.meta.env.DEV && logClientDiagnostic({
        stage: 'active_plan_cleared',
        requestId: previous.requestId,
        optionId: getPlanOptionId(previous.plan),
        startedAt: previous.startedAt,
        safetyResult: 'not_checked',
        failureClass: clearReason,
        profile: profileRef.current,
        includeLayoutSnapshot: true,
      });
    }
    generation.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    pendingRef.current = false;
    const nextState = { ...emptyState, message };
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  useEffect(() => {
    cancel('', 'CONTEXT_CHANGED');
  }, [backend, cancel, enabled, profileKey, step]);

  useEffect(() => {
    if (!enabled) return;
    const cancelForViewportChange = () => cancel('', 'CONTEXT_CHANGED');
    window.addEventListener('resize', cancelForViewportChange);
    window.addEventListener('orientationchange', cancelForViewportChange);
    return () => {
      window.removeEventListener('resize', cancelForViewportChange);
      window.removeEventListener('orientationchange', cancelForViewportChange);
    };
  }, [cancel, enabled]);

  const apply = useCallback(async (
    optionId: typeof CIVIL_V2_SAFE_LIST_OPTION_ID | null,
    requestSource: 'manual' | 'qr-auto' = 'manual',
  ) => {
    if (!enabled || step !== 'main-menu' || pendingRef.current) return;
    if (optionId === null) {
      cancel('', 'MANUAL_PLAN_CLEAR');
      return;
    }

    const context = readContext(step, profile, backend);
    if (context.reason) {
      const nextState = {
        ...emptyState,
        contextKey: context.key,
        message: context.reason,
      };
      stateRef.current = nextState;
      setState(nextState);
      return;
    }

    const previous = stateRef.current;
    if (previous.plan && previous.requestId !== null && previous.startedAt !== null) {
      import.meta.env.DEV && logClientDiagnostic({
        stage: 'active_plan_cleared',
        requestId: previous.requestId,
        optionId: getPlanOptionId(previous.plan),
        startedAt: previous.startedAt,
        safetyResult: 'not_checked',
        failureClass: 'REPLACED_BY_NEW_REQUEST',
        profile,
        includeLayoutSnapshot: true,
      });
    }
    const requestGeneration = ++generation.current;
    const startedAt = performance.now();
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    const pendingState: FakeState = {
      plan: null,
      contextKey: context.key,
      requestId: requestGeneration,
      startedAt,
      pending: true,
      message: backend === 'central-fake'
        ? 'Development relay를 통해 중앙 Universal v2 Fake 계획을 확인하는 중입니다.'
        : '첨부된 Universal v2 계약으로 로컬 Fake 계획을 검증하는 중입니다.',
    };
    stateRef.current = pendingState;
    setState(pendingState);
    import.meta.env.DEV && logClientDiagnostic({
      stage: requestSource === 'qr-auto' ? 'qr_auto_request_started' : 'request_started',
      requestId: requestGeneration,
      optionId,
      startedAt,
      safetyResult: 'not_checked',
      requestSource,
      profile,
      includeLayoutSnapshot: true,
    });
    let validationDiagnosticSent = false;

    try {
      const endpoint = backend === 'central-fake'
        ? '/api/dev/universal-layout/v2-central-plan'
        : backend === 'central-openai'
          ? '/api/dev/universal-layout/v2-openai-plan'
          : '/api/dev/universal-layout/v2-fake';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify(context.request),
      });
      const payload: unknown = await response.json().catch(() => null);
      const safeOptionId = getAllowedOptionId(payload);
      import.meta.env.DEV && logClientDiagnostic({
        stage: 'client_plan_received',
        requestId: requestGeneration,
        optionId: safeOptionId,
        startedAt,
        safetyResult: 'not_checked',
        profile,
        includeLayoutSnapshot: true,
      });
      const envelopeValid = response.ok && isValidatedFakeEnvelope(payload);
      if (!envelopeValid) {
        import.meta.env.DEV && logClientDiagnostic({
          stage: 'client_validator_rejected',
          requestId: requestGeneration,
          optionId: safeOptionId,
          startedAt,
          safetyResult: 'not_checked',
          failureClass: response.ok ? 'INVALID_PLAN_ENVELOPE' : 'HTTP_RESPONSE_REJECTED',
          profile,
          includeLayoutSnapshot: true,
        });
        validationDiagnosticSent = true;
        const errorCode = typeof payload === 'object' && payload !== null
          && typeof (payload as Record<string, unknown>).error === 'string'
          ? (payload as Record<string, string>).error
          : 'INVALID_V2_PLAN';
        throw new Error(errorCode);
      }
      const latest = readContext(step, profile, backend);
      if (latest.key !== context.key || generation.current !== requestGeneration) {
        import.meta.env.DEV && logClientDiagnostic({
          stage: 'client_validator_rejected',
          requestId: requestGeneration,
          optionId: safeOptionId,
          startedAt,
          safetyResult: 'not_checked',
          failureClass: generation.current !== requestGeneration
            ? 'REQUEST_GENERATION_CHANGED'
            : 'STALE_CONTEXT',
          profile,
          includeLayoutSnapshot: true,
        });
        validationDiagnosticSent = true;
        if (generation.current === requestGeneration) {
          const staleState = {
            ...emptyState,
            contextKey: latest.key,
            requestId: requestGeneration,
            startedAt,
            message: '화면 구조가 바뀌어 오래된 계획을 폐기했습니다. 다시 확인해 주세요.',
          };
          stateRef.current = staleState;
          setState(staleState);
        }
        return;
      }

      import.meta.env.DEV && logClientDiagnostic({
        stage: 'client_validator_passed',
        requestId: requestGeneration,
        optionId: safeOptionId,
        startedAt,
        safetyResult: 'not_checked',
        profile,
        includeLayoutSnapshot: true,
      });
      validationDiagnosticSent = true;
      const activeState: FakeState = {
        plan: payload.plan,
        contextKey: context.key,
        requestId: requestGeneration,
        startedAt,
        pending: false,
        message: backend === 'central-fake' || backend === 'central-openai'
          ? `중앙 Development v2 ${backend === 'central-openai' ? 'OpenAI' : 'Fake'} 계획이 현재 모델과 호스트 정책 검증을 통과했습니다.`
          : '로컬 Development 정책으로 reserved-safe-list를 검증했습니다. 중앙 API와 AI는 호출하지 않았습니다.',
      };
      stateRef.current = activeState;
      import.meta.env.DEV && logClientDiagnostic({
        stage: 'active_plan_set',
        requestId: requestGeneration,
        optionId: safeOptionId,
        startedAt,
        safetyResult: 'not_checked',
        profile,
        includeLayoutSnapshot: true,
      });
      setState(activeState);
    } catch (error) {
      if (controller.signal.aborted) {
        if (!validationDiagnosticSent) {
          import.meta.env.DEV && logClientDiagnostic({
            stage: 'client_validator_rejected',
            requestId: requestGeneration,
            optionId: null,
            startedAt,
            safetyResult: 'not_checked',
            failureClass: 'REQUEST_ABORTED',
            profile,
            includeLayoutSnapshot: true,
          });
        }
        return;
      }
      const latest = readContext(step, profile, backend);
      if (latest.key !== context.key || generation.current !== requestGeneration) {
        if (!validationDiagnosticSent) {
          import.meta.env.DEV && logClientDiagnostic({
            stage: 'client_validator_rejected',
            requestId: requestGeneration,
            optionId: null,
            startedAt,
            safetyResult: 'not_checked',
            failureClass: generation.current !== requestGeneration
              ? 'REQUEST_GENERATION_CHANGED'
              : 'STALE_CONTEXT',
            profile,
            includeLayoutSnapshot: true,
          });
        }
        return;
      }
      if (!validationDiagnosticSent) {
        import.meta.env.DEV && logClientDiagnostic({
          stage: 'client_validator_rejected',
          requestId: requestGeneration,
          optionId: null,
          startedAt,
          safetyResult: 'not_checked',
          failureClass: 'REQUEST_FAILED',
          profile,
          includeLayoutSnapshot: true,
        });
      }
      const errorCode = error instanceof Error ? error.message : 'INVALID_V2_PLAN';
      const message = isCentralBackend(backend)
        ? errorCode === 'RELAY_DISABLED'
          ? '중앙 v2 Development relay가 OFF입니다. 로컬 Fake 또는 기존 배치를 사용하세요.'
          : '중앙 v2 Development 계획을 받지 못했거나 검증에 실패했습니다. 기존 배치를 유지합니다.'
        : 'v2 Fake 계획이 공통 정책 검증을 통과하지 못해 기존 배치를 유지합니다.';
      const errorState = {
        ...emptyState,
        contextKey: context.key,
        requestId: requestGeneration,
        startedAt,
        message,
      };
      stateRef.current = errorState;
      setState(errorState);
    } finally {
      if (generation.current === requestGeneration) {
        pendingRef.current = false;
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        setState((currentState) => {
          if (
            generation.current !== requestGeneration
            || !currentState.pending
            || currentState.contextKey !== context.key
          ) {
            return currentState;
          }
          const nextState = { ...currentState, plan: null, pending: false, message: '' };
          stateRef.current = nextState;
          return nextState;
        });
      }
    }
  }, [backend, cancel, enabled, profile, step]);

  const currentContext = readContext(step, profile, backend);
  const activePlan = enabled
    && step === 'main-menu'
    && state.contextKey === currentContext.key
    ? state.plan
    : null;
  const selectedOption = activePlan?.operations.find(
    (operation) => operation.type === 'selectLayoutOption',
  );
  const activeOptionId = selectedOption?.type === 'selectLayoutOption'
    ? selectedOption.optionId
    : null;
  const message = state.contextKey === null || state.contextKey === currentContext.key
    ? state.message
    : '';

  useEffect(() => {
    if (!state.plan) return;
    const appliedPlan = state.plan;
    const appliedGeneration = generation.current;
    const requestId = state.requestId ?? appliedGeneration;
    const startedAt = state.startedAt ?? performance.now();
    const optionId = getPlanOptionId(appliedPlan);
    if (stateRef.current.plan !== appliedPlan) return;

    const clearAppliedPlan = (contextKey: string, message: string, reason: ClientDiagnosticFailureClass) => {
      if (stateRef.current.plan !== appliedPlan) return;
      import.meta.env.DEV && logClientDiagnostic({
        stage: 'active_plan_cleared',
        requestId,
        optionId,
        startedAt,
        safetyResult: reason === 'STALE_CONTEXT' || reason === 'CONTEXT_CHANGED'
          ? 'not_checked'
          : 'fail',
        failureClass: reason,
        profile,
        includeLayoutSnapshot: true,
      });
      setState((current) => {
        if (current.plan !== appliedPlan) return current;
        const nextState = { ...emptyState, contextKey, message };
        stateRef.current = nextState;
        return nextState;
      });
    };

    if (state.contextKey !== currentContext.key) {
      const latest = readContext(step, profile, backend);
      import.meta.env.DEV && logClientDiagnostic({
        stage: 'post_apply_safety_failed',
        requestId,
        optionId,
        startedAt,
        safetyResult: 'fail',
        failureClass: 'STALE_CONTEXT',
        profile,
        includeLayoutSnapshot: true,
      });
      clearAppliedPlan(
        latest.key,
        '화면 조건이 바뀌어 오래된 계획을 폐기했습니다. 접근성 설정은 유지됩니다.',
        'STALE_CONTEXT',
      );
      return;
    }

    if (attributeDiagnosticRequestRef.current !== requestId) {
      attributeDiagnosticRequestRef.current = requestId;
      const grid = document.querySelector<HTMLElement>('.certificate-grid');
      const attributeApplied = grid?.dataset.universalLayoutOption === optionId;
      import.meta.env.DEV && logClientDiagnostic({
        stage: 'layout_attribute_applied',
        requestId,
        optionId,
        startedAt,
        safetyResult: attributeApplied ? 'not_checked' : 'fail',
        failureClass: attributeApplied ? null : 'LAYOUT_ATTRIBUTE_NOT_APPLIED',
        profile,
        includeLayoutSnapshot: true,
      });
    }

    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      if (generation.current === appliedGeneration) {
        import.meta.env.DEV && logClientDiagnostic({
          stage: 'first_animation_frame',
          requestId,
          optionId,
          startedAt,
          safetyResult: 'not_checked',
          profile,
          includeLayoutSnapshot: true,
        });
      }
      secondFrame = window.requestAnimationFrame(() => {
        if (generation.current !== appliedGeneration) return;
        import.meta.env.DEV && logClientDiagnostic({
          stage: 'second_animation_frame',
          requestId,
          optionId,
          startedAt,
          safetyResult: 'not_checked',
          profile,
          includeLayoutSnapshot: true,
        });
        const latest = readContext(step, profile, backend);
        if (latest.key !== state.contextKey) {
          if (safetyDiagnosticRequestRef.current !== requestId) {
            safetyDiagnosticRequestRef.current = requestId;
            import.meta.env.DEV && logClientDiagnostic({
              stage: 'post_apply_safety_failed',
              requestId,
              optionId,
              startedAt,
              safetyResult: 'fail',
              failureClass: 'STALE_CONTEXT',
            });
          }
          clearAppliedPlan(
            latest.key,
            '화면 구조가 바뀌어 계획을 폐기했습니다. 접근성 설정은 유지됩니다.',
            'STALE_CONTEXT',
          );
          return;
        }
        if (latest.reason) {
          if (safetyDiagnosticRequestRef.current !== requestId) {
            safetyDiagnosticRequestRef.current = requestId;
            if (
              latest.failureClass === 'MENU_CONTROLS_OVERLAP'
              && import.meta.env.DEV
              && latest.overlapDiagnostic
            ) {
              const safeOptionId = optionId === CIVIL_V2_SAFE_LIST_OPTION_ID ? optionId : null;
              console.info('[civil-universal-layout-v2-client]', JSON.stringify({
                stage: 'post_apply_safety_failed',
                requestId,
                optionId: safeOptionId,
                gridColumns: latest.overlapDiagnostic.gridColumns,
                safetyResult: 'fail',
                failureClass: 'MENU_CONTROLS_OVERLAP',
                elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
                overlapDiagnostic: latest.overlapDiagnostic,
                layoutSnapshot: getDevelopmentLayoutSnapshot(profile),
                rollback: true,
              }));
            } else {
              import.meta.env.DEV && logClientDiagnostic({
                stage: 'post_apply_safety_failed',
                requestId,
                optionId,
                startedAt,
                safetyResult: 'fail',
                failureClass: latest.failureClass ?? 'APPLIED_PLAN_UNSAFE',
                profile,
                includeLayoutSnapshot: true,
              });
            }
          }
          clearAppliedPlan(
            latest.key,
            `적용 후 화면 안전 검사를 통과하지 못해 배치 계획만 해제했습니다. 접근성 설정은 유지됩니다. ${latest.reason}`,
            latest.failureClass ?? 'APPLIED_PLAN_UNSAFE',
          );
          return;
        }
        if (safetyDiagnosticRequestRef.current !== requestId) {
          safetyDiagnosticRequestRef.current = requestId;
          import.meta.env.DEV && logClientDiagnostic({
            stage: 'post_apply_safety_passed',
            requestId,
            optionId,
            startedAt,
            safetyResult: 'pass',
            profile,
            includeLayoutSnapshot: true,
          });
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [
    backend,
    currentContext.key,
    profile,
    state.contextKey,
    state.plan,
    state.requestId,
    state.startedAt,
    step,
  ]);

  return {
    activeOptionId,
    pending: state.pending,
    message,
    apply,
    cancel,
  };
}
