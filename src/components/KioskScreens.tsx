import { Check, ChevronRight, Fingerprint, Home, Info, Printer, ShieldCheck } from 'lucide-react';
import {
  UniversalLayoutMockControls,
  type UniversalMockColumns,
} from './UniversalLayoutMockControls';

export type IssueOptions = {
  address: boolean;
  history: boolean;
  household: boolean;
};

const certificateCategories = [
  '주민등록', '지적, 토지, 건축', '차량', '보건복지', '농지대장, 농업경영체', '가족관계등록부',
  '제적부', '병적증명서', '지방세', '어선원부', '부동산등기사항증명서', '교육제증명',
  '국세증명', '건강보험', '고용·산재보험', '여권', '국민연금', '교통(경찰청)',
];

export function MainMenuScreen({
  onSelectCategory,
  showDevAccessibilityExperience,
  onStartDevAccessibilityExperience,
  universalMockColumns,
  universalMockPending,
  universalMockMessage,
  universalMockBackend,
  onUniversalMockApply,
}: {
  onSelectCategory: (category: string) => void;
  showDevAccessibilityExperience: boolean;
  onStartDevAccessibilityExperience: () => void;
  universalMockColumns: UniversalMockColumns | null;
  universalMockPending: boolean;
  universalMockMessage: string;
  universalMockBackend: 'local' | 'central';
  onUniversalMockApply: (columns: UniversalMockColumns | null) => void;
}) {
  return (
    <section className="screen-view main-view">
      <div className="title-band">
        <div className="title-icon"><Info size={19} /></div>
        <div className="main-title-copy"><h1>발급을 원하시는 증명서를<br className="main-title-mobile-break"/>선택하십시오.</h1><p data-a11y-detail>원하는 민원서류를 선택해 주십시오.</p></div>
      </div>
      <div className="demo-banner"><span className="demo-tag">데모 버전 안내</span><span>현재 주민등록등본 발급 기능만 제공됩니다.</span></div>
      {import.meta.env.DEV && showDevAccessibilityExperience && (
        <button
          id="dev-accessibility-experience-button"
          type="button"
          data-a11y-action-id="civil.dev-accessibility-experience.start"
          className="dev-accessibility-experience-button"
          aria-describedby="dev-accessibility-experience-description"
          onClick={onStartDevAccessibilityExperience}
        >
          <span className="dev-accessibility-experience-copy">
            <strong>접근성 체험하기</strong>
            <small id="dev-accessibility-experience-description">QR 없이 큰 글씨와 쉬운 안내를 체험해 보세요.</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      <UniversalLayoutMockControls
        activeColumns={universalMockColumns}
        pending={universalMockPending}
        message={universalMockMessage}
        backend={universalMockBackend}
        onApply={onUniversalMockApply}
      />
      <div
        className="certificate-grid"
        aria-label="증명서 종류"
        data-a11y-grid
        data-universal-columns={universalMockColumns ?? undefined}
      >
        {certificateCategories.map((category, index) => <button key={category} id={index === 0 ? 'main-resident-button' : `certificate-category-${index + 1}`} data-a11y-action-id={import.meta.env.DEV ? `civil.certificate.${String(index + 1).padStart(2, '0')}` : undefined} data-a11y-menu-item className={`category-button ${index === 0 ? 'category-active' : ''}`} onClick={() => onSelectCategory(category)}>
          <span className="category-number">{String(index + 1).padStart(2, '0')}</span><span className="category-name">{category}</span><ChevronRight size={16} className="category-arrow" />
        </button>)}
      </div>
      <p className="screen-footnote" data-a11y-detail>일부 증명서는 발급기관 또는 관할 지역에 따라 발급이 제한될 수 있습니다.</p>
    </section>
  );
}

export function ResidentTypeScreen({ onSelectCopy, onUnavailable }: { onSelectCopy: () => void; onUnavailable: () => void }) {
  return (
    <section className="screen-view">
      <Title eyebrow="주민등록" title="발급할 문서 종류를 선택하십시오." sub="발급 가능한 주민등록표를 선택해 주세요." />
      <div className="type-choice-list">
        <button id="resident-register-copy-button" data-a11y-action-id="civil.document.copy" className="type-choice selected-choice" onClick={onSelectCopy}><span className="choice-index">01</span><span><strong>주민등록표(등본)</strong><small data-a11y-detail>세대 구성원과 주소 정보 확인</small></span><span className="choice-fee">200원</span><ChevronRight size={20}/></button>
        <button id="resident-register-extract-button" data-a11y-action-id="civil.document.extract" className="type-choice muted-choice" onClick={onUnavailable}><span className="choice-index">02</span><span><strong>주민등록표(초본)</strong><small data-a11y-detail>현재 발급 준비 중</small></span><span className="preparing-label">준비 중</span></button>
      </div>
      <div className="note-box" data-a11y-detail><Info size={17}/><span>현재는 주민등록표(등본) 발급만 시연할 수 있습니다.</span></div>
    </section>
  );
}

export function ResidentNumberScreen({ residentNumber, onDigit, onClear, onCorrect }: { residentNumber: string; onDigit: (digit: string) => void; onClear: () => void; onCorrect: () => void }) {
  return (
    <section className="screen-view">
      <Title eyebrow="주민등록 · 등본" title="주민등록번호를 입력한 후 확인을 누르십시오." sub="숫자 13자리를 입력해 주세요." />
      <div className="number-layout">
        <aside className="number-side"><div className="privacy-symbol"><ShieldCheck size={28}/></div><strong>개인정보 보호 안내</strong><p data-a11y-detail>입력한 번호는 이 화면에서만 사용되며, 화면을 나가거나 처음 화면으로 돌아가면 바로 지워집니다.</p><div className="note-box compact" data-a11y-detail><Info size={16}/><span>데모 버전이므로 실제 주민등록번호가 아닌 임의의 숫자를 입력해 주세요.</span></div></aside>
        <div className="keypad-area"><div className="number-display" aria-label={`입력한 숫자 ${residentNumber.length}자리`}>
          <span className="number-placeholder">{residentNumber.length ? '● '.repeat(residentNumber.length).trim() : '숫자 13자리 입력'}</span><span className="digit-counter">{residentNumber.length} / 13</span>
        </div><div className="keypad" aria-label="숫자 키패드">
          {['1','2','3','4','5','6','7','8','9','clear','0','correct'].map((key) => <button key={key} id={`number-key-${key}`} data-a11y-action-id={`civil.resident-number.key.${key}`} className={`key-button ${key === 'clear' ? 'key-delete' : ''} ${key === 'correct' ? 'key-correct' : ''}`} onClick={() => key === 'clear' ? onClear() : key === 'correct' ? onCorrect() : onDigit(key)}>{key === 'clear' ? '전체 삭제' : key === 'correct' ? '정정' : key}</button>)}
        </div></div>
      </div>
    </section>
  );
}

export function FingerprintScreen({ onConfirm }: { onConfirm: () => void }) {
  return (
    <section className="screen-view">
      <Title eyebrow="본인 확인" title="지문인식기에 오른손 엄지손가락을 올려주세요." sub="화면의 버튼을 눌러 본인 확인 단계를 진행합니다." />
      <div className="fingerprint-panel"><div className="fingerprint-art"><Fingerprint size={92} strokeWidth={1.15}/><span className="scan-line"/></div><div className="fingerprint-copy"><span className="device-label">본인 확인 장치</span><h2>오른손 엄지손가락</h2><p data-a11y-detail>손가락을 인식부에 올린 뒤 화면의 확인 버튼을 눌러 주십시오.</p><div className="instruction-state"><span className="state-led" /> 인식 대기</div></div></div>
      <div className="note-box" data-a11y-detail><Info size={17}/><span>실제 지문 인식 대신 화면 내 확인 버튼으로 진행할 수 있습니다.</span></div>
      <div className="inline-action"><button className="primary-button" id="fingerprint-confirm-button" data-a11y-action-id="civil.fingerprint.confirm" onClick={onConfirm}><Check size={18}/> 지문 확인 완료</button></div>
    </section>
  );
}

export function OptionsScreen({ options, onToggle, optionLabel }: { options: IssueOptions; onToggle: (key: keyof IssueOptions) => void; optionLabel: string }) {
  return (
    <section className="screen-view">
      <Title eyebrow="발급 항목" title="증명서에 표시할 항목을 선택하십시오." sub="필요한 정보 공개 범위를 선택해 주세요." />
      <div className="option-list">
        <ToggleRow title="주소 공개" detail="현재 주소를 증명서에 표시합니다." value={options.address} onClick={() => onToggle('address')} id="option-address"/>
        <ToggleRow title="과거 주소 변동 사항" detail="과거 주소 변동 내역을 증명서에 표시합니다." value={options.history} onClick={() => onToggle('history')} id="option-history"/>
        <ToggleRow title="세대 구성 사유" detail="세대 구성 및 변경 사유를 표시합니다." value={options.household} onClick={() => onToggle('household')} id="option-household"/>
      </div>
      <div className="selection-caption"><span>현재 선택</span><strong>{optionLabel}</strong></div>
    </section>
  );
}

export function FeeWaiverScreen({ feeExempt, onSelect }: { feeExempt: boolean; onSelect: (isExempt: boolean) => void }) {
  return (
    <section className="screen-view">
      <Title eyebrow="수수료 선택" title="수수료 면제 대상 여부를 선택하십시오." sub="해당하는 항목을 선택해 주세요." />
      <div className="waiver-grid">
        <SelectCard id="fee-waiver-yes-button" active={feeExempt} icon="면제" title="수수료 면제 대상자" detail="법령에 따른 면제 대상인 경우" onClick={() => onSelect(true)}/>
        <SelectCard id="fee-waiver-no-button" active={!feeExempt} icon="일반" title="수수료 면제 대상자 아님" detail="일반 발급 수수료가 적용됩니다" onClick={() => onSelect(false)}/>
      </div>
      <div className="note-box" data-a11y-detail><Info size={17}/><span>선택하신 면제 여부는 발급 수수료 계산에 반영됩니다.</span></div>
    </section>
  );
}

export function CopiesScreen({ copies, feeExempt, onCopiesChange }: { copies: number; feeExempt: boolean; onCopiesChange: (copies: number) => void }) {
  return (
    <section className="screen-view">
      <Title eyebrow="발급 부수" title="발급할 부수를 입력한 후 확인을 누르십시오." sub="최대 9부까지 신청할 수 있습니다." />
      <div className="copies-layout"><div className="copies-summary"><span className="summary-label">신청 서류</span><strong>주민등록표(등본)</strong><div className="summary-divider"/><span className="summary-label">부수당 수수료</span><strong>{feeExempt ? '면제' : '200원'}</strong></div>
        <div className="copies-selector"><span className="summary-label">발급 부수</span><div className="copies-control"><button id="copies-decrease-button" data-a11y-action-id="civil.copies.decrease" aria-label="부수 줄이기" disabled={copies <= 1} onClick={() => onCopiesChange(Math.max(1, copies - 1))}>−</button><strong id="copies-count">{copies}<small>부</small></strong><button id="copies-increase-button" data-a11y-action-id="civil.copies.increase" aria-label="부수 늘리기" disabled={copies >= 9} onClick={() => onCopiesChange(Math.min(9, copies + 1))}>＋</button></div><div className="copies-numbers">{Array.from({length: 9}, (_, i) => <button key={i} data-a11y-action-id={`civil.copies.select-${i + 1}`} aria-label={`${i + 1}부 선택`} className={copies === i + 1 ? 'number-selected' : ''} onClick={() => onCopiesChange(i + 1)}>{i + 1}</button>)}</div></div>
      </div>
    </section>
  );
}

export function PaymentScreen({ copies, total, feeExempt, optionLabel, onPayment }: { copies: number; total: number; feeExempt: boolean; optionLabel: string; onPayment: () => void }) {
  return (
    <section className="screen-view">
      <Title eyebrow="신청 내용 확인" title="신청 내용을 확인해 주십시오." sub="내용을 확인한 뒤 결제 방법을 선택해 주세요." />
      <div className="application-summary">
        <div className="summary-head"><span>신청 내용</span><span className="summary-status">확인해 주세요</span></div>
        <SummaryLine label="신청 증명서" value="주민등록표(등본)"/>
        <SummaryLine label="신청 부수" value={`${copies}부`}/>
        <SummaryLine label="선택 항목" value={optionLabel}/>
        <SummaryLine label="수수료 면제" value={feeExempt ? '면제 대상자' : '면제 대상자 아님'}/>
        <div className="total-line"><span>총 수수료</span><strong>{total.toLocaleString('ko-KR')}<small>원</small></strong></div>
      </div>
      <div className="payment-heading"><strong>결제 방법을 선택하십시오.</strong><span>데모 버전이므로 실제 결제는 진행되지 않습니다.</span></div>
      <div className="payment-options">
        <button id="payment-card-button" data-a11y-action-id="civil.payment.card" className="payment-button" onClick={onPayment}><span className="payment-icon card-icon">카드</span><span><strong>신용·체크카드</strong><small data-a11y-detail>카드 결제 시뮬레이션</small></span><ChevronRight size={20}/></button>
        <button id="payment-cash-button" data-a11y-action-id="civil.payment.cash" className="payment-button" onClick={onPayment}><span className="payment-icon cash-icon">현금</span><span><strong>현금</strong><small data-a11y-detail>현금 결제 시뮬레이션</small></span><ChevronRight size={20}/></button>
      </div>
    </section>
  );
}

export function PrintingScreen({ active }: { active: boolean }) {
  return (
    <section className="screen-view centered-view">
      <div className="printing-icon"><Printer size={42}/><span className={active ? 'printer-light lit' : 'printer-light'}/></div><p className="eyebrow">출력 장치</p><h1>인쇄 중입니다.</h1><p className="center-sub">잠시만 기다려 주십시오.</p>
      <div className="print-status"><span className="print-progress"><i/></span><strong>증명서를 준비하고 있습니다</strong><span className="print-dots">•••</span></div>
      <p className="tiny-notice">데모 시뮬레이션이 진행 중입니다.</p>
    </section>
  );
}

export function CompleteScreen({
  copies,
  total,
  feeExempt,
  remainingSeconds,
  active,
  returning,
  error,
  onExtend,
  onHome,
}: {
  copies: number;
  total: number;
  feeExempt: boolean;
  remainingSeconds: number;
  active: boolean;
  returning: boolean;
  error: boolean;
  onExtend: () => void;
  onHome: () => void;
}) {
  return (
    <section className="screen-view centered-view complete-view">
      <div className="complete-mark"><Check size={48}/></div><p className="eyebrow">발급 완료</p><h1>발급이 완료되었습니다.</h1><p className="center-sub">증명서 출력구에서 서류를 받아 주세요.</p>
      <div className="completion-slip"><span>주민등록표(등본)</span><strong>{copies}부 발급</strong><span>{feeExempt ? '수수료 면제' : `${total.toLocaleString('ko-KR')}원`}</span></div>
      <div className="note-box" data-a11y-detail><Info size={17}/><span>실제 문서는 출력되지 않는 시뮬레이션 화면입니다.</span></div>
      <p className={`completion-countdown ${error ? 'completion-countdown-error' : ''}`} data-a11y-detail role={error ? 'alert' : 'status'} aria-live="polite" aria-atomic="true">
        {error ? '자동 복귀에 실패했습니다. 처음 화면으로 다시 시도해 주세요.' : returning ? '처음 화면으로 돌아가고 있습니다.' : `${remainingSeconds}초 후 처음 화면으로 돌아갑니다.`}
      </p>
      <div className="completion-actions" data-a11y-action-group>
        <button
          id="completion-extend-button"
          data-a11y-action-id="civil.complete.extend"
          className="completion-extend"
          onClick={onExtend}
          disabled={!active || returning}
        >
          시간 연장
        </button>
        <button
          id="complete-home-button"
          data-a11y-action-id="civil.complete.home"
          className="primary-button completion-home"
          onClick={onHome}
          disabled={returning}
        >
          <Home size={18}/> 처음 화면으로
        </button>
      </div>
    </section>
  );
}

function Title({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{sub}</p></div>;
}

function ToggleRow({ title, detail, value, onClick, id }: { title: string; detail: string; value: boolean; onClick: () => void; id: string }) {
  return <button id={id} data-a11y-action-id={`civil.options.${id.replace('option-', '')}`} className={`toggle-row ${value ? 'toggle-on' : ''}`} aria-pressed={value} onClick={onClick}><span className="toggle-text"><strong>{title}</strong><small data-a11y-detail>{detail}</small></span><span className="toggle-choice">{value ? '공개' : '비공개'}</span><span className={`switch ${value ? 'switch-on' : ''}`}><i/></span></button>;
}

function SelectCard({ id, active, icon, title, detail, onClick }: { id: string; active: boolean; icon: string; title: string; detail: string; onClick: () => void }) {
  return <button id={id} data-a11y-action-id={id === 'fee-waiver-yes-button' ? 'civil.fee-waiver.exempt' : 'civil.fee-waiver.standard'} className={`select-card ${active ? 'select-card-active' : ''}`} onClick={onClick}><span className="select-icon">{icon}</span><strong>{title}</strong><small data-a11y-detail>{detail}</small><span className="select-action">{active ? '선택됨' : '선택'} <ChevronRight size={16}/></span></button>;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="summary-line"><span>{label}</span><strong>{value}</strong></div>;
}
