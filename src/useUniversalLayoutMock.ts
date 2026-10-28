import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_ACCESSIBILITY_PROFILE,
  type AccessibilityProfile,
} from '@naebangsik/kiosk-accessibility-sdk';
import type { UniversalLayoutPlan } from '../universal-layout/universal-layout-contract';
import type { KioskStep } from './useKioskAccessibility';

type MockColumns = 1 | 2;
type LayoutBackend = 'local' | 'central' | 'openai';

type MockState = {
  plan: UniversalLayoutPlan | null;
  contextKey: string | null;
  pending: boolean;
  message: string;
};

const emptyState: MockState = {
  plan: null,
  contextKey: null,
  pending: false,
  message: '',
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function measureCentralEligibility(profile: AccessibilityProfile) {
  const footer = document.querySelector<HTMLElement>('.device-footer');
  if (!footer) {
    return { standardProfile: false, geometryKnown: false, hasFixedBottomControls: true };
  }

  const style = window.getComputedStyle(footer);
  const rect = footer.getBoundingClientRect();
  const visible = style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(style.opacity) !== 0
    && rect.width > 0
    && rect.height > 0;
  const fixedAtBottom = visible
    && (style.position === 'fixed' || style.position === 'sticky')
    && rect.bottom > 0
    && rect.top < window.innerHeight;

  return {
    standardProfile: stableJson(profile) === stableJson(DEFAULT_ACCESSIBILITY_PROFILE),
    geometryKnown: true,
    hasFixedBottomControls: fixedAtBottom,
  };
}

function getContextKey(step: KioskStep, profile: AccessibilityProfile, backend: LayoutBackend) {
  const grid = document.querySelector<HTMLElement>('.certificate-grid');
  const relayEligibility = backend === 'local' ? null : measureCentralEligibility(profile);
  return JSON.stringify({
    backend,
    screenId: `civil.${step}`,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      gridWidth: grid ? Math.floor(grid.getBoundingClientRect().width) : 0,
    },
    accessibility: {
      textScale: profile.textSize,
      buttonScale: profile.buttonSize,
      contrast: profile.contrast,
      bottomControls: profile.bottomControls,
      viewportMode: profile.viewportMode,
    },
    relayEligibility,
  });
}

function isValidatedPlanEnvelope(value: unknown): value is { plan: UniversalLayoutPlan } {
  if (
    typeof value !== 'object'
    || value === null
    || !('accepted' in value)
    || value.accepted !== true
    || !('plan' in value)
  ) return false;
  const plan = value.plan;
  if (typeof plan !== 'object' || plan === null || !('operations' in plan)) return false;
  const candidate = plan as UniversalLayoutPlan;
  return candidate.schemaVersion === 1
    && candidate.contractVersion === 'universal-layout.v1'
    && candidate.hostId === 'civil-kiosk-mock'
    && candidate.screenId === 'civil.main-menu'
    && candidate.structureVersion === 'civil-main-mock.v1'
    && /^[a-f0-9]{64}$/.test(candidate.structureHash)
    && /^[a-f0-9]{64}$/.test(candidate.constraintHash)
    && Array.isArray(candidate.operations)
    && candidate.operations.length === 1
    && candidate.operations[0]?.type === 'setColumns'
    && candidate.operations[0]?.targetId === 'civil.certificate-grid'
    && (candidate.operations[0]?.columns === 1 || candidate.operations[0]?.columns === 2);
}

export function useUniversalLayoutMock({
  enabled,
  step,
  profile,
  backend,
}: {
  enabled: boolean;
  step: KioskStep;
  profile: AccessibilityProfile;
  backend: LayoutBackend;
}) {
  const [state, setState] = useState<MockState>(emptyState);
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const profileKey = stableJson(profile);

  const cancel = useCallback(() => {
    requestSequence.current += 1;
    requestController.current?.abort();
    requestController.current = null;
    pendingRef.current = false;
    setState(emptyState);
  }, []);

  useEffect(() => {
    cancel();
  }, [backend, cancel, enabled, profileKey, step]);

  useEffect(() => {
    if (!enabled) return;
    const invalidateForViewportChange = () => cancel();
    window.addEventListener('resize', invalidateForViewportChange);
    window.addEventListener('orientationchange', invalidateForViewportChange);
    return () => {
      window.removeEventListener('resize', invalidateForViewportChange);
      window.removeEventListener('orientationchange', invalidateForViewportChange);
    };
  }, [backend, cancel, enabled]);

  const apply = useCallback(async (columns: MockColumns | null) => {
    if (!enabled || step !== 'main-menu' || pendingRef.current) return;
    if (columns === null) {
      cancel();
      return;
    }

    const grid = document.querySelector<HTMLElement>('.certificate-grid');
    if (!grid) {
      setState({ ...emptyState, message: '증명서 메뉴를 찾지 못해 기본 배치를 유지합니다.' });
      return;
    }

    const contextKey = getContextKey(step, profile, backend);
    const relayEligibility = backend === 'local' ? null : measureCentralEligibility(profile);
    if (
      backend !== 'local'
      && (
        !relayEligibility?.standardProfile
        || !relayEligibility.geometryKnown
        || relayEligibility.hasFixedBottomControls
        || window.innerWidth <= 520
        || profile.bottomControls
        || profile.viewportMode !== null
      )
    ) {
      setState({
        ...emptyState,
        contextKey,
        message: '표준 접근성 설정과 고정 하단 조작부가 없는 화면에서만 중앙 계획을 허용합니다. 기존 배치를 유지합니다.',
      });
      return;
    }

    const requestId = ++requestSequence.current;
    const controller = new AbortController();
    requestController.current = controller;
    pendingRef.current = true;
    setState({
      plan: null,
      contextKey: null,
      pending: true,
      message: '공통 계약으로 배치를 확인하는 중입니다.',
    });
    const hostRequest = {
      screenId: `civil.${step}`,
      componentId: 'civil.certificate-grid',
      columns,
      itemIds: Array.from(
        grid.querySelectorAll<HTMLElement>('[data-a11y-action-id]'),
        (element) => element.dataset.a11yActionId ?? '',
      ),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        gridWidth: Math.floor(grid.getBoundingClientRect().width),
      },
      accessibility: {
        textScale: profile.textSize,
        buttonScale: profile.buttonSize,
        contrast: profile.contrast,
        bottomControls: profile.bottomControls,
        viewportMode: profile.viewportMode,
      },
    };

    try {
      const response = await fetch(
        backend === 'central'
          ? '/api/dev/universal-layout/plan'
          : backend === 'openai'
            ? '/api/dev/universal-layout/openai-plan'
            : '/api/dev/universal-layout/mock',
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify(backend === 'central'
          ? {
              request: hostRequest,
              eligibility: relayEligibility,
            }
          : backend === 'openai'
            ? {
                request: hostRequest,
                eligibility: relayEligibility,
              }
            : hostRequest),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (requestId !== requestSequence.current || contextKey !== getContextKey(step, profile, backend)) return;

      if (!response.ok) {
        const errorCode = typeof payload === 'object' && payload !== null && 'error' in payload
          ? String(payload.error)
          : '';
        const message = errorCode === 'DISALLOWED_COLUMN_COUNT'
          ? '현재 화면 폭 또는 접근성 설정에서는 해당 열 수를 허용하지 않아 기본 배치를 유지합니다.'
          : errorCode === 'CENTRAL_PROFILE_UNSUPPORTED'
            ? '현재 접근성 설정 또는 고정 footer 상태는 중앙 정책과 맞지 않아 기존 배치를 유지합니다.'
            : backend === 'central'
              ? '중앙 Development Mock을 사용할 수 없어 기존 배치를 유지합니다.'
              : '공통 계약 검증에 실패해 기본 배치를 유지합니다.';
        setState({ ...emptyState, contextKey, message });
        return;
      }

      if (
        typeof payload === 'object'
        && payload !== null
        && 'accepted' in payload
        && payload.accepted === false
      ) {
        const errorCode = 'error' in payload ? String(payload.error) : '';
        const message = errorCode === 'DISALLOWED_COLUMN_COUNT'
          ? '현재 화면 폭 또는 접근성 설정에서는 해당 열 수를 허용하지 않아 기본 배치를 유지합니다.'
          : errorCode === 'CENTRAL_PROFILE_UNSUPPORTED'
            ? '현재 접근성 설정 또는 고정 footer 상태는 중앙 정책과 맞지 않아 기존 배치를 유지합니다.'
            : backend === 'central'
              ? '중앙 Development Mock이 요청을 거부해 기존 배치를 유지합니다.'
              : '공통 계약 검증에 실패해 기본 배치를 유지합니다.';
        setState({ ...emptyState, contextKey, message });
        return;
      }

      if (!isValidatedPlanEnvelope(payload)) {
        setState({ ...emptyState, contextKey, message: '검증된 배치 결과가 아니어서 기본 배치를 유지합니다.' });
        return;
      }

      setState({
        plan: payload.plan,
        contextKey,
        pending: false,
        message: backend === 'central'
          ? `중앙 Development Mock이 ${payload.plan.operations[0]?.type === 'setColumns' ? payload.plan.operations[0].columns : ''}열 계획을 검증했습니다.`
          : backend === 'openai'
            ? `중앙 OpenAI Development 계획이 공통 검증을 통과했습니다.`
            : `${columns}열 로컬 Development Mock이 공통 계약 검증을 통과했습니다.`,
      });
    } catch {
      if (requestId !== requestSequence.current || contextKey !== getContextKey(step, profile, backend)) return;
      setState({
        ...emptyState,
        contextKey,
        message: backend === 'central'
          ? '중앙 Development 중계를 사용할 수 없어 기존 배치를 유지합니다.'
          : backend === 'openai'
            ? 'OpenAI Development 중계를 사용할 수 없어 기존 배치를 유지합니다.'
            : '개발 Mock 서버에 연결할 수 없어 기본 배치를 유지합니다.',
      });
    } finally {
      if (requestId === requestSequence.current) {
        pendingRef.current = false;
        requestController.current = null;
      }
    }
  }, [backend, cancel, enabled, profile, step]);

  const currentContextKey = getContextKey(step, profile, backend);
  const activePlan = enabled
    && step === 'main-menu'
    && state.contextKey === currentContextKey
    ? state.plan
    : null;
  const columns = activePlan?.operations[0]?.type === 'setColumns'
    ? activePlan.operations[0].columns as MockColumns
    : null;
  const message = state.contextKey === null || state.contextKey === currentContextKey
    ? state.message
    : '';

  return {
    columns,
    pending: state.pending && state.contextKey === null,
    message,
    apply,
  };
}
