# 무인민원발급기 Civil

무인민원발급기의 증명서 선택·발급 화면과 QR 기반 접근성 설정을 제공하는 Civil 키오스크 프로젝트입니다.

## 주요 기능

- 18개 증명서 메뉴와 기존 발급 화면 흐름
- 공통 키오스크 접근성 SDK v0.5.31을 이용한 QR 프로필 적용
- 큰 글씨, 버튼 확대, 고대비, 쉬운 말 안내 등 접근성 UI
- Universal Layout v2 호스트 검증 및 안전한 레이아웃 적용 경로

Production AI 레이아웃 경로는 gate와 중앙 allowlist 설정에 따라 제한됩니다. 실제 공개 AI 서비스가 현재 활성화되어 있다고 보장하지 않습니다.

## 기술 스택

React, TypeScript, Vite, Node.js, `@naebangsik/kiosk-accessibility-sdk` v0.5.31, Zod

## 로컬 실행

```sh
npm install
npm run dev -- --port 5000
```

Production 빌드 및 로컬 smoke 검증:

```sh
npm run build
```

## 환경변수 이름

환경에 따라 다음 변수가 필요할 수 있습니다. 실제 값은 Replit Secrets 등 안전한 비밀정보 저장소에 설정하고 Git에 커밋하지 마세요.

- `PORT`
- `SESSION_SECRET`
- `QR_PROFILE_PRODUCTION_ACCESS_TOKEN`
- `CIVIL_UNIVERSAL_LAYOUT_CENTRAL_PRODUCTION_URL`
- `CIVIL_UNIVERSAL_LAYOUT_HOST_AI_TOKEN`
- `CIVIL_UNIVERSAL_LAYOUT_PRODUCTION_EXTERNAL_ACCESS_TOKEN`
- `CIVIL_UNIVERSAL_LAYOUT_V2_PRODUCTION_RELAY_ENABLED`
- `CIVIL_UNIVERSAL_LAYOUT_V2_PRODUCTION_HOST_POLICY_VERIFIED`

공개 Civil Production URL은 현재 확인되지 않아 이 README에 데모 URL을 기재하지 않았습니다.
