# 운동노트

Strong의 빠른 세트 기록, 루틴, 휴식 타이머, 운동 통계를 참고한 Apps in Toss 운동 기록 앱입니다. React 18, TypeScript, Vite, TDS로 구현했습니다. 사용자 요청에 따라 TDS blue primary(`#3182F6`)를 사용합니다.

## 실행

Node.js 24 이상이 필요합니다.

```sh
npm install
npm run dev
```

이 컴퓨터에는 `/opt/homebrew/opt/node/bin`에 Node 25가 설치되어 있습니다. 기본 Node가 22로 잡히면 다음과 같이 실행합니다.

```sh
PATH=/opt/homebrew/opt/node/bin:$PATH npm run dev
```

## 화면과 기능

- **홈**: 월요일 기준 주간 활동, 누적 운동 시간, 최근 운동 기록 및 상세 보기.
- **운동**: 별도 추천 루틴 화면에서 등·가슴·하체·푸시데이·풀데이 및 상체·전신 루틴 선택, 하단 TDS BottomCTA로 시작하는 자유 운동, 종목 검색과 부위 필터, 세트 추가, 무게와 횟수 입력, 완료 체크, 90초 휴식 타이머, 메모, 완료 기록 저장.
- **대시보드**: 최근 1주·4주·3개월 요약, 최근 4개 달력 주의 운동량 그래프, 기간 내 종목별 최고 세트 무게.

실제 기록이 없는 첫 방문에는 빈 상태가 표시됩니다. `예시 보기`를 누르면 샘플 기록으로 화면을 둘러볼 수 있습니다. 예시 기록은 실제 저장 데이터나 통계에 섞이지 않습니다.

기록과 진행 중인 운동은 토스 호스트에서는 네이티브 `Storage`, 브라우저에서는 `localStorage`의 `workout-log-v1`에 저장됩니다. 기존 웹 기록은 네이티브 기록이 없을 때 검증 후 이관하며 원본을 남깁니다. 새로고침 후에도 이어서 기록할 수 있습니다. 기기 간 동기화와 로그인은 아직 구현하지 않았습니다. 저장 실패는 재시도 안내를 표시하며, 읽을 수 없는 기존 데이터는 자동 덮어쓰지 않습니다.

운동량은 완료한 세트의 `무게 × 횟수` 합계이며, 맨몸 운동은 입력한 무게가 0이면 운동량 합계에서 0kg으로 계산됩니다. 완료 체크한 세트만 저장됩니다. 기본 루틴은 현재 고정된 템플릿이며 루틴 생성·편집은 다음 단계입니다.

## 검증과 빌드

```sh
npm run lint
npm run build
```

`build`는 TypeScript 검사, 웹 빌드, `.ait` 번들 생성을 순서대로 실행합니다. 번들 이름은 `ait-workout.ait`입니다. 개발 서버에서는 Apps in Toss devtools가 제공되며 배포 번들에서는 제외됩니다.

브라우저 검증 결과는 [docs/verification.md](docs/verification.md)에 있습니다. 실제 토스 앱에서의 키보드, 뒤로가기, safe area 동작은 업로드 후 기기 확인이 필요합니다.

## 참고

공식 SDK 연결 현황과 대시보드 광고 슬롯 설정은 [docs/sdk-integration.md](docs/sdk-integration.md)에 정리했습니다. 운영 광고 그룹 ID가 없으면 광고는 비활성화됩니다.

- [Strong Google Play 소개](https://play.google.com/store/apps/details?id=io.strongapp.strong&hl=ko)
- [TDS 컴포넌트](https://developers-apps-in-toss.toss.im/design/components)

Strong의 로고·이미지·카피를 사용하지 않았습니다. 앱 이름은 임시 이름인 `운동노트`입니다.

## 개발 하네스

앱의 목적·사용자 흐름·화면별 책임·개발 기조는 [docs/product-direction.md](docs/product-direction.md)에, 에이전트 작업 지침은 [AGENTS.md](AGENTS.md)에 있습니다.

새 체크아웃에서는 `bash scripts/setup.sh`, 개발은 `bash scripts/dev.sh --host 127.0.0.1`, 전체 검증은 `bash scripts/check.sh`를 사용합니다. Node 버전 선택·작업 절차·GitHub CI는 [docs/harness.md](docs/harness.md)에 정리되어 있습니다.
