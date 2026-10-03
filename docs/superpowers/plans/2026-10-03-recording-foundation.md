# 기록 신뢰성과 최근 운동 재사용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 입력·저장 상태를 정확히 보여주고 기존 초안을 지키면서 최근 운동의 구성을 다시 사용한다.

**Architecture:** 기존 Storage 직렬 쓰기를 유지하고 저장 상태를 추적하는 작은 독립 모듈을 추가한다. 운동 타입과 복사 규칙을 순수 함수로 분리하고 App은 TDS 화면 연결을 담당한다. 기존 저장 키와 JSON 구조는 바꾸지 않는다.

**Tech Stack:** React DOM 18, TypeScript, Vite, 설치된 TDS, Node 24 node:test.

**Spec:** `docs/superpowers/specs/2026-10-01-workout-community-design.md` §3~6, §9의 기록 기반 부분.

## Global Constraints

- 운동 입력과 세트 완료를 저장 상태·타이머·확인창으로 막지 않는다.
- 완료 저장 성공 후에만 결과 시트를 표시한다. 실패 시 초안과 원본 보존.
- 키 `workout-log-v1`, 네이티브 우선, 기존 웹 이관 규칙 유지.
- TDS 사용. primary #3182F6, 본문 15px 이상, 숫자 입력 16px, 터치 44px, safe area 최소 34px.
- 사용자 운동을 건드리지 않도록 별도 포트·브라우저 세션으로 검증.
- 커뮤니티·로그인·루틴 CRUD·광고 운영 활성화는 이 계획에 포함하지 않는다.
- Node 24 이상, npm 잠금 파일 유지. 새 의존성 불필요.

## Review Focus

1. 오래된 쓰기 성공/실패가 최신 입력의 저장 상태를 잘못 바꾸지 않아야 한다 — Task 1 테스트.
2. 자동 저장 실패 후 새 입력 없이 재시도할 수 있어야 한다 — Task 1 테스트·브라우저 검증.
3. 완료 저장 대기 중 다른 탭의 입력/재시도 때문에 초안이 되살아나지 않아야 한다 — Task 1 테스트·브라우저 검증.
4. 최근 운동 복사와 예시 보기가 실제 원본을 변경하거나 예시를 새 기록으로 가져오지 않아야 한다 — Task 2 테스트·Task 3 브라우저 검증.
5. 초안이 존재하면 다시 하기가 기존 입력을 덮어쓰지 않아야 한다 — Task 2 테스트·Task 3 브라우저 검증.

## 파일별 책임

- `src/workout-model.ts`: SetRow, Exercise, Session, Draft, Saved 타입과 재사용 가능한 순수 복사 함수.
- `src/save-state.ts`: revision과 저장 결과를 추적하는 저장 상태 모듈. Storage 쓰기 자체는 하지 않음.
- `src/record-storage.ts`: 기존 직렬 Storage 포트. 변경 필요 시 회귀 테스트 유지.
- `src/App.tsx`: 입력→상태 표시·재시도·완료 저장, 최근 운동 선택과 미리보기 연결.
- `src/App.css`: 상태 영역·최근 운동 목록의 최소 레이아웃만 추가.
- `tests/save-state.test.mjs`, `tests/workout-model.test.mjs`: 기존 TS transpileModule 패턴의 독립 테스트.
- 제품/운동 화면/검증 문서: 해당 기능 구현 후 현재 범위 갱신.

### Task 1: 저장 상태·재시도를 정확히 연결

**Files:** Create `src/save-state.ts`, `tests/save-state.test.mjs`; Modify `src/App.tsx`, `src/App.css`; regression `tests/record-storage.test.mjs`.

**Interfaces:**

- `SaveStatus = 'saving' | 'saved' | 'error'`.
- `createSaveTracker(): { begin(): number; resolve(revision: number): SaveStatus; reject(revision: number): SaveStatus; status(): SaveStatus }`.
- 초기 tracker 상태는 saved. begin은 revision 증가와 saving, resolve/reject는 최신 revision에만 상태 변경. 과거 응답은 현 상태 반환.
- UI 재시도는 현재 `data` snapshot을 `recordStorage.write`에 제출한다. 읽기 실패(initial.error) 상태에서는 쓰기 재시도를 제공하지 않고 기존 새로고침 안내 유지.

- [ ] 최신 요청의 상태만 반영하는 실패 테스트 작성: begin A → begin B → resolve A는 saving, reject B는 error; begin C → reject A는 saving → resolve C는 saved.
- [ ] `bash -c 'source scripts/runtime.sh; node --test tests/save-state.test.mjs'` 실행, 모듈 부재로 실패 확인.
- [ ] tracker 구현. App 자동 저장/명시 완료 저장의 모든 요청에 동일 revision 추적 적용. 완료 저장은 자동 저장 큐 뒤에 제출하며 성공 시 setData와 결과 시트 반영. 성공 후 같은 데이터의 자동 재저장이 실패 상태를 만드는 중복 제출을 피한다.
- [ ] 입력 변화마다 저장을 시작하고 status 표시. 문구는 `저장 중`, `저장됨`, `저장하지 못했어요`; 오류에는 TDS Button `다시 시도`. 기록 화면의 기존 입력을 재마운트하지 않는다. 다른 세트 입력을 inert로 만드는 조건은 완료 저장 요청 동안만 유지.
- [ ] 재시도 실패→성공과 오래된 완료 요청 상태 테스트 추가. 완료 저장 중 재시도 버튼은 중복 요청을 만들지 않도록 비활성화. 다른 탭에서 새 운동 시작도 기존 saving guard 적용.
- [ ] `bash -c 'source scripts/runtime.sh; npm run test && npm run typecheck'` 통과 확인.
- [ ] 별도 브라우저에서 Storage.setItem에 한 번 실패를 주입해 입력 유지·오류·현재값 재시도·새로고침 복원 확인. 초기 읽기 실패 상태에서 새 빈 기록을 쓰지 않는지 확인.
- [ ] 관련 파일만 커밋: `feat: show accurate recording save state and retry`.

### Task 2: 최근 운동 복사 규칙을 독립 검증

**Files:** Create `src/workout-model.ts`, `tests/workout-model.test.mjs`; Modify `src/App.tsx` 타입 import.

**Interfaces:**

- App의 기존 타입을 이름과 필드 변경 없이 `workout-model.ts`로 옮기고 export.
- `copySessionToDraft(session: Session, started: number, makeId: () => string): Draft`: 완료 세트만 복사, 세트 없는 종목 제외. 모든 종목/세트 ID 새로 생성, done=false, note='', restUntil=null, started는 인자. name·종목 name/muscle·weight/reps·순서 유지.
- `prepareRepeat(data: Saved, session: Session, started: number, makeId: () => string): Saved`: draft가 있으면 동일 data 반환; 없으면 sessions 참조는 유지하고 새 draft 포함.

- [ ] 원본 60kg×8회 완료와 미완료 세트를 가진 fixture로 실패 테스트 작성: 완료 세트만 1개, done=false, note='', restUntil=null, started 고정값, 원본 JSON 불변, 복사값 수정 후 원본 불변. 새 ID가 원본과 다름을 확인.
- [ ] `bash -c 'source scripts/runtime.sh; node --test tests/workout-model.test.mjs'` 실행, 모듈 부재 실패 확인.
- [ ] 함수와 타입 구현, App 타입 선언을 import로 교체. 기존 load validation·저장 형식 변경 없음.
- [ ] 초안 존재 시 prepareRepeat 반환이 원본과 동일하고 초안 값이 유지되는 테스트 추가. 0세트 종목 제외·여러 종목 순서·맨몸 0kg·문자열 소수 무게 보존 테스트 추가.
- [ ] `bash -c 'source scripts/runtime.sh; npm run test && npm run typecheck'` 통과 확인.
- [ ] 커밋: `feat: define safe previous workout copying`.

### Task 3: TDS 최근 운동 선택·시작과 이어하기 검증

**Files:** Modify `src/App.tsx`, `src/App.css`, `docs/product-direction.md`, `docs/workout-screen-design.md`, `docs/verification.md`.

**Interfaces:** Task 2의 Session/Draft/Saved, copySessionToDraft/prepareRepeat 소비. 운동 준비의 기존 selectedRoutine와 별도로 `selectedPreviousId: string | null` 상태 사용. 선택 후 원본은 ID로 실제 data.sessions에서 찾는다.

- [ ] 기존 설치 TDS의 ListRow/BottomCTA 타입을 확인. 운동 준비에 실제 최근 운동 최대 3개를 최신 날짜순 TDS ListRow 단일 선택으로 제공. 예시 보기 데이터 사용 금지. 기존 루틴/테마 선택 시 selectedPreviousId 초기화, 최근 운동 선택 시 selectedRoutine 초기화.
- [ ] 선택한 최근 운동의 종목·완료 세트 수를 기존 준비 요약 위치에 표시. BottomCTA는 `지난 운동 다시 시작`. CTA 클릭 시 prepareRepeat로 초안 생성 후 운동 진행으로 이동. 기존 초안이 있으면 복사하지 않고 이어하기. 실시간 setData updater 안에서 최신 초안 확인.
- [ ] 데이터 로딩/읽기 오류에서는 최근 운동 시작으로 원본 저장을 시도하지 않음. 원본이 더 이상 없으면 선택 해제 후 자유 운동 준비 표시.
- [ ] 실제 홈 초안 이어하기 기존 동작 유지. 저장 결과→홈→이어하기는 초안을 새로 만들지 않음. 예시 상세에는 다시 하기 추가하지 않음.
- [ ] 별도 포트에서 기록 저장→최근 운동 선택→구성 확인→시작 2탭 확인. 60kg×8회 초기값·미완료 상태·빈 메모·시간 초기화·원본 기록 유지 확인. 새로고침 후 복원 및 두 번째 저장까지 확인.
- [ ] 320×740, 390×844 모바일 캡처. 가로 넘침·실제 글자 크기·44px 터치·CTA/탭 겹침·숫자 입력 중 저장 상태 갱신 시 포커스 유지 확인. 콘솔 오류 없음 확인.
- [ ] 제품·화면 문서의 현재 지원 범위 갱신. 검증 문서에 결과·조작 수·실기기 미검증 범위 기록.
- [ ] `bash scripts/check.sh` 실행: 단위 테스트·ESLint·TypeScript·웹·.ait 모두 성공. 한 번 통과 후 변경 없으면 반복 빌드하지 않음.
- [ ] 커밋: `feat: start workouts from previous recorded sessions`.

## 계획 자체 점검

본 계획은 전체 제품 설계의 기록 기반 첫 단계만 구현한다. 내 루틴 CRUD·기록 수정·휴식 설정·지난 종목 값 자동 제안은 다음 기록 계획, 서버 인증·피드·신고·차단은 별도 커뮤니티 계획이다. 4탭은 동작하는 커뮤니티 연결 시 도입하며 지금 가짜 피드 탭을 추가하지 않는다. 기본 광고 정책과 초안 존재 시 광고 금지는 유지한다.

## 실행 방식 제안

Native 권장: 같은 App의 저장 상태와 최근 운동 선택이 연결되고 과제 3개라 한 실행자가 순서대로 적용하는 편이 단순하다. 구현 완료 후 독립 리뷰와 저장·복원 흐름 검증을 수행한다. 실행 전에 이 계획 검토와 Native/Subagent-driven 방식 선택을 받는다.
