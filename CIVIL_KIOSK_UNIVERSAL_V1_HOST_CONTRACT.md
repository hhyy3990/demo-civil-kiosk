# 무인민원발급기 — Universal v1 호스트 계약 확인서

## 범위 및 확인 방법

- 현재 로컬 호스트 코드, 프로젝트에 포함된 Universal v1 계약 복사본, Development Mock 구현과 테스트를 확인했다.
- `npm run test:universal-layout`을 실행해 12개 테스트가 모두 통과했다.
- 중앙 API 및 OpenAI에 요청하지 않았다. 이 문서는 중앙 서버의 내부 소스를 검증한 결과가 아니며, 중앙 API 동작에 대한 내용은 요청자가 제공한 설명과 구분한다.
- 앱 코드, SDK, Mock 동작, 설정, DB 및 Production은 변경하지 않았다. 이 파일만 추가했다.

## 1. 실제 호스트 및 화면 식별자

| 항목 | 확인 결과 | 의미 |
|---|---|---|
| 프로젝트 npm 이름 | `civil-document-kiosk-demo` | `package.json`의 앱 패키지명. Universal `hostId`로 등록된 값은 아니다. |
| 실제 Universal `hostId` | **미등록 / 미확정** | 호스트 코드에 Production 또는 실호스트용 Universal `hostId`는 없다. `civil-kiosk-mock`을 실제 호스트 ID로 사용하면 안 된다. |
| 첫 화면 ID | `civil.main-menu` | 접근성 snapshot은 `data-screen` 및 현재 step에서 `civil.${step}` 형태로 만든다. 실제 step은 `main-menu`다. |
| 실제 메뉴 컨테이너 | `.certificate-grid` | 첫 화면 증명서 버튼 18개의 DOM 컨테이너. DOM에는 별도의 `data-universal-component-id`가 없다. |
| 로컬 Mock component ID | `civil.certificate-grid` | Development Mock 요청/정책에 매핑한 의미 ID. 현재 DOM 자체의 독립 Universal 등록 속성은 아니다. |
| 실제 Universal `structureVersion` | **미등록 / 미확정** | 호스트 소스에 실호스트용 값은 없다. |
| Mock `structureVersion` | `civil-main-mock.v1` | 로컬 Development Mock 전용 값. |

`civil.main-menu`는 실제 화면 ID로 확인되지만, `civil-kiosk-mock`, `civil-main-mock.v1`, `civil.certificate-grid`는 현재 구현에서 Mock 정책의 식별자다. 중앙 등록에서 실호스트 ID·버전으로 승격하려면 별도 확정이 필요하다.

### 대상 구조

- `componentId`: `civil.certificate-grid` (Mock semantic ID)
- DOM: `.certificate-grid`
- `kind`: `repeated-card-list`
- `role`: `certificate-choice-list`
- `order`: `0`
- `itemCount`: 정확히 `18`
- 허용 operation: `setColumns`만
- 각 메뉴의 Development action ID: `civil.certificate.01` … `civil.certificate.18`
- item ID는 실제 버튼 텍스트가 아니라 DOM 순서대로 수집한다. ID 속성은 `import.meta.env.DEV`일 때만 렌더링한다.
- 보호 속성: `items`, `order`, `selection`, `issuance-actions`

실제 메뉴 순서:

```text
civil.certificate.01
civil.certificate.02
civil.certificate.03
civil.certificate.04
civil.certificate.05
civil.certificate.06
civil.certificate.07
civil.certificate.08
civil.certificate.09
civil.certificate.10
civil.certificate.11
civil.certificate.12
civil.certificate.13
civil.certificate.14
civil.certificate.15
civil.certificate.16
civil.certificate.17
civil.certificate.18
```

## 2. Universal v1 버전 및 해시 규칙

계약 복사본: `universal-layout/universal-layout-contract.ts`

- `schemaVersion`: `1`
- `contractVersion`: `universal-layout.v1`
- `structureHash`, `constraintHash`, `itemOrderHash`: 소문자 hex SHA-256
- Canonical JSON 규칙:
  - 객체 키는 NFC 정규화 후 사전순 정렬한다.
  - 문자열과 키를 NFC 정규화한다.
  - 배열 순서는 보존한다.
  - `-0`은 `0`으로 처리한다.
  - 숫자는 안전한 정수만 허용한다.
  - 정규화 후 중복되는 객체 키는 거부한다.
  - canonical JSON UTF-8 바이트에 SHA-256을 적용한다.

`itemOrderHash` 생성 입력은 다음 형태다. ID 배열의 순서가 바뀌면 해시도 바뀐다.

```json
{
  "orderedItemIds": [
    "civil.certificate.01",
    "civil.certificate.02",
    "…",
    "civil.certificate.18"
  ]
}
```

`structureHash`에는 다음 값만 들어간다.

```text
hostId, screenId, structureVersion,
order로 정렬한 components의
id, kind, role, order, itemCount, itemOrderHash
```

`constraintHash`에는 다음 값이 들어간다.

```text
contractVersion, viewportClass, accessibility, allowedOperations,
order로 정렬한 components의
id, operations, allowedColumns, minimumTouchTargetPx, protectedProperties
```

따라서 구조 해시는 구조·메뉴 순서 변화에, 제약 해시는 viewport/profile/허용 열·작업 변화에 따라 달라진다. `hostId`, `screenId`, `structureVersion`은 구조 해시에 포함되며 제약 해시의 입력에는 직접 포함되지 않는다.

### 개인정보 없는 golden vector

계약 구현의 고정 SHA-256 벡터:

```json
{
  "input": {"b": 2, "a": "é"},
  "canonicalJson": "{\"a\":\"é\",\"b\":2}",
  "sha256": "06c264c46ad5ada9493abd3aa2383fb205ae99d7d0bad40b03a43bfec8a1b8de"
}
```

실제 메뉴 ID 배열을 사용한 로컬 Mock 벡터. `390×844`, `gridWidth=362`, 표준 접근성, `regular` viewport의 값이다.

```json
{
  "hostId": "civil-kiosk-mock",
  "screenId": "civil.main-menu",
  "structureVersion": "civil-main-mock.v1",
  "componentId": "civil.certificate-grid",
  "itemCount": 18,
  "itemOrderHash": "1f984cacde0e9014a80a73b90f15ea8a2ca3002ee5a1a65b737cd8fe11e9342c",
  "structureHash": "70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b",
  "constraintHash": "d18ee30970e42458e830b1add156184eb862d14c10633a44aa22ab1f41213b2a",
  "allowedColumns": [1, 2],
  "minimumTouchTargetPx": 44
}
```

같은 메뉴 구조를 가진 `390×844`, `textScale=large` 거부 모델:

```json
{
  "viewportClass": "regular",
  "accessibility": {
    "textScale": "large",
    "buttonScale": "standard",
    "contrast": "standard",
    "viewportMode": null
  },
  "allowedColumns": [1],
  "itemOrderHash": "1f984cacde0e9014a80a73b90f15ea8a2ca3002ee5a1a65b737cd8fe11e9342c",
  "structureHash": "70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b",
  "constraintHash": "2cd8c25f2b197832d1b6d9cba75a9e4bd28fdf6742e896bc1ba3a048aff008af",
  "attemptedOperation": {
    "type": "setColumns",
    "targetId": "civil.certificate-grid",
    "columns": 2
  },
  "validationResult": "DISALLOWED_COLUMN_COUNT"
}
```

이 벡터는 호스트 메뉴 ID만 포함하며 사용자 데이터, 개인정보, QR 토큰은 포함하지 않는다. 1080px runtime Mock은 `viewportClass=wide`, `allowedColumns=[1,2]`, `constraintHash=1b771f4cd9c43c7311cd95c27eb316aa96909cda355d13dc7c6cc24940a44463`로 계산됐다.

## 3. Viewport 분류와 접근성별 정책

Runtime Development Mock의 `viewportClass` 분류(`universal-layout/civil-layout-mock.ts`):

1. `width <= 360` **또는** `gridWidth < 320`이면 `compact`
2. 그 외 `width < 760`이면 `regular`
3. 그 외는 `wide`

화면 높이는 요청/모델 입력에는 실리지만 viewportClass를 계산하는 데 사용되지 않는다. 단, `viewportMode`가 null이 아니면 접근성 제약으로 1열만 허용한다.

### 실행용 `civil-layout-mock.ts` 정책

표준 정책의 기본 허용값:

| 너비 예시 | 클래스 조건 | 기본 allowedColumns |
|---:|---|---|
| 320px | `width <= 360` → compact | `[1]` |
| 360px | `width <= 360` → compact | `[1]` |
| 390px | `width > 360`, `gridWidth >= 320`, `width < 760` → regular | `[1, 2]` |
| 1080px | `width >= 760` → wide | `[1, 2]` |

390px에서 `gridWidth < 320`이면 폭 조건만으로 `compact`가 되어 `[1]`이다. 위 표의 390px 결과는 `gridWidth >= 320`일 때다.

다음 설정은 해당 viewport의 기본 허용값을 모두 1열로 제한한다.

| 조건 | Runtime 결과 |
|---|---|
| `textScale=large` 또는 `extraLarge` | `[1]` |
| `buttonScale=large` | `[1]` |
| `contrast=high` | `[1]` |
| `viewportMode={mode:"bottom", heightPercent:60\|70\|80}` | `[1]` |
| `bottomControls=true` | 별도 정책이 선택되어 compact/regular/wide 모두 `[1]` |

`bottomControls`는 현재 공통 계약 accessibility schema 필드가 아니다. local request에서 별도 boolean으로 전달하고 `bottomControls` 정책을 선택해 결과를 제한한다. 모델 accessibility에는 `textScale`, `buttonScale`, `contrast`, `viewportMode`만 들어간다. 중앙 호스트 계약으로 옮길 때는 이 별도 신호를 어떤 공식 입력/정책에 매핑할지 확정해야 한다.

### 현재 CSS의 기본 열 수와 차이

- `src/styles.css`의 `.certificate-grid` 기본은 3열.
- 최대 520px media query에서는 2열.
- `src/universal-layout-mock.css`는 Development plan의 1열 또는 2열만 적용한다.
- 그러므로 CSS 기본 열 수는 AI/Mock `allowedColumns`가 아니다. 1080px에서 CSS는 기본 3열이지만 실행용 Mock은 `[1,2]`만 허용한다.
- 이 계약은 DOM의 실제 터치 크기를 측정하거나 자동 보증하지 않는다. Mock 정책이 선언하는 `minimumTouchTargetPx=44`는 정책 제약이며, 계획 operation도 열 수만 바꾼다.

## 4. 호스트 모델·정책·검증 등록 방식

### 실행용 Mock 모델 생성

`src/useUniversalLayoutMock.ts`는 첫 화면에서 `.certificate-grid` 버튼의 `data-a11y-action-id`를 DOM 순서대로 읽는다. 요청에는 화면/component ID, 요청 열 수, 18개 action ID, `innerWidth`, `innerHeight`, grid 폭, 접근성 profile 변환값을 넣는다. 제목/버튼 문구와 주민등록번호 등의 업무 데이터를 모델 입력으로 보내지 않는다.

이 요청은 중앙의 `/api/dev/universal-layout/plan`이 아니라 **로컬 전용** `/api/dev/universal-layout/mock`으로 전송된다. `vite.config.ts`의 `configureServer()`에만 등록되어 있으며 `configurePreviewServer()`에는 Universal Mock을 등록하지 않았다.

`universal-layout/civil-layout-mock.ts`는 다음을 수행한다.

1. Zod strict request schema로 ID, 요청 열 수, 18개 배열, viewport와 접근성 값을 검증한다.
2. 입력 item ID가 고정된 `civil.certificate.01`–`.18` 순서와 정확히 같은지 검사한다.
3. `bottomControls` 값에 맞춰 `standard` 또는 `bottomControls` 정책을 선택한다.
4. 공통 `createUniversalLayoutModel()`로 모델과 해시를 생성한다.
5. `validateUniversalLayoutModel(model, [policy])`로 선택된 단일 정책에 대해 strict 검증한다.
6. `setColumns` 계획을 만들고 `validateUniversalLayoutPlan(plan, model, [policy])`로 다시 검증한다.
7. 허용되지 않는 열 수는 `DISALLOWED_COLUMN_COUNT`로 거부한다.

공통 계약은 전역 정책 registry를 제공하지 않는다. `validateUniversalLayoutModel(value, policies)`와 `validateUniversalLayoutPlan(value, model, policies)`에 호출자가 정책 배열을 넘기는 방식이다.

단위 테스트(`universal-layout/universal-layout-contract.test.ts`)는 `[demoCoffeePolicy, civilServiceMockPolicy]` 배열을 만들어 명시적으로 validator에 전달한다. 실행용 Endpoint는 현재 선택한 civil Mock 정책 하나를 `[policy]`로 전달한다. 테스트 파일의 정책 배열이 중앙 서버나 Production에 자동 등록되는 것은 아니다.

### Strict 요청·계획 검증

- 모델과 계획의 최상위 필드는 Zod `.strict()`로 미등록 필드를 거부한다.
- component도 strict이며 operation은 `setColumns` 하나만 schema에 허용한다.
- 허용 열 수는 1–6 정수 범위이지만, 구체적 허용값은 host policy의 `allowedColumns`와 일치해야 한다.
- 중복 component ID/order, 중복 operation target, 중복 허용 열, 중복 보호 속성은 거부한다.
- 모델 검증은 등록 정책의 host/screen, structureVersion, component 순서·종류·역할·항목 수 범위·operation·열 수·최소 터치 크기·보호 속성과 해시를 대조한다.
- 계획 검증은 모델을 다시 검증한 뒤 schema/contract/host/screen/structureVersion/hash/viewportClass가 모델과 같은지 확인하고, 대상·작업·열 수를 allowlist로 확인한다.

### React 적용 및 계획 취소

- `src/App.tsx`는 `import.meta.env.DEV`일 때만 실제 Mock hook을 사용한다. Production hook은 no-op이다.
- 검증된 계획의 `setColumns` 값만 `.certificate-grid[data-universal-columns="1|2"]` CSS selector로 반영한다.
- 계획은 `main-menu` 화면에만 활성화된다.
- 화면 step, 접근성 profile, resize, orientation change 시 request sequence를 무효화하고 현재 plan을 지운다. 응답 도착 시 sequence와 현재 context key가 달라졌으면 버린다.
- `columns=null`은 plan을 지워 CSS 원래 상태로 복귀한다.
- 이는 현재 호스트 Mock의 취소 동작이다. 중앙 `/api/dev/universal-layout/plan`의 취소 API나 취소 계약을 확인한 것은 아니다.

## 5. 보호 구조와 금지 작업

이 첫 적용 범위는 첫 화면 증명서 메뉴 18개뿐이다.

- 허용: 대상 grid의 `setColumns`
- 보호: `items`, `order`, `selection`, `issuance-actions`
- 금지: 메뉴 추가/삭제, 순서·라벨·선택 동작·발급 동작 변경, 다른 화면/component 대상, 미등록 operation, 계획 응답의 임의 CSS/selector 또는 DOM 재구성
- 메뉴는 18개 ID와 기존 DOM 순서를 유지해야 한다.
- 번호 입력, 지문 확인, 발급 옵션, 수수료, 부수, 결제 및 인쇄 흐름은 Universal Mock 대상이 아니다.

## 6. 실제 Development Mock 검증 결과

### 이번 조사에서 실행한 테스트

`npm run test:universal-layout`: **12/12 통과, 실패 0**

- canonical JSON 정렬/NFC/배열 순서 규칙과 고정 SHA-256 vector
- DemoCoffee fixture의 1/2열 검증
- civil 18개 항목과 순서 hash 유지
- civil standard regular 및 wide 허용값
- compact 및 grid 폭 부족 시 2열 거부
- 큰 글씨, 큰 버튼, 고대비, 하단 조작, bottom viewport 시 2열 거부
- 다른 화면/component, 잘못된 항목 순서·개수, 등록되지 않은 작업/대상/host 계획 및 모델 변조 거부

### 기존 브라우저 Mock 검증 기록

이 프로젝트의 앞선 headless Chromium Development Mock 검증에서는 다음이 기록돼 있다. 이번 조사에서는 해당 브라우저 세션을 다시 실행하지 않았으며 중앙 API 호출 결과가 아니다.

- 320/360/390/1080px에서 18개 항목과 DOM 순서를 보존했다.
- 320px에서는 2열 요청을 거부하고 1열을 허용했다.
- 표준 390px에서 2열 Mock을 적용했다.
- 390px 큰 글씨·큰 버튼·고대비·하단 조작 활성 상태에서 1열을 적용하고, 2열은 거부했다.
- 1080px에서 실행용 Mock은 1·2열까지만 적용했다.
- Mock은 허용된 열 수 이외의 메뉴/업무 동작 변경을 수행하지 않았다.

## 7. 중앙 fixture와 확인 가능한 차이

첨부된 최신 중앙 fixture 명세에 따르면 중앙 Development 정책은 `hostId=civil-kiosk-mock`, `screenId=civil.main-menu`, `structureVersion=civil-main-mock.v1`, component `civil.certificate-grid`를 사용한다. compact `[1]`, regular `[1,2]`, wide `[1,2]`이며 큰 글씨·큰 버튼·고대비·하단 viewport는 `[1]`로 제한한다. wide의 3열 허용 문제는 중앙에서 수정됐다고 명세에 기재되어 있다. 이 값은 첨부 명세를 근거로 기록했으며, 중앙 API를 호출해 독립 검증하지 않았다.

현재 로컬 소스에서 확인되는 점:

1. 중앙 API 경로와 로컬 Endpoint 경로가 다르다. 로컬 경로는 `/api/dev/universal-layout/mock`이고 네트워크 연결은 없다.
2. 로컬 runtime policy도 동일한 mock 식별자와 standard 열 수 `[1]`, `[1,2]`, `[1,2]`를 사용한다. 이는 실호스트 ID가 확정됐다는 뜻은 아니다.
3. 이 조사에서 공통 계약 테스트 fixture의 wide `[1,2,3]`과 합성 item-order hash를 발견했다. 안전한 실행 정책은 변경하지 않고 테스트 fixture만 수정해 runtime 정책 및 실제 18개 ID 순서 hash에 맞췄다.
4. 로컬 runtime은 공통 모델 accessibility schema에 들어가지 않는 `bottomControls=true` 입력도 별도 정책 선택으로 1열 제한한다. 중앙 명세의 네 가지 접근성 조건과 이 추가 신호의 관계는 중앙 정책 소유자가 확정해야 한다.
5. 현재 CSS 기본은 wide에서 3열이지만 runtime AI/Mock 허용값은 최대 2열이다.

위 표준 fixture 필드의 중앙·로컬 일치는 제공된 중앙 명세와 로컬 소스를 비교한 결과다. 실제 중앙 응답/등록 상태는 확인하지 않았다. 두 곳 모두 사용하는 `civil-kiosk-mock`과 `civil-main-mock.v1`은 명세상 실험용 식별자이므로 실제 호스트 등록 ID로 간주하지 않는다.

## 8. 중앙에 실제 Development 정책 등록 시 필요한 자료

중앙 fixture를 실호스트 정책으로 바꾸기 전에 다음 항목을 중앙 정책 소유자와 합의해야 한다.

1. **정식 host identity**: Production/Development에서 안정적으로 사용할 `hostId`. 현재 `civil-kiosk-mock`과 `civil-main-mock.v1`은 실험용이므로 실호스트 ID/버전으로 사용할지 중앙 registry 규칙에 따라 결정해야 한다.
2. **화면·컴포넌트 identity**: `civil.main-menu`, `civil.certificate-grid`가 정식 ID인지 확인. 실제 DOM에 의미 ID를 명시할지 호스트 매핑에서 유지할지 결정.
3. **구조 버전 및 변경 규칙**: 현재 mock `civil-main-mock.v1`을 실호스트 버전으로 사용하지 말고, 메뉴 구조/ID 의미 변경 시 version을 올리는 기준을 정한다.
4. **항목 목록 계약**: 18개 stable ID의 순서, 항목 수, `itemOrderHash` 생성 입력 및 버전 변경 조건.
5. **열 정책 승인**: compact/regular/wide와 `gridWidth < 320` 분류, wide에서 2열 또는 3열, CSS 기본 3열과의 관계를 확정한다.
6. **접근성 매핑**: text/button scale, contrast, `bottomControls`, 60/70/80 bottom viewport 값을 중앙 schema로 어떻게 전달/정책화하는지 결정한다. 현재 contract schema에는 `bottomControls`가 없다.
7. **안전 제약**: `minimumTouchTargetPx=44`, protected properties, `setColumns` 외 작업 불가 정책.
8. **hash 상호운용성**: 이 문서의 canonical JSON 규칙 및 golden vector를 중앙 구현에서 동일하게 계산하는지 확인한다.
9. **요청·응답과 cancellation 계약**: 중앙 endpoint의 strict schema, 오류 응답, plan stale 처리/취소·viewport 변경 처리 방식을 확인한다.
10. **민감 데이터 제외 확인**: 메뉴 ID와 구조 해시 이외의 버튼 텍스트, 폼 값, 개인정보, QR 토큰을 layout 요청에 포함하지 않는다.

## 9. 미확정 정책 및 위험

- 실제 Universal `hostId`와 `structureVersion`은 미확정이다.
- 중앙 정책의 열 수와 접근성 조건은 최신 첨부 명세에서 확인했으나, 중앙 API 요청·응답으로 독립 재현하지 않았다.
- 로컬 contract test fixture를 runtime 정책과 실제 항목 순서 hash에 맞췄다. 테스트 전용 fixture와 실행용 정책의 기존 불일치는 해소됐다.
- 현재 component ID는 local semantic mapping이다. DOM 요소에 범용 의미 등록 속성이 있다는 뜻은 아니다.
- `minimumTouchTargetPx=44`는 모델 선언과 validator 제약이다. 중앙이 실제 렌더 DOM의 버튼 크기와 클릭 가능 여부를 측정해 보장한다는 의미가 아니다.
- 1080px에서 CSS 기본 3열과 runtime Mock 최대 2열은 서로 다른 정책이다. 중앙이 3열을 허용한다면 큰 화면에서 실제 레이아웃/터치 검증이 필요하다.
- 중앙 endpoint가 제공한다고 알려진 `/api/dev/universal-layout/plan` 호출 및 중앙 fixture 대조는 의도적으로 수행하지 않았다.

## 파일·코드 위치

- 앱 패키지명: `package.json`
- 실제 screen step과 `civil.${step}` snapshot ID: `src/useKioskAccessibility.ts`
- 첫 화면 `.certificate-grid`, Development item ID: `src/components/KioskScreens.tsx`
- local request/context, 적용·취소: `src/useUniversalLayoutMock.ts`
- Development API와 Vite 등록 범위: `vite.config.ts`
- runtime Mock 정책·모델 생성·검증: `universal-layout/civil-layout-mock.ts`
- Universal v1 schema·hash·strict validators: `universal-layout/universal-layout-contract.ts`
- 두 정책의 test registry와 fixture: `universal-layout/universal-layout-contract.test.ts`
- runtime 정책 테스트: `universal-layout/civil-layout-mock.test.ts`
- CSS 기본 열 수: `src/styles.css`
- Development Mock 열 수 override: `src/universal-layout-mock.css`

## 최종 확인

- 실제 호스트 ID: **코드에 등록되지 않음**. `civil-kiosk-mock`은 local fixture ID.
- 실제 screen ID: `civil.main-menu`
- DOM component: `.certificate-grid`; local Mock semantic ID는 `civil.certificate-grid`
- 접근성별 runtime 허용 열: compact `[1]`; regular/wide 기본 `[1,2]`; 큰 글씨·큰 버튼·고대비·bottom viewport·bottomControls 적용 시 `[1]`
- 중앙 fixture와 로컬 runtime의 표준 열 정책: compact `[1]`, regular `[1,2]`, wide `[1,2]`; 접근성 제약은 `[1]` (첨부 명세 기반, API 미호출)
- Golden Vector: `CIVIL_KIOSK_UNIVERSAL_V1_GOLDEN_VECTORS.md`
- AI/API 호출: **0회** (중앙 API 및 OpenAI 모두 호출하지 않음)
- Production 변경/배포: **없음**
