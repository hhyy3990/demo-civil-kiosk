import type { BottomViewportHeightPercent } from '@naebangsik/kiosk-accessibility-sdk';
import './bottom-viewport-test-controls.css';

type BottomViewportTestControlsProps = {
  activePercent: BottomViewportHeightPercent | null;
  onSelect: (heightPercent: BottomViewportHeightPercent | null) => void;
  disabled?: boolean;
};

const viewportSizes: BottomViewportHeightPercent[] = [60, 70, 80];

export function BottomViewportTestControls({
  activePercent,
  onSelect,
  disabled = false,
}: BottomViewportTestControlsProps) {
  return (
    <aside
      className="bottom-viewport-test-controls"
      aria-label="개발 전용 하단 표시 영역 테스트"
    >
      <strong>개발 전용 · 하단 표시 영역</strong>
        <p>{disabled ? 'QR 프로필 설정이 우선 적용됩니다.' : 'QR 프로필 설정과 분리된 SDK 테스트 모드입니다.'}</p>
      <div className="bottom-viewport-test-options" role="group" aria-label="화면 높이 비율">
        {viewportSizes.map((heightPercent) => (
          <button
            key={heightPercent}
            type="button"
            aria-pressed={activePercent === heightPercent}
            disabled={disabled}
            data-testid={`viewport-${heightPercent}`}
            onClick={() => onSelect(heightPercent)}
          >
            {heightPercent}%
          </button>
        ))}
        <button
          type="button"
          aria-pressed={activePercent === null}
          disabled={disabled}
          data-testid="viewport-reset"
          onClick={() => onSelect(null)}
        >
          기본
        </button>
      </div>
    </aside>
  );
}
