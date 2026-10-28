export type UniversalMockColumns = 1 | 2;

export function UniversalLayoutMockControls({
  activeColumns,
  pending,
  message,
  backend,
  onApply,
}: {
  activeColumns: UniversalMockColumns | null;
  pending: boolean;
  message: string;
  backend: 'local' | 'central' | 'openai';
  onApply: (columns: UniversalMockColumns | null) => void;
}) {
  if (!import.meta.env.DEV) return null;

  return (
    <details className="universal-layout-mock" data-testid="universal-layout-mock" data-backend={backend}>
      <summary>
        {backend === 'central'
          ? 'Universal v1 중앙 Development 중계'
          : backend === 'openai'
            ? 'Universal v1 OpenAI Development 중계'
            : 'Universal Layout v1 로컬 개발 Mock'}
      </summary>
      <p>
        {backend === 'central'
          ? '기본 접근성 설정과 고정 하단 조작부가 없는 화면에서만 중앙 계획을 시험합니다.'
          : backend === 'openai'
            ? 'Development에서 별도 허용된 경우에만 한 번의 중앙 AI 계획을 시험합니다.'
            : '첫 화면의 증명서 메뉴 열 수만 시험합니다. 업무 동작과 항목 순서는 바뀌지 않습니다.'}
      </p>
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
        {backend !== 'local' ? (
          <button
            type="button"
            data-testid={backend === 'openai'
              ? 'universal-layout-openai-request'
              : 'universal-layout-central-request'}
            aria-pressed={activeColumns !== null}
            disabled={pending}
            onClick={() => onApply(1)}
          >
            {backend === 'openai' ? 'OpenAI 계획 요청' : '중앙 계획 요청'}
          </button>
        ) : (
          <>
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
          </>
        )}
      </div>
      <p
        className="universal-layout-mock-status"
        role="status"
        aria-live="polite"
        data-testid="universal-layout-status"
      >
        {message || (backend === 'central'
          ? '서버 중계가 활성화된 경우에만 중앙 Development API를 호출합니다.'
          : backend === 'openai'
            ? 'OpenAI relay opt-in 및 공통 검증을 통과한 경우에만 계획을 적용합니다.'
            : '선택한 배치는 Node 개발 서버의 공통 Universal v1 검증을 거칩니다.')}
      </p>
    </details>
  );
}
