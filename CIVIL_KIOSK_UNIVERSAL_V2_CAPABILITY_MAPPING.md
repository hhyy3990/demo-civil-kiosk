# 무인민원발급기 — Universal v2 capability 호스트 적용 가능성

## 범위 및 결론

- 확인 대상은 설치된 `@naebangsik/kiosk-accessibility-sdk@0.5.31`과 현재 호스트 구현이다.
- 앱 코드, SDK, QR 프로필 흐름, Universal v1 Mock, API, DB, CSS, footer는 변경하지 않았다.
- 중앙 API/OpenAI 호출은 하지 않았다. 현재 프로젝트와 SDK 검색에서 `layoutCapabilities`, `reserved-bottom-controls`, Universal v2 schema/validator를 찾지 못했다.
- **프로필의 `bottomControls` 상태를 React 및 SDK 양쪽에서 읽는 것은 가능하다.** 다만 실제 QR schemaVersion 3–5의 프로필은 `bottomControls`를 받지 않고 SDK가 `false`로 정규화한다.
- 하단 조작 capability의 의미가 “접근성 설정이 켜짐”인지 “현재 실제 화면에 예약된 고정 조작부 공간이 있음”인지 중앙 v2 정의가 필요하다. 이 둘은 현재 호스트의 모바일 CSS에서 항상 일치하지 않는다.
- 따라서 현재는 의미 매핑 가능성만 확인했으며 v2 wire 호환이나 실제 v2 capability model 생성은 확인·구현하지 않았다.

## 1. 실제 하단 조작 필드와 상태 경로

### 필드와 기본값

설치된 SDK 공개 타입 `node_modules/@naebangsik/kiosk-accessibility-sdk/dist/profile.d.ts`에서:

```ts
bottomControls: boolean;
```

SDK의 필드 주석은 기존 QR 프로필의 호환 필드이며 legacy v1/v2 preference라고 명시한다. `DEFAULT_ACCESSIBILITY_PROFILE.bottomControls`는 `false`이고, SDK `validateAccessibilityProfile()`은 입력이 정확히 `true`일 때만 `true`로 정규화한다. 누락되거나 false면 false다.

### QR 조회에서 React까지

실제 흐름:

1. `src/components/QrSetupModal.tsx`에서 `createQrProfileClient().resolve(value, inputKind)`를 호출한다.
2. SDK QR client는 `/api/qr-profile`에 요청하고, 반환된 중앙 profile을 SDK `profileFromCentralResponse()`와 `validateAccessibilityProfile()`로 검증·정규화한다.
3. 모달은 세션 가드와 mounted 상태를 확인한 뒤 `onApplyProfileRef.current(profile)`을 호출한다.
4. `src/App.tsx`의 `applyAccessibilityProfile()`은 `setAccessibilityProfile(profile)` 및 `setAccessibilityProfileApplied(true)`를 실행한다. 이 함수에서 SDK를 직접 호출하지는 않는다.
5. React state 변경으로 다시 렌더된 뒤 `src/useKioskAccessibility.ts`의 effect가 `sdk.applyProfile(profile)`을 실행한다.
6. SDK가 `sdk.profile` getter로 현재 적용 profile의 복사본을 제공한다.

관련 위치:

- QR profile resolve/guard/apply: `src/components/QrSetupModal.tsx:134-149`
- React profile state 및 callback: `src/App.tsx:87-90,209-219`
- SDK effect: `src/useKioskAccessibility.ts:583-594`
- SDK 공개 `profile` / `applyProfile`: `node_modules/@naebangsik/kiosk-accessibility-sdk/dist/accessibility-sdk.d.ts:27-34`

### QR schemaVersion별 bottomControls 동작

SDK v0.5.31의 설치된 `dist/qr-profile.js` 기준:

- `schemaVersion` 1 또는 2: `preferences.bottomControls`가 boolean이어야 한다. 반환 profile에 그 값이 전달되고 `viewportMode`는 `null`로 정규화된다.
- `schemaVersion` 3, 4, 5: preference 안에 `bottomControls` 필드가 있으면 응답을 거부한다. 정상 응답은 `bottomControls: false`로 SDK profile을 만든다. 이 버전들은 별도 `viewportMode`를 사용한다.
- 따라서 현재 SDK는 타입에 legacy 필드를 보유하지만, schemaVersion 3–5 QR preference로 `bottomControls=true`를 적용하지 않는다. schemaVersion 1–2 응답에서만 QR를 통한 true 적용 경로가 있다.
- 중앙이 현재 어떤 schemaVersion을 발급하는지는 이 작업에서 API를 호출하지 않아 확인하지 않았다.

SDK는 `applyProfile()` 내부에서 입력을 다시 검증하고 현재 profile을 갱신한다. `bottomControls=true`이면 root에 `a11y-bottom-controls` 클래스를 적용하고 layout correction을 실행한다. 적용된 viewport mode는 명시 `profile.viewportMode`가 우선이며, 그것이 없고 `easyLanguage=true`이면 SDK가 bottom 80% mode를 선택한다.

## 2. Footer DOM과 프로필의 관계

현재 footer는 profile에 따라 생성/삭제되지 않는다. `src/App.tsx:305-313`에서 항상 렌더링되는 `<footer className="device-footer" data-a11y-slot="bottom-controls">`이며, 내부에 `처음화면`, `전화면`, 일부 단계의 `확인` 버튼이 있다.

`src/useKioskAccessibility.ts:441-456`의 `getLayoutRegions()`는 profile과 무관하게 이 요소를 `bottomControls` DOM region으로 SDK에 등록한다.

현재 고정 상태:

- 호스트 `src/styles.css:74`: 520px 이하에서 `.device-footer`는 profile과 무관하게 `position:fixed; bottom:0`이다.
- SDK stylesheet: `.kiosk.a11y-bottom-controls [data-a11y-slot="bottom-controls"]`에 fixed position과 하단 스타일을 적용하고 `.screen-content`에 reserved padding을 준다.
- 따라서 **등록된 bottomControls DOM region 존재**는 profile이 켜졌는지와 같지 않다. mobile에서는 profile이 false여도 호스트 CSS가 footer를 fixed로 만든다.
- desktop에서는 기본 호스트 footer가 flow 안에 있다. SDK `a11y-bottom-controls` profile class가 활성화되면 SDK stylesheet가 bottom slot을 fixed로 바꾼다.
- SDK bottom viewport controller는 등록된 bottomControls 요소가 실제로 `fixed` 또는 `sticky`인지, 표시되고 크기가 있는지 측정해 하단 inset을 계산한다. 이는 profile boolean 자체와는 별도의 DOM 측정이다.

따라서 `reserved-bottom-controls` capability의 정의가 “사용자 접근성 profile의 ON”인지, “현재 layout에 실제로 예약 공간이 필요한 고정 조작부가 존재”인지 먼저 고정해야 한다. profile boolean만으로 물리적 footer의 현재 위치를 완전히 설명하지 못한다.

## 3. v2 capability 의미 매핑

### 의미상 가능한 입력

호스트는 다음 두 종류의 실제 정보를 갖는다.

1. **설정 의도:** React `accessibilityProfile.bottomControls` 및 SDK `sdk.profile.bottomControls`.
2. **현재 화면의 조작 영역:** 연결된 `[data-a11y-slot="bottom-controls"]` DOM 요소, 등록 목록 `getLayoutRegions().bottomControls`, computed position/rect/visibility.

중앙 v2가 `reserved-bottom-controls`를 “profile의 bottomControls 옵션이 ON인 상태”라고 정의한다면, 검증된 current profile의 boolean을 capability on/off로 매핑할 수 있다.

중앙 v2가 “계획이 피해야 하는 고정 하단 점유영역이 있다”는 뜻으로 정의한다면, profile 값만으로는 부족하다. visible/connected DOM 요소와 실제 computed position, viewport 기준 경계를 확인해야 한다. 특히 520px 이하의 호스트 CSS에서는 profile OFF여도 footer가 fixed다.

### 생성·제거 조건 제안

v2 적용을 시작하기 전에 중앙과 아래 의미 계약을 확정한다.

- 설정 기반 capability라면: **현재 적용이 완료된 validated profile**에서 `bottomControls === true`일 때 추가하고, false/기본 profile이면 제거한다.
- 공간 기반 capability라면: SDK adapter에 등록된 하단 controls 중 실제 표시되고 viewport에 고정된 조작부가 있을 때 추가한다. 단순히 element가 DOM에 존재하는지만으로 판단하지 않는다.
- profile 기반과 공간 기반을 혼합하지 않는다. 한 capability를 두 신호가 서로 다른 시점/값으로 만들면 해시와 plan 적용이 흔들린다.
- 프로필 변경 시 새 profile이 React와 SDK 양쪽에 적용된 뒤 capability를 구성하고, 이전 capability를 사용한 plan을 재사용하지 않는다.

현재 소스에는 v2 `layoutCapabilities` 필드, capability schema, serializer 또는 capability hash 구현이 없다. 위 내용은 의미 매핑 제안이지 wire 형식 확정이 아니다.

## 4. viewportMode 및 다른 접근성 설정

- `bottomControls`와 `viewportMode`는 SDK profile에서 서로 다른 필드다.
- `viewportMode`는 `{ mode: "bottom", heightPercent: 60 | 70 | 80 }` 또는 `null`이다. 이는 콘텐츠가 사용할 viewport 높이 설정이며, 하단 controls profile boolean과 동의어가 아니다.
- 명시 `viewportMode`와 `bottomControls=true`가 공존할 수 있는 profile 상태가 가능하다(legacy QR profile은 viewportMode를 null로 정규화하지만 SDK profile API 자체는 두 필드를 별도로 가진다).
- `easyLanguage=true`이고 명시 viewportMode가 null이면 SDK가 bottom 80%를 선택할 수 있다. 이는 `reserved-bottom-controls` capability가 자동 on이어야 한다는 뜻은 아니다.
- 큰 글씨, 큰 버튼, 고대비는 SDK profile의 별도 속성이다. v2 policy가 이들을 각각 제약에 반영해야 하며 `reserved-bottom-controls` 하나로 대체하면 안 된다.
- capability와 profile constraint가 함께 바뀌면 새 모델의 constraint hash에 둘 다 반영되어야 한다. 단, v2 hash가 capability 목록/순서를 어떤 형식으로 포함하는지는 중앙 v2 계약을 확인해야 한다.
- capability 목록은 canonical hash에서 안정적으로 직렬화돼야 한다. 정렬·중복·기본값 표현 등 canonicalization 계약이 없다면 host와 central이 같은 상태에서 다른 hash를 계산할 수 있다.

## 5. 프로필·화면 변경과 기존 plan 취소 제안

현재 로컬 Universal v1 Development Mock은 context key에 step, viewport/grid 폭, text/button/contrast, `bottomControls`, `viewportMode`를 넣고 React effect에서 step/profile 변경 시 sequence를 무효화한다. 이 훅은 SDK `sessionGeneration`에 직접 연결된 v2 cancellation mechanism은 아니다.

| 시나리오 | 상태 변화 | v2 계획에 필요한 동작 |
|---|---|---|
| 기본 profile → bottomControls ON | 새 capability 추가(설정 기반 정의일 때). SDK profile class/layout 적용 | 이전 plan 즉시 무효화. SDK 적용 완료된 profile/DOM 기준으로 새 model과 hash 생성 후 다시 요청 |
| ON → OFF | 설정 기반 capability 제거. mobile에서 footer는 여전히 fixed일 수 있음 | 이전 plan을 capability 제거 전에 취소. 실제 fixed-area 의미라면 DOM 점유 상태를 재측정하고 capability가 유지되는지 재판정 |
| ON + 큰 글씨 | capability와 `textSize` 제약 동시 반영 | profile/context change로 기존 plan 취소, 두 조건을 모두 포함한 새 hash로 재검증 |
| ON + bottom viewport | bottom capability와 명시 viewport mode는 별개 | 둘 다 모델에 반영. 큰 viewport mode가 capability를 대체한다고 추론하지 않음. 이전 plan 취소 후 재검증 |
| 화면 전환 | 대상 화면 `civil.main-menu`가 빠짐 | 메뉴 plan 즉시 취소하고 다른 step에 재사용 금지. main menu로 돌아오면 현재 profile/DOM으로 새 계획 생성 |
| QR profile 변경 | resolve된 새 profile이 기존 값을 대체 | 기존 plan과 pending request를 취소. session guard를 통과한 새 profile이 적용된 뒤 capability·hash를 새로 생성 |
| 세션 초기화 | React profile은 default로 되돌고 SDK `endSession()` 실행 | 이전 plan을 즉시 취소하고 pending 응답을 거부. 기본 profile 적용 후 capability를 제거(또는 공간 기반이면 실제 footer 점유 여부를 재판정) |

권장 구현 전제:

- context identity에 최소 `screenId`, structure identity, viewport class, accessibility profile, capability set, `structureHash`, `constraintHash`를 포함한다.
- capability를 바꾸는 이벤트는 진행 중 plan을 취소하고 요청 generation을 증가시킨다.
- plan 응답을 적용 직전에 현재 context/hash와 다시 비교한다.
- profile state만 바뀌고 SDK/DOM 적용이 아직 끝나지 않은 구간에는 새 계획을 요청하지 않는다.
- 세션 초기화에서는 SDK session guard와 layout request generation guard를 함께 사용한다. 현재 v1 Mock의 effect 기반 취소만으로 v2 구현의 동기 취소 보장을 주장하지 않는다.

## 6. 개인정보와 업무 보호 경계

- capability 산출에는 `bottomControls` boolean과 등록된 footer의 layout 상태만 필요하다.
- 주민등록번호, 입력값, 신청 옵션, 신청 내용, 결제 정보, 발급 결과, QR token, 화면 전체 DOM/문구를 사용하지 않는다.
- footer의 업무 버튼 ID/동작을 capability 설명에 직렬화하지 않는다. 필요한 것은 예약영역의 의미와 최소 배치 제약뿐이다.
- 허용 target은 첫 화면 `.certificate-grid`에 한정된 기존 Universal v1 범위와 분리한다. `reserved-bottom-controls`는 하단 영역을 설명하는 제약이지 footer DOM을 이동·삭제·축소하는 권한이 아니다.
- 앱 업무 로직, QR 저장·조회, SDK, CSS는 이번 분석에서 수정하지 않았다.

## 7. 중앙 v2와 일치 확인이 필요한 사항

중앙 v2 순수 프로토타입의 정확한 schema가 이 프로젝트/설치 SDK에는 없다. wire 호환을 주장하려면 중앙 계약 원본을 받아 다음을 대조해야 한다.

1. `layoutCapabilities`의 정확한 JSON schema와 version 필드.
2. `reserved-bottom-controls`가 profile intent인지, 현재 물리적 reserved region인지에 대한 규범적 정의.
3. capability의 scope(호스트 전체/화면/component), value/parameter, 필수 여부, 기본값 및 삭제 표현.
4. capability 배열 정렬·중복 처리 및 `constraintHash` 포함 방식.
5. `bottomControls`가 없는 QR schemaVersion 3–5의 의미와 v2 capability를 만들 근거가 별도로 있는지.
6. `viewportMode`, easy-language 자동 80% mode와 capability의 독립/상호작용 규칙.
7. 화면 구조 변경·profile 변경·session reset에 대한 plan cancel/stale response 규칙.
8. strict request/plan validator의 거부 코드와 compatibility/version negotiation.
9. 중앙 golden vector 및 canonical hash input.

중앙 API는 호출하지 않았으므로 중앙 prototype과 실제 요청·응답 호환성은 미검증이다.

## 8. 미확정 사항 및 위험

- 현재 중앙 QR가 주로 schemaVersion 5를 발급하는지 확인하지 않았다. 해당 버전은 SDK에서 QR `bottomControls`를 false로 고정한다.
- schemaVersion 1–2에서 true를 읽을 수 있다는 사실만으로 그 값이 중앙의 현재 사용 방식 또는 v2 capability 의미와 일치한다고 단정할 수 없다.
- 호스트 모바일 CSS는 profile OFF여도 footer를 fixed로 유지한다. capability가 물리적 공간을 나타내면 단순 boolean 매핑은 false negative를 만들 수 있다.
- SDK의 `getLayoutRegions().bottomControls`는 항상 footer DOM을 등록한다. 이것만으로 현재 fixed/공간 예약 상태라고 판정하면 안 된다.
- SDK는 viewport/layout correction을 실행할 수 있으므로 profile state와 최종 DOM position 사이에 적용 시점 차이가 있을 수 있다.
- 현재 `applyProfile()` effect는 `profile`뿐 아니라 `step` 변경에도 실행된다. screen transition 시 동일 profile을 다시 적용할 수 있으므로 화면 전환이 capability 변경과 같은 이벤트라고 가정하면 안 된다.
- 현재 v1 Mock 취소 guard는 React context/sequence 기반이며 SDK session generation과 공유되지 않는다. v2 구현에서는 session reset 경계의 stale plan 차단을 별도로 설계해야 한다.
- v2 schema가 없어서 capability hash, plan cancellation wire format, 중앙 validator 동작을 확정할 수 없다.

## 9. v2 Mock 적용 전 필수 검증

1. 중앙 v2 schema/validator 원본과 golden vector를 확보하고 로컬 테스트에서 재계산한다.
2. schemaVersion 1/2 및 3/4/5 profile을 fixture로 구성해 `bottomControls` 입력·정규화 결과를 검증한다. 실제 QR/API는 사용하지 않는다.
3. React profile 값과 `sdk.profile` 값이 profile 적용 완료 시 일치하는지 확인한다.
4. 390px 및 desktop 너비에서 `bottomControls` ON/OFF 각각 footer의 computed `position`, rect, visibility와 scroll reservation을 측정한다.
5. capability 정의를 profile 기반 또는 실제 공간 기반 중 하나로 선택하고, mobile CSS 예외까지 테스트한다.
6. bottomControls, 큰 글씨/버튼, 고대비, viewportMode, easyLanguage 조합별 capability와 constraint hash golden vector를 고정한다.
7. capability ON→OFF와 OFF→ON 중 이전 plan/pending 응답이 적용되지 않는지 확인한다.
8. 화면 이탈·QR profile 교체·세션 초기화 중 cancel, generation guard, SDK `endSession()`을 테스트한다.
9. 18개 메뉴의 ID/순서, 클릭, 기존 CSS, footer 위치·기능, 주민등록등본 업무 흐름이 유지되는지 회귀 테스트한다.
10. API 호출 없이 테스트하고, 실제 중앙 연동 또는 배포는 별도 승인 전까지 수행하지 않는다.

## 코드 근거 위치

- SDK 설치 버전/타입: `node_modules/@naebangsik/kiosk-accessibility-sdk/dist/profile.d.ts`, `accessibility-sdk.d.ts`
- SDK QR version parse와 bottomControls 변환: `node_modules/@naebangsik/kiosk-accessibility-sdk/dist/qr-profile.js:35-115`
- SDK profile validation/default: `node_modules/@naebangsik/kiosk-accessibility-sdk/dist/profile.js:4-54`
- SDK profile 적용, viewport mode, screen change, session reset: `node_modules/@naebangsik/kiosk-accessibility-sdk/dist/accessibility-sdk.js:1191-1220,1329-1357,1371-1416`
- 실제 React profile state/apply callback: `src/App.tsx:87-90,209-219`
- SDK profile effect와 layout region 등록: `src/useKioskAccessibility.ts:441-456,583-594`
- footer DOM: `src/App.tsx:305-313`
- 호스트 mobile footer CSS: `src/styles.css:74`
- SDK bottom-controls style: `node_modules/@naebangsik/kiosk-accessibility-sdk/dist/styles.css:313-328`
- 기존 local v1 context invalidation (비교 자료): `src/useUniversalLayoutMock.ts:22-38,77-104,157-158`

## 최종 확인

- SDK: `@naebangsik/kiosk-accessibility-sdk@0.5.31`
- 프로필 field: `bottomControls: boolean`; default false; SDK 타입상 legacy QR preference
- React/SDK에서 현재 상태 읽기: 가능. QR schemaVersion 1/2에서만 QR true 입력 경로가 있고, 3–5는 SDK가 false로 정규화
- footer 등록: `[data-a11y-slot="bottom-controls"]` 요소를 `getLayoutRegions().bottomControls`로 항상 등록
- capability 의미 매핑: **의미 합의가 선행되면 가능**, wire 형식/해시 호환은 미확인
- 코드 변경: 없음. 이 분석 문서만 작성
- 실제 API/OpenAI 호출: 0회
- Production/SDK/DB/QR/Secrets 변경 및 배포: 없음
