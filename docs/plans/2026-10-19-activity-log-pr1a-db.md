# 관리자 감사 로그 PR 1a 구현 계획 — DB 검증 잡, 기록 저장소, 변경 트리거, 행위자 전달

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans로
> 태스크 순서대로 실행한다. 단계는 체크박스(`- [ ]`)로 추적한다. TDD로 간다 — 테스트를 먼저 커밋하고 기대한 이유로 실패하는지
> 본 뒤 구현을 커밋한다.

**Goal:** 운영 스키마 스냅샷 위에서 마이그레이션과 트리거를 시험하는 CI 잡을 세우고, `admin_users`·`is_admin()`·`activity_logs`와
대상 테이블의 변경 트리거를 넣는다. 서버의 service_role 쓰기가 행위자 헤더를 싣게 한다. **권한 검사는 바꾸지 않는다.**

**Architecture:** DB 쪽은 마이그레이션 두 파일 — 저장소(`admin_users`·`is_admin()`·`activity_logs`와 수정·삭제 금지 트리거)와
변경 트리거(`log_change()`와 보조 함수). 트리거는 PostgREST가 요청마다 넣는 `request.jwt.claims`·`request.headers`로 행위자를
정한다. 앱 쪽은 `supabaseAdmin(actor?)` 한 곳에서 `x-actor-id`·`x-actor-system` 헤더를 싣고, service_role 키를 직접 쓰던
라우트를 모두 이리로 옮긴다. CI의 `DB test` 잡이 스냅샷 → 새 마이그레이션 → pgTAP 순서로 돌고, 운영 적용 잡이 이 잡을 기다린다.

**Tech Stack:** Supabase CLI `2.109.1`(`supabase/setup-cli@v2`), Postgres(운영과 같은 major), pgTAP(`supabase test db`),
`psql`, Next.js 16.2.4 Route Handlers, `@supabase/supabase-js` 2.105, Vitest 3(node 환경).

**Spec:** `docs/specs/2026-10-19-activity-log-design.md`(이하 "설계 N.N") 2장, 3장, 7장(PR 1의 DB 부분), 8.3, 8.4의 세 번째
항목, 9장, 11장. 계획과 설계가 다르면 설계가 맞다 — 멈추고 보고한다.

**앞선 일:** PR 0(`2026-10-19-activity-log-pr0-schema-snapshot.md`)이 병합되고 `Schema snapshot` 워크플로가 한 번 돌아 산출물이
있어야 한다. 그 계획 Task 2의 점검 결과(확장·소유자·정책)를 이 PR 본문에 옮긴다.

**이 계획의 SQL:** 아래 두 마이그레이션과 pgTAP 두 파일은 2026-10-19에 PGlite(Postgres 17.5) 위에 Supabase를 흉내 낸 바탕
(`anon`·`authenticated`·`service_role` 역할, `auth.users`, Supabase 정의의 `auth.uid()`, 기초 테이블)을 깔고 돌려 51개 단언이
모두 통과했다. 일부러 넣은 결함 두 가지(자동 칸 제외 누락, 위조 헤더 신뢰)를 테스트가 잡는 것도 봤다. 실제 스냅샷 위에서는
CI의 `DB test`가 처음 확인한다.

## 진행 상황

| 태스크 | 상태 | 커밋 |
| ------ | ---- | ---- |
| 1      |      |      |
| 2      |      |      |
| 3      |      |      |
| 4      |      |      |
| 5      |      |      |
| 6      |      |      |
| 7      |      |      |
| 8      |      |      |

## Global Constraints

- **권한은 그대로다**(설계 7장). `requireAdmin`, 브라우저 쓰기 RLS, 관리자 화면 진입을 건드리지 않는다. 그것은 PR 2다.
- 마이그레이션은 새 파일만 더한다. 이름은 `^[0-9]{14}_[a-z0-9_]+\.sql$`(`scripts/check-migrations.sh`). 적용된 파일은 고치지
  않는다. 두 새 파일의 버전은 `supabase/migrations`의 가장 늦은 파일과 스냅샷 첫 줄의 버전보다 늦어야 하고, 저장소 파일이 트리거
  파일보다 앞서야 한다.
- Supabase CLI는 `2.109.1`로 고정한다(운영 적용 잡과 같다).
- `supabase/config.toml`에 `[db.migrations] enabled = false`를 두지 않는다. 운영 `db push`도 이 파일을 읽는다(설계 8.3의 2).
- pgTAP 파일은 `supabase/tests/` 바로 아래에 `*.test.sql`로 두고, 파일마다 `begin; … rollback;`으로 감싼다(설계 8.3의 5).
- 감사 보조 함수는 `public`에 두되 `public`·`anon`·`authenticated`에서 실행 권한을 회수한다. PostgREST는 `public` 함수를 RPC로
  드러낸다.
- vitest는 `environment: "node"`다. 라우트 테스트는 `vi.mock("@/lib/server/supabaseAdmin")` 방식(`src/test/queryStub.ts`)을 쓴다.
- 주석은 이유·외부 제약·위험만 적는다. 다른 파일의 줄 번호·개수·상수 값을 적지 않고 심볼 이름이나 설계 절로 가리킨다.
- 커밋 메시지는 한국어 `type(scope): 내용`. `Co-Authored-By`를 붙이지 않고, 작업 과정(리뷰·점검)을 적지 않는다.
- 이 저장소는 `core.autocrlf=true`다. 파일은 UTF-8로 쓴다. 커밋 전에 `rg -n "\x{FFFD}" <바꾼 파일>`로 깨진 글자가 없는지 본다
  (Git Bash의 `grep -P`는 이 검사를 조용히 놓친다).
- Next 16 문서는 `node_modules/next/dist/docs/`에 있다(AGENTS.md).

## 검증 방법

```bash
npm run typecheck
npm run test
npx eslint --ignore-pattern ".claude/**" .
npx prettier --check --end-of-line auto --ignore-path .prettierignore --ignore-path .gitignore . "!.claude/**"
npm run test:e2e        # 화면은 바꾸지 않지만 라우트를 옮기므로 PR을 열기 전에 한 번
```

- pgTAP은 로컬에 Docker가 없어 PR CI의 `DB test` 잡으로 돌린다. 그래서 **draft PR을 먼저 연다.** 테스트 커밋만 푸시해 `DB test`가
  기대한 이유로 실패하는 것을 본 뒤 마이그레이션 커밋을 푸시한다.
- `Apply Supabase migrations`는 PR에서 돌지 않는다(`push`·`workflow_dispatch`만). PR CI가 초록이어도 운영 적용은 병합 뒤다.

## 브랜치와 PR

`feat/activity-log-db`(PR 0이 병합된 `main`에서). Task 1에서 draft PR을 연다. 병합할 때 이 계획 문서를 `git rm`한다. PR 0 계획도
이 브랜치에서 지운다(그 계획 Task 2의 Step 4).

## 계획이 정한 것

1. **PR 나누기(설계 7장).** PR 1을 1a(이 계획: DB와 행위자 전달)와 1b(실패 기록과 로그 화면)로 나눈다. 1a만 병합된 동안 변경
   기록은 쌓이지만 화면이 없다 — 확인은 Table Editor로 한다. `supabaseAdmin(actor)`는 1a에 둔다. 트리거만 먼저 나가면 서버 쓰기가
   모두 `시스템(미상)`으로 남기 때문이다.
2. **스냅샷 자리(설계 8.3의 1).** `supabase/baseline/schema.sql`. 확장이 필요하면 `supabase/baseline/prelude.sql`(Task 1 분기).
3. **`config.toml`(설계 8.3의 2).** `project_id`와 `[db]`의 `port`·`major_version`만 둔다. 나머지는 CLI 기본값이다.
   `major_version`은 스냅샷 둘째 줄 `-- server-version:`의 첫 숫자다.
4. **적용 스크립트.** `scripts/apply-db-test-schema.sh <옮긴 마이그레이션 폴더>`. 스냅샷 첫 줄의 버전보다 큰 파일만 이름 순으로
   `psql -v ON_ERROR_STOP=1`로 적용한다. 스냅샷만 다른 계정으로 적용해야 하면 `BASELINE_DB_URL`로 바꾼다(Task 1 분기).
5. **마이그레이션 두 파일.** `<버전>_create_activity_logs.sql`(설계 2장), `<버전+1>_create_activity_log_triggers.sql`(설계 3장).
   아래 본문은 버전을 `20261020000000`·`20261020000001`로 적었다. 작업일이 다르면 그날 날짜로 바꾸되 순서를 지킨다.
6. **트리거 함수 구성.** `activity_actor()`(3.3 표), `activity_point_count(jsonb)`(형상 꼭짓점 — GeoJSON의 숫자 배열과 경사도의
   `{lat, lng}` 객체를 함께 센다), `activity_value(table, column, value, operation)`(3.5의 가림·형상·참조),
   `activity_facility_label(jsonb)`·`activity_target_label(table, jsonb)`(3.6), `log_change()`(본체, 트리거 인자로 기본 키 칸
   이름을 받는다: 대부분 `id`, `facility_types`는 `code`, `app_settings`는 `key`, `admin_users`는 `user_id`).
7. **3.3 표에 없던 경우.** `role = anon` → `visitor`·`방문자`(설계에 더했다). `authenticated`인데 `sub`가 없거나, 알 수 없는 역할 →
   `system`·`시스템(미상)`. `x-actor-id`가 UUID 모양이 아니면 그 헤더는 없는 것으로 본다.
8. **기록 실패 행(설계 3.7).** 행위자 `system`·`변경 기록`, `action = <테이블>.<동작>`, 문장 `변경 기록 실패: <sqlerrm>`(300자).
9. **`supabaseAdmin(actor?)`(설계 3.4).** `type Actor = { userId: string } | { system: "translation" | "osm_sync" }`. actor가 없으면
   지금처럼 모듈에 하나 캐시하고, 있으면 요청마다 `global.headers`를 실어 새로 만든다.
10. **라우트별 행위자.** Task 6의 표. 원칙: 기록 대상 테이블(설계 3.2)에 쓰는 관리자 라우트는 `{ userId: auth.user.id }`,
    `translate-facility`의 쓰기는 `{ system: "translation" }`, OSM 동기화는 `{ system: "osm_sync" }`. 읽기만 하거나 기록 대상이 아닌
    테이블에만 쓰는 경로(방문자 접수, 요청 사진, 정리)는 actor 없이 부른다.
11. **라우트 테스트.** service_role을 쓰는 라우트 테스트는 모두 `@/lib/server/supabaseAdmin`을 목으로 바꾸고(설계 8.4 세 번째),
    쓰기 라우트마다 "행위자를 넘긴다" 단언을 하나 더한다. 이것이 Task 6 완료 조건의 grep과 함께 누락을 잡는다.

---

### Task 1: 스냅샷을 커밋하고 로컬 DB 설정을 둔다

**Files:**

- Create: `supabase/baseline/schema.sql`(PR 0 산출물 그대로)
- Create: `supabase/config.toml`
- Create: `scripts/apply-db-test-schema.sh`
- Create(분기): `supabase/baseline/prelude.sql`
- Delete: `docs/plans/2026-10-19-activity-log-pr0-schema-snapshot.md`

- [ ] **Step 1: 산출물을 받아 넣는다**

```bash
gh run list --workflow=schema-snapshot.yml -L 1          # run id
gh run download <run-id> -n public-schema -D supabase/baseline
head -n 3 supabase/baseline/schema.sql
```

Expected: 첫 줄 `-- baseline-migration: <14자리>`, 둘째 줄 `-- server-version: <예: 17.4>`. 스냅샷은 손대지 않고 커밋한다.
`prettier`는 `.sql`을 다루지 않는다.

- [ ] **Step 2: `supabase/config.toml`을 쓴다** — `major_version`은 Step 1 둘째 줄의 첫 숫자로 바꾼다(아래는 17인 경우).

```toml
# supabase db start(CI의 DB test 잡)가 쓴다. 운영 db push도 이 파일을 읽으므로
# [db.migrations]를 끄지 않는다. 설계: docs/specs/2026-10-19-activity-log-design.md 8.3
project_id = "korea-univ-project"

[db]
port = 54322
major_version = 17
```

- [ ] **Step 3: 적용 스크립트를 쓴다** — `scripts/apply-db-test-schema.sh`

```bash
#!/usr/bin/env bash

# DB test 잡 전용. 운영 스키마 스냅샷 위에 스냅샷보다 새 마이그레이션만 얹는다.
# 설계: docs/specs/2026-10-19-activity-log-design.md 8.3

set -euo pipefail

migrations_dir="${1:?usage: apply-db-test-schema.sh <migrations dir>}"
db_url="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
baseline_db_url="${BASELINE_DB_URL:-$db_url}"
baseline="supabase/baseline/schema.sql"
prelude="supabase/baseline/prelude.sql"

baseline_version="$(head -n 1 "$baseline" | sed -n 's/^-- baseline-migration: \([0-9]\{14\}\)$/\1/p')"
if [[ -z "$baseline_version" ]]; then
  echo "::error::$baseline must start with '-- baseline-migration: <version>'."
  exit 1
fi

run_sql() {
  psql "$1" --quiet --no-psqlrc -v ON_ERROR_STOP=1 --file "$2"
}

if [[ -f "$prelude" ]]; then
  run_sql "$baseline_db_url" "$prelude"
fi
run_sql "$baseline_db_url" "$baseline"

applied=0
while IFS= read -r file; do
  version="$(basename "$file" | cut -d_ -f1)"
  if [[ "$version" > "$baseline_version" ]]; then
    echo "Applying $(basename "$file")"
    run_sql "$db_url" "$file"
    applied=$((applied + 1))
  fi
done < <(find "$migrations_dir" -maxdepth 1 -name '*.sql' | sort)
echo "Applied $applied migration(s) newer than $baseline_version."
```

- [ ] **Step 4: PR 0 계획을 은퇴시킨다** — `git rm docs/plans/2026-10-19-activity-log-pr0-schema-snapshot.md`
- [ ] **Step 5: 커밋**

```bash
git add supabase/baseline/schema.sql supabase/config.toml scripts/apply-db-test-schema.sh
git commit -m "chore(db): 운영 public 스키마 스냅샷과 로컬 DB 설정을 둔다"
```

Task 2에서 CI 잡을 붙여 이 스냅샷이 실제로 적용되는지 본다. 실패하면 아래 분기를 탄다(설계 11장 4의 남은 확인).

| 실패 문구                                                                   | 조치                                                                                                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `function extensions.<이름> does not exist`, `type … does not exist`        | `supabase/baseline/prelude.sql`에 `create extension if not exists "<확장>" with schema extensions;`를 둔다. 확장 이름은 덤프의 참조로 정한다. |
| `must be able to SET ROLE "supabase_admin"`, `permission denied … OWNER TO` | `ci.yml`의 적용 단계에 `BASELINE_DB_URL: postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres`를 env로 준다.                         |
| 그 밖                                                                       | 멈추고 보고한다. 스냅샷을 손으로 고치지 않는다 — 다시 뜰 때 같은 문제가 돌아온다.                                                             |

분기를 탔으면 설계 11장 4에 무엇이 필요했는지 날짜와 함께 한 줄 더한다.

### Task 2: CI의 DB test 잡

**Files:**

- Modify: `.github/workflows/ci.yml` (`jobs`에 `db-test` 추가, `migrate.needs`에 `db-test` 추가)

- [ ] **Step 1: 잡을 더한다** — `e2e` 잡 다음, `migrate` 잡 앞에 넣는다.

```yaml
db-test:
  name: DB test
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4

    - name: Set up Supabase CLI
      uses: supabase/setup-cli@v2
      with:
        version: 2.109.1
        github-token: ${{ github.token }}

    # 옮기는 이유: docs/specs/2026-10-19-activity-log-design.md 8.3의 3
    - name: Start local database without repository migrations
      shell: bash
      run: |
        set -euo pipefail
        mv supabase/migrations "$RUNNER_TEMP/migrations"
        supabase db start

    - name: Apply baseline snapshot and newer migrations
      shell: bash
      run: bash scripts/apply-db-test-schema.sh "$RUNNER_TEMP/migrations"

    - name: Run pgTAP tests
      run: supabase test db
```

- [ ] **Step 2: 운영 적용이 기다리게 한다**

```yaml
needs: [migration-safety, lint, format, typecheck, test, e2e, db-test]
```

- [ ] **Step 3: 커밋하고 draft PR을 연다**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: 운영 스키마 스냅샷 위에서 마이그레이션과 pgTAP을 돌리는 DB test 잡을 둔다"
git push -u origin feat/activity-log-db
gh pr create --draft --title "feat(db): 관리자 감사 로그의 저장소와 변경 트리거" --body "작성 중"
```

Expected: `DB test`가 초록. 테스트 파일이 아직 없어 pgTAP은 0건이고, CLI `2.109.1`은 0건을 성공으로 끝낸다. 이 잡이 빨갛다면
스냅샷 적용 단계의 로그를 보고 Task 1의 분기를 탄다. 로그의 `Applied N migration(s)`가 0이어야 한다(아직 새 마이그레이션 없음).

### Task 3: 저장소 — `admin_users`, `is_admin()`, `activity_logs`

**Files:**

- Create: `supabase/tests/activity_logs.test.sql`
- Create: `supabase/migrations/20261020000000_create_activity_logs.sql`

**Interfaces:**

- Produces: 테이블 `public.admin_users(user_id, display_name, created_at)`, `public.activity_logs`(설계 2.3의 칸 그대로), 함수
  `public.is_admin() returns boolean`(authenticated·service_role만 실행), 트리거 함수 `public.reject_activity_log_change()`.

- [ ] **Step 1: 테스트를 쓴다** — `supabase/tests/activity_logs.test.sql`

```sql
-- 설계: docs/specs/2026-10-19-activity-log-design.md 2장, 8.3
begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'stranger@example.com');
insert into public.admin_users (user_id, display_name)
values ('00000000-0000-4000-8000-000000000001', '관리자');
insert into public.activity_logs (level, kind, actor_kind, actor_label, action)
values ('error', 'failure', 'system', '시험', 'facility_photo.upload');

create function pg_temp.act_as(person uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', person, 'role', 'authenticated')::text, true);
end;
$$;

select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select ok(public.is_admin(), '목록에 있는 계정은 is_admin()이 참');
select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select ok(not public.is_admin(), '목록에 없는 계정은 is_admin()이 거짓');

set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.activity_logs) > 0, '관리자는 로그를 읽는다');
select throws_ok(
  $$insert into public.activity_logs (level, kind, actor_kind, actor_label, action)
    values ('info', 'change', 'admin', 'x', 'insert')$$,
  '42501', null, '관리자도 로그를 넣지 못한다');
select throws_ok($$update public.activity_logs set level = 'info'$$,
  '42501', null, '관리자도 로그를 고치지 못한다');
select throws_ok($$delete from public.activity_logs$$,
  '42501', null, '관리자도 로그를 지우지 못한다');
select throws_ok($$select * from public.admin_users$$,
  '42501', null, 'authenticated는 admin_users를 직접 읽지 못한다');
select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select is((select count(*) from public.activity_logs), 0::bigint,
  '목록에 없는 계정은 로그를 하나도 읽지 못한다');
reset role;

set local role anon;
select throws_ok($$select * from public.activity_logs$$,
  '42501', null, 'anon은 로그를 읽지 못한다');
select throws_ok($$select public.is_admin()$$,
  '42501', null, 'anon은 is_admin()을 부르지 못한다');
reset role;

set local role service_role;
select lives_ok(
  $$insert into public.activity_logs (level, kind, actor_kind, actor_label, action)
    values ('error', 'failure', 'visitor', '방문자', 'feedback.submit')$$,
  'service_role은 로그를 넣는다');
select throws_ok($$update public.activity_logs set level = 'info'$$,
  'P0001', 'activity_logs is append-only', 'service_role도 로그를 고치지 못한다');
select throws_ok($$delete from public.activity_logs$$,
  'P0001', 'activity_logs is append-only', 'service_role도 로그를 지우지 못한다');
select throws_ok($$truncate public.activity_logs$$,
  'P0001', 'activity_logs is append-only', 'service_role도 로그를 비우지 못한다');
reset role;

select throws_ok(
  $$insert into public.admin_users (user_id, display_name)
    values ('00000000-0000-4000-8000-000000000002', '   ')$$,
  '23514', null, '공백만 있는 표시 이름은 거부한다');
select throws_ok(
  $$insert into public.admin_users (user_id, display_name)
    values ('00000000-0000-4000-8000-000000000002', repeat('가', 21))$$,
  '23514', null, '21자 표시 이름은 거부한다');

select * from finish();
rollback;
```

- [ ] **Step 2: 테스트만 커밋해 푸시하고 실패를 본다**

```bash
git add supabase/tests/activity_logs.test.sql
git commit -m "test(db): 관리자 목록과 감사 로그의 권한·수정 금지를 pgTAP으로 시험한다"
git push
```

Expected: `DB test`의 `Run pgTAP tests`가 `relation "public.admin_users" does not exist`로 실패.

- [ ] **Step 3: 마이그레이션을 쓴다** — `supabase/migrations/20261020000000_create_activity_logs.sql`

```sql
-- 관리자 허용 목록과 감사 로그. 설계: docs/specs/2026-10-19-activity-log-design.md 2장

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 20),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

create table public.activity_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  level text not null check (level in ('info', 'warning', 'error')),
  kind text not null check (kind in ('change', 'failure')),
  actor_kind text not null check (actor_kind in ('admin', 'system', 'visitor')),
  actor_id uuid,
  actor_label text not null,
  action text not null,
  target_table text,
  target_id text,
  target_label text,
  changes jsonb,
  reason_code text,
  message text,
  detail jsonb,
  client_event_id uuid unique
);

create index activity_logs_occurred_idx
  on public.activity_logs (occurred_at desc, id desc);
create index activity_logs_level_occurred_idx
  on public.activity_logs (level, occurred_at desc, id desc);

alter table public.activity_logs enable row level security;
revoke all on table public.activity_logs from anon, authenticated;
grant select on table public.activity_logs to authenticated;

create policy activity_logs_admin_read
  on public.activity_logs for select
  to authenticated
  using (public.is_admin());

create function public.reject_activity_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'activity_logs is append-only';
end;
$$;

create trigger activity_logs_append_only
  before update or delete on public.activity_logs
  for each row execute function public.reject_activity_log_change();

create trigger activity_logs_no_truncate
  before truncate on public.activity_logs
  for each statement execute function public.reject_activity_log_change();
```

- [ ] **Step 4: 커밋해 푸시하고 통과를 본다**

```bash
git add supabase/migrations/20261020000000_create_activity_logs.sql
git commit -m "feat(db): 관리자 허용 목록과 고칠 수 없는 감사 로그 테이블을 둔다"
git push
```

Expected: `Migration safety` 초록(새 파일만 추가), `DB test`의 적용 단계 `Applied 1 migration(s)`, pgTAP `activity_logs.test.sql`
16개 통과.

### Task 4: 변경 트리거

**Files:**

- Create: `supabase/tests/activity_log_triggers.test.sql`
- Create: `supabase/migrations/20261020000001_create_activity_log_triggers.sql`

**Interfaces:**

- Consumes: Task 3의 `admin_users`·`activity_logs`.
- Produces: 대상 테이블 12개(설계 3.2)의 `log_<테이블>_change` 트리거. 행위자 헤더 이름 `x-actor-id`·`x-actor-system`(Task 5가
  싣는다), 시스템 코드 `translation`·`osm_sync`·`script`.

- [ ] **Step 1: 테스트를 쓴다** — `supabase/tests/activity_log_triggers.test.sql`

```sql
-- 설계: docs/specs/2026-10-19-activity-log-design.md 3장, 8.3
begin;
select plan(35);

create function pg_temp.request(claims jsonb, headers jsonb default '{}'::jsonb)
returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', coalesce(claims::text, ''), true);
  perform set_config('request.headers', headers::text, true);
end;
$$;

create function pg_temp.last_log() returns public.activity_logs
language sql as $$
  select * from public.activity_logs order by id desc limit 1;
$$;

create function pg_temp.log_count() returns bigint
language sql as $$
  select count(*) from public.activity_logs;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'stranger@example.com');

-- 요청 클레임이 없으면 SQL Editor·Table Editor와 같은 직접 접속이다.
select pg_temp.request(null);
insert into public.admin_users (user_id, display_name)
values ('00000000-0000-4000-8000-000000000001', '관리자');
select is((pg_temp.last_log()).actor_label, 'DB 직접 변경', '클레임이 빈 문자열이면 DB 직접 변경');
select is(
  ((pg_temp.last_log()).target_table, (pg_temp.last_log()).action, (pg_temp.last_log()).target_label),
  ('admin_users'::text, 'insert'::text, '관리자 관리자'::text),
  '관리자 목록 등록을 기록한다');

insert into public.facility_types (code, label) values ('ramp', '경사로'), ('lift', '승강기');
insert into public.colleges (name) values ('공과대학');
insert into public.buildings (id, name, college_id)
values (10, '하나스퀘어', (select id from public.colleges where name = '공과대학'));
insert into public.landmarks (id, name, lat, lng)
values ('10000000-0000-4000-8000-000000000001', '중앙광장', 37.5, 127.0);

-- 행위자
select pg_temp.request('{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}');
update public.landmarks set name = '중앙 광장' where name = '중앙광장';
select is(
  ((pg_temp.last_log()).actor_kind, (pg_temp.last_log()).actor_id, (pg_temp.last_log()).actor_label),
  ('admin'::text, '00000000-0000-4000-8000-000000000001'::uuid, '관리자'::text),
  'authenticated 요청은 그 계정의 표시 이름');

select pg_temp.request(
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',
  '{"x-actor-id":"00000000-0000-4000-8000-000000000002"}');
update public.landmarks set name = '중앙광장' where name = '중앙 광장';
select is((pg_temp.last_log()).actor_label, '관리자', 'authenticated 요청에 위조한 x-actor-id는 무시한다');

select pg_temp.request('{"role":"service_role"}', '{"x-actor-id":"00000000-0000-4000-8000-000000000001"}');
update public.landmarks set name = '중앙 광장' where name = '중앙광장';
select is((pg_temp.last_log()).actor_label, '관리자', 'service_role + x-actor-id는 그 관리자');

select pg_temp.request('{"role":"service_role"}', '{"x-actor-system":"translation"}');
update public.landmarks set name = '중앙광장' where name = '중앙 광장';
select is(
  ((pg_temp.last_log()).actor_kind, (pg_temp.last_log()).actor_label),
  ('system'::text, '자동 번역'::text),
  'service_role + x-actor-system은 시스템 이름');

select pg_temp.request('{"role":"service_role"}');
update public.landmarks set name = '중앙 광장' where name = '중앙광장';
select is((pg_temp.last_log()).actor_label, '시스템(미상)', '헤더 없는 service_role은 시스템(미상)');

select pg_temp.request('{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}');
update public.landmarks set name = '중앙광장' where name = '중앙 광장';
select is((pg_temp.last_log()).actor_label, '미등록 계정(stranger@example.com)',
  '목록에 없는 계정은 미등록 계정(이메일)');

-- 기록 내용
select pg_temp.request('{"role":"service_role"}', '{"x-actor-id":"00000000-0000-4000-8000-000000000001"}');
update public.landmarks set name = '분수대', lat = 37.6 where name = '중앙광장';
select is((pg_temp.last_log()).changes,
  '{"name":["중앙광장","분수대"],"lat":[37.5,37.6]}'::jsonb,
  '수정은 바뀐 칸만 [이전, 이후]로 남긴다');

create temp table baseline as select pg_temp.log_count() as n;
update public.landmarks set name = '분수대' where name = '분수대';
select is(pg_temp.log_count(), (select n from baseline), '값이 같은 수정은 행을 남기지 않는다');
update public.landmarks set updated_at = now() + interval '1 minute' where name = '분수대';
select is(pg_temp.log_count(), (select n from baseline), '자동 칸만 바뀐 수정은 행을 남기지 않는다');

insert into public.building_facilities (id, building_id, facility_code, name)
values ('20000000-0000-4000-8000-000000000001', 10, 'ramp', null);
select ok(not ((pg_temp.last_log()).changes ? 'name'), '등록은 null 칸을 뺀다');
select is((pg_temp.last_log()).changes -> 'facility_code',
  '{"value":"ramp","label":"경사로"}'::jsonb, '참조 칸은 { value, label }');
select is((pg_temp.last_log()).changes -> 'building_id',
  '{"value":10,"label":"하나스퀘어"}'::jsonb, '건물 참조도 { value, label }');
select is((pg_temp.last_log()).target_label, '하나스퀘어 · 경사로',
  '시설 이름이 없으면 시설 종류 이름');

update public.facility_types set label = '경사 진입로' where code = 'ramp';
select is(
  (select changes -> 'facility_code' ->> 'label' from public.activity_logs
   where target_id = '20000000-0000-4000-8000-000000000001' and action = 'insert'),
  '경사로', '종류 이름을 바꿔도 기록된 label은 그대로');

insert into public.building_facilities (id, facility_code, name)
values ('20000000-0000-4000-8000-000000000002', 'lift', '정문 승강기');
select is((pg_temp.last_log()).target_label, '정문 승강기', '독립 시설은 건물명 없이');

insert into public.facility_photos (facility_id, storage_path, sort_order)
values ('20000000-0000-4000-8000-000000000001', 'f/1.webp', 0);
select is((pg_temp.last_log()).target_label, '하나스퀘어 · 경사 진입로 사진', '시설 사진 대상 이름');

insert into public.building_photos (building_id, url) values (10, 'https://cdn.test/b.webp');
select is((pg_temp.last_log()).target_label, '하나스퀘어 사진', '건물 사진 대상 이름');

update public.buildings
set geojson = '{"type":"Polygon","coordinates":[[[127,37],[127.1,37],[127.1,37.1],[127,37]]]}'
where id = 10;
select is((pg_temp.last_log()).changes -> 'geojson' -> 1,
  '{"changed":true,"points":4}'::jsonb, '형상 칸은 꼭짓점 수로 요약');

insert into public.slope_segments (name, segments)
values ('정문 오르막', '[{"lat":37.58,"lng":127.02},{"lat":37.581,"lng":127.021,"slope":7.2}]');
select is((pg_temp.last_log()).changes -> 'segments',
  '{"changed":true,"points":2}'::jsonb, '경사도 경로도 꼭짓점 수로 요약');

delete from public.slope_segments where name = '정문 오르막';
select is((pg_temp.last_log()).changes -> 'segments' -> 0 ->> 'lat', '37.58',
  '삭제는 형상 칸도 값을 그대로 남긴다');
select ok((pg_temp.last_log()).changes ? 'name', '삭제는 행 전체를 남긴다');

-- 방문자 입력
select pg_temp.request(null);
insert into public.feedback_submissions (id, feedback_type, content)
values ('30000000-0000-4000-8000-000000000001', 'error', '연락처 010-0000-0000');
insert into public.facility_requests (id, building_id, facility_code, description, client_hash)
values ('40000000-0000-4000-8000-000000000001', 10, 'ramp', '전화 주세요', 'hash');
select is(
  (select count(*) from public.activity_logs
   where target_table in ('feedback_submissions', 'facility_requests')),
  0::bigint, '방문자 접수(등록)는 기록하지 않는다');

select pg_temp.request('{"role":"service_role"}', '{"x-actor-id":"00000000-0000-4000-8000-000000000001"}');
update public.feedback_submissions set content = '내용 수정', status = 'resolved'
where id = '30000000-0000-4000-8000-000000000001';
select is((pg_temp.last_log()).changes -> 'content',
  '[{"redacted":true,"length":17},{"redacted":true,"length":5}]'::jsonb,
  '의견 본문은 수정 기록에서 가린다');
select is((pg_temp.last_log()).target_label, '의견 제보 #30000000', '의견 대상 이름에 본문이 없다');

delete from public.feedback_submissions where id = '30000000-0000-4000-8000-000000000001';
select is((pg_temp.last_log()).changes -> 'content',
  '{"redacted":true,"length":5}'::jsonb, '의견 본문은 삭제 기록에서도 가린다');

update public.facility_requests set status = 'approved'
where id = '40000000-0000-4000-8000-000000000001';
select is(
  ((pg_temp.last_log()).changes, (pg_temp.last_log()).target_label),
  ('{"status":["new","approved"]}'::jsonb, '경사 진입로 등록 요청'::text),
  '등록 요청 상태 변경을 남기고 client_hash는 빼며 대상은 종류 이름');
delete from public.facility_requests where id = '40000000-0000-4000-8000-000000000001';
select ok(not ((pg_temp.last_log()).changes ? 'client_hash')
  and (pg_temp.last_log()).changes -> 'description' = '{"redacted":true,"length":6}'::jsonb,
  '등록 요청 삭제 기록도 설명을 가리고 client_hash를 뺀다');

delete from public.admin_users where user_id = '00000000-0000-4000-8000-000000000001';
select is(((pg_temp.last_log()).target_table, (pg_temp.last_log()).action),
  ('admin_users'::text, 'delete'::text), '관리자 목록 삭제를 기록한다');

-- 안전장치(설계 3.7)
alter table public.facility_types rename column label to label_renamed;
select lives_ok(
  $$update public.building_facilities set floor_info = '1층'
    where id = '20000000-0000-4000-8000-000000000001'$$,
  '내용을 만들다 실패해도 저장은 성공한다');
select is(
  ((pg_temp.last_log()).level, (pg_temp.last_log()).reason_code, (pg_temp.last_log()).action),
  ('error'::text, 'audit_write_failed'::text, 'building_facilities.update'::text),
  '그 실패를 audit_write_failed로 남긴다');
alter table public.facility_types rename column label_renamed to label;

alter table public.activity_logs add constraint block_all check (false) not valid;
truncate baseline;
insert into baseline select pg_temp.log_count();
select lives_ok(
  $$update public.building_facilities set floor_info = '2층'
    where id = '20000000-0000-4000-8000-000000000001'$$,
  '기록 테이블 쓰기가 실패해도 저장은 성공한다');
select is(
  (select floor_info from public.building_facilities where id = '20000000-0000-4000-8000-000000000001'),
  '2층', '저장된 값이 남는다');
select is(pg_temp.log_count(), (select n from baseline), '기록하지 못한 행은 남지 않는다');

select * from finish();
rollback;
```

이 테스트는 스냅샷의 기초 테이블에 행을 넣는다. 스냅샷의 실제 제약(예: `buildings`의 다른 not null 칸)이 위 `insert`를 막으면
그 칸을 넣도록 테스트의 `insert`만 고친다. 단언은 바꾸지 않는다.

- [ ] **Step 2: 테스트만 커밋해 푸시하고 실패를 본다**

```bash
git add supabase/tests/activity_log_triggers.test.sql
git commit -m "test(db): 변경 트리거의 행위자·기록 내용·안전장치를 pgTAP으로 시험한다"
git push
```

Expected: 첫 단언 `클레임이 빈 문자열이면 DB 직접 변경`부터 실패(트리거가 없어 `last_log()`가 null).

- [ ] **Step 3: 마이그레이션을 쓴다** — `supabase/migrations/20261020000001_create_activity_log_triggers.sql`

```sql
-- 변경 기록 트리거. 설계: docs/specs/2026-10-19-activity-log-design.md 3장

-- PostgREST는 request.* 값을 트랜잭션 로컬로 설정한다. 같은 세션의 다음 트랜잭션에서는
-- NULL이 아니라 ''가 남아 nullif로 둘 다 "없음"으로 읽는다(설계 11장 1).
create function public.activity_actor(
  out actor_kind text,
  out actor_id uuid,
  out actor_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  claimed_role text := claims ->> 'role';
  header_actor text := headers ->> 'x-actor-id';
  header_system text := headers ->> 'x-actor-system';
  person uuid;
begin
  if claims is null then
    actor_kind := 'system';
    actor_label := 'DB 직접 변경';
    return;
  end if;

  if claimed_role = 'authenticated' then
    person := nullif(claims ->> 'sub', '')::uuid;
  elsif claimed_role = 'service_role'
    and header_actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    person := header_actor::uuid;
  elsif claimed_role = 'service_role' then
    actor_kind := 'system';
    actor_label := case header_system
      when 'translation' then '자동 번역'
      when 'osm_sync' then 'OSM 동기화'
      when 'script' then '운영 스크립트'
      else '시스템(미상)'
    end;
    return;
  elsif claimed_role = 'anon' then
    actor_kind := 'visitor';
    actor_label := '방문자';
    return;
  end if;

  if person is null then
    actor_kind := 'system';
    actor_label := '시스템(미상)';
    return;
  end if;

  actor_kind := 'admin';
  actor_id := person;
  select a.display_name into actor_label
  from public.admin_users a
  where a.user_id = person;
  if actor_label is null then
    select '미등록 계정(' || coalesce(u.email, person::text) || ')' into actor_label
    from auth.users u
    where u.id = person;
    actor_label := coalesce(actor_label, '미등록 계정(' || person::text || ')');
  end if;
end;
$$;

create function public.activity_point_count(shape jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from jsonb_path_query(shape, 'strict $.**') as node
  where (jsonb_typeof(node) = 'array' and jsonb_typeof(node -> 0) = 'number')
     or (jsonb_typeof(node) = 'object' and jsonb_typeof(node -> 'lat') = 'number');
$$;

create function public.activity_value(
  table_name text,
  column_name text,
  value jsonb,
  operation text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if value is null or jsonb_typeof(value) = 'null' then
    return value;
  end if;

  if (table_name, column_name) in (
    ('feedback_submissions', 'content'),
    ('facility_requests', 'description')
  ) then
    return jsonb_build_object('redacted', true, 'length', char_length(value #>> '{}'));
  end if;

  if operation <> 'delete' and (table_name, column_name) in (
    ('buildings', 'geojson'),
    ('slope_segments', 'segments')
  ) then
    return jsonb_build_object('changed', true, 'points', public.activity_point_count(value));
  end if;

  if column_name = 'facility_code' then
    return jsonb_build_object('value', value, 'label',
      (select t.label from public.facility_types t where t.code = value #>> '{}'));
  elsif column_name = 'building_id' then
    return jsonb_build_object('value', value, 'label',
      (select b.name from public.buildings b where b.id = (value #>> '{}')::bigint));
  elsif column_name = 'college_id' then
    return jsonb_build_object('value', value, 'label',
      (select c.name from public.colleges c where c.id = (value #>> '{}')::bigint));
  end if;

  return value;
end;
$$;

create function public.activity_facility_label(facility jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(concat_ws(' · ',
    (select b.name from public.buildings b where b.id = (facility ->> 'building_id')::bigint),
    coalesce(
      nullif(facility ->> 'name', ''),
      (select t.label from public.facility_types t where t.code = facility ->> 'facility_code')
    )
  ), '');
$$;

create function public.activity_target_label(table_name text, row_data jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  label text;
begin
  case table_name
    when 'buildings', 'landmarks', 'slope_segments', 'colleges' then
      return row_data ->> 'name';
    when 'facility_types' then
      return row_data ->> 'label';
    when 'app_settings' then
      return row_data ->> 'key';
    when 'admin_users' then
      return '관리자 ' || (row_data ->> 'display_name');
    when 'feedback_submissions' then
      return '의견 제보 #' || left(row_data ->> 'id', 8);
    when 'building_facilities' then
      return public.activity_facility_label(row_data);
    when 'facility_photos' then
      select public.activity_facility_label(to_jsonb(f)) into label
      from public.building_facilities f
      where f.id = (row_data ->> 'facility_id')::uuid;
      return label || ' 사진';
    when 'building_photos' then
      select b.name into label
      from public.buildings b
      where b.id = (row_data ->> 'building_id')::bigint;
      return label || ' 사진';
    when 'facility_requests' then
      return coalesce(
        nullif(row_data ->> 'name', ''),
        (select t.label from public.facility_types t where t.code = row_data ->> 'facility_code')
      ) || ' 등록 요청';
    else
      return null;
  end case;
end;
$$;

-- 기록이 실패해도 원래 저장은 진행한다. 내용을 만들다 난 오류는 audit_write_failed 행으로
-- 남기고, 그 행마저 못 넣으면 warning으로 끝낸다(설계 3.7).
create function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_column text := tg_argv[0];
  operation text := lower(tg_op);
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  source_row jsonb := coalesce(new_row, old_row);
  row_key text := source_row ->> key_column;
  ignored text[] := array['created_at', 'updated_at', 'last_updated', 'client_hash'];
  diff jsonb := '{}'::jsonb;
  column_name text;
  actor record;
begin
  begin
    if tg_op = 'UPDATE' then
      for column_name in select jsonb_object_keys(new_row) loop
        continue when column_name = any(ignored);
        continue when new_row -> column_name is not distinct from old_row -> column_name;
        diff := diff || jsonb_build_object(column_name, jsonb_build_array(
          public.activity_value(tg_table_name, column_name, old_row -> column_name, operation),
          public.activity_value(tg_table_name, column_name, new_row -> column_name, operation)
        ));
      end loop;
      if diff = '{}'::jsonb then
        return null;
      end if;
    else
      for column_name in select jsonb_object_keys(source_row) loop
        continue when column_name = any(ignored);
        continue when tg_op = 'INSERT' and jsonb_typeof(source_row -> column_name) = 'null';
        diff := diff || jsonb_build_object(column_name,
          public.activity_value(tg_table_name, column_name, source_row -> column_name, operation));
      end loop;
    end if;

    select * into actor from public.activity_actor();
    insert into public.activity_logs (
      level, kind, actor_kind, actor_id, actor_label, action,
      target_table, target_id, target_label, changes
    ) values (
      'info', 'change', actor.actor_kind, actor.actor_id, actor.actor_label, operation,
      tg_table_name, row_key, public.activity_target_label(tg_table_name, source_row), diff
    );
  exception when others then
    begin
      insert into public.activity_logs (
        level, kind, actor_kind, actor_label, action,
        target_table, target_id, reason_code, message
      ) values (
        'error', 'failure', 'system', '변경 기록', tg_table_name || '.' || operation,
        tg_table_name, row_key, 'audit_write_failed', left('변경 기록 실패: ' || sqlerrm, 300)
      );
    exception when others then
      raise warning 'activity log write failed for %.% %: %',
        tg_table_name, row_key, operation, sqlerrm;
    end;
  end;
  return null;
end;
$$;

revoke all on function public.activity_actor() from public, anon, authenticated;
revoke all on function public.activity_point_count(jsonb) from public, anon, authenticated;
revoke all on function public.activity_value(text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.activity_facility_label(jsonb) from public, anon, authenticated;
revoke all on function public.activity_target_label(text, jsonb) from public, anon, authenticated;
revoke all on function public.log_change() from public, anon, authenticated;

create trigger log_buildings_change
  after insert or update or delete on public.buildings
  for each row execute function public.log_change('id');
create trigger log_building_facilities_change
  after insert or update or delete on public.building_facilities
  for each row execute function public.log_change('id');
create trigger log_building_photos_change
  after insert or update or delete on public.building_photos
  for each row execute function public.log_change('id');
create trigger log_facility_photos_change
  after insert or update or delete on public.facility_photos
  for each row execute function public.log_change('id');
create trigger log_landmarks_change
  after insert or update or delete on public.landmarks
  for each row execute function public.log_change('id');
create trigger log_slope_segments_change
  after insert or update or delete on public.slope_segments
  for each row execute function public.log_change('id');
create trigger log_colleges_change
  after insert or update or delete on public.colleges
  for each row execute function public.log_change('id');
create trigger log_facility_types_change
  after insert or update or delete on public.facility_types
  for each row execute function public.log_change('code');
create trigger log_app_settings_change
  after insert or update or delete on public.app_settings
  for each row execute function public.log_change('key');
create trigger log_admin_users_change
  after insert or update or delete on public.admin_users
  for each row execute function public.log_change('user_id');
create trigger log_facility_requests_change
  after update or delete on public.facility_requests
  for each row execute function public.log_change('id');
create trigger log_feedback_submissions_change
  after update or delete on public.feedback_submissions
  for each row execute function public.log_change('id');
```

- [ ] **Step 4: 커밋해 푸시하고 통과를 본다**

```bash
git add supabase/migrations/20261020000001_create_activity_log_triggers.sql
git commit -m "feat(db): 대상 테이블의 변경을 행위자와 함께 감사 로그에 남기는 트리거를 둔다"
git push
```

Expected: pgTAP 두 파일 51개 통과.

### Task 5: 생성 타입에 새 테이블과 함수를 더한다

**Files:**

- Modify: `supabase/database.types.ts`

로컬에 Supabase CLI·Docker가 없어 손으로 더한다(`docs/specs/2026-08-13-public-map-lucide-icons-design.md`의 선례). 감사 보조
함수(`activity_*`, `log_change`)는 앱이 부르지 않으므로 넣지 않는다.

- [ ] **Step 1: `public.Tables`의 맨 앞(`app_settings` 앞)에 넣는다**

<!-- prettier-ignore -->
```ts
      activity_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_kind: string;
          actor_label: string;
          changes: Json | null;
          client_event_id: string | null;
          detail: Json | null;
          id: number;
          kind: string;
          level: string;
          message: string | null;
          occurred_at: string;
          reason_code: string | null;
          recorded_at: string;
          target_id: string | null;
          target_label: string | null;
          target_table: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_kind: string;
          actor_label: string;
          changes?: Json | null;
          client_event_id?: string | null;
          detail?: Json | null;
          id?: never;
          kind: string;
          level: string;
          message?: string | null;
          occurred_at?: string;
          reason_code?: string | null;
          recorded_at?: string;
          target_id?: string | null;
          target_label?: string | null;
          target_table?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_kind?: string;
          actor_label?: string;
          changes?: Json | null;
          client_event_id?: string | null;
          detail?: Json | null;
          id?: never;
          kind?: string;
          level?: string;
          message?: string | null;
          occurred_at?: string;
          reason_code?: string | null;
          recorded_at?: string;
          target_id?: string | null;
          target_label?: string | null;
          target_table?: string | null;
        };
        Relationships: [];
      };
      admin_users: {
        Row: {
          created_at: string;
          display_name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 2: `public.Functions`에 넣는다**(`get_admin_building_summary` 다음, 이름 순)

<!-- prettier-ignore -->
```ts
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
```

- [ ] **Step 3: 확인하고 커밋** — `npm run typecheck` 통과.

```bash
git add supabase/database.types.ts
git commit -m "chore(types): 감사 로그·관리자 목록 테이블과 is_admin()을 생성 타입에 더한다"
```

### Task 6: `supabaseAdmin(actor)`와 라우트 이전

**Files:**

- Create: `src/lib/server/supabaseAdmin.test.ts`
- Modify: `src/lib/server/supabaseAdmin.ts`
- Modify: 아래 표의 `route.ts`와 그 `route.test.ts`

**Interfaces:**

- Produces: `export type Actor = { userId: string } | { system: "translation" | "osm_sync" }`,
  `export function supabaseAdmin(actor?: Actor): SupabaseClient<Database>`. PR 1b·PR 2가 이 이름으로 부른다.

- [ ] **Step 1: 테스트를 쓴다** — `src/lib/server/supabaseAdmin.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn(() => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

async function load() {
  vi.resetModules();
  return import("./supabaseAdmin");
}

describe("supabaseAdmin", () => {
  beforeEach(() => {
    createClient.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  });

  it("actor가 없으면 헤더 없이 한 번만 만든다", async () => {
    const { supabaseAdmin } = await load();
    expect(supabaseAdmin()).toBe(supabaseAdmin());
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith("https://db.test", "service-key");
  });

  it("관리자 actor는 x-actor-id를 싣는다", async () => {
    const { supabaseAdmin } = await load();
    supabaseAdmin({ userId: "user-1" });
    expect(createClient).toHaveBeenCalledWith(
      "https://db.test",
      "service-key",
      { global: { headers: { "x-actor-id": "user-1" } } },
    );
  });

  it("시스템 actor는 x-actor-system을 싣는다", async () => {
    const { supabaseAdmin } = await load();
    supabaseAdmin({ system: "translation" });
    expect(createClient).toHaveBeenCalledWith(
      "https://db.test",
      "service-key",
      { global: { headers: { "x-actor-system": "translation" } } },
    );
  });

  it("actor가 있는 클라이언트는 요청마다 새로 만든다", async () => {
    const { supabaseAdmin } = await load();
    supabaseAdmin({ userId: "user-1" });
    supabaseAdmin({ userId: "user-2" });
    supabaseAdmin();
    supabaseAdmin();
    expect(createClient).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: 실패를 본다** — `npx vitest run src/lib/server/supabaseAdmin.test.ts`. Expected: 둘째·셋째·넷째 테스트 실패(헤더가 실리지
      않고, actor가 있어도 캐시된 하나를 돌려준다). 커밋한다: `test(server): service_role 클라이언트가 행위자 헤더를 싣는지 시험한다`.

- [ ] **Step 3: 구현** — `src/lib/server/supabaseAdmin.ts` 전체를 바꾼다.

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@supabase-types";

/** 트리거가 행위자를 정하는 헤더의 원천. 규칙: docs/specs/2026-10-19-activity-log-design.md 3.3·3.4 */
export type Actor = { userId: string } | { system: "translation" | "osm_sync" };

let anonymous: SupabaseClient<Database> | null = null;

function create(headers?: Record<string, string>): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return headers
    ? createClient<Database>(url, key, { global: { headers } })
    : createClient<Database>(url, key);
}

/** 서비스 키라 RLS를 우회한다. 서버 라우트에서만 import한다. 쓰는 라우트는 actor를 넘긴다. */
export function supabaseAdmin(actor?: Actor): SupabaseClient<Database> {
  if (!actor) return (anonymous ??= create());
  return create(
    "userId" in actor
      ? { "x-actor-id": actor.userId }
      : { "x-actor-system": actor.system },
  );
}
```

Run: `npx vitest run src/lib/server/supabaseAdmin.test.ts` → 4개 통과. 커밋: `feat(server): service_role 클라이언트에 행위자 헤더를 싣는다`.

- [ ] **Step 4: 라우트를 옮긴다.** 모듈 수준에서 `createClient(…, SUPABASE_SERVICE_ROLE_KEY)`를 만들던 라우트는 다음을 한다.
  1. 그 `const <변수> = createClient(...)` 블록을 지운다. `createClient`를 더 쓰지 않으면 그 import도 지운다
     (`settings/feedback-emails`는 `verifyAdmin`이 anon 클라이언트를 만들어 남는다).
  2. `import { supabaseAdmin } from "@/lib/server/supabaseAdmin";`를 더한다.
  3. 핸들러 안 `if (auth.response) return auth.response;` 바로 다음(인증이 없는 라우트는 핸들러 첫 줄)에
     `const db = supabaseAdmin(<표의 actor>);`를 두고, 핸들러 안의 `<변수>.`를 `db.`로 바꾼다.

  이미 `supabaseAdmin()`을 쓰는 라우트는 표의 줄에 actor만 넣는다.

  | 라우트(`src/app/api/…/route.ts`) | 지금                           | 바꾼 뒤                                                                                     |
  | -------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
  | `buildings`                      | 모듈 `supabase`                | GET 일반 경로 `supabaseAdmin()`, 동기화 `handleSync(supabaseAdmin({ system: "osm_sync" }))` |
  | `delete-building-photo`          | 모듈 `supabaseAdmin`           | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `delete-facility-video`          | 모듈 `supabaseAdmin`           | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `delete-landmark-photo`          | 모듈 `supabaseAdmin<Database>` | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `facilities`                     | 모듈 `supabase`                | `supabaseAdmin()` (읽기)                                                                    |
  | `facility-video-confirm`         | 모듈 `supabaseAdmin`           | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `feedback`                       | 모듈 `admin`                   | `supabaseAdmin()` (방문자 등록은 기록 대상 아님)                                            |
  | `landmarks`                      | 모듈 `supabase<Database>`      | `supabaseAdmin()` (읽기)                                                                    |
  | `settings/feedback-emails`       | 모듈 `admin`                   | `supabaseAdmin({ userId: user.id })` (`verifyAdmin`의 `user`)                               |
  | `upload-building-photo`          | 모듈 `supabaseAdmin`           | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `upload-facility-video`          | 모듈 `supabaseAdmin`           | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `upload-landmark-photo`          | 모듈 `supabaseAdmin<Database>` | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `admin-feedback/[id]`            | `supabaseAdmin()`              | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `delete-facility-photo`          | `supabaseAdmin()`              | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `delete-facility-photos`         | `supabaseAdmin()`              | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `facility-requests/[id]/approve` | `supabaseAdmin()`              | `supabaseAdmin({ userId: auth.user.id })` — RPC 안의 쓰기도 같은 요청이라 승인자가 남는다   |
  | `facility-requests/[id]/reject`  | `supabaseAdmin()`              | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `facility-requests/[id]/status`  | `supabaseAdmin()`              | `supabaseAdmin({ userId: auth.user.id })`                                                   |
  | `translate-facility`             | `supabaseAdmin()` 둘           | `translateAndStore`의 쓰기 `supabaseAdmin({ system: "translation" })`, 조회는 그대로        |
  | `upload-facility-photo`          | `supabaseAdmin()`              | `supabaseAdmin({ userId: auth.user.id })`                                                   |

  `buildings`는 보조 함수가 모듈 클라이언트를 쓰는 유일한 라우트다. `handleSync(db: SupabaseClient<Database>)`로 받게 하고
  (`import type { SupabaseClient } from "@supabase/supabase-js"`, `import type { Database } from "@supabase-types"`), GET은 타입이
  생긴 결과를 아래처럼 좁힌다 — 지금은 타입 없는 클라이언트라 `b.geojson?.geometry`가 통과했다.

  ```ts
  type BuildingFeature = {
    geometry?: { type?: string };
    properties?: Record<string, unknown>;
  };

  const { data, error } = await supabaseAdmin()
    .from("buildings")
    .select("id, name, name_en, geojson")
    .not("geojson", "is", null)
    .eq("is_deleted", false);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = data as unknown as {
    id: number;
    name: string | null;
    name_en: string | null;
    geojson: BuildingFeature | null;
  }[];
  const featureCollection = {
    type: "FeatureCollection",
    features: rows
      .filter((b) => b.geojson?.geometry?.type === "Polygon")
      .map((b) => ({
        ...b.geojson,
        properties: {
          ...b.geojson?.properties,
          id: b.id,
          name: b.name,
          name_en: b.name_en,
        },
      })),
  };
  ```

  다른 라우트에서 타입 오류가 나면 값의 타입을 `supabase/database.types.ts`의 `Row`·`Insert`·`Update`에 맞춘다. `any`·
  `@ts-expect-error`로 덮지 않는다. 막히면 멈추고 보고한다.

- [ ] **Step 5: 라우트 테스트를 옮기고 행위자 단언을 더한다.** 아래 테스트 파일은 `vi.mock("@supabase/supabase-js", …)`로
      service_role 클라이언트를 잡는다 — `delete-facility-video`, `delete-landmark-photo`, `facilities`, `facility-video-confirm`,
      `feedback`, `upload-building-photo`(목록: `git grep -ln 'vi.mock("@supabase/supabase-js"' -- src/app/api`). 그 줄을 이렇게
      바꾼다.

  ```ts
  const supabaseAdmin = vi.fn(() => ({ from }));
  vi.mock("@/lib/server/supabaseAdmin", () => ({ supabaseAdmin }));
  ```

  이미 `@/lib/server/supabaseAdmin`을 목으로 바꾸는 테스트 중 표에서 actor가 생긴 라우트(`admin-feedback/[id]`,
  `delete-facility-photo`, `delete-facility-photos`, `facility-requests/[id]/approve`·`reject`·`status`, `translate-facility`,
  `upload-facility-photo`)는 `supabaseAdmin: () => ({ … })`를 위와 같이 이름 붙은 `vi.fn`으로 바꾼다. 그리고 각 파일의 성공
  경로 테스트 하나에 단언을 더한다.

  ```ts
  expect(supabaseAdmin).toHaveBeenCalledWith({ userId: "admin" }); // 테스트의 requireAdmin 목이 돌려주는 id
  ```

  `translate-facility`는 `{ system: "translation" }`, `facilities`·`feedback`은 `expect(supabaseAdmin).toHaveBeenCalledWith()`.

- [ ] **Step 6: 완료 조건을 명령으로 확인한다**(설계 3.4)

```bash
git grep -n SUPABASE_SERVICE_ROLE_KEY src/app src/lib
# Expected: src/lib/server/supabaseAdmin.ts 한 줄만
git grep -n "supabaseAdmin()" -- src/app/api
# Expected: 읽기·방문자·정리 경로만 — admin-feedback/route.ts, buildings(GET), facilities, facility-requests/route.ts,
#   facility-requests/[id]/route.ts, facility-requests/[id]/photos, facility-requests/[id]/cleanup, feedback, inbox-counts,
#   landmarks, translate-facility(조회)
```

출력의 파일을 하나씩 읽어 기록 대상 테이블(설계 3.2)에 쓰는 줄이 없는지 본다. 있으면 그 줄에 actor를 넣는다.

- [ ] **Step 7: 전체 확인과 커밋**

Run: `npm run typecheck && npm run test`. Expected: 모두 통과.

```bash
git add src/lib/server src/app/api
git commit -m "refactor(api): service_role 클라이언트를 supabaseAdmin 한 곳에서 얻고 쓰는 라우트는 행위자를 넘긴다"
```

### Task 7: 운영 스크립트의 행위자 헤더

**Files:**

- Modify: `src/scripts/convertBuildingPhotosToWebP.ts`, `src/scripts/transcodeFacilityVideos.ts`

- [ ] **Step 1:** 두 파일의 `createClient(URL, SUPABASE_SERVICE_ROLE_KEY)`에 세 번째 인자를 더한다.

```ts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { headers: { "x-actor-system": "script" } } },
);
```

`src/scripts/syncBuildings.ts`는 anon 키라 손대지 않는다(설계 3.4).

- [ ] **Step 2:** `npm run typecheck && npx vitest run src/scripts` 통과. 커밋:
      `chore(scripts): 운영 스크립트의 쓰기가 운영 스크립트로 기록되게 행위자 헤더를 싣는다`.

### Task 8: 문서

**Files:**

- Modify: `docs/database-migrations.md`
- Modify: `docs/TODO_list/auth/admin-account-management.md`

- [ ] **Step 1: `docs/database-migrations.md`** — `개발 흐름`의 4번을 "`main` 반영 후 일반 CI와 `DB test`가 모두 통과하면 새
      마이그레이션만 운영 DB에 타임스탬프 순으로 적용한다."로 바꾸고, `## 수동 재실행과 실패 대응` 앞에 절을 더한다.

```markdown
## DB 검증 잡

기초 테이블(`buildings` 등)은 마이그레이션 이전에 콘솔에서 만들어져, 빈 DB에서 `supabase/migrations`를 처음부터 실행할 수
없다. 그래서 `DB test` 잡은 운영 스키마 스냅샷 위에 스냅샷보다 새 마이그레이션만 얹고 pgTAP을 돌린다. 절차의 근거는
`docs/specs/2026-10-19-activity-log-design.md` 8.3이다.

- 스냅샷: `supabase/baseline/schema.sql`. 첫 줄 `-- baseline-migration:`이 덤프 시점의 마지막 적용 버전이다.
- 적용: `scripts/apply-db-test-schema.sh`.
- 테스트: `supabase/tests/*.test.sql`. 파일마다 `begin; … rollback;`으로 감싼다.
- 로컬에 Docker가 없으면 PR CI로 확인한다.

스냅샷은 마이그레이션이 쌓여도 다시 뜨지 않는다. 운영 스키마가 마이그레이션 밖에서 바뀐 일이 생겼을 때만 **Schema snapshot**
워크플로(Actions → Run workflow)로 다시 떠서 `supabase/baseline/schema.sql`을 바꾼다.
```

- [ ] **Step 2: `docs/TODO_list/auth/admin-account-management.md`** — `## 막힌 이유`의 "둘 다 아직 운영에 없다."를
      "둘은 `supabase/migrations/20261020000000_create_activity_logs.sql`이 만든다."로 바꾸고, `## 트리거`의 첫 항목
      ("`admin_users`와 `is_admin()`이 운영 DB에 반영되면 착수할 수 있다.")을 지운다(설계 9장). 마이그레이션 버전을 Task 3에서
      바꿨다면 그 이름을 쓴다.

- [ ] **Step 3: 참조 역추적(전역 지침 Reference Back-Trace).** 이 PR에서 바뀐 이름을 찾는다. 출력과 판단을 PR 본문에 붙인다.

```bash
rg -n "SUPABASE_SERVICE_ROLE_KEY|supabaseAdmin\(\)|supabase/tests/baseline|admin_users|is_admin" docs src supabase/tests scripts .github
```

모든 줄이 (a) 이 PR에서 고침, (b) 날짜가 붙은 기록, (c) 무관 중 하나여야 한다.

- [ ] **Step 4: 커밋**

```bash
git add docs/database-migrations.md docs/TODO_list/auth/admin-account-management.md
git commit -m "docs: DB 검증 잡과 스냅샷 규칙을 적고 관리자 계정 TODO의 막힌 이유를 고친다"
```

- [ ] **Step 5: PR을 준비 상태로** — 본문에 PR 0 Task 2의 점검 결과, Step 3의 출력, "병합 뒤 Table Editor로 두 관리자 행을 넣는다
      (설계 7장)"를 적고 `gh pr ready`. 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## 병합 뒤 (사람)

- `Apply Supabase migrations`·`Verify migration history`가 초록인지 본다.
- Table Editor에서 `admin_users`에 두 관리자 행(`user_id`, `display_name`)을 넣는다. 로그에 `DB 직접 변경`이 행위자인
  `admin_users` 등록 두 줄이 생긴다(설계 11장 7).
- 각자 관리자 화면에서 무엇이든 한 번 저장하고 Table Editor의 `activity_logs`에서 이름이 찍혔는지 본다(설계 8.5 앞 두 항목).
