# 관리자 감사 로그 설계

2026-10-19

## 이 문서의 목적

관리자 화면에서 일어난 변경(누가, 언제, 무엇을, 어떻게 바꿨는지)과 실패(무엇이, 왜 실패했는지)를 DB에 남기고,
관리자 헤더의 `로그` 탭에서 읽게 하는 설계다. 같은 변경으로 `requireAdmin`이 로그인 여부만 보던 문제
([`docs/TODO_list/auth/require-admin-role-check.md`](../TODO_list/auth/require-admin-role-check.md))를 닫는다.

---

## 1. 배경과 범위

### 1.1 요청

2026-10-19에 정한 것:

- 수정·등록 같은 변경을 **사람 단위로** 남긴다. 지금 관리자는 동우와 성웅(발주자, 비개발자)이 각자 계정을 쓴다.
  운영을 지속관리원에 넘길 때 사람마다 계정을 따로 쓰라고 안내한다.
- 사람이 한 변경과 기계가 한 변경(자동 번역, OSM 동기화, 운영 스크립트)을 모두 남긴다. 기계 변경은 "시스템"
  행위자로 표시한다.
- 실패도 남긴다. 사유는 "사진 업로드 실패"가 아니라 **왜 실패했는지**(네트워크 끊김, 서버 용량 한도 초과 등)로
  구분한다.
- 로그 유형은 `info` / `warning` / `error` 세 가지다. 로그 화면에서 유형 드롭다운으로 거른다.
- 로그 화면은 관리자 헤더의 탭이다. 목록은 한 줄 요약이고, 행을 누르면 상세 모달이 열린다.
- 표시 이름은 직책까지 담을 수 있게 20자까지 받는다(예: `김지원 선임연구원`).

### 1.2 역할을 나누지 않는 이유

기록에 필요한 것은 "누구인지"이지 "무엇을 할 수 있는지"가 아니다. 관리자가 모두 같은 권한이어도 사람마다 계정이
다르면 기록은 성립한다. 역할 분리가 처음 필요해지는 곳은 관리자 계정을 추가하는 화면이다. 계정을 만들 수 있는
사람은 관리자를 늘릴 수 있는 사람이기 때문이다. 그 화면은 이번 범위가 아니다
([`docs/TODO_list/auth/admin-account-management.md`](../TODO_list/auth/admin-account-management.md)).

### 1.3 이번 범위

1. 관리자 허용 목록 `admin_users`와 판별 함수 `is_admin()`
2. 변경 기록: 대상 테이블의 트리거
3. 실패 기록: 서버 `logFailure()`, 브라우저 `reportFailure()`, 공통 사유 분류 `classifyFailure()`
4. 관리자 `로그` 탭: 목록, 유형 필터, 상세 모달
5. 권한 적용: `requireAdmin`, 브라우저 쓰기 RLS, 관리자 화면 진입을 `is_admin()` 기준으로 맞춘다
6. CI의 DB 검증 잡: 마이그레이션과 트리거를 운영에 적용하기 전에 임시 DB에서 실행해 본다

범위 밖은 10장.

---

## 2. 저장 구조

### 2.1 `admin_users`: 관리자 허용 목록

| 칸             | 형식          | 내용                                                       |
| -------------- | ------------- | ---------------------------------------------------------- |
| `user_id`      | `uuid` PK     | `auth.users.id` 참조. 계정이 지워지면 행도 지운다          |
| `display_name` | `text`        | 로그에 보일 이름. 앞뒤 공백을 뺀 길이가 1~20자(check 제약) |
| `created_at`   | `timestamptz` | 기본 `now()`                                               |

관리 화면은 두지 않는다. Supabase Table Editor에서 행을 넣고 뺀다. 이 테이블은 `anon`·`authenticated`에
아무 권한도 주지 않는다. 읽기는 아래 `is_admin()`, 트리거(정의자 권한), 서버의 `isListedAdmin()`(service_role,
4.3)만 한다.

### 2.2 `is_admin()`

`auth.uid()`가 `admin_users`에 있는지 돌려주는 `security definer`·`stable` 함수다. RLS 정책, 관리자 화면 진입
확인(RPC), DB 검증이 모두 이 함수 하나를 기준으로 본다. `requireAdmin`은 서버에서 같은 테이블을 조회한다(6장).

### 2.3 `activity_logs`: 변경과 실패를 한 표에

| 칸                | 형식                 | 내용                                                                                                    |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`              | `bigint` identity PK |                                                                                                         |
| `occurred_at`     | `timestamptz`        | 실제 일이 일어난 시각. 브라우저가 늦게 보낸 실패는 브라우저 시각                                        |
| `recorded_at`     | `timestamptz`        | DB에 들어온 시각. 기본 `now()`                                                                          |
| `level`           | `text` check         | `info` / `warning` / `error`                                                                            |
| `kind`            | `text` check         | `change`(변경) / `failure`(실패)                                                                        |
| `actor_kind`      | `text` check         | `admin` / `system` / `visitor`                                                                          |
| `actor_id`        | `uuid` null          | 사람일 때 `auth.users.id`. 외래 키는 걸지 않는다(계정을 지워도 기록은 남아야 한다)                      |
| `actor_label`     | `text`               | 기록할 때의 이름 복사본. 3.3                                                                            |
| `action`          | `text`               | 변경이면 `insert` / `update` / `delete`. 실패면 작업 키(`<대상>.<동작>`, 예: `facility_photo.upload`)   |
| `target_table`    | `text` null          | 대상 테이블                                                                                             |
| `target_id`       | `text` null          | 대상 기본 키. 테이블마다 형식이 달라 문자열로 둔다                                                      |
| `target_label`    | `text` null          | 기록할 때의 대상 이름 복사본. 3.6                                                                       |
| `changes`         | `jsonb` null         | 변경 내용. 3.5                                                                                          |
| `reason_code`     | `text` null          | 실패 사유 코드. 4.4                                                                                     |
| `message`         | `text` null          | 사람이 읽는 실패 문장. 300자에서 자른다                                                                 |
| `detail`          | `jsonb` null         | 실패 원문 중 허용한 키만(4.4). 4KB를 넘으면 `{ truncated: true }`와 앞에서부터 들어가는 키까지만 남긴다 |
| `client_event_id` | `uuid` null, unique  | 브라우저 보고의 재전송 중복 제거용. 4.3                                                                 |

이름을 복사해 두는 이유: 대상이 지워지거나 이름이 바뀌어도 로그는 그때 이름으로 읽혀야 한다. `actor_id`와
`target_id`만 남기면 지운 시설의 기록은 "알 수 없는 대상"이 된다.

인덱스: `(occurred_at desc, id desc)`, `(level, occurred_at desc, id desc)`. 목록의 정렬·필터·`더 보기`가 이
두 순서만 쓴다(5.3).

### 2.4 접근 권한

- `activity_logs`는 RLS를 켜고, `authenticated`에 `select` 정책 하나만 둔다: `using (public.is_admin())`.
- `insert`·`update`·`delete`는 `anon`·`authenticated`에서 회수한다. 쓰기는 트리거(정의자 권한)와
  서버(service_role)만 한다.
- **로그는 고치지 않는다.** `before update or delete`(행 단위)와 `before truncate`(문장 단위) 트리거가 예외를
  던져 service_role도 행을 고치거나 지우지 못하게 한다. `TRUNCATE`는 `delete` 트리거를 부르지 않아 따로 막는다.
  나중에 보존 기간을 정해 지워야 하면 그 마이그레이션이 이 트리거를 잠시 끄고 지운다.

### 2.5 보존

정하지 않는다. 자동 삭제를 두지 않는다. 변경 한 건은 바뀐 칸만 담아 작고, 공개 API는 5xx만 남기므로(4.6) 봇이
기록을 불릴 길이 좁다. 용량이 문제가 되면 그때 기간을 정한다.

---

## 3. 변경 기록: 트리거

### 3.1 방식

대상 테이블마다 `after insert or update or delete ... for each row` 트리거로 공통 함수 `log_change()`를 건다.
변경 기록은 언제나 `level = info`, `kind = change`다.

기각한 대안:

- **저장 코드마다 기록 함수를 부른다.** 호출을 하나 빠뜨리면 조용히 누락된다. 전후 값을 얻으려면 저장 전에
  한 번 더 읽어야 한다. 브라우저에서 Supabase로 바로 쓰는 경로(시설·명소·경사도·건물 저장)는 브라우저가 기록을
  보내야 하므로 조작되거나 빠질 수 있다.
- **Supabase 감사 확장 `supa_audit`.** 행 전체를 전후 스냅샷으로 남긴다. 바뀐 칸만 남기기로 한 1.1과 다르고,
  service_role 경로에서는 누가 했는지 모른다. 결국 3.3의 행위자 처리를 다시 붙여야 한다.
- **행 전체 스냅샷(되돌리기 대비).** 되돌리기 기능을 붙일 수 있지만 저장량이 늘고, 화면에서 무엇이 바뀌었는지
  다시 계산해야 한다. 되돌리기는 요청에 없다.

### 3.2 대상 테이블

| 테이블                 | 기록하는 동작   | 비고                                                                                              |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `buildings`            | 등록·수정·삭제  | 삭제는 보통 `is_deleted` 수정으로 일어난다(5.5 표시 규칙)                                         |
| `building_facilities`  | 등록·수정·삭제  | 독립 시설 포함. 동영상 칸도 이 테이블                                                             |
| `building_photos`      | 등록·수정·삭제  |                                                                                                   |
| `facility_photos`      | 등록·수정·삭제  |                                                                                                   |
| `landmarks`            | 등록·수정·삭제  |                                                                                                   |
| `slope_segments`       | 등록·수정·삭제  |                                                                                                   |
| `colleges`             | 등록·수정·삭제  | 앱에 쓰기 경로가 없다. 콘솔에서 바꾼 것을 잡는다                                                  |
| `facility_types`       | 등록·수정·삭제  | 위와 같다                                                                                         |
| `app_settings`         | 등록·수정·삭제  |                                                                                                   |
| `admin_users`          | 등록·수정·삭제  | 관리자 권한의 기준이라 "누가 누구를 관리자로 넣고 뺐나"를 남긴다. 첫 두 행 입력(7장)부터 기록된다 |
| `facility_requests`    | **수정·삭제만** | 방문자의 접수는 제보함이 이미 기록이다. 승인·거절·상태 변경만 남긴다                              |
| `feedback_submissions` | **수정·삭제만** | 위와 같다                                                                                         |

`facility_request_photos`는 대상이 아니다. 방문자가 올리고 승인·정리 과정에서 옮겨지거나 지워지는 중간
저장물이라, 기록하면 승인 한 번에 사진 수만큼 줄이 붙는다. 승인 결과는 `facility_photos` 등록으로 남는다.

### 3.3 행위자 판별

트리거는 PostgREST가 요청마다 설정하는 `request.jwt.claims`와 `request.headers`를 읽는다.

| 요청                                              | `actor_kind` | `actor_label`                                                                                   |
| ------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| JWT `role = authenticated` (브라우저 직접 쓰기)   | `admin`      | `auth.uid()`의 `admin_users.display_name`                                                       |
| JWT `role = service_role` + `x-actor-id`          | `admin`      | 그 계정의 `display_name`                                                                        |
| JWT `role = service_role` + `x-actor-system`      | `system`     | 코드별 이름: `translation` → `자동 번역`, `osm_sync` → `OSM 동기화`, `script` → `운영 스크립트` |
| JWT `role = service_role`, 헤더 없음              | `system`     | `시스템(미상)`                                                                                  |
| JWT `role = anon`                                 | `visitor`    | `방문자`                                                                                        |
| `request.jwt.claims` 없음 또는 빈 문자열 (11장 1) | `system`     | `DB 직접 변경` (SQL Editor·Table Editor 등 직접 접속)                                           |

- **헤더는 `service_role` 요청일 때만 믿는다.** `authenticated` 요청에 `x-actor-id`가 붙어 와도 무시하고
  `auth.uid()`를 쓴다. 브라우저는 아무 헤더나 붙일 수 있기 때문이다.
- `admin_users`에 없는 계정이면 `미등록 계정(<이메일>)`으로 남긴다. PR 1과 PR 2 사이(7장)처럼 목록이 비었거나
  빠진 계정이 있을 때 로그에서 바로 보인다.
- `role`은 `current_user`가 아니라 JWT 클레임으로 본다. `log_change()`는 정의자 권한으로 돌아 `current_user`가
  함수 소유자로 바뀐다.
- 헤더 값은 ASCII여야 하므로 시스템 이름은 코드로 보내고, 한글 이름은 트리거가 붙인다.

### 3.4 `supabaseAdmin(actor)`

서버 라우트는 service_role 클라이언트를 `src/lib/server/supabaseAdmin.ts` 한 곳에서만 얻는다.

```ts
type Actor = { userId: string } | { system: "translation" | "osm_sync" };
supabaseAdmin(actor?: Actor) // actor가 있으면 global.headers에 x-actor-id 또는 x-actor-system을 싣는다
```

- 관리자 라우트는 `requireAdmin`이 돌려준 `user.id`를 넘긴다.
- `translate-facility`는 관리자가 불러도 `{ system: "translation" }`을 넘긴다. 번역 결과를 쓴 것은 사람이 아니다.
- `/api/buildings`(OSM 동기화)는 `{ system: "osm_sync" }`.
- 읽기만 하는 라우트는 `actor` 없이 부른다. 그 클라이언트로 쓰기가 일어나면 `시스템(미상)`으로 남아 누락이 보인다.
- 지금 여러 라우트가 `createClient(..., SUPABASE_SERVICE_ROLE_KEY)`를 각자 부른다. 모두 `supabaseAdmin()`으로
  옮긴다. 완료 조건: `git grep -n SUPABASE_SERVICE_ROLE_KEY src/app src/lib`가 `supabaseAdmin.ts`와 그 테스트만 가리킨다.
- `src/scripts/`의 스크립트는 Next 밖에서 돌아 각자 클라이언트를 만든다. service_role 키를 쓰는 스크립트는
  그 자리에서 `global.headers`에 `x-actor-system: script`를 싣는다. anon 키를 쓰는 `syncBuildings.ts`는
  헤더를 실어도 믿지 않으므로(3.3) 손대지 않는다.
- 클라이언트를 요청마다 만들면 지금의 모듈 캐시(`client ??=`)가 깨진다. `actor`별로 만들고 `actor` 없는 것만
  캐시한다. `createClient`는 연결을 열지 않아 요청마다 만들어도 비용이 작다.

등록 요청 승인(`approve_facility_request`)처럼 DB 함수 안에서 일어나는 쓰기도 같은 PostgREST 요청 안이라
`request.headers`가 그대로 보인다. 승인한 사람이 시설 등록의 행위자로 남는다.

### 3.5 기록 내용

- **수정:** 바뀐 칸만 `{ "<칸>": [이전, 이후] }`로 남긴다. 바뀐 칸이 하나도 없으면 행을 남기지 않는다.
- **등록:** 새 행을 `{ "<칸>": 값 }`로 남긴다. 값이 `null`인 칸은 뺀다.
- **삭제:** 지워진 행 전체를 남긴다. 지운 뒤 "원래 뭐였지?"를 확인할 길이 이것뿐이다.
- **빼는 칸:** `created_at`, `updated_at`, `last_updated`(자동으로 바뀌어 잡음이 된다), `client_hash`
  (방문자 식별값이라 로그에 퍼뜨리지 않는다). 수정에서 이 칸만 바뀌었으면 바뀐 칸이 없는 것으로 본다.
- **형상 칸:** `buildings.geojson`, `slope_segments.segments`는 좌표가 길다. 수정·등록에서는 값 대신
  `{ "changed": true, "points": <꼭짓점 수> }`를 남긴다. 삭제에서는 행 전체 규칙을 따라 값을 그대로 남긴다.
- **참조 칸:** `facility_code`, `building_id`, `college_id`는 값 대신 `{ "value": <원래 값>, "label": <그때 이름> }`을
  남긴다(`facility_types.label`, `buildings.name`, `colleges.name`). 화면이 지금 이름으로 바꾸면 종류 이름이
  바뀌거나 지워진 뒤 과거 기록까지 바뀌어 보인다. 대상 이름(3.6)을 복사해 두는 것과 같은 이유다.
- **방문자 자유 입력:** `feedback_submissions.content`, `facility_requests.description`은 값 대신
  `{ "redacted": true, "length": <글자 수> }`를 남긴다. 연락처 같은 개인정보가 섞일 수 있는데 로그는 지울 수 없어서
  (2.4), 원본을 지워도 로그에 남는다. 삭제 기록에서도 같다.

### 3.6 대상 이름 (`target_label`)

| 테이블                                    | 이름                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `buildings`                               | `name`                                                                             |
| `building_facilities`                     | `건물명 · 시설명`. 시설명이 없으면 `facility_types.label`. 독립 시설은 건물명 없이 |
| `building_photos`                         | `건물명 사진`                                                                      |
| `facility_photos`                         | `<시설 이름 규칙> 사진`                                                            |
| `landmarks`, `slope_segments`, `colleges` | `name`                                                                             |
| `facility_types`                          | `label`                                                                            |
| `facility_requests`                       | `<시설명 또는 시설 종류> 등록 요청`                                                |
| `feedback_submissions`                    | `의견 제보 #<id 앞 8자>`. 본문은 쓰지 않는다(3.5 방문자 자유 입력)                 |
| `app_settings`                            | `key` (화면이 한글 이름으로 바꾼다, 5.5)                                           |
| `admin_users`                             | `관리자 <display_name>`                                                            |

삭제일 때는 지워지는 행(`old`)으로 이름을 만든다. 연결된 건물이 같은 트랜잭션에서 먼저 지워져 찾을 수 없으면
찾은 부분까지만 쓴다.

### 3.7 안전장치: 기록 실패가 저장을 막지 않는다

트리거는 대상 테이블의 모든 쓰기에 끼어든다. 트리거 안에서 예외가 나면 원래 저장까지 롤백된다. 그래서
`log_change()` 본문은 `exception when others` 블록으로 감싸 원래 저장을 진행시킨다. 로그 한 줄을 잃는 것이
저장이 막히는 것보다 낫다.

다만 `raise warning`만 남기면 아무도 보지 않는다. Postgres 로그를 읽는 사람이 없다. 그래서 예외 블록 안에서
최소 정보만 담은 행을 한 번 더 넣어 본다: `level = error`, `kind = failure`, `reason_code = audit_write_failed`,
`target_table`·`target_id`, `action`에 `<테이블>.<insert|update|delete>`(4.3의 직접 쓰기 작업 키와 같은 모양),
`message`에 오류 문장. 행위자를 판별하다 난 오류일 수도 있어 행위자는 `system`·`변경 기록`으로 둔다. 칸 이름 변경이나 이름 조회 실패처럼 **내용을 만드는
단계**의 오류는 이 행으로 로그 화면에 드러난다. 이 행마저 실패하면(기록 테이블 자체의 문제) 그때 `raise warning`으로
끝낸다. 두 동작 모두 DB 검증에서 시험한다(8.3).

---

## 4. 실패 기록

### 4.1 누가 기록하나

한 실패가 두 번 남지 않게 나눈다.

| 실패한 곳                                                      | 기록하는 쪽         |
| -------------------------------------------------------------- | ------------------- |
| 관리자 API 라우트 안 (형식 오류, 저장소 거부, DB 오류, 403 등) | 서버 `logFailure()` |
| 서버 코드에 닿기 전: 응답 없음, Vercel이 만든 413·504          | 브라우저            |
| 브라우저에서 Supabase로 바로 쓰다가 실패                       | 브라우저            |
| 브라우저 안 처리 실패 (WebP 변환, 동영상 압축)                 | 브라우저            |
| 401 (세션 만료, 서버는 누군지 몰라 기록하지 못한다)            | 브라우저            |
| 공개 API 라우트의 5xx·예상 못 한 예외                          | 서버 (`visitor`)    |

Vercel이 만든 응답인지는 `x-vercel-error` 응답 헤더로 가린다. 우리 라우트가 돌려준 413(예: 사진 용량 검사)은
JSON 본문을 갖고 이 헤더가 없다. 그 경우는 서버가 이미 기록했으므로 브라우저는 보고하지 않는다. 이 헤더는 Vercel
공식 문서에 없다(11장 3). 우리 라우트는 504를 돌려주지 않으므로 504는 헤더가 없어도 브라우저가 보고한다.

### 4.2 서버: `logFailure()`

`src/lib/server/activityLog.ts`. 라우트가 실패를 잡는 자리에서 부른다.

- 기록 작업을 `after()`에 등록하고 **기다리지 않는다**. 응답은 바로 나가고, 함수는 기록이 끝날 때까지 살아 있다.
  (`translate-facility`도 `after()`를 쓰지만 같은 작업을 `await`해서 응답이 그 작업을 기다린다. 그쪽은 번역
  결과를 응답에 실어야 해서다.)
- 기록이 실패해도 던지지 않는다. 그때는 `console.error`로 같은 내용을 남긴다.
- 기존 `console.error`는 지우지 않는다. Vercel 로그는 DB가 죽었을 때의 유일한 기록이다.
- 행위자: 관리자 라우트는 `requireAdmin`의 사용자, 공개 라우트는 `visitor`(`actor_label = 방문자`).
  방문자 식별값은 남기지 않는다.

### 4.3 브라우저: `reportFailure()`와 `POST /api/activity-logs`

`src/lib/activityReport.ts`. 실패 토스트를 띄우는 자리마다 부르지 않고, 브라우저 실패가 지나가는 관문에서 부른다.
토스트 자리는 화면마다 흩어져 있어 3.1에서 기각한 대안과 같은 이유로 하나를 빠뜨리면 조용히 누락된다.

- `authedFetch`: 관리자 API 호출 중 서버 코드에 닿지 못한 실패(`fetch`가 던짐, `x-vercel-error`, 504, 401)를
  보고한다. 작업 키는 요청 경로로 정하고, 경로 표에 없는 호출(읽기)은 보고하지 않는다. 서버가 받은 실패는 서버가
  기록한다(4.1).
- 브라우저 Supabase 클라이언트(`src/lib/supabaseClient.ts`)의 `global.fetch`: `/rest/v1/<테이블>`로 가는
  쓰기(`POST`·`PATCH`·`DELETE`, `rpc/` 제외)가 실패하면 보고한다. 작업 키는 `<테이블>.<insert|update|delete>`다.
- 관문을 지나지 않는 실패만 그 자리에서 부른다: 사진 WebP 변환 실패(`FacilityPhotoManager`,
  `BuildingPhotoManager`)와 변환 뒤 크기 초과(`FacilityPhotoManager`), 동영상 변환 실패·크기 초과와 R2 직접
  업로드(`FacilityVideoModal`).
- 관문은 대상 이름을 모른다. 관문 보고는 `target_label`이 비고, 직접 쓰기는 테이블과 기본 키만 남는다.

- 보고마다 `client_event_id`(UUID), `occurred_at`(브라우저 시각), `owner_user_id`(실패가 났을 때 로그인한 계정)를
  붙인다.
- 전송이 실패하거나 401이면 `localStorage`의 대기열에 넣는다. 최대 50건, 넘치면 오래된 것부터 버린다. 403이면
  버린다(목록에 없는 계정의 보고는 다시 보내도 받지 않는다).
- 대기열 항목은 `{ v: 1, owner_user_id, ... }` 형식이다. 대기열은 관리자 대시보드 레이아웃이 열릴 때와 보고가 한 번
  성공한 뒤에 비우되, **지금 로그인한 계정의 항목만** 보낸다. 다른 계정의 항목은 그 사람이 이 브라우저로 다시
  로그인할 때 나간다. 같은 브라우저에서 계정을 바꿔 쓸 때 앞사람의 실패가 뒷사람 이름으로 남지 않게 하려는 것이다.
  한 번에 최대 50건을 보낸다.
- `localStorage` 접근은 모두 `try/catch`로 감싼다. 저장소를 못 써도 화면은 깨지지 않고, 그 보고만 잃는다.
- 같은 보고를 다시 보내도 `client_event_id` unique 제약과 `on conflict do nothing`으로 한 줄만 남는다.

`/api/activity-logs`:

- `requireAdmin`을 통과한 뒤 그 계정이 `admin_users`에 있는지 **이 라우트가 직접** 확인한다
  (`src/lib/server/adminUsers.ts`의 `isListedAdmin(userId)`). PR 1에서는 `requireAdmin`이 아직 로그인만 보므로(7장),
  이 확인이 없으면 아무 로그인 계정이나 실패 기록을 지어내 넣을 수 있다. PR 2에서 같은 확인이 `requireAdmin`으로
  옮겨 가면 이 라우트의 확인은 지운다.
- **행위자는 본문이 아니라 토큰에서** 정한다. 항목의 `owner_user_id`가 토큰의 계정과 다르면 그 항목은 버린다.
- `level`·`reason_code`·`action`은 허용 목록에 있는 값만 받고, 아니면 400.
- `message`는 300자, `detail`은 4KB에서 자른다(2.3). `occurred_at`이 미래거나 30일보다 오래됐으면
  `recorded_at`으로 바꾼다.
- `kind`는 언제나 `failure`로 저장한다. 브라우저가 변경 기록을 만들 수는 없다.

### 4.4 사유 분류: `classifyFailure()`

`src/lib/failureReason.ts`. 서버와 브라우저가 같이 쓰는 순수 함수다. 입력(던져진 오류, `Response`,
PostgREST 오류, Storage 오류)과 맥락(작업 키, 대상, 파일 크기·형식)을 받아
`{ reason_code, message, detail }`을 돌려준다.

| 코드                | 판별 근거                           | 문장 예시                                               |
| ------------------- | ----------------------------------- | ------------------------------------------------------- |
| `network`           | 응답 없이 `fetch`가 던짐            | 네트워크 연결이 끊겨 서버에 닿지 못함                   |
| `timeout`           | 504, 함수 시간 초과                 | 서버 처리 시간이 초과됨                                 |
| `payload_too_large` | 413                                 | 파일 5.2MB가 서버 한도 4.5MB를 넘음                     |
| `invalid_input`     | 400 + 라우트의 사유                 | 입력값이 올바르지 않음: <사유>                          |
| `unsupported_type`  | 400/415 + 형식 사유                 | 지원하지 않는 형식(image/heic)                          |
| `session_expired`   | 401, JWT 만료(`PGRST301`)           | 로그인이 만료됨                                         |
| `forbidden`         | 403, RLS 거부(`42501`)              | 관리자 목록에 없는 계정                                 |
| `conflict`          | `23505`(중복), `23503`(연결된 항목) | 같은 항목이 이미 있음 / 연결된 항목이 있어 지울 수 없음 |
| `not_found`         | 404, 대상 없음                      | 대상이 이미 지워졌거나 없음                             |
| `storage_error`     | R2·Supabase Storage 오류            | 파일 저장소가 거부함: <error_message>                   |
| `translation_error` | 번역 API 오류                       | 번역 API 오류: <error_message>                          |
| `server_error`      | 위에 없는 5xx                       | 서버 내부 오류: <error_message>                         |
| `unknown`           | 위 어디에도 해당하지 않음           | 알 수 없는 오류: <error_message>                        |

- 문장 앞에 작업 이름이 붙는다: `시설 사진 업로드 실패: 파일 5.2MB가 서버 한도 4.5MB를 넘음`. 대상은
  `target_label`에만 두고 문장에 넣지 않는다. 목록의 `대상` 칸(5.2)과 겹치기 때문이다.
- 상태 코드로 사유를 추정하는 것은 **브라우저 쪽**(서버 코드에 닿지 못한 실패)의 일이다. 라우트 안에서 난 실패는
  그 라우트가 사유를 알고 있으므로 `logFailure`에 `reason_code`를 직접 넘긴다. 예: 명소 사진 자체 한도(`MAX_SIZE`)
  초과는 400을 돌려주지만 라우트가 `payload_too_large`와 자기 한도를 넘긴다. 브라우저의 413은 Vercel 함수 요청 본문
  한도로 막힌 것이다(4.1).
- **`detail`은 허용한 키만 담는다:** `status`, `code`(DB·공급자 오류 코드), `error_message`(500자에서 자름),
  `file_size`, `file_type`, `limit`, `route`. 오류 객체나 응답 본문을 통째로 넣지 않는다. 공급자 응답·서명 URL·
  사용자 입력이 섞여 지울 수 없는 로그(2.4)에 영구히 남기 때문이다. `error_message`와 `route`는 저장 전에 URL의
  쿼리 문자열을 지우고, `Bearer …`·JWT 형태(`eyJ…`) 문자열을 `[가림]`으로 바꾼다. 위 표의 `<error_message>`도
  이 가림을 거친 문장이다. `message`가 가림 전 원문을 따로 들고 가지 않는다.
- `unknown`도 `error_message`는 남는다. 로그에서 자주 보이는 `unknown`은 코드를 새로 만들어 옮긴다.

### 4.5 유형(level) 규칙

| 유형      | 언제                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------ |
| `info`    | 성공한 변경 (사람·시스템)                                                                              |
| `warning` | 저장은 됐지만 뒤따르는 일이 실패: 자동 번역, 공개 지도 갱신(revalidate), 파일 정리. 그리고 `forbidden` |
| `error`   | `forbidden`을 뺀, 아무것도 저장되지 않은 실패. 그리고 `audit_write_failed`(3.7)                        |

세 가지로 충분하다. `critical`은 error와 다르게 처리할 일(예: 즉시 알림 메일)이 생길 때 나눈다. `debug`는 읽는
사람이 비개발자라 잡음만 된다. "관리자 목록에 없는 계정의 접근" 같은 보안 성격은 심각도가 아니라 종류라서 유형을
늘리지 않고 `reason_code = forbidden`으로 구분한다.

### 4.6 공개 API의 기록 범위

공개 라우트(의견 제보 `/api/feedback`, 등록 요청 `/api/facility-requests/**`의 방문자 경로)는 5xx와 예상 못 한
예외만 남긴다. 방문자의 4xx(용량 초과, 캡차 실패, 요청 제한)는 남기지 않는다. 누구나 대량으로 만들 수 있어
로그를 잡음으로 채운다. 방문자에게는 지금처럼 응답 문구로 알린다.

---

## 5. 로그 화면

### 5.1 탭

관리자 헤더 `NAV`(`src/app/admin/dashboard/layout.tsx`)의 `제보함` 오른쪽에 `{ label: "로그", href:
"/admin/dashboard/logs" }`를 넣는다. 읽기 전용 화면이라 저장 안 한 변경 확인(`UnsavedChangesGuard`)은 걸지 않는다.

### 5.2 목록 표

| 시각        | 로그 유형 | 사람              | 대상                           | 내용                                                       |
| ----------- | --------- | ----------------- | ------------------------------ | ---------------------------------------------------------- |
| 10/19 14:02 | info      | 성웅              | 시설 · 하나스퀘어 · 1층 경사로 | 수정: 설치 여부 설치됨 → 미설치 외 2칸                     |
| 10/19 14:02 | warning   | 자동 번역         | 시설 · 하나스퀘어 · 1층 경사로 | 자동 번역 실패: 번역 API 오류: 응답 없음                   |
| 10/19 13:40 | error     | 김지원 선임연구원 | 시설 사진 · 중앙광장 · 승강기  | 시설 사진 업로드 실패: 파일 5.2MB가 서버 한도 4.5MB를 넘음 |

- `로그 유형` 칸은 글자와 색을 함께 쓴다. 색만으로 구분하지 않는다.
- `대상` 칸 앞의 종류(`시설`, `시설 사진` 등)는 `target_table`에서 화면이 붙인다.
- `내용`은 변경이면 `<동작>: <첫 번째 바뀐 칸 요약> 외 N칸`, 실패면 `message`다. 한 줄을 넘으면 말줄임한다.
- 시각은 `occurred_at`이다. 올해면 `MM/DD HH:mm`, 아니면 `YYYY/MM/DD HH:mm`.
- 좁은 화면에서는 제보함 모바일 목록처럼 카드로 바뀐다(시각·유형 / 대상 / 내용).

### 5.3 필터와 페이지

- 표 위에 `로그 유형` 드롭다운: `전체` / `info` / `warning` / `error`. 선택은 URL 검색어(`?level=`)에 둔다.
- 최신순 50건, `더 보기`로 다음 50건을 이어 붙인다. `(occurred_at, id)` 커서로 넘긴다. 늦게 들어온 브라우저
  보고는 발생 시각 자리에 끼므로, 이미 넘긴 구간에 새로 생길 수 있다. 새로고침하면 보인다.
- 데이터는 브라우저 Supabase 클라이언트로 `activity_logs`를 바로 읽는다. 관리자만 읽는 것은 RLS(2.4)가 보장한다.

### 5.4 상세 모달

행(카드)을 누르면 연다. 기존 관리자 모달의 포커스 가둠·`Esc` 닫기·닫은 뒤 행으로 포커스 복귀를 따른다.

- **머리:** 시각, 로그 유형, 사람, 대상, 동작. `occurred_at`과 `recorded_at`이 1분 넘게 다르면 둘 다 보인다.
- **수정:** `칸 | 이전 | 이후` 표. 긴 글은 자르지 않고 줄바꿈해 전문을 보인다.
- **등록:** `칸 | 값` 표. **삭제:** `칸 | 지워진 값` 표.
- **형상 칸:** `형상 변경됨 (꼭짓점 N개)`.
- **실패:** 사유 문장, 사유 코드, 그 아래 `원문(개발자용)`을 접힌 상태로(`<details>`) 두고 `detail` JSON을 보인다.

### 5.5 표시 규칙

`src/lib/activityLabels.ts` 한 곳에 둔다.

- 테이블 이름(`building_facilities` → `시설`), 칸 이름(`is_installed` → `설치 여부`), 작업 키
  (`facility_photo.upload` → `시설 사진 업로드`), 설정 키(`feedback_emails` → `제보 알림 메일`).
- 값 변환: 불리언은 칸별 문구(`is_installed`: `설치됨` / `미설치`), `null`·빈 문자열은 `(비어 있음)`.
  참조 칸(3.5)은 저장된 `label`을 보인다. 지금 테이블을 다시 조회하지 않는다.
- 가린 방문자 입력(3.5)은 `(방문자 입력 N자, 기록하지 않음)`.
- `buildings`의 `is_deleted`가 `false → true`인 수정은 동작을 `삭제`로, `true → false`는 `복구`로 보인다.
- 사전에 없는 칸·키는 원래 이름을 그대로 보인다. 새 칸이 생겨도 화면이 깨지지 않는다.

### 5.6 스타일 제약

색은 관리자 화면 토큰만 쓴다(`admin-ui.css`). 하드코딩한 색은 `e2e/admin-dark.spec.ts`가 잡는다. 모서리는
`2026-10-16-square-corners-design.md`의 직각 규칙을 따른다.

---

## 6. 권한 적용

PR 2(7장)의 내용이다.

- **`requireAdmin`:** 토큰의 사용자를 확인한 뒤 `isListedAdmin(userId)`(4.3)로 `admin_users`에 있는지 조회한다.
  없으면 403과 `forbidden`(warning) 로그(작업 키 `admin.access`)를 남긴다. 401은 지금처럼 기록하지 않는다(누군지
  모른다). 조회 자체가 실패하면 목록에 없다고 단정하지 않고 500으로 끝낸다. `/api/activity-logs`의 자체 확인은 이때
  지운다.
- **가드를 따로 쓰는 라우트:** `src/app/api/settings/feedback-emails/route.ts`는 `requireAdmin` 대신 자체
  `verifyAdmin()`(로그인 여부만 확인)을 쓴다. `requireAdmin`만 고치면 이 경로가 빠진다. `requireAdmin`으로 옮기고
  `verifyAdmin()`을 지운다.
- **완료 조건:** `src/app/api/` 아래 `route.ts` 중 `requireAdmin`을 부르지 않는 파일은 일부러 공개인 라우트뿐이어야
  한다. 2026-10-19 기준 그 목록: `buildings`, `facilities`, `landmarks`, `slopes`(공개 지도 읽기·OSM 동기화),
  `feedback`(의견 제보), `facility-requests/[id]/photos`(방문자 요청 사진). 확인 명령:
  `for f in $(git ls-files 'src/app/api/**/route.ts'); do grep -q requireAdmin "$f" || echo "$f"; done`
- **브라우저 쓰기 RLS:** 브라우저가 바로 쓰는 테이블(`buildings`, `building_facilities`, `building_photos`,
  `landmarks`, `slope_segments`)과 `colleges`, `facility_types`의 쓰기 정책을 `public.is_admin()`으로 바꾼다. 뒤의
  둘은 앱에 쓰기 경로가 없지만 콘솔에서 만든 정책이 로그인 계정 누구에게나 쓰기를 열어 두고 있었다(11장 5).
  이 마이그레이션은 첫 문장에서
  `admin_users`가 비어 있으면 예외를 던져 통째로 실패한다(빈 목록으로 정책이 바뀌는 것을 막는다). DB 검증 잡(8.3)은
  데이터 없는 스냅샷 위에서 돌아 목록이 늘 비어 있으므로, 그 잡의 적용 스크립트만 `PGOPTIONS=-c app.db_test=on`을
  주고 이 확인은 그 설정이 있을 때 건너뛴다. 이 중 일부
  정책은 마이그레이션에 없고 예전에 콘솔에서 만든 것이다. PR 2를 쓰기 전에 운영에서 아래를 실행해 현재 정책을
  받아 그 이름으로 교체한다.

  ```sql
  select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies where schemaname = 'public' order by 1, 2;
  ```

- **관리자 화면 진입:** 대시보드 레이아웃이 `getUser()` 다음에 `is_admin()` RPC를 부른다. `false`면 로그아웃하고
  로그인 화면에 `관리자 목록에 없는 계정입니다`를 보인다. RPC가 실패하면 로그아웃하지 않고 `다시 시도`를 보인다 —
  일시적인 오류로 관리자를 내보내지 않는다.
- 이 단계로 `require-admin-role-check.md`의 "관리자를 무엇으로 식별할지"는 `admin_users`로 정해진다. TODO
  파일을 지우고 결론은 이 문서에 남는다(TODO README 규칙 4).

---

## 7. 배포 순서

저장소가 공개라서 관리자 이메일을 마이그레이션에 넣지 않는다. 그런데 `admin_users`가 빈 채로 권한 검사가 켜지면
두 관리자가 모두 잠긴다. 또 마이그레이션 적용(CI)과 Vercel 배포는 둘 다 `main` 병합 때 일어나 어느 쪽이 먼저
끝날지 보장되지 않는다. 그래서 나눈다.

| 단계         | 내용                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PR 0         | 운영 스키마 스냅샷 덤프 워크플로(8.3). 병합 뒤 한 번 실행해 스냅샷을 받는다                                                                   |
| PR 1: 기록   | 스냅샷과 DB 검증 잡, `admin_users`·`is_admin()`·`activity_logs`, 트리거, `supabaseAdmin(actor)`, 실패 기록, 로그 화면. **권한 검사는 그대로** |
| 사람이 할 일 | Table Editor에서 `admin_users`에 두 관리자 행을 넣는다. 저장을 한 번 해서 로그에 이름이 찍히는지 본다                                         |
| PR 2: 권한   | 6장 전부. 기존 단언 교체(8.4), TODO 파일 삭제                                                                                                 |

PR 1이 커지면 구현 계획에서 DB(스냅샷·검증 잡·테이블·트리거)와 앱(실패 기록·화면)으로 더 나눌 수 있다.
순서 제약은 "PR 2는 두 관리자 행이 들어간 뒤"뿐이다.

**PR 2 병합 전 확인.** PR CI는 운영 DB 비밀값을 받지 않아 이 조건을 자동으로 확인할 수 없다. PR 2 본문 체크리스트에
`select display_name from public.admin_users;`를 넣고, 두 사람이 나오는 것을 본 뒤 병합한다. 6장의 RLS 마이그레이션은
목록이 비면 실패하도록 막혀 있다.

**그래도 잠겼을 때.** `requireAdmin`과 `is_admin()`은 요청마다 `admin_users`를 조회한다. Table Editor에서 행을
넣는 즉시 풀리고, 재배포는 필요 없다.

---

## 8. 테스트 계획

로컬에서 돌리지 않는다. 확인은 PR CI로 한다.

### 8.1 vitest

- `classifyFailure`: 사유 코드마다 입력 하나씩. Vercel 413(`x-vercel-error`)과 라우트 413(JSON) 구분, 401·403,
  `23505`·`23503`·`42501`·`PGRST301`, Storage 오류, `unknown`일 때 `error_message` 보존, 문장 조립(작업 이름·대상).
- `detail` 정리: 허용 목록 밖 키를 버리는지, URL 쿼리 문자열·`Bearer …`·JWT 형태 문자열을 가리는지, 4KB 절단.
- `activityLabels`: 칸·값 변환, 사전에 없는 칸, 형상 칸, `is_deleted`의 삭제·복구 표시.
- `reportFailure`: 전송 실패 시 대기열 적재, 401 시 적재, 403 시 버림, 50건 상한(오래된 것부터 버림),
  **비울 때 지금 계정의 항목만 보내고 다른 계정 항목은 남김**, `localStorage`가 던져도 화면 코드에 예외가 새지 않음.
- `/api/activity-logs`: 토큰 없음 401, **로그인했지만 `admin_users`에 없는 계정 403**, 행위자는 토큰에서(본문의
  `actor`는 무시), `owner_user_id`가 토큰 계정과 다른 항목은 버림, 허용 목록 밖 값 400, `message`·`detail` 자르기,
  `occurred_at` 보정, `kind`가 언제나 `failure`.
- `supabaseAdmin(actor)`: 헤더 부착, `actor` 없는 클라이언트만 캐시.
- `logFailure`: insert가 실패해도 던지지 않고 `console.error`로 남김.
- 실패 기록을 붙인 기존 라우트 테스트에 "실패 경로가 `logFailure`를 부른다"를 더한다.

### 8.2 Playwright (목 백엔드 확장)

- `로그` 탭 진입, 표 렌더, 유형 드롭다운으로 거르기(`?level=` 반영), `더 보기`.
- 행 클릭 → 모달: 수정 전후 표, 삭제 표, 실패 원문 접기·펼치기, `Esc`로 닫고 포커스 복귀.
- 좁은 화면 카드 목록.
- `admin-dark.spec.ts`에 로그 화면과 모달을 더한다.

### 8.3 DB 검증 잡 (pgTAP)

**전제 문제:** 기초 테이블(`buildings`, `building_facilities`, `building_photos`, `colleges`, `facility_types`,
`slope_segments`)은 마이그레이션 이전에 콘솔에서 만들어져 `supabase/migrations`에 없다. 빈 DB에서 마이그레이션을
처음부터 실행하면 첫 파일부터 실패한다.

**해법: 운영 스키마 스냅샷 위에 새 마이그레이션만 얹는다.**

1. PR 0: `workflow_dispatch` 워크플로가 `production` 환경 비밀값으로 `supabase db dump --schema public`(스키마만,
   데이터 없음)을 떠서 산출물로 올린다. 받은 파일을 PR 1에서 `supabase/baseline/schema.sql`로 커밋하고,
   첫 줄에 덤프 시점의 마지막 적용 마이그레이션 버전을 적는다. `supabase/tests/` 아래에 두지 않는다.
   `supabase test db`는 그 폴더를 하위까지 훑어 스냅샷을 테스트로 실행한다.
2. `supabase/config.toml`을 둔다. `supabase db start`에 필요하고 비밀값은 없다. `[db] major_version`은 운영
   Postgres와 맞춘다. `[db.migrations] enabled = false`는 쓰지 않는다. 운영 적용 잡의 `supabase db push`도 이
   파일을 읽어 운영 적용까지 건너뛴다.
3. CI 잡 `DB test`: `supabase/migrations`를 잠시 옮김 → `supabase db start` → `psql`로 스냅샷 적용 → 스냅샷
   버전보다 새 마이그레이션만 순서대로 `psql`로 적용 → `supabase test db`로 `supabase/tests/*.sql`(pgTAP) 실행.
   `db start`는 새 DB에 `supabase/migrations` 전체를 적용하므로 그대로 두면 첫 파일부터 실패한다.
4. `--schema public` 덤프에는 `CREATE EXTENSION`이 없다. 스냅샷이 로컬 이미지에 기본으로 없는 확장을 쓰면
   `supabase/baseline/prelude.sql`에서 먼저 만든다.
5. pg_prove는 테스트 파일을 트랜잭션으로 감싸지 않는다. 테스트 파일마다 `begin; … rollback;`으로 감싼다.
6. 운영 적용 잡(`Apply Supabase migrations`)은 `DB test`가 통과해야 돈다(`needs`).

스냅샷은 마이그레이션이 쌓여도 다시 뜰 필요가 없다. 스냅샷 버전 이후 파일만 얹기 때문이다. 콘솔에서 운영 스키마를
직접 바꾸는 일이 생기면 그때 다시 뜬다(`docs/database-migrations.md`는 이미 그것을 금지한다).

공개 저장소에 스키마가 올라가지만, 테이블·정책 구조는 이미 마이그레이션과 코드에 드러나 있고 데이터와 비밀값은
없다.

pgTAP 검사 항목:

- `authenticated` 요청(`request.jwt.claims` 설정)의 쓰기 → `actor_kind = admin`, `display_name`이 찍힌다.
- `service_role` + `x-actor-id` → 그 관리자. `service_role` + `x-actor-system` → 시스템 이름.
- **`authenticated` 요청에 `x-actor-id`를 위조해 붙이면 무시된다.**
- `admin_users`에 없는 계정 → `미등록 계정(<이메일>)`.
- 수정은 바뀐 칸만, 값이 같은 수정·자동 칸만 바뀐 수정은 행 없음, 삭제는 행 전체, 형상 칸 요약, `client_hash` 제외.
- 참조 칸은 `{ value, label }`로 남고, 나중에 `facility_types.label`을 바꿔도 기록된 `label`은 그대로다.
- `feedback_submissions.content`·`facility_requests.description`은 수정·삭제 기록 모두 `{ redacted, length }`로만
  남고, `feedback_submissions`의 `target_label`에 본문이 없다.
- `facility_requests`·`feedback_submissions`의 등록은 기록하지 않는다. `admin_users`의 등록·삭제는 기록한다.
- **내용을 만드는 단계에서 예외가 나면(예: 이름 조회 실패를 흉내) 원래 저장은 성공하고 `audit_write_failed`
  행이 남는다.** **기록 테이블 쓰기 자체가 실패해도 원래 저장은 성공한다.**
- `activity_logs`: 관리자만 `select`, 관리자도 `insert`·`update`·`delete` 불가, service_role도 `update`·`delete`·
  `truncate` 불가.
- `admin_users.display_name` 길이 제약(공백만, 21자 거부).

### 8.4 무너지는 기존 단언

- `src/lib/requireAdmin.test.ts`의 `returns the user for a valid access token`: 유효한 토큰이면 통과한다는 단언이다.
  PR 2부터는 `admin_users`에 없으면 403이다. 이 테스트를 "목록에 있으면 통과"로 바꾸고 "목록에 없으면 403"을 더한다.
- `e2e/admin-auth.spec.ts`의 `로그인 후 대시보드에 진입하고 로그아웃한다`: 로그인만으로 대시보드에 들어간다는 단언이다.
  PR 2부터 레이아웃이 `is_admin()` RPC를 부른다. 지금 `e2e/support/mockBackend.ts`는 `rpc/get_admin_building_summary`
  만 따로 처리하고 나머지 `rpc/*` POST는 일반 테이블 생성으로 받아 배열을 돌려준다. 그래서 `rpc/is_admin`에
  `true`/`false`를 돌려주는 처리를 넣고, 목 상태에 관리자 여부를 두며, "목록에 없는 계정은 안내 후 로그인 화면으로"
  테스트를 더한다. 이 처리 없이 레이아웃만 바꾸면 기존 테스트가 깨지거나, 배열을 참으로 읽어 검사 없이 통과한다.
- `supabaseAdmin()`을 목으로 바꾸는 라우트 테스트는 인자(`actor`)가 생겨도 그대로 돈다. 다만 직접
  `createClient`를 목으로 잡던 라우트 테스트는 3.4의 이전과 함께 목 대상을 `supabaseAdmin`으로 옮긴다.
- `settings/feedback-emails`는 지금 라우트 테스트가 없다. `requireAdmin`으로 옮길 때(6장) 401·403·정상 저장 테스트를
  새로 둔다.

### 8.5 수동 (PR 1 적용 뒤 운영)

- 두 관리자 행을 넣기 전에 저장 한 번 → `미등록 계정(...)`으로 찍히는지.
- 행을 넣은 뒤 각자 저장 한 번 → 이름이 찍히는지. 시설 저장 뒤 `자동 번역` 줄이 따라오는지.
- 4.5MB 넘는 사진을 올려 `payload_too_large`와 파일 크기가 남는지. 오프라인으로 저장 실패 → 다시 연결한 뒤
  대시보드를 열면 `network` 줄이 발생 시각 자리에 들어오는지.

---

## 9. 함께 고칠 문서

- `docs/specs/2026-08-14-strict-types-and-logging.md` 2절 "서버 로그는 실패만 남긴다": 그 전제였던 "로그 싱크가
  없다"가 이번에 깨진다. stdout 규칙은 유지하되, DB 기록(`logFailure`)이 생겼다는 것과 이 문서로 가는 링크를 PR 1에서
  날짜와 함께 덧붙인다. "로깅 유틸을 만들지 않은 이유" 문단도 같이 고친다.
- `docs/database-migrations.md`: `DB test` 잡과 스냅샷 규칙(8.3)을 PR 1에서 더한다.
- `docs/TODO_list/auth/require-admin-role-check.md`: PR 2에서 지운다(6장).
- `docs/TODO_list/auth/admin-account-management.md`의 `막힌 이유`: `admin_users`·`is_admin()`이 운영에 없다고
  적혀 있다. 그 마이그레이션이 든 PR에서 고친다.

---

## 10. 범위 밖

- 관리자 계정 추가·삭제 화면과 역할 분리 — `docs/TODO_list/auth/admin-account-management.md`.
- 되돌리기(이 시점으로 복원).
- 사람·대상·기간 필터, 검색, "이 대상 열기" 링크 — 써 보고 필요해지면 더한다.
- 오류 알림(메일 등)과 `critical` 유형.
- 공개 지도 화면(브라우저)의 오류 수집 — 누구나 쓸 수 있는 기록 창구가 생겨 스팸 대책이 따로 필요하다.
- 보존 기간과 자동 삭제.

---

## 11. 구현 시 확인할 것

작성 시점에 실행해 보지 않은 전제다. 구현 첫 단계에서 확인하고, 틀리면 이 문서를 고친다.

1. 트리거 안에서 `current_setting('request.headers', true)`와 `current_setting('request.jwt.claims', true)`가
   이 프로젝트의 PostgREST에서 기대한 형태(JSON 문자열, 헤더 이름 소문자)로 보이는지. 새 형식 API 키(`sb_secret_…`)를
   쓰는 경우에도 `role = service_role`이 클레임에 실리는지.
   - **2026-10-19 확인.** PostgREST 소스(v12~v14)에서 `request.jwt.claims`는 클레임 전체를 담은 JSON 문자열,
     `request.headers`는 이름을 소문자로 바꾼 JSON(쿠키 제외)이고, 둘 다 `set_config(..., true)`로 들어간다.
     PostgREST가 클레임에 `role`을 늘 넣는다. 새 형식 키는 게이트웨이가 짧은 JWT로 바꿔 넘기므로
     `role = service_role`이 실리고 `sub`는 없다. 이 프로젝트의 서비스 키는 이날 기준 레거시 JWT 형식이다.
   - **덧붙인 사실.** 트랜잭션 로컬 값은 트랜잭션이 끝난 뒤 같은 세션에서 NULL이 아니라 `''`로 남는다(Postgres
     동작, PGlite의 Postgres 17.5로 재현). 그래서 3.3의 "클레임 없음"은 빈 문자열을 포함하고, 트리거는
     `nullif(..., '')`로 읽는다. 헤더 JSON에는 `authorization`·`apikey`도 들어 있어 헤더 전체를 저장하지 않는다.
2. `security definer` 함수 안에서도 1의 설정 값이 그대로인지.
   - **2026-10-19 확인.** Postgres 문서와 PGlite(Postgres 17.5) 실험: `set search_path`를 단 `security definer`
     함수와 트리거 안에서도 두 값은 호출한 요청의 것이고, `current_user`만 소유자로 바뀐다.
3. Vercel이 만든 413·504 응답에 `x-vercel-error`가 실리고, 같은 출처 `fetch`에서 읽히는지.
   - **2026-10-19, 413 확인.** 운영 관리자 라우트에 4.5MB를 넘는 본문을 보내 `413`,
     `X-Vercel-Error: FUNCTION_PAYLOAD_TOO_LARGE`, `text/plain` 본문을 받았다. 같은 라우트의 401은 JSON이고 이
     헤더가 없다. 같은 출처 `fetch`는 `Set-Cookie`를 빼고 모든 응답 헤더를 읽는다(Fetch 명세).
   - **504는 실측하지 못했다.** 이 헤더는 Vercel 공식 문서에 없고, 504에 실리는 것은 Vercel 저장소의 테스트
     픽스처와 이슈 보고로만 확인했다. 그래서 4.1에 504 대체 규칙을 두었다.
4. `supabase db start`가 GitHub 호스팅 러너에서 도는지. `supabase db dump --schema public` 결과가 그 로컬 DB에
   그대로 적용되는지(소유자·권한 구문).
   - **2026-10-19, 전제 일부가 틀렸다.** 러너에서 `db start`는 돈다(supabase/setup-cli 문서). 그러나
     `db start`는 새 DB에 `supabase/migrations` 전체를 적용하고, `supabase test db`는 `supabase/tests/`를 하위까지
     실행하며, `--schema public` 덤프에는 `CREATE EXTENSION`이 빠진다. 8.3을 고쳤다.
   - 덤프가 로컬 DB에 그대로 적용되는지는 PR 0 산출물로 PR 1 첫 단계에서 확인한다.
   - **2026-10-19 확인.** 스냅샷은 `prelude.sql`도 다른 접속 계정(`BASELINE_DB_URL`)도 없이 그대로 적용됐고, 그 위에서
     PR 1a의 두 마이그레이션과 pgTAP이 `DB test` 잡에서 통과했다.
5. 운영 RLS 정책 목록(6장의 SQL) — PR 2 착수 전.
   - 2026-10-19, PR 0 스냅샷(run `39217944227`)으로 먼저 봤다. 쓰기 정책 17개가 모두 `authenticated`에게 `true`로
     열려 있다. `buildings`·`building_facilities`·`building_photos`·`colleges`·`facility_types`에 콘솔에서 만든
     `authenticated can <insert|update|delete> <테이블>`이 테이블마다 셋, `landmarks`·`slope_segments`에 마이그레이션이
     만든 `authenticated write`가 하나씩이다. 그래서 `colleges`·`facility_types`를 6장 대상에 더했다.
   - PR 2 착수 직전에 6장의 SQL로 운영을 다시 받아 이 목록과 같은지 본다.
6. Next 16의 `after()` 동작 — `node_modules/next/dist/docs/`에서 확인.
   - **2026-10-19 확인.** `after.md`: 라우트 핸들러에서 쓸 수 있고, 응답이 끝난 뒤 실행되며, 오류 응답이어도
     실행되고, 라우트의 maxDuration 동안 함수가 살아 있다.
7. Supabase Table Editor로 넣은 행이 PostgREST를 거치지 않는지. 거치지 않으면 첫 두 관리자 행(7장)의 행위자는
   `DB 직접 변경`으로 남는다. 거친다면 그때 실리는 클레임을 보고 3.3 표를 고친다.
   - **2026-10-19 확인.** Table Editor는 pg-meta로 SQL을 `postgres` 역할로 실행한다(Studio 소스, Supabase 역할
     문서). 요청 클레임이 없어 첫 두 관리자 행의 행위자는 `DB 직접 변경`이다. 역할 사칭을 켜면 Studio가
     `request.jwt.claims`를 넣지만 `x-actor-*` 헤더는 넣지 않는다.

---

## 12. 이력

- 2026-10-19 — 최초 작성.
- 2026-10-19 — 11장 전제를 확인해 결과를 적고, 3.3(빈 문자열·`anon`), 3.4(스크립트), 4.1(504), 4.3(보고를
  관문에서), 4.4(문장 형식), 3.7(기록 실패 행의 행위자·작업 키), 8.3(DB 검증 잡 절차), 9장을 고쳤다.
- 2026-10-19 — 6장: 빈 목록 확인이 DB 검증 잡에서 늘 실패하던 것을 `app.db_test` 설정으로 풀고, 목록 조회 실패와
  화면 진입 확인 실패의 처리를 정했다.
- 2026-10-19 — 운영 스키마 스냅샷으로 11장 5를 먼저 확인하고, 6장의 쓰기 RLS 대상에 `colleges`·`facility_types`를
  더했다.
- 2026-10-20 — 11장 4의 확인 결과를 적고, 3.4 완료 조건에 `supabaseAdmin`의 테스트 파일을 더했다.
