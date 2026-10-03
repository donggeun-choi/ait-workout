# 운동 화면 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지난 세트를 참고하면서 무게·횟수·완료에 집중할 수 있는 운동 준비·진행 화면을 기존 앱에 적용한다.

**Architecture:** `src/App.tsx`의 기존 준비·초안·자동 저장·완료 저장 흐름을 유지하고 JSX와 스타일을 단계적으로 조정한다. 지난 세트 대응과 다음 미완료 세트 탐색만 순수 함수로 분리하고, 종목 관리는 본문 접힘 영역으로 제공한다. 데이터 스키마 변경과 신규 UI 의존성은 없다.

**Tech Stack:** React 18, TypeScript, Vite, 설치된 TDS, Apps in Toss web-framework, Node 24 이상, npm/package-lock.json.

**Spec:** [운동 화면 명세: 다음 리디자인 명세](../../workout-screen-design.md#다음-리디자인-명세--계획-단계-2026-10-03). 이 문서의 목적·화면 순서·상태·완료 기준을 함께 읽는다.

## Global Constraints

- 최상위 제품 원칙: **간편하고 빠르게 사용하며, 실제 운동과 기록을 방해하지 않는다.**
- 브랜드 primary `#3182F6`. 본문 15px 이상, 숫자 입력 16px 이상, 보조 정보 13px 이상, 터치 영역 44px 이상, font-weight 400~700, CTA safe area 34px.
- TDS API는 설치된 타입 선언으로 확인한다. 플랫폼 상단 내비게이션을 직접 그리지 않는다. 이모지는 Tossface, 한글은 keep-all, 방향·닫기 아이콘은 SVG/TDS Asset.
- 기록 스키마·저장 키·기본 값·검증 범위는 변경하지 않는다. 자동 저장·읽기 오류 보호·완료한 세트만 저장을 유지한다.
- 입력/완료에 화면 전환·확인·자동 포커스·자동 스크롤을 추가하지 않는다. 준비·진행·휴식·저장에는 광고를 넣지 않는다.
- `.env`, `node_modules`, `dist`, `.ait`를 커밋하지 않는다. 새 패키지나 배포 작업은 없다.
- 사용자 origin `5199`와 `5193`에서 기록을 조작하지 않는다. 실행 시 비어 있는 별도 포트·프로필을 선택한다.

## Review Focus

1. 과거 세트 수 부족·미완료 세트 혼합·첫 기록: 대응 값을 지어내지 않는다 — Task 1 자동 테스트, Task 3 모바일 표시 확인.
2. 긴 한글 종목·맨몸·320px 폭: 입력 네 열과 관리 터치 영역을 보존한다 — Task 3 모바일 확인.
3. 입력 중 타이머 시작·종료·끄기·+30초: 포커스·입력·스크롤 위치를 유지한다 — Task 2 상호작용 확인.
4. 완료 취소·종목 순서 이동·삭제 취소: 대상 ID와 기존 입력을 유지한다 — Task 1 자동 테스트, Task 3 상호작용 확인.
5. 초안 복원·저장 실패·루틴 선택 취소: 실제 기록 보호와 재시도·이전 구성 복원이 유지된다 — Task 4 전체 흐름 확인.

## 적용 파일과 역할

| 파일 | 역할 |
|---|---|
| `src/workout-model.ts` | 지난 완료 세트 대응, 첫 미완료 세트 탐색 |
| `tests/workout-model.test.mjs` | 위 순수 함수의 회귀 검증. 기존 TS transpile 테스트 방식을 재사용 |
| `src/App.tsx` | 진행 헤더·휴식 영역·종목 관리·세트 표시·준비 화면 배치 |
| `src/App.css` | 운동 화면에 한정한 크기·위계·상태·반응형 스타일 |
| `docs/workout-screen-design.md` | 구현 후 명세와 실제 동작 일치 |
| `docs/product-direction.md` | 실제 지원 범위 갱신 |
| `docs/verification.md`, `docs/screenshots/workout-redesign/` | 검증 결과와 모바일 캡처 |

## 실행 전 기준점

- [ ] `git status --short`로 현재 홈 통합 코드·문서·캡처 변경을 확인하고 보존한다. 다른 작업 변경을 초기화하거나 누락한 채 새 worktree를 만들지 않는다.
- [ ] 홈 통합 변경의 기준 커밋을 확보한 뒤 해당 기준으로 `codex/workout-screen-redesign` 작업 브랜치를 준비한다. 실행 시 using-git-worktrees 절차를 따른다.
- [ ] `docs/harness.md`를 읽고 별도 포트에서 기존 운동 준비·진행을 320×740·390×844로 캡처한다. 탭 수, 초기 입력 표 위치, CTA 가림 여부를 기록한다.

### Task 1: 지난 세트와 다음 세트의 정확한 대응

**Files:** Modify `src/workout-model.ts`; Test `tests/workout-model.test.mjs`.

**Interfaces:**
- Consumes: 기존 `Session`, `Exercise`, `SetRow`, `previousExercise(sessions, name)`.
- Produces: `previousCompletedSet(sessions: Session[], name: string, index: number): Readonly<SetRow> | null`.
- Produces: `firstIncompleteSet(exercises: Exercise[]): { exerciseId: string; setId: string } | null`.

- [ ] 가장 최근 동일 종목에서 완료 세트만 순서대로 대응하는 실패 테스트를 추가한다. 최신 기록의 완료 값이 35×10, 30×12이고 중간 미완료 값이 99×99면 index 0/1은 각각 35×10, 30×12, index 2는 null이어야 한다.
- [ ] 첫 기록·다른 종목·음수 index에서 null, 맨몸 무게 0·소수 37.5 보존, 원본 기록 불변을 테스트한다.
- [ ] 여러 종목 중 첫 미완료 ID 반환, 완료 취소 시 해당 ID 반환, 모두 완료/빈 목록에서 null, 순서 이동 시 새 순서의 첫 미완료 반환을 테스트한다.
- [ ] `bash -c 'source scripts/runtime.sh; node --test tests/workout-model.test.mjs'`를 실행해 새 함수 부재로 실패함을 확인한다.
- [ ] 두 함수를 구현한다. 지난 기록은 기존 `previousExercise` 선택 규칙을 재사용하고 완료 세트 배열의 index만 참조한다. 다음 세트는 종목/세트 순서대로 탐색하며 변경하지 않는다.
- [ ] 같은 테스트를 실행해 통과를 확인하고 이 작업의 모델·테스트만 커밋한다.

### Task 2: 진행 헤더와 안정적인 휴식 영역

**Files:** Modify `src/App.tsx`의 `session-heading`, `rest-setting`, `rest-card`; Modify `src/App.css`.

**Interfaces:**
- Consumes: 기존 `draft`, `saveStatus`, `elapsed`, `rest`, `data.settings`, `updateDraft`, `countSets`.
- Produces: 기존 상태를 그대로 표현하는 압축 헤더·고정 높이 휴식 영역. 저장/타이머 인터페이스는 변경하지 않는다.

- [ ] 운동 이름·저장 상태와 경과 시간·완료/전체 세트 줄로 헤더를 정리한다. 상단 총 운동량은 제거하되 결과/분석의 계산은 유지한다.
- [ ] 기본 휴식 선택과 휴식 상태를 하나의 영역으로 합친다. 320px에서 대기·진행·종료·끄기가 모두 같은 두 줄 높이를 사용하고 버튼은 TDS를 우선 사용한다.
- [ ] 기존 휴식 선택의 종목별 override 업데이트, 끄기의 타이머 해제, +30초 계산, 건너뛰기/닫기를 유지한다.
- [ ] 모바일에서 횟수 입력에 포커스를 둔 채 다른 세트를 완료하고 휴식 시작·종료·+30초·끄기를 확인한다. 포커스된 입력 노드, 값과 main scrollTop이 보존되는지 기록한다. 숫자는 tabular-nums로 갱신한다.
- [ ] `bash -c 'source scripts/runtime.sh; npm run lint && npm run typecheck'` 통과와 헤더/휴식 캡처를 확인하고 해당 변경만 커밋한다.

### Task 3: 종목 관리 접기와 세트 입력 위계

**Files:** Modify `src/App.tsx`의 `exercise-card`, `exercise-tools`, `set-grid`; Modify `src/App.css`.

**Interfaces:**
- Consumes: Task 1 함수들, 기존 `toggleSet`, `fillPrevious`, `updateDraft`, 실제 `data.sessions`.
- Produces: 종목 관리 열림 ID `string | null`을 화면 내부 상태로 관리. 저장 데이터에 추가하지 않는다.

- [ ] 종목 헤더에 이름·부위·완료/전체 세트와 `종목 관리`를 배치한다. 기본 접힘, 한 종목만 펼침, aria-expanded/aria-controls를 제공한다.
- [ ] 빈 입력에 지난 값·위/아래 이동·삭제를 펼친 본문 안으로 이동한다. 기존 경계 disabled, 수정 값 보호, 완료 세트 삭제 확인을 재사용한다. Escape로 접고 관리 버튼에 포커스를 복원한다. 삭제 후 유효한 다음 종목 관리 버튼 또는 운동 추가에 포커스를 둔다.
- [ ] 네 열 입력 행 아래에 Task 1 대응 값을 표시한다. 일치하는 과거 종목의 세트가 부족하면 `지난 기록 없음`; 맨몸 종목은 `지난 12회`처럼 표시한다. 입력 열을 추가하지 않는다.
- [ ] Task 1이 반환한 첫 미완료 행 하나에 약한 강조와 비시각적 설명을 추가한다. 완료/미완료/다음 행의 높이를 동일하게 유지하고 입력은 16px, 완료 영역은 44px 이상으로 유지한다.
- [ ] 320px에서 긴 한글 이름·맨몸·세트 수 부족을 확인한다. 손으로 만든 검증 기록을 사용하고 누락 값을 반복 표시하지 않는지 확인한다.
- [ ] 무게 편집 → 완료 → 완료 취소 → 재편집, 세트 추가, 순서 이동, 삭제 취소를 확인한다. 입력/완료에 추가 탭이나 팝업이 없고 관리 작업만 열기 1탭이 추가되는지 기록한다.
- [ ] 모델 테스트·lint·typecheck를 통과시키고 이 작업의 UI 변경만 커밋한다.

### Task 4: 준비 화면 정돈과 전체 흐름 검증

**Files:** Modify `src/App.tsx`의 `workout-landing`, `PersonalRoutines` 배치; Modify `src/App.css`; Update 관련 제품·디자인·검증 문서.

**Interfaces:**
- Consumes: 기존 최근 운동/추천 루틴/내 루틴 선택 상태, `themePicker`, `start`, BottomCTA, `persist`.
- Produces: 추가 필수 단계 없는 준비 화면과 검증 산출물. 선택/시작 API는 변경하지 않는다.

- [ ] 선택한 구성 → 최근 운동 최대 3개 → 추천 루틴 선택과 내 루틴 순서로 정돈한다. 테마 바로가기는 기본 접힘으로 하고 기존 별도 루틴 화면과 BottomCTA를 유지한다. 테마 탐색은 펼치기 1탭이 추가되므로 초기 화면 단순화의 효과와 함께 검증 기록에 명시한다.
- [ ] 자유 운동·최근 운동·추천 루틴·내 루틴에서 각각 시작하고, 루틴 선택 취소 시 이전 구성이 보존되는지 확인한다. 실제 최근 값은 유지하고 예시 값은 섞지 않는다.
- [ ] 실제 입력·완료 → 홈 이동 → 새로고침 → 이어하기에서 무게·횟수·완료·휴식·메모를 확인하고 완료 저장 → 최근 기록/분석 반영을 확인한다. 저장 실패는 별도 테스트 프로필에서 기록 쓰기 실패를 주입해 실패 안내와 재시도, 읽기 실패 시 덮어쓰기 방지를 확인한다. 운영 사용자 저장소를 조작하지 않는다.
- [ ] 320×740·390×844 캡처와 실제 키보드 표시 상태를 확인한다. 마지막 입력·세트 추가·메모가 CTA/탭바 뒤에 가리지 않고, 오류 안내·관리 접기·휴식 갱신에도 입력이 유지되는지 확인한다.
- [ ] `bash scripts/check.sh`로 기존 테스트와 새 모델 테스트, ESLint, TypeScript, 웹 빌드, `.ait` 생성까지 확인한다. 실패 없이 통과한 실행 결과만 문서에 기록한다.
- [ ] 구현된 기능만 제품 문서에 반영하고 `docs/verification.md`에 조작 수 변화·캡처 경로·브라우저/실기기 구분을 남긴다. 이 계획의 완료 항목만 체크하고 최종 변경을 커밋한다.

## 자체 검토와 실행 권고

디자인의 각 항목은 Task 1~4에 대응한다. 새 모델 함수의 타입·실제 세션 출처는 Task 1과 Task 3에서 일치하며, Review Focus의 다섯 조건을 자동 테스트 또는 구체적인 브라우저 조작으로 검증한다. 스타일을 그대로 재검증하는 단위 테스트나 신규 UI 테스트 의존성은 추가하지 않는다.

같은 `App.tsx`와 `App.css`를 순서대로 수정하므로 이 세션에서 순차 실행하는 방식을 권한다. 모델 검증 후 시각 변경을 적용하고 전체 흐름을 마지막에 검토한다. 이 문서는 계획만이며 아직 코드 구현·메인 병합·배포를 수행하지 않았다.
