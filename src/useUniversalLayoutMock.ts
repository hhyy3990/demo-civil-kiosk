import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccessibilityProfile } from '@naebangsik/kiosk-accessibility-sdk';
import type { UniversalLayoutPlan } from '../universal-layout/universal-layout-contract';
import type { KioskStep } from './useKioskAccessibility';

type MockColumns = 1 | 2;

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

function getContextKey(step: KioskStep, profile: AccessibilityProfile) {
  const grid = document.querySelector<HTMLElement>('.certificate-grid');
  return JSON.stringify({
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
}: {
  enabled: boolean;
  step: KioskStep;
  profile: AccessibilityProfile;
}) {
  const [state, setState] = useState<MockState>(emptyState);
  const requestSequence = useRef(0);
  const profileKey = JSON.stringify([
    profile.textSize,
    profile.buttonSize,
    profile.contrast,
    profile.bottomControls,
    profile.viewportMode?.mode ?? null,
    profile.viewportMode?.heightPercent ?? null,
  ]);

  const cancel = useCallback(() => {
    requestSequence.current += 1;
    setState(emptyState);
  }, []);

  useEffect(() => {
    cancel();
  }, [cancel, enabled, profileKey, step]);

  useEffect(() => {
    if (!enabled) return;
    const invalidateForViewportChange = () => cancel();
    window.addEventListener('resize', invalidateForViewportChange);
    window.addEventListener('orientationchange', invalidateForViewportChange);
    return () => {
      window.removeEventListener('resize', invalidateForViewportChange);
      window.removeEventListener('orientationchange', invalidateForViewportChange);
    };
  }, [cancel, enabled]);

  const apply = useCallback(async (columns: MockColumns | null) => {
    if (!enabled || step !== 'main-menu') return;
    if (columns === null) {
      cancel();
      return;
    }

    const grid = document.querySelector<HTMLElement>('.certificate-grid');
    if (!grid) {
      setState({ ...emptyState, message: '증명서 메뉴를 찾지 못해 기본 배치를 유지합니다.' });
      return;
    }

    const contextKey = getContextKey(step, profile);
    const requestId = ++requestSequence.current;
    setState({
      plan: null,
      contextKey: null,
      pending: true,
      message: '공통 계약으로 배치를 확인하는 중입니다.',
    });

    try {
      const response = await fetch('/api/dev/universal-layout/mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
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
        }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (requestId !== requestSequence.current || contextKey !== getContextKey(step, profile)) return;

      if (!response.ok) {
        const errorCode = typeof payload === 'object' && payload !== null && 'error' in payload
          ? String(payload.error)
          : '';
        const message = errorCode === 'DISALLOWED_COLUMN_COUNT'
          ? '현재 화면 폭 또는 접근성 설정에서는 해당 열 수를 허용하지 않아 기본 배치를 유지합니다.'
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
        message: `${columns}열 Development Mock이 공통 계약 검증을 통과했습니다.`,
      });
    } catch {
      if (requestId !== requestSequence.current || contextKey !== getContextKey(step, profile)) return;
      setState({ ...emptyState, contextKey, message: '개발 Mock 서버에 연결할 수 없어 기본 배치를 유지합니다.' });
    }
  }, [cancel, enabled, profile, step]);

  const currentContextKey = getContextKey(step, profile);
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
