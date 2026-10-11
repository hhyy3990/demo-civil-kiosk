import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, Info, QrCode, X } from 'lucide-react';
import {
  CENTRAL_QR_ORIGIN,
  createQrProfileClient,
  type AccessibilityProfile,
  validateAccessibilityProfile,
} from '@naebangsik/kiosk-accessibility-sdk';
import './qr-setup-modal.css';

type ScannerHandle = {
  stop(): void;
  destroy(): void;
};

function setScannerText(container: HTMLDivElement | null, selector: string, value: string) {
  const element = container?.querySelector<HTMLElement>(selector);
  if (!element || element.textContent === value) return;
  const textNode = element.firstChild;
  if (textNode?.nodeType === Node.TEXT_NODE) textNode.nodeValue = value;
  else element.textContent = value;
}

type QrSetupModalProps = {
  active: boolean;
  onClose: () => void;
  onApplyProfile: (profile: AccessibilityProfile) => void;
  registerSessionCleanup: (cleanup: () => void) => () => void;
  createSessionGuard: () => () => boolean;
};

function readableError(error: unknown) {
  if (!(error instanceof Error)) return 'QR 설정을 확인하지 못했습니다. 다시 시도해 주세요.';
  if (error.message === 'QR_UNAVAILABLE') return '유효하지 않거나 만료된 QR입니다. 공식 서비스에서 만든 QR 주소를 확인해 주세요.';
  if (error.message === 'PROFILE_REQUEST_IN_PROGRESS') return 'QR 설정을 확인하고 있습니다. 잠시 기다려 주세요.';
  return '중앙 QR 서비스에 연결할 수 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.';
}

export function QrSetupModal({
  active,
  onClose,
  onApplyProfile,
  registerSessionCleanup,
  createSessionGuard,
}: QrSetupModalProps) {
  const client = useMemo(() => createQrProfileClient(), []);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<ScannerHandle | null>(null);
  const mountedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onApplyProfileRef = useRef(onApplyProfile);
  const loadingRef = useRef(false);
  const [manualValue, setManualValue] = useState('');
  const [error, setError] = useState('');
  const [cameraMessage, setCameraMessage] = useState('');
  const [loading, setLoading] = useState(false);

  onCloseRef.current = onClose;
  onApplyProfileRef.current = onApplyProfile;

  useEffect(() => {
    if (!active) {
      loadingRef.current = false;
      setManualValue('');
      setError('');
      setCameraMessage('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    mountedRef.current = true;
    const cleanupSessionResources = () => {
      client.cancel();
      const cameraButton = scannerContainerRef.current?.querySelector<HTMLButtonElement>('.qr-camera-actions button');
      const cameraMayBeRunning = Boolean(
        cameraButton && (cameraButton.disabled || cameraButton.textContent?.trim() === '카메라 끄기'),
      );
      if (cameraMayBeRunning) {
        scannerRef.current?.destroy();
        scannerRef.current = null;
      } else {
        scannerRef.current?.stop();
        setScannerText(scannerContainerRef.current, '.qr-camera-actions button', '카메라로 QR 스캔');
        setScannerText(scannerContainerRef.current, '.qr-camera-status', 'QR 코드를 화면 가운데에 맞춰 주세요.');
      }
    };
    const unregisterSessionCleanup = registerSessionCleanup(cleanupSessionResources);

    if (!scannerRef.current) {
      void import('@naebangsik/kiosk-accessibility-sdk/qr-scanner')
        .then(({ mountQrScanner }) => {
          if (cancelled || !scannerContainerRef.current || scannerRef.current) return;
          const scanner = mountQrScanner({
            container: scannerContainerRef.current,
            onScan: (value) => {
              void resolveProfile(value, 'scan');
            },
            onCameraUnavailable: (message) => {
              if (!cancelled) setCameraMessage(message);
            },
          });
          scannerRef.current = scanner;
          const cameraButton = scannerContainerRef.current.querySelector<HTMLButtonElement>('.qr-camera-actions button');
          if (cameraButton) {
            cameraButton.id = 'qr-camera-start-button';
            cameraButton.dataset.a11yActionId = 'civil.qr.camera-start';
          }
        })
        .catch(() => {
          if (!cancelled) setCameraMessage('카메라를 시작할 수 없습니다. 아래에 QR 주소를 직접 입력해 주세요.');
        });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loadingRef.current) onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      unregisterSessionCleanup();
      window.removeEventListener('keydown', handleKeyDown);
      cleanupSessionResources();
    };
  }, [active, client, registerSessionCleanup]);

  useEffect(() => () => {
    scannerRef.current?.destroy();
    scannerRef.current = null;
  }, []);

  async function resolveProfile(value: string, inputKind: 'scan' | 'manual') {
    setError('');
    loadingRef.current = true;
    setLoading(true);
    const isCurrentSession = createSessionGuard();
    try {
      const profile = await client.resolve(value, inputKind);
      if (!isCurrentSession() || !mountedRef.current) return;
      onApplyProfileRef.current(validateAccessibilityProfile(profile));
      onCloseRef.current();
    } catch (reason) {
      if (!isCurrentSession() || !mountedRef.current) return;
      setError(readableError(reason));
      loadingRef.current = false;
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadingRef.current) return;
    void resolveProfile(manualValue, 'manual');
  }

  return (
    <div className="qr-modal-backdrop" data-a11y-viewport-overlay role="presentation" aria-hidden={!active} style={{ display: active ? 'grid' : 'none' }} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) onClose();
    }}>
      <section
        className="qr-setup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-setup-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="qr-setup-heading">
          <div className="qr-setup-mark"><QrCode size={20} aria-hidden="true" /></div>
          <div>
            <p className="qr-setup-eyebrow">접근성 설정</p>
            <h2 id="qr-setup-title">내 방식 QR로 화면 설정</h2>
          </div>
          <button
            className="qr-dialog-close"
            type="button"
            aria-label="QR 설정 닫기"
            data-a11y-action-id="civil.qr.close"
            disabled={loading}
            onClick={onClose}
          ><X size={19} /></button>
        </header>

        <div className="qr-setup-body">
          <p className="qr-setup-intro">QR을 스캔하거나 주소를 입력하면 글씨·버튼·안내 설정을 적용합니다.</p>
          <div ref={scannerContainerRef} className="qr-scanner-mount" />
          <p className="qr-camera-fallback" role="status" style={{ display: cameraMessage ? 'block' : 'none' }}>{cameraMessage}</p>

          <form className="qr-manual-form" onSubmit={handleSubmit}>
            <label htmlFor="qr-manual-value">QR 주소 또는 토큰 직접 입력</label>
            <input
              id="qr-manual-value"
              type="text"
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={`${CENTRAL_QR_ORIGIN}/?token=...`}
              disabled={loading}
              data-a11y-exclude="true"
            />
            <p className="qr-manual-help">공식 내 방식 QR 서비스에서 만든 QR만 사용할 수 있습니다.</p>
            <button
              className="primary-button qr-apply-button"
              type="submit"
              disabled={loading || !manualValue.trim()}
              data-a11y-action-id="civil.qr.apply"
            >
              {loading ? '설정을 확인하고 있습니다…' : '설정 적용'}
            </button>
          </form>

          <p className="qr-error" role="alert" style={{ display: error ? 'block' : 'none' }}>{error}</p>
          <div className="qr-privacy-note"><Info size={16} aria-hidden="true" /><span>QR 토큰은 이 앱에 저장하지 않습니다. 설정 조회를 위해 공식 서비스에 전달됩니다.</span></div>
          <a className="qr-service-link" href={CENTRAL_QR_ORIGIN} target="_blank" rel="noreferrer">
            내 방식 QR 만들기 <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}
