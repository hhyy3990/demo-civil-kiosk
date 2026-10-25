# 무인민원발급기 — 하단 공간 실측 및 안전성 검증

측정일: 2026-10-25

## 1. 결론

`reserved-bottom-controls`는 `bottomControls` 사용자 설정이나 footer DOM의 존재만으로 산출하면 안 된다. 이번 Development Preview 실측에서 확인한 물리적 상태는 화면 폭과 적용 profile에 따라 달랐다.

- 320×844, 360×844, 390×844: `bottomControls=false` 기본 상태에서도 `.device-footer`가 보이는 `position: fixed` 요소로 화면 하단을 차지했다. 따라서 이 세 화면에서는 **하단 고정 영역 필요가 확인됨**이다.
- 1080×1920 기본 상태: footer가 일반 문서 흐름의 `position: static`이었고 `.screen-content`와 겹치지 않았다. 이 상태는 **하단 고정 영역 불필요가 확인됨**이다.
- 1080×1920에서 SDK profile의 `bottomControls=true` 적용 후: SDK가 footer를 `position: fixed`로 바꿨다. 이 상태는 **하단 고정 영역 필요가 확인됨**이다.
- 모바일에서는 초기 스크롤 위치의 마지막 메뉴 일부가 footer 아래에 들어간다. 하지만 `.stage`를 실제로 스크롤하면 모든 증명서 메뉴가 footer와 겹치지 않는 위치까지 이동했고, 마지막 메뉴 hit-test가 통과했다.
- 화면 전환과 세션 초기화 후에도 모바일의 `.device-footer`는 호스트 CSS에 의해 fixed로 남았다. 그러므로 profile reset만으로 capability를 끄면 물리적 하단 점유영역을 놓칠 수 있다.
- 화면 크기·profile·화면 단계가 바뀌어도 계산이 안정됐는지 확인할 수 없거나 측정값이 불완전한 경우는 **상태 불명**으로 처리하고 계획을 적용하지 않는 fail-closed가 안전하다.

이번 작업은 실측과 분석만 했다. 앱, SDK, CSS, Universal v1 동작, 중앙 API, DB, QR 및 업무 로직은 변경하지 않았다. v2 capability나 중앙 API에는 연결하지 않았다.

## 2. 측정 방법과 범위

- 실제 Replit Development Preview 호스트를 Chrome 152 headless 브라우저로 열어 DOM, computed style, `getBoundingClientRect()`, `scrollHeight`, `clientHeight`, `scrollTop`, `elementFromPoint()`를 측정했다.
- 모바일 폭은 320/360/390 CSS px, 높이는 844px, DPR은 1로 설정했다. 세로 화면 1080×1920은 desktop viewport emulation으로 측정했다.
- 지정 profile은 개인정보 없이 브라우저의 Development 런타임에서 React profile state를 바꾸고 정상 `useKioskAccessibility` effect가 SDK `applyProfile()`을 수행하도록 적용했다. `accessibilityProfileApplied=true`도 함께 설정해 QR 적용 후 화면과 같은 개발 버튼 상태로 측정했다. **실제 QR 스캔/중앙 API 조회는 하지 않았다.**
- 스크롤은 `.stage` 내부에서 CDP wheel input으로 끝까지 이동했다. 390×844 기본 상태에서는 CDP touch input으로 위쪽 스와이프도 시뮬레이션했다.
- 실제 주민등록번호, 개인정보, QR token은 입력하거나 수집하지 않았다.
- 브라우저 예외/콘솔 error는 0건이었다. Replit workflow 로그는 Vite 시작 완료 상태였으며 오류가 없었다. Preview 콘솔에는 Vite 연결 debug와 React DevTools 안내 정보만 관찰됐다.
- touch 결과는 자동화 브라우저의 **터치 이벤트 시뮬레이션**이다. 실제 키오스크 터치 패널 및 물리 기기의 검증은 아니다.

## 3. 실제 DOM과 스크롤 구조

### DOM 관계

`src/App.tsx`의 실제 구조:

```tsx
<main className="stage" ref={rootRef}>
  <section className="machine">
    <div className="screen-shell">
      <header className="screen-header">...</header>
      <div className="screen-content" data-a11y-slot="scroll-content">...</div>
      <footer className="device-footer" data-a11y-slot="bottom-controls">...</footer>
    </div>
  </section>
</main>
```

- `main.stage`는 SDK의 `rootRef`다.
- `src/useKioskAccessibility.ts`의 `getLayoutRegions()`는 `scrollArea: root`와 `bottomControls: [root.querySelector('[data-a11y-slot="bottom-controls"]')]`를 반환한다. 즉 SDK에 등록된 scrollArea는 `.stage`, bottomControls는 실제 `.device-footer`다.
- `.screen-content`는 footer와 같은 `.screen-shell` 안의 형제 요소다. mobile CSS에서 `overflow-y:auto`지만, 측정한 각 조건에서 자체 `scrollHeight`와 `clientHeight`가 같아 별도 내부 스크롤 범위가 없었다.
- 320/360/390 모바일에서는 실제 overflow와 `scrollTop` 변화를 가진 스크롤 owner가 `.stage`였다. `document.scrollingElement`는 390×844 초기 검사에서 `844/844`로 스크롤 범위가 없었다.
- 1080×1920 기본 상태에서는 `.stage`가 SDK에 scrollArea로 등록되어 있으나 실제 스크롤 범위는 없었다(`1920/1920`).
- SDK의 QR 진입 dock도 `.stage`에 상태 class와 높이 변수를 적용한다. 모바일 기본 상태에서 관찰된 값은 dock height `72px`, controls inset `86px`였다.

### 관련 구현 위치

- root와 shell: `src/App.tsx:248-253`
- 화면 콘텐츠 영역: `src/App.tsx:272`
- footer와 하단 버튼: `src/App.tsx:305-313`
- SDK `getLayoutRegions()`의 footer·scrollArea 등록: `src/useKioskAccessibility.ts:441-456`
- shell 및 content 기본 CSS: `src/styles.css:10,16`
- 모바일 content overflow와 footer 고정 CSS: `src/styles.css:58-60,74`
- profile 적용 및 screen change: `src/useKioskAccessibility.ts:537-541,583-594`
- SDK 버전: 설치된 `@naebangsik/kiosk-accessibility-sdk@0.5.31`

## 4. 기본 profile 화면 크기별 실측

좌표는 viewport 좌상단 기준 CSS px다. `content/footer 교차`는 두 요소의 사각형 교차 면적이며, 실제 메뉴 버튼 교차 수와는 별도로 표기했다.

| 조건 | `.stage` scrollHeight/clientHeight | `.screen-shell` y–bottom | `.screen-content` y–bottom | `.device-footer` rect / position | content/footer 교차 면적 | 초기 footer 아래에 겹친 메뉴 | 스크롤 끝의 마지막 메뉴 | 결과 |
|---|---:|---:|---:|---|---:|---|---|---|
| 320×844 기본 | 1190/844 | 26–1032 | 87–1029 | y=758–844, 320×86, fixed | 27,520px² | 13–18 (6개) | y=480–535 | hit-test 통과 |
| 360×844 기본 | 1175/844 | 26–1017 | 87–1014 | y=758–844, 360×86, fixed | 30,960px² | 13–18 (6개) | y=495–550 | hit-test 통과 |
| 390×844 기본 | 1139/844 | 26–981 | 87–978 | y=758–844, 390×86, fixed | 33,540px² | 15–18 (4개) | y=499–550 | hit-test 및 실제 클릭 통과 |
| 1080×1920 기본 | 1920/1920 | 489–1389 | 561–1290 | x=280, y=1290–1382, 520×92, static | 0px² | 없음 | y=1177–1241, 스크롤 불필요 | hit-test 통과 |

모바일 기본 상태에서 `.screen-content`의 바운딩 박스는 fixed footer 영역과 겹친다. 하지만 이것만으로 클릭 불가를 판정하지 않았다. 메뉴 버튼 단위로 확인했을 때 초기 위치에서는 표의 메뉴들이 footer와 겹쳤고, `.stage`를 스크롤 끝까지 이동한 뒤에는 **메뉴 버튼과 footer 사이 교차가 0개**였다.

### 마지막 메뉴의 실제 조작

- 메뉴 수는 모든 측정 화면에서 18개였다. 마지막 메뉴는 `#certificate-category-18` / `교통(경찰청)`이다.
- 390×844 기본 상태의 마지막 메뉴는 초기 y=794–845로 footer(y=758–844)와 겹쳤다. 스크롤 후 y=499–550으로 이동했다.
- 스크롤 후 `elementFromPoint()`가 실제 `#certificate-category-18` 버튼을 반환했고, 실제 브라우저 mouse click의 event path도 그 버튼을 대상으로 했다. 클릭 후 `데모 버전에서는 현재 주민등록등본 발급만 제공됩니다.` 안내가 나타났다.
- CDP touch swipe 1회로 390×844 `.stage.scrollTop`이 0에서 295로 이동했다. 이는 실제 터치 하드웨어가 아닌 터치 이벤트 시뮬레이션이다.

## 5. profile별 390×844 실측

아래 접근성 profile은 실제 QR API가 아니라 Development 브라우저 런타임에서 적용했다. footer 위치·콘텐츠 범위·메뉴 교차를 직접 측정했다.

| profile | `.stage` scrollHeight/clientHeight | `.screen-shell` y–bottom | `.screen-content` y–bottom | footer rect | 초기 footer와 겹친 메뉴 | 끝까지 스크롤 후 마지막 메뉴 | 최대 `.stage.scrollTop` |
|---|---:|---:|---:|---|---|---|---:|
| 기본, bottomControls=false | 1139/844 | 26–981 | 87–978 | y=758–844, h=86, fixed | 15–18 | y=499–550, hit | 295 |
| bottomControls=true | 1103/844 | 26–933 | 87–930 | y=746–844, h=98, fixed | 17–18 | y=473–524, hit | 259 |
| bottomControls=true + bottom viewport 70% | 933/471 | 229–1136 | 290–1133 | y=746–844, h=98, fixed | 9–14 | y=473–524, hit | 462 |
| extraLarge text + large button + high contrast | 1323/844 | 26–1158.5 | 98–1155.5 | y=751.6–844, h=92.44, fixed | 11–14 | y=432.3–491, hit | 479 |
| 위 큰 글씨/버튼/고대비 + bottom viewport 80% | 1158/543 | 162–1294.5 | 234–1291.5 | y=751.6–844, h=92.44, fixed | 7–12 | y=432.3–491, hit | 615 |
| bottom viewport 60% | 919/411 | 301–1194 | 362–1191 | y=758–844, h=86, fixed | 7–12 | y=499–550, hit | 508 |
| bottom viewport 70% | 919/480 | 232–1125 | 293–1122 | y=758–844, h=86, fixed | 9–14 | y=499–550, hit | 439 |
| bottom viewport 80% | 919/548 | 164–1057 | 225–1054 | y=758–844, h=86, fixed | 13–16 | y=499–550, hit | 371 |

화면 높이 모드가 적용된 390×844에서 SDK가 설정한 실제 viewport 높이는 60/70/80% 순서로 `411/480/548px`였다. 일반 profile에서 bottom inset은 `158px`였고, bottomControls=true에서는 footer가 커져 `170px`, 큰 profile에서는 `165px`로 다시 계산됐다. 따라서 같은 화면·같은 viewport 크기라도 footer 높이와 적용 profile이 바뀌면 reserved geometry가 달라진다.

## 6. 고정 조작부 및 터치 영역

### footer 위치 변화

- 모바일 기본 profile: footer는 항상 `position:fixed`, y=758, 높이 86px.
- 모바일 `bottomControls=true`: SDK class가 적용되고 footer는 y=746, 높이 98px로 측정됐다. 이 상태에서 scroll dock controls inset도 86px에서 98px로 바뀌었다.
- 모바일 large-button profile: footer는 y=751.56, 높이 92.44px로 측정됐다.
- 1080×1920 기본 profile: footer는 shell 안의 static flow에 있으며 x=280, y=1290, w=520, h=92px다.
- 1080×1920 `bottomControls=true`: SDK class에 따라 footer는 x=0, y=1820, w=1080, h=100px의 fixed 요소가 됐다. 이때 screen-content와 footer 교차 면적은 0이었다.

### 버튼 크기

- 기본 모바일 footer 버튼은 320/360에서 약 `75.8×43px`, 390에서 `82×43px`였다.
- 기본 certificate tile은 320에서 마지막 메뉴 `143.5×55px`, 360에서 `163.5×55px`, 390에서 `178.5×51px`였다.
- 큰 버튼 profile의 footer 버튼 높이는 `49.44px`; certificate tile 마지막 항목은 약 `58.7px` 높이였다.
- 기본 모바일 메뉴/footer 버튼 중 최소 측정 높이는 footer의 `43px`이다. 프로젝트에 적용할 v2 `minimumTouchTargetPx` 기준은 확인할 수 없어 정책 합격/불합격은 판정하지 않는다. 실제 측정치만 기록한다.

## 7. 화면 전환과 세션 초기화

Development에서 bottomControls=true와 bottom viewport 70%를 적용한 상태로 주민등록 카테고리를 눌렀다.

- 화면 전환 결과: `resident-type`.
- 전환 중 `.stage`의 `a11y-bottom-controls` 및 bottom-viewport class가 유지됐다. footer의 computed position도 fixed였다. 이전 화면의 설정을 screen transition만으로 지우지 않았다.
- 하단 `처음화면`을 누른 뒤: 화면은 `main-menu`, React profile은 `bottomControls=false`, text/button/contrast는 standard, `viewportMode=null`로 초기화됐다.
- SDK profile class와 bottom-viewport class는 제거됐다.
- **모바일 footer는 초기화 후에도 fixed**로 남았다(y=758–844, h=86px). 이는 사용자 profile이 아니라 호스트의 모바일 CSS가 고정 위치를 만들기 때문이다.

## 8. capability 판정 제안

`reserved-bottom-controls`가 “실제 화면에서 보호해야 하는 하단 고정 공간”이라는 중앙 정의에 맞춘 측정 기준이다. 이 문서는 v2 wire schema를 추가하거나 확정하지 않는다.

### 예약 공간 확인

아래를 모두 확인한 경우에만 실제 점유영역을 확인된 상태로 본다.

1. 현재 대상 screenId의 실제 footer/action region이 SDK adapter에 등록되어 있다.
2. 요소가 connected, visible, non-zero size이며 computed `position`이 fixed/sticky다.
3. viewport 안에서 footer가 차지하는 실측 rect와 하단 경계가 안정적으로 확인된다.
4. 실제 scroll owner가 확인되며, scroll end에서 필수 메뉴/action의 hit-test가 통과한다.
5. profile/viewport mode에 따른 footer 높이와 bottom inset을 사용해 constraint를 재계산한다.

이 기준에서 **320/360/390 모바일 기본 상태와 모바일 bottomControls=true, 1080 desktop bottomControls=true는 고정 조작 공간이 확인됨**이다. 모바일 기본은 `bottomControls=false`여도 fixed 공간이 존재한다.

### 예약 공간 없음 확인

visible footer가 static flow에 있고 콘텐츠가 footer 앞에서 끝나며 실제 교차가 없음을 확인한 상태다. 이번 측정에서는 **1080×1920 기본 profile**이 이 상태였다. 단순히 요소가 static이라는 한 조건만으로 다른 화면 크기나 다른 screenId에 확대 적용해서는 안 된다.

### 상태 불명 또는 측정 실패

요소가 사라지거나 숨겨짐, geometry가 0/불안정, scroll owner 불명, viewport 변화가 settle되지 않음, hit-test 실패, 등록 요소와 측정 요소 불일치 중 하나라도 있으면 unknown이다. 이 경우 capability를 임의로 false로 간주하지 말고 **해당 계획 생성/적용을 보류하는 fail-closed**가 안전하다.

### 구현 전 중앙과 합의할 점

- capability는 화면 및 viewport 조건에 따라 다시 측정해야 한다. profile의 `bottomControls` boolean만 사용하지 않는다.
- footer DOM 존재만으로 capability를 켜지 않는다. 이번 실측처럼 computed fixed/sticky 상태, visible rect, viewport 교차와 실제 scroll/target 결과를 함께 본다.
- 현재 모바일 기본 layout은 고정 footer와 메뉴 겹침이 확인됐으므로, capability가 “보호해야 할 fixed 영역”을 뜻한다면 bottomControls=false여도 on이어야 한다.
- `bottomControls=true`는 footer 위치/높이를 바꾸므로 capability 상태가 유지되더라도 constraint geometry/hash는 바뀌어야 한다.
- viewport/profile/screenId 변경 시 기존 plan을 취소하고 settle된 DOM에서 다시 측정·검증한다.
- measurement error, 미지원 viewport 또는 예상과 다른 footer geometry에서는 plan을 적용하지 않는다.
- 중앙 v2의 exact schema, geometry 파라미터 및 canonical hash 구성은 이 프로젝트에 없어 wire compatibility는 미확인이다.

## 9. 확인되지 않은 범위와 남은 위험

- 실제 물리적 터치 패널에서는 테스트하지 않았다. CDP touch emulation 결과와 실제 기기 결과를 구분한다.
- 주민등록표 종류 선택 이외의 발급 화면에서 하단 fixed 공간의 전체 content overlap/hit-test를 반복 측정하지 않았다. 화면 전환에서는 screen ID, footer position, profile class 유지/초기화만 확인했다.
- 중앙 API, Universal v2 Mock, OpenAI, Production은 호출·변경하지 않았다.
- bottom-controls가 적용되는 폭 사이의 중간 breakpoint, OS safe-area/inset, 브라우저 zoom, 회전, 화면 배율은 미검증이다.
- `minimumTouchTargetPx`의 중앙 v2 기준값은 미확인이다. 확인된 최소 높이 43px을 기준과 대조한 판정은 보류한다.

## 최종 상태

- actual host: Replit Development Preview
- SDK: `@naebangsik/kiosk-accessibility-sdk@0.5.31`
- host 코드/CSS/SDK/Universal v1/API/DB/QR/업무 로직: 변경 없음
- 측정용 코드: 임시 브라우저 스크립트만 `/tmp`에 사용; 프로젝트/Production 번들에는 추가하지 않음
- API/OpenAI 요청: 0회
- Production 배포: 없음
- browser/서버 오류: 확인된 오류 0건
