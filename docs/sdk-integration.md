# 공식 API·SDK 연결 현황

2026-10-01 Apps in Toss 공식 문서와 설치된 `@apps-in-toss/web-framework` 3.2.0 타입을 확인했다. 아래 우선순위는 이 앱의 제품 판단이며 모든 API가 플랫폼 필수 요건이라는 뜻은 아니다.

## 앱에 적용할 동작

| 영역 | 공식 API·설정 | 현재 상태 | 다음 작업과 검증 |
| --- | --- | --- | --- |
| 상단 뒤로가기 | `navigationBar.withBackButton`, `graniteEvent.addEventListener('backEvent')` | 연결됨. 시트 종료·내부 이력 복귀, 최초 화면은 기본 종료 | 토스 상단 버튼·Android 뒤로가기·첫 화면 종료를 기기 검증 |
| 하단 안전 영역 | `SafeArea.get()`, `SafeArea.subscribe()` | CSS `env()`와 최소 34px 사용. SDK 연결 전 | 실제 WebView inset을 확인하고 CSS 변수에 연결, 변화 구독 해제. 키보드와 CTA 겹침 우선 확인 |
| 기록 보존 | `Storage.getItem/setItem` | 웹 `localStorage` 사용. 네이티브 전환 전 | 전환 시 비동기 초기 로딩·기존 기록 이관·저장 순서·실패 복구 설계가 필요. 즉시 교체해 기존 기록을 잃지 않도록 별도 변경으로 진행 |
| 운동 중 화면 유지 | `setScreenAwakeMode({ enabled })` | 미연결, 선택적 기능 | 필요할 때 운동 진행 화면에만 적용하고 화면 이탈·운동 종료 시 해제. 배터리와 사용자 의도 고려 |
| 세트 완료 피드백 | `generateHapticFeedback()` | 미연결, 선택적 기능 | 체크 시 가벼운 피드백만 검토. 입력마다 진동하거나 실패를 기록 흐름에 전파하지 않음 |
| 배너 광고 | `TossAds.initialize/attachBanner` | 대시보드 하단 슬롯 구성 | 실제 광고 그룹 ID 발급 후 운영 설정, 콘솔 QR로 렌더·클릭 후 복귀·노필·화면 이탈 정리 검증 |
| 로그인·공유·결제·권한 | `appLogin`, `share`, IAP 등 | 현재 제품 흐름에는 연결하지 않음 | 계정·동기화·유료 기능 등 제품 범위가 정해질 때 도입. 기록 시작의 필수 절차로 넣지 않음 |

### 저장소 주의점

웹 저장소는 origin 기준이다. 공식 문서에 따르면 QR 테스트와 출시 환경의 웹 저장소는 공유되지 않는다. 이 차이는 자동 동기화나 백업을 의미하지 않는다. 네이티브 `Storage`도 토스 앱 삭제 시 데이터가 삭제되므로 영구 백업 수단으로 안내하지 않는다.

## 광고 슬롯

- 위치: 대시보드의 모든 통계·안내 다음, 스크롤 콘텐츠 내부의 전체 너비 배너 1개.
- 운동 준비·진행·루틴 선택·시트에는 광고를 넣지 않는다. 운동 초안이 존재하면 대시보드에서도 광고를 부착하지 않는다. 예시 보기에서도 노출하지 않는다.
- `TossAds` 지원 여부를 확인하고 SDK 초기화를 공유한다. StrictMode나 탭 재진입으로 중복 초기화하지 않는다.
- 배너 부착 시에는 비어 있는 DOM을 전달한다. SDK가 광고의 UI·표시를 그리며 앱이 가짜 배너나 광고 버튼을 만들지 않는다.
- 초기화 실패·미지원·노필·렌더 실패 시 슬롯을 제거한다. 화면 이탈 시 해당 인스턴스의 `destroy()`를 호출한다. 자체 광고 갱신 타이머를 만들지 않는다.
- 전면 광고나 광고 시청을 요구하는 저장 단계는 추가하지 않는다.

### 설정 방법

개발 서버는 공식 리스트형 테스트 ID `ait-ad-test-banner-id`만 사용한다. 운영 빌드는 `VITE_TOSS_BANNER_AD_GROUP_ID`가 비어 있으면 광고를 요청하지 않는다. 광고 그룹 ID는 공개 식별자이며 API 키를 넣는 변수가 아니다.

실제 ID 발급 후 `.env.example`을 참고해 배포 환경에 `VITE_TOSS_BANNER_AD_GROUP_ID`를 설정하고 다시 빌드한다. 개발 검증에 운영 ID를 사용하지 않는다. 현재는 사용자의 요청에 따라 슬롯만 구성했고 콘솔 광고 그룹 생성·운영 광고 활성화는 수행하지 않았다.

공식 문서는 배너 API를 토스 앱 5.241.0 이상에서 지원한다고 안내한다. 샌드박스는 광고를 지원하지 않으므로 콘솔 QR 테스트 경로를 사용한다. 로컬 브라우저에서는 지원 여부에 따라 슬롯이 제거될 수 있으며, 이는 실제 광고 송출 검증을 대신하지 않는다.

## 공식 근거

- [네비게이션 바 설정](https://developers-apps-in-toss.toss.im/documentation/common/navigationbar)
- [화면 이벤트](https://developers-apps-in-toss.toss.im/documentation/common/screen/event)
- [SafeArea](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/safearea)
- [Storage와 웹 저장소 환경 차이](https://developers-apps-in-toss.toss.im/documentation/api-and-sdk-en/common/file-storage/storage)
- [화면 속성](https://developers-apps-in-toss.toss.im/documentation/common/screen/properties)
- [WebView 배너 광고](https://developers-apps-in-toss.toss.im/documentation/common/monetization/iaa/web-banner)
- [광고 그룹 콘솔 설정](https://developers-apps-in-toss.toss.im/guide/monetization/in-app-ad)
- [비게임 출시 체크리스트](https://developers-apps-in-toss.toss.im/checklist/app-nongame)
