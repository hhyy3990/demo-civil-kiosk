export type UniversalMockColumns = 1 | 2;

export function UniversalLayoutMockControls({
  activeColumns,
  pending,
  message,
  onApply,
}: {
  activeColumns: UniversalMockColumns | null;
  pending: boolean;
  message: string;
  onApply: (columns: UniversalMockColumns | null) => void;
}) {
  if (!import.meta.env.DEV) return null;

  return (
    <details className="universal-layout-mock" data-testid="universal-layout-mock">
      <summary>Universal Layout v1 개발 Mock</summary>
      <p>첫 화면의 증명서 메뉴 열 수만 시험합니다. 업무 동작과 항목 순서는 바뀌지 않습니다.</p>
      <div className="universal-layout-mock-actions">
        <button
          type="button"
          data-testid="universal-layout-original"
          aria-pressed={activeColumns === null}
          disabled={pending}
          onClick={() => onApply(null)}
        >
          기존 배치
        </button>
        <button
          type="button"
          data-testid="universal-layout-columns-1"
          aria-pressed={activeColumns === 1}
          disabled={pending}
          onClick={() => onApply(1)}
        >
          Mock 1열
        </button>
        <button
          type="button"
          data-testid="universal-layout-columns-2"
          aria-pressed={activeColumns === 2}
          disabled={pending}
          onClick={() => onApply(2)}
        >
          Mock 2열
        </button>
      </div>
      <p
        className="universal-layout-mock-status"
        role="status"
        aria-live="polite"
        data-testid="universal-layout-status"
      >
        {message || '선택한 배치는 Node 개발 서버의 공통 Universal v1 검증을 거칩니다.'}
      </p>
    </details>
  );
}
