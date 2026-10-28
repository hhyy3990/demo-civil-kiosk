import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_ACCESSIBILITY_PROFILE,
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
import type { UniversalLayoutV2Plan } from '../universal-layout/v2/universal-v2-contract-export';
import type { KioskStep } from './useKioskAccessibility';

type FakeState = {
  plan: UniversalLayoutV2Plan | null;
  contextKey: string | null;
  pending: boolean;
  message: string;
};

type Backend = 'local-fake' | 'central-fake';

type ContextSnapshot = {
  key: string;
  request: unknown;
  reason: string | null;
};

const emptyState: FakeState = { plan: null, contextKey: null, pending: false, message: '' };

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

function readGeometry() {
  const grid = document.querySelector<HTMLElement>('.certificate-grid');
  const footer = document.querySelector<HTMLElement>('.device-footer[data-a11y-slot="bottom-controls"]');
  const dock = document.querySelector<HTMLElement>('.a11y-qr-entry-dock');
  const actions = grid
    ? Array.from(grid.querySelectorAll<HTMLElement>('[data-a11y-action-id]'))
    : [];
  const gridRect = grid?.getBoundingClientRect();
  const footerRect = footer?.getBoundingClientRect();
  const dockRect = dock?.getBoundingClientRect();
  const footerStyle = footer ? window.getComputedStyle(footer) : null;
  const footerVisible = Boolean(
    footer
    && footer.isConnected
    && footerStyle?.display !== 'none'
    && footerStyle?.visibility !== 'hidden'
    && Number(footerStyle?.opacity ?? 0) !== 0
    && footerRect
    && footerRect.width > 0
    && footerRect.height > 0,
  );
  const footerInFlow = Boolean(
    footerVisible
    && footerStyle
    && footerStyle.position !== 'fixed'
    && footerStyle.position !== 'sticky',
  );
  const dockVisible = Boolean(
    dock
    && dock.isConnected
    && dockRect
    && dockRect.width > 0
    && dockRect.height > 0
    && window.getComputedStyle(dock).display !== 'none'
    && window.getComputedStyle(dock).visibility !== 'hidden',
  );
  const dockStyle = dock ? window.getComputedStyle(dock) : null;
  const dockReservesBottom = Boolean(
    dockVisible
    && dockStyle
    && (dockStyle.position === 'fixed' || dockStyle.position === 'sticky')
    && dockRect
    && dockRect.bottom > 0
    && dockRect.top < window.innerHeight,
  );
  const intersects = (a: DOMRect, b: DOMRect) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const allIdsMatch = actions.length === CIVIL_V2_ITEM_IDS.length
    && actions.every((action, index) => action.dataset.a11yActionId === CIVIL_V2_ITEM_IDS[index]);
  const minimumRenderedHeight = actions.length
    ? Math.min(...actions.map((action) => action.getBoundingClientRect().height))
    : 0;
  const overlapWithFooter = Boolean(gridRect && footerVisible && footerRect && intersects(gridRect, footerRect));
  const overlapWithDock = Boolean(gridRect && dockVisible && dockRect && intersects(gridRect, dockRect));
  const viewportAllowed = window.innerWidth > 520 && window.innerWidth >= 760;
  const reason = !viewportAllowed
    ? '기존 모바일 적용 제한을 유지합니다. 760px 이상 화면에서만 이 Development preset을 시험할 수 있습니다.'
    : !allIdsMatch
      ? '증명서 18개 또는 메뉴 순서가 예상과 달라 기본 배치를 유지합니다.'
      : !footerVisible || !footerInFlow
        ? '하단 조작부의 실제 안전 영역을 확인할 수 없어 기본 배치를 유지합니다.'
        : overlapWithFooter
          ? '증명서 메뉴와 하단 조작부가 겹쳐 기본 배치를 유지합니다.'
          : overlapWithDock
            ? '증명서 메뉴와 QR 도크가 겹쳐 기본 배치를 유지합니다.'
            : minimumRenderedHeight < 44
              ? '실제 메뉴 터치 영역이 44px보다 작아 기본 배치를 유지합니다.'
              : null;

  return {
    grid,
    gridRect,
    footer,
    footerRect,
    dock,
    dockRect,
    footerVisible,
    footerInFlow,
    dockVisible,
    dockReservesBottom,
    allIdsMatch,
    minimumRenderedHeight,
    overlapWithFooter,
    overlapWithDock,
    reason,
  };
}

function buildRequest(profile: AccessibilityProfile, backend: Backend) {
  const geometry = readGeometry();
  const grid = geometry.grid;
  const itemIds = grid
    ? Array.from(grid.querySelectorAll<HTMLElement>('[data-a11y-action-id]'), (element) =>
        element.dataset.a11yActionId ?? '')
    : [];
  const accessibility = mapAccessibilityProfile(profile);
  const layoutCapabilities = (geometry.footerVisible && geometry.footerInFlow) || geometry.dockReservesBottom
    ? ['reserved-bottom-controls'] as const
    : [] as const;
  const request = {
    screenId: 'civil.main-menu' as const,
    itemIds,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      gridWidth: grid ? Math.floor(grid.getBoundingClientRect().width) : 0,
    },
    accessibility,
    layoutCapabilities: [...layoutCapabilities],
  };
  const eligibility = {
    targetViewport: window.innerWidth === 1080 && window.innerHeight === 1920,
    standardProfile: stableJson(profile) === stableJson(DEFAULT_ACCESSIBILITY_PROFILE),
    geometryKnown: Boolean(grid && geometry.footer && geometry.dock && itemIds.length === 18),
    footerInFlow: geometry.footerVisible && geometry.footerInFlow,
    qrDockReservesBottom: geometry.dockReservesBottom,
    menuClearOfFooter: !geometry.overlapWithFooter,
    menuClearOfQrDock: !geometry.overlapWithDock,
    minimumTouchTarget: geometry.minimumRenderedHeight >= 44,
    reservedBottomCapability: layoutCapabilities.length > 0,
  };
  const centralReason = !eligibility.targetViewport
    ? '중앙 v2 시험은 1080×1920 화면에서만 허용됩니다.'
    : !eligibility.standardProfile
      ? '중앙 v2 시험은 기본 접근성 프로필에서만 허용됩니다.'
      : geometry.reason
        ? geometry.reason
        : !eligibility.qrDockReservesBottom
          ? 'QR 도크의 고정 하단 영역을 확인할 수 없어 중앙 계획을 적용하지 않습니다.'
          : !eligibility.reservedBottomCapability
            ? 'reserved-bottom-controls capability를 확인할 수 없어 중앙 계획을 적용하지 않습니다.'
            : null;
  return {
    request: backend === 'central-fake' ? { request, eligibility } : request,
    geometry: {
      footerPosition: geometry.footer ? window.getComputedStyle(geometry.footer).position : 'missing',
      footerRect: geometry.footerRect ? {
        top: Math.round(geometry.footerRect.top),
        bottom: Math.round(geometry.footerRect.bottom),
        height: Math.round(geometry.footerRect.height),
      } : null,
      dockRect: geometry.dockVisible && geometry.dockRect ? {
        top: Math.round(geometry.dockRect.top),
        bottom: Math.round(geometry.dockRect.bottom),
      } : null,
      dockPosition: geometry.dock ? window.getComputedStyle(geometry.dock).position : 'missing',
      itemHeight: Math.round(geometry.minimumRenderedHeight),
    },
    reason: backend === 'central-fake' ? centralReason : geometry.reason,
  };
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
  const built = buildRequest(profile, backend);
  return {
    key: stableJson({
      backend,
      step,
      profile,
      request: built.request,
      geometry: built.geometry,
    }),
    request: built.request,
    reason: built.reason,
  };
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
  const generation = useRef(0);
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const profileKey = stableJson(profile);

  const cancel = useCallback((message = '') => {
    generation.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    pendingRef.current = false;
    setState({ ...emptyState, message });
  }, []);

  useEffect(() => {
    cancel();
  }, [backend, cancel, enabled, profileKey, step]);

  useEffect(() => {
    if (!enabled) return;
    const cancelForViewportChange = () => cancel();
    window.addEventListener('resize', cancelForViewportChange);
    window.addEventListener('orientationchange', cancelForViewportChange);
    return () => {
      window.removeEventListener('resize', cancelForViewportChange);
      window.removeEventListener('orientationchange', cancelForViewportChange);
    };
  }, [cancel, enabled]);

  const apply = useCallback(async (optionId: typeof CIVIL_V2_SAFE_LIST_OPTION_ID | null) => {
    if (!enabled || step !== 'main-menu' || pendingRef.current) return;
    if (optionId === null) {
      cancel();
      return;
    }

    const context = readContext(step, profile, backend);
    if (context.reason) {
      setState({ ...emptyState, contextKey: context.key, message: context.reason });
      return;
    }

    const requestGeneration = ++generation.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setState({
      plan: null,
      contextKey: context.key,
      pending: true,
      message: backend === 'central-fake'
        ? 'Development relay를 통해 중앙 Universal v2 Fake 계획을 확인하는 중입니다.'
        : '첨부된 Universal v2 계약으로 로컬 Fake 계획을 검증하는 중입니다.',
    });

    try {
      const endpoint = backend === 'central-fake'
        ? '/api/dev/universal-layout/v2-central-plan'
        : '/api/dev/universal-layout/v2-fake';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify(context.request),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isValidatedFakeEnvelope(payload)) {
        const errorCode = typeof payload === 'object' && payload !== null
          && typeof (payload as Record<string, unknown>).error === 'string'
          ? (payload as Record<string, string>).error
          : 'INVALID_V2_PLAN';
        throw new Error(errorCode);
      }
      const latest = readContext(step, profile, backend);
      if (latest.key !== context.key || generation.current !== requestGeneration) return;

      setState({
        plan: payload.plan,
        contextKey: context.key,
        pending: false,
        message: backend === 'central-fake'
          ? '중앙 Development v2 Fake 계획이 현재 모델과 호스트 정책 검증을 통과했습니다.'
          : '로컬 Development 정책으로 reserved-safe-list를 검증했습니다. 중앙 API와 AI는 호출하지 않았습니다.',
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const latest = readContext(step, profile, backend);
      if (latest.key !== context.key || generation.current !== requestGeneration) return;
      const errorCode = error instanceof Error ? error.message : 'INVALID_V2_PLAN';
      const message = backend === 'central-fake'
        ? errorCode === 'RELAY_DISABLED'
          ? '중앙 v2 Development relay가 OFF입니다. 로컬 Fake 또는 기존 배치를 사용하세요.'
          : '중앙 v2 Development 계획을 받지 못했거나 검증에 실패했습니다. 기존 배치를 유지합니다.'
        : 'v2 Fake 계획이 공통 정책 검증을 통과하지 못해 기존 배치를 유지합니다.';
      setState({
        ...emptyState,
        contextKey: context.key,
        message,
      });
    } finally {
      if (generation.current === requestGeneration) {
        pendingRef.current = false;
        controllerRef.current = null;
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

  return {
    activeOptionId,
    pending: state.pending,
    message,
    apply,
  };
}
