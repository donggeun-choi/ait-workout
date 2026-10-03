# 커뮤니티 API와 운영

Node 24의 `node:http`와 `node:sqlite` 기반 실제 서버다. DB 기본 경로는 `data/community.sqlite`이며 재시작 후에도 유지된다. 개인 운동 저장소를 읽거나 쓰지 않는다. 공개 스냅샷은 사용자가 전송한 기록이며 실제 운동 수행을 보증하지 않는다.

## 실행과 운영 활성화

`npm run dev:community`는 127.0.0.1:5194에서 명시적으로 개발 인증을 허용한다. 개발 사용자는 `identityKind: development`로 구분한다. 개발 인증은 NODE_ENV=development, 허용 플래그, 연결 원격 주소 loopback을 모두 확인하며 운영에서 항상 거부한다. 클라이언트 개발 설정 역시 운영 번들에서 켜지 않는다.

`npm run start:community`는 운영 모드다. `server/.env.server.example`의 환경 변수를 배포 환경에 설정한다. 다음 항목이 없으면 시작이 실패한다: 토스 mTLS 인증서/키, `COMMUNITY_PUBLIC_ENABLED=true`, 32자 이상 운영 토큰, HTTPS 개인정보 처리 안내 URL, 운영 담당자 연락처, 콘솔에 등록한 Basic 인증 값. 준비하지 않은 정책이나 담당자를 있다고 표시하지 않는다. 정책의 법적 적합성은 별도 출시 준비다. 공개 활성화·콘솔 설정·자격 증명 발급·배포는 이 구현에 포함하지 않았다.

운영은 HTTPS 역방향 프록시 뒤 단일 서버 인스턴스와 영속 볼륨으로 시작한다. SQLite를 여러 호스트에서 공유하지 않는다. 운영 시스템에서 DB와 WAL 파일을 함께 일관성 있게 백업하고 접근을 제한한다. 운영 DB를 개발 인증 서버에 연결하지 않는다. `COMMUNITY_ALLOWED_ORIGINS`는 쉼표로 분리한 정확한 웹 출처 목록이며 와일드카드는 지원하지 않는다. 프록시 신뢰 헤더로 개발 인증이나 권한을 인정하지 않는다.

## 인증

토스 `appLogin()`의 `{authorizationCode,referrer}`를 `POST /api/community/auth/toss`로 보낸다. 서버가 공식 mTLS API generate-token → login-me를 호출하고 검증된 userKey만 내부 계정과 연결한다. 사용자 이름·휴대전화·토스 access/refresh token은 저장하거나 피드로 반환하지 않는다. 운영에서는 SANDBOX 로그인을 거부한다. 클라이언트 userId 필드는 거부한다.

서비스 토큰은 32바이트 무작위 bearer이며 서버 DB에는 SHA-256 해시만 저장한다. 기본 만료는 1시간이고 로그아웃·탈퇴 시 폐기한다. 로그인 만료는 401 AUTH_EXPIRED다. 개발에서 `POST /auth/dev {identity}`는 `{token,user}`를 반환한다. 이 ID는 개발 서버에서만 의미가 있다.

공식 근거: [토스 로그인 서버 API](https://developers-apps-in-toss.toss.im/documentation/common/authentication/toss-login), [유저 정보 철회 콜백과 테스트 요청](https://developers-apps-in-toss.toss.im/guide/authentication/user-info). 문서 확인일 2026-10-03.

콘솔 연결 해제 콜백은 `/api/community/auth/withdrawal-callback` GET 또는 POST다. `Authorization: Basic ${TOSS_CALLBACK_BASIC_AUTH}`를 timing-safe 비교한다. 변수 값은 `Basic ` 뒤의 정확한 base64 값이다. 서버 검증 없이 userKey만 보내면 401이다. userKey 0은 콘솔 테스트 응답만 하며 데이터는 바꾸지 않는다. 실제 userKey는 기존 토스 계정에 매칭하여 커뮤니티 데이터를 파기한다. 이 서버는 별도 유저 정보 기능을 사용하지 않으므로 anonKey만 있는 철회 요청은 400이다.

서비스 내 탈퇴도 로컬 커뮤니티 데이터 파기를 먼저 완료하고 mTLS userKey 연결 해제를 호출한다. 원격 실패 시 결과의 remoteDisconnected=false와 개인정보 없는 운영 이벤트를 남긴다. 이 경우 운영 담당자가 연결 해제를 해결해야 한다. 원격 실패가 로컬 파기를 되돌리지 않는다. 토스 콜백은 이미 존재하지 않는 계정에 반복해도 성공한다.

## HTTP 계약

모든 경로 접두사는 `/api/community`. 오류는 `{error:{code,message}}`. 참여 요청에는 `Authorization: Bearer TOKEN`이 필요하다. 공개 읽기는 로그인 없이 가능하다. 존재하는 잘못된/만료 토큰은 익명으로 낮춰 처리하지 않는다.

| 요청 | 입력 / 응답 |
|---|---|
| GET /health | `{status:'ok',auth:'development'|'toss'|'unavailable'}`. 사용자 수·운동 수를 꾸며내지 않음 |
| GET /policy | `{rules,retentionDays,policyUrl,operatorContact}`. 미설정 정보는 null |
| POST /auth/toss | `{authorizationCode,referrer:'DEFAULT'|'SANDBOX'}` → `{token,user}` |
| POST /auth/dev | `{identity}` → `{token,user}`. 명시적 loopback 개발 전용 |
| DELETE /auth/session | 현재 세션 폐기 |
| GET /me | `{user}` |
| PATCH /me | `{nickname,rulesAccepted:true}` → `{user}` |
| DELETE /me | 커뮤니티 탈퇴 → `{ok:true,remoteDisconnected}` |
| GET /feed?cursor=N | 최신 게시물 20개 → `{posts,nextCursor}` |
| GET /me/posts?cursor=N | 로그인 계정의 활성 인증만. 동일 페이지 형식 |
| POST /posts | 아래 스냅샷 → `{post,duplicate}`. 최초 201, 재시도 200 |
| DELETE /posts/:id | 본인 인증 삭제. 반복 삭제 성공 |
| PUT /posts/:id/cheer | `{active:boolean}` → `{post}`. 반복 desired-state 요청은 같은 결과 |
| POST /posts/:id/report | `{reason:'abuse'|'spam'|'privacy'|'other'}`. 반복 접수 중복 없음 |
| GET /blocks | `{users:[{id,nickname}]}` |
| PUT /blocks/:authorId | `{active:boolean}` 차단/해제 |

user는 `{id,nickname,rulesAccepted,identityKind:'toss'|'development'}`다. 닉네임은 2–12 grapheme이며 연락처·URL 형식을 거부한다. 처음 게시하기 전 닉네임과 정책 동의가 필요하다(409 PROFILE_REQUIRED). 소감은 최대 100 grapheme. 응원은 자신에게 할 수 없다. 계정 제한은 참여와 로그인 차단, 공개 게시물/응원 숨김을 적용하며 기존 세션으로 탈퇴/로그아웃은 허용한다.

게시 입력 예시:

```json
{"workoutId":"local-record-key","idempotencyKey":"random-request-key","workoutDate":"2026-10-01","exerciseCount":1,"completedSetCount":1,"comment":"오늘도 완료","visibility":{"names":false,"weights":false,"reps":false}}
```

기본 공개는 날짜·종목 수·완료 세트 수·닉네임·선택 소감이다. 선택 공개 시 exercises는 종목 수만큼 `{name?,sets?:[{weight?,reps?}]}`를 전송한다. name은 names=true일 때만, weight는 weights=true일 때만, reps는 reps=true일 때만 허용한다. 세트 공개 시 전체 세트 수는 completedSetCount와 일치해야 한다. 이름만 공개할 때 sets는 보내지 않는다. 아무 옵션도 공개하지 않으면 exercises는 생략하거나 빈 배열이어야 한다. 개인 note·총 운동량·상세 시각과 알 수 없는 필드는 모두 400으로 거부한다. 소감에 직접 적은 정보는 공개되므로 미리보기와 개인정보 안내가 필요하다. 서버는 임의 HTML을 실행하지 않으며 클라이언트는 텍스트 렌더링을 사용한다.

post는 `{id,authorId,nickname,workoutDate,exerciseCount,completedSetCount,comment,visibility,exercises,createdAt,cheerCount,cheeredByMe,isMine}`다. workoutId는 본인 인증 응답에만 포함한다. 공개 원본은 복사본이므로 기기 기록 수정·삭제가 스냅샷을 변경하지 않는다. 운동 키 소유권은 로그인 계정 아래에 이름 공간으로 분리하며 서버가 기기 기록 자체를 검증한다는 뜻이 아니다.

SQLite의 활성 (author,workout) 고유 제약과 (author,idempotencyKey) 요청 기록, 직렬 트랜잭션으로 중복 게시를 막는다. 같은 요청 키를 다른 내용으로 재사용하면 409 IDEMPOTENCY_CONFLICT다. 삭제 후 같은 요청 키 재전송은 410 POST_DELETED, 새 키는 새 인증을 만들 수 있다. 운영 숨김도 활성 중복 제약에 포함한다. 피드는 게시 순서 커서로 조회하며 차단 관계·신고자의 숨김·운영 숨김·제한 계정을 SQL에서 필터한다. 차단은 양방향 피드 접근에 적용하고 로그인 사용자의 응원 수에서도 차단 계정은 제외한다. 로그아웃한 공개 조회에는 개인 차단 필터가 없다.

## 운영 화면과 보관

`/api/community/admin-ui`는 운영 토큰 입력 화면이다. 데이터와 조작은 서버가 bearer 운영 토큰을 검사한 뒤 제공한다. 토큰은 페이지 메모리에만 존재하며 댓글/소감 등은 textContent로 렌더한다. 신고 사유·공개 스냅샷을 검토하고 인증 숨김/복구·계정 제한/해제·신고 완료/기각을 처리한다. 신고 수로 자동 삭제하지 않는다. 운영 API는 일반 사용자의 기기 운동 기록을 조회할 수 없다.

| 운영 요청 | 동작 |
|---|---|
| GET /admin/reports | 최근 100개 신고와 현재 공개 맥락 |
| PATCH /admin/posts/:id `{hidden}` | 숨김/복구 |
| PATCH /admin/users/:id `{restricted}` | 참여 제한/해제 |
| PATCH /admin/reports/:id `{status:'reviewed'|'dismissed'}` | 처리 상태 |
| GET /admin/audit | 최근 운영 이력 |
| POST /admin/purge | 보관 기간 만료 자료 정리 |

신고와 운영 이력의 구현 기본 보관 기간은 모두 30일이다. `COMMUNITY_RETENTION_DAYS`(1–365일)로 변경하고 공개 처리 안내도 동일하게 갱신한다. 시작 시와 매시간 자동 정리하며 운영 purge API로 즉시 실행할 수 있다. 신고 숨김은 신고 보관 기간 동안 유지되고 이후 게시물이 다시 보일 수 있으므로 계속 숨기려면 계정 차단을 사용한다. 탈퇴 즉시 게시물·응원·차단·세션·계정·중복 요청 자료를 제거한다. 관련 신고는 reporter/post 참조를 제거하고 reason/status/time만 남긴다. 관련 운영 이력도 계정/게시물 대상 참조를 제거한다. 기기 기록은 별도 선택이며 서버가 지우지 않는다. 사용자 삭제 게시물은 내용 `{}`로 비우고 중복 재시도 방지용 키를 계정 탈퇴까지 보유한다.

로그인은 연결 주소당 분당 20회, 일반 참여는 계정당 분당 120회, 게시 10회, 응원 60회, 신고 10회다. 카운터는 DB에 저장한다. 본문은 최대 64KiB다. 운영에서는 프록시가 추가 연결/요청 한도를 설정한다. API가 공개될 때 담당자가 신고 대기 목록을 실제로 확인해야 한다.

검증: `node --test tests/community-server.test.mjs`. 재시도·동시 제출·계정 권한·개발/운영 인증 분리·선택 공개 검증·grapheme·신고·차단·숨김·탈퇴·영속 저장·20개 페이지를 통합 검증한다. 실제 토스 서버 연동은 발급된 mTLS와 콘솔 설정으로 별도 기기 검증해야 한다.
