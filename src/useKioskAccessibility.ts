import { useEffect, useRef, type RefObject } from 'react';
import {
  createAccessibilitySdk,
  type AccessibilityAdapter,
  type AccessibilityProfile,
  type AccessibilitySdk,
} from '@naebangsik/kiosk-accessibility-sdk';

export type KioskStep =
  | 'main-menu'
  | 'resident-type'
  | 'resident-number'
  | 'fingerprint'
  | 'options'
  | 'fee-waiver'
  | 'copies'
  | 'payment'
  | 'printing'
  | 'complete';

type IssueOptions = {
  address: boolean;
  history: boolean;
  household: boolean;
};

type AccessibilityState = {
  step: KioskStep;
  options: IssueOptions;
  feeExempt: boolean;
  copies: number;
  qrModalOpen: boolean;
  noticeOpen: boolean;
};

type UseKioskAccessibilityOptions = {
  rootRef: RefObject<HTMLElement | null>;
  step: KioskStep;
  options: IssueOptions;
  feeExempt: boolean;
  copies: number;
  qrModalOpen: boolean;
  noticeOpen: boolean;
  profile: AccessibilityProfile;
};

const guideByStep: Record<KioskStep, { title: string; text: string; actionId: string } | null> = {
  'main-menu': {
    title: '증명서 선택',
    text: '등본 발급을 원하시면 주민등록 버튼을 눌러 주세요.',
    actionId: 'civil.certificate.01',
  },
  'resident-type': {
    title: '문서 선택',
    text: '주민등록표 등본 버튼을 눌러 주세요.',
    actionId: 'civil.document.copy',
  },
  'resident-number': {
    title: '번호 입력',
    text: '임의의 숫자 13자리를 입력한 다음 확인을 눌러 주세요.',
    actionId: 'civil.resident-number.confirm',
  },
  fingerprint: {
    title: '본인 확인',
    text: '지문 확인 완료 버튼을 눌러 다음 단계로 이동해 주세요.',
    actionId: 'civil.fingerprint.confirm',
  },
  options: {
    title: '발급 옵션',
    text: '표시할 항목을 확인한 뒤 확인을 눌러 주세요.',
    actionId: 'civil.options.confirm',
  },
  'fee-waiver': {
    title: '수수료 선택',
    text: '면제 대상 여부에 맞는 항목을 선택해 주세요.',
    actionId: 'civil.fee-waiver.standard',
  },
  copies: {
    title: '발급 부수',
    text: '발급할 부수를 선택한 뒤 확인을 눌러 주세요.',
    actionId: 'civil.copies.confirm',
  },
  payment: {
    title: '결제 방법',
    text: '시뮬레이션 결제 방법을 선택해 주세요.',
    actionId: 'civil.payment.card',
  },
  printing: null,
  complete: {
    title: '발급 완료',
    text: '처음 화면으로 돌아가려면 처음 화면 버튼을 눌러 주세요.',
    actionId: 'civil.complete.home',
  },
};

const primaryActionIdsByStep: Partial<Record<KioskStep, readonly string[]>> = {
  'resident-type': ['resident-register-copy-button'],
  fingerprint: ['fingerprint-confirm-button'],
  'fee-waiver': ['fee-waiver-yes-button', 'fee-waiver-no-button'],
  payment: ['payment-card-button', 'payment-cash-button'],
  complete: ['complete-home-button'],
};

type LayoutCorrections = ReturnType<AccessibilitySdk['getLastLayoutCorrections']>;

const correctionStrategies: Record<string, readonly string[]> = {
  'text-clipped': ['text-wrap'],
  'horizontal-overflow': ['release-container-width', 'reduce-grid-columns'],
  'bottom-control-obscures-action': ['reserve-scroll-space'],
  'action-overlap': ['release-container-width', 'reduce-grid-columns', 'stack-action-group'],
};

function recordLayoutCheck(
  sdk: AccessibilitySdk,
  root: HTMLElement,
  automaticCorrections: LayoutCorrections,
) {
  let diagnostics = sdk.inspectLayout();
  const attemptedStrategies = new Set<string>(automaticCorrections.map(({ strategy }) => strategy));
  const needsOneBoundedCorrection = diagnostics.some((issue) =>
    (correctionStrategies[issue.issueType] ?? []).some((strategy) => !attemptedStrategies.has(strategy)),
  );
  let explicitCorrections: LayoutCorrections = [];

  if (needsOneBoundedCorrection) {
    explicitCorrections = sdk.correctLayout();
    diagnostics = sdk.inspectLayout();
  }

  root.dataset.a11yDiagnostics = JSON.stringify(diagnostics);
  root.dataset.a11yLayoutCorrections = JSON.stringify({
    screenId: `civil.${root.querySelector<HTMLElement>('[data-screen]')?.dataset.screen ?? 'main-menu'}`,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    automatic: automaticCorrections,
    explicit: explicitCorrections,
    last: sdk.getLastLayoutCorrections(),
  });
}

export function useKioskAccessibility({
  rootRef,
  step,
  options,
  feeExempt,
  copies,
  qrModalOpen,
  noticeOpen,
  profile,
}: UseKioskAccessibilityOptions) {
  const sdkRef = useRef<AccessibilitySdk | null>(null);
  const lastSpokenStepRef = useRef<KioskStep | null>(null);
  const stateRef = useRef<AccessibilityState>({
    step,
    options,
    feeExempt,
    copies,
    qrModalOpen,
    noticeOpen,
  });
  const profileRef = useRef(profile);

  stateRef.current = { step, options, feeExempt, copies, qrModalOpen, noticeOpen };
  profileRef.current = profile;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sdkRoot = root.ownerDocument.documentElement;

    const adapter: AccessibilityAdapter = {
      getSnapshot: () => {
        const state = stateRef.current;
        return {
          screenId: `civil.${state.step}`,
          state: {
            step: state.step,
            copies: state.copies,
            feeExempt: state.feeExempt,
            address: state.options.address,
            history: state.options.history,
            household: state.options.household,
            qrModalOpen: state.qrModalOpen,
            noticeOpen: state.noticeOpen,
          },
        };
      },
      getActions: () => Array.from(root.querySelectorAll<HTMLButtonElement>('button')).map((element, index) => {
        const explicitId = element.dataset.a11yActionId;
        const fallbackId = element.id
          ? `civil.${stateRef.current.step}.${element.id}`
          : `civil.${stateRef.current.step}.action-${index + 1}`;
        return {
          id: explicitId ?? fallbackId,
          name: element.getAttribute('aria-label') ?? element.innerText.trim().replace(/\s+/g, ' '),
          element,
          highlightElement: element,
          enabled: !element.disabled && element.getAttribute('aria-disabled') !== 'true',
          primary: element.classList.contains('confirm-control') || element.classList.contains('primary-button'),
        };
      }),
      getTextTargets: () => Array.from(root.querySelectorAll<HTMLElement>(
        [
          '.screen-content h1',
          '.screen-content h2',
          '.screen-content .eyebrow',
          '.screen-content .note-box',
          '.screen-content .screen-footnote',
          '.screen-content .demo-banner',
          '.screen-content .category-name',
          '.screen-content [data-a11y-detail]',
          '.screen-content .page-title > p',
          '.screen-content .toggle-text > strong',
          '.screen-content .toggle-choice',
          '.screen-content .selection-caption > span',
          '.screen-content .selection-caption > strong',
          '.screen-content .select-card > strong',
          '.screen-content .select-action',
          '.qr-setup-dialog h2',
          '.qr-setup-dialog [role="status"]',
        ].join(', '),
      )).map((element, index) => {
        const actionId = element.closest<HTMLElement>('[data-a11y-action-id]')?.dataset.a11yActionId;
        const targetPart = element.hasAttribute('data-a11y-detail')
          ? 'detail'
          : element.matches('.toggle-text > strong, .select-card > strong, .category-name')
            ? 'label'
            : element.matches('.toggle-choice, .select-action')
              ? 'state'
            : `text-${index + 1}`;
        return {
          id: actionId
            ? `${actionId}.${targetPart}`
            : `civil.${stateRef.current.step}.${targetPart}`,
          element,
        };
      }),
      getLayoutRegions: () => {
        const regions = {
          bottomControls: [root.querySelector<HTMLElement>('[data-a11y-slot="bottom-controls"]')].filter(
            (element): element is HTMLElement => Boolean(element),
          ),
          scrollArea: root.ownerDocument.scrollingElement as HTMLElement | null,
          reflowContainers: Array.from(root.querySelectorAll<HTMLElement>('[data-a11y-reflow]')),
          gridContainers: Array.from(root.querySelectorAll<HTMLElement>('[data-a11y-grid]')),
          actionGroups: Array.from(root.querySelectorAll<HTMLElement>('[data-a11y-action-group]')),
          guidanceAvoidAreas: [root.querySelector<HTMLElement>('.screen-header')].filter(
            (element): element is HTMLElement => Boolean(element),
          ),
          primaryActions: (primaryActionIdsByStep[stateRef.current.step] ?? [])
            .map((id) => root.querySelector<HTMLElement>(`#${id}`))
            .filter((element): element is HTMLElement => Boolean(element))
            .map((element) => ({ element })),
        };
        if (stateRef.current.step !== 'main-menu') return regions;
        return {
          ...regions,
          menuItems: Array.from(root.querySelectorAll<HTMLElement>('[data-a11y-menu-item]')),
        };
      },
    };

    const sdk = createAccessibilitySdk({
      root: sdkRoot,
      adapter,
      onDiagnostics: (issues) => {
        root.dataset.a11yDiagnostics = JSON.stringify(issues);
      },
    });
    sdkRef.current = sdk;

    let resizeFrame: number | null = null;
    let lastViewport = `${window.innerWidth}x${window.innerHeight}`;
    const handleResize = () => {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        const viewport = `${window.innerWidth}x${window.innerHeight}`;
        if (viewport === lastViewport) return;
        lastViewport = viewport;

        const currentSdk = sdkRef.current;
        if (!currentSdk) return;
        const currentProfile = profileRef.current;
        currentSdk.applyProfile(currentProfile);
        const automaticCorrections =
          currentProfile.textSize !== 'standard' ||
          currentProfile.buttonSize === 'large' ||
          currentProfile.bottomControls
            ? currentSdk.getLastLayoutCorrections()
            : [];
        recordLayoutCheck(currentSdk, root, automaticCorrections);
      });
    };
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      sdk.destroy();
      delete root.dataset.a11yDiagnostics;
      delete root.dataset.a11yLayoutCorrections;
      sdkRef.current = null;
    };
  }, [rootRef]);

  useEffect(() => {
    const sdk = sdkRef.current;
    const root = rootRef.current;
    if (!sdk || !root) return;

    sdk.applyProfile(profile);
    const automaticCorrections =
      profile.textSize !== 'standard' ||
      profile.buttonSize === 'large' ||
      profile.bottomControls
        ? sdk.getLastLayoutCorrections()
        : [];
    recordLayoutCheck(sdk, root, automaticCorrections);
  }, [profile, rootRef, step]);

  useEffect(() => {
    const sdk = sdkRef.current;
    const root = rootRef.current;
    if (!sdk || !root) return;

    const guide = guideByStep[step];
    const paused = qrModalOpen || noticeOpen;
    sdk.setGuideState({
      enabled: profile.smartGuide,
      paused,
      delaySeconds: profile.guideDelaySeconds,
      message: guide ? { ...guide } : null,
    });
    const spokenPrompts: Record<KioskStep, string> = {
      'main-menu': '증명서를 선택해 주세요. 주민등록을 선택하면 주민등록표 등본 발급을 시작합니다.',
      'resident-type': '발급할 문서를 선택해 주세요. 주민등록표 등본을 선택할 수 있습니다.',
      'resident-number': '데모용 임의 숫자 13자리를 입력한 뒤 확인을 눌러 주세요.',
      fingerprint: '오른손 엄지손가락 확인을 시뮬레이션합니다. 지문 확인 완료를 눌러 주세요.',
      options: '발급할 항목을 확인한 뒤 확인을 눌러 주세요.',
      'fee-waiver': '수수료 면제 대상 여부를 선택해 주세요.',
      copies: '발급 부수를 선택한 뒤 확인을 눌러 주세요.',
      payment: '가상 결제 방법을 선택해 주세요.',
      printing: '발급 문서를 준비하고 있습니다.',
      complete: '발급이 완료되었습니다. 처음 화면으로 돌아갈 수 있습니다.',
    };
    if (!profile.voiceGuidance) {
      lastSpokenStepRef.current = null;
    } else if (!paused && lastSpokenStepRef.current !== step) {
      sdk.speak(spokenPrompts[step]);
      lastSpokenStepRef.current = step;
    }
    sdk.inspectLayout();
  }, [copies, feeExempt, noticeOpen, options, profile, qrModalOpen, rootRef, step]);

  return sdkRef;
}
