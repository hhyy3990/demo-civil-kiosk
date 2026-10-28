# 무인민원발급기 Universal v2 정책 호환성 자료

이 문서는 현재 무인민원발급기 Development 코드와 1080×1920 브라우저 DOM에서 추출했습니다. 중앙 API/registry, OpenAI는 호출하지 않았습니다. JSON의 `liveModel`과 `localFakePlan`은 실제 메뉴 상태를 로컬 Development Fake endpoint에 전달해 생성·검증한 값입니다.

## 요약

- **로컬 Development hostId:** `civil-kiosk-development-test`
- **화면 / 구성 요소:** `civil.main-menu` / `civil.certificate-grid`
- **구조 버전:** `civil-main-menu.v2-test`
- **계약:** schemaVersion `2`, contractVersion `universal-layout.v2`
- **옵션:** `arrangement / reserved-safe-list`; `reserved-bottom-controls` capability가 있을 때만 허용됩니다.
- **중앙 registry와의 비교:** 화면 ID, 구성 요소 ID, 옵션 ID는 일치하지만 hostId가 다릅니다. 중앙에서 전달된 `hostPolicyVerified`는 `false`이며, registry의 structureVersion·capability 조건·해시 정책은 제공되지 않아 확인할 수 없습니다. 따라서 **호환성 검증 완료로 볼 수 없습니다.**

## 모델과 해시

18개 증명서 항목은 실제 DOM의 `data-a11y-action-id` 순서로 수집합니다. 각 ID는 `civil.certificate.01`부터 `.18`까지이며, 실제 항목명과 순서는 JSON의 `orderedItems`에 담았습니다. 모델의 `itemOrderHash`는 다음 값의 canonical SHA-256입니다.

`{ "orderedItemIds": [18개 ID의 순서 배열] }`

`structureHash`는 schema/contract 버전, host/screen ID, structureVersion, 그리고 순서대로 정렬한 component 정의 중 `id`, `kind`, `role`, `order`, `itemCount`, `itemOrderHash`를 해시합니다. `constraintHash`는 schema/contract 버전, viewport 분류, 접근성 값, 정렬된 capability, 허용 operation과 component의 열 제한·옵션·최소 터치 크기·보호 속성을 해시합니다.

Canonical JSON은 객체 키를 NFC 정규화 후 사전식 정렬하고 배열 순서는 유지합니다. 이를 UTF-8 SHA-256 소문자 hex로 계산합니다. 이번 실측 모델의 해시는 JSON에 기록되어 있습니다.

## capability 및 옵션 조건

호스트는 `.device-footer[data-a11y-slot="bottom-controls"]`가 표시되고 `position`이 `fixed`/`sticky`가 아닌 일반 흐름인지 확인합니다. 또한 `.a11y-qr-entry-dock`이 표시되고 `position: fixed` 또는 `sticky`이며 viewport와 교차하는지도 확인합니다. 둘 중 하나라도 참이면 `reserved-bottom-controls`를 모델에 넣습니다.

실측에서 footer는 `static`이며 보이고, QR 도크는 `fixed`로 viewport 하단에 보였습니다. 따라서 capability가 포함됐습니다. capability 규칙은 해당 component를 최대 1열로 제한합니다. 로컬 정책은 compact에서 1열, regular/wide에서 1·2열을 허용하지만 큰 글씨·큰 버튼·고대비·하단 viewport 설정이나 capability 최대 열 수를 적용하면 허용 열은 1열입니다.

옵션은 CSS 값을 직접 지정하지 않습니다. 검증된 `selectLayoutOption`은 호스트의 CSS preset을 선택합니다. 실제 preset은 1열, 4px grid 간격, 메뉴 버튼 최소 높이 44px입니다. 호스트는 760px 미만 화면, 18개 항목/순서 불일치, footer/QR 겹침 또는 44px 미만 터치 영역이면 적용을 거부합니다.

## registry 비교 및 한계

제공된 중앙 fixture의 hostId는 `civil-kiosk-mock`이고, 로컬 Development 모델의 hostId는 `civil-kiosk-development-test`입니다. 나머지 제공된 세 식별자(screenId, componentId, option)는 일치합니다. 단, 중앙 fixture의 `hostPolicyVerified: false`이므로 이 식별자 일치만으로 정책이 중앙 검증됐다고 볼 수 없습니다.

현재 JSON은 로컬 모델과 정책을 설명하는 자료이지, 중앙 registry 등록 요청이나 중앙 승인 결과가 아닙니다. 중앙 측에서 실제 적용을 검토하려면 올바른 hostId, structureVersion, component/item-order hash, capability 산정 조건, option의 capability 요구조건과 CSS 적용 보장, 중앙 validator가 재구성하는 constraint를 대조해야 합니다. 이 프로젝트의 실제 호스트 식별자를 fixture에 맞춰 바꾸지는 않았습니다.

## 파일

- `CIVIL_KIOSK_UNIVERSAL_V2_POLICY_COMPATIBILITY.json` — 구조화된 정책·실측 모델·해시·registry 비교
- `CIVIL_KIOSK_UNIVERSAL_V2_POLICY_COMPATIBILITY.md` — 핵심 설명
