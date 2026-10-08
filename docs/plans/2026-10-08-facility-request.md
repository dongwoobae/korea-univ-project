# 시설 등록 요청과 제보함 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 지도 건물 사이드패널에서 익명 학생이 시설 등록을 요청하고(사진 최대 3장), 관리자가 제보함에서 고쳐 승인하면 바로 지도에 오르게 한다. 시설 사진과 피드백 탭을 함께 만든다.

**Architecture:** 요청·요청 사진·시설 사진 세 테이블과, 확인-쓰기를 묶는 DB 함수 셋을 마이그레이션으로 만든다(PR 1). 학생 경로는 Turnstile·IP 해시 빈도 제한을 거친 공개 API, 관리자 경로는 `requireAdmin` API이며 둘 다 서비스 키로 DB·저장소를 다룬다. 파일은 요청·시설 id 폴더에 가두고 실패와 정리는 폴더 단위로 한다(PR 2).

**Tech Stack:** Next.js 16.2.4 App Router(라우트 핸들러), React 19.2.4, `@supabase/supabase-js` 2.105(Postgres·Storage), Cloudflare Turnstile, Vitest(node 환경), Playwright(목 백엔드).

**Spec:** `docs/specs/2026-10-08-facility-request-design.md` — 각 태스크의 "설계 N" 표기는 이 문서의 절이다. 계획과 설계가 다르면 설계가 맞다. 멈추고 보고한다.

## Global Constraints

- 사진: WebP만, 장당 `4 * 1024 * 1024` 바이트(`MAX_FACILITY_PHOTO_BYTES`), 요청·시설당 3장(`MAX_FACILITY_PHOTOS`).
- 버킷: `facility-request-photos`(비공개), `facility-photos`(공개). 경로는 `{요청 또는 시설 id}/{uuid}.webp`.
- 요청 상태: `new` / `reviewing` / `approved` / `rejected`. 피드백 상태: `new` / `reviewing` / `resolved`.
- 빈도 제한: 같은 `client_hash` 최근 1시간 10건. 업로드 토큰 유효 15분.
- 환경 변수: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `FACILITY_REQUEST_HASH_SECRET`.
- 동적 라우트의 두 번째 인자는 `{ params }: { params: Promise<{ id: string }> }`로 직접 타입을 단다. `RouteContext`는 `next typegen`이 만든 전역 타입이라 CI의 `tsc --noEmit`에는 없다.
- 공개 API의 오류 응답은 `{ error: "<코드>" }` 문자열 코드다(화면이 번역 키로 바꾼다). 관리자 API 오류는 한국어 문장.
- 쿼리 문자열은 기존 관리자 화면처럼 `new URLSearchParams(window.location.search)`로 읽는다(`useSearchParams`는 Suspense 경계를 요구한다).
- 주석은 이유·외부 제약·위험만. 다른 파일의 상수 값·줄번호·개수를 적지 않는다(심볼 이름으로 가리킨다).
- 커밋 메시지는 한국어, `Co-Authored-By` 없음, 작업 과정(리뷰·점검) 언급 없음.
- 이 저장소는 `core.autocrlf=true`다. 형식 검사는 `npx prettier --check --end-of-line auto <파일>`로 본다.
- 명령: 단위 `npx vitest run <파일>`, E2E `npx playwright test <파일>`, 타입 `npm run typecheck`, 린트 `npm run lint`.
- E2E의 dev 서버는 재사용된다(`reuseExistingServer`). `playwright.config.ts`의 `webServer.env`를 바꾼 뒤에는 3100 포트의 기존 서버를 끄고 돌린다.
- 운영 DB 스키마는 마이그레이션으로만 바꾼다. 대시보드 SQL 편집기는 읽기 확인에만 쓴다(`docs/database-migrations.md`).

## 브랜치와 PR

| PR   | 브랜치                                                | 내용                                          |
| ---- | ----------------------------------------------------- | --------------------------------------------- |
| PR 1 | `feat/facility-requests`                              | 설계·이 계획·마이그레이션·생성 타입(Task 1~2) |
| PR 2 | `feat/facility-requests-app`(PR 1 병합 뒤 `main`에서) | 나머지 전부(Task 3~21)                        |

PR 2를 `main`에 병합할 때 이 계획 문서를 `git rm`한다.

## 진행 상황과 계획에서 바뀐 것 (2026-10-08)

- PR 1 = #23(병합 대기). Task 2 Step 3·4의 확인 절차는 #23 본문에 고쳐 적었다 — SQL 편집기가 마지막 문장 결과만 보여 주므로 `do` 블록 끝에서 예외로 결과를 보이고 되돌린다. `.env.local`은 `//` 주석 때문에 `source`할 수 없어 `grep`으로 값을 뽑는다. 버킷 설정 확인을 더했다.
- PR 2 브랜치는 PR 1 병합을 기다리지 않고 `feat/facility-requests` 위에 쌓았다. #23이 병합되면 `main`을 대상으로 PR을 연다.
- Task 3부터 17까지 완료. 남은 것은 Task 18·19·20·21.
- 아래 본문의 코드와 다르게 구현된 것. 남은 태스크는 본문보다 이쪽을 따른다.
  - `FacilityFields`의 `onChange`는 `Dispatch<SetStateAction<FacilityFieldValues>>`다. 위치 버튼의 늦은 콜백이 그 사이 입력을 되돌리지 않게 함수형 갱신을 쓴다. 소비자는 `useState` setter를 그대로 넘긴다.
  - 시설 사진 표시 순서는 `created_at` 오름차순, 같으면 `sort_order`다. 업로드가 비어 있는 가장 작은 슬롯을 쓰므로 `sort_order`만으로는 설계 5.2 "올린 순서대로"가 깨진다. 검토 모달(Task 18)과 `FacilityPhotoManager`(Task 20)도 이 순서로 보인다. 사진 조회에 `created_at`을 싣는다.
  - 상세 API의 사진 `url`은 서명이 실패하면 `null`이다. 검토 모달은 그 사진을 "볼 수 없음"으로 보이고 공개 체크를 막는다.
  - 승인 API: 같은 사진 id 중복은 400. 이 요청 것이 아닌 사진 id는 요청이 끝 상태면 409(다른 관리자가 먼저 처리), 아니면 400. 함수 결과를 잃었어도 요청의 `facility_id`가 이번 id면 200으로 답한다(설계 4.4 2·5단계).
  - 거절 응답을 잃고 다시 거절하면 409다. 끝 상태인데 사진 행이 남았으면 `남은 사진 정리`(cleanup)로 다시 한다.
  - 이 기능의 `[id]` 라우트는 형식이 틀린 id를 조회 전에 404로 답한다(`src/lib/uuid.ts`의 `isUuid`).
  - Supabase 결과는 매번 `error`를 확인해 로그와 500으로 답한다. postgrest-js는 실패를 던지지 않고 `{ error }`로 돌려준다.
  - `deleteFacility`는 사진 삭제가 404면 이미 지운 것으로 넘긴다(부분 실패 뒤 재시도).
  - 린트 경고 `@next/next/no-img-element`가 둘 늘었다(요청 모달 미리보기, 요청 목록 썸네일). PR 2 본문에 적는다.
- 최종 검토 때 볼 남은 항목: 시설 사진 업로드 롤백의 `removeObject`가 실패하면 시설 폴더에 행 없는 파일이 남고 시설 삭제(행 기준)로 수거되지 않는다. `removeFolder` 반복에 횟수 상한이 없다. 승인·거절 정리가 폴더를 나열한 뒤에 도착한 업로드가 `not_new`를 받고 파일 삭제까지 실패하면 행 없는 파일이 남아 `남은 사진 정리` 신호가 뜨지 않는다(설계 9장 후보). "사이트 키가 없으면 버튼이 없다"는 E2E가 없다 — `NEXT_PUBLIC_*`가 dev 서버 빌드에 박혀 서버를 하나 더 띄워야 해서 뺐다.

## 파일 지도

| 파일                                                                                       | 책임                                                             |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `supabase/migrations/20261008000000_create_facility_requests.sql`                          | 테이블 셋, 권한, DB 함수 셋, 버킷 둘                             |
| `supabase/database.types.ts`                                                               | 위 스키마의 생성 타입(손으로 추가)                               |
| `src/lib/facilityPhotos.ts`                                                                | 버킷 이름·크기 상한·경로 규칙(클라이언트·서버 공용)              |
| `src/lib/facilityFields.ts`                                                                | 시설 필드 값 타입, 글자 수 상한, 서버 파서 `parseFacilityFields` |
| `src/lib/server/supabaseAdmin.ts`                                                          | 서비스 키 클라이언트(지연 생성, 타입 지정)                       |
| `src/lib/server/requestSecurity.ts`                                                        | 업로드 토큰 서명·검증, 접속 IP, `clientHash`                     |
| `src/lib/server/turnstile.ts`                                                              | Turnstile `siteverify`                                           |
| `src/lib/server/requestPhotoStorage.ts`                                                    | 사진 올리기·지우기·폴더 지우기·복사·서명 주소·요청 사진 정리     |
| `src/lib/inboxStatus.ts`                                                                   | 제보함 필터 ↔ 상태 값, 상태 이름                                 |
| `src/test/queryStub.ts`                                                                    | 라우트 테스트용 Supabase 쿼리 체인 대역                          |
| `src/app/api/facility-requests/route.ts`                                                   | 요청 생성(POST, 공개), 목록(GET, 관리자)                         |
| `src/app/api/facility-requests/[id]/route.ts`                                              | 상세(GET, 관리자)                                                |
| `src/app/api/facility-requests/[id]/photos/route.ts`                                       | 요청 사진 업로드(POST, 공개)                                     |
| `src/app/api/facility-requests/[id]/status/route.ts`                                       | 신규 ↔ 확인 중                                                   |
| `src/app/api/facility-requests/[id]/reject/route.ts`                                       | 거절 + 정리                                                      |
| `src/app/api/facility-requests/[id]/cleanup/route.ts`                                      | 남은 사진 정리                                                   |
| `src/app/api/facility-requests/[id]/approve/route.ts`                                      | 승인                                                             |
| `src/app/api/inbox-counts/route.ts`                                                        | 메뉴 배지 숫자                                                   |
| `src/app/api/admin-feedback/route.ts`, `[id]/route.ts`                                     | 피드백 목록·상태 변경                                            |
| `src/app/api/upload-facility-photo/route.ts`, `src/app/api/delete-facility-photo/route.ts` | 기존 시설 사진 추가·삭제                                         |
| `src/lib/facilityDelete.ts`                                                                | 시설 삭제에 사진 단계 추가                                       |
| `src/components/sidepanel/PhotoLightbox.tsx`                                               | 사진 `{ url, alt, caption }` 목록을 받는 라이트박스              |
| `src/components/facility/FacilityFields.tsx`                                               | 세 모달이 쓰는 시설 입력 필드                                    |
| `src/components/admin/FacilityFormModal.tsx`                                               | `FacilityFields` 사용으로 교체                                   |
| `src/lib/facilityPhotoUrl.ts`                                                              | 공개 사진 주소(`getPublicUrl`)                                   |
| `src/components/sidepanel/FacilityPhotoStrip.tsx`                                          | 시설 썸네일 줄 + 라이트박스                                      |
| `src/components/TurnstileWidget.tsx`                                                       | Turnstile 스크립트 로드·위젯                                     |
| `src/lib/facilityRequestClient.ts`                                                         | 학생 모달의 제출·사진 업로드 호출                                |
| `src/components/sidepanel/FacilityRequestModal.tsx`                                        | 학생 요청 모달                                                   |
| `src/app/admin/dashboard/inbox/page.tsx`                                                   | 제보함(탭)                                                       |
| `src/components/admin/inbox/FacilityRequestList.tsx`                                       | 요청 목록                                                        |
| `src/components/admin/inbox/FacilityRequestReviewModal.tsx`                                | 검토 모달                                                        |
| `src/components/admin/inbox/FeedbackList.tsx`                                              | 피드백 목록                                                      |
| `src/components/admin/inbox/InboxFilterSelect.tsx`                                         | 두 탭 공용 상태 필터                                             |
| `src/components/admin/FacilityPhotoManager.tsx`                                            | 시설 상세 모달의 사진 칸                                         |
| `e2e/support/mockBackend.ts`                                                               | 새 테이블·API·저장소·Turnstile 대역                              |
| `e2e/facility-request.spec.ts`, `e2e/admin-inbox.spec.ts`, `e2e/facility-photos.spec.ts`   | 새 E2E                                                           |

---

# Part 1 — PR 1: 마이그레이션

### Task 1: 마이그레이션과 생성 타입

**Files:**

- Create: `supabase/migrations/20261008000000_create_facility_requests.sql`
- Modify: `supabase/database.types.ts` (`Tables`와 `Functions`)

**Interfaces:**

- Produces: 테이블 `facility_requests`·`facility_request_photos`·`facility_photos`, 함수 `create_facility_request(p_fields jsonb, p_client_hash text) returns text`, `add_facility_request_photo(p_request_id uuid, p_storage_path text) returns text`, `approve_facility_request(p_request_id uuid, p_facility_id uuid, p_fields jsonb, p_photos jsonb) returns text`, 버킷 둘. 생성 타입의 `Functions` 이름과 인자 이름이 이 SQL과 같아야 `supabaseAdmin().rpc(...)`가 컴파일된다.

- [ ] **Step 1: 운영 스키마의 id 타입 확인 (운영자에게 요청)**

`buildings`·`building_facilities`는 마이그레이션 이전에 만들어져 저장소에 정의가 없다(설계 2.2, 10장). 운영자에게 Supabase 대시보드 SQL 편집기에서 아래 **읽기 전용** 쿼리를 돌려 결과를 받는다.

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('buildings', 'id'),
    ('building_facilities', 'id'),
    ('building_facilities', 'building_id'),
    ('building_facilities', 'facility_code')
  );
```

기대: `buildings.id`는 `bigint` 또는 `integer`, `building_facilities.id`는 `uuid`. `building_facilities.id`가 `uuid`가 아니면 멈추고 보고한다 — 아래 SQL의 `uuid` 외래 키가 맞지 않는다. `buildings.id`가 `integer`여도 `bigint` 외래 키는 동작한다(정수 타입끼리 비교 연산자가 있다).

- [ ] **Step 2: 마이그레이션 작성**

`supabase/migrations/20261008000000_create_facility_requests.sql`:

```sql
-- 시설 등록 요청·요청 사진·시설 사진, 확인과 쓰기를 묶는 함수, 사진 버킷.
-- docs/specs/2026-10-08-facility-request-design.md 2장

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

create index facility_requests_status_created_idx
  on public.facility_requests (status, created_at desc);
create index facility_requests_client_hash_created_idx
  on public.facility_requests (client_hash, created_at);
create index facility_requests_building_idx
  on public.facility_requests (building_id);

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

alter table public.facility_requests enable row level security;
alter table public.facility_request_photos enable row level security;
alter table public.facility_photos enable row level security;

-- 요청 두 테이블은 서버 API(서비스 키)만 다룬다. Supabase 기본 권한이 anon에도
-- grant를 주므로 명시적으로 회수한다.
revoke all on table public.facility_requests from anon, authenticated;
revoke all on table public.facility_request_photos from anon, authenticated;
revoke all on table public.facility_photos from anon, authenticated;

grant select on table public.facility_photos to anon, authenticated;
create policy facility_photos_public_read
  on public.facility_photos for select
  to anon, authenticated
  using (true);

create function public.create_facility_request(p_fields jsonb, p_client_hash text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- 같은 해시의 동시 요청이 둘 다 9건을 보고 통과하지 않게 세기 전에 잠근다.
  perform pg_advisory_xact_lock(hashtext(p_client_hash));
  if (
    select count(*)
    from public.facility_requests
    where client_hash = p_client_hash
      and created_at > now() - interval '1 hour'
  ) >= 10 then
    return 'rate_limited';
  end if;

  insert into public.facility_requests (
    building_id, facility_code, name, description, floor_info, lat, lng, client_hash
  ) values (
    (p_fields->>'building_id')::bigint,
    p_fields->>'facility_code',
    nullif(p_fields->>'name', ''),
    nullif(p_fields->>'description', ''),
    nullif(p_fields->>'floor_info', ''),
    (p_fields->>'lat')::double precision,
    (p_fields->>'lng')::double precision,
    p_client_hash
  )
  returning id into v_id;

  return v_id::text;
end;
$$;

create function public.add_facility_request_photo(p_request_id uuid, p_storage_path text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_slot integer;
  v_id uuid;
begin
  -- approve_facility_request와 같은 행을 잠가 승인·거절과 차례로만 실행된다(설계 3.5).
  select status into v_status
  from public.facility_requests
  where id = p_request_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_status <> 'new' then
    return 'not_new';
  end if;

  select slot into v_slot
  from generate_series(0, 2) as slot
  where not exists (
    select 1
    from public.facility_request_photos photo
    where photo.request_id = p_request_id
      and photo.sort_order = slot
  )
  order by slot
  limit 1;

  if v_slot is null then
    return 'full';
  end if;

  insert into public.facility_request_photos (request_id, storage_path, sort_order)
  values (p_request_id, p_storage_path, v_slot)
  returning id into v_id;

  return v_id::text;
end;
$$;

create function public.approve_facility_request(
  p_request_id uuid,
  p_facility_id uuid,
  p_fields jsonb,
  p_photos jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.facility_requests%rowtype;
begin
  select * into v_request
  from public.facility_requests
  where id = p_request_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_request.status not in ('new', 'reviewing') then
    return 'already_processed';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_photos) as photo
    where not exists (
      select 1
      from public.facility_request_photos request_photo
      where request_photo.id = (photo->>'request_photo_id')::uuid
        and request_photo.request_id = p_request_id
    )
  ) then
    return 'photo_mismatch';
  end if;

  insert into public.building_facilities (
    id, building_id, facility_code, name, description, floor_info,
    is_installed, lat, lng, translation_status
  ) values (
    p_facility_id,
    v_request.building_id,
    p_fields->>'facility_code',
    nullif(p_fields->>'name', ''),
    nullif(p_fields->>'description', ''),
    nullif(p_fields->>'floor_info', ''),
    coalesce((p_fields->>'is_installed')::boolean, true),
    (p_fields->>'lat')::double precision,
    (p_fields->>'lng')::double precision,
    'pending'
  );

  insert into public.facility_photos (facility_id, storage_path, sort_order)
  select
    p_facility_id,
    photo->>'storage_path',
    (photo->>'sort_order')::smallint
  from jsonb_array_elements(p_photos) as photo;

  update public.facility_requests
  set status = 'approved',
      facility_id = p_facility_id,
      reviewed_at = now()
  where id = p_request_id;

  return 'approved';
end;
$$;

-- public 스키마 함수는 PostgREST가 /rest/v1/rpc로 노출한다. 서버 API만 부르게 한다(설계 2.5).
revoke all on function public.create_facility_request(jsonb, text) from public, anon, authenticated;
revoke all on function public.add_facility_request_photo(uuid, text) from public, anon, authenticated;
revoke all on function public.approve_facility_request(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_facility_request(jsonb, text) to service_role;
grant execute on function public.add_facility_request_photo(uuid, text) to service_role;
grant execute on function public.approve_facility_request(uuid, uuid, jsonb, jsonb) to service_role;

-- 크기·형식 상한을 버킷에도 걸어 서버 검사가 빠져도 저장소가 거른다(설계 2.4).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('facility-request-photos', 'facility-request-photos', false, 4194304, array['image/webp']),
  ('facility-photos', 'facility-photos', true, 4194304, array['image/webp'])
on conflict (id) do nothing;
```

- [ ] **Step 3: 생성 타입 추가**

`supabase/database.types.ts`의 `public.Tables`에 알파벳 순서 자리(`facility_types` 앞뒤)로 세 테이블을, `Functions`에 세 함수를 넣는다. 형식은 기존 `building_photos`·`get_admin_building_summary`를 따른다.

```ts
      facility_photos: {
        Row: {
          created_at: string;
          facility_id: string;
          id: string;
          sort_order: number;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          facility_id: string;
          id?: string;
          sort_order: number;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          facility_id?: string;
          id?: string;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "facility_photos_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "building_facilities";
            referencedColumns: ["id"];
          },
        ];
      };
      facility_request_photos: {
        Row: {
          id: string;
          request_id: string;
          sort_order: number;
          storage_path: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          sort_order: number;
          storage_path: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "facility_request_photos_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "facility_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      facility_requests: {
        Row: {
          building_id: number;
          client_hash: string;
          created_at: string;
          description: string | null;
          facility_code: string;
          facility_id: string | null;
          floor_info: string | null;
          id: string;
          lat: number | null;
          lng: number | null;
          name: string | null;
          reviewed_at: string | null;
          status: string;
        };
        Insert: {
          building_id: number;
          client_hash: string;
          created_at?: string;
          description?: string | null;
          facility_code: string;
          facility_id?: string | null;
          floor_info?: string | null;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          name?: string | null;
          reviewed_at?: string | null;
          status?: string;
        };
        Update: {
          building_id?: number;
          client_hash?: string;
          created_at?: string;
          description?: string | null;
          facility_code?: string;
          facility_id?: string | null;
          floor_info?: string | null;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          name?: string | null;
          reviewed_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "facility_requests_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "facility_requests_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "building_facilities";
            referencedColumns: ["id"];
          },
        ];
      };
```

`Functions`:

```ts
add_facility_request_photo: {
  Args: {
    p_request_id: string;
    p_storage_path: string;
  }
  Returns: string;
}
approve_facility_request: {
  Args: {
    p_facility_id: string;
    p_fields: Json;
    p_photos: Json;
    p_request_id: string;
  }
  Returns: string;
}
create_facility_request: {
  Args: {
    p_client_hash: string;
    p_fields: Json;
  }
  Returns: string;
}
```

- [ ] **Step 4: 검사**

Run: `npm run typecheck && npm run lint && npx prettier --check --end-of-line auto supabase/database.types.ts`
Expected: 오류 없음. 마이그레이션 파일 이름이 `scripts/check-migrations.sh`의 규칙(`^[0-9]{14}_[a-z0-9_]+\.sql$`)에 맞는지 눈으로 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/20261008000000_create_facility_requests.sql supabase/database.types.ts
git commit -m "feat(db): 시설 등록 요청·요청 사진·시설 사진 테이블과 함수, 사진 버킷을 만든다"
```

### Task 2: PR 1 병합·적용·운영 확인

**Files:** 없음(운영 작업). 결과를 PR 2의 설명에 적는다.

- [ ] **Step 1: PR 1 생성** — 브랜치 `feat/facility-requests`를 push하고 PR을 만든다. 본문에 이 계획의 Task 2 Step 3 확인 절차를 적는다. 병합은 운영자가 한다.

- [ ] **Step 2: 적용 확인** — 병합 뒤 GitHub Actions의 `Apply Supabase migrations`·`Verify migration history` 잡이 성공했는지 본다(`gh run list --branch main --limit 3`, `gh run view <id>`). 버킷 insert가 권한 오류로 실패하면 멈추고 운영자에게 알린다. 대응은 대시보드에서 버킷을 같은 설정으로 만들고, 그 마이그레이션 실패를 고치는 새 마이그레이션(버킷 insert 제외)을 추가한 뒤 `docs/database-migrations.md`에 버킷 수동 생성 절차를 적는 것이다.

- [ ] **Step 3: 운영 확인 (운영자가 SQL 편집기에서 실행)** — 설계 8.4. 아래를 한 트랜잭션으로 돌리고 마지막에 `rollback`해 시험 데이터를 남기지 않는다.

```sql
begin;

-- create_facility_request: 11번째는 rate_limited
select public.create_facility_request(
  jsonb_build_object('building_id', (select id from public.buildings limit 1), 'facility_code', (select code from public.facility_types limit 1)),
  'plan-check-hash'
) from generate_series(1, 11);

-- add_facility_request_photo: 넷째 장 full
with r as (select id from public.facility_requests where client_hash = 'plan-check-hash' limit 1)
select public.add_facility_request_photo((select id from r), 'x/' || n || '.webp') from generate_series(1, 4) as n;

-- approve: 성공 → 두 번째 already_processed
with r as (select id from public.facility_requests where client_hash = 'plan-check-hash' limit 1)
select public.approve_facility_request(
  (select id from r), gen_random_uuid(),
  jsonb_build_object('facility_code', (select code from public.facility_types limit 1)),
  '[]'::jsonb
);
with r as (select id from public.facility_requests where client_hash = 'plan-check-hash' and status = 'approved' limit 1)
select public.approve_facility_request((select id from r), gen_random_uuid(), '{}'::jsonb, '[]'::jsonb);

rollback;
```

기대: 첫 select의 11번째 행이 `rate_limited`, 둘째 select의 넷째 행이 `full`, 셋째 `approved`, 넷째 `already_processed`.

동시 실행 잠금(`pg_advisory_xact_lock`, `for update`)은 SQL 편집기 한 세션으로는 확인할 수 없다. 함수 정의를 다시 읽는 것으로 대신하고 그 사실을 PR 2 설명에 적는다.

- [ ] **Step 4: anon 호출 거부 확인** — 로컬에서:

```bash
set -a && . ./.env.local && set +a
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/approve_facility_request" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_request_id":"00000000-0000-0000-0000-000000000000","p_facility_id":"00000000-0000-0000-0000-000000000000","p_fields":{},"p_photos":[]}'
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/facility_requests?select=id&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/building_facilities?select=id,facility_photos(id,storage_path,sort_order)&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

기대: 첫째 `401` 또는 `404`(권한 없음), 둘째 권한 오류 JSON(빈 배열 `[]`가 아님), 셋째 시설 행에 `facility_photos: []`가 붙어 나온다(공개 사이드패널의 embed가 anon 권한에서 동작한다, 설계 10장). 아니면 멈추고 보고한다.

- [ ] **Step 5: 운영자 — Vercel 환경 변수 등록** (설계 3.6): Turnstile 위젯을 만들어(도메인: 운영 도메인과 Vercel 프리뷰 도메인) 사이트 키·비밀 키를 받고, `FACILITY_REQUEST_HASH_SECRET`은 `openssl rand -hex 32`로 만든다. 셋을 Vercel Production·Preview에 등록한다. 등록 전에 PR 2가 배포돼도 사이트 키가 없으면 요청 버튼이 숨으므로 깨진 화면은 없다.

---

# Part 2 — PR 2: 기능

PR 1이 병합된 `main`에서 시작한다.

```bash
git fetch origin && git checkout -b feat/facility-requests-app origin/main
```

### Task 3: 공용 상수·필드 파서·도메인 타입

**Files:**

- Create: `src/lib/facilityPhotos.ts`, `src/lib/facilityFields.ts`, `src/lib/facilityFields.test.ts`
- Modify: `src/types/domain.ts`

**Interfaces:**

- Produces:
  - `FACILITY_PHOTO_BUCKET = "facility-photos"`, `FACILITY_REQUEST_PHOTO_BUCKET = "facility-request-photos"`, `MAX_FACILITY_PHOTO_BYTES`, `MAX_FACILITY_PHOTOS`, `PHOTO_CACHE_CONTROL = "31536000"`, `photoObjectPath(folderId: string, random: string): string`
  - `interface FacilityFieldValues { facility_code: string; name: string; description: string; floor_info: string; is_installed: boolean; lat: string; lng: string }`, `EMPTY_FACILITY_FIELDS`, `FACILITY_FIELD_LIMITS = { name: 100, description: 1000, floor_info: 100 }`
  - `interface ParsedFacilityFields { facility_code: string; name: string | null; description: string | null; floor_info: string | null; is_installed: boolean; lat: number | null; lng: number | null }`, `parseFacilityFields(input: unknown): ParsedFacilityFields | null`
  - `FacilityPhoto` 타입, `FacilityWithType.facility_photos?`

- [ ] **Step 1: 실패하는 테스트**

`src/lib/facilityFields.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseFacilityFields } from "./facilityFields";

const base = { facility_code: "elevator" };

describe("parseFacilityFields", () => {
  it("빈 문자열은 null로, 앞뒤 공백은 지운다", () => {
    expect(
      parseFacilityFields({
        ...base,
        name: "  후문 엘리베이터 ",
        description: "",
        floor_info: " ",
      }),
    ).toEqual({
      facility_code: "elevator",
      name: "후문 엘리베이터",
      description: null,
      floor_info: null,
      is_installed: true,
      lat: null,
      lng: null,
    });
  });

  it("유형이 없으면 거부한다", () => {
    expect(parseFacilityFields({ name: "x" })).toBeNull();
    expect(parseFacilityFields({ facility_code: "  " })).toBeNull();
  });

  it("글자 수 상한을 넘으면 거부한다", () => {
    expect(parseFacilityFields({ ...base, name: "가".repeat(101) })).toBeNull();
    expect(
      parseFacilityFields({ ...base, description: "가".repeat(1001) }),
    ).toBeNull();
    expect(
      parseFacilityFields({ ...base, floor_info: "가".repeat(101) }),
    ).toBeNull();
    expect(
      parseFacilityFields({ ...base, name: "가".repeat(100) }),
    ).not.toBeNull();
  });

  it("좌표는 둘 다 있거나 둘 다 없어야 하고 범위 안이어야 한다", () => {
    expect(
      parseFacilityFields({ ...base, lat: 37.5, lng: 127.03 }),
    ).toMatchObject({ lat: 37.5, lng: 127.03 });
    expect(
      parseFacilityFields({ ...base, lat: "37.5", lng: "127.03" }),
    ).toMatchObject({ lat: 37.5, lng: 127.03 });
    expect(parseFacilityFields({ ...base, lat: 37.5 })).toBeNull();
    expect(parseFacilityFields({ ...base, lat: 91, lng: 0 })).toBeNull();
    expect(parseFacilityFields({ ...base, lat: 0, lng: 181 })).toBeNull();
    expect(parseFacilityFields({ ...base, lat: "abc", lng: "1" })).toBeNull();
  });

  it("설치 상태는 불리언만 받고 없으면 설치로 둔다", () => {
    expect(parseFacilityFields({ ...base, is_installed: false })).toMatchObject(
      { is_installed: false },
    );
    expect(parseFacilityFields({ ...base, is_installed: "false" })).toBeNull();
  });

  it("객체가 아니면 거부한다", () => {
    expect(parseFacilityFields(null)).toBeNull();
    expect(parseFacilityFields("elevator")).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/lib/facilityFields.test.ts` / Expected: FAIL(모듈 없음).

- [ ] **Step 3: 구현**

`src/lib/facilityPhotos.ts`:

```ts
export const FACILITY_PHOTO_BUCKET = "facility-photos";
export const FACILITY_REQUEST_PHOTO_BUCKET = "facility-request-photos";

/** 두 버킷의 file_size_limit과 같아야 한다(마이그레이션 20261008000000_create_facility_requests). */
export const MAX_FACILITY_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_FACILITY_PHOTOS = 3;
export const PHOTO_CACHE_CONTROL = "31536000";

/** 한 요청·시설의 파일은 그 id 폴더에만 둔다 — 정리와 실패 되돌리기가 폴더 단위다(설계 2.4). */
export function photoObjectPath(folderId: string, random: string): string {
  return `${folderId}/${random}.webp`;
}
```

`src/lib/facilityFields.ts`:

```ts
export interface FacilityFieldValues {
  facility_code: string;
  name: string;
  description: string;
  floor_info: string;
  is_installed: boolean;
  lat: string;
  lng: string;
}

export const EMPTY_FACILITY_FIELDS: FacilityFieldValues = {
  facility_code: "",
  name: "",
  description: "",
  floor_info: "",
  is_installed: true,
  lat: "",
  lng: "",
};

/** facility_requests의 check 제약과 같다. */
export const FACILITY_FIELD_LIMITS = {
  name: 100,
  description: 1000,
  floor_info: 100,
} as const;

export interface ParsedFacilityFields {
  facility_code: string;
  name: string | null;
  description: string | null;
  floor_info: string | null;
  is_installed: boolean;
  lat: number | null;
  lng: number | null;
}

function optionalText(
  value: unknown,
  limit: number,
): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > limit) return undefined;
  return trimmed === "" ? null : trimmed;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed)
    ? parsed
    : undefined;
}

/** 서버 검증. 클라이언트의 validateFacilityForm은 유형·좌표만 보므로 대신 쓰지 않는다(설계 3.2). */
export function parseFacilityFields(
  input: unknown,
): ParsedFacilityFields | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;

  const code =
    typeof value.facility_code === "string" ? value.facility_code.trim() : "";
  if (!code) return null;

  const name = optionalText(value.name, FACILITY_FIELD_LIMITS.name);
  const description = optionalText(
    value.description,
    FACILITY_FIELD_LIMITS.description,
  );
  const floor = optionalText(
    value.floor_info,
    FACILITY_FIELD_LIMITS.floor_info,
  );
  if (name === undefined || description === undefined || floor === undefined)
    return null;

  if (
    value.is_installed !== undefined &&
    typeof value.is_installed !== "boolean"
  )
    return null;

  const lat = optionalNumber(value.lat);
  const lng = optionalNumber(value.lng);
  if (lat === undefined || lng === undefined) return null;
  if ((lat === null) !== (lng === null)) return null;
  if (lat !== null && (lat < -90 || lat > 90)) return null;
  if (lng !== null && (lng < -180 || lng > 180)) return null;

  return {
    facility_code: code,
    name,
    description,
    floor_info: floor,
    is_installed: value.is_installed ?? true,
    lat,
    lng,
  };
}
```

`src/types/domain.ts` — `FacilityType` 아래에 추가하고 `FacilityWithType`를 넓힌다:

```ts
export type FacilityPhoto = Tables["facility_photos"]["Row"];

export type FacilityWithType = Facility & {
  facility_types: Partial<
    Pick<FacilityType, "code" | "label" | "label_en" | "label_zh">
  > | null;
  /** 조회가 facility_photos를 embed한 경우에만 있다 */
  facility_photos?: Pick<FacilityPhoto, "id" | "storage_path" | "sort_order">[];
};
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/lib/facilityFields.test.ts && npm run typecheck` / Expected: PASS, 타입 오류 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/facilityPhotos.ts src/lib/facilityFields.ts src/lib/facilityFields.test.ts src/types/domain.ts
git commit -m "feat(facility): 시설 사진 상수와 서버 필드 파서를 둔다"
```

### Task 4: 서버 보안 헬퍼 — 업로드 토큰·IP 해시·Turnstile

**Files:**

- Create: `src/lib/server/requestSecurity.ts`, `src/lib/server/requestSecurity.test.ts`, `src/lib/server/turnstile.ts`, `src/lib/server/turnstile.test.ts`

**Interfaces:**

- Produces:
  - `UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000`
  - `signUploadToken(requestId: string, expiresAt: number, secret: string): string`
  - `verifyUploadToken(token: string, requestId: string, now: number, secret: string): boolean`
  - `clientIp(request: Request): string | null`
  - `clientHash(ip: string, secret: string): string`
  - `verifyTurnstile(token: string, ip: string | null, secret: string, fetchImpl?: typeof fetch): Promise<boolean>`

- [ ] **Step 1: 실패하는 테스트**

`src/lib/server/requestSecurity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clientHash,
  clientIp,
  signUploadToken,
  verifyUploadToken,
} from "./requestSecurity";

const ID = "5b0c1d2e-0000-4000-8000-000000000001";
const OTHER = "5b0c1d2e-0000-4000-8000-000000000002";

describe("업로드 토큰", () => {
  it("같은 요청·만료 전이면 통과한다", () => {
    const token = signUploadToken(ID, 2_000, "s1");
    expect(verifyUploadToken(token, ID, 1_999, "s1")).toBe(true);
  });

  it("만료 시각이 지나면 거부한다", () => {
    const token = signUploadToken(ID, 2_000, "s1");
    expect(verifyUploadToken(token, ID, 2_001, "s1")).toBe(false);
  });

  it("다른 요청 id로는 쓸 수 없다", () => {
    const token = signUploadToken(ID, 2_000, "s1");
    expect(verifyUploadToken(token, OTHER, 1_000, "s1")).toBe(false);
  });

  it("다른 비밀값으로 서명했거나 만료를 고치면 거부한다", () => {
    expect(
      verifyUploadToken(signUploadToken(ID, 2_000, "s2"), ID, 1_000, "s1"),
    ).toBe(false);
    const [id, , signature] = signUploadToken(ID, 2_000, "s1").split(".");
    expect(
      verifyUploadToken(`${id}.9999999999999.${signature}`, ID, 1_000, "s1"),
    ).toBe(false);
  });

  it("형식이 깨진 토큰은 거부한다", () => {
    expect(verifyUploadToken("", ID, 0, "s1")).toBe(false);
    expect(verifyUploadToken("a.b", ID, 0, "s1")).toBe(false);
    expect(verifyUploadToken(`${ID}.abc.def`, ID, 0, "s1")).toBe(false);
  });
});

describe("clientIp", () => {
  it("x-real-ip를 먼저, 없으면 x-forwarded-for의 첫 값을 쓴다", () => {
    expect(
      clientIp(
        new Request("https://t.test", {
          headers: { "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" },
        }),
      ),
    ).toBe("1.1.1.1");
    expect(
      clientIp(
        new Request("https://t.test", {
          headers: { "x-forwarded-for": "2.2.2.2, 3.3.3.3" },
        }),
      ),
    ).toBe("2.2.2.2");
    expect(clientIp(new Request("https://t.test"))).toBeNull();
  });
});

describe("clientHash", () => {
  it("IP 원문을 담지 않고, 같은 입력이면 같은 값이다", () => {
    const hash = clientHash("1.1.1.1", "s1");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("1.1.1.1");
    expect(clientHash("1.1.1.1", "s1")).toBe(hash);
    expect(clientHash("1.1.1.1", "s2")).not.toBe(hash);
  });
});
```

`src/lib/server/turnstile.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

function fakeFetch(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof fetch;
}

describe("verifyTurnstile", () => {
  it("success가 true일 때만 통과한다", async () => {
    const ok = fakeFetch(Response.json({ success: true }));
    expect(await verifyTurnstile("tok", "1.1.1.1", "secret", ok)).toBe(true);
    const call = (ok as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0];
    const body = call[1].body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.1.1.1");

    expect(
      await verifyTurnstile(
        "tok",
        null,
        "s",
        fakeFetch(Response.json({ success: false })),
      ),
    ).toBe(false);
  });

  it("빈 토큰·네트워크 오류·비정상 응답은 거부한다(닫힌 쪽으로 실패)", async () => {
    expect(
      await verifyTurnstile(
        "",
        null,
        "s",
        fakeFetch(Response.json({ success: true })),
      ),
    ).toBe(false);
    expect(
      await verifyTurnstile("t", null, "s", fakeFetch(new Error("down"))),
    ).toBe(false);
    expect(
      await verifyTurnstile(
        "t",
        null,
        "s",
        fakeFetch(new Response("x", { status: 500 })),
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/lib/server` / Expected: FAIL(모듈 없음).

- [ ] **Step 3: 구현**

`src/lib/server/requestSecurity.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

function sign(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** Turnstile 토큰은 한 번만 검증되므로 사진마다 봇 검사를 다시 하지 않으려고 둔다(설계 3.3). */
export function signUploadToken(
  requestId: string,
  expiresAt: number,
  secret: string,
): string {
  const payload = `${requestId}.${expiresAt}`;
  return `${payload}.${sign(secret, `upload:${payload}`)}`;
}

export function verifyUploadToken(
  token: string,
  requestId: string,
  now: number,
  secret: string,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [id, expires, signature] = parts;
  if (id !== requestId) return false;
  const expiresAt = Number(expires);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < now) return false;
  const expected = Buffer.from(sign(secret, `upload:${id}.${expires}`));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Vercel이 x-real-ip와 x-forwarded-for를 채운다. */
export function clientIp(request: Request): string | null {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || null;
}

/** IP 원문은 저장하지 않는다(설계 3.4). */
export function clientHash(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`client:${ip}`).digest("hex");
}
```

`src/lib/server/turnstile.ts`:

```ts
const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string,
  ip: string | null,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetchImpl(SITEVERIFY_URL, { method: "POST", body });
    if (!response.ok) return false;
    const data = (await response.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/lib/server` / Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/server/requestSecurity.ts src/lib/server/requestSecurity.test.ts src/lib/server/turnstile.ts src/lib/server/turnstile.test.ts
git commit -m "feat(facility-request): 업로드 토큰·IP 해시·Turnstile 검증을 둔다"
```

### Task 5: 서버 저장소 헬퍼와 쿼리 대역

**Files:**

- Create: `src/lib/server/supabaseAdmin.ts`, `src/lib/server/requestPhotoStorage.ts`, `src/lib/server/requestPhotoStorage.test.ts`, `src/test/queryStub.ts`

**Interfaces:**

- Consumes: Task 3의 버킷 상수·`photoObjectPath`.
- Produces:
  - `supabaseAdmin(): SupabaseClient<Database>`
  - `uploadPhoto(bucket: string, folderId: string, bytes: Uint8Array): Promise<string | null>` — 경로 또는 null
  - `removeObject(bucket: string, path: string): Promise<boolean>`
  - `removeFolder(bucket: string, folderId: string): Promise<boolean>`
  - `copyToFacility(requestPhotoPath: string, facilityId: string): Promise<string | null>`
  - `cleanupRequestPhotos(requestId: string): Promise<boolean>`
  - `signedUrls(paths: string[]): Promise<Map<string, string>>` — 비공개 버킷, 600초
  - `queryStub<T>(result: T): QueryStub<T>` — 아무 메서드나 체인하고 await하면 `result`. `.calls`로 호출 기록.

- [ ] **Step 1: 쿼리 대역**

`src/test/queryStub.ts`:

```ts
export interface QueryCall {
  method: string;
  args: unknown[];
}

export type QueryStub<T> = PromiseLike<T> & {
  calls: QueryCall[];
  [method: string]: unknown;
};

/** supabase-js 쿼리 빌더 대역. 체인 메서드를 기록하고 await하면 result를 준다. */
export function queryStub<T>(result: T): QueryStub<T> {
  const calls: QueryCall[] = [];
  const proxy: QueryStub<T> = new Proxy({} as QueryStub<T>, {
    get(_target, property) {
      if (property === "then") {
        return (
          resolve: (value: T) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject);
      }
      if (property === "calls") return calls;
      return (...args: unknown[]) => {
        calls.push({ method: String(property), args });
        return proxy;
      };
    },
  });
  return proxy;
}
```

- [ ] **Step 2: 실패하는 테스트**

`src/lib/server/requestPhotoStorage.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const storageCalls: string[] = [];
const bucket = {
  list: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  copy: vi.fn(),
  createSignedUrls: vi.fn(),
};
let deleteResult = { error: null as unknown };
const from = vi.fn(() => queryStub(deleteResult));

vi.mock("./supabaseAdmin", () => ({
  supabaseAdmin: () => ({
    storage: {
      from: (name: string) => {
        storageCalls.push(name);
        return bucket;
      },
    },
    from,
  }),
}));

describe("requestPhotoStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageCalls.length = 0;
    deleteResult = { error: null };
    bucket.list.mockResolvedValue({
      data: [{ name: "a.webp" }, { name: "b.webp" }],
      error: null,
    });
    bucket.remove.mockResolvedValue({ data: [], error: null });
    bucket.upload.mockResolvedValue({ data: {}, error: null });
    bucket.copy.mockResolvedValue({ data: {}, error: null });
  });

  it("폴더 정리는 폴더 안 파일을 모두 지운다 — 행이 없는 파일도", async () => {
    const { removeFolder } = await import("./requestPhotoStorage");
    expect(await removeFolder("facility-request-photos", "r1")).toBe(true);
    expect(bucket.list).toHaveBeenCalledWith("r1", { limit: 100 });
    expect(bucket.remove).toHaveBeenCalledWith(["r1/a.webp", "r1/b.webp"]);
  });

  it("빈 폴더면 지울 것 없이 성공한다", async () => {
    bucket.list.mockResolvedValue({ data: [], error: null });
    const { removeFolder } = await import("./requestPhotoStorage");
    expect(await removeFolder("facility-photos", "f1")).toBe(true);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("요청 사진 정리는 파일을 먼저 지우고 성공해야 행을 지운다", async () => {
    const { cleanupRequestPhotos } = await import("./requestPhotoStorage");
    expect(await cleanupRequestPhotos("r1")).toBe(true);
    expect(storageCalls).toEqual(["facility-request-photos"]);
    expect(from).toHaveBeenCalledWith("facility_request_photos");

    vi.clearAllMocks();
    bucket.list.mockResolvedValue({ data: [{ name: "a.webp" }], error: null });
    bucket.remove.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await cleanupRequestPhotos("r1")).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("행 삭제가 실패하면 정리 실패다", async () => {
    deleteResult = { error: { message: "db" } };
    const { cleanupRequestPhotos } = await import("./requestPhotoStorage");
    expect(await cleanupRequestPhotos("r1")).toBe(false);
  });

  it("업로드는 id 폴더 아래 uuid 이름의 webp로, 1년 캐시로 올린다", async () => {
    const { uploadPhoto } = await import("./requestPhotoStorage");
    const path = await uploadPhoto(
      "facility-request-photos",
      "r1",
      new Uint8Array([1]),
    );
    expect(path).toMatch(/^r1\/[0-9a-f-]{36}\.webp$/);
    expect(bucket.upload).toHaveBeenCalledWith(path, expect.any(Uint8Array), {
      contentType: "image/webp",
      cacheControl: "31536000",
    });
  });

  it("복사는 공개 버킷의 시설 폴더로 간다", async () => {
    const { copyToFacility } = await import("./requestPhotoStorage");
    const destination = await copyToFacility("r1/a.webp", "f1");
    expect(destination).toMatch(/^f1\/[0-9a-f-]{36}\.webp$/);
    expect(bucket.copy).toHaveBeenCalledWith("r1/a.webp", destination, {
      destinationBucket: "facility-photos",
    });
    bucket.copy.mockResolvedValue({
      data: null,
      error: { message: "missing" },
    });
    expect(await copyToFacility("r1/a.webp", "f1")).toBeNull();
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run src/lib/server/requestPhotoStorage.test.ts` / Expected: FAIL(모듈 없음).

- [ ] **Step 4: 구현**

`src/lib/server/supabaseAdmin.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@supabase-types";

let client: SupabaseClient<Database> | null = null;

/** 서비스 키라 RLS를 우회한다. 서버 라우트에서만 import한다. */
export function supabaseAdmin(): SupabaseClient<Database> {
  client ??= createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return client;
}
```

`src/lib/server/requestPhotoStorage.ts`:

```ts
import { randomUUID } from "node:crypto";
import {
  FACILITY_PHOTO_BUCKET,
  FACILITY_REQUEST_PHOTO_BUCKET,
  PHOTO_CACHE_CONTROL,
  photoObjectPath,
} from "@/lib/facilityPhotos";
import { supabaseAdmin } from "./supabaseAdmin";

const SIGNED_URL_SECONDS = 600;

export async function uploadPhoto(
  bucket: string,
  folderId: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const path = photoObjectPath(folderId, randomUUID());
  const { error } = await supabaseAdmin()
    .storage.from(bucket)
    .upload(path, bytes, {
      contentType: "image/webp",
      cacheControl: PHOTO_CACHE_CONTROL,
    });
  if (error) {
    console.error("[photo-storage] upload failed", {
      bucket,
      message: error.message,
    });
    return null;
  }
  return path;
}

export async function removeObject(
  bucket: string,
  path: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin().storage.from(bucket).remove([path]);
  if (error)
    console.error("[photo-storage] remove failed", {
      bucket,
      message: error.message,
    });
  return !error;
}

/** 행이 생기기 전에 실패해 남은 파일까지 지우려고 행이 아니라 폴더를 나열한다(설계 2.7). */
export async function removeFolder(
  bucket: string,
  folderId: string,
): Promise<boolean> {
  const storage = supabaseAdmin().storage.from(bucket);
  const { data, error } = await storage.list(folderId, { limit: 100 });
  if (error) {
    console.error("[photo-storage] list failed", {
      bucket,
      message: error.message,
    });
    return false;
  }
  const paths = (data ?? []).map((item) => `${folderId}/${item.name}`);
  if (paths.length === 0) return true;
  const { error: removeError } = await storage.remove(paths);
  if (removeError) {
    console.error("[photo-storage] folder remove failed", {
      bucket,
      message: removeError.message,
    });
  }
  return !removeError;
}

export async function copyToFacility(
  requestPhotoPath: string,
  facilityId: string,
): Promise<string | null> {
  const destination = photoObjectPath(facilityId, randomUUID());
  const { error } = await supabaseAdmin()
    .storage.from(FACILITY_REQUEST_PHOTO_BUCKET)
    .copy(requestPhotoPath, destination, {
      destinationBucket: FACILITY_PHOTO_BUCKET,
    });
  if (error) {
    console.error("[photo-storage] copy failed", { message: error.message });
    return null;
  }
  return destination;
}

/** 파일을 먼저, 행을 나중에 지운다 — 끝 상태 요청에 행이 남으면 정리가 실패했다는 뜻이 된다(설계 2.7). */
export async function cleanupRequestPhotos(
  requestId: string,
): Promise<boolean> {
  if (!(await removeFolder(FACILITY_REQUEST_PHOTO_BUCKET, requestId)))
    return false;
  const { error } = await supabaseAdmin()
    .from("facility_request_photos")
    .delete()
    .eq("request_id", requestId);
  if (error)
    console.error("[photo-storage] request photo rows delete failed", {
      message: error.message,
    });
  return !error;
}

export async function signedUrls(
  paths: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;
  const { data, error } = await supabaseAdmin()
    .storage.from(FACILITY_REQUEST_PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) {
    console.error("[photo-storage] sign failed", { message: error.message });
    return result;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) result.set(item.path, item.signedUrl);
  }
  return result;
}
```

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run src/lib/server && npm run typecheck && npm run lint` / Expected: PASS. `createSignedUrls` 응답 항목의 필드 이름(`path`, `signedUrl`)이 타입 오류를 내면 `node_modules/@supabase/storage-js/dist/index.d.mts`의 반환 타입을 읽고 맞춘다.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/server/supabaseAdmin.ts src/lib/server/requestPhotoStorage.ts src/lib/server/requestPhotoStorage.test.ts src/test/queryStub.ts
git commit -m "feat(facility-request): 사진 저장소 헬퍼와 폴더 단위 정리를 둔다"
```

### Task 6: 요청 생성 라우트 — `POST /api/facility-requests`

**Files:**

- Create: `src/app/api/facility-requests/route.ts`, `src/app/api/facility-requests/route.test.ts`

**Interfaces:**

- Consumes: `parseFacilityFields`(Task 3), `verifyTurnstile`·`clientIp`·`clientHash`·`signUploadToken`·`UPLOAD_TOKEN_TTL_MS`(Task 4), `supabaseAdmin`(Task 5).
- Produces (요청 계약):
  - 요청 본문 `{ buildingId: number, fields: { facility_code, name?, description?, floor_info?, lat?, lng? }, turnstileToken: string, website?: string }`
  - 201 `{ id: string, uploadToken: string }` · honeypot이면 201 `{ ok: true }`(id 없음)
  - 오류 `{ error: "invalid" | "turnstile" | "rate_limited" | "unavailable" | "server" }` — 400/400/429/503/500. 413은 `{ error: "invalid" }`.
- Task 8에서 같은 파일에 `GET`을 더한다.

- [ ] **Step 1: 실패하는 테스트**

`src/app/api/facility-requests/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const verifyTurnstile = vi.fn();
vi.mock("@/lib/server/turnstile", () => ({ verifyTurnstile }));

let buildingRow: unknown = { id: 1 };
let typeRow: unknown = { code: "elevator" };
const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from, rpc }),
}));

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://local.test/api/facility-requests", {
    method: "POST",
    headers: { "x-real-ip": "1.2.3.4", ...headers },
    body: JSON.stringify(body),
  });
}

const valid = {
  buildingId: 1,
  fields: {
    facility_code: "elevator",
    floor_info: "3층",
    lat: 37.5,
    lng: 127.03,
  },
  turnstileToken: "tok",
  website: "",
};

describe("POST /api/facility-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TURNSTILE_SECRET_KEY", "ts");
    vi.stubEnv("FACILITY_REQUEST_HASH_SECRET", "hs");
    buildingRow = { id: 1 };
    typeRow = { code: "elevator" };
    // Task 8의 GET 테스트가 같은 대역의 구현을 바꾸므로 여기서 다시 정한다.
    from.mockImplementation((table: string) =>
      queryStub({
        data: table === "buildings" ? buildingRow : typeRow,
        error: null,
      }),
    );
    verifyTurnstile.mockResolvedValue(true);
    rpc.mockResolvedValue({
      data: "5b0c1d2e-0000-4000-8000-000000000001",
      error: null,
    });
  });

  it("검사를 통과하면 요청을 만들고 업로드 토큰을 준다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(valid));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe("5b0c1d2e-0000-4000-8000-000000000001");
    expect(body.uploadToken.split(".")[0]).toBe(body.id);
    expect(verifyTurnstile).toHaveBeenCalledWith("tok", "1.2.3.4", "ts");
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("create_facility_request");
    expect(args.p_fields).toMatchObject({
      building_id: 1,
      facility_code: "elevator",
      floor_info: "3층",
    });
    expect(args.p_client_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("honeypot이 채워지면 저장 없이 성공으로 답한다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ ...valid, website: "http://spam" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Turnstile 실패는 400 turnstile", async () => {
    verifyTurnstile.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(post(valid));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "turnstile" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["없는 건물", () => (buildingRow = null)],
    ["없는 유형", () => (typeRow = null)],
  ])("%s이면 400 invalid", async (_label, arrange) => {
    arrange();
    const { POST } = await import("./route");
    const response = await POST(post(valid));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("삭제되지 않은 건물만 찾는다 — is_deleted가 null인 건물도 살아 있다", async () => {
    const { POST } = await import("./route");
    await POST(post(valid));
    const buildingQuery = from.mock.results[0].value as {
      calls: { method: string; args: unknown[] }[];
    };
    expect(buildingQuery.calls).toContainEqual({
      method: "not",
      args: ["is_deleted", "is", true],
    });
  });

  it("필드·건물 id가 잘못되면 400 invalid", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ ...valid, buildingId: "1" }))).status).toBe(400);
    expect(
      (await POST(post({ ...valid, fields: { facility_code: "" } }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          post({ ...valid, fields: { facility_code: "elevator", lat: 37 } }),
        )
      ).status,
    ).toBe(400);
  });

  it("함수가 rate_limited면 429", async () => {
    rpc.mockResolvedValue({ data: "rate_limited", error: null });
    const { POST } = await import("./route");
    const response = await POST(post(valid));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
  });

  it("비밀값이 없으면 503 unavailable", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const { POST } = await import("./route");
    expect((await POST(post(valid))).status).toBe(503);
  });

  it("본문이 크면 413", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(valid, { "content-length": "20000" }));
    expect(response.status).toBe(413);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/app/api/facility-requests/route.test.ts` / Expected: FAIL(모듈 없음).

- [ ] **Step 3: 구현**

`src/app/api/facility-requests/route.ts`:

```ts
import { parseFacilityFields } from "@/lib/facilityFields";
import {
  UPLOAD_TOKEN_TTL_MS,
  clientHash,
  clientIp,
  signUploadToken,
} from "@/lib/server/requestSecurity";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { verifyTurnstile } from "@/lib/server/turnstile";

const MAX_BODY_BYTES = 10_000;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail("invalid", 413);
  }
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  // 채워진 honeypot은 저장 없이 성공으로 답한다(피드백 라우트와 같다).
  if (body && typeof body.website === "string" && body.website.length > 0) {
    return Response.json({ ok: true }, { status: 201 });
  }

  const hashSecret = process.env.FACILITY_REQUEST_HASH_SECRET;
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!hashSecret || !turnstileSecret) return fail("unavailable", 503);

  const ip = clientIp(request);
  const token =
    typeof body?.turnstileToken === "string" ? body.turnstileToken : "";
  if (!(await verifyTurnstile(token, ip, turnstileSecret)))
    return fail("turnstile", 400);

  const buildingId = body?.buildingId;
  const fields = parseFacilityFields(body?.fields);
  if (
    typeof buildingId !== "number" ||
    !Number.isSafeInteger(buildingId) ||
    buildingId <= 0 ||
    !fields
  ) {
    return fail("invalid", 400);
  }

  const db = supabaseAdmin();
  const [{ data: building }, { data: type }] = await Promise.all([
    // is_deleted가 null인 건물도 살아 있다 — eq(false)는 null을 빼 버린다.
    db
      .from("buildings")
      .select("id")
      .eq("id", buildingId)
      .not("is_deleted", "is", true)
      .maybeSingle(),
    db
      .from("facility_types")
      .select("code")
      .eq("code", fields.facility_code)
      .maybeSingle(),
  ]);
  if (!building || !type) return fail("invalid", 400);

  const { data: result, error } = await db.rpc("create_facility_request", {
    p_fields: {
      building_id: buildingId,
      facility_code: fields.facility_code,
      name: fields.name,
      description: fields.description,
      floor_info: fields.floor_info,
      lat: fields.lat,
      lng: fields.lng,
    },
    p_client_hash: clientHash(ip ?? "unknown", hashSecret),
  });
  if (error || !result) {
    console.error("[facility-requests] create failed", {
      code: error?.code,
      message: error?.message,
    });
    return fail("server", 500);
  }
  if (result === "rate_limited") return fail("rate_limited", 429);

  return Response.json(
    {
      id: result,
      uploadToken: signUploadToken(
        result,
        Date.now() + UPLOAD_TOKEN_TTL_MS,
        hashSecret,
      ),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/app/api/facility-requests/route.test.ts && npm run typecheck` / Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/facility-requests/route.ts src/app/api/facility-requests/route.test.ts
git commit -m "feat(facility-request): 봇 검사·빈도 제한을 거쳐 등록 요청을 만드는 공개 API를 둔다"
```

### Task 7: 요청 사진 업로드 라우트 — `POST /api/facility-requests/[id]/photos`

**Files:**

- Create: `src/app/api/facility-requests/[id]/photos/route.ts`, `src/app/api/facility-requests/[id]/photos/route.test.ts`

**Interfaces:**

- Consumes: `verifyUploadToken`(Task 4), `uploadPhoto`·`removeObject`(Task 5), `MAX_FACILITY_PHOTO_BYTES`·`FACILITY_REQUEST_PHOTO_BUCKET`(Task 3), `isWebP`·`WEBP_SNIFF_BYTES`(`src/lib/webpBytes.ts`).
- Produces: multipart `file`(WebP) + `token` → 201 `{ id }`. 오류 `{ error: "token" | "too_large" | "not_webp" | "not_new" | "full" | "not_found" | "invalid" | "server" | "unavailable" }` — 403/413/400/409/409/404/400/500/503.

- [ ] **Step 1: 실패하는 테스트**

`src/app/api/facility-requests/[id]/photos/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signUploadToken } from "@/lib/server/requestSecurity";

const uploadPhoto = vi.fn();
const removeObject = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({
  uploadPhoto,
  removeObject,
}));

const rpc = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ rpc }),
}));

const ID = "5b0c1d2e-0000-4000-8000-000000000001";

function webp(size = 26): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBPVP8 "), 8);
  return bytes;
}

function post(
  id: string,
  token: string,
  bytes: Uint8Array<ArrayBuffer> = webp(),
) {
  const form = new FormData();
  form.append("token", token);
  form.append("file", new Blob([bytes], { type: "image/webp" }), "p.webp");
  return [
    new Request(`https://local.test/api/facility-requests/${id}/photos`, {
      method: "POST",
      body: form,
    }),
    { params: Promise.resolve({ id }) },
  ] as const;
}

describe("POST /api/facility-requests/[id]/photos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FACILITY_REQUEST_HASH_SECRET", "hs");
    uploadPhoto.mockResolvedValue(`${ID}/x.webp`);
    removeObject.mockResolvedValue(true);
    rpc.mockResolvedValue({ data: "photo-1", error: null });
  });

  const token = () => signUploadToken(ID, Date.now() + 60_000, "hs");

  it("토큰이 맞으면 비공개 버킷 요청 폴더에 올리고 함수로 행을 만든다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...post(ID, token()));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "photo-1" });
    expect(uploadPhoto).toHaveBeenCalledWith(
      "facility-request-photos",
      ID,
      expect.any(Uint8Array),
    );
    expect(rpc).toHaveBeenCalledWith("add_facility_request_photo", {
      p_request_id: ID,
      p_storage_path: `${ID}/x.webp`,
    });
  });

  it("다른 요청의 토큰·만료된 토큰은 403이고 올리지 않는다", async () => {
    const { POST } = await import("./route");
    const other = signUploadToken(
      "5b0c1d2e-0000-4000-8000-000000000009",
      Date.now() + 60_000,
      "hs",
    );
    expect((await POST(...post(ID, other))).status).toBe(403);
    expect(
      (await POST(...post(ID, signUploadToken(ID, Date.now() - 1, "hs"))))
        .status,
    ).toBe(403);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("WebP가 아니면 400, 올리지 않는다", async () => {
    const { POST } = await import("./route");
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    const response = await POST(...post(ID, token(), png));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "not_webp" });
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("4MB를 넘으면 413", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      ...post(ID, token(), webp(4 * 1024 * 1024 + 1)),
    );
    expect(response.status).toBe(413);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it.each(["not_new", "full"])(
    "함수가 %s면 올린 파일을 지우고 409",
    async (code) => {
      rpc.mockResolvedValue({ data: code, error: null });
      const { POST } = await import("./route");
      const response = await POST(...post(ID, token()));
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: code });
      expect(removeObject).toHaveBeenCalledWith(
        "facility-request-photos",
        `${ID}/x.webp`,
      );
    },
  );

  it("함수가 실패하면 올린 파일을 지우고 500", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db" } });
    const { POST } = await import("./route");
    expect((await POST(...post(ID, token()))).status).toBe(500);
    expect(removeObject).toHaveBeenCalled();
  });

  it("uuid가 아닌 id는 404", async () => {
    const { POST } = await import("./route");
    expect((await POST(...post("abc", token()))).status).toBe(404);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run "src/app/api/facility-requests/[id]/photos/route.test.ts"` / Expected: FAIL.

- [ ] **Step 3: 구현**

`src/app/api/facility-requests/[id]/photos/route.ts`:

```ts
import {
  FACILITY_REQUEST_PHOTO_BUCKET,
  MAX_FACILITY_PHOTO_BYTES,
} from "@/lib/facilityPhotos";
import { removeObject, uploadPhoto } from "@/lib/server/requestPhotoStorage";
import { verifyUploadToken } from "@/lib/server/requestSecurity";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { WEBP_SNIFF_BYTES, isWebP } from "@/lib/webpBytes";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// multipart 경계·필드 이름이 파일 크기에 더해진다.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return fail("not_found", 404);
  const secret = process.env.FACILITY_REQUEST_HASH_SECRET;
  if (!secret) return fail("unavailable", 503);
  if (
    Number(request.headers.get("content-length") ?? 0) >
    MAX_FACILITY_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    return fail("too_large", 413);
  }

  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  if (
    typeof token !== "string" ||
    !verifyUploadToken(token, id, Date.now(), secret)
  ) {
    return fail("token", 403);
  }
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("invalid", 400);
  if (file.size > MAX_FACILITY_PHOTO_BYTES) return fail("too_large", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebP(bytes.subarray(0, WEBP_SNIFF_BYTES), bytes.length))
    return fail("not_webp", 400);

  const path = await uploadPhoto(FACILITY_REQUEST_PHOTO_BUCKET, id, bytes);
  if (!path) return fail("server", 500);

  // 상태 확인을 업로드 뒤 함수에서 한다 — 먼저 확인하면 승인·정리가 끝난 요청에 사진이 붙는다(설계 3.5).
  const { data: result, error } = await supabaseAdmin().rpc(
    "add_facility_request_photo",
    {
      p_request_id: id,
      p_storage_path: path,
    },
  );
  if (
    error ||
    !result ||
    result === "not_new" ||
    result === "full" ||
    result === "not_found"
  ) {
    // 이 삭제가 실패해도 파일은 요청 폴더 안이라 정리(설계 2.7) 때 지워진다.
    await removeObject(FACILITY_REQUEST_PHOTO_BUCKET, path);
    if (error || !result) {
      console.error("[facility-request-photos] add failed", {
        message: error?.message,
      });
      return fail("server", 500);
    }
    return fail(result, result === "not_found" ? 404 : 409);
  }
  return Response.json({ id: result }, { status: 201 });
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run "src/app/api/facility-requests/[id]/photos/route.test.ts" && npm run typecheck` / Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/api/facility-requests/[id]/photos"
git commit -m "feat(facility-request): 업로드 토큰으로 요청 사진을 한 장씩 받는 API를 둔다"
```

### Task 8: 제보함 상태 매핑과 관리자 조회 API

**Files:**

- Create: `src/lib/inboxStatus.ts`, `src/lib/inboxStatus.test.ts`, `src/app/api/facility-requests/[id]/route.ts`, `src/app/api/facility-requests/[id]/route.test.ts`, `src/app/api/inbox-counts/route.ts`, `src/app/api/inbox-counts/route.test.ts`
- Modify: `src/app/api/facility-requests/route.ts`(GET 추가), `src/app/api/facility-requests/route.test.ts`(GET 테스트 추가)

**Interfaces:**

- Produces:
  - `type InboxFilter = "open" | "new" | "reviewing" | "done" | "all"`, `INBOX_FILTERS: { value: InboxFilter; label: string }[]`, `parseInboxFilter(value: string | null): InboxFilter`
  - `type RequestStatus = "new" | "reviewing" | "approved" | "rejected"`, `type FeedbackStatus = "new" | "reviewing" | "resolved"`
  - `requestStatusesFor(filter): RequestStatus[] | null`, `feedbackStatusesFor(filter): FeedbackStatus[] | null` (null = 전부)
  - `REQUEST_STATUS_LABELS`, `FEEDBACK_STATUS_LABELS`, `isEndStatus(status: string): boolean`
  - `GET /api/facility-requests?status=<InboxFilter>&page=<n>&building=<id>` → `{ items: FacilityRequestListItem[], total: number }`
  - `interface FacilityRequestListItem { id: string; building_id: number; building_name: string | null; facility_code: string; name: string | null; floor_info: string | null; has_location: boolean; status: RequestStatus; created_at: string; facility_id: string | null; photo_count: number; thumbnail_url: string | null }` — `src/lib/inboxStatus.ts`에 둔다(화면과 라우트가 같이 쓴다).
  - `GET /api/facility-requests/[id]` → `FacilityRequestDetail` = 요청 행 전부(`client_hash` 제외) + `building: { id, name, geojson }` + `photos: { id: string; sort_order: number; url: string | null }[]`
  - `GET /api/inbox-counts` → `{ requests: number, feedback: number }` (둘 다 `new` 수)

- [ ] **Step 1: 실패하는 테스트 — 매핑**

`src/lib/inboxStatus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  feedbackStatusesFor,
  isEndStatus,
  parseInboxFilter,
  requestStatusesFor,
} from "./inboxStatus";

describe("inboxStatus", () => {
  it("기본 필터는 처리 전(신규 + 확인 중)이다", () => {
    expect(parseInboxFilter(null)).toBe("open");
    expect(parseInboxFilter("garbage")).toBe("open");
    expect(parseInboxFilter("done")).toBe("done");
  });

  it("처리 완료는 요청에선 승인·거절, 피드백에선 resolved다", () => {
    expect(requestStatusesFor("open")).toEqual(["new", "reviewing"]);
    expect(requestStatusesFor("done")).toEqual(["approved", "rejected"]);
    expect(requestStatusesFor("all")).toBeNull();
    expect(feedbackStatusesFor("open")).toEqual(["new", "reviewing"]);
    expect(feedbackStatusesFor("done")).toEqual(["resolved"]);
    expect(feedbackStatusesFor("reviewing")).toEqual(["reviewing"]);
  });

  it("끝 상태는 승인·거절뿐이다", () => {
    expect(isEndStatus("approved")).toBe(true);
    expect(isEndStatus("rejected")).toBe(true);
    expect(isEndStatus("reviewing")).toBe(false);
  });
});
```

- [ ] **Step 2: 매핑 구현** — `src/lib/inboxStatus.ts`:

```ts
export type InboxFilter = "open" | "new" | "reviewing" | "done" | "all";
export type RequestStatus = "new" | "reviewing" | "approved" | "rejected";
export type FeedbackStatus = "new" | "reviewing" | "resolved";

export const INBOX_FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "open", label: "처리 전(신규·확인 중)" },
  { value: "new", label: "신규" },
  { value: "reviewing", label: "확인 중" },
  { value: "done", label: "처리 완료" },
  { value: "all", label: "전체" },
];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: "신규",
  reviewing: "확인 중",
  approved: "승인됨",
  rejected: "거절됨",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "신규",
  reviewing: "확인 중",
  resolved: "처리 완료",
};

export function parseInboxFilter(value: string | null): InboxFilter {
  return INBOX_FILTERS.some((filter) => filter.value === value)
    ? (value as InboxFilter)
    : "open";
}

export function requestStatusesFor(
  filter: InboxFilter,
): RequestStatus[] | null {
  if (filter === "all") return null;
  if (filter === "open") return ["new", "reviewing"];
  if (filter === "done") return ["approved", "rejected"];
  return [filter];
}

export function feedbackStatusesFor(
  filter: InboxFilter,
): FeedbackStatus[] | null {
  if (filter === "all") return null;
  if (filter === "open") return ["new", "reviewing"];
  if (filter === "done") return ["resolved"];
  return [filter];
}

export function isEndStatus(status: string): boolean {
  return status === "approved" || status === "rejected";
}

export interface FacilityRequestListItem {
  id: string;
  building_id: number;
  building_name: string | null;
  facility_code: string;
  name: string | null;
  floor_info: string | null;
  has_location: boolean;
  status: RequestStatus;
  created_at: string;
  facility_id: string | null;
  photo_count: number;
  thumbnail_url: string | null;
}

export interface FacilityRequestDetail {
  id: string;
  building_id: number;
  facility_code: string;
  name: string | null;
  description: string | null;
  floor_info: string | null;
  lat: number | null;
  lng: number | null;
  status: RequestStatus;
  created_at: string;
  reviewed_at: string | null;
  facility_id: string | null;
  building: { id: number; name: string | null; geojson: unknown } | null;
  photos: { id: string; sort_order: number; url: string | null }[];
}
```

Run: `npx vitest run src/lib/inboxStatus.test.ts` / Expected: PASS.

- [ ] **Step 3: 실패하는 테스트 — 목록·상세·개수**

`src/app/api/facility-requests/route.test.ts` 끝에 추가(파일 위쪽 `vi.mock` 블록에 아래 두 줄을 더한다):

```ts
const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const signedUrls = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({ signedUrls }));
```

```ts
describe("GET /api/facility-requests", () => {
  const rows = [
    {
      id: "r1",
      building_id: 1,
      facility_code: "elevator",
      name: null,
      floor_info: "3층",
      lat: 37.5,
      lng: 127.0,
      status: "new",
      created_at: "2026-10-08T00:00:00Z",
      facility_id: null,
      buildings: { name: "아산이학관" },
      facility_request_photos: [
        { id: "p2", storage_path: "r1/b.webp", sort_order: 1 },
        { id: "p1", storage_path: "r1/a.webp", sort_order: 0 },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    from.mockImplementation(() =>
      queryStub({ data: rows, error: null, count: 1 }),
    );
    signedUrls.mockResolvedValue(new Map([["r1/a.webp", "https://signed/a"]]));
  });

  it("관리자가 아니면 그 응답을 그대로 돌려준다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "인증 필요" }, { status: 401 }),
    });
    const { GET } = await import("./route");
    expect(
      (await GET(new Request("https://local.test/api/facility-requests")))
        .status,
    ).toBe(401);
  });

  it("기본 필터는 신규·확인 중, 첫 사진(순서 0)을 서명 주소로 준다", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://local.test/api/facility-requests"),
    );
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      id: "r1",
      building_name: "아산이학관",
      photo_count: 2,
      has_location: true,
      thumbnail_url: "https://signed/a",
    });
    const query = from.mock.results[0].value as {
      calls: { method: string; args: unknown[] }[];
    };
    expect(query.calls).toContainEqual({
      method: "in",
      args: ["status", ["new", "reviewing"]],
    });
    expect(signedUrls).toHaveBeenCalledWith(["r1/a.webp"]);
  });

  it("building 필터를 건다", async () => {
    const { GET } = await import("./route");
    await GET(
      new Request(
        "https://local.test/api/facility-requests?status=all&building=7",
      ),
    );
    const query = from.mock.results[0].value as {
      calls: { method: string; args: unknown[] }[];
    };
    expect(query.calls).toContainEqual({
      method: "eq",
      args: ["building_id", 7],
    });
    expect(query.calls.some((call) => call.method === "in")).toBe(false);
  });
});
```

`src/app/api/facility-requests/[id]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const signedUrls = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({ signedUrls }));
let row: unknown = null;
const from = vi.fn(() => queryStub({ data: row, error: null }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const ID = "5b0c1d2e-0000-4000-8000-000000000001";
const call = (id = ID) =>
  [
    new Request(`https://local.test/api/facility-requests/${id}`),
    { params: Promise.resolve({ id }) },
  ] as const;

describe("GET /api/facility-requests/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    row = {
      id: ID,
      building_id: 1,
      facility_code: "elevator",
      name: null,
      description: null,
      floor_info: null,
      lat: null,
      lng: null,
      status: "new",
      created_at: "x",
      reviewed_at: null,
      facility_id: null,
      client_hash: "secret-hash",
      buildings: { id: 1, name: "아산이학관", geojson: null },
      facility_request_photos: [
        { id: "p1", storage_path: `${ID}/a.webp`, sort_order: 0 },
      ],
    };
    signedUrls.mockResolvedValue(
      new Map([[`${ID}/a.webp`, "https://signed/a"]]),
    );
  });

  it("사진을 서명 주소로 주고 client_hash는 내보내지 않는다", async () => {
    const { GET } = await import("./route");
    const body = await (await GET(...call())).json();
    expect(body.photos).toEqual([
      { id: "p1", sort_order: 0, url: "https://signed/a" },
    ]);
    expect(body.building).toEqual({ id: 1, name: "아산이학관", geojson: null });
    expect(body).not.toHaveProperty("client_hash");
  });

  it("없으면 404", async () => {
    row = null;
    const { GET } = await import("./route");
    expect((await GET(...call())).status).toBe(404);
  });
});
```

`src/app/api/inbox-counts/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const from = vi.fn((table: string) =>
  queryStub({ count: table === "facility_requests" ? 2 : 5, error: null }),
);
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

describe("GET /api/inbox-counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
  });

  it("신규 요청 수와 신규 피드백 수를 준다", async () => {
    const { GET } = await import("./route");
    const body = await (
      await GET(new Request("https://local.test/api/inbox-counts"))
    ).json();
    expect(body).toEqual({ requests: 2, feedback: 5 });
    for (const result of from.mock.results) {
      const query = result.value as {
        calls: { method: string; args: unknown[] }[];
      };
      expect(query.calls).toContainEqual({
        method: "eq",
        args: ["status", "new"],
      });
    }
  });
});
```

- [ ] **Step 4: 실패 확인** — Run: `npx vitest run src/app/api/facility-requests src/app/api/inbox-counts` / Expected: 새 테스트 FAIL.

- [ ] **Step 5: 구현**

`src/app/api/facility-requests/route.ts`에 import와 `GET`을 더한다:

```ts
import { NextResponse } from "next/server";
import { getAdminPageRange } from "@/lib/adminList";
import {
  parseInboxFilter,
  requestStatusesFor,
  type FacilityRequestListItem,
  type RequestStatus,
} from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import { signedUrls } from "@/lib/server/requestPhotoStorage";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const statuses = requestStatusesFor(
    parseInboxFilter(url.searchParams.get("status")),
  );
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const building = Number(url.searchParams.get("building"));
  const { from, to } = getAdminPageRange(page);

  let query = supabaseAdmin()
    .from("facility_requests")
    .select(
      "id, building_id, facility_code, name, floor_info, lat, lng, status, created_at, facility_id, buildings(name), facility_request_photos(id, storage_path, sort_order)",
      { count: "exact" },
    );
  if (statuses) query = query.in("status", statuses);
  if (Number.isSafeInteger(building) && building > 0)
    query = query.eq("building_id", building);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);
  if (error) {
    console.error("[facility-requests] list failed", {
      message: error.message,
    });
    return NextResponse.json(
      { error: "목록을 불러오지 못했어요" },
      { status: 500 },
    );
  }

  const rows = data ?? [];
  const firstPhotos = rows.map(
    (row) =>
      [...(row.facility_request_photos ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      )[0],
  );
  const urls = await signedUrls(
    firstPhotos.flatMap((photo) => (photo ? [photo.storage_path] : [])),
  );

  const items: FacilityRequestListItem[] = rows.map((row, index) => ({
    id: row.id,
    building_id: row.building_id,
    building_name: row.buildings?.name ?? null,
    facility_code: row.facility_code,
    name: row.name,
    floor_info: row.floor_info,
    has_location: row.lat !== null && row.lng !== null,
    status: row.status as RequestStatus,
    created_at: row.created_at,
    facility_id: row.facility_id,
    photo_count: row.facility_request_photos?.length ?? 0,
    thumbnail_url: firstPhotos[index]
      ? (urls.get(firstPhotos[index].storage_path) ?? null)
      : null,
  }));
  return NextResponse.json({ items, total: count ?? 0 });
}
```

`src/app/api/facility-requests/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { FacilityRequestDetail, RequestStatus } from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import { signedUrls } from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;

  const { data: row, error } = await supabaseAdmin()
    .from("facility_requests")
    .select(
      "id, building_id, facility_code, name, description, floor_info, lat, lng, status, created_at, reviewed_at, facility_id, buildings(id, name, geojson), facility_request_photos(id, storage_path, sort_order)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "요청을 불러오지 못했어요" },
      { status: 500 },
    );
  if (!row)
    return NextResponse.json({ error: "요청이 없어요" }, { status: 404 });

  const photos = [...(row.facility_request_photos ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const urls = await signedUrls(photos.map((photo) => photo.storage_path));
  const detail: FacilityRequestDetail = {
    id: row.id,
    building_id: row.building_id,
    facility_code: row.facility_code,
    name: row.name,
    description: row.description,
    floor_info: row.floor_info,
    lat: row.lat,
    lng: row.lng,
    status: row.status as RequestStatus,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
    facility_id: row.facility_id,
    building: row.buildings
      ? {
          id: row.buildings.id,
          name: row.buildings.name,
          geojson: row.buildings.geojson,
        }
      : null,
    photos: photos.map((photo) => ({
      id: photo.id,
      sort_order: photo.sort_order,
      url: urls.get(photo.storage_path) ?? null,
    })),
  };
  return NextResponse.json(detail);
}
```

`src/app/api/inbox-counts/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const db = supabaseAdmin();
  const [requests, feedback] = await Promise.all([
    db
      .from("facility_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    db
      .from("feedback_submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
  ]);
  if (requests.error || feedback.error) {
    return NextResponse.json(
      { error: "개수를 불러오지 못했어요" },
      { status: 500 },
    );
  }
  return NextResponse.json({
    requests: requests.count ?? 0,
    feedback: feedback.count ?? 0,
  });
}
```

- [ ] **Step 6: 통과 확인** — Run: `npx vitest run src/lib/inboxStatus.test.ts src/app/api/facility-requests src/app/api/inbox-counts && npm run typecheck` / Expected: PASS. embed 결과 타입(`row.buildings`가 객체가 아니라 배열로 추론되는 등)이 오류를 내면 생성 타입의 `Relationships`(Task 1 Step 3)를 확인한다 — 다대일 관계는 객체로 추론된다.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/inboxStatus.ts src/lib/inboxStatus.test.ts src/app/api/facility-requests src/app/api/inbox-counts
git commit -m "feat(inbox): 등록 요청 목록·상세와 제보함 개수를 관리자 API로 둔다"
```

### Task 9: 상태 변경·거절·정리 라우트

**Files:**

- Create: `src/app/api/facility-requests/[id]/status/route.ts`, `.../reject/route.ts`, `.../cleanup/route.ts`와 각 `route.test.ts`

**Interfaces:**

- Consumes: `cleanupRequestPhotos`(Task 5), `isEndStatus`(Task 8).
- Produces:
  - `POST .../status` 본문 `{ status: "new" | "reviewing" }` → 200 `{ status }` · 409 `{ error }`(반대 상태가 아님) · 400
  - `POST .../reject` → 200 `{ ok: true, cleanupFailed: boolean }` · 409
  - `POST .../cleanup` → 200 `{ ok: true }` · 409(끝 상태 아님) · 500(정리 실패)

- [ ] **Step 1: 실패하는 테스트**

`src/app/api/facility-requests/[id]/status/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
let updated: unknown[] = [{ id: "r1" }];
const from = vi.fn(() => queryStub({ data: updated, error: null }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const call = (body: unknown) =>
  [
    new Request("https://local.test/api/facility-requests/r1/status", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "r1" }) },
  ] as const;

describe("POST .../status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    updated = [{ id: "r1" }];
  });

  it("확인 중으로 바꿀 때는 신규인 요청만 바꾼다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...call({ status: "reviewing" }));
    expect(response.status).toBe(200);
    const query = from.mock.results[0].value as {
      calls: { method: string; args: unknown[] }[];
    };
    expect(query.calls).toContainEqual({
      method: "update",
      args: [{ status: "reviewing" }],
    });
    expect(query.calls).toContainEqual({
      method: "eq",
      args: ["status", "new"],
    });
  });

  it("바뀐 행이 없으면(끝 상태 등) 409", async () => {
    updated = [];
    const { POST } = await import("./route");
    expect((await POST(...call({ status: "new" }))).status).toBe(409);
  });

  it("new·reviewing 외 값은 400", async () => {
    const { POST } = await import("./route");
    expect((await POST(...call({ status: "approved" }))).status).toBe(400);
  });
});
```

`src/app/api/facility-requests/[id]/reject/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const cleanupRequestPhotos = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({ cleanupRequestPhotos }));
let updated: unknown[] = [{ id: "r1" }];
const from = vi.fn(() => queryStub({ data: updated, error: null }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const call = () =>
  [
    new Request("https://local.test/x", { method: "POST" }),
    { params: Promise.resolve({ id: "r1" }) },
  ] as const;

describe("POST .../reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    updated = [{ id: "r1" }];
    cleanupRequestPhotos.mockResolvedValue(true);
  });

  it("신규·확인 중만 거절하고 사진을 정리한다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...call());
    expect(await response.json()).toEqual({ ok: true, cleanupFailed: false });
    const query = from.mock.results[0].value as {
      calls: { method: string; args: unknown[] }[];
    };
    expect(query.calls).toContainEqual({
      method: "in",
      args: ["status", ["new", "reviewing"]],
    });
    expect(cleanupRequestPhotos).toHaveBeenCalledWith("r1");
  });

  it("이미 처리된 요청은 409이고 정리하지 않는다", async () => {
    updated = [];
    const { POST } = await import("./route");
    expect((await POST(...call())).status).toBe(409);
    expect(cleanupRequestPhotos).not.toHaveBeenCalled();
  });

  it("정리가 실패해도 거절은 유지하고 알린다", async () => {
    cleanupRequestPhotos.mockResolvedValue(false);
    const { POST } = await import("./route");
    expect(await (await POST(...call())).json()).toEqual({
      ok: true,
      cleanupFailed: true,
    });
  });
});
```

`src/app/api/facility-requests/[id]/cleanup/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const cleanupRequestPhotos = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({ cleanupRequestPhotos }));
let row: unknown = { status: "rejected" };
const from = vi.fn(() => queryStub({ data: row, error: null }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const call = () =>
  [
    new Request("https://local.test/x", { method: "POST" }),
    { params: Promise.resolve({ id: "r1" }) },
  ] as const;

describe("POST .../cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    row = { status: "rejected" };
    cleanupRequestPhotos.mockResolvedValue(true);
  });

  it("끝 상태 요청만 정리한다 — 검토 전 사진은 관리자가 아직 볼 것이다", async () => {
    const { POST } = await import("./route");
    expect((await POST(...call())).status).toBe(200);
    row = { status: "new" };
    expect((await POST(...call())).status).toBe(409);
    expect(cleanupRequestPhotos).toHaveBeenCalledTimes(1);
  });

  it("정리가 실패하면 500", async () => {
    cleanupRequestPhotos.mockResolvedValue(false);
    const { POST } = await import("./route");
    expect((await POST(...call())).status).toBe(500);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run "src/app/api/facility-requests/[id]"` / Expected: 새 테스트 FAIL.

- [ ] **Step 3: 구현**

`src/app/api/facility-requests/[id]/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

const OPPOSITE = { new: "reviewing", reviewing: "new" } as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  const status = body?.status;
  if (status !== "new" && status !== "reviewing") {
    return NextResponse.json(
      { error: "상태 값이 올바르지 않아요" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin()
    .from("facility_requests")
    .update({ status })
    .eq("id", id)
    .eq("status", OPPOSITE[status])
    .select("id");
  if (error)
    return NextResponse.json(
      { error: "상태를 바꾸지 못했어요" },
      { status: 500 },
    );
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "이미 처리됐거나 상태가 바뀐 요청이에요" },
      { status: 409 },
    );
  }
  return NextResponse.json({ status });
}
```

`src/app/api/facility-requests/[id]/reject/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { cleanupRequestPhotos } from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;

  const { data, error } = await supabaseAdmin()
    .from("facility_requests")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["new", "reviewing"])
    .select("id");
  if (error)
    return NextResponse.json({ error: "거절하지 못했어요" }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "이미 처리된 요청이에요" },
      { status: 409 },
    );
  }

  const cleaned = await cleanupRequestPhotos(id);
  return NextResponse.json({ ok: true, cleanupFailed: !cleaned });
}
```

`src/app/api/facility-requests/[id]/cleanup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isEndStatus } from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import { cleanupRequestPhotos } from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;

  const { data: row } = await supabaseAdmin()
    .from("facility_requests")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!row || !isEndStatus(row.status)) {
    return NextResponse.json(
      { error: "처리가 끝난 요청만 정리할 수 있어요" },
      { status: 409 },
    );
  }
  if (!(await cleanupRequestPhotos(id))) {
    return NextResponse.json(
      { error: "사진을 지우지 못했어요" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run "src/app/api/facility-requests/[id]" && npm run typecheck` / Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/api/facility-requests/[id]/status" "src/app/api/facility-requests/[id]/reject" "src/app/api/facility-requests/[id]/cleanup"
git commit -m "feat(inbox): 요청 상태 표시·거절·남은 사진 정리 API를 둔다"
```

### Task 10: 승인 라우트 — `POST /api/facility-requests/[id]/approve`

**Files:**

- Create: `src/app/api/facility-requests/[id]/approve/route.ts`, `.../approve/route.test.ts`

**Interfaces:**

- Consumes: `parseFacilityFields`(Task 3), `copyToFacility`·`removeFolder`·`cleanupRequestPhotos`(Task 5), `isEndStatus`(Task 8), `FACILITY_PHOTO_BUCKET`·`MAX_FACILITY_PHOTOS`.
- Produces: 본문 `{ fields: ParsedFacilityFields 모양, photoIds: string[] }` → 200 `{ facilityId: string, cleanupFailed: boolean }` · 400 `{ error }`(필드·유형·사진 소유) · 409 `{ error: "이미 처리된 요청이에요" }` · 500.

- [ ] **Step 1: 실패하는 테스트**

`src/app/api/facility-requests/[id]/approve/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));

const copyToFacility = vi.fn();
const removeFolder = vi.fn();
const cleanupRequestPhotos = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({
  copyToFacility,
  removeFolder,
  cleanupRequestPhotos,
}));

const tables: Record<string, unknown> = {};
const from = vi.fn((table: string) =>
  queryStub({ data: tables[table], error: null }),
);
const rpc = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from, rpc }),
}));

const ID = "r1";
const fields = {
  facility_code: "elevator",
  name: "후문 엘리베이터",
  floor_info: "3층",
  is_installed: true,
  lat: 37.5,
  lng: 127.0,
};
const call = (body: unknown) =>
  [
    new Request("https://local.test/x", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ID }) },
  ] as const;

describe("POST .../approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    tables.facility_types = { code: "elevator" };
    tables.facility_request_photos = [
      { id: "p1", storage_path: "r1/a.webp" },
      { id: "p2", storage_path: "r1/b.webp" },
    ];
    tables.facility_requests = { status: "new" };
    copyToFacility.mockImplementation(
      async (_path: string, facilityId: string) => `${facilityId}/copy.webp`,
    );
    removeFolder.mockResolvedValue(true);
    cleanupRequestPhotos.mockResolvedValue(true);
    rpc.mockResolvedValue({ data: "approved", error: null });
  });

  it("고른 사진만 시설 폴더로 복사하고 함수 하나로 승인한 뒤 요청 사진을 정리한다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p2"] }));
    expect(response.status).toBe(200);
    const { facilityId, cleanupFailed } = await response.json();
    expect(facilityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(cleanupFailed).toBe(false);
    expect(copyToFacility).toHaveBeenCalledTimes(1);
    expect(copyToFacility).toHaveBeenCalledWith("r1/b.webp", facilityId);
    expect(rpc).toHaveBeenCalledWith("approve_facility_request", {
      p_request_id: ID,
      p_facility_id: facilityId,
      p_fields: { ...fields, description: null },
      p_photos: [
        {
          request_photo_id: "p2",
          storage_path: `${facilityId}/copy.webp`,
          sort_order: 0,
        },
      ],
    });
    expect(cleanupRequestPhotos).toHaveBeenCalledWith(ID);
    const photoQuery = from.mock.results.find(
      (_r, i) => from.mock.calls[i][0] === "facility_request_photos",
    )!.value as { calls: { method: string; args: unknown[] }[] };
    expect(photoQuery.calls).toContainEqual({
      method: "eq",
      args: ["request_id", ID],
    });
  });

  it("이 요청 것이 아닌 사진 id가 있으면 400이고 아무것도 복사하지 않는다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p-other"] }));
    expect(response.status).toBe(400);
    expect(copyToFacility).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("둘째 장 복사가 실패하면 시설 폴더를 통째로 지우고 함수를 부르지 않는다", async () => {
    copyToFacility
      .mockImplementationOnce(
        async (_p: string, facilityId: string) => `${facilityId}/1.webp`,
      )
      .mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p1", "p2"] }));
    expect(response.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
    expect(removeFolder).toHaveBeenCalledWith(
      "facility-photos",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it("함수가 already_processed면 시설 폴더를 지우고 409", async () => {
    rpc.mockResolvedValue({ data: "already_processed", error: null });
    tables.facility_requests = { status: "rejected" };
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p1"] }));
    expect(response.status).toBe(409);
    expect(removeFolder).toHaveBeenCalledWith(
      "facility-photos",
      expect.any(String),
    );
    expect(cleanupRequestPhotos).not.toHaveBeenCalled();
  });

  it("복사 중 다른 관리자가 거절했다면(원본 사라짐) 409로 답한다", async () => {
    copyToFacility.mockResolvedValue(null);
    tables.facility_requests = { status: "rejected" };
    const { POST } = await import("./route");
    expect((await POST(...call({ fields, photoIds: ["p1"] }))).status).toBe(
      409,
    );
  });

  it("정리가 실패해도 승인은 성공으로 답하고 알린다", async () => {
    cleanupRequestPhotos.mockResolvedValue(false);
    const { POST } = await import("./route");
    const body = await (await POST(...call({ fields, photoIds: [] }))).json();
    expect(body.cleanupFailed).toBe(true);
  });

  it("필드가 잘못됐거나 없는 유형이면 400", async () => {
    const { POST } = await import("./route");
    expect(
      (await POST(...call({ fields: { facility_code: "" }, photoIds: [] })))
        .status,
    ).toBe(400);
    tables.facility_types = null;
    expect((await POST(...call({ fields, photoIds: [] }))).status).toBe(400);
  });

  it("사진을 넷 이상 고르면 400", async () => {
    const { POST } = await import("./route");
    expect(
      (await POST(...call({ fields, photoIds: ["a", "b", "c", "d"] }))).status,
    ).toBe(400);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run "src/app/api/facility-requests/[id]/approve"` / Expected: FAIL.

- [ ] **Step 3: 구현**

`src/app/api/facility-requests/[id]/approve/route.ts`:

```ts
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { parseFacilityFields } from "@/lib/facilityFields";
import {
  FACILITY_PHOTO_BUCKET,
  MAX_FACILITY_PHOTOS,
} from "@/lib/facilityPhotos";
import { isEndStatus } from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  cleanupRequestPhotos,
  copyToFacility,
  removeFolder,
} from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    fields?: unknown;
    photoIds?: unknown;
  } | null;
  const fields = parseFacilityFields(body?.fields);
  if (!fields) return badRequest("입력값을 확인해 주세요");
  const photoIds = body?.photoIds;
  if (
    !Array.isArray(photoIds) ||
    photoIds.length > MAX_FACILITY_PHOTOS ||
    !photoIds.every((photoId) => typeof photoId === "string")
  ) {
    return badRequest("사진 선택이 올바르지 않아요");
  }

  const db = supabaseAdmin();
  const { data: type } = await db
    .from("facility_types")
    .select("code")
    .eq("code", fields.facility_code)
    .maybeSingle();
  if (!type) return badRequest("없는 시설 유형이에요");

  // 다른 요청의 사진이 이 시설로 공개되지 않게 이 요청의 사진 중에서만 고른다(설계 4.4).
  const { data: ownPhotos, error: photoError } = await db
    .from("facility_request_photos")
    .select("id, storage_path")
    .eq("request_id", id);
  if (photoError)
    return NextResponse.json(
      { error: "사진을 불러오지 못했어요" },
      { status: 500 },
    );
  const selected = photoIds.map((photoId) =>
    (ownPhotos ?? []).find((photo) => photo.id === photoId),
  );
  if (selected.some((photo) => !photo))
    return badRequest("이 요청의 사진이 아니에요");

  // 공개 사진 경로에 시설 id가 들어가는데 시설은 함수 안에서야 생긴다 — id를 먼저 만든다.
  const facilityId = randomUUID();

  async function abort(fallback: { error: string; status: number }) {
    // 복사가 일부만 끝났어도 같은 폴더라 함께 지워진다(설계 4.4).
    await removeFolder(FACILITY_PHOTO_BUCKET, facilityId);
    const { data: current } = await db
      .from("facility_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (current && isEndStatus(current.status)) {
      return NextResponse.json(
        { error: "이미 처리된 요청이에요" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: fallback.error },
      { status: fallback.status },
    );
  }

  const copied: {
    request_photo_id: string;
    storage_path: string;
    sort_order: number;
  }[] = [];
  for (const [index, photo] of selected.entries()) {
    const destination = await copyToFacility(photo!.storage_path, facilityId);
    if (!destination)
      return abort({ error: "사진을 옮기지 못했어요", status: 500 });
    copied.push({
      request_photo_id: photo!.id,
      storage_path: destination,
      sort_order: index,
    });
  }

  const { data: result, error } = await db.rpc("approve_facility_request", {
    p_request_id: id,
    p_facility_id: facilityId,
    p_fields: { ...fields },
    p_photos: copied,
  });
  if (error || result !== "approved") {
    if (error)
      console.error("[facility-requests] approve failed", {
        message: error.message,
      });
    if (result === "photo_mismatch")
      return abort({ error: "이 요청의 사진이 아니에요", status: 400 });
    return abort({ error: "승인하지 못했어요", status: 500 });
  }

  const cleaned = await cleanupRequestPhotos(id);
  return NextResponse.json({ facilityId, cleanupFailed: !cleaned });
}
```

`p_fields: { ...fields }`는 `ParsedFacilityFields`를 생성 타입의 `Json`에 넘기려고 펼친 것이다. 타입 오류가 나면 `fields as unknown as Json`(`import type { Json } from "@supabase-types"`)으로 바꾼다. 파서가 빈 설명을 `null`로 채우므로 테스트는 `description: null`을 기대한다.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run "src/app/api/facility-requests/[id]/approve" && npm run typecheck` / Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/api/facility-requests/[id]/approve"
git commit -m "feat(inbox): 고친 값으로 요청을 승인해 시설과 사진을 한 번에 공개하는 API를 둔다"
```

### Task 11: 피드백 관리자 API

**Files:**

- Create: `src/app/api/admin-feedback/route.ts`, `route.test.ts`, `src/app/api/admin-feedback/[id]/route.ts`, `[id]/route.test.ts`

**Interfaces:**

- Consumes: `parseInboxFilter`·`feedbackStatusesFor`(Task 8), `getAdminPageRange`.
- Produces:
  - `GET /api/admin-feedback?status=&page=` → `{ items: FeedbackItem[], total: number }`
  - `interface FeedbackItem { id: string; feedback_type: string; content: string; page_url: string | null; status: FeedbackStatus; created_at: string }` — `src/lib/inboxStatus.ts`에 추가
  - `PATCH /api/admin-feedback/[id]` 본문 `{ status: FeedbackStatus }` → 200 `{ status }` · 400 · 404

- [ ] **Step 1: 실패하는 테스트**

`src/app/api/admin-feedback/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const from = vi.fn(() =>
  queryStub({
    data: [
      {
        id: "fb1",
        feedback_type: "error",
        content: "본문",
        page_url: null,
        status: "new",
        created_at: "x",
      },
    ],
    error: null,
    count: 1,
  }),
);
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

describe("GET /api/admin-feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
  });

  it("처리 완료 필터는 resolved만 고른다", async () => {
    const { GET } = await import("./route");
    const body = await (
      await GET(
        new Request("https://local.test/api/admin-feedback?status=done"),
      )
    ).json();
    expect(body.total).toBe(1);
    const query = from.mock.results[0].value as {
      calls: { method: string; args: unknown[] }[];
    };
    expect(query.calls).toContainEqual({
      method: "in",
      args: ["status", ["resolved"]],
    });
  });

  it("비로그인은 401", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({}, { status: 401 }),
    });
    const { GET } = await import("./route");
    expect(
      (await GET(new Request("https://local.test/api/admin-feedback"))).status,
    ).toBe(401);
  });
});
```

`src/app/api/admin-feedback/[id]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
let updated: unknown[] = [{ id: "fb1" }];
const from = vi.fn(() => queryStub({ data: updated, error: null }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const call = (body: unknown) =>
  [
    new Request("https://local.test/x", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "fb1" }) },
  ] as const;

describe("PATCH /api/admin-feedback/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    updated = [{ id: "fb1" }];
  });

  it("세 상태 중 하나로 바꾼다", async () => {
    const { PATCH } = await import("./route");
    expect((await PATCH(...call({ status: "resolved" }))).status).toBe(200);
    expect((await PATCH(...call({ status: "approved" }))).status).toBe(400);
  });

  it("없는 피드백은 404", async () => {
    updated = [];
    const { PATCH } = await import("./route");
    expect((await PATCH(...call({ status: "new" }))).status).toBe(404);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/app/api/admin-feedback` / Expected: FAIL.

- [ ] **Step 3: 구현**

`src/lib/inboxStatus.ts`에 추가:

```ts
export interface FeedbackItem {
  id: string;
  feedback_type: string;
  content: string;
  page_url: string | null;
  status: FeedbackStatus;
  created_at: string;
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return value === "new" || value === "reviewing" || value === "resolved";
}
```

`src/app/api/admin-feedback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAdminPageRange } from "@/lib/adminList";
import {
  feedbackStatusesFor,
  parseInboxFilter,
  type FeedbackItem,
} from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

// feedback_submissions는 anon·authenticated 권한이 막혀 있어 서비스 키로 읽는다(설계 6장).
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const statuses = feedbackStatusesFor(
    parseInboxFilter(url.searchParams.get("status")),
  );
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const { from, to } = getAdminPageRange(page);

  let query = supabaseAdmin()
    .from("feedback_submissions")
    .select("id, feedback_type, content, page_url, status, created_at", {
      count: "exact",
    });
  if (statuses) query = query.in("status", statuses);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);
  if (error)
    return NextResponse.json(
      { error: "피드백을 불러오지 못했어요" },
      { status: 500 },
    );
  return NextResponse.json({
    items: (data ?? []) as FeedbackItem[],
    total: count ?? 0,
  });
}
```

`src/app/api/admin-feedback/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isFeedbackStatus } from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  if (!isFeedbackStatus(body?.status)) {
    return NextResponse.json(
      { error: "상태 값이 올바르지 않아요" },
      { status: 400 },
    );
  }
  const { data, error } = await supabaseAdmin()
    .from("feedback_submissions")
    .update({ status: body.status })
    .eq("id", id)
    .select("id");
  if (error)
    return NextResponse.json(
      { error: "상태를 바꾸지 못했어요" },
      { status: 500 },
    );
  if (!data || data.length === 0)
    return NextResponse.json({ error: "피드백이 없어요" }, { status: 404 });
  return NextResponse.json({ status: body.status });
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/app/api/admin-feedback src/lib/inboxStatus.test.ts && npm run typecheck` / Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/admin-feedback src/lib/inboxStatus.ts
git commit -m "feat(inbox): 피드백 목록과 상태 변경 관리자 API를 둔다"
```

### Task 12: 기존 시설 사진 API와 시설 삭제의 사진 단계

**Files:**

- Create: `src/app/api/upload-facility-photo/route.ts`, `route.test.ts`, `src/app/api/delete-facility-photo/route.ts`, `route.test.ts`
- Modify: `src/lib/facilityDelete.ts`, `src/lib/facilityDelete.test.ts`

**Interfaces:**

- Consumes: `uploadPhoto`·`removeObject`(Task 5), 상수(Task 3).
- Produces:
  - `POST /api/upload-facility-photo` multipart `file`, `facilityId` → 200 `{ id: string, storage_path: string }` · 400(WebP 아님·인자 누락) · 404(시설 없음) · 409(3장) · 413 · 500
  - `POST /api/delete-facility-photo` JSON `{ photoId }` → 200 `{ ok: true }` · 404 · 500(파일 삭제 실패 — 행 유지)
  - `deleteFacility(facility: { id: string; video_url?: string | null; facility_photos?: { id: string }[] | null })`

- [ ] **Step 1: 실패하는 테스트**

`src/app/api/upload-facility-photo/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const uploadPhoto = vi.fn();
const removeObject = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({
  uploadPhoto,
  removeObject,
}));

// 테이블마다 응답을 호출 순서대로 꺼낸다(facility_photos: 기존 목록 조회 → insert).
const queue: Record<string, unknown[]> = {};
const from = vi.fn((table: string) => queryStub(queue[table].shift()));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

function webp(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(26);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBPVP8 "), 8);
  return bytes;
}

function post(bytes: Uint8Array<ArrayBuffer> = webp()) {
  const form = new FormData();
  form.append("facilityId", "f1");
  form.append("file", new Blob([bytes], { type: "image/webp" }), "p.webp");
  return new Request("https://local.test/api/upload-facility-photo", {
    method: "POST",
    body: form,
  });
}

function arrange({
  facility = { id: "f1" } as unknown,
  existing = [{ sort_order: 0 }, { sort_order: 2 }] as unknown,
  insert = { data: { id: "fp1" }, error: null } as unknown,
} = {}) {
  queue.building_facilities = [{ data: facility, error: null }];
  queue.facility_photos = [{ data: existing, error: null }, insert];
}

describe("POST /api/upload-facility-photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    uploadPhoto.mockResolvedValue("f1/x.webp");
    removeObject.mockResolvedValue(true);
    arrange();
  });

  it("공개 버킷 시설 폴더에 올리고 비어 있는 가장 작은 순서로 행을 만든다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "fp1",
      storage_path: "f1/x.webp",
    });
    expect(uploadPhoto).toHaveBeenCalledWith(
      "facility-photos",
      "f1",
      expect.any(Uint8Array),
    );
    const insertQuery = from.mock.results[2].value as {
      calls: { method: string; args: unknown[] }[];
    };
    expect(insertQuery.calls[0]).toEqual({
      method: "insert",
      args: [{ facility_id: "f1", storage_path: "f1/x.webp", sort_order: 1 }],
    });
  });

  it("이미 3장이면 409, 올리지 않는다", async () => {
    arrange({
      existing: [{ sort_order: 0 }, { sort_order: 1 }, { sort_order: 2 }],
    });
    const { POST } = await import("./route");
    expect((await POST(post())).status).toBe(409);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("동시에 올라와 순서가 겹치면(유일 제약) 올린 파일을 지우고 409", async () => {
    arrange({
      insert: { data: null, error: { code: "23505", message: "dup" } },
    });
    const { POST } = await import("./route");
    expect((await POST(post())).status).toBe(409);
    expect(removeObject).toHaveBeenCalledWith("facility-photos", "f1/x.webp");
  });

  it("없는 시설은 404", async () => {
    arrange({ facility: null });
    const { POST } = await import("./route");
    expect((await POST(post())).status).toBe(404);
  });
});
```

`src/app/api/delete-facility-photo/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const removeObject = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({ removeObject }));
let row: unknown = { id: "fp1", storage_path: "f1/x.webp" };
const from = vi.fn(() => queryStub({ data: row, error: null }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const post = () =>
  new Request("https://local.test/api/delete-facility-photo", {
    method: "POST",
    body: JSON.stringify({ photoId: "fp1" }),
  });

describe("POST /api/delete-facility-photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    row = { id: "fp1", storage_path: "f1/x.webp" };
    removeObject.mockResolvedValue(true);
  });

  it("파일을 먼저 지우고 행을 지운다", async () => {
    const { POST } = await import("./route");
    expect((await POST(post())).status).toBe(200);
    expect(removeObject).toHaveBeenCalledWith("facility-photos", "f1/x.webp");
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("파일 삭제가 실패하면 행을 남기고 500", async () => {
    removeObject.mockResolvedValue(false);
    const { POST } = await import("./route");
    expect((await POST(post())).status).toBe(500);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("없는 사진은 404", async () => {
    row = null;
    const { POST } = await import("./route");
    expect((await POST(post())).status).toBe(404);
  });
});
```

`src/lib/facilityDelete.test.ts`에 추가(기존 `authedFetch`·`eq` 대역을 그대로 쓴다):

```ts
it("사진이 있으면 동영상 다음에 사진을 하나씩 지운 뒤 row를 삭제한다", async () => {
  vi.mocked(authedFetch).mockResolvedValue(new Response("{}", { status: 200 }));
  const result = await deleteFacility({
    id: "f3",
    video_url: null,
    facility_photos: [{ id: "fp1" }, { id: "fp2" }],
  });
  const paths = vi.mocked(authedFetch).mock.calls.map((call) => call[0]);
  expect(paths.slice(0, 2)).toEqual([
    "/api/delete-facility-photo",
    "/api/delete-facility-photo",
  ]);
  expect(eq).toHaveBeenCalledWith("id", "f3");
  expect(result).toBeNull();
});

it("사진 삭제가 실패하면 row를 지우지 않고 메시지를 돌려준다", async () => {
  vi.mocked(authedFetch).mockResolvedValueOnce(
    new Response("{}", { status: 500 }),
  );
  const result = await deleteFacility({
    id: "f4",
    facility_photos: [{ id: "fp1" }],
  });
  expect(eq).not.toHaveBeenCalled();
  expect(result).toBe("사진 삭제에 실패해 시설을 지우지 못했어요");
});
```

테스트를 쓰기 전에 `src/lib/facilityDelete.test.ts` 위쪽의 대역 이름(`authedFetch` mock, `eq`)을 읽고 맞춘다. 이름이 다르면 그 이름으로 바꿔 쓴다.

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/app/api/upload-facility-photo src/app/api/delete-facility-photo src/lib/facilityDelete.test.ts` / Expected: 새 테스트 FAIL, 기존 `facilityDelete` 테스트는 PASS.

- [ ] **Step 3: 구현**

`src/app/api/upload-facility-photo/route.ts`:

```ts
import { NextResponse } from "next/server";
import {
  FACILITY_PHOTO_BUCKET,
  MAX_FACILITY_PHOTOS,
  MAX_FACILITY_PHOTO_BYTES,
} from "@/lib/facilityPhotos";
import { requireAdmin } from "@/lib/requireAdmin";
import { removeObject, uploadPhoto } from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { WEBP_SNIFF_BYTES, isWebP } from "@/lib/webpBytes";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const facilityId = form?.get("facilityId");
  if (
    !(file instanceof File) ||
    typeof facilityId !== "string" ||
    !facilityId
  ) {
    return NextResponse.json(
      { error: "파일 또는 시설 ID 누락" },
      { status: 400 },
    );
  }
  if (file.size > MAX_FACILITY_PHOTO_BYTES) {
    return NextResponse.json(
      { error: "사진은 4MB까지 올릴 수 있어요" },
      { status: 413 },
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebP(bytes.subarray(0, WEBP_SNIFF_BYTES), bytes.length)) {
    return NextResponse.json(
      { error: "WebP 이미지만 올릴 수 있어요" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const [{ data: facility }, { data: existing }] = await Promise.all([
    db
      .from("building_facilities")
      .select("id")
      .eq("id", facilityId)
      .maybeSingle(),
    db
      .from("facility_photos")
      .select("sort_order")
      .eq("facility_id", facilityId),
  ]);
  if (!facility)
    return NextResponse.json({ error: "시설이 없어요" }, { status: 404 });
  const used = new Set((existing ?? []).map((photo) => photo.sort_order));
  const slot = Array.from(
    { length: MAX_FACILITY_PHOTOS },
    (_, index) => index,
  ).find((index) => !used.has(index));
  if (slot === undefined) {
    return NextResponse.json({ error: "사진은 3장까지예요" }, { status: 409 });
  }

  const path = await uploadPhoto(FACILITY_PHOTO_BUCKET, facilityId, bytes);
  if (!path)
    return NextResponse.json(
      { error: "사진을 올리지 못했어요" },
      { status: 500 },
    );

  const { data: inserted, error } = await db
    .from("facility_photos")
    .insert({ facility_id: facilityId, storage_path: path, sort_order: slot })
    .select("id")
    .single();
  if (error || !inserted) {
    await removeObject(FACILITY_PHOTO_BUCKET, path);
    // 동시에 두 장이 같은 순서를 잡으면 (facility_id, sort_order) 유일 제약이 막는다.
    const conflict = error?.code === "23505";
    return NextResponse.json(
      { error: conflict ? "사진은 3장까지예요" : "사진을 저장하지 못했어요" },
      { status: conflict ? 409 : 500 },
    );
  }
  return NextResponse.json({ id: inserted.id, storage_path: path });
}
```

`src/app/api/delete-facility-photo/route.ts`:

```ts
import { NextResponse } from "next/server";
import { FACILITY_PHOTO_BUCKET } from "@/lib/facilityPhotos";
import { requireAdmin } from "@/lib/requireAdmin";
import { removeObject } from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    photoId?: unknown;
  } | null;
  if (typeof body?.photoId !== "string") {
    return NextResponse.json({ error: "사진 ID 누락" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: photo } = await db
    .from("facility_photos")
    .select("id, storage_path")
    .eq("id", body.photoId)
    .maybeSingle();
  if (!photo)
    return NextResponse.json({ error: "사진이 없어요" }, { status: 404 });

  // 파일이 남은 채 행만 지우면 공개 버킷에 아무도 모르는 파일이 남는다.
  if (!(await removeObject(FACILITY_PHOTO_BUCKET, photo.storage_path))) {
    return NextResponse.json(
      { error: "사진 파일을 지우지 못했어요" },
      { status: 500 },
    );
  }
  const { error } = await db
    .from("facility_photos")
    .delete()
    .eq("id", photo.id);
  if (error)
    return NextResponse.json(
      { error: "사진 정보를 지우지 못했어요" },
      { status: 500 },
    );
  return NextResponse.json({ ok: true });
}
```

`src/lib/facilityDelete.ts` — docstring과 시그니처, 동영상 단계 뒤에 사진 단계:

```ts
/**
 * 시설을 삭제한다. 동영상과 사진이 있으면 저장소 파일을 먼저 정리한다.
 * 정리에 실패하면 고아 객체가 남지 않도록 row를 남겨두고 메시지를 반환한다.
 * 앞 단계가 성공하고 뒤 단계가 실패하면 먼저 지운 것은 돌아오지 않는다 —
 * docs/TODO_list/video/delete-ordering-data-loss.md
 * @returns 성공 시 null, 실패 시 토스트용 메시지
 */
export async function deleteFacility(facility: {
  id: string;
  video_url?: string | null;
  facility_photos?: { id: string }[] | null;
}): Promise<string | null> {
  if (facility.video_url) {
    // (기존 코드 그대로)
  }

  for (const photo of facility.facility_photos ?? []) {
    const res = await authedFetch("/api/delete-facility-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId: photo.id }),
    });
    if (!res.ok) return "사진 삭제에 실패해 시설을 지우지 못했어요";
  }

  // (row 삭제·캐시 갱신 — 기존 코드 그대로)
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/app/api/upload-facility-photo src/app/api/delete-facility-photo src/lib/facilityDelete.test.ts && npm run typecheck` / Expected: 전부 PASS(기존 "동영상이 없으면 R2 정리 없이 row만 삭제한다" 포함 — 사진 없는 시설이라 호출 횟수가 그대로다).

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/upload-facility-photo src/app/api/delete-facility-photo src/lib/facilityDelete.ts src/lib/facilityDelete.test.ts
git commit -m "feat(facility): 시설 사진 추가·삭제 API를 두고 시설 삭제가 사진도 정리한다"
```

### Task 13: 라이트박스 일반화

**Files:**

- Modify: `src/components/sidepanel/PhotoLightbox.tsx`, `src/components/sidepanel/PhotoCarousel.tsx`

**Interfaces:**

- Produces: `interface LightboxPhoto { url: string; alt: string; caption?: string | null }`, `PhotoLightbox` props `{ photos: LightboxPhoto[]; index: number; onIndexChange(index: number): void; onClose(): void; title: string; downloadBaseName: string; t(key: string): string }`

설계 5.1. 건물 사진의 보이는 동작은 바뀌지 않는다 — 기존 E2E가 그것을 지킨다.

- [ ] **Step 1: 기존 단언 확인** — Run: `npx playwright test e2e/public-map.spec.ts -g "사진"` / Expected: PASS(바꾸기 전 기준선). 실패하면 멈추고 보고한다.

- [ ] **Step 2: `PhotoLightbox` 변경** — 타입과 props, 대체 텍스트·캡션·내려받기 이름만 바꾼다. 나머지(포털, 키보드, 포커스, 마크업)는 그대로.

```tsx
import type { LangCode } from "@/lib/translations"; // 삭제
import type { SidePanelPhoto } from "@/components/SidePanel"; // 삭제

export interface LightboxPhoto {
  url: string;
  alt: string;
  caption?: string | null;
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** 머리줄에 보이는 이름(언어에 따라 다름) */
  title: string;
  /** 내려받기 파일 이름 앞부분 */
  downloadBaseName: string;
  t: (key: string) => string;
}
```

본문에서 `const caption = lang === "ko" ? ...` 줄을 지우고 `const caption = photo.caption ?? null;`로 바꾼다. `{displayName}` → `{title}`, `photoFileName(buildingName, index)` → `photoFileName(downloadBaseName, index)`, `alt={caption ?? displayName}` → `alt={photo.alt}`.

- [ ] **Step 3: `PhotoCarousel` 호출부**

```tsx
{
  lightboxOpen && photos.length > 0 && (
    <PhotoLightbox
      photos={photos.map((photo) => {
        const caption =
          lang === "ko"
            ? photo.caption
            : (photo[`caption_${lang}`] ?? photo.caption);
        return { url: photo.url, alt: caption ?? displayName, caption };
      })}
      index={photoIndex}
      onIndexChange={setPhotoIndex}
      onClose={() => setLightboxOpen(false)}
      title={displayName}
      downloadBaseName={buildingName}
      t={t}
    />
  );
}
```

- [ ] **Step 4: 확인** — Run: `npm run typecheck && npx playwright test e2e/public-map.spec.ts -g "사진"` / Expected: PASS(Step 1과 같은 결과).

- [ ] **Step 5: 커밋**

```bash
git add src/components/sidepanel/PhotoLightbox.tsx src/components/sidepanel/PhotoCarousel.tsx
git commit -m "refactor(sidepanel): 라이트박스가 사진 주소·대체 텍스트 목록을 받게 한다"
```

### Task 14: 시설 입력 필드 공유 — `FacilityFields`

**Files:**

- Create: `src/components/facility/FacilityFields.tsx`
- Modify: `src/components/admin/FacilityFormModal.tsx`

**Interfaces:**

- Consumes: `FacilityFieldValues`·`FACILITY_FIELD_LIMITS`(Task 3), `FacilityMap`.
- Produces: `FacilityFields` props `{ idPrefix: string; value: FacilityFieldValues; onChange(next: FacilityFieldValues): void; facilityTypes: { code: string; label: string }[]; labels: FacilityFieldLabels; mapCenter: [number, number]; highlightBuildingId?: number; showFloor: boolean; showInstalled: boolean; locationRequired?: boolean; locationFooter?: ReactNode; disabled?: boolean }`, `interface FacilityFieldLabels { type; typePlaceholder; name; namePlaceholder; description; descriptionPlaceholder; floor; floorPlaceholder; location; installed: string }`, `ADMIN_FACILITY_FIELD_LABELS`.

설계 3.2. 관리자 폼의 보이는 문구·순서·스타일을 그대로 옮긴다 — 기존 E2E(`e2e/admin-content.spec.ts`, `e2e/admin-building-facility-modal.spec.ts`, `e2e/admin-dark.spec.ts`의 시설 폼 모달)가 지킨다.

- [ ] **Step 1: 기준선** — Run: `npx playwright test e2e/admin-content.spec.ts e2e/admin-building-facility-modal.spec.ts e2e/admin-dark.spec.ts e2e/admin-campus-boundaries.spec.ts` / Expected: PASS.

- [ ] **Step 2: 컴포넌트 작성** — `src/components/facility/FacilityFields.tsx`:

```tsx
"use client";

import type { CSSProperties, ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  FACILITY_FIELD_LIMITS,
  type FacilityFieldValues,
} from "@/lib/facilityFields";

const FacilityMap = dynamic(() => import("@/components/FacilityMap"), {
  ssr: false,
});

export interface FacilityFieldLabels {
  type: string;
  typePlaceholder: string;
  name: string;
  namePlaceholder: string;
  description: string;
  descriptionPlaceholder: string;
  floor: string;
  floorPlaceholder: string;
  location: string;
  installed: string;
}

export const ADMIN_FACILITY_FIELD_LABELS: FacilityFieldLabels = {
  type: "시설 유형 *",
  typePlaceholder: "선택해주세요",
  name: "시설 이름 (선택)",
  namePlaceholder: "예: 정문 엘리베이터",
  description: "설명 (선택)",
  descriptionPlaceholder: "예: 정문 우측 내부",
  floor: "층 정보 (선택)",
  floorPlaceholder: "예: 1층~4층",
  location: "위치 (지도에서 클릭해서 선택)",
  installed: "설치됨",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  marginTop: 4,
};
const labelStyle: CSSProperties = {
  fontSize: 12,
  color: "#555",
  display: "block",
  marginTop: 12,
};

interface FacilityFieldsProps {
  idPrefix: string;
  value: FacilityFieldValues;
  onChange: (next: FacilityFieldValues) => void;
  facilityTypes: { code: string; label: string }[];
  labels: FacilityFieldLabels;
  mapCenter: [number, number];
  highlightBuildingId?: number;
  showFloor: boolean;
  showInstalled: boolean;
  locationRequired?: boolean;
  /** 지도 아래 — 현재 위치 버튼·캠퍼스 안내 */
  locationFooter?: ReactNode;
  disabled?: boolean;
}

export default function FacilityFields({
  idPrefix,
  value,
  onChange,
  facilityTypes,
  labels,
  mapCenter,
  highlightBuildingId,
  showFloor,
  showInstalled,
  locationRequired = false,
  locationFooter,
  disabled = false,
}: FacilityFieldsProps) {
  const set = (patch: Partial<FacilityFieldValues>) =>
    onChange({ ...value, ...patch });

  return (
    <>
      <label style={labelStyle} htmlFor={`${idPrefix}-code`}>
        {labels.type}
      </label>
      <select
        id={`${idPrefix}-code`}
        value={value.facility_code}
        onChange={(e) => set({ facility_code: e.target.value })}
        disabled={disabled}
        style={inputStyle}
      >
        <option value="">{labels.typePlaceholder}</option>
        {facilityTypes.map((type) => (
          <option key={type.code} value={type.code}>
            {type.label}
          </option>
        ))}
      </select>

      <label style={labelStyle} htmlFor={`${idPrefix}-name`}>
        {labels.name}
      </label>
      <input
        id={`${idPrefix}-name`}
        value={value.name}
        maxLength={FACILITY_FIELD_LIMITS.name}
        onChange={(e) => set({ name: e.target.value })}
        placeholder={labels.namePlaceholder}
        disabled={disabled}
        style={inputStyle}
      />

      <label style={labelStyle} htmlFor={`${idPrefix}-description`}>
        {labels.description}
      </label>
      <input
        id={`${idPrefix}-description`}
        value={value.description}
        maxLength={FACILITY_FIELD_LIMITS.description}
        onChange={(e) => set({ description: e.target.value })}
        placeholder={labels.descriptionPlaceholder}
        disabled={disabled}
        style={inputStyle}
      />

      {showFloor && (
        <>
          <label style={labelStyle} htmlFor={`${idPrefix}-floor`}>
            {labels.floor}
          </label>
          <input
            id={`${idPrefix}-floor`}
            value={value.floor_info}
            maxLength={FACILITY_FIELD_LIMITS.floor_info}
            onChange={(e) => set({ floor_info: e.target.value })}
            placeholder={labels.floorPlaceholder}
            disabled={disabled}
            style={inputStyle}
          />
        </>
      )}

      <div style={labelStyle}>
        {labels.location}
        {locationRequired ? " *" : ""}
      </div>
      <div
        className="ku-facility-map-frame"
        style={{
          marginTop: 4,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      >
        <FacilityMap
          center={mapCenter}
          highlightId={highlightBuildingId}
          markerPosition={
            value.lat && value.lng
              ? [parseFloat(value.lat), parseFloat(value.lng)]
              : null
          }
          onMapClick={(lat, lng) => {
            if (!disabled) set({ lat: lat.toFixed(7), lng: lng.toFixed(7) });
          }}
        />
      </div>
      {locationFooter}

      {showInstalled && (
        <label
          style={{
            ...labelStyle,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            checked={value.is_installed}
            onChange={(e) => set({ is_installed: e.target.checked })}
            disabled={disabled}
          />
          {labels.installed}
        </label>
      )}
    </>
  );
}
```

- [ ] **Step 3: `FacilityFormModal` 교체** — 시설 유형 `<label>`부터 `설치됨` 체크박스 `</label>`까지를 아래로 바꾸고, 파일 위의 `FacilityMap` dynamic import와 `labelStyle`·`inputStyle` 중 더 쓰지 않는 것을 지운다. 현 위치 버튼과 캠퍼스 안내는 `locationFooter`로 옮긴다(문구·클래스 그대로).

```tsx
<FacilityFields
  idPrefix={fieldId}
  value={form}
  onChange={setForm}
  facilityTypes={facilityTypes.map((type) => ({
    code: type.code,
    label: type.label ?? type.code,
  }))}
  labels={ADMIN_FACILITY_FIELD_LABELS}
  mapCenter={center}
  highlightBuildingId={buildingId ?? undefined}
  showFloor={!standalone}
  showInstalled
  locationRequired={standalone}
  locationFooter={
    <>
      <button
        className="ku-current-location-button"
        type="button"
        onClick={useCurrentLocation}
      >
        <span aria-hidden="true">📍</span> 현 위치로 찍기
      </button>
      {form.lat && form.lng && (
        <div aria-live="polite" style={{ fontSize: 12, marginTop: 8 }}>
          <div style={{ color: "#2563EB" }}>
            선택된 위치: {form.lat}, {form.lng}
          </div>
          <div
            style={{
              color: positionCampus ? "#166534" : "#B45309",
              marginTop: 4,
              fontWeight: 500,
            }}
          >
            {!boundaries && !boundariesError
              ? "캠퍼스 영역 확인 중..."
              : positionCampus
                ? `${positionCampus} 영역입니다.`
                : boundariesError
                  ? "캠퍼스 영역을 확인하지 못했습니다. 저장은 가능합니다."
                  : "캠퍼스 영역 밖입니다. 인접 지역 시설이라면 그대로 저장할 수 있습니다."}
          </div>
        </div>
      )}
    </>
  }
/>
```

이 블록은 지금 `FacilityFormModal`에 있는 것과 같은 내용이다. 옮기기 전에 원본과 한 글자씩 대조한다. `form`의 상태 타입을 `useState<FacilityFieldValues>({...})`로 바꾼다(키가 이미 같다).

- [ ] **Step 4: 확인** — Run: `npm run typecheck && npm run lint && npx playwright test e2e/admin-content.spec.ts e2e/admin-building-facility-modal.spec.ts e2e/admin-dark.spec.ts e2e/admin-campus-boundaries.spec.ts` / Expected: Step 1과 같이 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/components/facility/FacilityFields.tsx src/components/admin/FacilityFormModal.tsx
git commit -m "refactor(facility): 시설 입력 필드를 공유 컴포넌트로 뺀다"
```

### Task 15: 공개 사이드패널의 시설 사진

**Files:**

- Create: `src/lib/facilityPhotoUrl.ts`, `src/components/sidepanel/FacilityPhotoStrip.tsx`, `e2e/facility-photos.spec.ts`
- Modify: `src/components/SidePanel.tsx`(시설 select), `src/components/sidepanel/FacilityList.tsx`, `src/components/map/map-ui.css`, `src/lib/translations.ts`, `e2e/support/mockBackend.ts`

**Interfaces:**

- Consumes: `LightboxPhoto`·`PhotoLightbox`(Task 13), `FACILITY_PHOTO_BUCKET`.
- Produces: `facilityPhotoUrl(storagePath: string): string`; 목 백엔드 `MockState.facilityPhotos: Row[]`, 배열 embed 투영, `/storage/v1/object/public/*` 대역.

- [ ] **Step 1: 목 백엔드 확장**

`e2e/support/mockBackend.ts`:

1. `MockState`에 `facilityPhotos: Row[]; facilityRequests: Row[]; facilityRequestPhotos: Row[];`를 더하고 `createState()`가 셋 다 `[]`로 만든다(뒤 두 개는 Task 16·17이 쓴다). 파일 머리 구조 주석의 "2) 라우팅" 목록에 `/storage/v1/object/public/*`를 더한다.
2. `projectEmbeds`의 루프에서 값이 배열이면 원소마다 투영한다:

```ts
const value = projected[embed.name];
if (Array.isArray(value)) {
  projected[embed.name] = value.map((item) =>
    Object.fromEntries(
      embed.columns
        .filter((column) => column in (item as Row))
        .map((column) => [column, (item as Row)[column]]),
    ),
  );
  continue;
}
if (!value || typeof value !== "object") continue;
```

3. `rows()`에서 `building_facilities` 결과를 돌려주기 직전에, select가 사진을 embed하면 붙인다:

```ts
if (
  name === "building_facilities" &&
  url.searchParams.get("select")?.includes("facility_photos(")
) {
  result = result.map((row) => ({
    ...row,
    facility_photos: state.facilityPhotos.filter(
      (photo) => photo.facility_id === row.id,
    ),
  }));
}
```

4. 전역 라우트에서 `/auth/v1/` 분기 앞에:

```ts
if (url.pathname.startsWith("/storage/v1/object/public/")) {
  return route.fulfill({ status: 200, contentType: "image/webp", body: "" });
}
```

- [ ] **Step 2: 실패하는 E2E** — `e2e/facility-photos.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("시설 사진", () => {
  test("공개 사이드패널에 시설 사진 썸네일이 보이고 누르면 라이트박스로 열린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    state.facilityPhotos.push(
      {
        id: "fp2",
        facility_id: "f-building",
        storage_path: "f-building/b.webp",
        sort_order: 1,
      },
      {
        id: "fp1",
        facility_id: "f-building",
        storage_path: "f-building/a.webp",
        sort_order: 0,
      },
    );

    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();

    const first = page.getByRole("button", {
      name: "중앙 엘리베이터 사진 1",
      exact: true,
    });
    await expect(first).toBeVisible();
    await expect(
      page.getByRole("button", { name: "중앙 엘리베이터 사진 2", exact: true }),
    ).toBeVisible();

    await first.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("img", { name: "중앙 엘리베이터 사진 1" }),
    ).toHaveAttribute(
      "src",
      /\/storage\/v1\/object\/public\/facility-photos\/f-building\/a\.webp$/,
    );
    await expect(dialog).toContainText("1 / 2");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(first).toBeFocused();
  });
});
```

Run: `npx playwright test e2e/facility-photos.spec.ts` / Expected: FAIL(썸네일 없음).

- [ ] **Step 3: 구현**

`src/lib/facilityPhotoUrl.ts`:

```ts
import { FACILITY_PHOTO_BUCKET } from "@/lib/facilityPhotos";
import { supabase } from "@/lib/supabaseClient";

/** 저장소 경로만 저장하고 주소는 읽을 때 만든다(설계 2.2). 네트워크 요청은 없다. */
export function facilityPhotoUrl(storagePath: string): string {
  return supabase.storage.from(FACILITY_PHOTO_BUCKET).getPublicUrl(storagePath)
    .data.publicUrl;
}
```

`src/components/sidepanel/FacilityPhotoStrip.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import PhotoLightbox from "@/components/sidepanel/PhotoLightbox";
import { facilityPhotoUrl } from "@/lib/facilityPhotoUrl";
import type { FacilityPhoto } from "@/types/domain";

interface FacilityPhotoStripProps {
  photos: Pick<FacilityPhoto, "id" | "storage_path" | "sort_order">[];
  facilityName: string;
  t: (key: string) => string;
}

export default function FacilityPhotoStrip({
  photos,
  facilityName,
  t,
}: FacilityPhotoStripProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (photos.length === 0) return null;

  const items = [...photos]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((photo, index) => ({
      url: facilityPhotoUrl(photo.storage_path),
      alt: `${facilityName} ${t("facilityPhotoAlt")} ${index + 1}`,
      caption: null,
    }));

  return (
    <div className="ku-facility-photos">
      {items.map((item, index) => (
        <button
          key={item.url}
          type="button"
          className="ku-facility-photo-thumb"
          aria-label={item.alt}
          onClick={() => setOpenIndex(index)}
        >
          <Image
            src={item.url}
            alt=""
            width={64}
            height={64}
            unoptimized
            style={{ objectFit: "cover" }}
          />
        </button>
      ))}
      {openIndex !== null && (
        <PhotoLightbox
          photos={items}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          title={facilityName}
          downloadBaseName={facilityName}
          t={t}
        />
      )}
    </div>
  );
}
```

`FacilityList.tsx` — `import FacilityPhotoStrip from "@/components/sidepanel/FacilityPhotoStrip";`를 더하고, 시설 항목에서 `{facility.video_url && (` 바로 위에:

```tsx
<FacilityPhotoStrip
  photos={facility.facility_photos ?? []}
  facilityName={name}
  t={t}
/>
```

`SidePanel.tsx`의 시설 select를 바꾼다:

```ts
        .select("*, facility_types(code, label, label_en, label_zh), facility_photos(id, storage_path, sort_order)")
```

`translations.ts` — 세 언어의 `photoDownload` 다음 줄에 `facilityPhotoAlt`: ko `"사진"`, en `"photo"`, zh `"照片"`.

`map-ui.css` 끝에:

```css
.ku-facility-photos {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.ku-facility-photo-thumb {
  width: 64px;
  height: 64px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--ku-border);
  border-radius: 8px;
  background: var(--ku-surface-raised);
  cursor: pointer;
}
.ku-facility-photo-thumb:focus-visible {
  outline: 2px solid var(--ku-primary);
  outline-offset: 2px;
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm run typecheck && npx playwright test e2e/facility-photos.spec.ts e2e/public-map.spec.ts e2e/public-map-p1-remainder.spec.ts` / Expected: PASS. 라이트박스를 닫은 뒤 포커스 복귀가 썸네일로 가지 않으면 `useModalFocus`의 복귀 대상(열기 직전 포커스)을 확인한다 — 버튼 클릭으로 열었으므로 그 버튼이어야 한다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/facilityPhotoUrl.ts src/components/sidepanel/FacilityPhotoStrip.tsx src/components/sidepanel/FacilityList.tsx src/components/SidePanel.tsx src/components/map/map-ui.css src/lib/translations.ts e2e/support/mockBackend.ts e2e/facility-photos.spec.ts
git commit -m "feat(sidepanel): 시설 사진 썸네일을 보이고 라이트박스로 연다"
```

### Task 16: 학생 등록 요청 모달

**Files:**

- Create: `src/components/TurnstileWidget.tsx`, `src/lib/facilityRequestClient.ts`, `src/lib/facilityRequestClient.test.ts`, `src/components/sidepanel/FacilityRequestModal.tsx`, `e2e/facility-request.spec.ts`
- Modify: `src/components/SidePanel.tsx`, `src/lib/translations.ts`, `src/components/map/map-ui.css`, `playwright.config.ts`, `e2e/support/mockBackend.ts`

**Interfaces:**

- Consumes: `FacilityFields`(Task 14), `MAX_FACILITY_PHOTOS`·`MAX_FACILITY_PHOTO_BYTES`(Task 3), `convertToWebP`(`src/lib/imageToWebP.ts`), Task 6·7의 API 계약.
- Produces:
  - `submitFacilityRequest(input: SubmitInput, fetchImpl?: typeof fetch): Promise<SubmitResult>`
  - `uploadRequestPhoto(requestId: string, uploadToken: string, blob: Blob, fetchImpl?: typeof fetch): Promise<PhotoUploadResult>` — `"done" | "token" | "closed" | "too_large" | "failed"`
  - `REQUEST_ERROR_KEYS: Record<RequestErrorCode, string>`
  - `TurnstileWidget` props `{ siteKey: string; onToken(token: string): void; onExpire(): void }`

- [ ] **Step 1: 실패하는 단위 테스트** — `src/lib/facilityRequestClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  submitFacilityRequest,
  uploadRequestPhoto,
} from "./facilityRequestClient";

function fetchReturning(status: number, body: unknown) {
  return vi.fn(async () =>
    Response.json(body, { status }),
  ) as unknown as typeof fetch;
}

const input = {
  buildingId: 1,
  fields: {
    facility_code: "elevator",
    name: "",
    description: "",
    floor_info: "3층",
    lat: null,
    lng: null,
  },
  turnstileToken: "tok",
  website: "",
};

describe("submitFacilityRequest", () => {
  it("성공하면 id와 토큰을 준다", async () => {
    const result = await submitFacilityRequest(
      input,
      fetchReturning(201, { id: "r1", uploadToken: "t" }),
    );
    expect(result).toEqual({ ok: true, id: "r1", uploadToken: "t" });
  });

  it("honeypot 성공 응답(id 없음)도 성공이다", async () => {
    expect(
      await submitFacilityRequest(input, fetchReturning(201, { ok: true })),
    ).toEqual({
      ok: true,
      id: null,
      uploadToken: null,
    });
  });

  it("오류 코드를 그대로, 모르는 코드와 네트워크 오류는 server로", async () => {
    expect(
      await submitFacilityRequest(
        input,
        fetchReturning(429, { error: "rate_limited" }),
      ),
    ).toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect(
      await submitFacilityRequest(input, fetchReturning(500, { error: "??" })),
    ).toEqual({ ok: false, error: "server" });
    const broken = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await submitFacilityRequest(input, broken)).toEqual({
      ok: false,
      error: "server",
    });
  });
});

describe("uploadRequestPhoto", () => {
  it("응답을 다섯 결과로 나눈다", async () => {
    const blob = new Blob([new Uint8Array([1])], { type: "image/webp" });
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(201, { id: "p" }),
      ),
    ).toBe("done");
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(403, { error: "token" }),
      ),
    ).toBe("token");
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(409, { error: "not_new" }),
      ),
    ).toBe("closed");
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(409, { error: "full" }),
      ),
    ).toBe("closed");
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(413, { error: "too_large" }),
      ),
    ).toBe("too_large");
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(500, { error: "server" }),
      ),
    ).toBe("failed");
  });

  it("요청 id 경로로 토큰과 파일을 보낸다", async () => {
    const fetchImpl = fetchReturning(201, { id: "p" });
    await uploadRequestPhoto(
      "r1",
      "t",
      new Blob([new Uint8Array([1])]),
      fetchImpl,
    );
    const [url, init] = (
      fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0];
    expect(url).toBe("/api/facility-requests/r1/photos");
    const form = init.body as FormData;
    expect(form.get("token")).toBe("t");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });
});
```

Run: `npx vitest run src/lib/facilityRequestClient.test.ts` / Expected: FAIL.

- [ ] **Step 2: 클라이언트 헬퍼** — `src/lib/facilityRequestClient.ts`:

```ts
export type RequestErrorCode =
  "invalid" | "turnstile" | "rate_limited" | "unavailable" | "server";

const ERROR_CODES: RequestErrorCode[] = [
  "invalid",
  "turnstile",
  "rate_limited",
  "unavailable",
  "server",
];

export const REQUEST_ERROR_KEYS: Record<RequestErrorCode, string> = {
  invalid: "requestErrorInvalid",
  turnstile: "requestErrorTurnstile",
  rate_limited: "requestErrorRateLimited",
  unavailable: "requestErrorUnavailable",
  server: "requestErrorServer",
};

export interface SubmitInput {
  buildingId: number;
  fields: {
    facility_code: string;
    name: string;
    description: string;
    floor_info: string;
    lat: number | null;
    lng: number | null;
  };
  turnstileToken: string;
  website: string;
}

export type SubmitResult =
  | { ok: true; id: string | null; uploadToken: string | null }
  | { ok: false; error: RequestErrorCode };

export type PhotoUploadResult =
  "done" | "token" | "closed" | "too_large" | "failed";

export async function submitFacilityRequest(
  input: SubmitInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  try {
    const response = await fetchImpl("/api/facility-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (response.ok) {
      return {
        ok: true,
        id: typeof body.id === "string" ? body.id : null,
        uploadToken:
          typeof body.uploadToken === "string" ? body.uploadToken : null,
      };
    }
    const code = ERROR_CODES.find((candidate) => candidate === body.error);
    return { ok: false, error: code ?? "server" };
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function uploadRequestPhoto(
  requestId: string,
  uploadToken: string,
  blob: Blob,
  fetchImpl: typeof fetch = fetch,
): Promise<PhotoUploadResult> {
  const form = new FormData();
  form.append("token", uploadToken);
  form.append("file", blob, "photo.webp");
  try {
    const response = await fetchImpl(
      `/api/facility-requests/${requestId}/photos`,
      {
        method: "POST",
        body: form,
      },
    );
    if (response.ok) return "done";
    const body = (await response.json().catch(() => ({}))) as {
      error?: unknown;
    };
    if (body.error === "token") return "token";
    if (body.error === "not_new" || body.error === "full") return "closed";
    if (body.error === "too_large") return "too_large";
    return "failed";
  } catch {
    return "failed";
  }
}
```

Run: `npx vitest run src/lib/facilityRequestClient.test.ts` / Expected: PASS.

- [ ] **Step 3: Turnstile 위젯** — `src/components/TurnstileWidget.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile script"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string) => void;
  /** 토큰 만료·위젯 오류. 제출 버튼을 다시 막는다. */
  onExpire: () => void;
}

export default function TurnstileWidget({
  siteKey,
  onToken,
  onExpire,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onToken, onExpire });

  useEffect(() => {
    handlers.current = { onToken, onExpire };
  }, [onToken, onExpire]);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => handlers.current.onToken(token),
          "expired-callback": () => handlers.current.onExpire(),
          "error-callback": () => handlers.current.onExpire(),
        });
      })
      .catch(() => handlers.current.onExpire());
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={containerRef} className="ku-turnstile" />;
}
```

- [ ] **Step 4: 번역 키** — `src/lib/translations.ts`의 세 언어 객체 끝에 같은 키로 넣는다.

| 키                              | ko                                                                     | en                                                               | zh                                          |
| ------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| `requestButton`                 | 시설 등록 요청                                                         | Suggest a facility                                               | 申请添加设施                                |
| `requestTitle`                  | 시설 등록 요청                                                         | Suggest a facility                                               | 申请添加设施                                |
| `requestSubtitle`               | 관리자가 확인한 뒤 지도에 올라가요                                     | It will appear on the map after review                           | 管理员审核后将显示在地图上                  |
| `requestTypeLabel`              | 시설 유형 *                                                            | Facility type *                                                  | 设施类型 *                                  |
| `requestTypePlaceholder`        | 선택해 주세요                                                          | Select                                                           | 请选择                                      |
| `requestNameLabel`              | 이름 (선택)                                                            | Name (optional)                                                  | 名称（可选）                                |
| `requestNamePlaceholder`        | 예: 후문 엘리베이터                                                    | e.g. Back gate elevator                                          | 例：后门电梯                                |
| `requestDescriptionLabel`       | 설명 (선택)                                                            | Description (optional)                                           | 说明（可选）                                |
| `requestDescriptionPlaceholder` | 예: 후문 쪽 복도 끝                                                    | e.g. End of the hallway by the back gate                         | 例：后门走廊尽头                            |
| `requestFloorLabel`             | 층 (선택)                                                              | Floor (optional)                                                 | 楼层（可选）                                |
| `requestFloorPlaceholder`       | 예: 3층                                                                | e.g. 3F                                                          | 例：3楼                                     |
| `requestLocationLabel`          | 위치 (선택) — 지도를 눌러 찍기                                         | Location (optional) — tap the map                                | 位置（可选）— 点击地图                      |
| `requestLocateButton`           | 현재 위치                                                              | My location                                                      | 当前位置                                    |
| `requestInstalledLabel`         | 설치됨                                                                 | Installed                                                        | 已安装                                      |
| `requestPhotosLabel`            | 사진                                                                   | Photos                                                           | 照片                                        |
| `requestPhotosHint`             | 사진은 최대 3장, 장당 4MB까지 올릴 수 있어요. 올릴 때 자동으로 줄여요. | Up to 3 photos, 4MB each. Photos are resized automatically.      | 最多 3 张照片，每张 4MB。上传时会自动压缩。 |
| `requestPhotoAdd`               | 사진 추가                                                              | Add photo                                                        | 添加照片                                    |
| `requestPhotoRemove`            | 사진 빼기                                                              | Remove photo                                                     | 移除照片                                    |
| `requestPhotoConverting`        | 줄이는 중                                                              | Resizing                                                         | 压缩中                                      |
| `requestPhotoTooLarge`          | 사진이 너무 커요(4MB 초과)                                             | Photo too large (over 4MB)                                       | 照片过大（超过 4MB）                        |
| `requestPhotoUploading`         | 올리는 중                                                              | Uploading                                                        | 上传中                                      |
| `requestPhotoDone`              | 완료                                                                   | Done                                                             | 完成                                        |
| `requestPhotoFailed`            | 실패                                                                   | Failed                                                           | 失败                                        |
| `requestSubmit`                 | 요청 보내기                                                            | Send request                                                     | 提交申请                                    |
| `requestSubmitting`             | 보내는 중…                                                             | Sending…                                                         | 提交中…                                     |
| `requestRetryPhotos`            | 실패한 사진 다시 올리기                                                | Retry failed photos                                              | 重新上传失败的照片                          |
| `requestDone`                   | 요청을 보냈어요. 관리자가 확인한 뒤 지도에 올라가요.                   | Request sent. It will appear on the map after review.            | 已提交申请。管理员审核后将显示在地图上。    |
| `requestTypeRequired`           | 시설 유형을 골라 주세요                                                | Please select a facility type                                    | 请选择设施类型                              |
| `requestErrorInvalid`           | 입력값을 확인해 주세요                                                 | Please check your input                                          | 请检查输入内容                              |
| `requestErrorTurnstile`         | 사람인지 확인하지 못했어요. 다시 시도해 주세요                         | Verification failed. Please try again                            | 验证失败，请重试                            |
| `requestErrorRateLimited`       | 요청이 많아요. 잠시 후 다시 시도해 주세요                              | Too many requests. Please try again later                        | 请求过多，请稍后再试                        |
| `requestErrorUnavailable`       | 지금은 요청을 받을 수 없어요                                           | Requests are not available right now                             | 暂时无法提交申请                            |
| `requestErrorServer`            | 요청을 보내지 못했어요. 다시 시도해 주세요                             | Could not send. Please try again                                 | 提交失败，请重试                            |
| `requestErrorTokenExpired`      | 시간이 지나 사진을 더 올릴 수 없어요. 요청은 접수됐어요                | Time expired for photos. Your request was received               | 已超时无法继续上传照片，申请已提交          |
| `requestErrorClosed`            | 검토가 시작돼 사진을 더 올릴 수 없어요. 요청은 접수됐어요              | Review has started, so no more photos. Your request was received | 审核已开始，无法再上传照片，申请已提交      |

- [ ] **Step 5: 모달** — `src/components/sidepanel/FacilityRequestModal.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FacilityFields, {
  type FacilityFieldLabels,
} from "@/components/facility/FacilityFields";
import TurnstileWidget from "@/components/TurnstileWidget";
import {
  EMPTY_FACILITY_FIELDS,
  type FacilityFieldValues,
} from "@/lib/facilityFields";
import {
  MAX_FACILITY_PHOTOS,
  MAX_FACILITY_PHOTO_BYTES,
} from "@/lib/facilityPhotos";
import {
  REQUEST_ERROR_KEYS,
  submitFacilityRequest,
  uploadRequestPhoto,
} from "@/lib/facilityRequestClient";
import { convertToWebP } from "@/lib/imageToWebP";
import { supabase } from "@/lib/supabaseClient";
import type { LangCode } from "@/lib/translations";
import { useModalFocus } from "@/lib/useModalFocus";

type SlotStatus =
  "converting" | "ready" | "too_large" | "uploading" | "done" | "failed";
interface PhotoSlot {
  key: string;
  status: SlotStatus;
  blob: Blob | null;
  previewUrl: string | null;
}
type Phase = "form" | "sending" | "uploading" | "retry" | "done";

interface FacilityRequestModalProps {
  buildingId: number;
  buildingName: string;
  mapCenter: [number, number];
  siteKey: string;
  lang: LangCode;
  t: (key: string) => string;
  onClose: () => void;
}

export default function FacilityRequestModal({
  buildingId,
  buildingName,
  mapCenter,
  siteKey,
  lang,
  t,
  onClose,
}: FacilityRequestModalProps) {
  const titleId = useId();
  const fieldId = useId();
  const [fields, setFields] = useState<FacilityFieldValues>(
    EMPTY_FACILITY_FIELDS,
  );
  const [types, setTypes] = useState<{ code: string; label: string }[]>([]);
  const [slots, setSlots] = useState<PhotoSlot[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);
  const [phase, setPhase] = useState<Phase>("form");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const requestRef = useRef<{ id: string; uploadToken: string } | null>(null);
  const slotsRef = useRef(slots);
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose,
    closeOnEscape: phase !== "sending",
  });

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(
    () => () => {
      for (const slot of slotsRef.current)
        if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("facility_types")
      .select("code, label, label_en, label_zh")
      .then(({ data }) => {
        if (cancelled) return;
        setTypes(
          (data ?? []).map((type) => ({
            code: type.code,
            label:
              (lang === "en"
                ? type.label_en
                : lang === "zh"
                  ? type.label_zh
                  : type.label) ??
              type.label ??
              type.code,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const updateSlot = useCallback((key: string, patch: Partial<PhotoSlot>) => {
    setSlots((previous) =>
      previous.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)),
    );
  }, []);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_FACILITY_PHOTOS - slots.length;
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      const key = crypto.randomUUID();
      setSlots((previous) => [
        ...previous,
        { key, status: "converting", blob: null, previewUrl: null },
      ]);
      convertToWebP(file)
        .then((blob) => {
          if (blob.size > MAX_FACILITY_PHOTO_BYTES) {
            updateSlot(key, { status: "too_large" });
            return;
          }
          updateSlot(key, {
            status: "ready",
            blob,
            previewUrl: URL.createObjectURL(blob),
          });
        })
        .catch(() => updateSlot(key, { status: "failed" }));
    }
  }

  function removeSlot(key: string) {
    setSlots((previous) => {
      const target = previous.find((slot) => slot.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return previous.filter((slot) => slot.key !== key);
    });
  }

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) =>
        setFields((previous) => ({
          ...previous,
          lat: coords.latitude.toFixed(7),
          lng: coords.longitude.toFixed(7),
        })),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function uploadPending() {
    const request = requestRef.current;
    if (!request) return;
    setPhase("uploading");
    let stopped = false;
    let failed = false;
    // slotsRef는 렌더 뒤에 갱신된다 — 루프 결과는 지역 변수로 센다.
    for (const slot of slotsRef.current) {
      if (!slot.blob || (slot.status !== "ready" && slot.status !== "failed"))
        continue;
      if (stopped) continue;
      updateSlot(slot.key, { status: "uploading" });
      const result = await uploadRequestPhoto(
        request.id,
        request.uploadToken,
        slot.blob,
      );
      if (result === "done") {
        updateSlot(slot.key, { status: "done" });
        continue;
      }
      updateSlot(slot.key, {
        status: result === "too_large" ? "too_large" : "failed",
      });
      if (result === "token" || result === "closed") {
        setErrorKey(
          result === "token"
            ? "requestErrorTokenExpired"
            : "requestErrorClosed",
        );
        stopped = true;
      } else if (result === "failed") {
        failed = true;
      }
    }
    // 토큰 만료·검토 시작이면 다시 올릴 수 없으니 끝낸다. 요청 자체는 접수됐다.
    setPhase(failed && !stopped ? "retry" : "done");
  }

  async function submit() {
    if (!fields.facility_code) {
      setErrorKey("requestTypeRequired");
      return;
    }
    if (!token) return;
    setErrorKey(null);
    setPhase("sending");
    const result = await submitFacilityRequest({
      buildingId,
      fields: {
        facility_code: fields.facility_code,
        name: fields.name,
        description: fields.description,
        floor_info: fields.floor_info,
        lat: fields.lat ? Number(fields.lat) : null,
        lng: fields.lng ? Number(fields.lng) : null,
      },
      turnstileToken: token,
      website,
    });
    if (!result.ok) {
      setErrorKey(REQUEST_ERROR_KEYS[result.error]);
      // Turnstile 토큰은 한 번만 검증된다 — 다시 보내려면 새 토큰이 필요하다.
      setToken(null);
      setWidgetKey((key) => key + 1);
      setPhase("form");
      return;
    }
    if (!result.id || !result.uploadToken) {
      setPhase("done");
      return;
    }
    requestRef.current = { id: result.id, uploadToken: result.uploadToken };
    await uploadPending();
  }

  const labels: FacilityFieldLabels = {
    type: t("requestTypeLabel"),
    typePlaceholder: t("requestTypePlaceholder"),
    name: t("requestNameLabel"),
    namePlaceholder: t("requestNamePlaceholder"),
    description: t("requestDescriptionLabel"),
    descriptionPlaceholder: t("requestDescriptionPlaceholder"),
    floor: t("requestFloorLabel"),
    floorPlaceholder: t("requestFloorPlaceholder"),
    location: t("requestLocationLabel"),
    installed: t("requestInstalledLabel"),
  };
  const busy = phase === "sending" || phase === "uploading";
  const converting = slots.some((slot) => slot.status === "converting");

  return createPortal(
    <div className="ku-request-modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="ku-request-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="ku-request-modal-title">
          {t("requestTitle")}
        </h2>
        <p className="ku-request-modal-subtitle">
          {buildingName} · {t("requestSubtitle")}
        </p>

        {phase === "done" ? (
          <div role="status" className="ku-request-modal-done">
            <p>{t("requestDone")}</p>
            {errorKey && <p className="ku-request-modal-note">{t(errorKey)}</p>}
            <button
              type="button"
              className="ku-request-modal-primary"
              onClick={onClose}
            >
              {t("closeLabel")}
            </button>
          </div>
        ) : (
          <>
            <FacilityFields
              idPrefix={fieldId}
              value={fields}
              onChange={setFields}
              facilityTypes={types}
              labels={labels}
              mapCenter={mapCenter}
              highlightBuildingId={buildingId}
              showFloor
              showInstalled={false}
              disabled={phase !== "form"}
              locationFooter={
                <button
                  type="button"
                  className="ku-current-location-button"
                  onClick={locate}
                  disabled={phase !== "form"}
                >
                  <span aria-hidden="true">📍</span> {t("requestLocateButton")}
                </button>
              }
            />

            <div className="ku-request-photos">
              <div className="ku-request-photos-label">
                {t("requestPhotosLabel")}
              </div>
              <ul className="ku-request-photo-slots">
                {slots.map((slot, index) => (
                  <li
                    key={slot.key}
                    className="ku-request-photo-slot"
                    data-status={slot.status}
                  >
                    {slot.previewUrl && (
                      <img
                        src={slot.previewUrl}
                        alt={`${t("requestPhotosLabel")} ${index + 1}`}
                      />
                    )}
                    <span className="ku-request-photo-status">
                      {slot.status === "converting" &&
                        t("requestPhotoConverting")}
                      {slot.status === "too_large" && t("requestPhotoTooLarge")}
                      {slot.status === "uploading" &&
                        t("requestPhotoUploading")}
                      {slot.status === "done" && t("requestPhotoDone")}
                      {slot.status === "failed" && t("requestPhotoFailed")}
                    </span>
                    {phase === "form" && (
                      <button
                        type="button"
                        aria-label={`${t("requestPhotoRemove")} ${index + 1}`}
                        onClick={() => removeSlot(slot.key)}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
                {phase === "form" && slots.length < MAX_FACILITY_PHOTOS && (
                  <li>
                    <label className="ku-request-photo-add">
                      <span>＋ {t("requestPhotoAdd")}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="ku-visually-hidden"
                        onChange={(event) => {
                          addFiles(event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </li>
                )}
              </ul>
              <p className="ku-request-photos-hint">{t("requestPhotosHint")}</p>
            </div>

            <input
              className="ku-visually-hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              name="website"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />

            {phase === "form" && (
              <TurnstileWidget
                key={widgetKey}
                siteKey={siteKey}
                onToken={setToken}
                onExpire={() => setToken(null)}
              />
            )}

            {errorKey && (
              <p role="alert" className="ku-request-modal-error">
                {t(errorKey)}
              </p>
            )}

            <div className="ku-request-modal-actions">
              <button
                type="button"
                onClick={onClose}
                disabled={phase === "sending"}
              >
                {t("closeLabel")}
              </button>
              {phase === "retry" ? (
                <button
                  type="button"
                  className="ku-request-modal-primary"
                  onClick={() => void uploadPending()}
                >
                  {t("requestRetryPhotos")}
                </button>
              ) : (
                <button
                  type="button"
                  className="ku-request-modal-primary"
                  onClick={() => void submit()}
                  disabled={busy || converting || !token}
                >
                  {busy ? t("requestSubmitting") : t("requestSubmit")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
```

실패한 사진이 남으면 `phase`가 `"retry"`가 되어 `실패한 사진 다시 올리기` 버튼이 보인다. 토큰 만료(`token`)나 검토 시작(`closed`)이면 더 올릴 수 없으므로 안내 문구와 함께 완료 화면으로 간다.

`<img>`는 `@next/next/no-img-element` 규칙 대상이다. `npm run lint`가 경고만 내면 그대로 두고(새로 생긴 경고로 PR에 적는다), 오류면 `next/image`에 `unoptimized`와 `width`/`height`를 줘 바꾼다(`blob:` 주소는 `unoptimized`면 동작한다). 규칙 비활성 주석은 쓰지 않는다. 같은 기준을 Task 17·18·20의 `<img>`에도 쓴다.

- [ ] **Step 6: 사이드패널 버튼** — `SidePanel.tsx`:

```tsx
import FacilityRequestModal from "@/components/sidepanel/FacilityRequestModal";
import { getPolygonRingCenter } from "@/lib/polygonCenter";
import type { Feature, Polygon } from "geojson";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
```

컴포넌트 안: `const [requestOpen, setRequestOpen] = useState(false);`. `<FacilityList ... />` 바로 아래:

```tsx
{
  /* 사이트 키가 없으면 버튼을 숨긴다 — 배포와 환경 변수 등록 순서가 어긋나도 실패하는 버튼이 보이지 않는다(설계 3.6). */
}
{
  TURNSTILE_SITE_KEY && !loading && (
    <div className="ku-request-entry">
      <button
        type="button"
        className="ku-request-entry-button"
        onClick={() => setRequestOpen(true)}
      >
        {t("requestButton")}
      </button>
    </div>
  );
}
{
  requestOpen && (
    <FacilityRequestModal
      buildingId={buildingId}
      buildingName={displayName}
      mapCenter={getPolygonRingCenter(
        (building?.geojson as unknown as Feature<Polygon> | null) ?? null,
      )}
      siteKey={TURNSTILE_SITE_KEY}
      lang={lang}
      t={t}
      onClose={() => setRequestOpen(false)}
    />
  );
}
```

- [ ] **Step 7: 스타일** — `map-ui.css` 끝에 공개 화면 토큰으로:

```css
.ku-request-entry {
  padding: 12px 20px 20px;
}
.ku-request-entry-button {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--ku-primary);
  border-radius: 8px;
  background: var(--ku-surface);
  color: var(--ku-primary-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.ku-request-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ku-backdrop);
}
.ku-request-modal {
  width: min(480px, calc(100vw - 32px));
  max-height: 90vh;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 20px;
  border-radius: 12px;
  background: var(--ku-surface);
  color: var(--ku-text-1);
  box-shadow: var(--ku-shadow-overlay);
}
.ku-request-modal input,
.ku-request-modal select {
  border-color: var(--ku-border-input) !important;
  background: var(--ku-surface);
  color: var(--ku-text-1);
}
.ku-request-modal label,
.ku-request-modal-subtitle,
.ku-request-photos-hint {
  color: var(--ku-text-2) !important;
}
.ku-request-modal-title {
  margin: 0;
  font-size: 17px;
}
.ku-request-modal-subtitle {
  margin: 4px 0 8px;
  font-size: 12px;
}
.ku-request-photo-slots {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}
.ku-request-photo-slot {
  position: relative;
  width: 72px;
  height: 72px;
  overflow: hidden;
  border: 1px solid var(--ku-border);
  border-radius: 8px;
}
.ku-request-photo-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ku-request-photo-slot[data-status="too_large"],
.ku-request-photo-slot[data-status="failed"] {
  border-color: var(--ku-danger);
}
.ku-request-photo-status {
  position: absolute;
  inset: auto 0 0;
  padding: 1px 3px;
  background: var(--ku-overlay);
  color: #fff;
  font-size: 10px;
}
.ku-request-photo-slot button {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 50%;
  background: var(--ku-overlay);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
}
.ku-request-photo-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border: 1.5px dashed var(--ku-border-input);
  border-radius: 8px;
  color: var(--ku-text-2);
  font-size: 11px;
  text-align: center;
  cursor: pointer;
}
.ku-request-photos-hint {
  margin: 6px 0 12px;
  font-size: 12px;
}
.ku-request-modal-error {
  color: var(--ku-danger);
  font-size: 13px;
}
.ku-request-modal-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.ku-request-modal-actions button {
  flex: 1;
  min-height: 44px;
  border: 1px solid var(--ku-border);
  border-radius: 8px;
  background: var(--ku-surface);
  color: var(--ku-text-1);
  cursor: pointer;
}
.ku-request-modal-primary {
  border-color: var(--ku-primary) !important;
  background: var(--ku-primary) !important;
  color: #fff !important;
}
.ku-request-modal-primary:disabled {
  background: var(--ku-primary-disabled) !important;
  border-color: var(--ku-primary-disabled) !important;
}
@media (max-width: 767px) {
  .ku-request-modal {
    width: 100vw;
    max-height: 100dvh;
    height: 100dvh;
    border-radius: 0;
  }
}
```

`FacilityFields`의 인라인 `color: "#555"` 라벨·`#ddd` 테두리는 공개 다크 모드에서 위 `!important` 규칙이 덮는다. 다크 모드 화면을 Step 9에서 눈으로 확인한다.

- [ ] **Step 8: 목 백엔드·Playwright 환경과 E2E**

`playwright.config.ts`의 `webServer.env`에 `NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA"`(Cloudflare 시험 키)를 더한다.

`e2e/support/mockBackend.ts` 전역 라우트(`/storage/` 분기 근처)에:

```ts
if (url.hostname === "challenges.cloudflare.com") {
  // 실제 위젯 대신 즉시 토큰을 주는 대역.
  return route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: `window.turnstile = { render(el, o) { setTimeout(() => o.callback("e2e-turnstile-token"), 0); return "w1"; }, remove() {} };`,
  });
}
```

`handleApi`에 요청 생성·사진 업로드 대역(상태에 기록):

```ts
if (path === "/api/facility-requests" && route.request().method() === "POST") {
  const body = route.request().postDataJSON() as {
    buildingId: number;
    fields: Row;
    turnstileToken: string;
  };
  const id = `00000000-0000-4000-8000-${String(state.facilityRequests.length + 1).padStart(12, "0")}`;
  state.facilityRequests.push({
    id,
    building_id: body.buildingId,
    ...body.fields,
    status: "new",
    created_at: "2026-10-08T00:00:00Z",
    reviewed_at: null,
    facility_id: null,
    turnstile_token: body.turnstileToken,
  });
  return json(route, { id, uploadToken: `${id}.9999999999999.sig` }, 201);
}
const photoUpload = path.match(/^\/api\/facility-requests\/([^/]+)\/photos$/);
if (photoUpload) {
  const requestId = photoUpload[1];
  const count = state.facilityRequestPhotos.filter(
    (photo) => photo.request_id === requestId,
  ).length;
  if (count >= 3) return json(route, { error: "full" }, 409);
  const photoId = `rp-${state.facilityRequestPhotos.length + 1}`;
  state.facilityRequestPhotos.push({
    id: photoId,
    request_id: requestId,
    storage_path: `${requestId}/${photoId}.webp`,
    sort_order: count,
  });
  return json(route, { id: photoId }, 201);
}
```

`e2e/facility-request.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 1x1 PNG. 브라우저가 WebP로 바꿔 올린다.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function openLibrary(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
  await page.getByText("중앙도서관", { exact: true }).last().click();
}

test.describe("시설 등록 요청", () => {
  test("사이드패널에서 유형·층·사진을 넣어 보내면 요청과 사진이 접수된다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    await openLibrary(page);

    await page.getByRole("button", { name: "시설 등록 요청" }).click();
    const dialog = page.getByRole("dialog", { name: "시설 등록 요청" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "사진은 최대 3장, 장당 4MB까지 올릴 수 있어요",
    );

    await dialog.getByLabel("시설 유형 *").selectOption("elevator");
    await dialog.getByLabel("층 (선택)").fill("3층");
    await dialog.locator('input[type="file"]').setInputFiles([
      { name: "a.png", mimeType: "image/png", buffer: PNG },
      { name: "b.png", mimeType: "image/png", buffer: PNG },
    ]);
    await expect(
      dialog.locator('.ku-request-photo-slot[data-status="ready"]'),
    ).toHaveCount(2);

    const submit = dialog.getByRole("button", { name: "요청 보내기" });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(dialog.getByRole("status")).toContainText("요청을 보냈어요");
    expect(state.facilityRequests).toHaveLength(1);
    expect(state.facilityRequests[0]).toMatchObject({
      building_id: 1,
      facility_code: "elevator",
      floor_info: "3층",
      turnstile_token: "e2e-turnstile-token",
    });
    expect(state.facilityRequestPhotos).toHaveLength(2);
  });

  test("유형을 고르지 않으면 보내지 않고 안내한다", async ({ page }) => {
    const state = await installMockBackend(page);
    await openLibrary(page);
    await page.getByRole("button", { name: "시설 등록 요청" }).click();
    const dialog = page.getByRole("dialog", { name: "시설 등록 요청" });
    await dialog.getByRole("button", { name: "요청 보내기" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "시설 유형을 골라 주세요",
    );
    expect(state.facilityRequests).toHaveLength(0);
  });

  test("빈도 초과 응답을 번역 문구로 보이고 다시 보낼 수 있게 한다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.route("**/api/facility-requests", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 429,
            contentType: "application/json",
            body: '{"error":"rate_limited"}',
          })
        : route.fallback(),
    );
    await openLibrary(page);
    await page.getByRole("button", { name: "시설 등록 요청" }).click();
    const dialog = page.getByRole("dialog", { name: "시설 등록 요청" });
    await dialog.getByLabel("시설 유형 *").selectOption("elevator");
    await dialog.getByRole("button", { name: "요청 보내기" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "요청이 많아요. 잠시 후 다시 시도해 주세요",
    );
    await expect(
      dialog.getByRole("button", { name: "요청 보내기" }),
    ).toBeEnabled();
  });
});
```

Run: `npx playwright test e2e/facility-request.spec.ts` / Expected: PASS. 3100 포트에 이전 dev 서버가 떠 있으면 끄고 돌린다(환경 변수가 바뀌었다).

- [ ] **Step 9: 눈으로 확인** — 임시 스펙으로 모달을 데스크톱·375px·다크 모드에서 스크린샷으로 보고 지운다(`page.emulateMedia({ colorScheme: "dark" })`). 라벨·입력란이 다크 배경에서 읽히는지, 휴대폰에서 전체 화면인지 본다.

- [ ] **Step 10: 확인과 커밋** — Run: `npm run typecheck && npm run lint && npx vitest run src/lib/facilityRequestClient.test.ts && npx playwright test e2e/facility-request.spec.ts e2e/public-map.spec.ts` / Expected: PASS.

```bash
git add src/components/TurnstileWidget.tsx src/lib/facilityRequestClient.ts src/lib/facilityRequestClient.test.ts src/components/sidepanel/FacilityRequestModal.tsx src/components/SidePanel.tsx src/lib/translations.ts src/components/map/map-ui.css playwright.config.ts e2e/support/mockBackend.ts e2e/facility-request.spec.ts
git commit -m "feat(sidepanel): 학생이 건물 사이드패널에서 시설 등록을 요청하는 모달을 단다"
```

### Task 17: 제보함 페이지·메뉴 배지·요청 목록

**Files:**

- Create: `src/app/admin/dashboard/inbox/page.tsx`, `src/components/admin/inbox/InboxFilterSelect.tsx`, `src/components/admin/inbox/FacilityRequestList.tsx`, `e2e/admin-inbox.spec.ts`
- Modify: `src/app/admin/dashboard/layout.tsx`, `src/app/admin/admin-ui.css`, `e2e/support/mockBackend.ts`, `e2e/admin-dark.spec.ts`

**Interfaces:**

- Consumes: Task 8의 API·타입, `AdminPagination`, `authedFetch`.
- Produces: 화면 이벤트 `window.dispatchEvent(new Event("inboxCountsChanged"))` — 처리한 뒤 메뉴 배지를 다시 읽게 한다. `FacilityRequestList` props `{ building: number | null; onClearBuilding(): void; typeLabels: Map<string, string>; onOpen(id: string): void; refreshKey: number }`. 다음 태스크가 `onOpen`에 검토 모달을 붙인다.

- [ ] **Step 1: 목 백엔드** — `handleApi`에 관리자 조회 대역. 상태 매핑은 운영 코드를 import하지 않고 따로 적는다(같은 함수로 기대값을 만들면 둘이 함께 틀려도 통과한다).

```ts
const REQUEST_FILTER: Record<string, string[] | null> = {
  open: ["new", "reviewing"],
  new: ["new"],
  reviewing: ["reviewing"],
  done: ["approved", "rejected"],
  all: null,
};
if (path === "/api/facility-requests" && route.request().method() === "GET") {
  const statuses =
    REQUEST_FILTER[url.searchParams.get("status") ?? "open"] ?? null;
  const building = Number(url.searchParams.get("building"));
  const items = state.facilityRequests
    .filter((row) => !statuses || statuses.includes(String(row.status)))
    .filter((row) => !building || row.building_id === building)
    .map((row) => {
      const photos = state.facilityRequestPhotos.filter(
        (photo) => photo.request_id === row.id,
      );
      return {
        id: row.id,
        building_id: row.building_id,
        building_name:
          state.buildings.find((b) => b.id === row.building_id)?.name ?? null,
        facility_code: row.facility_code,
        name: row.name ?? null,
        floor_info: row.floor_info ?? null,
        has_location: row.lat != null && row.lng != null,
        status: row.status,
        created_at: row.created_at,
        facility_id: row.facility_id ?? null,
        photo_count: photos.length,
        thumbnail_url: photos.length
          ? "https://cdn.test/request-thumb.webp"
          : null,
      };
    });
  return json(route, { items, total: items.length });
}
if (path === "/api/inbox-counts") {
  return json(route, {
    requests: state.facilityRequests.filter((row) => row.status === "new")
      .length,
    feedback: state.feedbackSubmissions.filter(
      (row) => (row.status ?? "new") === "new",
    ).length,
  });
}
```

- [ ] **Step 2: 실패하는 E2E** — `e2e/admin-inbox.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

function seedRequests(state: MockState) {
  const base = {
    building_id: 1,
    name: null,
    description: null,
    lat: null,
    lng: null,
    created_at: "2026-10-08T00:00:00Z",
    reviewed_at: null,
    facility_id: null,
  };
  state.facilityRequests.push(
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000001",
      facility_code: "elevator",
      floor_info: "3층",
      status: "new",
      lat: 37.5894,
      lng: 127.0325,
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000002",
      facility_code: "ramp",
      floor_info: "1층",
      status: "reviewing",
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000003",
      facility_code: "elevator",
      floor_info: "2층",
      status: "rejected",
    },
  );
  state.facilityRequestPhotos.push(
    {
      id: "rp-1",
      request_id: "00000000-0000-4000-8000-000000000001",
      storage_path: "x/1.webp",
      sort_order: 0,
    },
    {
      id: "rp-2",
      request_id: "00000000-0000-4000-8000-000000000001",
      storage_path: "x/2.webp",
      sort_order: 1,
    },
  );
}

async function openInbox(page: Page) {
  await page.goto("/admin/dashboard/inbox");
  return page.getByRole("list", { name: "등록 요청 목록" });
}

test.describe("제보함 — 등록 요청 목록", () => {
  test("메뉴 배지는 신규 수, 기본 목록은 신규·확인 중이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);

    await expect(
      page
        .getByRole("navigation", { name: "관리자 메뉴" })
        .getByRole("link", { name: /제보함/ }),
    ).toContainText("1");
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").first()).toContainText(
      "엘리베이터",
    );
    await expect(list.getByRole("listitem").first()).toContainText("사진 2");
    await expect(list.getByRole("listitem").first()).toContainText("신규");
  });

  test("상태 필터로 처리 완료와 전체를 본다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);
    const filter = page.getByRole("combobox", { name: "상태 필터" });

    await filter.selectOption("done");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("listitem")).toContainText("거절됨");
    await filter.selectOption("all");
    await expect(list.getByRole("listitem")).toHaveCount(3);
  });

  test("?building으로 열면 그 건물 요청만 보이고 해제할 수 있다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    state.facilityRequests[1].building_id = 2;
    await page.goto("/admin/dashboard/inbox?building=1");
    const list = page.getByRole("list", { name: "등록 요청 목록" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: "건물 필터 해제" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(2);
  });
});
```

Run: `npx playwright test e2e/admin-inbox.spec.ts` / Expected: FAIL(페이지 없음).

- [ ] **Step 3: 메뉴와 배지** — `layout.tsx`:

```tsx
import { authedFetch } from "@/lib/authedFetch";

const INBOX_HREF = "/admin/dashboard/inbox";
const NAV = [
  { label: "건물", href: "/admin/dashboard/buildings" },
  { label: "독립 시설", href: "/admin/dashboard/facilities" },
  { label: "명소", href: "/admin/dashboard/landmarks" },
  { label: "경사도", href: "/admin/dashboard/slopes" },
  { label: "제보함", href: INBOX_HREF },
];
```

컴포넌트 안:

```tsx
const [inboxCount, setInboxCount] = useState(0);

useEffect(() => {
  let cancelled = false;
  async function loadCounts() {
    const response = await authedFetch("/api/inbox-counts").catch(() => null);
    if (!response?.ok || cancelled) return;
    const body = (await response.json()) as {
      requests: number;
      feedback: number;
    };
    if (!cancelled) setInboxCount(body.requests + body.feedback);
  }
  const timer = window.setTimeout(() => void loadCounts(), 0);
  const refresh = () => void loadCounts();
  window.addEventListener("inboxCountsChanged", refresh);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    window.removeEventListener("inboxCountsChanged", refresh);
  };
}, [pathname]);
```

메뉴 링크 안 `{item.label}` 뒤:

```tsx
{
  item.href === INBOX_HREF && inboxCount > 0 && (
    <span className="ku-admin-nav-badge" aria-label={`신규 ${inboxCount}건`}>
      {inboxCount}
    </span>
  );
}
```

`admin-ui.css`:

```css
.ku-admin-nav-badge {
  display: inline-block;
  min-width: 18px;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--ku-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
```

- [ ] **Step 4: 필터와 목록**

`src/components/admin/inbox/InboxFilterSelect.tsx`:

```tsx
import { INBOX_FILTERS, type InboxFilter } from "@/lib/inboxStatus";

export default function InboxFilterSelect({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (next: InboxFilter) => void;
}) {
  return (
    <select
      aria-label="상태 필터"
      value={value}
      onChange={(event) => onChange(event.target.value as InboxFilter)}
    >
      {INBOX_FILTERS.map((filter) => (
        <option key={filter.value} value={filter.value}>
          {filter.label}
        </option>
      ))}
    </select>
  );
}
```

`src/components/admin/inbox/FacilityRequestList.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import AdminPagination from "@/components/admin/AdminPagination";
import InboxFilterSelect from "@/components/admin/inbox/InboxFilterSelect";
import { authedFetch } from "@/lib/authedFetch";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import {
  REQUEST_STATUS_LABELS,
  type FacilityRequestListItem,
  type InboxFilter,
} from "@/lib/inboxStatus";

interface FacilityRequestListProps {
  building: number | null;
  onClearBuilding: () => void;
  typeLabels: Map<string, string>;
  onOpen: (id: string) => void;
  refreshKey: number;
}

export default function FacilityRequestList({
  building,
  onClearBuilding,
  typeLabels,
  onOpen,
  refreshKey,
}: FacilityRequestListProps) {
  const [filter, setFilter] = useState<InboxFilter>("open");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FacilityRequestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ status: filter, page: String(page) });
    if (building) params.set("building", String(building));
    const timer = window.setTimeout(async () => {
      const response = await authedFetch(
        `/api/facility-requests?${params}`,
      ).catch(() => null);
      if (cancelled) return;
      if (!response?.ok) {
        setState("error");
        return;
      }
      const body = (await response.json()) as {
        items: FacilityRequestListItem[];
        total: number;
      };
      if (cancelled) return;
      setItems(body.items);
      setTotal(body.total);
      setState("ready");
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filter, page, building, refreshKey]);

  return (
    <section aria-label="등록 요청">
      <div className="ku-admin-list-controls">
        <InboxFilterSelect
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setPage(1);
          }}
        />
        {building && (
          <button
            type="button"
            className="ku-admin-list-reset"
            aria-label="건물 필터 해제"
            onClick={onClearBuilding}
          >
            건물로 거름 ✕
          </button>
        )}
      </div>
      {state === "loading" ? (
        <div className="ku-admin-empty">불러오는 중...</div>
      ) : state === "error" ? (
        <div className="ku-admin-empty">목록을 불러오지 못했어요.</div>
      ) : items.length === 0 ? (
        <div className="ku-admin-empty">요청이 없어요.</div>
      ) : (
        <ul className="ku-inbox-list" aria-label="등록 요청 목록">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="ku-inbox-row"
                onClick={() => onOpen(item.id)}
              >
                {item.thumbnail_url ? (
                  <img
                    className="ku-inbox-thumb"
                    src={item.thumbnail_url}
                    alt=""
                  />
                ) : (
                  <span
                    className="ku-inbox-thumb ku-inbox-thumb--empty"
                    aria-hidden="true"
                  />
                )}
                <span className="ku-inbox-row-main">
                  <strong>
                    {typeLabels.get(item.facility_code) ?? item.facility_code}
                  </strong>
                  {" · "}
                  {item.building_name ?? `건물 ${item.building_id}`}
                  {item.floor_info ? ` ${item.floor_info}` : ""}
                  <span className="ku-inbox-row-meta">
                    사진 {item.photo_count} ·{" "}
                    {item.has_location ? "위치 있음" : "위치 없음"} ·{" "}
                    {formatAdminUpdatedAt(item.created_at)}
                  </span>
                </span>
                <span className="ku-inbox-status" data-status={item.status}>
                  {REQUEST_STATUS_LABELS[item.status]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <AdminPagination page={page} totalCount={total} onPageChange={setPage} />
    </section>
  );
}
```

썸네일 `<img>`는 Task 16 Step 5와 같은 기준으로 처리한다.

`src/app/admin/dashboard/inbox/page.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import FacilityRequestList from "@/components/admin/inbox/FacilityRequestList";
import { supabase } from "@/lib/supabaseClient";

type Tab = "requests" | "feedback";

export default function InboxPage() {
  const [tab, setTab] = useState<Tab>("requests");
  const [building, setBuilding] = useState<number | null>(null);
  const [types, setTypes] = useState<{ code: string; label: string | null }[]>(
    [],
  );
  const [, setOpenId] = useState<string | null>(null);
  const [refreshKey] = useState(0);

  useEffect(() => {
    // useSearchParams는 Suspense 경계를 요구한다. 다른 관리자 화면처럼 location에서 읽는다.
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setTab(params.get("tab") === "feedback" ? "feedback" : "requests");
      const id = Number(params.get("building"));
      setBuilding(Number.isSafeInteger(id) && id > 0 ? id : null);
    }, 0);
    void supabase
      .from("facility_types")
      .select("code, label")
      .then(({ data }) => setTypes(data ?? []));
    return () => window.clearTimeout(timer);
  }, []);

  const typeLabels = useMemo(
    () => new Map(types.map((type) => [type.code, type.label ?? type.code])),
    [types],
  );

  function switchTab(next: Tab) {
    setTab(next);
    setBuilding(null);
    window.history.replaceState(
      null,
      "",
      next === "feedback" ? "?tab=feedback" : window.location.pathname,
    );
  }

  return (
    <div className="ku-admin-main">
      <div className="ku-admin-page-heading">
        <h1 className="ku-admin-title">제보함</h1>
      </div>
      <div className="ku-inbox-tabs" role="tablist" aria-label="제보 종류">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "requests"}
          onClick={() => switchTab("requests")}
        >
          등록 요청
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "feedback"}
          onClick={() => switchTab("feedback")}
        >
          피드백
        </button>
      </div>
      {tab === "requests" ? (
        <FacilityRequestList
          building={building}
          onClearBuilding={() => {
            setBuilding(null);
            window.history.replaceState(null, "", window.location.pathname);
          }}
          typeLabels={typeLabels}
          onOpen={setOpenId}
          refreshKey={refreshKey}
        />
      ) : null}
    </div>
  );
}
```

`openId` 값과 `setRefreshKey`는 Task 18에서 꺼내 쓴다(그때 `const [openId, setOpenId]`, `const [refreshKey, setRefreshKey]`로 바꾼다). 피드백 탭 내용은 Task 19가 `: null` 자리에 넣는다.

`admin-ui.css`:

```css
.ku-inbox-tabs {
  display: inline-flex;
  margin-bottom: 12px;
  overflow: hidden;
  border: 1px solid var(--ku-border);
  border-radius: 8px;
}
.ku-inbox-tabs button {
  padding: 7px 14px;
  border: 0;
  background: var(--ku-surface);
  color: var(--ku-text-2);
  cursor: pointer;
}
.ku-inbox-tabs button[aria-selected="true"] {
  background: var(--ku-text-1);
  color: var(--ku-surface);
}
.ku-inbox-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.ku-inbox-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 4px;
  border: 0;
  border-bottom: 1px solid var(--ku-border);
  background: none;
  color: var(--ku-text-1);
  text-align: left;
  cursor: pointer;
}
.ku-inbox-thumb {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
}
.ku-inbox-thumb--empty {
  background: var(--ku-surface-raised);
}
.ku-inbox-row-main {
  flex: 1;
  min-width: 0;
}
.ku-inbox-row-meta {
  display: block;
  color: var(--ku-text-3);
  font-size: 12px;
}
.ku-inbox-status {
  padding: 2px 8px;
  border-radius: 9px;
  font-size: 11px;
  white-space: nowrap;
  background: var(--ku-status-warn-bg);
  color: var(--ku-status-warn-fg);
}
.ku-inbox-status[data-status="approved"],
.ku-inbox-status[data-status="resolved"] {
  background: var(--ku-success-bg);
  color: var(--ku-success-fg);
}
.ku-inbox-status[data-status="rejected"] {
  background: var(--ku-status-missing-bg);
  color: var(--ku-status-missing-fg);
}
```

`e2e/admin-dark.spec.ts`의 `SCREENS`에 `{ name: "제보함", path: "/admin/dashboard/inbox" }`를 더한다.

- [ ] **Step 5: 확인** — Run: `npm run typecheck && npm run lint && npx playwright test e2e/admin-inbox.spec.ts e2e/admin-dark.spec.ts` / Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/app/admin/dashboard/inbox src/components/admin/inbox src/app/admin/dashboard/layout.tsx src/app/admin/admin-ui.css e2e/support/mockBackend.ts e2e/admin-inbox.spec.ts e2e/admin-dark.spec.ts
git commit -m "feat(inbox): 관리자 제보함 메뉴와 등록 요청 목록을 둔다"
```

### Task 18: 검토 모달 — 수정·승인·거절·상태 표시·남은 사진 정리

**Files:**

- Create: `src/components/admin/inbox/FacilityRequestReviewModal.tsx`
- Modify: `src/app/admin/dashboard/inbox/page.tsx`, `e2e/support/mockBackend.ts`, `e2e/admin-inbox.spec.ts`

**Interfaces:**

- Consumes: Task 8·9·10 API, `FacilityFields`·`ADMIN_FACILITY_FIELD_LABELS`(Task 14), `translateFacility`, `ConfirmModal`, `Toast`, `getPolygonRingCenter`.
- Produces: `FacilityRequestReviewModal` props `{ requestId: string; facilityTypes: { code: string; label: string }[]; onClose(): void; onChanged(): void; showToast(message: string, type?: string): void }`.

- [ ] **Step 1: 목 백엔드** — `handleApi`에 상세·상태·거절·정리·승인 대역:

```ts
const requestAction = path.match(
  /^\/api\/facility-requests\/([^/]+)(?:\/(status|reject|cleanup|approve))?$/,
);
if (requestAction && !path.endsWith("/photos")) {
  const [, requestId, action] = requestAction;
  const row = state.facilityRequests.find((item) => item.id === requestId);
  if (!row) return json(route, { error: "요청이 없어요" }, 404);
  const photos = () =>
    state.facilityRequestPhotos.filter(
      (photo) => photo.request_id === requestId,
    );
  const removePhotos = () => {
    state.facilityRequestPhotos = state.facilityRequestPhotos.filter(
      (photo) => photo.request_id !== requestId,
    );
  };
  const open = row.status === "new" || row.status === "reviewing";
  if (!action) {
    const building = state.buildings.find(
      (item) => item.id === row.building_id,
    );
    return json(route, {
      ...row,
      building: building
        ? { id: building.id, name: building.name, geojson: building.geojson }
        : null,
      photos: photos().map((photo) => ({
        id: photo.id,
        sort_order: photo.sort_order,
        url: `https://cdn.test/${photo.id}.webp`,
      })),
    });
  }
  if (action === "status") {
    const { status } = route.request().postDataJSON() as { status: string };
    const from = status === "reviewing" ? "new" : "reviewing";
    if (row.status !== from)
      return json(
        route,
        { error: "이미 처리됐거나 상태가 바뀐 요청이에요" },
        409,
      );
    row.status = status;
    return json(route, { status });
  }
  if (action === "reject") {
    if (!open) return json(route, { error: "이미 처리된 요청이에요" }, 409);
    row.status = "rejected";
    removePhotos();
    return json(route, { ok: true, cleanupFailed: false });
  }
  if (action === "cleanup") {
    removePhotos();
    return json(route, { ok: true });
  }
  if (action === "approve") {
    if (!open) return json(route, { error: "이미 처리된 요청이에요" }, 409);
    const { fields, photoIds } = route.request().postDataJSON() as {
      fields: Row;
      photoIds: string[];
    };
    const facilityId = `f-approved-${requestId.slice(-4)}`;
    state.facilities.push({
      id: facilityId,
      building_id: row.building_id,
      ...fields,
      translation_status: "pending",
      facility_types:
        types.find((type) => type.code === fields.facility_code) ?? null,
      created_at: "2026-10-08T00:00:00Z",
      updated_at: "2026-10-08T00:00:00Z",
    });
    photoIds.forEach((photoId, index) =>
      state.facilityPhotos.push({
        id: `fp-${photoId}`,
        facility_id: facilityId,
        storage_path: `${facilityId}/${photoId}.webp`,
        sort_order: index,
      }),
    );
    row.status = "approved";
    row.facility_id = facilityId;
    removePhotos();
    return json(route, { facilityId, cleanupFailed: false });
  }
}
```

`MockState`의 `facilityRequestPhotos`를 다시 대입하므로 `state`를 `const` 객체의 속성으로 갖고 있는지(재대입 가능) 확인한다. 이 블록은 Task 17의 목록 대역(`GET /api/facility-requests`)보다 **아래**에 둔다 — 정규식이 경로 `/api/facility-requests`에도 맞는다(`id` 자리가 비면 맞지 않도록 `([^/]+)`가 요구하므로 실제로는 맞지 않지만, 순서를 지키면 확실하다).

- [ ] **Step 2: 실패하는 E2E** — `e2e/admin-inbox.spec.ts`에 추가:

```ts
test.describe("제보함 — 검토 모달", () => {
  test("층을 고치고 사진 하나를 빼고 승인하면 그 값으로 시설이 생기고 목록에서 빠진다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);

    await list.getByRole("listitem").first().getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: /등록 요청/ });
    await expect(dialog.getByLabel("시설 유형 *")).toHaveValue("elevator");
    await dialog.getByLabel("층 정보 (선택)").fill("4층");
    await dialog.getByRole("checkbox", { name: "사진 2 공개" }).uncheck();
    await dialog.getByRole("button", { name: "승인하고 등록" }).click();

    await expect(dialog).toBeHidden();
    const created = state.facilities.find((facility) =>
      String(facility.id).startsWith("f-approved"),
    );
    expect(created).toMatchObject({
      building_id: 1,
      facility_code: "elevator",
      floor_info: "4층",
    });
    expect(
      state.facilityPhotos.filter((photo) => photo.facility_id === created!.id),
    ).toHaveLength(1);
    await expect(list.getByRole("listitem")).toHaveCount(1);
  });

  test("확인 중으로 표시하고 되돌린다 — 모달은 열린 채다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);
    await list.getByRole("listitem").first().getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: /등록 요청/ });

    await dialog.getByRole("button", { name: "확인 중으로 표시" }).click();
    await expect(
      dialog.getByRole("button", { name: "신규로 되돌리기" }),
    ).toBeVisible();
    expect(state.facilityRequests[0].status).toBe("reviewing");
    await dialog.getByRole("button", { name: "신규로 되돌리기" }).click();
    await expect(
      dialog.getByRole("button", { name: "확인 중으로 표시" }),
    ).toBeVisible();
    expect(state.facilityRequests[0].status).toBe("new");
  });

  test("거절은 확인을 거치고, 거절된 요청은 읽기 전용으로 열린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);
    await list.getByRole("listitem").first().getByRole("button").click();
    await page
      .getByRole("dialog", { name: /등록 요청/ })
      .getByRole("button", { name: "거절" })
      .click();
    await page
      .getByRole("dialog", { name: "이 요청을 거절할까요?" })
      .getByRole("button", { name: "거절" })
      .click();

    expect(state.facilityRequests[0].status).toBe("rejected");
    expect(
      state.facilityRequestPhotos.filter(
        (p) => p.request_id === state.facilityRequests[0].id,
      ),
    ).toHaveLength(0);

    await page
      .getByRole("combobox", { name: "상태 필터" })
      .selectOption("done");
    await list.getByRole("listitem").first().getByRole("button").click();
    const readOnly = page.getByRole("dialog", { name: /등록 요청/ });
    await expect(readOnly.getByLabel("시설 유형 *")).toBeDisabled();
    await expect(
      readOnly.getByRole("button", { name: "승인하고 등록" }),
    ).toHaveCount(0);
  });

  test("다른 관리자가 먼저 처리했으면(409) 안내하고 목록을 다시 읽는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);
    await list.getByRole("listitem").first().getByRole("button").click();
    state.facilityRequests[0].status = "approved";
    await page
      .getByRole("dialog", { name: /등록 요청/ })
      .getByRole("button", { name: "승인하고 등록" })
      .click();
    await expect(page.getByText("이미 처리된 요청이에요")).toBeVisible();
  });
});
```

Run: `npx playwright test e2e/admin-inbox.spec.ts` / Expected: 새 테스트 FAIL.

- [ ] **Step 3: 모달** — `src/components/admin/inbox/FacilityRequestReviewModal.tsx`:

```tsx
"use client";

import { useEffect, useId, useState } from "react";
import type { Feature, Polygon } from "geojson";
import ConfirmModal from "@/components/ConfirmModal";
import FacilityFields, {
  ADMIN_FACILITY_FIELD_LABELS,
} from "@/components/facility/FacilityFields";
import { authedFetch } from "@/lib/authedFetch";
import {
  EMPTY_FACILITY_FIELDS,
  type FacilityFieldValues,
} from "@/lib/facilityFields";
import { translateFacility } from "@/lib/facilityTranslation";
import {
  REQUEST_STATUS_LABELS,
  isEndStatus,
  type FacilityRequestDetail,
} from "@/lib/inboxStatus";
import { getPolygonRingCenter } from "@/lib/polygonCenter";
import { useModalFocus } from "@/lib/useModalFocus";

interface FacilityRequestReviewModalProps {
  requestId: string;
  facilityTypes: { code: string; label: string }[];
  onClose: () => void;
  onChanged: () => void;
  showToast: (message: string, type?: string) => void;
}

function toFields(detail: FacilityRequestDetail): FacilityFieldValues {
  return {
    ...EMPTY_FACILITY_FIELDS,
    facility_code: detail.facility_code,
    name: detail.name ?? "",
    description: detail.description ?? "",
    floor_info: detail.floor_info ?? "",
    lat: detail.lat != null ? String(detail.lat) : "",
    lng: detail.lng != null ? String(detail.lng) : "",
  };
}

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === "string" ? body.error : fallback;
}

export default function FacilityRequestReviewModal({
  requestId,
  facilityTypes,
  onClose,
  onChanged,
  showToast,
}: FacilityRequestReviewModalProps) {
  const titleId = useId();
  const fieldId = useId();
  const [detail, setDetail] = useState<FacilityRequestDetail | null>(null);
  const [fields, setFields] = useState<FacilityFieldValues>(
    EMPTY_FACILITY_FIELDS,
  );
  const [publish, setPublish] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose,
    closeOnEscape: !busy && !confirmReject,
  });

  useEffect(() => {
    let cancelled = false;
    void authedFetch(`/api/facility-requests/${requestId}`).then(
      async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          showToast(
            await readError(response, "요청을 불러오지 못했어요"),
            "error",
          );
          onClose();
          return;
        }
        const body = (await response.json()) as FacilityRequestDetail;
        if (cancelled) return;
        setDetail(body);
        setFields(toFields(body));
        setPublish(new Set(body.photos.map((photo) => photo.id)));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requestId, onClose, showToast]);

  const ended = detail ? isEndStatus(detail.status) : true;

  async function changeStatus(status: "new" | "reviewing") {
    setBusy(true);
    const response = await authedFetch(
      `/api/facility-requests/${requestId}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    setBusy(false);
    if (!response.ok) {
      showToast(await readError(response, "상태를 바꾸지 못했어요"), "error");
      onChanged();
      return;
    }
    setDetail((previous) => (previous ? { ...previous, status } : previous));
    onChanged();
  }

  async function approve() {
    if (!fields.facility_code) {
      showToast("시설 유형을 선택해주세요", "warning");
      return;
    }
    setBusy(true);
    const payload = {
      facility_code: fields.facility_code,
      name: fields.name,
      description: fields.description,
      floor_info: fields.floor_info,
      is_installed: fields.is_installed,
      lat: fields.lat ? Number(fields.lat) : null,
      lng: fields.lng ? Number(fields.lng) : null,
    };
    const photoIds = (detail?.photos ?? [])
      .filter((photo) => publish.has(photo.id))
      .map((photo) => photo.id);
    const response = await authedFetch(
      `/api/facility-requests/${requestId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: payload, photoIds }),
      },
    );
    if (!response.ok) {
      setBusy(false);
      showToast(await readError(response, "승인하지 못했어요"), "error");
      onChanged();
      return;
    }
    const { facilityId, cleanupFailed } = (await response.json()) as {
      facilityId: string;
      cleanupFailed: boolean;
    };
    const translated = await translateFacility({
      id: facilityId,
      name: payload.name || null,
      description: payload.description || null,
      floor_info: payload.floor_info || null,
    });
    await authedFetch("/api/revalidate-facilities", { method: "POST" }).catch(
      () => {},
    );
    setBusy(false);
    onChanged();
    onClose();
    showToast(
      !translated
        ? "등록했지만 자동 번역에 실패했어요. 건물 화면에서 재번역해 주세요."
        : cleanupFailed
          ? "등록했어요. 요청 사진 정리는 실패해 다시 해야 해요."
          : "등록했어요!",
      !translated || cleanupFailed ? "warning" : "success",
    );
  }

  async function reject() {
    setBusy(true);
    const response = await authedFetch(
      `/api/facility-requests/${requestId}/reject`,
      { method: "POST" },
    );
    setBusy(false);
    setConfirmReject(false);
    if (!response.ok) {
      showToast(await readError(response, "거절하지 못했어요"), "error");
      onChanged();
      return;
    }
    const { cleanupFailed } = (await response.json()) as {
      cleanupFailed: boolean;
    };
    onChanged();
    onClose();
    showToast(
      cleanupFailed ? "거절했지만 사진을 지우지 못했어요" : "거절했어요",
      cleanupFailed ? "warning" : "success",
    );
  }

  async function cleanup() {
    setBusy(true);
    const response = await authedFetch(
      `/api/facility-requests/${requestId}/cleanup`,
      { method: "POST" },
    );
    setBusy(false);
    if (!response.ok) {
      showToast(await readError(response, "사진을 지우지 못했어요"), "error");
      return;
    }
    setDetail((previous) =>
      previous ? { ...previous, photos: [] } : previous,
    );
    showToast("남은 사진을 정리했어요");
  }

  const center: [number, number] =
    detail?.lat != null && detail?.lng != null
      ? [detail.lat, detail.lng]
      : getPolygonRingCenter(
          (detail?.building?.geojson as Feature<Polygon> | null) ?? null,
        );

  return (
    <div
      ref={dialogRef}
      className="ku-facility-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="ku-facility-modal ku-review-modal">
        <div id={titleId} className="ku-review-modal-title">
          {facilityTypes.find((type) => type.code === detail?.facility_code)
            ?.label ?? "시설"}{" "}
          등록 요청
        </div>
        {detail && (
          <div className="ku-review-modal-meta">
            <span className="ku-inbox-status" data-status={detail.status}>
              {REQUEST_STATUS_LABELS[detail.status]}
            </span>
            <span>{detail.building?.name ?? `건물 ${detail.building_id}`}</span>
            {detail.facility_id && (
              <a href={`/admin/buildings/${detail.building_id}`}>
                만들어진 시설 보기
              </a>
            )}
          </div>
        )}

        {!detail ? (
          <div className="ku-admin-empty">불러오는 중...</div>
        ) : (
          <>
            {detail.photos.length > 0 && (
              <ul className="ku-review-photos" aria-label="요청 사진">
                {detail.photos.map((photo, index) => (
                  <li key={photo.id}>
                    {photo.url && (
                      <img src={photo.url} alt={`요청 사진 ${index + 1}`} />
                    )}
                    {!ended && (
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`사진 ${index + 1} 공개`}
                          checked={publish.has(photo.id)}
                          onChange={(event) =>
                            setPublish((previous) => {
                              const next = new Set(previous);
                              if (event.target.checked) next.add(photo.id);
                              else next.delete(photo.id);
                              return next;
                            })
                          }
                        />
                        공개
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <FacilityFields
              idPrefix={fieldId}
              value={fields}
              onChange={setFields}
              facilityTypes={facilityTypes}
              labels={ADMIN_FACILITY_FIELD_LABELS}
              mapCenter={center}
              highlightBuildingId={detail.building_id}
              showFloor
              showInstalled
              disabled={ended || busy}
            />

            <div className="ku-facility-modal-actions">
              {!ended && (
                <button
                  type="button"
                  className="ku-review-reject"
                  onClick={() => setConfirmReject(true)}
                  disabled={busy}
                >
                  거절
                </button>
              )}
              {!ended && (
                <button
                  type="button"
                  onClick={() =>
                    void changeStatus(
                      detail.status === "reviewing" ? "new" : "reviewing",
                    )
                  }
                  disabled={busy}
                >
                  {detail.status === "reviewing"
                    ? "신규로 되돌리기"
                    : "확인 중으로 표시"}
                </button>
              )}
              {ended && detail.photos.length > 0 && (
                <button
                  type="button"
                  onClick={() => void cleanup()}
                  disabled={busy}
                >
                  남은 사진 정리
                </button>
              )}
              <button type="button" onClick={onClose} disabled={busy}>
                닫기
              </button>
              {!ended && (
                <button
                  type="button"
                  className="ku-review-approve"
                  onClick={() => void approve()}
                  disabled={busy}
                >
                  승인하고 등록
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {confirmReject && (
        <ConfirmModal
          message="이 요청을 거절할까요?"
          description="요청 사진은 지워지고 요청은 거절됨으로 남아요."
          confirmLabel="거절"
          pending={busy}
          onConfirm={reject}
          onCancel={() => setConfirmReject(false)}
        />
      )}
    </div>
  );
}
```

E2E가 `getByRole("dialog", { name: "이 요청을 거절할까요?" })`로 찾으므로, `ConfirmModal`이 `message`를 다이얼로그 접근 이름(`aria-labelledby`)으로 쓰는지 확인한다. 아니면 E2E에서 `page.getByRole("dialog").filter({ hasText: "이 요청을 거절할까요?" })`로 바꾼다.

`page.tsx` — 상태 선언을 `const [openId, setOpenId]`, `const [refreshKey, setRefreshKey]`로 바꾸고 바깥 `</div>`를 닫기 직전에:

```tsx
{
  openId && (
    <FacilityRequestReviewModal
      requestId={openId}
      facilityTypes={types.map((type) => ({
        code: type.code,
        label: type.label ?? type.code,
      }))}
      onClose={closeModal}
      onChanged={refresh}
      showToast={showToast}
    />
  );
}
{
  toast && (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast(null)}
    />
  );
}
```

컴포넌트 안에 `const [toast, setToast] = useState<{ message: string; type: string } | null>(null);`, `const showToast = useCallback((message: string, type = "success") => setToast({ message, type }), []);`, `const closeModal = useCallback(() => setOpenId(null), []);`, `const refresh = useCallback(() => { setRefreshKey((key) => key + 1); window.dispatchEvent(new Event("inboxCountsChanged")); }, []);` — 모달 effect의 의존성에 `onClose`·`showToast`가 있으므로 `useCallback`으로 고정해야 상세를 반복해 불러오지 않는다.

`admin-ui.css`:

```css
.ku-review-modal {
  width: min(640px, calc(100vw - 32px)) !important;
}
.ku-review-modal-title {
  margin-bottom: 6px;
  font-size: 16px;
  font-weight: 600;
}
.ku-review-modal-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--ku-text-3);
  font-size: 12px;
}
.ku-review-photos {
  display: flex;
  gap: 8px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}
.ku-review-photos img {
  display: block;
  width: 96px;
  height: 96px;
  border-radius: 8px;
  object-fit: cover;
}
.ku-review-photos label {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 12px;
}
.ku-review-reject {
  border-color: var(--ku-danger) !important;
  color: var(--ku-danger) !important;
}
.ku-review-approve {
  border-color: var(--ku-primary) !important;
  background: var(--ku-primary) !important;
  color: #fff !important;
}
```

- [ ] **Step 4: 확인** — Run: `npm run typecheck && npm run lint && npx playwright test e2e/admin-inbox.spec.ts e2e/admin-dark.spec.ts` / Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/components/admin/inbox/FacilityRequestReviewModal.tsx src/app/admin/dashboard/inbox/page.tsx src/app/admin/admin-ui.css e2e/support/mockBackend.ts e2e/admin-inbox.spec.ts
git commit -m "feat(inbox): 검토 모달에서 요청을 고쳐 바로 승인하거나 거절한다"
```

### Task 19: 피드백 탭

**Files:**

- Create: `src/components/admin/inbox/FeedbackList.tsx`
- Modify: `src/app/admin/dashboard/inbox/page.tsx`, `src/app/admin/admin-ui.css`, `e2e/support/mockBackend.ts`, `e2e/admin-inbox.spec.ts`

**Interfaces:**

- Consumes: Task 11 API, `FEEDBACK_STATUS_LABELS`·`FEEDBACK_TYPES`(`src/lib/feedback.ts`).

- [ ] **Step 1: 목 백엔드** — `/api/feedback` POST 대역이 저장하는 행에 `id`·`status: "new"`·`created_at`을 붙이고(`state.feedbackSubmissions.push({ id: \`fb-${state.feedbackSubmissions.length + 1}\`, status: "new", created_at: "2026-10-08T00:00:00Z", ...submission })`), 관리자 대역을 더한다:

```ts
const FEEDBACK_FILTER: Record<string, string[] | null> = {
  open: ["new", "reviewing"],
  new: ["new"],
  reviewing: ["reviewing"],
  done: ["resolved"],
  all: null,
};
if (path === "/api/admin-feedback") {
  const statuses =
    FEEDBACK_FILTER[url.searchParams.get("status") ?? "open"] ?? null;
  const items = state.feedbackSubmissions
    .filter(
      (row) => !statuses || statuses.includes(String(row.status ?? "new")),
    )
    .map((row) => ({
      id: row.id,
      feedback_type: row.feedback_type ?? row.type,
      content: row.content,
      page_url: row.page_url ?? row.pageUrl ?? null,
      status: row.status ?? "new",
      created_at: row.created_at ?? "2026-10-08T00:00:00Z",
    }));
  return json(route, { items, total: items.length });
}
const feedbackPatch = path.match(/^\/api\/admin-feedback\/([^/]+)$/);
if (feedbackPatch) {
  const row = state.feedbackSubmissions.find(
    (item) => item.id === feedbackPatch[1],
  );
  if (!row) return json(route, { error: "피드백이 없어요" }, 404);
  row.status = (route.request().postDataJSON() as { status: string }).status;
  return json(route, { status: row.status });
}
```

- [ ] **Step 2: 실패하는 E2E** — `e2e/admin-inbox.spec.ts`에 추가:

```ts
test.describe("제보함 — 피드백", () => {
  test("피드백 탭에서 상태를 바꾸면 기본 목록에서 빠지고 처리 완료에 보인다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.feedbackSubmissions.push(
      {
        id: "fb-1",
        feedback_type: "error",
        content: "중앙도서관 경사로 위치가 틀려요",
        page_url: "https://campus.example/",
        status: "new",
        created_at: "2026-10-08T00:00:00Z",
      },
      {
        id: "fb-2",
        feedback_type: "feature",
        content: "영문 이름도 검색되면 좋겠어요",
        page_url: null,
        status: "reviewing",
        created_at: "2026-10-07T00:00:00Z",
      },
    );
    await page.goto("/admin/dashboard/inbox?tab=feedback");
    const list = page.getByRole("list", { name: "피드백 목록" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").first()).toContainText("오류 제보");

    await list
      .getByRole("listitem")
      .first()
      .getByRole("combobox", { name: "처리 상태" })
      .selectOption("resolved");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    expect(state.feedbackSubmissions[0].status).toBe("resolved");

    await page
      .getByRole("combobox", { name: "상태 필터" })
      .selectOption("done");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("중앙도서관 경사로 위치가 틀려요");
  });
});
```

Run: `npx playwright test e2e/admin-inbox.spec.ts -g "피드백"` / Expected: FAIL.

- [ ] **Step 3: 구현** — `src/components/admin/inbox/FeedbackList.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import AdminPagination from "@/components/admin/AdminPagination";
import InboxFilterSelect from "@/components/admin/inbox/InboxFilterSelect";
import { authedFetch } from "@/lib/authedFetch";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import { FEEDBACK_TYPES } from "@/lib/feedback";
import {
  FEEDBACK_STATUS_LABELS,
  type FeedbackItem,
  type FeedbackStatus,
  type InboxFilter,
} from "@/lib/inboxStatus";

const TYPE_LABELS = new Map<string, string>(
  FEEDBACK_TYPES.map((type) => [type.value, type.label]),
);

export default function FeedbackList({
  showToast,
}: {
  showToast: (message: string, type?: string) => void;
}) {
  const [filter, setFilter] = useState<InboxFilter>("open");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const response = await authedFetch(
        `/api/admin-feedback?status=${filter}&page=${page}`,
      ).catch(() => null);
      if (cancelled || !response?.ok) return;
      const body = (await response.json()) as {
        items: FeedbackItem[];
        total: number;
      };
      if (cancelled) return;
      setItems(body.items);
      setTotal(body.total);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filter, page, refreshKey]);

  async function changeStatus(id: string, status: FeedbackStatus) {
    const response = await authedFetch(`/api/admin-feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      showToast("상태를 바꾸지 못했어요", "error");
      return;
    }
    setRefreshKey((key) => key + 1);
    window.dispatchEvent(new Event("inboxCountsChanged"));
  }

  return (
    <section aria-label="피드백">
      <div className="ku-admin-list-controls">
        <InboxFilterSelect
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setPage(1);
          }}
        />
      </div>
      {items.length === 0 ? (
        <div className="ku-admin-empty">피드백이 없어요.</div>
      ) : (
        <ul className="ku-inbox-list" aria-label="피드백 목록">
          {items.map((item) => {
            const open = expanded.has(item.id);
            return (
              <li key={item.id} className="ku-feedback-row">
                <div className="ku-feedback-head">
                  <span className="ku-feedback-type">
                    {TYPE_LABELS.get(item.feedback_type) ?? item.feedback_type}
                  </span>
                  <span className="ku-inbox-row-meta">
                    {formatAdminUpdatedAt(item.created_at)}
                  </span>
                  <select
                    aria-label="처리 상태"
                    value={item.status}
                    onChange={(event) =>
                      void changeStatus(
                        item.id,
                        event.target.value as FeedbackStatus,
                      )
                    }
                  >
                    {(
                      Object.keys(FEEDBACK_STATUS_LABELS) as FeedbackStatus[]
                    ).map((status) => (
                      <option key={status} value={status}>
                        {FEEDBACK_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="ku-feedback-content" data-expanded={open}>
                  {item.content}
                </p>
                <div className="ku-feedback-foot">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((previous) => {
                        const next = new Set(previous);
                        if (open) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                  >
                    {open ? "접기" : "펼치기"}
                  </button>
                  {item.page_url && (
                    <a href={item.page_url} target="_blank" rel="noreferrer">
                      제보한 페이지
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AdminPagination page={page} totalCount={total} onPageChange={setPage} />
    </section>
  );
}
```

`page.tsx` — 탭 분기의 `: null`을 `: <FeedbackList showToast={showToast} />`로 바꾼다.

`admin-ui.css`:

```css
.ku-feedback-row {
  padding: 10px 4px;
  border-bottom: 1px solid var(--ku-border);
}
.ku-feedback-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ku-feedback-head select {
  margin-left: auto;
}
.ku-feedback-type {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--ku-surface-raised);
  color: var(--ku-text-2);
  font-size: 11px;
}
.ku-feedback-content {
  display: -webkit-box;
  margin: 6px 0;
  overflow: hidden;
  color: var(--ku-text-1);
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.ku-feedback-content[data-expanded="true"] {
  display: block;
}
.ku-feedback-foot {
  display: flex;
  gap: 12px;
  font-size: 12px;
}
.ku-feedback-foot button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ku-primary-text);
  cursor: pointer;
}
```

- [ ] **Step 4: 확인** — Run: `npm run typecheck && npm run lint && npx playwright test e2e/admin-inbox.spec.ts e2e/admin-auth.spec.ts e2e/public-map.spec.ts` / Expected: PASS(공개 피드백 제출 E2E가 목 행 모양 변경 뒤에도 통과).

- [ ] **Step 5: 커밋**

```bash
git add src/components/admin/inbox/FeedbackList.tsx src/app/admin/dashboard/inbox/page.tsx src/app/admin/admin-ui.css e2e/support/mockBackend.ts e2e/admin-inbox.spec.ts
git commit -m "feat(inbox): 피드백 탭에서 제보를 읽고 처리 상태를 바꾼다"
```

### Task 20: 건물 상세 — 검토 대기 요청 수와 시설 사진 관리

**Files:**

- Create: `src/components/admin/FacilityPhotoManager.tsx`
- Modify: `src/app/admin/buildings/[id]/page.tsx`, `src/components/admin/building-detail/BuildingFacilityListCard.tsx`, `src/components/admin/FacilityDetailModal.tsx`, `e2e/support/mockBackend.ts`, `e2e/facility-photos.spec.ts`

**Interfaces:**

- Consumes: Task 12 API, `facilityPhotoUrl`(Task 15), `convertToWebP`, `MAX_FACILITY_PHOTOS`·`MAX_FACILITY_PHOTO_BYTES`.
- Produces: `FacilityPhotoManager` props `{ facilityId: string; photos: Pick<FacilityPhoto, "id" | "storage_path" | "sort_order">[]; onChanged(): void | Promise<void>; showToast(message: string, type?: string): void }`; `BuildingFacilityListCard`의 새 prop `pendingRequestCount: number`.

- [ ] **Step 1: 목 백엔드** — `handleApi`:

```ts
if (path === "/api/upload-facility-photo") {
  const rawBody = route.request().postData() ?? "";
  const facilityId =
    rawBody.match(/name="facilityId"\r?\n\r?\n([^\r\n]+)/)?.[1] ?? "";
  const used = new Set(
    state.facilityPhotos
      .filter((p) => p.facility_id === facilityId)
      .map((p) => p.sort_order),
  );
  const slot = [0, 1, 2].find((index) => !used.has(index));
  if (slot === undefined)
    return json(route, { error: "사진은 3장까지예요" }, 409);
  const photo = {
    id: `fp-up-${state.facilityPhotos.length + 1}`,
    facility_id: facilityId,
    storage_path: `${facilityId}/up.webp`,
    sort_order: slot,
  };
  state.facilityPhotos.push(photo);
  return json(route, { id: photo.id, storage_path: photo.storage_path });
}
if (path === "/api/delete-facility-photo") {
  const { photoId } = route.request().postDataJSON() as { photoId: string };
  state.facilityPhotos = state.facilityPhotos.filter(
    (photo) => photo.id !== photoId,
  );
  return json(route, { ok: true });
}
```

- [ ] **Step 2: 실패하는 E2E** — `e2e/facility-photos.spec.ts`에 추가:

```ts
test("관리자 시설 상세에서 사진을 추가하고 지운다", async ({ page }) => {
  const state = await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/buildings/1");
  await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
  const dialog = page.getByRole("dialog", { name: "중앙 엘리베이터" });

  await dialog.locator('input[type="file"]').setInputFiles({
    name: "a.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(
    dialog.getByRole("button", { name: "사진 1 삭제" }),
  ).toBeVisible();
  expect(
    state.facilityPhotos.filter((photo) => photo.facility_id === "f-building"),
  ).toHaveLength(1);

  await dialog.getByRole("button", { name: "사진 1 삭제" }).click();
  await expect(dialog.getByRole("button", { name: "사진 1 삭제" })).toHaveCount(
    0,
  );
  expect(state.facilityPhotos).toHaveLength(0);
});

test("건물 상세에 그 건물의 검토 대기 요청 수가 보이고 제보함으로 간다", async ({
  page,
}) => {
  const state = await installMockBackend(page, { authenticated: true });
  state.facilityRequests.push({
    id: "00000000-0000-4000-8000-000000000001",
    building_id: 1,
    facility_code: "elevator",
    status: "new",
    created_at: "2026-10-08T00:00:00Z",
    facility_id: null,
  });
  await page.goto("/admin/buildings/1");
  await page.getByRole("link", { name: "검토 대기 요청 1건" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/inbox\?building=1$/);
});
```

시설 행 버튼의 접근 이름은 `BuildingFacilityListCard`가 정한다. 위 `/중앙 엘리베이터/`가 맞지 않으면 그 파일의 행 마크업을 읽고 기존 `e2e/admin-building-facility-modal.spec.ts`가 행을 여는 방식을 따른다. 상세 모달의 접근 이름은 시설 이름(`FacilityDetailModal`의 `title`)이다.

Run: `npx playwright test e2e/facility-photos.spec.ts` / Expected: 새 테스트 FAIL.

- [ ] **Step 3: 구현**

`src/components/admin/FacilityPhotoManager.tsx`:

```tsx
"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import {
  MAX_FACILITY_PHOTOS,
  MAX_FACILITY_PHOTO_BYTES,
} from "@/lib/facilityPhotos";
import { facilityPhotoUrl } from "@/lib/facilityPhotoUrl";
import { convertToWebP } from "@/lib/imageToWebP";
import type { FacilityPhoto } from "@/types/domain";

interface FacilityPhotoManagerProps {
  facilityId: string;
  photos: Pick<FacilityPhoto, "id" | "storage_path" | "sort_order">[];
  onChanged: () => void | Promise<void>;
  showToast: (message: string, type?: string) => void;
}

export default function FacilityPhotoManager({
  facilityId,
  photos,
  onChanged,
  showToast,
}: FacilityPhotoManagerProps) {
  const [busy, setBusy] = useState(false);
  const sorted = [...photos].sort((a, b) => a.sort_order - b.sort_order);

  async function upload(file: File) {
    setBusy(true);
    try {
      const blob = await convertToWebP(file);
      if (blob.size > MAX_FACILITY_PHOTO_BYTES) {
        showToast("사진이 너무 커요(4MB 초과)", "warning");
        return;
      }
      const form = new FormData();
      form.append("facilityId", facilityId);
      form.append("file", blob, "photo.webp");
      const response = await authedFetch("/api/upload-facility-photo", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        showToast(body.error ?? "사진을 올리지 못했어요", "error");
        return;
      }
      await onChanged();
    } catch {
      showToast("사진을 변환하지 못했어요", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(photoId: string) {
    setBusy(true);
    const response = await authedFetch("/api/delete-facility-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId }),
    });
    setBusy(false);
    if (!response.ok) {
      showToast("사진을 지우지 못했어요", "error");
      return;
    }
    await onChanged();
  }

  return (
    <div className="ku-facility-photo-manager">
      {sorted.map((photo, index) => (
        <div key={photo.id} className="ku-facility-photo-manager-item">
          <img
            src={facilityPhotoUrl(photo.storage_path)}
            alt={`사진 ${index + 1}`}
          />
          <button
            type="button"
            aria-label={`사진 ${index + 1} 삭제`}
            onClick={() => void remove(photo.id)}
            disabled={busy}
          >
            ✕
          </button>
        </div>
      ))}
      {sorted.length < MAX_FACILITY_PHOTOS && (
        <label className="ku-facility-photo-manager-add">
          {busy ? "올리는 중..." : "＋ 사진 추가"}
          <input
            type="file"
            accept="image/*"
            className="ku-visually-hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      )}
    </div>
  );
}
```

`FacilityDetailModal.tsx` — props에 `onPhotosChanged: () => void | Promise<void>`를 더하고 `위치` 필드 다음에:

```tsx
<div className="ku-facility-modal-field">
  <span className="ku-facility-modal-field-label">사진</span>
  <FacilityPhotoManager
    facilityId={facility.id}
    photos={facility.facility_photos ?? []}
    onChanged={onPhotosChanged}
    showToast={showToast}
  />
</div>
```

`src/app/admin/buildings/[id]/page.tsx`:

1. 시설 select를 `"*, facility_types(code, label), facility_photos(id, storage_path, sort_order)"`로 — `deleteFacility`가 사진 목록을 받는다(Task 12).
2. `FacilityDetailModal`에 `onPhotosChanged={fetchData}`.
3. 검토 대기 수:

```tsx
const [pendingRequestCount, setPendingRequestCount] = useState(0);
useEffect(() => {
  let cancelled = false;
  const timer = window.setTimeout(async () => {
    const response = await authedFetch(
      `/api/facility-requests?status=open&building=${id}`,
    ).catch(() => null);
    if (!response?.ok || cancelled) return;
    const body = (await response.json()) as { total: number };
    if (!cancelled) setPendingRequestCount(body.total);
  }, 0);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}, [id]);
```

`BuildingFacilityListCard`에 `pendingRequestCount={pendingRequestCount}`를 넘긴다.

`BuildingFacilityListCard.tsx` — prop을 받고, 카드 머리줄(`+ 시설 추가` 버튼 근처)에:

```tsx
{
  pendingRequestCount > 0 && (
    <Link
      className="ku-facility-pending-link"
      href={`/admin/dashboard/inbox?building=${buildingId}`}
    >
      검토 대기 요청 {pendingRequestCount}건
    </Link>
  );
}
```

(`import Link from "next/link";`)

`admin-ui.css`:

```css
.ku-facility-photo-manager {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ku-facility-photo-manager-item {
  position: relative;
}
.ku-facility-photo-manager-item img {
  display: block;
  width: 64px;
  height: 64px;
  border-radius: 6px;
  object-fit: cover;
}
.ku-facility-photo-manager-item button {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 50%;
  background: var(--ku-overlay);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
}
.ku-facility-photo-manager-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border: 1.5px dashed var(--ku-border-input);
  border-radius: 6px;
  color: var(--ku-text-2);
  font-size: 11px;
  cursor: pointer;
}
.ku-facility-pending-link {
  padding: 4px 10px;
  border: 1px solid var(--ku-status-warn-fg);
  border-radius: 999px;
  background: var(--ku-status-warn-bg);
  color: var(--ku-status-warn-fg);
  font-size: 12px;
  font-weight: 600;
}
```

- [ ] **Step 4: 확인** — Run: `npm run typecheck && npm run lint && npx playwright test e2e/facility-photos.spec.ts e2e/admin-building-facility-modal.spec.ts e2e/admin-buildings-slopes.spec.ts e2e/admin-dark.spec.ts` / Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/components/admin/FacilityPhotoManager.tsx src/components/admin/FacilityDetailModal.tsx "src/app/admin/buildings/[id]/page.tsx" src/components/admin/building-detail/BuildingFacilityListCard.tsx src/app/admin/admin-ui.css e2e/support/mockBackend.ts e2e/facility-photos.spec.ts
git commit -m "feat(admin): 건물 상세에 검토 대기 요청 수와 시설 사진 관리를 단다"
```

### Task 21: 문서·전체 검증·PR 2

**Files:**

- Modify: `README.md`, `docs/future-development/admin-feedback-inbox.md`, `docs/future-development/README.md`, `docs/TODO_list/video/delete-ordering-data-loss.md`

- [ ] **Step 1: 문서**
  - `README.md`: 기능 목록(공개 — 시설 등록 요청·시설 사진, 관리자 — 제보함·시설 사진), 환경 변수 블록에 `# Cloudflare Turnstile(시설 등록 요청)` 아래 `NEXT_PUBLIC_TURNSTILE_SITE_KEY=`, `TURNSTILE_SECRET_KEY=`, `FACILITY_REQUEST_HASH_SECRET=`, 파일 트리(새 라우트·`src/lib/server/`·`src/components/admin/inbox/`), 테스트 표에 새 E2E 세 파일, 테스트 개수(아래 Step 2의 실제 출력으로).
  - `docs/future-development/admin-feedback-inbox.md`: 머리에 `2026-10-08 — 일부 완료` 표시와 표(이 문서 / 당시 / 현재: 목록·상태 변경·상태 필터·페이지 나눔·미확인 수 → 제보함 피드백 탭, 설계 `docs/specs/2026-10-08-facility-request-design.md` 6장). 남은 범위(검색, 유형·기간 필터, `mailto:` 제거, 보관 기간, RLS 대신 서버 API로 간 결정)는 본문에 둔다.
  - `docs/future-development/README.md`: 문서 목록에 `admin-feedback-inbox.md`가 빠져 있으면 더한다.
  - `docs/TODO_list/video/delete-ordering-data-loss.md`: 사진 단계가 같은 순서 문제에 들어온 사실(동영상 → 사진 → row, 설계 5.3)을 날짜와 함께 더한다.

- [ ] **Step 2: 전체 검증**

```bash
npm run typecheck
npm run lint
npx prettier --check --end-of-line auto .
npm run test
npx playwright test
npm run build
```

Expected: 타입·린트 오류 없음(경고는 이번에 건드린 파일에 새로 생긴 것이 없어야 한다), 형식 검사는 커밋하지 않는 `docs/review/` 외 통과, 단위·E2E 전부 PASS, 빌드 성공. 개수(`Test Files N`, `Tests N`, `N passed`)를 README에 그대로 옮긴다.

- [ ] **Step 3: 역추적**

```bash
rg -n "PhotoLightbox|buildingName=\{|displayName=\{|SidePanelPhoto" src e2e
rg -n "facility_photos|facility_requests|inbox" docs README.md
rg -n "validateFacilityForm" src
```

각 결과가 (a) 이번에 고쳤거나 (b) 날짜 있는 기록이거나 (c) 무관한지 확인하고, 명령과 출력을 PR 설명에 붙인다.

- [ ] **Step 4: 눈으로 확인** — 임시 스펙으로 학생 모달(데스크톱·375px·다크), 제보함 목록·검토 모달, 시설 사진 썸네일을 스크린샷으로 보고 지운다.

- [ ] **Step 5: 커밋과 PR**

```bash
git add README.md docs/future-development docs/TODO_list/video/delete-ordering-data-loss.md
git commit -m "docs: 시설 등록 요청·제보함·시설 사진을 README와 후속 문서에 반영한다"
git push -u origin feat/facility-requests-app
```

PR 본문: 요약, PR 1 운영 확인 결과(Task 2), 검증 출력, 역추적 출력, 수동 확인 항목(설계 8.4의 휴대폰 카메라 업로드, Vercel 프리뷰에서 Turnstile 실제 위젯 — 프리뷰 도메인을 위젯에 등록했는지). 병합할 때 이 계획 문서를 `git rm`한다.
