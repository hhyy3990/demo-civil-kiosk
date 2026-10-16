import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  createAccessibilitySdk,
  createQrEntryDock,
  type AccessibilityAdapter,
  type AccessibilityProfile,
  type AccessibilitySdk,
  type EasyLanguageExplanation,
  type BottomViewportHeightPercent,
  type QrEntryDockController,
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

const FOOTER_SIMULATION_LABEL_ID = 'civil.footer.simulation-label';
const FOOTER_PRIVACY_NOTICE_ID = 'civil.footer.privacy-notice';

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
  accessibilityProfileApplied: boolean;
  onOpenQr: () => void;
  viewportTestEnabled: boolean;
  devViewportPercent: BottomViewportHeightPercent | null;
};

const guideByStep: Record<KioskStep, {
  title: string;
  text: string;
  actionId: string;
  stepId?: string;
} | null> = {
  'main-menu': {
    stepId: 'certificate.category-selection',
    title: '증명서 선택',
    text: '등본 발급을 원하시면 주민등록 버튼을 눌러 주세요.',
    actionId: 'civil.certificate.01',
  },
  'resident-type': {
    stepId: 'certificate.type-selection',
    title: '문서 선택',
    text: '주민등록표 등본 버튼을 눌러 주세요.',
    actionId: 'civil.document.copy',
  },
  'resident-number': {
    stepId: 'certificate.id-input',
    title: '번호를 입력해 주세요',
    text: '화면의 숫자 버튼을 눌러 시뮬레이션용 임의 숫자 13자리를 입력한 뒤 확인을 눌러 주세요.',
    actionId: 'civil.resident-number.confirm',
  },
  fingerprint: {
    stepId: 'certificate.fingerprint-check',
    title: '본인 확인',
    text: '지문 확인 완료 버튼을 눌러 다음 단계로 이동해 주세요.',
    actionId: 'civil.fingerprint.confirm',
  },
  options: {
    stepId: 'certificate.display-options',
    title: '표시할 항목을 골라 주세요',
    text: '증명서에 표시할 내용을 확인하고 필요한 항목을 선택한 뒤 하단 확인을 눌러 주세요.',
    actionId: 'civil.options.confirm',
  },
  'fee-waiver': {
    stepId: 'certificate.fee-waiver',
    title: '수수료 면제 여부를 선택해 주세요',
    text: '신청 내용과 수수료 면제 여부를 확인한 뒤 해당하는 항목을 선택해 주세요.',
    actionId: 'civil.fee-waiver.standard',
  },
  copies: {
    stepId: 'certificate.copy-count',
    title: '발급할 부수를 정해 주세요',
    text: '필요한 증명서 부수를 선택하고 하단 확인을 눌러 주세요.',
    actionId: 'civil.copies.confirm',
  },
  payment: {
    stepId: 'certificate.payment-method',
    title: '신청 내용을 확인해 주세요',
    text: '증명서 종류, 발급 부수, 표시 항목과 수수료를 확인해 주세요. 내용이 맞으면 결제 방법을 눌러 가상 결제를 진행하세요.',
    actionId: 'civil.payment.card',
  },
  printing: null,
  complete: null,
};

const primaryActionSelectorsByStep: Partial<Record<KioskStep, string>> = {
  'main-menu': '#main-resident-button',
  'resident-type': '#resident-register-copy-button',
  'resident-number': '.keypad button, #next-confirm-button',
  fingerprint: '#fingerprint-confirm-button',
  options: '.option-list button, #next-confirm-button',
  'fee-waiver': '#fee-waiver-yes-button, #fee-waiver-no-button',
  copies: '.copies-control button, .copies-numbers button, #next-confirm-button',
  payment: '.payment-options button',
  complete: '#completion-extend-button, #complete-home-button',
};

type LayoutCorrections = ReturnType<AccessibilitySdk['getLastLayoutCorrections']>;

const guidanceAvoidSelectorsByStep: Partial<Record<KioskStep, readonly string[]>> = {
  'resident-type': ['.type-choice-list'],
  'resident-number': ['.number-display', '.keypad'],
  fingerprint: ['.fingerprint-panel', '.inline-action'],
  options: ['.option-list'],
  'fee-waiver': ['.waiver-grid'],
  copies: ['.copies-control', '.copies-numbers'],
  payment: ['.application-summary', '.payment-options'],
  complete: ['.completion-slip', '.completion-actions'],
};

function getEasyLanguageExplanations(
  step: KioskStep,
  state: AccessibilityState,
): readonly EasyLanguageExplanation[] {
  switch (step) {
    case 'main-menu':
      return [
        {
          title: '증명서 선택',
          text: '현재 주민등록표 등본 발급을 시연할 수 있습니다. 다른 증명서 메뉴는 데모 안내만 표시합니다.',
        },
        {
          title: '개인정보 보호',
          text: '실제 주민등록번호를 입력하지 마세요. 데모 진행에는 임의의 숫자만 사용합니다.',
        },
      ];
    case 'resident-type':
      return [
        {
          title: '주민등록표 등본',
          text: '주민등록표 등본은 한 세대의 구성과 주소 정보를 확인하는 주민등록 서류입니다.',
        },
        {
          title: '주민등록표 초본',
          text: '초본 발급은 아직 준비 중입니다. 이 데모에서는 등본만 진행할 수 있습니다.',
        },
      ];
    case 'resident-number':
      return [
        {
          title: '주민등록번호',
          text: '주민등록번호는 주민을 구분하는 데 쓰는 13자리 번호입니다. 실제 번호는 입력하지 마세요.',
        },
        {
          title: '입력한 숫자 보호',
          text: '입력한 숫자는 화면에서 점으로 표시됩니다. 데모에는 임의 숫자만 사용하며, 화면을 나가거나 처음 화면으로 돌아가면 입력값이 지워집니다.',
        },
        {
          title: '입력 수정',
          text: '‘정정’은 마지막 숫자 하나를 지우고, ‘전체 삭제’는 입력한 숫자를 모두 지웁니다.',
        },
      ];
    case 'fingerprint':
      return [
        {
          title: '지문 확인',
          text: '지문은 본인인지 확인할 때 쓰는 정보입니다. 이 데모에서는 실제 지문을 읽지 않고 확인 절차만 보여 줍니다.',
        },
      ];
    case 'options':
      return [
        {
          title: '표시 항목',
          text: '표시 항목은 등본에 나타낼 정보입니다. 선택한 정보가 발급 내용에 포함됩니다.',
        },
        {
          title: '주소 공개',
          text: `켜져 있으면 현재 주소가 등본에 표시됩니다. 지금은 ${state.options.address ? '표시하는 상태' : '표시하지 않는 상태'}입니다.`,
        },
        {
          title: '과거 주소 변동',
          text: `켜져 있으면 과거 주소가 바뀐 내역이 등본에 표시됩니다. 지금은 ${state.options.history ? '표시하는 상태' : '표시하지 않는 상태'}입니다.`,
        },
        {
          title: '세대 구성 사유',
          text: `이 항목은 세대가 구성되거나 바뀐 사유를 등본에 표시합니다. 지금은 ${state.options.household ? '표시하는 상태' : '표시하지 않는 상태'}입니다.`,
        },
      ];
    case 'fee-waiver':
      return [
        {
          title: '발급 수수료',
          text: '수수료는 증명서를 발급받을 때 내는 돈입니다.',
        },
        {
          title: '수수료 면제',
          text: '정해진 조건에 해당하면 발급 수수료를 내지 않아도 됩니다. 이 화면은 면제 대상 여부를 선택하는 단계입니다.',
        },
        {
          title: '선택 결과',
          text: `현재 ${state.feeExempt ? '수수료 면제 대상' : '일반 발급'}으로 표시되어 있습니다. 이 선택에 따라 총 수수료가 달라집니다.`,
        },
      ];
    case 'copies':
      return [
        {
          title: '발급 부수',
          text: '1부는 등본 한 부, 2부는 등본 두 부를 뜻합니다.',
        },
        {
          title: '현재 선택한 부수',
          text: `현재 등본 ${state.copies}부가 선택되어 있습니다.`,
        },
        {
          title: '수수료 확인',
          text: state.feeExempt
            ? '수수료 면제를 선택해 총 수수료는 0원입니다.'
            : `일반 발급은 한 부당 200원입니다. ${state.copies}부의 총 수수료는 ${(state.copies * 200).toLocaleString('ko-KR')}원입니다.`,
        },
      ];
    case 'payment':
      return [
        {
          title: '신청 내용 확인',
          text: '신청 내용은 선택한 등본 종류, 부수, 표시 항목과 수수료를 모아 보여 주는 내용입니다.',
        },
        {
          title: '결제 방법',
          text: '신용·체크카드는 카드로 내는 방법이고, 현금은 현금으로 내는 방법입니다.',
        },
        {
          title: '데모 안내',
          text: '화면의 결제는 시뮬레이션입니다. 실제 돈은 결제되지 않습니다.',
        },
      ];
    default:
      return [];
  }
}

function shouldInspectProfileLayout(profile: AccessibilityProfile) {
  return profile.textSize !== 'standard'
    || profile.buttonSize === 'large'
    || profile.bottomControls
    || profile.viewportMode !== null;
}

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

function createKioskQrDock(
  root: HTMLElement,
  adapter: AccessibilityAdapter,
  onOpenQr: () => void,
  bottomViewportPercent: BottomViewportHeightPercent | null,
) {
  return createQrEntryDock({
    root,
    adapter,
    active: false,
    onOpenQr,
    label: '내 QR로 화면 설정',
    theme: {
      surface: '#e8f0f4',
      foreground: '#17384d',
      button: '#176393',
      buttonForeground: '#ffffff',
    },
    bottomViewportPercent: bottomViewportPercent ?? undefined,
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
  accessibilityProfileApplied,
  onOpenQr,
  viewportTestEnabled,
  devViewportPercent,
}: UseKioskAccessibilityOptions) {
  const sdkRef = useRef<AccessibilitySdk | null>(null);
  const adapterRef = useRef<AccessibilityAdapter | null>(null);
  const qrDockRef = useRef<QrEntryDockController | null>(null);
  const qrDockViewportPercentRef = useRef<BottomViewportHeightPercent | null>(null);
  const onOpenQrRef = useRef(onOpenQr);
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
  onOpenQrRef.current = onOpenQr;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sdkRoot = root;

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
      getTextTargets: () => {
        const targets = Array.from(root.querySelectorAll<HTMLElement>(
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
        });
        const footerLabel = root.querySelector<HTMLElement>('.footer-simulation-label');
        const privacyNotice = root.querySelector<HTMLElement>('.footer-privacy-notice');
        if (footerLabel) targets.push({ id: FOOTER_SIMULATION_LABEL_ID, element: footerLabel });
        if (privacyNotice) targets.push({ id: FOOTER_PRIVACY_NOTICE_ID, element: privacyNotice });
        return targets;
      },
      getFontCorrectionTargets: () => {
        const footerLabel = root.querySelector<HTMLElement>('.footer-simulation-label');
        const privacyNotice = root.querySelector<HTMLElement>('.footer-privacy-notice');
        const targets: Array<{ id: string; element: HTMLElement }> = [];
        if (footerLabel) targets.push({ id: FOOTER_SIMULATION_LABEL_ID, element: footerLabel });
        if (privacyNotice) targets.push({ id: FOOTER_PRIVACY_NOTICE_ID, element: privacyNotice });
        return targets;
      },
      getLayoutRegions: () => {
        const state = stateRef.current;
        const primaryActionSelector = primaryActionSelectorsByStep[state.step];
        const primaryActions = primaryActionSelector
          ? Array.from(root.querySelectorAll<HTMLElement>(primaryActionSelector))
          : [];
        const guidanceAvoidAreas = (guidanceAvoidSelectorsByStep[state.step] ?? [])
          .flatMap((selector) => Array.from(root.querySelectorAll<HTMLElement>(selector)))
          .concat(Array.from(root.querySelectorAll<HTMLElement>('.dev-experience-strip')));
        const regions = {
          bottomControls: [root.querySelector<HTMLElement>('[data-a11y-slot="bottom-controls"]')].filter(
            (element): element is HTMLElement => Boolean(element),
          ),
          // The document scrolls in the ordinary layout. Register the contained kiosk
          // screen root so the SDK can make that screen itself scrollable in viewport mode.
          scrollArea: root,
          reflowContainers: Array.from(root.querySelectorAll<HTMLElement>('[data-a11y-reflow]')),
          gridContainers: Array.from(root.querySelectorAll<HTMLElement>('[data-a11y-grid]')),
          actionGroups: Array.from(root.querySelectorAll<HTMLElement>('[data-a11y-action-group]')),
          viewportOverlays: Array.from(
            root.querySelectorAll<HTMLElement>('[data-a11y-viewport-overlay]'),
          ),
          guidanceAvoidAreas: guidanceAvoidAreas
            .concat(Array.from(root.querySelectorAll<HTMLElement>('.footer-controls button')))
            .concat(Array.from(document.querySelectorAll<HTMLElement>('[data-a11y-qr-entry-dock]'))),
          primaryActions: primaryActions.map((element) => ({ element })),
        };
        if (state.step !== 'main-menu') return regions;
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
    adapterRef.current = adapter;
    const initialDockViewportPercent =
      !accessibilityProfileApplied && viewportTestEnabled && stateRef.current.step === 'main-menu'
        ? devViewportPercent
        : null;
    const qrDock = createKioskQrDock(
      sdkRoot,
      adapter,
      () => onOpenQrRef.current(),
      initialDockViewportPercent,
    );
    qrDockRef.current = qrDock;
    qrDockViewportPercentRef.current = initialDockViewportPercent;
    qrDock.setActive(stateRef.current.step === 'main-menu');
    sdk.notifyScreenChange(`civil.${stateRef.current.step}`);

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
          shouldInspectProfileLayout(currentProfile)
            ? currentSdk.getLastLayoutCorrections()
            : [];
        recordLayoutCheck(currentSdk, root, automaticCorrections);
      });
    };
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      qrDock.destroy();
      qrDockRef.current = null;
      qrDockViewportPercentRef.current = null;
      adapterRef.current = null;
      sdk.destroy();
      delete root.dataset.a11yDiagnostics;
      delete root.dataset.a11yLayoutCorrections;
      sdkRef.current = null;
    };
  }, [rootRef]);

  useLayoutEffect(() => {
    const sdk = sdkRef.current;
    if (!sdk) return;
    sdk.notifyScreenChange(`civil.${step}`);
  }, [step]);

  useEffect(() => {
    const root = rootRef.current;
    const adapter = adapterRef.current;
    const sdk = sdkRef.current;
    if (!root || !adapter || !sdk) return;

    const isHomeScreen = step === 'main-menu';
    const desiredDockViewportPercent =
      !accessibilityProfileApplied && viewportTestEnabled ? devViewportPercent : null;

    if (!isHomeScreen) qrDockRef.current?.setActive(false);

    if (!qrModalOpen && desiredDockViewportPercent !== qrDockViewportPercentRef.current) {
      qrDockRef.current?.destroy();
      const nextDock = createKioskQrDock(
        root,
        adapter,
        () => onOpenQrRef.current(),
        desiredDockViewportPercent,
      );
      qrDockRef.current = nextDock;
      qrDockViewportPercentRef.current = desiredDockViewportPercent;
    }

    if (isHomeScreen) {
      qrDockRef.current?.setActive(true);
    }

    if (!accessibilityProfileApplied) {
      if (isHomeScreen) {
        sdk.setViewportMode(null);
      } else {
        const mode = viewportTestEnabled && devViewportPercent !== null
          ? { mode: 'bottom' as const, heightPercent: devViewportPercent }
          : null;
        sdk.setViewportMode(mode);
      }
    }
  }, [accessibilityProfileApplied, devViewportPercent, profile, qrModalOpen, rootRef, step, viewportTestEnabled]);

  useEffect(() => {
    const sdk = sdkRef.current;
    const root = rootRef.current;
    if (!sdk || !root) return;

    sdk.applyProfile(profile);
    const automaticCorrections =
      shouldInspectProfileLayout(profile)
        ? sdk.getLastLayoutCorrections()
        : [];
    recordLayoutCheck(sdk, root, automaticCorrections);
  }, [profile, rootRef, step]);

  useEffect(() => {
    const sdk = sdkRef.current;
    const root = rootRef.current;
    if (!sdk || !root) return;

    const guide = guideByStep[step];
    const stepId = guide?.stepId ?? `civil.${step}`;
    const paused = qrModalOpen || noticeOpen;
    sdk.setEasyLanguageState({
      stepId,
      explanations: paused ? [] : getEasyLanguageExplanations(step, stateRef.current),
    });
    sdk.setGuideState({
      stepId,
      enabled: profile.smartGuide && step !== 'complete',
      paused: paused || step === 'complete',
      delaySeconds: profile.guideDelaySeconds,
      message: guide
        ? { title: guide.title, text: guide.text, actionId: guide.actionId }
        : null,
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
