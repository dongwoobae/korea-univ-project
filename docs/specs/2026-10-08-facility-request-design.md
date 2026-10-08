# 시설 등록 요청과 제보함 설계

2026-10-08

## 이 문서의 목적

공개 지도에서 학생 누구나 건물 안 시설을 등록 요청하고, 관리자가 그 요청을 고쳐서 승인하면 바로 지도에
올라가는 기능의 설계다. 같은 변경으로 시설 사진(시설당 최대 3장)과 관리자 제보함(등록 요청·피드백)을 만든다.

---

## 1. 배경과 범위

### 1.1 요청

- 2026-10-06: "학생들 누구나 자유롭게 참여, 정보 요청하기", "관리자 페이지에서 신청 들어오면 보고 승인하는
  방식으로". 같은 날 범위를 **등록만**(수정·삭제 요청 없음), **관리자 승인 후 공개**로 정했다.
- 2026-10-08: 피드백 버튼이 아니라 **건물 사이드패널**에서, 관리자 시설 추가와 같은 모달로 받는다. 학생이 유형을
  고르고 위치를 찍고 사진을 찍어 올리는 크라우드소싱 형태다.

### 1.2 이번 범위

1. 공개 사이드패널의 시설 등록 요청 모달과 제출 API
2. 시설 사진 — 공개 표시, 관리자 추가·삭제, 시설 삭제 시 정리
3. 관리자 제보함 — 등록 요청 탭(검토·수정·승인·거절)과 피드백 탭(상태 변경)

범위 밖은 9장.

---

## 2. 저장 구조

### 2.1 방식 — 요청 전용 테이블

요청은 `facility_requests`에 따로 쌓고, 승인할 때 서버가 시설을 만든다. 공개 지도가 시설을 읽는 경로
(`building_facilities` 조회)는 바뀌지 않으므로 승인 전 요청이 지도에 나갈 길이 없다.

기각한 대안:

- **`building_facilities`에 승인 상태 컬럼.** 공개 조회, 공개 캐시(`/api/facilities`), 번역, 삭제 경로가 모두
  "승인된 것만" 조건을 지켜야 한다. 하나라도 빠지면 학생 요청이 바로 지도에 노출된다.
- **`feedback_submissions` 재사용.** 텍스트용 테이블이라 사진·위치·승인 상태가 맞지 않는다.

### 2.2 테이블

```sql
create table public.facility_requests (
  id uuid primary key default gen_random_uuid(),
  building_id bigint not null references public.buildings(id),
  facility_code text not null,
  name text check (name is null or char_length(name) <= 100),
  description text check (description is null or char_length(description) <= 1000),
  floor_info text check (floor_info is null or char_length(floor_info) <= 100),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'approved', 'rejected')),
  client_hash text not null,
  facility_id uuid references public.building_facilities(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table public.facility_request_photos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.facility_requests(id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null check (sort_order between 0 and 2),
  unique (request_id, sort_order)
);

create table public.facility_photos (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.building_facilities(id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null check (sort_order between 0 and 2),
  created_at timestamptz not null default now(),
  unique (facility_id, sort_order)
);
```

- 생성 타입(`supabase/database.types.ts`)상 `buildings.id`는 숫자, `building_facilities.id`는 문자열(uuid)이다. 두 테이블은
  마이그레이션 이전에 만들어져 저장소에 정의가 없으므로 정확한 컬럼 타입은 운영 스키마로 확인해 맞춘다(10장).
- **3장 상한은 DB가 막는다.** `sort_order`가 0~2이고 (부모, 순서)가 유일하므로 넷째 행은 들어갈 수 없다.
- 사진 테이블은 저장소 경로만 갖는다. 공개 주소는 읽을 때 `getPublicUrl(storage_path)`로 만든다. 주소까지 저장하면
  같은 위치를 두 값으로 들고, 버킷 이름이나 도메인이 바뀌는 순간 둘이 어긋난다. 건물 사진은 주소만 저장하고 삭제 때
  주소에서 경로를 역으로 뽑는다(`buildingPhotoPathFromUrl`) — 그 방식을 따르지 않는다.
- `facility_id`는 승인으로 만든 시설이다. 시설이 나중에 지워지면 `null`이 되고 요청 기록은 남는다.

### 2.3 요청 상태

| 값          | 화면 표시 | 들어가는 경로                             |
| ----------- | --------- | ----------------------------------------- |
| `new`       | 신규      | 제출                                      |
| `reviewing` | 확인 중   | 관리자가 검토 모달에서 `확인 중으로 표시` |
| `approved`  | 승인됨    | 승인 (`new`·`reviewing`에서)              |
| `rejected`  | 거절됨    | 거절 (`new`·`reviewing`에서)              |

`reviewing` → `new` 되돌리기를 허용한다. `approved`·`rejected`는 끝 상태다.

### 2.4 사진 저장소

| 버킷                      | 공개 | 담는 것                 |
| ------------------------- | ---- | ----------------------- |
| `facility-request-photos` | 아니 | 요청 사진. 승인 전 상태 |
| `facility-photos`         | 예   | 지도에 나가는 시설 사진 |

- 두 버킷 모두 버킷 설정으로 `file_size_limit` 4MB, `allowed_mime_types` `image/webp`를 건다. 크기는
  저장소가 강제하지만 형식은 저장소가 선언된 Content-Type만 보므로, WebP 여부는 서버가 바이트로 검사한다.
- 비공개 버킷은 관리자 화면에서 서버가 만든 10분짜리 열람 주소(`createSignedUrls`)로만 본다.
- 경로: 요청 사진 `{request_id}/{random}.webp`, 시설 사진 `{facility_id}/{random}.webp`. **한 요청·한 시설의 파일은
  그 id 폴더 안에만 둔다.** 정리(2.7)와 실패 시 되돌리기(4.4)가 행이 아니라 폴더를 기준으로 지우므로, 행이 생기기
  전에 실패해 남은 파일도 함께 지워진다.

### 2.5 접근 권한

- `facility_requests`, `facility_request_photos`: anon·authenticated 모두 권한 없음. 서버 API가 서비스 키로만 다룬다.
- `facility_photos`: anon·authenticated **읽기만** 허용(공개 사이드패널이 시설과 함께 읽는다). 쓰기는 서버 API.
- 2.6의 DB 함수는 anon·authenticated의 `execute`를 회수한다. public 스키마 함수는 PostgREST가 `/rest/v1/rpc/…`로
  누구에게나 노출하므로, 회수하지 않으면 익명 사용자가 승인 함수를 직접 부를 수 있다. 서버 API(서비스 키)만 부른다.
- 관리자 API는 기존 관리자 API와 같은 `requireAdmin`을 거친다. 이 검사가 로그인 여부만 보고 역할은 보지 않는
  문제는 `docs/TODO_list/auth/require-admin-role-check.md`에 있고 이 범위에서 바꾸지 않는다.

### 2.6 DB 함수 — 확인과 쓰기를 한 트랜잭션에

"상태를 확인하고 쓴다"를 서버 API에서 두 번의 요청으로 하면, 그 사이에 다른 요청이 끼어든다. 상태·장수·빈도처럼
확인 결과에 따라 쓰는 곳은 모두 DB 함수 하나로 잠그고 확인하고 쓴다.

| 함수                                                                                              | 잠그는 것                                      | 확인                                                                    | 쓰기                                                                                  | 돌려주는 값                                                       |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `create_facility_request(p_fields jsonb, p_client_hash text)`                                     | `pg_advisory_xact_lock(hashtext(client_hash))` | 같은 해시로 최근 1시간에 만든 요청 수 < 10                              | 요청 행                                                                               | 요청 id, 또는 `rate_limited`                                      |
| `add_facility_request_photo(p_request_id uuid, p_storage_path text)`                              | 요청 행 `for update`                           | 상태 `new`, 사진 3장 미만                                               | 사진 행(비어 있는 가장 작은 `sort_order`)                                             | 사진 id, 또는 `not_new`·`full`·`not_found`                        |
| `approve_facility_request(p_request_id uuid, p_facility_id uuid, p_fields jsonb, p_photos jsonb)` | 요청 행 `for update`                           | 상태 `new`·`reviewing`, `photos`의 모든 `request_photo_id`가 이 요청 것 | 시설 행(`facility_id`로), 시설 사진 행, 요청을 `approved`·`facility_id`·`reviewed_at` | `approved`, 또는 `not_found`·`already_processed`·`photo_mismatch` |

- `fields`: `{ facility_code, name, description, floor_info, is_installed, lat, lng }`. 승인 함수는 `building_id`를 요청
  행에서 가져오고 `translation_status`를 `pending`으로 둔다(관리자 폼과 같다).
- `photos`: `[{ request_photo_id, storage_path, sort_order }]`. `storage_path`는 공개 버킷에 이미 복사된 경로다(4.4).
- 상태 표시(`new` ↔ `reviewing`)와 거절은 조건부 갱신 한 문장(`update … where id = $1 and status in (…)`)이라 함수가
  필요 없다.

### 2.7 요청 사진 정리 — 몇 번을 다시 해도 같은 결과

정리 = 비공개 버킷의 `{request_id}/` 폴더를 나열해 모두 지운다 → 그 요청의 사진 행을 지운다.

- 승인(4.4)과 거절(4.5)이 끝에 부른다. 이미 지워진 것은 건너뛰므로 다시 불러도 안전하다.
- 파일을 먼저 지우고 행을 나중에 지우므로, **끝 상태 요청에 사진 행이 남아 있으면 정리가 실패했다는 뜻이다.**
  검토 모달이 그때 `남은 사진 정리` 버튼을 보인다(`POST /api/facility-requests/{id}/cleanup`, 끝 상태 요청만).
- 폴더를 기준으로 지우므로, 사진 업로드 중 행을 만들지 못하고 파일 삭제까지 실패해 남은 파일(3.5)도 이때 지워진다.
- 검토 전 요청(`new`·`reviewing`)의 사진은 정리하지 않는다 — 관리자가 아직 볼 것이다.

---

## 3. 학생 제출

### 3.1 화면

- 공개 건물 사이드패널의 시설 목록 아래에 `시설 등록 요청` 버튼. 문구는 ko/en/zh.
- 모달 필드: 시설 유형(필수, 현재 언어의 유형 이름), 층, 이름, 설명, 위치, 사진 최대 3장. 유형 외에는 선택.
  설치 상태는 받지 않는다 — 있는 시설을 알리는 것이므로 승인 때 관리자가 정한다.
- 위치는 관리자 폼과 같은 `FacilityMap`을 그 건물 중심으로 연다. 지도를 눌러 찍고, 현재 위치 버튼이 있다.
- 사진 칸 바로 아래 안내: "사진은 최대 3장, 장당 4MB까지 올릴 수 있어요. 올릴 때 자동으로 줄여요."
- 휴대폰에서는 모달이 전체 화면이다. 포커스·Esc는 `useModalFocus`.
- 요청자 이름·연락처는 받지 않는다(익명).

### 3.2 입력 필드는 세 모달이 공유한다

관리자 시설 폼(`FacilityFormModal`), 학생 요청 모달, 관리자 검토 모달(4.3)은 같은 시설 필드를 다룬다.
`FacilityFormModal`은 지금 필드 상태와 저장·번역·캐시 갱신을 한 컴포넌트에 갖고 있어 그대로 재사용할 수 없다.

- **공유하는 것:** 필드 입력 컴포넌트 `FacilityFields`(유형·이름·설명·층·설치 상태·위치 지도, 제어 컴포넌트)와
  필드 값 타입·검증 함수. 설치 상태 칸은 숨길 수 있다(학생 모달).
- **각 모달이 갖는 것:** 저장 경로, 상태 버튼, 사진의 수명주기.
- `FacilityFormModal`도 `FacilityFields`를 쓰도록 바꾼다. 세 곳이 필드를 따로 만들면 필드 하나를 더할 때 세 번 고쳐야 한다.
- 검증: 클라이언트는 `validateFacilityForm`(유형 필수, 독립 시설 좌표)에 글자 수 상한을 더한 함수를 쓴다. 서버는
  같은 상한과 좌표 범위를 다시 검사한다(3.4, 4.4). `validateFacilityForm`은 유형과 좌표만 보므로 서버 검증으로 쓰지 않는다.

### 3.3 전송 — 요청 먼저, 사진은 한 장씩

Vercel 서버 함수의 요청 본문 한도가 4.5MB이고, 이 한도는 파일만이 아니라 요청 전체에 걸린다. 사진 세 장을 한
요청에 담으면 장당 1.3MB 정도로 묶여야 해서, 요청과 사진을 나눠 보낸다.

1. `POST /api/facility-requests` — 입력값과 Turnstile 토큰(사진 없음). 통과하면 `{ id, uploadToken }`.
2. 사진마다 `POST /api/facility-requests/{id}/photos` — 파일 한 장과 `uploadToken`.
3. 사진마다 `올리는 중 / 완료 / 실패`를 보이고, 실패한 사진만 다시 시도할 수 있다(토큰 유효 동안).
4. 모두 끝나면 완료 안내 "요청을 보냈어요. 관리자가 확인한 뒤 지도에 올라가요."

- `uploadToken`은 `request_id`와 만료 시각(15분)을 서버 비밀값으로 HMAC 서명한 값이다. Turnstile 토큰은 한 번만
  검증되므로 사진마다 봇 검사를 다시 하지 않으려고 둔다.
- 사진은 브라우저가 `convertToWebP`(긴 변 1920px)로 바꾼 뒤 올린다. 원본 크기는 상관없다. 바꾼 결과가 4MB를
  넘으면 그 사진 칸에 "사진이 너무 커요(4MB 초과)"를 띄우고 올리지 않는다.
- 중간에 창을 닫으면 그때까지 올라간 사진만 붙은 요청으로 남는다. 관리자 목록이 사진 수를 보여준다.

기각한 대안: 브라우저가 Supabase 저장소로 직접 올리는 서명 업로드 주소. 4.5MB 한도가 사라지지만 업로드 뒤
확인 단계와, 확인이 오지 않은 파일의 정리가 필요하다. 변환 후 사진은 대부분 1MB 안쪽이라 4MB면 충분하다.

### 3.4 서버 검사 — 요청 생성

순서대로:

1. 본문 크기 상한. honeypot 필드가 채워져 있으면 저장 없이 성공 응답(기존 피드백과 같다).
2. Turnstile `siteverify`(비밀 키, 접속 IP). 실패하면 400.
3. 입력 검증(서버 검증 함수, 4.4와 공유) — 건물이 있고 삭제되지 않았는지, `facility_code`가 `facility_types`에 있는지,
   좌표 범위, 글자 수.
4. `create_facility_request`(2.6) — 빈도 확인과 행 생성을 한 트랜잭션에서. `rate_limited`면 429.
5. 토큰 발급.

`client_hash`는 접속 IP를 `FACILITY_REQUEST_HASH_SECRET`으로 HMAC한 값이다. IP 원문은 저장하지 않는다.

**빈도 제한을 넉넉하게 둔 이유:** 캠퍼스 와이파이에서는 학생 여럿이 같은 공인 IP를 쓴다. IP 제한을 빡빡하게 걸면
정상 사용자가 막힌다. 봇 차단은 Turnstile이 주로 맡고 IP 제한은 대량 제출만 막는다.

**빈도 확인을 함수 안에서 하는 이유:** 세기와 넣기를 따로 하면, 같은 해시로 9건이 있을 때 동시에 보낸 두 요청이 둘 다
9건을 보고 통과해 11건이 된다.

### 3.5 서버 검사 — 사진

1. `uploadToken` 서명·만료·`request_id` 일치. 실패하면 403.
2. 파일 4MB 이하, 앞 바이트가 WebP(`isWebP`).
3. 비공개 버킷 `{request_id}/{random}.webp`에 올린다.
4. `add_facility_request_photo`(2.6) — 상태 `new`와 3장 미만을 잠근 채 확인하고 행을 만든다.
5. 함수가 `not_new`·`full`을 돌려주거나 실패하면 3에서 올린 파일을 지우고 409·500. 이 삭제마저 실패해 남은 파일은
   요청 폴더 안에 있으므로 정리(2.7) 때 지워진다.

**상태 확인을 업로드 뒤 함수에서 하는 이유:** 확인을 먼저 하고 올리면, 확인과 행 생성 사이에 관리자가 승인·거절하고
정리까지 끝낸 요청에 사진이 붙는다. 그 사진은 공개되지도 지워지지도 않는다. 함수는 승인 함수와 같은 요청 행을 잠그므로
둘은 차례로만 실행된다. `new`가 아니면 더 받지 않으므로, 관리자가 `확인 중`으로 바꾼 뒤에 올라오는 사진도 거절된다.

### 3.6 환경 변수

| 이름                             | 쓰는 곳                      |
| -------------------------------- | ---------------------------- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 모달의 Turnstile 위젯        |
| `TURNSTILE_SECRET_KEY`           | 서버 `siteverify`            |
| `FACILITY_REQUEST_HASH_SECRET`   | `client_hash`, `uploadToken` |

사이트 키가 없으면 공개 화면의 `시설 등록 요청` 버튼을 숨긴다. 배포와 변수 등록 순서가 어긋나도 눌러도 실패하는
버튼이 보이지 않는다. Turnstile 위젯 생성과 키 발급, Vercel 등록은 운영자가 한다.

---

## 4. 관리자 제보함

### 4.1 메뉴와 탭

- 관리자 상단 메뉴에 `제보함`(`/admin/dashboard/inbox`). 숫자 배지는 등록 요청 `new` 수 + 피드백 `new` 수.
- 페이지 안에서 `등록 요청 / 피드백` 탭 전환. 피드백 탭은 `?tab=feedback`.
- 두 탭 모두 상태 필터 `신규 / 확인 중 / 처리 완료 / 전체`, 기본은 신규 + 확인 중. 등록 요청의 `처리 완료`는
  `approved` + `rejected`이고 배지로 둘을 구분한다.

기각한 배치: 요청과 피드백을 한 목록에 섞고 오른쪽에 상세를 여는 메일함식. 요청은 사진·지도를 보고 승인하고
피드백은 읽고 상태만 바꾸는 등 처리 방식이 달라 한 목록의 행 모양이 들쭉날쭉해진다. 메뉴를 둘로 나누는 안은
상단 메뉴가 6개가 되어 모바일에서 좁다.

### 4.2 등록 요청 목록

최신순, 서버 페이지 나눔(`AdminPagination`). 행: 첫 사진 썸네일(서명 주소), 유형, 건물·층, 사진 수, 위치 유무,
제출 시각, 상태 배지. 건물로 거르는 `?building={id}`를 받는다(4.6).

### 4.3 검토 모달

- 요청 값이 편집 가능한 상태로 채워진다(`FacilityFields`, 3.2): 유형, 이름, 설명, 층, 설치 상태(기본 설치), 위치, 사진.
- 위치는 지도를 눌러 핀을 옮긴다. 관리자 시설 폼과 같은 `FacilityMap` 동작이다(마커 끌기는 지원하지 않는다).
- 사진은 썸네일마다 `공개` 체크, 기본은 모두 체크. 체크한 것만 공개된다.
- 버튼: `거절` · `확인 중으로 표시`(이미 확인 중이면 `신규로 되돌리기`) · `닫기` · `승인하고 등록`.
  - 상태 표시 버튼은 상태만 바꾸고 모달은 열어 둔다. 입력 중인 수정 내용은 저장하지 않는다.
  - 모달을 여는 것만으로 상태를 바꾸지 않는다. 들여다보기만 한 요청까지 확인 중이 되면 상태가 의미를 잃는다.
- `approved`·`rejected` 요청은 읽기 전용으로 연다. 승인된 요청은 만들어진 시설의 건물 상세로 가는 링크를 둔다.
  사진 행이 남아 있으면 `남은 사진 정리`를 보인다(2.7).

### 4.4 승인 — `POST /api/facility-requests/{id}/approve`

본문: `fields`(2.6)와 공개할 요청 사진 id 목록.

1. `fields`를 서버 검증 함수(3.4와 공유)로 검사한다. 실패하면 400.
2. 공개할 사진 id를 **이 요청의 사진 중에서만** 읽는다(`request_id = {id}`). 목록에 이 요청 것이 아닌 id가 있으면 400.
3. 서버가 새 시설 id를 먼저 만든다(`crypto.randomUUID()`). 공개 사진 경로(2.4)에 시설 id가 들어가는데 시설은 4단계에서야
   생기기 때문이다. 이 id 폴더로 공개할 사진을 비공개 버킷에서 공개 버킷으로 복사한다(`copy(…, { destinationBucket })`).
4. `approve_facility_request`(2.6) — 상태와 사진 소유를 잠근 채 다시 확인하고, 시설·시설 사진 행·요청 갱신을 한
   트랜잭션에서 한다. "시설은 생겼는데 요청은 대기" 같은 중간 상태가 남지 않는다.
5. **3·4 중 어디서든 실패하면 공개 버킷의 `{facility_id}/` 폴더를 통째로 지운다.** 복사가 일부만 끝난 경우(둘째 장 복사
   실패, 그 사이 다른 관리자가 거절해 원본이 사라진 경우)도 같은 폴더라 함께 지워진다. 응답은 요청을 다시 읽어 끝
   상태면 409("이미 처리된 요청이에요"), 아니면 500.
6. 정리(2.7). 실패해도 승인은 유지하고 로그를 남긴다 — 검토 모달의 `남은 사진 정리`로 다시 한다.
7. 응답 후 화면이 관리자 시설 폼과 같이 `translateFacility`와 `/api/revalidate-facilities`를 부른다.

### 4.5 상태 변경·거절

- `POST /api/facility-requests/{id}/status` — `new` ↔ `reviewing`만. 조건부 갱신이라 끝 상태인 요청에는 0행이 되어 409.
- `POST /api/facility-requests/{id}/reject` — `new`·`reviewing`일 때만 `rejected`로(조건부 갱신, 아니면 409). 이어서
  정리(2.7). 정리가 실패하면 "거절했지만 사진을 지우지 못했어요"를 돌려주고, 모달의 `남은 사진 정리`로 다시 한다.
  요청 행은 "거절됨"으로 남는다 — 같은 요청이 다시 오면 알아볼 수 있게. 거절 사유는 학생에게 전할 길이 없어 받지 않는다.

### 4.6 건물 상세 연결

건물 상세 "시설 현황" 카드에 그 건물의 `new`·`reviewing` 요청 수를 `검토 대기 요청 N건`으로 띄운다. 누르면
`/admin/dashboard/inbox?building={id}`.

---

## 5. 시설 사진

### 5.1 공개 사이드패널

- 사이드패널의 시설 조회에 `facility_photos(id, storage_path, sort_order)`를 함께 싣고, 주소는 `getPublicUrl`로 만든다(2.2).
- 시설 항목 아래 썸네일 한 줄(최대 3장). 영상이 있으면 영상 위에 둔다.
- 썸네일을 누르면 라이트박스로 연다. 대체 텍스트는 `{시설 이름} 사진 N`. 사진 설명 입력은 두지 않는다.
- **`PhotoLightbox`를 일반화한다.** 지금은 건물 사진 전용이라 3개 언어 캡션이 있는 `SidePanelPhoto[]`와 건물 이름을
  받고, 대체 텍스트를 캡션이나 건물 이름으로 정한다. 사진 목록 `{ url, alt }[]`과 제목·내려받기 이름을 받도록 바꾸고,
  건물 사진은 캡션·건물 이름을 이 모양으로 바꿔 넘긴다. 건물 사진의 보이는 동작은 그대로다.

### 5.2 관리자 — 기존 시설

- 건물 상세의 `FacilityDetailModal`에 `사진` 칸: 썸네일마다 삭제, 3장 미만이면 `사진 추가`.
- 추가 `POST /api/upload-facility-photo` — `requireAdmin`, 4MB 이하, WebP. 공개 버킷 `{facility_id}/`에 올린 뒤 행을
  만든다. 3장 상한에 걸리거나 행 생성이 실패하면 올린 파일을 지운다.
- 삭제 `POST /api/delete-facility-photo` — 행의 `storage_path`로 저장소 파일을 먼저 지우고, 실패하면 행을 남긴 채 오류를
  돌려준다. 파일이 지워지면 행을 지운다.
- 순서 바꾸기는 없다. 올린 순서대로 보인다.

### 5.3 시설 삭제

`deleteFacility`는 지금 동영상 파일을 먼저 지우고, 실패하면 시설 행을 남긴다. 사진도 같은 규칙: 사진이 있으면
동영상 다음에 사진 파일을 지우고, 실패하면 시설을 지우지 않고 메시지를 돌려준다. 사진 행은 시설 삭제의
`on delete cascade`로 지워진다.

앞 단계가 성공하고 뒤 단계가 실패하면 먼저 지운 것은 돌아오지 않는다(동영상을 지운 뒤 사진 삭제가 실패하면 시설은
남고 동영상만 사라진다). 동영상에 이미 있는 같은 문제이고 `docs/TODO_list/video/delete-ordering-data-loss.md`가 다룬다.
관리자가 삭제하려던 것이라 다시 누르면 끝난다. 구현 PR에서 그 TODO에 사진을 더하고, 이 설계에서는 순서를 바꾸지 않는다.

---

## 6. 피드백 탭

- 행: 유형 배지(`FEEDBACK_TYPES`의 이름), 본문(3줄 넘으면 접고 펼치기), 제보 페이지 주소 링크, 접수 시각, 상태 선택
  상자(`신규 / 확인 중 / 처리 완료`, 바꾸면 바로 저장).
- 상태 값은 `feedback_submissions.status`(`new`/`reviewing`/`resolved`)가 이미 갖고 있다.
- 테이블은 anon·authenticated 권한이 모두 막혀 있다. 관리자 API(`requireAdmin` + 서비스 키)로 읽고 바꾼다.
- 공개 피드백 폼의 `시설 정보 수정` 유형은 남긴다. 등록 요청은 새 시설만 받으므로 기존 시설 정보의 오류는 여전히
  피드백으로 받는다.
- `docs/future-development/admin-feedback-inbox.md`의 범위 중 목록·상태 변경·상태 필터·페이지 나눔·미확인 수 표시가
  여기서 끝난다. 검색, 유형·기간 필터, `mailto:` 보조 수단 제거, 보관 기간 규칙은 그 문서에 남긴다.

---

## 7. 배포 순서

main에 병합하면 Vercel 배포와 CI의 마이그레이션 적용이 동시에 돈다. 코드가 먼저 뜨면 없는 테이블을 부르므로 PR을
나눈다.

1. **PR 1 — 마이그레이션.** 테이블 셋, 권한, DB 함수 셋(2.6)과 그 `execute` 회수, 버킷 둘. 병합 후 CI 적용과 이력 대조가
   끝났는지 본다. 버킷을 마이그레이션(`storage.buckets` insert)으로 만드는 것은 이 저장소에서 처음이다
   (`building-photos`는 대시보드에서 만들었다). 권한 문제로 실패하면 대시보드에서 만들고 절차를
   `docs/database-migrations.md`에 적는다.
2. **운영자 — Vercel 환경 변수 셋 등록**(3.6).
3. **PR 2 — 나머지 코드.**

PR 1 적용 뒤 운영 DB에서 시험 요청으로 함수를 확인하고(8.4) 시험 데이터를 지운다.

---

## 8. 테스트 계획

### 8.1 vitest

- 요청 생성 라우트: honeypot, Turnstile 실패, 입력 검증(없는 건물·삭제된 건물·없는 유형·좌표·글자 수), 함수가
  `rate_limited` → 429
- 사진 라우트: 토큰 위조·만료·다른 요청 id, 4MB 초과, WebP 아님, 함수가 `not_new`·`full` → 올린 파일 삭제 + 409,
  함수 실패 → 올린 파일 삭제 + 500
- 승인 라우트: 필드 검증 실패 400, 다른 요청의 사진 id 400, 둘째 장 복사 실패 → 시설 폴더 삭제, 함수가
  `already_processed` → 시설 폴더 삭제 + 409, 정리 실패해도 성공
- 상태·거절 라우트: 끝 상태에서 409, 거절 뒤 정리, 정리 실패 응답
- 정리 함수: 폴더 나열 → 파일 삭제 → 행 삭제 순서, 두 번 불러도 같은 결과, 행 없는 파일도 지움
- 피드백 관리자 라우트: 비로그인 401, 상태 값 검증
- 순수 함수: `uploadToken` 서명·검증, `client_hash`, 서버 필드 검증
- `deleteFacility`: 사진이 있으면 동영상 다음에 사진을 지우고, 실패하면 행을 남긴다

### 8.2 Playwright (목 백엔드 확장)

목 백엔드에 `facility_requests`·`facility_request_photos`·`facility_photos`, 새 API 라우트, Turnstile 스크립트 대역을 더한다.

- 학생: 사이드패널 버튼 → 모달 입력 → 제출 → 사진별 진행 표시 → 완료 안내. 사이트 키가 없으면 버튼이 없다.
- 관리자: 제보함 배지, 탭 전환, 상태 필터, 검토 모달에서 수정 → 승인 → 시설 목록에 반영, 거절, 확인 중 표시·되돌리기
- 피드백 탭: 상태 변경, 필터
- 공개: 시설 사진 썸네일 → 라이트박스
- 건물 상세: 검토 대기 요청 수 링크, 시설 상세 모달의 사진 추가·삭제
- `e2e/admin-dark.spec.ts` 화면 목록에 제보함 추가

### 8.3 무너지는 기존 단언

- `src/lib/facilityDelete.test.ts`의 "동영상이 없으면 R2 정리 없이 row만 삭제한다"는 `authedFetch` 호출 횟수를 센다.
  사진 정리는 사진이 있을 때만 부르므로 사진 없는 시설로 그대로 통과해야 한다. 사진 있는 경우를 새로 넣는다.
- 사이드패널의 시설 조회 `select`가 바뀌므로 목 백엔드의 `building_facilities` 응답에 `facility_photos`를 싣는다.
- `PhotoLightbox`의 props가 바뀐다. 건물 사진 라이트박스를 겨냥한 기존 E2E는 보이는 동작(열기·닫기·이전/다음·포커스)을
  단언하므로 그대로 통과해야 한다.
- `FacilityFormModal`이 `FacilityFields`를 쓰도록 바뀐다. 독립 시설·건물 시설 폼의 기존 E2E가 그대로 통과해야 한다.

### 8.4 수동 (PR 1 적용 뒤 운영 DB)

DB 함수의 잠금·트랜잭션은 목 백엔드로 확인할 수 없다.

- `create_facility_request`: 같은 해시로 동시에 두 번 → 상한을 넘지 않는다
- `add_facility_request_photo`: 넷째 장 `full`, 승인된 요청에 `not_new`
- `approve_facility_request`: 성공, 두 번째 호출 `already_processed`, 다른 요청 사진 `photo_mismatch`
- anon 키로 `/rest/v1/rpc/approve_facility_request` 호출이 거부된다
- 휴대폰에서 모달 전체 화면, 카메라로 바로 찍어 올리기(`accept="image/*"`)

---

## 9. 범위 밖

- 기존 시설의 수정·삭제 요청 (2026-10-06 결정)
- 독립 시설(건물 밖 시설)의 등록 요청과 사진 — 요청은 건물 사이드패널에서만 받고, 공개 지도에 독립 시설 사진을
  보여줄 자리가 없다
- 사진 순서 바꾸기, 사진 설명
- 요청자 연락처, 처리 결과 알림
- 피드백 검색·유형/기간 필터·`mailto:` 제거·보관 기간 (6장)
- `requireAdmin` 역할 검사 (2.5)
- 서버가 승인 도중(복사 뒤, 4.4의 5단계 전) 죽어 남는 공개 버킷의 `{facility_id}/` 폴더 수거 — 시설 행이 없는 폴더가
  대상이다. 요청 비공개 파일은 정리(2.7)가 폴더 기준이라 다시 부르면 지워지지만, 이 경우는 부를 주체가 없다. 발생이
  확인되면 `docs/TODO_list/`로 옮긴다
- 시설 삭제 단계 사이 실패의 순서 문제 (5.3, 기존 TODO)

## 10. 구현 시 확인할 것

- `buildings.id`·`building_facilities.id`의 실제 타입과 FK 이름(2.2)
- Supabase 마이그레이션에서 `storage.buckets` insert 권한(7장)
- DB 함수의 `execute` 회수가 PostgREST에 반영되는지(2.5) — 8.4에서 anon 호출로 확인
- 저장소 `list`의 기본 개수 상한이 정리(2.7)에 충분한지 — 요청 폴더에는 3장과 실패 잔여 파일만 들어간다
- Turnstile 토큰 유효 시간(발급 후 300초)과 위젯 만료 처리 — 모달을 오래 열어 두면 제출 직전에 다시 받아야 한다
- 사이드패널 시설 조회에 `facility_photos`를 싣는 embed가 anon 권한에서 동작하는지
- `AGENTS.md`의 지시에 따라 `node_modules/next/dist/docs/`의 해당 가이드(라우트 핸들러, 동적 세그먼트)를 읽고 쓴다

## 11. 이력

- 2026-10-08 초안(`a9478a5`)은 상태·장수·빈도를 서버 API에서 확인한 뒤 따로 썼다. 확인과 쓰기 사이에 다른 요청이 끼어들
  수 있어, 승인 뒤에 사진이 붙거나(공개도 정리도 안 되는 파일) 동시 제출이 빈도 상한을 넘었다. 정리는 행 기준이라 한 번
  실패하면 다시 할 길이 없었고, 승인 중 일부만 복사된 공개 파일은 정리 대상에서 빠졌다. 같은 날 확인과 쓰기를 DB 함수로
  묶고(2.6), 파일을 id 폴더에 가두고 정리를 폴더 기준으로 바꿨다(2.4, 2.7, 4.4). 함께 사진 주소 컬럼을 없애고(2.2),
  입력 필드 공유(3.2)와 라이트박스 일반화(5.1)를 적었다. 핀 끌기는 기존 지도 컴포넌트가 지원하지 않아 지도를 눌러
  옮기는 방식으로 바꿨다(4.3).
