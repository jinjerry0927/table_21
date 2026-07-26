# TABLE 21 V1 Goal

## Objective

`TABLE_21_BUILD_PROMPT.md`의 V1 범위를 실제 플레이 가능한 React/TypeScript 게임으로 구현하고 로컬 실행, 테스트, 프로덕션 빌드, GitHub Pages 배포 준비까지 검증한다.

## Reasoning Depth

- very-high: 제품 전체 범위와 게임 규칙/복구/UX가 여러 모듈에 걸친다.
- `/goal`로 승격된 bounded execution으로 진행한다.

## Acceptance Criteria

- 자유 플레이와 목표 자금 챌린지가 실제 플레이된다.
- TABLE 21 V1 Standard의 HIT, STAND, DOUBLE, SPLIT, SURRENDER, INSURANCE, EVEN MONEY가 상태에 따라 작동한다.
- 모든 금액은 정수 센트로 계산되고 정산/통계가 중복 적용되지 않는다.
- 진행 중 라운드, 설정, 튜토리얼, 통계가 브라우저 저장소에서 복구된다.
- 로비/테이블/통계/설정/게임 방법/튜토리얼이 연결된다.
- `run_game.bat`, 정적 빌드, Pages 워크플로가 준비된다.
- `npm run verify`와 `npm run test:e2e`가 통과하고 1280×720 화면을 점검한다.

## Verification

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`
5. `npm run test:e2e`
6. 1280×720 브라우저 시각 점검

## Stop Rules

- 비밀키, 계정, 결제, 백엔드, 실제 돈 기능을 추가하지 않는다.
- 의존성은 프롬프트가 지정한 React/Vite/테스트/검증 도구로 제한한다.
- 동일 실패가 3회 반복되거나 로컬 검증이 불가능하면 정확한 원인과 다음 승인 항목을 보고한다.
- Git 원격 저장소가 없으므로 커밋, 푸시, 실제 Pages 게시를 시도하지 않는다.

## Loop State

- M0 기반 구성: complete
- M1 규칙 엔진: complete
- M2 플레이 가능한 테이블: complete
- M3 챌린지/저장/통계: complete
- M4 제품 UX: complete
- M5 배포 준비/최종 검증: complete

## Last Run

- 2026-07-21: 빈 폴더와 비 Git 상태 확인. 구현 시작.
- 2026-07-21: 엔진/화면/저장/통계/설정/튜토리얼/배포 준비 구현. 단위·통합 테스트 24개 작성. 최종 검증 진행 중.
- 2026-07-21: `npm run verify` PASS (lint, strict typecheck, 27 tests, production build).
- 2026-07-21: Playwright Chromium 1280×720 E2E 2개 PASS, 런타임 오류 0, 베팅/정산 캡처 시각 확인 PASS.
- 2026-07-21: `dist/` preview HTTP 200 및 TABLE 21 HTML 확인 PASS.
- 2026-07-21: `run_game.bat --check` PASS. Windows UTF-8 BOM/CRLF 경로 검증 완료.
- 2026-07-21: Git 저장소/원격 URL이 없어 commit, push, 실제 Pages 게시 미수행. 워크플로 준비만 완료.
