import { CIVIL_V2_SAFE_LIST_OPTION_ID } from '../../universal-layout/civil-layout-v2-fake-constants';

export function UniversalLayoutV2FakeControls({
  enabled,
  activeOptionId,
  pending,
  message,
  onApply,
}: {
  enabled: boolean;
  activeOptionId: string | null;
  pending: boolean;
  message: string;
  onApply: (optionId: typeof CIVIL_V2_SAFE_LIST_OPTION_ID | null) => void;
}) {
  if (!import.meta.env.DEV || !enabled) return null;

  return (
    <details className="universal-layout-mock universal-layout-v2-fake" data-testid="universal-layout-v2-fake">
      <summary>Universal v2 로컬 Fake 계획</summary>
      <p>중앙 등록 정책이 아닌 Civil Development 전용 정책입니다. 현재 안전 영역을 확인한 뒤 미리 정의된 목록 preset만 적용합니다.</p>
      <div className="universal-layout-mock-actions">
        <button
          type="button"
          data-testid="universal-v2-reset"
          aria-pressed={activeOptionId === null}
          disabled={pending}
          onClick={() => onApply(null)}
        >
          기존 배치
        </button>
        <button
          type="button"
          data-testid="universal-v2-reserved-safe-list"
          aria-pressed={activeOptionId === CIVIL_V2_SAFE_LIST_OPTION_ID}
          disabled={pending}
          onClick={() => onApply(CIVIL_V2_SAFE_LIST_OPTION_ID)}
        >
          reserved-safe-list 적용
        </button>
      </div>
      <p className="universal-layout-mock-status" role="status" aria-live="polite" data-testid="universal-v2-status">
        {message || '메뉴, 하단 조작부, QR 도크 및 터치 크기를 확인한 뒤 Fake 계획을 검증합니다.'}
      </p>
    </details>
  );
}
