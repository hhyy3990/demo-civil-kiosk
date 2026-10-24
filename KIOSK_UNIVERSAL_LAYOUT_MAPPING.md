# 무인민원발급기 — Universal Layout Contract v1 매핑 분석

**검토 범위:** 현재 호스트 코드와 설치된 `@naebangsik/kiosk-accessibility-sdk@0.5.31`의 공개 타입·연결 방식. 설계 문서만 작성했으며 앱 코드, SDK, 중앙 API, DB, 설정은 변경하지 않았다. 실제 AI나 계획 API를 호출하지 않았고 브라우저 레이아웃 측정도 수행하지 않았다.

## 1. 현재 화면과 단계 흐름

화면 상태는 `src/useKioskAccessibility.ts:13-23`의 `KioskStep` 10개다. SDK 스냅샷 ID는 `civil.${step}` 형식이며, 헤더 진행 표시는 첫 화면을 제외하고 `steps.indexOf(step) / 9`로 만든다 (`src/App.tsx:29,47-50,226`).

| 화면 ID | 실제 화면·UI 구조 | 현재 동작과 상태 | 현재 CSS 레이아웃 |
|---|---|---|---|
| `civil.main-menu` | 증명서 종류 18개. `.certificate-grid` 안에 동일 형태의 `button.category-button` 18개. 각 버튼에 `data-a11y-menu-item`, `data-a11y-action-id="civil.certificate.NN"`가 있다. | 주민등록만 `resident-type`으로 이동. 나머지는 “현재 주민등록등본 발급만 제공” 안내를 띄운다. | `.certificate-grid`: 데스크톱 3열, 520px 이하 2열. |
| `civil.resident-type` | `.type-choice-list`의 등본·초본 카드 2개. 초본은 준비 중 안내, 등본만 입력 단계로 이동. | 등본 선택 시 `resident-number`로 이동. 초본 선택은 안내만 띄운다. | 한 열 grid, 반복 카드. |
| `civil.resident-number` | 개인정보 안내 `.number-side`, 가림 처리된 입력 표시 `.number-display`, 12개 숫자/수정 버튼 `.keypad`. | 숫자 최대 13자리. 확인 시 13자리 여부만 검증하고 상태를 지운 뒤 지문 화면으로 이동한다. 처음 화면 또는 전화면 이동도 입력값을 지운다. | `.number-layout`은 데스크톱 2열(`.82fr 1.18fr`), 모바일 한 열. 키패드는 3열. |
| `civil.fingerprint` | 지문 안내 카드와 `#fingerprint-confirm-button`. | 실제 센서가 아닌 화면 시뮬레이션. 확인 시 옵션 화면으로 이동한다. | 안내 패널 flex, 하단 inline action. |
| `civil.options` | 주소 공개, 과거 주소 변동, 세대 구성 사유의 `.toggle-row` 3개와 현재 선택 요약. | 세 개의 boolean은 React 상태. footer의 확인으로 수수료 단계로 이동한다. | `.option-list` 한 열 grid. |
| `civil.fee-waiver` | 면제/일반 `.select-card` 2개와 안내문. | 카드 선택 시 면제 여부를 React 상태에 저장하고 곧바로 부수 단계로 이동한다. | `.waiver-grid` 2열 grid. |
| `civil.copies` | 서류·부수당 수수료 요약, 1–9부 선택과 증감 버튼. | 수량은 1–9로 제한. footer 확인으로 결제 화면으로 이동한다. | `.copies-layout` 데스크톱 2열, 모바일 한 열. 숫자 버튼은 3열 grid. |
| `civil.payment` | 신청 내용 요약과 카드/현금 결제 시뮬레이션 버튼 2개. | 수수료는 면제면 0, 아니면 `200 * copies`. 두 결제 버튼 모두 인쇄 시뮬레이션을 시작한다. 실제 결제는 없다. | 요약은 행 단위 grid, 결제 옵션은 데스크톱 2열·모바일 1열. |
| `civil.printing` | 인쇄 진행 표시. | 2.4초 후 완료 단계로 이동. | 중앙 정렬 flex. |
| `civil.complete` | 완료 요약, 자동 복귀 카운트다운, 연장/처음 화면 버튼. | SDK 완료 타이머 또는 처음 화면 동작으로 세션을 종료한다. 실제 문서는 출력하지 않는다. | 중앙 정렬 flex, 완료 action 묶음. |

화면 구현과 주요 이벤트는 `src/App.tsx:81-115,132-173,243-280`, 컴포넌트는 `src/components/KioskScreens.tsx:9-232`에 있다. `screen-content`의 `key={step}` 때문에 화면 교체 시 하위 화면 subtree가 다시 마운트된다. `notifyScreenChange()`와 프로필 적용·레이아웃 점검은 단계 변경 시 실행된다 (`src/useKioskAccessibility.ts:537-541,583-636`).

### 화면 이동 및 상태 초기화

- `moveBack`: 현재 단계의 이전 단계로 이동. 주민등록번호 화면에서 뒤로 가면 입력값을 먼저 지운다. 다른 신청 옵션은 뒤로 갈 때 보존한다.
- `confirm`: 번호 화면에서는 13자리 검증 후 번호 상태를 지우고 지문 화면으로 이동. 부수 화면에서는 결제 화면으로 이동.
- 면제/일반 선택은 즉시 부수 화면으로 이동한다. 결제 화면에서 결제수단 버튼을 누르면 인쇄가 시작된다.
- `reset`: 신청 입력, 옵션, 면제 여부, 부수, 안내 상태와 접근성 프로필을 기본값으로 되돌리고 `endSession()`을 호출한 다음 첫 화면으로 이동한다.
- 발급 중/완료 단계에서는 전화면 버튼이 비활성화된다. 완료 화면에는 별도의 연장·처음 화면 action이 있다.

## 2. 범용 구성 요소 매핑

| Universal v1 후보 | 실제 매핑 후보 | 판단 |
|---|---|---|
| `repeated-card-list` | 첫 화면 `.certificate-grid`; 문서 종류 `.type-choice-list` | 반복되는 동일 형태의 탐색 카드/행이다. 첫 화면은 18개 항목의 명시적 DOM 순서를 유지해야 한다. |
| `choice-grid` | 수수료 면제 `.waiver-grid`; 결제수단 `.payment-options`; 제한적으로 발급 부수 `.copies-numbers` | 같은 화면의 선택 버튼 묶음에 적합하다. 수수료·결제 선택은 다음 단계/업무 동작과 연결되어 있으므로 배치만 허용한다. 부수 숫자 선택은 수량 입력 상태이므로 일반 선택 카드와 별도 식별하는 편이 안전하다. |
| `input-group` | 주민등록번호의 `.number-display` + `.keypad`; 부수 선택 컨트롤 | 입력 표시와 입력 버튼의 결합을 유지해야 한다. 주민등록번호의 값과 입력 동작은 레이아웃 모델에 넣지 않는다. |
| `information-region` | 제목, 개인정보 안내, 데모 배너, note-box, 이용 각주 | 의미 있는 안내 영역이다. 표시/숨김, 문구 변경, 다른 화면으로 이동을 허용하면 안 된다. |
| `summary-region` | `.copies-summary`, `.application-summary`, `.completion-slip` | 동적으로 신청 내용·수량·수수료가 표시된다. 영역 종류와 크기 제약만 모델링하고 요약 값은 외부 전송 금지다. |
| `action-region` | `.device-footer .footer-controls`, 결제 버튼 그룹, 완료 action | 업무 전환을 일으키는 실행부다. 위치·순서·표시·동작은 AI가 바꾸면 안 된다. |

기존 `data-a11y-grid`는 첫 화면 증명서 grid 하나에 붙어 있다. 이는 SDK의 레이아웃 진단용 등록이며 Universal의 `choice-grid` 또는 `repeated-card-list` 계약 ID로 간주할 수 없다. 다른 화면에는 Universal용 의미 ID가 없다. 추후 연결 시 접근성 SDK의 `data-a11y-*` 표식과 분리된 별도 의미 매핑이 필요하다.

## 3. 배치 변경 안전성

### 제한적으로 허용할 수 있는 작업

- 호스트가 미리 허용한 grid 컨테이너의 **열 수 변경** (`setColumns`)만 첫 단계 작업으로 권고한다.
- 열 수는 화면 폭과 최소 카드 폭을 기준으로 호스트가 계산한 허용값 중에서만 선택한다. 카드/액션의 DOM 순서와 기존 CSS breakpoint를 넘겨쓰지 않는다.
- 적용 방법은 사전 허용된 컨테이너에 대응하는 CSS 변수/클래스만 사용한다. 모델이 임의 CSS, selector, 스타일 문자열을 반환하거나 DOM을 재구성하게 하지 않는다.

### 추가 검증 후에만 허용할 수 있는 작업

- 알려진 두 칼럼 영역을 한 칼럼으로 쌓기, 간격 조절, 허용된 요소의 줄바꿈. 특히 번호 입력 그룹은 개인정보 안내·표시·키패드가 한 덩어리로 유지되는지 확인해야 한다.
- 결제 요약과 결제수단, 부수 요약과 선택기의 상대 배치. 세로 화면·큰 글씨·큰 버튼·하단 조작 모드에서 모든 제어가 보이고 실제 클릭 가능한지 화면별 검증이 필요하다.

### AI 변경 금지

- DOM 순서, 버튼 순서, `order`, 방향 전환으로 읽기/탭 순서를 바꾸는 동작.
- `display:none`, `visibility:hidden`, `opacity:0`, 잘림을 일으키는 높이/overflow/position/z-index 변경, 안내·버튼 삭제 또는 비활성화.
- 본문·라벨·가격·수수료 문구·선택 조건을 수정하는 동작.
- 어떤 입력값, 선택 상태, 신청 내용, 결제수단, 발급 요청·응답, 화면 전환·제출 동작도 변경하거나 재생성하지 않는다.
- 접근성 SDK의 글씨·버튼 크기, 고대비, 하단 조작, 하단 viewport, 쉬운 말·길잡이·음성 설정을 덮어쓰지 않는다. 특히 footer는 모바일에서 `position:fixed`이며 업무 조작부이므로 이동·축소·겹침 유발 변경을 허용하지 않는다.

## 4. 접근성 및 레이아웃 제약

- 호스트는 SDK v0.5.31의 `DEFAULT_ACCESSIBILITY_PROFILE`, `validateAccessibilityProfile`, `applyProfile()`을 사용한다. 프로필은 글씨/버튼 크기, 대비, 하단 조작, `viewportMode`, 쉬운 말·Smart Guide·음성 설정을 포함한다 (`src/App.tsx:3-9,69-70,180-190`; `src/useKioskAccessibility.ts:583-636`).
- 의미와 기능의 우선순위는 접근성 프로필, 사용자 입력/버튼 접근성, 고정 조작부, 업무 순서, 그 다음 배치 최적화다. layout plan은 글씨 크기·색상 대비·터치 목표 크기·고정 footer를 약화해서는 안 된다.
- 상위 화면 `.stage`는 flex column, `.screen-shell`은 flex column과 `overflow:hidden`, `.screen-content`는 flex 영역이다 (`src/styles.css:2,6,10,16`). 모바일 520px 이하에서는 `.screen-content`에 `overflow-y:auto`가 있고 footer는 fixed다 (`src/styles.css:54-60,74`). 반면 SDK adapter의 `scrollArea`는 현재 `root`인 `.stage`다 (`src/useKioskAccessibility.ts:441-467`). 실제 스크롤 소유자는 viewport mode와 런타임 CSS에 따라 달라질 수 있으므로, 범용 검증기가 scroll owner나 footer 위치를 추측해 바꾸면 안 된다.
- SDK의 `bottomControls`, `scrollArea`, `menuItems`, `reflowContainers`, `gridContainers`, `actionGroups`, `primaryActions`, `guidanceAvoidAreas`, `viewportOverlays`는 기존 접근성·스크롤·진단 기능의 DOM 경계다. Universal layout 대상 ID와 동일시하지 않는다.

## 5. 개인정보·업무 보호 경계

주민등록번호는 React의 `residentNumber` 상태로만 유지되며 화면에는 점과 입력 개수만 표시된다. 확인 시 상태가 지워진다 (`src/App.tsx:55-56,87-94`; `src/components/KioskScreens.tsx:70-80`). 요약에는 증명서 종류, 옵션, 부수, 면제 여부와 수수료가 동적으로 표시된다 (`src/components/KioskScreens.tsx:124-151`).

Universal AI 요청에는 전체 DOM, 화면 문자열, `innerText`, 폼 값, 실제 입력값, 주민등록번호, 이름·주소, 증명서 내용, 선택된 증명서·옵션·부수·수수료, 결제 정보 또는 QR 토큰을 포함하지 않는다. 의미적 화면/영역 ID, component kind, 허용 operation, 최소 접근성 제약 요약, 구조·제약 hash만 전달한다. 현재 SDK `getSnapshot()`에는 부수·면제·옵션 boolean 등이 들어가고 `getActions()`는 화면의 버튼 이름(`innerText`)도 읽으므로, 이 반환값을 AI 입력으로 그대로 직렬화하면 안 된다 (`src/useKioskAccessibility.ts:359-388`).

이 프로젝트의 QR 조회는 별도 흐름이다. `QrSetupModal`은 SDK의 `createQrProfileClient()`로 프로필을 조회하고, 세션 종료 시 요청·스캐너 정리 및 늦은 응답 가드를 사용한다 (`src/components/QrSetupModal.tsx:3-9,61-149`). 이는 Universal layout 요청이나 AI 호출이 아니다. `src/`에서는 별도의 AI/layout-plan 네트워크 호출을 확인하지 못했다.

## 6. 권장 최소 호스트 어댑터

현재 `AccessibilityAdapter` 공개 계약은 snapshot, action/text target, layout region의 **실제 DOM 요소 참조**를 SDK에 제공한다. Universal 모델용 직렬화 스키마나 계획 적용 API는 v0.5.31 공개 export에서 확인되지 않는다 (`node_modules/@naebangsik/kiosk-accessibility-sdk/dist/adapter.d.ts:1-59`, `dist/index.d.ts:1-14`).

향후 공통 엔진 연동 시 별도의 호스트 adapter에서 최소한 다음을 제공하도록 제안한다.

1. `getCurrentScreenId()` — 이미 있는 `civil.main-menu` 등 안정된 업무 화면 ID.
2. `getLayoutModel()` — 호스트에 등록한 영역만 `{id, kind, allowedOperations, constraints}` 형태로 투영. 텍스트와 상태/값은 제외한다. 모델에는 viewport 범주, 프로필이 보장하는 최소 크기·고정 영역 같은 최소 제약만 포함한다.
3. `applyLayoutPlan(plan)` — schema/version, 현재 화면 ID, 구조 hash, 제약 hash, target allowlist, operation allowlist와 값 범위를 로컬 검증한 후 CSS 변수/허용 클래스로만 적용한다.
4. `revalidateLayout()` — 실제 DOM 측정으로 overflow, 겹침, 가림, 고정 action hit-test, 최소 크기를 확인한다. 불합격이면 임시 배치만 롤백한다.
5. 화면·프로필·viewport 변경 시 실행 중 계획을 취소하고 이전 화면용 계획/오버라이드를 폐기한다. 이전 계획을 새 단계에 재사용하지 않는다.

현재 `getActions()`의 명시적 `data-a11y-action-id`는 의미 ID의 참고 자료로 쓸 수 있지만, fallback은 현재 단계와 임의 인덱스를 포함할 수 있어 안정 식별자로 쓰면 안 된다 (`useKioskAccessibility.ts:376-388`). 일부 text target도 query 순서에 따른 `text-N` ID다 (`390-425`). 새 layout ID는 텍스트·배열 인덱스가 아닌 고정된 호스트 의미 ID로 정의해야 한다.

## 7. SDK와 Universal 엔진의 역할 분리

- **기존 SDK v0.5.31:** 접근성 프로필, QR 조회/스캔, 세션 정리, 쉬운 말·Smart Guide·음성 안내, 메뉴/스크롤 안내, layout 진단·보정 및 스크린 변경 처리.
- **향후 Universal layout 엔진:** 비민감 구조 모델에 대해 허용된 배치 작업만 제안하는 별도 공통 기능. 업무 상태와 상호작용 로직은 소유하지 않는다.
- SDK의 `getLayoutRegions()`에 등록된 요소를 Universal 엔진의 무제한 권한으로 간주하지 않는다. SDK 소유 기능과 범용 배치 작업의 target allowlist·정책·진단 결과를 분리한다. SDK 내부 변경은 이 분석의 범위가 아니며 필요하다고 가정하지 않는다.

## 8. 데모커피와의 범용성 비교

두 프로젝트 모두 반복 항목 목록이나 선택 grid에 `setColumns` 같은 제한된 배치 작업을 적용할 가능성이 있다. 데모커피의 반복 메뉴와 무인민원발급기의 증명서 메뉴는 의미·DOM 구조는 다르지만, 안정된 항목 ID와 불변 순서를 가진 반복 카드 컨테이너라는 공통 모델로 표현할 수 있다. 추가 화면별 AI 생성기 없이 공통 엔진이 구조 모델을 받고 제한된 열 수 작업을 반환하는 방향이 가능하다. 다만 실제 공통 schema와 validator는 첨부 초안에 포함되어 있지 않아 호환성은 아직 미검증이다.

## 9. 첫 범용성 검증 화면 권고

가장 작은 검증 대상으로 **첫 화면의 증명서 종류 18개**를 권고한다.

- 모델: `civil.main-menu`의 `.certificate-grid`를 `repeated-card-list`로 등록하고 항목은 명시된 `civil.certificate.01`–`.18` ID만 사용한다.
- 첫 작업: 허용된 열 수 선택만 시험한다. 카드 문구를 모델에 보내지 않고 DOM 순서·18개 수·클릭 연결은 그대로 둔다.
- 로컬 검증: 변경 전/후 18개 버튼 존재, 최소 너비·높이, 텍스트 가림, 스크롤 도달성, 마지막 항목 클릭, footer와의 hit-test를 검사한다.
- 기존 `.certificate-grid`는 이미 3열/2열 breakpoint가 있으므로 새 plan이 현 breakpoint를 무조건 덮어쓰지 않도록 한다. 320–390px, 큰 글씨/큰 버튼/고대비, 하단 viewport 조합은 별도 검증 조건이다.
- Replit Preview의 DEV 모드에서는 프로필 적용 전 접근성 체험 버튼이 메뉴 위에 추가될 수 있다 (`App.tsx:30-46,73-77`; `KioskScreens.tsx:31-45`). 이를 증명서 항목으로 세거나 첫 검증에서 구조가 일정하다고 가정하지 않는다.

## 10. 미확인 사항과 위험

- 첨부 초안에는 Universal v1의 정식 JSON schema, 허용 operation enum, validator 계약, plan 취소 API가 정의되어 있지 않다. 이 문서의 adapter와 operation 제안은 구현 계약이 아니라 설계 제안이다.
- 실제 브라우저에서 각 화면의 computed bounds, 최소 카드 폭, SDK 보정 전/후 결과를 측정하지 않았다. CSS 코드 기준 검토이며 렌더링 결과의 승인으로 해석하면 안 된다.
- SDK adapter가 등록하는 `scrollArea: root`와 모바일 CSS의 `.screen-content { overflow-y:auto }`는 요소가 다르다. 화면별 scroll owner를 확인하지 않은 layout engine이 스크롤 또는 고정 조작을 변경하는 것은 위험하다.
- 수수료·결제·부수 화면의 선택 버튼은 layout상 반복 요소이면서 업무 동작이 직접 연결되어 있다. 선택/완료 상태, 금액, action order를 보존하는 로컬 회귀 검증이 선행되어야 한다.
- Smart Guide target, 고정 footer, 하단 viewport, 큰 글씨는 사용 가능한 공간과 카드 수를 바꾼다. 하나의 프로필에서 적합한 열 수가 다른 프로필에서도 적합하다고 가정할 수 없다.

## 11. 실제 코드 근거

- 화면 상태, 전환·검증·초기화: `src/App.tsx:29-215`
- 실제 화면 렌더링, scroll-content와 footer: `src/App.tsx:217-280`
- 증명서 메뉴·입력·요약·선택 컴포넌트: `src/components/KioskScreens.tsx:9-232`
- 화면·action ID, adapter와 layout region: `src/useKioskAccessibility.ts:13-140,354-473`
- SDK 초기화·resize·화면 변경·프로필/안내 적용: `src/useKioskAccessibility.ts:476-636`
- 기존 layout과 breakpoint: `src/styles.css:2-89`
- QR 프로필 조회와 세션 cleanup/guard: `src/components/QrSetupModal.tsx:1-149`
- SDK 버전과 import: `package.json:11-18`, `src/App.tsx:3-27`
- SDK 공개 adapter 타입: `node_modules/@naebangsik/kiosk-accessibility-sdk/dist/adapter.d.ts:1-59`, `dist/index.d.ts:1-14`
