# 개발 하네스

Codex에서 새 체크아웃으로도 같은 절차로 설치·실행·검증할 수 있는 구성이다. 서버나 로그인은 필요하지 않다.

## 하네스의 구성과 읽는 순서

하네스는 실행 스크립트뿐 아니라 앱의 목적과 개발 판단 기준을 함께 제공한다.

1. `AGENTS.md`: 에이전트의 진입점, 필수 문서와 작업 우선순위.
2. [product-direction.md](product-direction.md): 앱이 하는 일, 핵심 흐름, 화면별 책임, 개발 기조, 현재 지원 범위.
3. [design-guide.md](design-guide.md), [workout-screen-design.md](workout-screen-design.md): 플랫폼 제약과 화면 구성 기준.
4. 이 문서와 `scripts/`: 재현 가능한 설치·실행·검증 절차.
5. `.github/workflows/check.yml`: 저장소 변경의 자동 검증.

## 실행 순서

```sh
bash scripts/setup.sh
bash scripts/dev.sh --host 127.0.0.1
bash scripts/check.sh
```

- `setup.sh`: Node 24 이상 확인 후 `npm ci`로 잠금 파일과 같은 의존성을 설치한다. 재실행 가능하다.
- `dev.sh`: 같은 런타임으로 Vite 실행. 인자를 그대로 전달하므로 `--port 5174 --strictPort`로 검증용 서버를 실행할 수 있다. Ctrl+C로 종료한다.
- `check.sh`: 저장소 단위 테스트 → ESLint → TypeScript → 웹 번들 → Apps in Toss `.ait` 번들까지 검증한다. 실패하면 오류 코드로 종료한다.
- `runtime.sh`: 현재 Node가 24 미만일 때 이미 설치된 Homebrew Node를 확인한다. Node를 자동으로 설치하지 않는다.

다른 환경에서는 `nvm use` 또는 `.nvmrc`의 Node 24를 설치해 실행한다. 개별 검증은 `npm run lint`, `npm run typecheck`, `npm run build:web`로 실행할 수 있다.

## 작업 절차

1. `AGENTS.md`, `docs/product-direction.md`와 수정할 화면의 명세를 읽는다.
2. 해당 화면의 목적, 변경할 요소와 영향받는 흐름을 정리한다.
3. 필요한 부분을 수정한다. TDS 컴포넌트 API는 설치된 타입 선언 또는 공식 문서로 확인한다.
4. 모바일 렌더와 실제 상호작용을 확인한다. 테스트를 이유로 사용자 기록을 바꾸지 않는다.
5. 전체 검증 후 변경 이유·검증 결과·남은 제한을 보고한다.

## 자동 검증

`.github/workflows/check.yml`은 push와 pull request에서 Node 24, `npm ci`, `npm run check`를 실행한다. 저장소 읽기 권한만 사용하고 배포하지 않는다. 브라우저 시각 검증은 현재 수동 절차다.

첫 버전은 로컬 저장 기반이다. 운동 화면·단일 선택·세트 기록·완료 저장 등의 흐름은 `src/App.tsx`에 있다. 디자인 명세는 `docs/workout-screen-design.md`, 검증 기록은 `docs/verification.md`를 참조한다.
