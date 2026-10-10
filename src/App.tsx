import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Home, Info } from 'lucide-react';
import {
  CompleteScreen,
  CopiesScreen,
  FeeWaiverScreen,
  FingerprintScreen,
  MainMenuScreen,
  OptionsScreen,
  PaymentScreen,
  PrintingScreen,
  ResidentNumberScreen,
  ResidentTypeScreen,
  type IssueOptions,
} from './components/KioskScreens';
import './styles.css';

type Step = 'main-menu' | 'resident-type' | 'resident-number' | 'fingerprint' | 'options' | 'fee-waiver' | 'copies' | 'payment' | 'printing' | 'complete';
const steps: Step[] = ['main-menu', 'resident-type', 'resident-number', 'fingerprint', 'options', 'fee-waiver', 'copies', 'payment', 'printing', 'complete'];
const stepNames: Record<Step, string> = {
  'main-menu': '증명서 선택', 'resident-type': '문서 종류', 'resident-number': '번호 입력',
  fingerprint: '본인 확인', options: '발급 옵션', 'fee-waiver': '수수료 면제', copies: '발급 부수',
  payment: '신청 내용 확인', printing: '인쇄 중', complete: '발급 완료',
};

function App() {
  const [step, setStep] = useState<Step>('main-menu');
  const [residentNumber, setResidentNumber] = useState('');
  const [options, setOptions] = useState<IssueOptions>({ address: true, history: false, household: false });
  const [feeExempt, setFeeExempt] = useState(false);
  const [copies, setCopies] = useState(1);
  const [notice, setNotice] = useState('');
  const [printingProgress, setPrintingProgress] = useState(false);

  const reset = () => {
    setStep('main-menu'); setResidentNumber(''); setOptions({ address: true, history: false, household: false });
    setFeeExempt(false); setCopies(1); setPrintingProgress(false); setNotice('');
  };
  const moveBack = () => {
    if (step === 'main-menu') return;
    const index = steps.indexOf(step);
    if (step === 'resident-number') setResidentNumber('');
    if (index > 0 && step !== 'printing' && step !== 'complete') setStep(steps[index - 1]);
  };
  const confirm = () => {
    if (step === 'resident-number') {
      if (residentNumber.length !== 13) { setNotice('주민등록번호 13자리를 입력해 주십시오.'); return; }
      setResidentNumber('');
      setStep('fingerprint');
    } else if (step === 'copies') setStep('payment');
  };
  const addDigit = (digit: string) => setResidentNumber((old) => (old + digit).slice(0, 13));
  const toggleOption = (key: keyof IssueOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }));
  const selectCategory = (category: string) => category === '주민등록'
    ? setStep('resident-type')
    : setNotice('데모 버전에서는 현재 주민등록등본 발급만 제공됩니다.');
  const selectFeeWaiver = (isExempt: boolean) => {
    setFeeExempt(isExempt);
    setStep('copies');
  };
  const startPrint = () => setStep('printing');

  useEffect(() => {
    if (step !== 'printing') return;
    setPrintingProgress(true);
    const timer = window.setTimeout(() => { setPrintingProgress(false); setStep('complete'); }, 2400);
    return () => window.clearTimeout(timer);
  }, [step]);

  const total = feeExempt ? 0 : 200 * copies;
  const optionLabel = [
    options.address ? '주소 공개' : '주소 비공개',
    options.history ? '과거 주소 변동 포함' : '과거 주소 변동 미포함',
    options.household ? '세대 구성 사유 포함' : '세대 구성 사유 미포함',
  ].join(' · ');

  return (
    <main className="stage">
      <div className="ambient-label"><span className="status-dot" /> 민원서류 발급 서비스</div>
      <section className="machine" aria-label="무인민원발급기 화면">
        <div className="machine-top"><div className="machine-mark"><span className="mark-block">민원</span><span>무인민원발급기</span></div><div className="machine-status">운영 중 <span /></div></div>
        <div className="screen-shell">
          <header className="screen-header">
            <div className="service-brand"><span className="brand-seal" aria-hidden="true">민</span><div><strong>무인민원발급</strong><small>민원서류 발급 서비스</small></div></div>
            <div className="header-right"><span className="clock">{new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span><span className="header-rule" /><span className="step-count">{step === 'main-menu' ? '처음 화면' : `${steps.indexOf(step)} / 9 단계`}</span></div>
          </header>
          {step !== 'main-menu' && <div className="progress-rail" aria-label={`진행 단계 ${stepNames[step]}`}><div style={{ width: `${Math.min(100, (steps.indexOf(step) / 9) * 100)}%` }} /></div>}

          <div className="screen-content" key={step} data-screen={step}>
            {step === 'main-menu' && <MainMenuScreen onSelectCategory={selectCategory}/>}
            {step === 'resident-type' && <ResidentTypeScreen onSelectCopy={() => setStep('resident-number')} onUnavailable={() => setNotice('주민등록표(초본)은 현재 준비 중입니다. 데모에서는 등본 발급을 이용해 주십시오.')}/>}
            {step === 'resident-number' && <ResidentNumberScreen residentNumber={residentNumber} onDigit={addDigit} onClear={() => setResidentNumber('')} onCorrect={() => setResidentNumber((old) => old.slice(0, -1))}/>}
            {step === 'fingerprint' && <FingerprintScreen onConfirm={() => setStep('options')}/>}
            {step === 'options' && <OptionsScreen options={options} onToggle={toggleOption} optionLabel={optionLabel}/>}
            {step === 'fee-waiver' && <FeeWaiverScreen feeExempt={feeExempt} onSelect={selectFeeWaiver}/>}
            {step === 'copies' && <CopiesScreen copies={copies} feeExempt={feeExempt} onCopiesChange={setCopies}/>}
            {step === 'payment' && <PaymentScreen copies={copies} total={total} feeExempt={feeExempt} optionLabel={optionLabel} onPayment={startPrint}/>}
            {step === 'printing' && <PrintingScreen active={printingProgress}/>}
            {step === 'complete' && <CompleteScreen copies={copies} total={total} feeExempt={feeExempt} onHome={reset}/>}
          </div>

          <footer className="device-footer">
            <div className="footer-service"><span className="footer-led" /> 민원 발급 시뮬레이션 <span className="footer-separator"/> 실제 신청 정보는 저장되지 않습니다</div>
            <div className="footer-controls">
              <button id="home-button" className="control-button home-control" onClick={reset}><Home size={18}/><span>처음화면</span></button>
              <button id="back-button" className="control-button back-control" onClick={moveBack} disabled={step === 'main-menu' || step === 'printing' || step === 'complete'}><ArrowLeft size={18}/><span>전화면</span></button>
              {(step === 'resident-number' || step === 'copies') && <button id="next-confirm-button" className="control-button confirm-control" onClick={confirm}><Check size={19}/><span>확인</span></button>}
              {step === 'options' && <button id="next-confirm-button" className="control-button confirm-control" onClick={() => setStep('fee-waiver')}><Check size={19}/><span>확인</span></button>}
            </div>
          </footer>
        </div>
        <div className="machine-bottom"><span className="machine-grille"/><span className="machine-bottom-text">민원서류 발급부</span><span className="machine-power"><i/> 전원</span></div>
      </section>
      <div className="page-caption">민원서류 발급 시뮬레이션 <span>·</span> 주민등록표(등본)</div>
      {notice && <div className="modal-backdrop" role="presentation" onClick={() => setNotice('')}><section className="notice-modal" role="alertdialog" aria-modal="true" aria-labelledby="notice-title" onClick={(event) => event.stopPropagation()}><div className="modal-symbol"><Info size={22}/></div><h2 id="notice-title">안내</h2><p>{notice}</p><button id="notice-dismiss-button" className="primary-button" onClick={() => setNotice('')}>확인</button></section></div>}
    </main>
  );
}

export default App;
