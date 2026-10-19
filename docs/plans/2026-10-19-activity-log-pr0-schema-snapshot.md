# 관리자 감사 로그 PR 0 구현 계획 — 운영 스키마 스냅샷 워크플로

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans로
> 태스크 순서대로 실행한다. 단계는 체크박스(`- [ ]`)로 추적한다.

**Goal:** 운영 DB의 `public` 스키마(데이터 없음)를 떠서 산출물로 올리는 수동 실행 워크플로를 둔다. PR 1a가 이 산출물을 DB 검증 잡의
바탕으로 커밋한다.

**Architecture:** `workflow_dispatch` 워크플로 하나. 운영 적용 잡과 같은 `production` 환경·비밀값·접속 URL 스크립트
(`scripts/build-supabase-db-url.sh`)·CLI 버전을 쓴다. 덤프 앞에 마지막 적용 마이그레이션 버전과 서버 버전을 주석으로 붙인다.

**Tech Stack:** GitHub Actions, `supabase/setup-cli@v2`(CLI `2.109.1`), `psql`(ubuntu-latest 러너에 있음), `actions/upload-artifact@v4`.

**Spec:** `docs/specs/2026-10-19-activity-log-design.md`(이하 "설계 N.N") 7장의 PR 0, 8.3의 1. 계획과 설계가 다르면 설계가 맞다 —
멈추고 보고한다.

**순서:** PR 0(이 계획) → 워크플로 한 번 실행 → PR 1a(`2026-10-19-activity-log-pr1a-db.md`) → PR 1b
(`2026-10-19-activity-log-pr1b-app.md`) → 사람이 `admin_users`에 두 행 입력 → PR 2(`2026-10-19-activity-log-pr2-authz.md`).

## 진행 상황

| 태스크 | 상태 | 커밋 |
| ------ | ---- | ---- |
| 1      |      |      |
| 2      |      |      |

## Global Constraints

- 덤프는 스키마만이다(설계 8.3). 데이터를 뜨는 옵션(`--data-only`, `--use-copy`)을 쓰지 않는다.
- CLI 버전은 운영 적용 잡(`ci.yml`의 `migrate`)과 같은 `2.109.1`로 고정한다. 두 곳이 다른 CLI로 같은 DB를 다루지 않게 한다.
- 접속 URL은 `scripts/build-supabase-db-url.sh`로만 만든다. 그 스크립트가 파생 값을 마스킹한다.
- 운영 마이그레이션 잡과 같은 `concurrency` 그룹(`supabase-production-migrations`)에 넣어, 마이그레이션이 적용되는 중에 뜨지 않게
  한다.
- 커밋 메시지는 한국어 `type(scope): 내용`. `Co-Authored-By`를 붙이지 않고, 작업 과정(리뷰·점검)을 적지 않는다.
- 주석은 이유·외부 제약·위험만 적는다(전역 지침의 Comment Minimalism).

## 검증 방법

이 워크플로는 `main`에 있어야 `workflow_dispatch`로 돌릴 수 있다. PR 단계에서는 YAML 문법만 본다.

```bash
npx prettier --check .github/workflows/schema-snapshot.yml
```

병합 뒤 Actions 탭에서 `Schema snapshot`을 수동 실행하고 Task 2대로 산출물을 확인한다.

## 브랜치와 PR

`ci/schema-snapshot`(이 계획과 설계 수정이 든 커밋에서). PR 본문에 "병합 뒤 한 번 수동 실행한다"를 적는다. Task 2는 병합 뒤에야
할 수 있어 이 계획은 PR 0과 함께 지우지 않는다. Task 2의 결과를 PR 1a 본문으로 옮기고, PR 1a 브랜치에서 `git rm`한다.

## 계획이 정한 것

1. **파일.** `.github/workflows/schema-snapshot.yml`. 잡 하나(`dump`), 트리거는 `workflow_dispatch`만.
2. **머리 주석.** 산출물 `schema.sql`의 첫 세 줄은 순서대로 `-- baseline-migration: <14자리 버전>`,
   `-- server-version: <show server_version 결과>`, `-- dumped-at: <UTC ISO 시각>`. PR 1a의 적용 스크립트가 첫 줄을 정규식
   `^-- baseline-migration: [0-9]{14}$`로 읽는다. 서버 버전은 PR 1a가 `config.toml`의 `major_version`을 정하는 근거다.
3. **산출물.** 이름 `public-schema`, 보존 7일. 저장소가 공개라 산출물도 로그인한 누구나 받을 수 있다 — 스키마는 PR 1a에서 어차피
   커밋되고 데이터·비밀값이 없다(설계 8.3 마지막 문단).

---

### Task 1: 스냅샷 워크플로

**Files:**

- Create: `.github/workflows/schema-snapshot.yml`

- [ ] **Step 1: 워크플로를 쓴다**

```yaml
name: Schema snapshot

# PR 1a의 DB 검증 잡이 이 덤프를 바탕으로 쓴다. 설계: docs/specs/2026-10-19-activity-log-design.md 8.3
on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  dump:
    name: Dump production public schema
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: production
    concurrency:
      group: supabase-production-migrations
      cancel-in-progress: false
    env:
      SUPABASE_DB_URL_TEMPLATE: ${{ secrets.SUPABASE_DB_URL }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
    steps:
      - uses: actions/checkout@v4

      - name: Set up Supabase CLI
        uses: supabase/setup-cli@v2
        with:
          version: 2.109.1
          github-token: ${{ github.token }}

      - name: Build masked database connection
        shell: bash
        run: bash scripts/build-supabase-db-url.sh

      - name: Dump public schema
        shell: bash
        run: |
          set -euo pipefail
          version="$(psql "$SUPABASE_MIGRATION_DB_URL" --no-align --tuples-only \
            --command "select max(version) from supabase_migrations.schema_migrations")"
          server="$(psql "$SUPABASE_MIGRATION_DB_URL" --no-align --tuples-only \
            --command "show server_version")"
          supabase db dump --db-url "$SUPABASE_MIGRATION_DB_URL" --schema public \
            -f "$RUNNER_TEMP/dump.sql"
          {
            echo "-- baseline-migration: $version"
            echo "-- server-version: $server"
            echo "-- dumped-at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
            cat "$RUNNER_TEMP/dump.sql"
          } > schema.sql
          head -n 3 schema.sql

      - uses: actions/upload-artifact@v4
        with:
          name: public-schema
          path: schema.sql
          retention-days: 7
```

- [ ] **Step 2: 형식을 확인한다**

Run: `npx prettier --check .github/workflows/schema-snapshot.yml`
Expected: `All matched files use Prettier code style!` (아니면 `npx prettier --write`로 고친 뒤 다시)

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/schema-snapshot.yml
git commit -m "ci: 운영 public 스키마를 떠서 산출물로 올리는 수동 워크플로를 둔다"
```

### Task 2: 병합 뒤 한 번 실행하고 결과를 넘긴다 (사람 + 에이전트)

**Files:** 없음(실행과 확인만)

- [ ] **Step 1: 실행** — 병합 뒤 `gh workflow run schema-snapshot.yml --ref main`, 끝나면 `gh run list --workflow=schema-snapshot.yml -L 1`로
      run id를 얻는다.
- [ ] **Step 2: 받기** — `gh run download <run-id> -n public-schema -D "$TMP/schema"`(스크래치 디렉터리). 첫 세 줄을 본다:
      `head -n 3 "$TMP/schema/schema.sql"`. 첫 줄의 버전이 `git ls-files 'supabase/migrations/*.sql'`의 마지막 파일 버전과 같아야
      한다. 다르면 운영과 저장소 이력이 어긋난 것이다 — 멈추고 보고한다(`verify-migration-history` 잡이 같은 것을 본다).
- [ ] **Step 3: 내용 점검(PR 1a 착수 자료)** — 아래를 세어 PR 1a 본문 초안에 적는다. 수를 적을 때는 명령 출력으로만 적는다.
  - 확장 참조: `rg -n 'extensions\.' "$TMP/schema/schema.sql"`와 `rg -n -i 'create extension' "$TMP/schema/schema.sql"`.
  - 소유자: `rg -n 'OWNER TO' "$TMP/schema/schema.sql" | rg -v '"postgres"'` — `postgres`가 아닌 소유자가 있으면 PR 1a Task 1의
    분기를 탄다.
  - 정책: `rg -n 'CREATE POLICY' "$TMP/schema/schema.sql"` — 설계 11장 5의 첫 자료다. PR 2 계획 Task 0이 이 목록을 쓴다.
- [ ] **Step 4: 계획 은퇴** — PR 0이 병합된 뒤의 첫 PR(보통 PR 1a)에서 `git rm docs/plans/2026-10-19-activity-log-pr0-schema-snapshot.md`.
