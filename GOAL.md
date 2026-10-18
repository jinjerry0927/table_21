# TABLE 21 완성판 목표

## Objective

블랙잭을 플레이하면서 카드 한 장과 자신의 선택이 확률에 어떤 영향을 주는지 이해할 수 있는 웹게임을 완성한다. 기존 기능 안정화, 현재 라운드 회고, 화면·문서·검증·출시 마감을 첫 목표로 삼는다.

## Reasoning Depth

- very-high: 제품 전체 범위와 게임 규칙/복구/UX가 여러 모듈에 걸친다.
- `/goal`로 승격된 bounded execution으로 진행한다.

## Acceptance Criteria

- 자유 플레이와 목표 자금 챌린지가 실제 플레이된다.
- TABLE 21 V1 Standard의 HIT, STAND, DOUBLE, SPLIT, SURRENDER, INSURANCE, EVEN MONEY가 상태에 따라 작동한다.
- 모든 금액은 정수 센트로 계산되고 정산/통계가 중복 적용되지 않는다.
- 진행 중 라운드, 설정, 튜토리얼, 통계가 브라우저 저장소에서 복구된다.
- 로비/테이블/통계/설정/게임 방법/튜토리얼이 연결된다.
- 실시간 확률·카드 현황이 HIT, 정산, 재셔플, 저장 복구에 맞춰 갱신된다.
- 회고는 선택 직전의 공개 정보로 패·스탠드 승률·다음 히트 버스트 확률을 기록한다. 정산 후에도 당시 값을 유지한다.
- 회고는 저장·이어하기에서 복구되고 다음 라운드·새 세션에서 초기화된다. 기존 저장 데이터도 이어진다.
- 처음 방문한 사람이 가이드로 시작·플레이·통계 확인·이어하기를 수행할 수 있다.
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
- 최적 전략·정답 판정·히트 후 최종 승률·스플릿 승률·규칙 변경·계정·클라우드는 이번 범위에서 제외한다.
- Git과 origin은 현재 존재한다. 검증을 통과한 완성 범위만 출시 기록에 포함하고 실제 배포 상태까지 확인한다.

## 완성판 진행 상태

- 범위 확정: complete (2026-10-19 사용자 합의)
- 라운드 회고 및 저장 호환: complete
- UI·문서 마감: complete
- 단위·통합·브라우저·반복 플레이 검증: complete
- 출시 기록·배포 확인: in_progress

## 완성판 검증 기록 (2026-10-19)

- `npm run verify`: 린트·타입 검사·55개 단위/통합 검사·프로덕션 빌드 통과.
- `npm run test:e2e`: 프로덕션 빌드 기반 브라우저 검사 4개 통과.
- 300라운드에서 카드 312장 보존·정산·재셔플 경계 확인.
- 1280×720 및 390px 모바일 화면 확인. 모션 감소 시 카드 등장 지연도 제거.
- 저장 복구·이전 형식 호환·숨은 정보 비참조·선택 당시 확률 보존 확인.
- `run_game.bat --check` 및 `git diff --check` 통과.
- GitHub Pages 빌드 방식: workflow. 실제 배포와 버전 태그는 최종 확인 단계.

## 기존 V1 구현 상태

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
