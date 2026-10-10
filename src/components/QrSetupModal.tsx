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
  destroy(): void;
};

type QrSetupModalProps = {
  onClose: () => void;
  onApplyProfile: (profile: AccessibilityProfile) => void;
};

function readableError(error: unknown) {
  if (!(error instanceof Error)) return 'QR 설정을 확인하지 못했습니다. 다시 시도해 주세요.';
  if (error.message === 'QR_UNAVAILABLE') return '유효하지 않거나 만료된 QR입니다. 공식 서비스에서 만든 QR 주소를 확인해 주세요.';
  if (error.message === 'PROFILE_REQUEST_IN_PROGRESS') return 'QR 설정을 확인하고 있습니다. 잠시 기다려 주세요.';
  return '중앙 QR 서비스에 연결할 수 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.';
}

export function QrSetupModal({ onClose, onApplyProfile }: QrSetupModalProps) {
  const client = useMemo(() => createQrProfileClient(), []);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<ScannerHandle | null>(null);
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
    let cancelled = false;
    void import('@naebangsik/kiosk-accessibility-sdk/qr-scanner')
      .then(({ mountQrScanner }) => {
        if (cancelled || !scannerContainerRef.current) return;
        const scanner = mountQrScanner({
          container: scannerContainerRef.current,
          onScan: (value) => {
            // The SDK stops camera tracks before this callback; destroy the view before network lookup.
            scannerRef.current?.destroy();
            scannerRef.current = null;
            void resolveProfile(value, 'scan');
          },
          onCameraUnavailable: (message) => {
            setCameraMessage(message);
          },
        });
        scannerRef.current = scanner;
        const cameraButton = scannerContainerRef.current.querySelector<HTMLButtonElement>('.qr-camera-actions button');
        if (cameraButton) {
          cameraButton.id = 'qr-camera-start-button';
          cameraButton.dataset.a11yActionId = 'civil.qr.camera-start';
        }
      })
      .catch(() => setCameraMessage('카메라를 시작할 수 없습니다. 아래에 QR 주소를 직접 입력해 주세요.'));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loadingRef.current) onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', handleKeyDown);
      scannerRef.current?.destroy();
      scannerRef.current = null;
      client.cancel();
    };
  }, [client]);

  async function resolveProfile(value: string, inputKind: 'scan' | 'manual') {
    setError('');
    loadingRef.current = true;
    setLoading(true);
    try {
      const profile = await client.resolve(value, inputKind);
      onApplyProfileRef.current(validateAccessibilityProfile(profile));
      onCloseRef.current();
    } catch (reason) {
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
    <div className="qr-modal-backdrop" role="presentation" onMouseDown={(event) => {
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
          {cameraMessage && <p className="qr-camera-fallback" role="status">{cameraMessage}</p>}

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

          {error && <p className="qr-error" role="alert">{error}</p>}
          <div className="qr-privacy-note"><Info size={16} aria-hidden="true" /><span>QR 토큰은 이 앱에 저장하지 않습니다. 설정 조회를 위해 공식 서비스에 전달됩니다.</span></div>
          <a className="qr-service-link" href={CENTRAL_QR_ORIGIN} target="_blank" rel="noreferrer">
            내 방식 QR 만들기 <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}
