# 무인민원발급기 — Universal v1 Development Golden Vectors

## 범위와 출처

- 모델·해시는 프로젝트의 로컬 Universal v1 계약 코드와 실행용 Development Mock에서 생성했다. 중앙 API와 OpenAI는 호출하지 않았다.
- viewport grid 폭(320px 화면에서 292px, 360px에서 332px, 390px에서 362px, 1080px에서 470px)은 앞서 이 프로젝트에서 수행한 headless Chromium 측정 기록을 사용했다. 이번에는 브라우저를 다시 측정하지 않고 그 값으로 순수 로컬 모델 계산을 했다.
- 중앙 정책 값은 이번에 첨부된 `Pasted--Universal-v1-Golden-Vector-Replit--1792863737067_1792863737067.txt`의 선언을 출처로 삼았다. 실제 중앙 endpoint의 등록·응답을 독립 확인한 것은 아니다.
- 이 문서는 호스트 메뉴 ID만 포함한다. 증명서 라벨, 실제 주민등록번호, 사용자 입력값, QR 토큰은 포함하지 않는다.
- 모델 생성 코드는 `universal-layout/civil-layout-mock.ts`; 공통 계약 및 hash 구현은 `universal-layout/universal-layout-contract.ts`다.

## 1. 식별자와 공통 계약

| 필드 | 값 | 상태 |
|---|---|---|
| `schemaVersion` | `1` | 계약 상수 |
| `contractVersion` | `universal-layout.v1` | 계약 상수 |
| `hostId` | `civil-kiosk-mock` | Development Mock/중앙 fixture의 실험용 ID. 실제 서비스 host ID로 확정된 것은 아님 |
| `screenId` | `civil.main-menu` | 실제 첫 화면 |
| `structureVersion` | `civil-main-mock.v1` | Development fixture 버전. 실호스트 버전으로 확정된 것은 아님 |
| component ID | `civil.certificate-grid` | Mock semantic ID |
| 실제 DOM 컨테이너 | `.certificate-grid` | 현재 화면 요소 |
| `kind` / `role` | `repeated-card-list` / `certificate-choice-list` | 대상 component 의미 |
| `order` / `itemCount` | `0` / `18` | 메뉴 구조 |
| 허용 operation | `setColumns` | 열 수만 변경 |
| `minimumTouchTargetPx` | `44` | 정책 선언·validator 제약 |
| 보호 속성 | `items`, `order`, `selection`, `issuance-actions` | plan에서 변경 불가 |

실제 DOM 메뉴 버튼은 Development에서만 `civil.certificate.01`–`civil.certificate.18` action ID를 갖는다. 이 고정 순서 전체를 `itemOrderHash`에 반영한다. 모델에는 항목 ID 목록 자체가 아니라 개수와 hash만 포함한다.

## 2. 정규화와 SHA-256 계산

공통 구현(`canonicalUniversalJson`, `universalSha256`) 규칙:

- 객체 키를 NFC 정규화한 뒤 사전순으로 정렬한다.
- 문자열과 키는 NFC 정규화한다.
- 배열 순서는 보존한다.
- `-0`은 `0`으로 정규화한다.
- 안전한 정수만 허용한다.
- canonical JSON을 UTF-8로 인코딩하고 SHA-256을 lowercase hex로 출력한다.

### 메뉴 순서 hash 입력

실제 18개 안정 ID를 넣은 canonical JSON은 다음과 같다.

```json
{"orderedItemIds":["civil.certificate.01","civil.certificate.02","civil.certificate.03","civil.certificate.04","civil.certificate.05","civil.certificate.06","civil.certificate.07","civil.certificate.08","civil.certificate.09","civil.certificate.10","civil.certificate.11","civil.certificate.12","civil.certificate.13","civil.certificate.14","civil.certificate.15","civil.certificate.16","civil.certificate.17","civil.certificate.18"]}
```

```text
itemOrderHash = 1f984cacde0e9014a80a73b90f15ea8a2ca3002ee5a1a65b737cd8fe11e9342c
```

배열 순서를 바꾸면 hash가 달라진다.

### structureHash 입력

이 구조 hash 입력은 아래 아홉 조건에서 모두 같다. viewport/profile이 구조 hash 입력에 포함되지 않으므로 구조가 유지되는 한 hash도 유지된다.

```json
{"components":[{"id":"civil.certificate-grid","itemCount":18,"itemOrderHash":"1f984cacde0e9014a80a73b90f15ea8a2ca3002ee5a1a65b737cd8fe11e9342c","kind":"repeated-card-list","order":0,"role":"certificate-choice-list"}],"hostId":"civil-kiosk-mock","screenId":"civil.main-menu","structureVersion":"civil-main-mock.v1"}
```

```text
structureHash = 70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b
```

### constraintHash 입력

canonical 입력은 계약 구현이 hash에 넘기는 전체 객체다. 아래는 각 vector의 정규화된 JSON 원문과 기대 hash다.

**320px 및 360px 표준 프로필** — 두 조건 모두 `compact`라 입력/hash가 같다.

```json
{"accessibility":{"buttonScale":"standard","contrast":"standard","textScale":"standard","viewportMode":null},"allowedOperations":["setColumns"],"components":[{"allowedColumns":[1],"id":"civil.certificate-grid","minimumTouchTargetPx":44,"operations":["setColumns"],"protectedProperties":["items","order","selection","issuance-actions"]}],"contractVersion":"universal-layout.v1","viewportClass":"compact"}
```

```text
constraintHash = adb813aa6fb8276e2dfe63188e7a169e5d38395eac11c8312e43aad5496ef1d5
```

**390px 표준 프로필**

```json
{"accessibility":{"buttonScale":"standard","contrast":"standard","textScale":"standard","viewportMode":null},"allowedOperations":["setColumns"],"components":[{"allowedColumns":[1,2],"id":"civil.certificate-grid","minimumTouchTargetPx":44,"operations":["setColumns"],"protectedProperties":["items","order","selection","issuance-actions"]}],"contractVersion":"universal-layout.v1","viewportClass":"regular"}
```

```text
constraintHash = d18ee30970e42458e830b1add156184eb862d14c10633a44aa22ab1f41213b2a
```

**1080px 표준 프로필**

```json
{"accessibility":{"buttonScale":"standard","contrast":"standard","textScale":"standard","viewportMode":null},"allowedOperations":["setColumns"],"components":[{"allowedColumns":[1,2],"id":"civil.certificate-grid","minimumTouchTargetPx":44,"operations":["setColumns"],"protectedProperties":["items","order","selection","issuance-actions"]}],"contractVersion":"universal-layout.v1","viewportClass":"wide"}
```

```text
constraintHash = 1b771f4cd9c43c7311cd95c27eb316aa96909cda355d13dc7c6cc24940a44463
```

**390px 큰 글씨**

```json
{"accessibility":{"buttonScale":"standard","contrast":"standard","textScale":"large","viewportMode":null},"allowedOperations":["setColumns"],"components":[{"allowedColumns":[1],"id":"civil.certificate-grid","minimumTouchTargetPx":44,"operations":["setColumns"],"protectedProperties":["items","order","selection","issuance-actions"]}],"contractVersion":"universal-layout.v1","viewportClass":"regular"}
```

```text
constraintHash = 2cd8c25f2b197832d1b6d9cba75a9e4bd28fdf6742e896bc1ba3a048aff008af
```

**390px 큰 버튼**

```json
{"accessibility":{"buttonScale":"large","contrast":"standard","textScale":"standard","viewportMode":null},"allowedOperations":["setColumns"],"components":[{"allowedColumns":[1],"id":"civil.certificate-grid","minimumTouchTargetPx":44,"operations":["setColumns"],"protectedProperties":["items","order","selection","issuance-actions"]}],"contractVersion":"universal-layout.v1","viewportClass":"regular"}
```

```text
constraintHash = 32b8db345f531bbf63728d7270d70133b35a079a8067d92d2a12f28500d500bc
```

**390px 고대비**

```json
{"accessibility":{"buttonScale":"standard","contrast":"high","textScale":"standard","viewportMode":null},"allowedOperations":["setColumns"],"components":[{"allowedColumns":[1],"id":"civil.certificate-grid","minimumTouchTargetPx":44,"operations":["setColumns"],"protectedProperties":["items","order","selection","issuance-actions"]}],"contractVersion":"universal-layout.v1","viewportClass":"regular"}
```

```text
constraintHash = 1fbc74335278dc9bdeaded6b953b2802f641301c3a8fab1d9a236f0bb60921c2
```

**390px 하단 viewport 80%**

```json
{"accessibility":{"buttonScale":"standard","contrast":"standard","textScale":"standard","viewportMode":{"heightPercent":80,"mode":"bottom"}},"allowedOperations":["setColumns"],"components":[{"allowedColumns":[1],"id":"civil.certificate-grid","minimumTouchTargetPx":44,"operations":["setColumns"],"protectedProperties":["items","order","selection","issuance-actions"]}],"contractVersion":"universal-layout.v1","viewportClass":"regular"}
```

```text
constraintHash = abce520b55c6e47350afe6317646109afef0fba7a400c1eb12de17ff15e7fc54
```

**390px 하단 조작**

현재 공통 모델 schema에는 `bottomControls` 필드가 없다. 실행용 Mock은 별도 `bottomControls=true` 요청으로 전용 policy를 선택하고 `allowedColumns=[1]`로 만든다. 따라서 아래 canonical model input에는 별도 boolean은 없고, 최종 허용값이 반영된다.

```json
{"accessibility":{"buttonScale":"standard","contrast":"standard","textScale":"standard","viewportMode":null},"allowedOperations":["setColumns"],"components":[{"allowedColumns":[1],"id":"civil.certificate-grid","minimumTouchTargetPx":44,"operations":["setColumns"],"protectedProperties":["items","order","selection","issuance-actions"]}],"contractVersion":"universal-layout.v1","viewportClass":"regular"}
```

```text
constraintHash = cbe6a636f748e176e38529d5211f262b307fa1de3351a54efdea91974d634ef1
```

## 3. 조건별 호스트 모델 Golden Vector

측정 grid 폭을 포함한 Mock 생성 요청은 다음 조건이다. 요청 열 수는 모델 hash와 별개이므로 모든 모델 계산에서 허용되는 `columns=1`을 사용했다.

| 조건 | 입력 viewport (`width×height`, gridWidth) | viewportClass | 접근성 요약 | allowedColumns | `structureHash` | `constraintHash` |
|---|---|---|---|---|---|---|
| 320px 표준 | `320×844`, `292` | `compact` | standard / standard / standard / null | `[1]` | `70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b` | `adb813aa6fb8276e2dfe63188e7a169e5d38395eac11c8312e43aad5496ef1d5` |
| 360px 표준 | `360×844`, `332` | `compact` | standard / standard / standard / null | `[1]` | `70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b` | `adb813aa6fb8276e2dfe63188e7a169e5d38395eac11c8312e43aad5496ef1d5` |
| 390px 표준 | `390×844`, `362` | `regular` | standard / standard / standard / null | `[1,2]` | `70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b` | `d18ee30970e42458e830b1add156184eb862d14c10633a44aa22ab1f41213b2a` |
| 1080px 표준 | `1080×1920`, `470` | `wide` | standard / standard / standard / null | `[1,2]` | `70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b` | `1b771f4cd9c43c7311cd95c27eb316aa96909cda355d13dc7c6cc24940a44463` |
| 390px 큰 글씨 | `390×844`, `362` | `regular` | large / standard / standard / null | `[1]` | `70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b` | `2cd8c25f2b197832d1b6d9cba75a9e4bd28fdf6742e896bc1ba3a048aff008af` |
| 390px 큰 버튼 | `390×844`, `362` | `regular` | standard / large / standard / null | `[1]` | `70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b` | `32b8db345f531bbf63728d7270d70133b35a079a8067d92d2a12f28500d500bc` |
| 390px 고대비 | `390×844`, `362` | `regular` | standard / standard / high / null | `[1]` | `70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b` | `1fbc74335278dc9bdeaded6b953b2802f641301c3a8fab1d9a236f0bb60921c2` |
| 390px 하단 viewport | `390×844`, `362` | `regular` | standard / standard / standard / bottom 80% | `[1]` | `70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b` | `abce520b55c6e47350afe6317646109afef0fba7a400c1eb12de17ff15e7fc54` |
| 390px 하단 조작 | `390×844`, `362` | `regular` | standard / standard / standard / null; 별도 bottomControls=true | `[1]` | `70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b` | `cbe6a636f748e176e38529d5211f262b307fa1de3351a54efdea91974d634ef1` |

접근성 요약 순서는 `textScale / buttonScale / contrast / viewportMode`다. `structureHash`가 아홉 vector에서 동일하고 `constraintHash`가 viewport/profile 차이에 따라 달라지는 것을 테스트로 고정했다.

## 4. 정상·거부 계획

### 정상: 390px 표준 프로필에서 2열

```json
{
  "schemaVersion": 1,
  "contractVersion": "universal-layout.v1",
  "hostId": "civil-kiosk-mock",
  "screenId": "civil.main-menu",
  "structureVersion": "civil-main-mock.v1",
  "structureHash": "70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b",
  "constraintHash": "d18ee30970e42458e830b1add156184eb862d14c10633a44aa22ab1f41213b2a",
  "viewportClass": "regular",
  "operations": [
    {
      "type": "setColumns",
      "targetId": "civil.certificate-grid",
      "columns": 2
    }
  ]
}
```

결과: 통과. 모델은 18개 메뉴와 순서 hash를 고정하며, operation은 열 수만 지정한다.

### 거부: 390px 큰 글씨 프로필에서 2열

모델의 동일 구조 `structureHash`는 유지되지만, 접근성 제약으로 `allowedColumns=[1]`이다.

```json
{
  "schemaVersion": 1,
  "contractVersion": "universal-layout.v1",
  "hostId": "civil-kiosk-mock",
  "screenId": "civil.main-menu",
  "structureVersion": "civil-main-mock.v1",
  "structureHash": "70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b",
  "constraintHash": "2cd8c25f2b197832d1b6d9cba75a9e4bd28fdf6742e896bc1ba3a048aff008af",
  "viewportClass": "regular",
  "operations": [
    {
      "type": "setColumns",
      "targetId": "civil.certificate-grid",
      "columns": 2
    }
  ]
}
```

결과: `DISALLOWED_COLUMN_COUNT`. 추가 필드·다른 operation·다른 target도 strict schema/allowlist 검증에서 거부된다.

## 5. 정책과 fixture 정합성

### 중앙 fixture — 첨부 명세 기준

| 필드/조건 | 값 |
|---|---|
| `hostId` | `civil-kiosk-mock` (실험용) |
| `screenId` | `civil.main-menu` |
| `structureVersion` | `civil-main-mock.v1` (실험용) |
| component | `civil.certificate-grid` |
| compact / regular / wide | `[1]` / `[1,2]` / `[1,2]` |
| 큰 글씨 / 큰 버튼 / 고대비 / 하단 viewport | `[1]` |
| wide 3열 이슈 | 중앙에서 수정 완료라고 첨부 명세에 기재 |

### 로컬 실행 Mock과 테스트 fixture

- 실행용 `civil-layout-mock.ts`의 standard 정책은 `[1]` / `[1,2]` / `[1,2]`다.
- 실행용 Mock은 별도 `bottomControls=true`도 1열로 제한한다.
- 작업 전 공통 계약 테스트 fixture는 wide `[1,2,3]`이었고, 실메뉴 ID가 아닌 합성 item-order hash를 사용했다.
- 실제 실행 정책/브라우저 검증에서 wide는 최대 2열이므로 실행용 policy를 완화하지 않았다. 대신 **공통 계약 테스트 fixture와 그 검증 데이터만** 실행용 policy와 실제 18개 ID 순서 hash에 맞췄다.
- 중앙 standard 정책과 로컬 standard 실행 정책의 선언된 열 수는 첨부 명세 기준 일치한다. 중앙 API를 통한 실제 등록 및 hash 결과는 검증하지 않았다.
- 공통 모델 schema에는 `bottomControls`가 없다. 현재 실행 Mock의 추가 제약은 local policy-selection 동작이며 중앙과의 동등성이 미확정이다.

## 6. 중앙에서 재현하는 방법

중앙 구현 담당자는 같은 Universal v1 contract/generator/validator를 사용해 다음 비민감 입력으로 재계산할 수 있다.

1. `schemaVersion=1`, `contractVersion=universal-layout.v1`.
2. 실험 fixture 검증에 한정해 `hostId=civil-kiosk-mock`, `screenId=civil.main-menu`, `structureVersion=civil-main-mock.v1`.
3. component는 `civil.certificate-grid`, `repeated-card-list`, `certificate-choice-list`, order `0`, itemCount `18`.
4. `itemOrderHash`는 위 18개 stable ID 배열의 canonical JSON SHA-256.
5. 각 vector 표의 viewport class/accessibility/allowedColumns로 component constraint를 생성한다.
6. 위 canonical structure/constraint 입력을 SHA-256하고 정상·거부 계획을 검증한다.
7. 결과가 다르면 먼저 canonical JSON bytes, Unicode NFC, 키 정렬, 배열 순서, profile mapping, policy registry를 비교한다. 해시 알고리즘이나 업무 코드를 변경하지 않는다.

실제 서비스 등록 전에는 실험용 `hostId`·`structureVersion`을 그대로 Production identity라고 해석하지 말고, 중앙 registry 소유자의 확정값을 받아야 한다.

## 7. 검증 결과 및 수정 범위

### 테스트 및 빌드

- `npm run test:universal-layout`: **13/13 통과**
- `npm run build`: **통과** (`tsc -b` 및 Vite production build)
- `git diff --check`: 통과
- Golden vector 테스트는 9개 조건의 `viewportClass`, `allowedColumns`, `itemOrderHash`, `structureHash`, `constraintHash`를 고정 확인한다.
- 18개 메뉴 ID의 순서 hash 및 구조 hash가 접근성/viewport 조건에 따라 변하지 않는다는 것을 확인했다.

### 변경한 파일

- `universal-layout/civil-layout-mock.test.ts` — 9개 local golden vector 회귀 테스트 추가
- `universal-layout/universal-layout-contract.test.ts` — 테스트 정책 wide `[1,2]`로 정합화, 실메뉴 ID 순서 hash 사용, 실행 정책과 fixture 일치 assertion 추가
- `CIVIL_KIOSK_UNIVERSAL_V1_GOLDEN_VECTORS.md` — 이 전달 문서
- `CIVIL_KIOSK_UNIVERSAL_V1_HOST_CONTRACT.md` — 최신 첨부 fixture 설명 및 정합화 결과를 반영

앱 runtime, CSS, SDK, API 경로, QR·발급·결제 로직, DB, secrets는 수정하지 않았다. 중앙 API/OpenAI 호출은 0회이고 Production 변경·배포는 없다.

## 8. 미확정 및 위험

- 실호스트용 정식 `hostId`와 `structureVersion`은 여전히 확정되지 않았다. mock ID를 실제 서비스 ID로 오용하지 않아야 한다.
- 중앙 fixture는 첨부된 정책 명세를 기준으로 대조했다. 중앙 API에 해당 fixture가 실제로 배포/등록됐는지는 확인하지 않았다.
- `bottomControls`는 공통 model accessibility schema 밖의 local 신호다. 중앙에서 이를 어떤 계약 필드/정책으로 보장할지 결정해야 한다.
- `minimumTouchTargetPx=44`는 모델 제약이며 이 hash test는 실제 브라우저의 각 버튼 hit target을 재측정하는 테스트가 아니다.
- CSS 기본 3열과 Mock maximum 2열은 별개다. 로컬 Mock은 3열 계획을 허용하지 않는다.
