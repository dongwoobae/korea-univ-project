# 멘토링 피드백 PR ①-1 구현 계획 — 건물 사진 순서의 DB

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans로
> 태스크 순서대로 실행한다. 단계는 체크박스(`- [ ]`)로 추적한다. TDD로 간다 — 테스트를 먼저 커밋하고 기대한 이유로 실패하는지
> 본 뒤 구현을 커밋한다.

**Goal:** `building_photos`에 `sort_order`를 넣고, 새 사진의 번호를 DB가 매기며, 이웃한 두 사진의 번호를 맞바꾸는 함수를 둔다.
지금 앱 코드(업로드 라우트·공개 상세·관리자 사진 칸)는 하나도 바꾸지 않고 그대로 돌아야 한다. 설계 문서와 휠체어 종류 기록도 이
PR로 들어간다.

**Architecture:** 마이그레이션 한 파일. 열 추가 → 활동 기록 트리거를 끈 채 `created_at, id` 순으로 채우기 → `not null`·`>= 0`·
건물별 유일(문장 끝 검사) → 번호 매기는 `before insert` 트리거 → 맞바꾸기 함수. 트리거와 함수는 같은 건물 단위 advisory 잠금을
잡는다. 함수는 `security invoker`라 기존 `admin write` RLS가 그대로 걸린다. 화면은 PR ①-2가 바꾼다.

**Tech Stack:** Postgres(운영 스냅샷 `supabase/baseline/schema.sql` 위), pgTAP(`supabase test db`, CI `DB test` 잡),
Supabase CLI `2.109.1`, TypeScript(`supabase/database.types.ts`).

**Spec:** `docs/specs/2026-10-25-mentoring-feedback-design.md`(이하 "설계 N.N") 1장(PR 나눔과 그 이유), 3.3, 10장. 계획과 설계가
다르면 설계가 맞다 — 멈추고 보고한다.

## 진행 상황

| 태스크 | 상태 | 커밋 |
| ------ | ---- | ---- |
| 1      |      |      |
| 2      |      |      |
| 3      |      |      |

## Global Constraints

- **앱 코드는 바꾸지 않는다**(설계 3.3). 바꾸는 코드 파일은 `supabase/database.types.ts` 하나다. 업로드 라우트
  (`src/app/api/upload-building-photo/route.ts`)는 `sort_order` 없이 넣는 그대로 둔다 — DB가 번호를 매긴다.
- 마이그레이션은 새 파일만 더한다. 이름은 `^[0-9]{14}_[a-z0-9_]+\.sql$`(`scripts/check-migrations.sh`). 버전은
  `supabase/migrations`의 가장 늦은 파일(`20261020000000`)과 스냅샷 첫 줄 버전보다 늦어야 한다. 이 계획은 `20261025000000`을 쓴다.
- pgTAP 파일은 `supabase/tests/` 바로 아래 `*.test.sql`, 파일마다 `begin; … rollback;`.
- `public`에 만드는 함수는 RPC로 드러난다. 트리거 함수는 `public`·`anon`·`authenticated`에서 실행 권한을 회수하고, 맞바꾸기 함수는
  `public`·`anon`·`service_role`에서 회수한 뒤 `authenticated`에만 준다(스냅샷의 기본 권한이 새 함수를 `service_role`에도 준다).
- 맞바꾸기 오류 코드(설계 3.3의 세 경우와 그 밖):

  | 경우                                                                          | SQLSTATE |
  | ----------------------------------------------------------------------------- | -------- |
  | 같은 사진 두 번, 다른 건물의 사진                                             | `22023`  |
  | 사진이 없다(잠금을 기다리는 사이 지워짐 포함)                                 | `P0002`  |
  | `p_first`가 지금 `p_second`의 바로 앞이 아니다(사이에 사진, 또는 앞뒤 뒤집힘) | `PT409`  |
  | 보이지만 고칠 권한이 없다(RLS)                                                | `42501`  |

  `PT409`는 PostgREST가 HTTP 409로 돌려준다. PR ①-2 화면은 `error.code === "PT409"`로 "다시 불러오기"를 가른다.

- 주석은 이유·외부 제약·위험만 적는다. 다른 파일의 줄 번호·개수·상수 값을 적지 않고 심볼 이름이나 설계 절로 가리킨다.
- 커밋 메시지는 한국어 `type(scope): 내용`. `Co-Authored-By`를 붙이지 않고, 작업 과정(리뷰·점검)을 적지 않는다.
- 이 저장소는 `core.autocrlf=true`다. 파일은 UTF-8로 쓴다. 커밋 전에 `rg -n "\x{FFFD}" <바꾼 파일>`로 깨진 글자가 없는지 본다.

## Review Focus

pgTAP은 한 세션에서 돌아 아래는 테스트로 잡히지 않는다. 리뷰어가 코드로 확인한다.

1. **동시 업로드**: 같은 건물에 두 세션이 동시에 `insert`해도 번호가 겹치지 않는다 — 트리거가 `max`를 읽기 **전에** 건물 잠금을 잡는지,
   그리고 그 `select`가 잠금 뒤의 문장인지(READ COMMITTED에서 문장마다 새 스냅숏).
2. **맞바꾸기 중 경쟁**: 두 관리자가 겹친 두 쌍을 동시에 바꿔도 덮어쓰지 않는다 — 함수가 잠금을 잡은 **뒤에** 두 번호를 다시 읽는지.
   잠금 전에 읽은 값은 건물 id 하나뿐이어야 한다. 트리거의 잠금이 `if` 밖에 있어 번호를 직접 준 삽입도 줄을 서는지.
3. **맞바꾸기 중 지우기**: 지우기 라우트는 서비스 키로 advisory 잠금 없이 지운다. 함수가 두 행을 `for update`로 잡아 그사이 지우기가
   기다리게 하는지, 이미 지워졌으면 `P0002`가 나는지(`42501`로 잘못 나가지 않는지).
4. **운영 채우기**: `created_at`이 같거나 비어 있는 사진 — `order by created_at, id`(빈 값은 뒤)로 건물마다 0부터 빈틈없이 매겨진다.
   병합 뒤 확인(아래)으로 본다.
5. **채우기 중 활동 기록**: 채우기 `update`가 활동 기록을 남기지 않는다 — 트리거를 끄고 켜는 두 문장이 채우기를 감싸는지, 이름이
   `log_building_photos_change`인지(`20261019000001_create_activity_log_triggers.sql`).

서비스 키 업로드가 트리거를 타는 것(테스트 6)과 함수 권한(테스트 21·22)은 테스트가 잡는다.

## 검증 방법

```bash
EVENT_NAME=pull_request BASE_SHA=$(git merge-base origin/main HEAD) HEAD_SHA=$(git rev-parse HEAD) \
  GITHUB_OUTPUT=$(mktemp) bash scripts/check-migrations.sh   # CI Migration safety와 같다. 새 파일 한 개(A)만 나와야 한다
npm run typecheck
npm run test
npx eslint --ignore-pattern ".claude/**" .
npx prettier --check --end-of-line auto --ignore-path .prettierignore --ignore-path .gitignore . "!.claude/**"
```

- pgTAP은 로컬에 Docker가 없어 PR CI의 `DB test` 잡으로 돌린다. 그래서 **draft PR을 먼저 연다.** 테스트 커밋만 푸시해 `DB test`가
  기대한 이유(`sort_order` 칸·함수가 없음)로 실패하는 것을 본 뒤 마이그레이션 커밋을 푸시한다.
- 선택: CI 전에 SQL 문법을 빨리 보고 싶으면 세션 스크래치패드에 `@electric-sql/pglite`를 깔고 Supabase 역할(`anon`·`authenticated`·
  `service_role`)·`auth.users`·기초 테이블을 흉내 낸 바탕에서 마이그레이션을 돌려 본다. 저장소에는 아무것도 더하지 않는다.
- 화면을 바꾸지 않으므로 E2E는 돌리지 않아도 된다. CI가 돌린다.
- `Apply Supabase migrations`는 PR에서 돌지 않는다. 운영 적용은 병합 뒤다.

## 브랜치와 PR

`feat/building-photo-order-db`(`main`에서). Task 1에서 draft PR을 연다. 설계 문서는 이 PR로 처음 들어간다(지금 작업 사본의
`docs/mentoring-feedback-design` 브랜치에 커밋되지 않은 채 있다 — 그 브랜치를 이 이름으로 바꿔 쓴다). 병합할 때 이 계획 문서를
`git rm`한다.

---

### Task 1: 설계 문서와 휠체어 종류 기록

**Files:**

- Create: `docs/specs/2026-10-25-mentoring-feedback-design.md`(이미 쓴 것)
- Create: `docs/plans/2026-10-25-mentoring-pr1-1-photo-order-db.md`(이 문서)
- Modify: `docs/future-development/accessible-routing.md`("목표 사용자 여정"의 2번 "이동 조건" 목록)

- [ ] **Step 1: 브랜치 이름을 바꾼다**

```bash
git -C c:/Users/dw581/project/korea-univ-project branch -m docs/mentoring-feedback-design feat/building-photo-order-db
```

- [ ] **Step 2: 이동 조건에 이동 수단을 더한다** (설계 10장)

"이동 조건을 선택한다." 아래 목록(계단 회피·완만한 경사 우선·엘리베이터 이용) 맨 끝에 한 항목을 더한다. 내용: 이동 수단 —
수동 휠체어 / 전동 휠체어. 출처 2026-10-24 멘토링. 두 수단은 오를 수 있는 경사·이어지는 경사 거리·턱 높이가 달라 같은 길도
판정이 갈린다. 기준 수치는 현장·사용자 검증 뒤에 정한다. 문서의 다른 절은 건드리지 않는다.

- [ ] **Step 3: 서식 확인**

Run: `npx prettier --check --end-of-line auto docs/specs/2026-10-25-mentoring-feedback-design.md docs/plans/2026-10-25-mentoring-pr1-1-photo-order-db.md docs/future-development/accessible-routing.md`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 4: 커밋하고 draft PR을 연다**

```bash
git -C c:/Users/dw581/project/korea-univ-project add docs/specs/2026-10-25-mentoring-feedback-design.md docs/plans/2026-10-25-mentoring-pr1-1-photo-order-db.md docs/future-development/accessible-routing.md
git -C c:/Users/dw581/project/korea-univ-project commit -m "docs: 멘토링 피드백 반영 설계와 길찾기 이동 수단 조건을 적는다"
git -C c:/Users/dw581/project/korea-univ-project push -u origin feat/building-photo-order-db
gh pr create --draft --title "feat(db): 건물 사진 순서 칸과 맞바꾸기 함수를 둔다" --body "<설계 1장의 PR ①-1 범위, 앱 코드 무변경, 병합 뒤 확인 절차>"
```

---

### Task 2: 순서 규칙을 pgTAP으로 먼저 적는다

**Files:**

- Create: `supabase/tests/building_photo_order.test.sql`

**Interfaces:**

- Consumes: 없음(Task 3이 만들 것을 시험한다)
- Produces: Task 3이 통과시켜야 할 22개 단언. 이름·SQLSTATE는 Global Constraints 표와 같다.

- [ ] **Step 1: 테스트를 쓴다**

바탕은 `supabase/tests/admin_write_policies.test.sql`과 같다(같은 두 `auth.users`, `admin_users`에 관리자 한 명, `pg_temp.act_as`).
건물 `900001`(시험 건물)·`900002`(옆 건물). 사진 id를 직접 준다. 단언 순서와 내용:

```sql
-- 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 3.3
begin;
select plan(22);
-- (바탕: auth.users 두 명, admin_users 한 명, buildings 900001·900002, pg_temp.act_as — admin_write_policies.test.sql과 같다)

-- 1~2. 구조
select has_column('public', 'building_photos', 'sort_order', '건물 사진에 순서 칸이 있다');
select col_not_null('public', 'building_photos', 'sort_order', '순서 칸은 비지 않는다');

-- 3~4. 업로드 라우트처럼 sort_order 없이 넣는다
insert into public.building_photos (id, building_id, url) values (800001, 900001, 'https://cdn.test/a.webp');
select is((select sort_order from public.building_photos where id = 800001), 0, '건물의 첫 사진은 0번이다');
insert into public.building_photos (id, building_id, url) values
  (800002, 900001, 'https://cdn.test/b.webp'),
  (800003, 900001, 'https://cdn.test/c.webp');
select results_eq(
  $$select sort_order from public.building_photos where building_id = 900001 order by sort_order$$,
  $$values (0), (1), (2)$$,
  '한 문장에 여러 장을 넣어도 마지막 번호 다음부터 겹치지 않게 붙는다');

-- 5. 건물마다 따로 센다
insert into public.building_photos (id, building_id, url) values (800011, 900002, 'https://cdn.test/x.webp');
select is((select sort_order from public.building_photos where id = 800011), 0, '건물마다 0번부터 센다');

-- 6. 서비스 키(RLS를 건너뛰는 업로드 라우트)도 트리거를 탄다
set local role service_role;
insert into public.building_photos (id, building_id, url) values (800004, 900001, 'https://cdn.test/d.webp');
reset role;
select is((select sort_order from public.building_photos where id = 800004), 3, '서비스 키 업로드도 마지막 번호 다음에 붙는다');

-- 7. 지운 번호를 다시 쓰지 않는다 → 900001: A(0) C(2) D(3) E(4)
delete from public.building_photos where id = 800002;
insert into public.building_photos (id, building_id, url) values (800005, 900001, 'https://cdn.test/e.webp');
select is((select sort_order from public.building_photos where id = 800005), 4, '사진을 지워도 새 사진은 마지막 번호 다음에 붙는다');

-- 8~9. 제약
select throws_ok(
  $$insert into public.building_photos (building_id, url, sort_order) values (900001, 'https://cdn.test/dup.webp', 0)$$,
  '23505', null, '같은 건물에 같은 번호를 두 번 둘 수 없다');
select throws_ok(
  $$insert into public.building_photos (building_id, url, sort_order) values (900001, 'https://cdn.test/neg.webp', -1)$$,
  '23514', null, '번호는 0 이상이다');

-- 10~11. 함수 모양
select has_function('public', 'swap_building_photo_order', array['integer', 'integer'], '맞바꾸기 함수가 있다');
select is(
  (select prosecdef from pg_proc where oid = 'public.swap_building_photo_order(integer, integer)'::regprocedure),
  false, '맞바꾸기 함수는 호출자 권한으로 돈다');

-- 12~14. 관리자의 맞바꾸기. A(0)와 C(2)는 사이의 1번이 지워져 이웃이다
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select lives_ok($$select public.swap_building_photo_order(800001, 800003)$$, '관리자는 이웃한 두 사진의 자리를 바꾼다');
select results_eq(
  $$select id from public.building_photos where building_id = 900001 order by sort_order$$,
  $$values (800003), (800001), (800004), (800005)$$,
  '맞바꾼 두 사진만 자리가 바뀐다');
reset role;
select is(
  (select count(*)::int from public.activity_logs
   where target_table = 'building_photos' and action = 'update' and changes ? 'sort_order'),
  2, '맞바꾸기 한 번에 순서 변경 기록이 두 줄 남는다');

-- 15~18. 거부 — 순서: C(0) A(2) D(3) E(4)
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select throws_ok($$select public.swap_building_photo_order(800003, 800004)$$,
  'PT409', null, '사이에 다른 사진이 있으면 바꾸지 않는다');
select throws_ok($$select public.swap_building_photo_order(800001, 800011)$$,
  '22023', null, '다른 건물의 사진과는 바꾸지 않는다');
select throws_ok($$select public.swap_building_photo_order(800001, 800001)$$,
  '22023', null, '같은 사진끼리는 바꾸지 않는다');
select throws_ok($$select public.swap_building_photo_order(800001, 899999)$$,
  'P0002', null, '없는 사진과는 바꾸지 않는다');

-- 19~20. 관리자 목록에 없는 계정
select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select throws_ok($$select public.swap_building_photo_order(800003, 800001)$$,
  '42501', null, '목록에 없는 계정은 자리를 바꾸지 못한다');
select results_eq(
  $$select id from public.building_photos where building_id = 900001 order by sort_order$$,
  $$values (800003), (800001), (800004), (800005)$$,
  '거부된 맞바꾸기는 순서를 바꾸지 않는다');

-- 21. 방문자 (authenticated에서 anon으로 바로 못 바꾼다 — 먼저 되돌린다)
reset role;
set local role anon;
select throws_ok($$select public.swap_building_photo_order(800003, 800001)$$,
  '42501', null, '방문자는 맞바꾸기 함수를 부를 수 없다');

-- 22. 서비스 키 (기본 권한으로 받은 실행 권한을 회수했다)
reset role;
set local role service_role;
select throws_ok($$select public.swap_building_photo_order(800003, 800001)$$,
  '42501', null, '서비스 키로도 맞바꾸기 함수를 부르지 않는다');

reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: 기존 테스트가 사진을 `sort_order` 없이 넣는지 확인한다** (이 PR 뒤에도 고치지 않고 통과해야 한다 — 설계 3.3)

Run: `rg -n "building_photos" supabase/tests`
Expected: `admin_write_policies.test.sql`·`activity_log_triggers.test.sql`의 `insert`가 `(building_id, url)`만 준다. 이 파일들은 고치지 않는다.

- [ ] **Step 3: 커밋·푸시하고 실패를 본다**

```bash
git -C c:/Users/dw581/project/korea-univ-project add supabase/tests/building_photo_order.test.sql
git -C c:/Users/dw581/project/korea-univ-project commit -m "test(db): 건물 사진 순서 번호와 맞바꾸기 규칙을 시험한다"
git -C c:/Users/dw581/project/korea-univ-project push
gh run list --branch feat/building-photo-order-db --limit 3
```

Expected: `DB test` 잡이 실패하고, 로그의 첫 실패가 `sort_order` 칸이 없음(`has_column`) 또는 `column "sort_order" ... does not exist`다.
다른 이유(바탕 테이블 없음, 문법 오류)로 실패하면 테스트를 고친다. 다른 잡은 통과한다.

---

### Task 3: 마이그레이션과 타입

**Files:**

- Create: `supabase/migrations/20261025000000_add_building_photo_sort_order.sql`
- Modify: `supabase/database.types.ts`(`building_photos`의 `Row`·`Insert`·`Update`, `Functions`)

**Interfaces:**

- Consumes: Task 2의 테스트
- Produces (PR ①-2가 쓴다):
  - 열 `public.building_photos.sort_order integer not null`(0 이상, 건물별 유일)
  - RPC `public.swap_building_photo_order(p_first integer, p_second integer) returns void` — 오류는 Global Constraints 표
  - 타입 `Database["public"]["Functions"]["swap_building_photo_order"]` = `{ Args: { p_first: number; p_second: number }; Returns: undefined }`

- [ ] **Step 1: 마이그레이션을 쓴다**

순서가 중요한 파일이라 본문을 그대로 둔다.

```sql
-- 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 3.3
-- 지금 업로드 코드는 sort_order 없이 넣는다. 화면 코드(PR ①-2)보다 먼저 나가도 그대로 돌게 번호는 DB가 매긴다.

alter table public.building_photos add column sort_order integer;

-- 채우기가 사진마다 변경 기록을 남기지 않게 그동안만 끈다.
alter table public.building_photos disable trigger log_building_photos_change;
update public.building_photos as photo
set sort_order = ranked.position
from (
  select id, row_number() over (partition by building_id order by created_at, id) - 1 as position
  from public.building_photos
) as ranked
where photo.id = ranked.id;
alter table public.building_photos enable trigger log_building_photos_change;

alter table public.building_photos
  alter column sort_order set not null,
  add constraint building_photos_sort_order_check check (sort_order >= 0),
  -- 맞바꾸기는 한 문장으로 두 행을 바꾼다. 행마다가 아니라 문장 끝에 검사하도록 deferrable로 둔다.
  add constraint building_photos_building_id_sort_order_key
    unique (building_id, sort_order) deferrable initially immediate;

create function public.assign_building_photo_sort_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 같은 건물의 삽입과 맞바꾸기를 줄 세운다. 번호를 직접 준 삽입도 잡는다 — 맞바꾸기가 이웃을 확인한 뒤 그 사이로 끼어들지 않게.
  perform pg_advisory_xact_lock(hashtext('building_photos.sort_order:' || new.building_id));
  if new.sort_order is null then
    -- READ COMMITTED 전제: 아래 max는 잠금을 얻은 뒤의 스냅숏으로 읽힌다.
    select coalesce(max(sort_order), -1) + 1
    into new.sort_order
    from public.building_photos
    where building_id = new.building_id;
  end if;
  return new;
end;
$$;

revoke all on function public.assign_building_photo_sort_order() from public, anon, authenticated;

create trigger assign_building_photo_sort_order
  before insert on public.building_photos
  for each row execute function public.assign_building_photo_sort_order();
```

그 뒤에 `public.swap_building_photo_order(p_first integer, p_second integer) returns void`(`language plpgsql`,
`security invoker`, `set search_path = ''`)를 같은 파일에 둔다. 본문의 순서:

1. `p_first = p_second`면 `22023`.
2. `p_first`의 `building_id`만 읽는다. 없으면 `P0002`.
3. 트리거와 같은 키로 `pg_advisory_xact_lock(hashtext('building_photos.sort_order:' || <building_id>))`.
4. **잠금 뒤에** 두 사진을 `select … for update`로 다시 읽는다(`building_id`·`sort_order`). 지우기 라우트는 서비스 키로 이 잠금
   없이 지우므로, 행 잠금으로 함수가 끝날 때까지 두 행이 지워지지 않게 한다.
   - 두 행이 다 잡히지 않았으면, 잠그지 않는 보통 `select`로 두 사진이 다 보이는지 본다. 다 보이면 `42501`(읽을 수는 있지만 고칠
     권한이 없어 RLS가 `for update`에서 걸렀다 — `admin write`만 고치기를 허락한다), 아니면 `P0002`(그사이 지워졌다).
   - 건물이 다르면 `22023`.
5. `p_first`의 번호가 `p_second`보다 크거나, 같은 건물에 두 번호 사이(양 끝 제외)의 번호를 가진 사진이 있으면 `PT409`(방향 규칙은
   설계 3.3 — 오래된 화면이 같은 쌍을 다시 눌러 몰래 되돌리는 것을 막는다).
6. `update … set sort_order = case id when p_first then <둘째 번호> else <첫째 번호> end where id in (p_first, p_second)` 한 문장.
   `get diagnostics … = row_count`가 2가 아니면 `42501`(4에서 두 행을 잡았으니 일어나지 않아야 하는 방어 — 예외라 `update`도 함께
   되돌아간다).

이어서(Supabase 기본 권한이 새 함수를 `service_role`에도 주므로 그것도 회수한다):

```sql
revoke all on function public.swap_building_photo_order(integer, integer) from public, anon, service_role;
grant execute on function public.swap_building_photo_order(integer, integer) to authenticated;
```

- [ ] **Step 2: 타입을 고친다**

`supabase/database.types.ts`의 `building_photos`: `Row`에 `sort_order: number;`, `Insert`·`Update`에 `sort_order?: number;`(칸 이름
사전 순 — `id`와 `url` 사이). `Insert`가 선택인 이유는 트리거가 매기기 때문이다(타입 생성기를 다시 돌리면 필수로 바뀌니 그때 이
자리를 손으로 되돌린다 — 이 사실은 PR 본문에 적는다). `Functions`에 Task 3 Interfaces의 항목을 사전 순 자리에 넣는다.

- [ ] **Step 3: 로컬 검증**

Run: 위 "검증 방법"의 다섯 명령
Expected: 모두 통과. `typecheck`가 `BuildingPhoto`(= `building_photos` `Row`)를 만드는 곳에서 `sort_order` 누락으로 실패하면 그 자리만
타입 수준으로 고친다(동작은 바꾸지 않는다). 고친 파일은 PR 본문에 적는다.

- [ ] **Step 4: 커밋·푸시하고 CI를 본다**

```bash
git -C c:/Users/dw581/project/korea-univ-project add supabase/migrations/20261025000000_add_building_photo_sort_order.sql supabase/database.types.ts
git -C c:/Users/dw581/project/korea-univ-project commit -m "feat(db): 건물 사진에 순서 칸을 두고 이웃한 두 장을 맞바꾸는 함수를 둔다"
git -C c:/Users/dw581/project/korea-univ-project push
```

Expected: `DB test`가 통과하고(새 파일 22개, 기존 두 파일도 고치지 않고 통과), `Migration safety`가 통과한다. 통과하면 PR을 ready로
바꾸고 이 계획 문서를 `git rm`하는 커밋을 더한다(`docs: 구현을 마친 멘토링 PR ①-1 계획 문서를 지운다`).

---

## 병합 뒤 확인

1. Actions의 `Apply Supabase migrations`가 `20261025000000`을 적용하고 이력 검증까지 통과했는지 본다.
2. 공개 읽기로 채우기를 확인한다(키는 출력하지 않는다): `building_photos?select=id,building_id,sort_order,created_at`를 받아 건물마다
   `sort_order` 순서와 `created_at, id`(빈 값은 뒤) 순서가 같고 0부터 빈틈없는지 스크립트로 본다.
3. 운영 공개 지도에서 사진이 있는 건물 상세를 열어 사진이 그대로 보이는지 본다(지금 코드는 `created_at` 순으로 읽으므로 화면은 같아야
   한다).
4. 관리자 활동 기록 화면에서 적용 시각 근처에 "건물 사진 수정"이 무더기로 쌓이지 않았는지 사용자에게 확인을 부탁한다(방문자 키로는
   활동 기록을 읽을 수 없다).
5. 병합된 브랜치를 로컬·원격에서 지우고(원격 삭제는 사용자 확인) PR ①-2 계획을 `main`에서 쓴다.
