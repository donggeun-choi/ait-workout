# 공식 API·SDK 연결 현황

2026-10-01 Apps in Toss 공식 문서와 설치된 `@apps-in-toss/web-framework` 3.2.0 타입을 확인했다. 아래 우선순위는 이 앱의 제품 판단이며 모든 API가 플랫폼 필수 요건이라는 뜻은 아니다.

## 앱에 적용할 동작

| 영역 | 공식 API·설정 | 현재 상태 | 다음 작업과 검증 |
| --- | --- | --- | --- |
| 상단 뒤로가기 | `navigationBar.withBackButton`, `graniteEvent.addEventListener('backEvent')` | 연결됨. 시트 종료·내부 이력 복귀, 최초 화면은 기본 종료 | 토스 상단 버튼·Android 뒤로가기·첫 화면 종료를 기기 검증 |
| 하단 안전 영역 | `SafeArea.get()`, `SafeArea.subscribe()` | 연결됨. SDK inset·CSS `env()` 중 큰 값과 최소 34px 사용 | 변경 구독과 해제 구현. 실제 기기 키보드·CTA 겹침 확인 필요 |
| 기록 보존 | `Storage.getItem/setItem` | 연결됨. 네이티브 Storage 우선, 브라우저는 localStorage | 초기 로딩 후 기록 검증·이관, 원본 보존, 직렬 저장과 실패 재시도 구현. 기기 이관 검증 필요 |
| 운동 중 화면 유지 | `setScreenAwakeMode({ enabled })` | 연결됨 | 운동 진행 화면이 보일 때만 유지. 탭 이탈·백그라운드·운동 종료·언마운트 시 해제 |
| 세트 완료 피드백 | `generateHapticFeedback()` | 연결됨 | 유효한 세트를 완료할 때 tickWeak. 해제·입력 오류에는 진동하지 않고 SDK 실패는 기록 흐름에 전파하지 않음 |
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

## 저장과 지원 환경 처리

호스트 플랫폼 정보가 있으면 네이티브 Storage를 사용한다. 네이티브 읽기 실패 시 오래된 웹 데이터로 조용히 전환하지 않고 저장을 멈춘다. 네이티브 기록이 없을 때만 현재 origin의 기존 웹 기록을 검증해 이관하며 원본은 삭제하지 않는다. 이관 실패 시 읽은 기록을 표시하되 저장을 중단하고 재시도를 안내한다. 저장 요청은 직렬화해 과거 요청이 최신 기록을 덮어쓰지 않게 하며 완료 저장 성공 전에는 완료 시트를 표시하지 않는다.

화면 유지와 햅틱은 v3의 `Screen.setAwakeMode`, `Device.triggerHaptic`를 사용한다. 미지원·실패는 운동 기록을 막지 않는다. SafeArea는 `--host-safe-*` 변수에 반영하며 구독은 언마운트 시 정리한다.

v3 API 근거: [SDK v3](https://developers-apps-in-toss.toss.im/documentation/sdk/v3), [햅틱](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/device/device.triggerhaptic).
