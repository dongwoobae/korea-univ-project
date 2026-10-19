# 관리자 감사 로그 PR 2 구현 계획 — 관리자 목록으로 권한을 맞춘다

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans로
> 태스크 순서대로 실행한다. 단계는 체크박스(`- [ ]`)로 추적한다. TDD로 간다 — 테스트를 먼저 커밋하고 기대한 이유로 실패하는지
> 본 뒤 구현을 커밋한다.

**Goal:** 관리자 API·브라우저 쓰기·관리자 화면 진입이 모두 `admin_users` 하나를 기준으로 막히게 한다. 로그인만 되는 계정은 더
이상 관리자 기능을 쓰지 못한다. `docs/TODO_list/auth/require-admin-role-check.md`를 닫는다.

**Architecture:** 서버는 `requireAdmin`이 토큰 확인 뒤 `findListedAdmin`(PR 1b)으로 목록을 조회하고 표시 이름을 함께 돌려준다.
자체 가드를 쓰던 `settings/feedback-emails`를 `requireAdmin`으로 옮긴다. DB는 브라우저가 바로 쓰는 다섯 테이블의 쓰기 정책을
`public.is_admin()`으로 바꾸는 마이그레이션 하나 — 목록이 비면 통째로 실패한다. 화면은 대시보드 레이아웃이 `is_admin()` RPC로
진입을 막는다.

**Tech Stack:** Next.js 16.2.4, `@supabase/supabase-js` 2.105, Supabase CLI `2.109.1`·pgTAP, Vitest 3, Playwright 1.61.

**Spec:** `docs/specs/2026-10-19-activity-log-design.md`(이하 "설계 N.N") 6장, 7장, 8.4, 9장, 11장 5. 계획과 설계가 다르면 설계가
맞다 — 멈추고 보고한다.

**앞선 일(설계 7장):** PR 1a·PR 1b가 병합돼 있고, **사람이 Table Editor로 `admin_users`에 두 관리자 행을 넣은 뒤**여야 한다. 행이
없는 채로 이 PR이 운영에 나가면 두 관리자가 모두 잠긴다(마이그레이션은 막히지만 API 가드는 Vercel 배포로 먼저 켜질 수 있다).

**이 계획의 코드:** 2026-10-19에 PR 1a·1b를 임시로 얹은 작업 사본에서 확인했다 — 바꾼 vitest(`requireAdmin`·`activity-logs`·
`settings/feedback-emails`·`activityLabels`) 28개 통과, `npm run typecheck`·eslint 깨끗, `e2e/admin-auth.spec.ts`와
`e2e/admin-activity-logs.spec.ts` 13개 통과. RLS 마이그레이션은 마이그레이션이 만든 정책이 있는 두 테이블(`landmarks`,
`slope_segments`)만 PGlite(Postgres 17.5)에서 돌렸다 — 목록이 비면 예외, `app.db_test=on`이면 통과, 정책 테스트 6개가 마이그레이션
없이 3개 실패하고 있으면 모두 통과. 콘솔에서 만든 세 테이블의 정책 이름은 Task 0에서 운영을 보고 정한다.

## 진행 상황

| 태스크 | 상태 | 커밋 |
| ------ | ---- | ---- |
| 0      |      |      |
| 1      |      |      |
| 2      |      |      |
| 3      |      |      |
| 4      |      |      |
| 5      |      |      |

## Global Constraints

- **병합 전 확인(설계 7장).** PR 본문 체크리스트에 `select display_name from public.admin_users;`의 결과(두 사람)를 붙인 뒤 병합한다.
  PR CI는 운영 비밀값을 받지 않아 이것을 자동으로 확인하지 못한다.
- 마이그레이션은 새 파일만, 이름 규칙 `^[0-9]{14}_[a-z0-9_]+\.sql$`, 버전은 가장 늦은 마이그레이션보다 늦게.
- 콘솔에서 만든 정책은 운영에서 받은 이름 그대로 지운다(Task 0). 이름을 짐작해 `drop policy if exists`로 덮지 않는다 — 틀린
  이름은 조용히 넘어가 옛 정책이 남는다.
- 기록·주석·커밋 규칙은 PR 1a·1b 계획과 같다(주석은 이유만, 커밋은 한국어 `type(scope): 내용`, `Co-Authored-By` 없음, 과정
  언급 없음, `rg -n "\x{FFFD}"`로 깨진 글자 확인).

## 검증 방법

```bash
npm run typecheck
npm run test
npx eslint --ignore-pattern ".claude/**" .
npx prettier --check --end-of-line auto --ignore-path .prettierignore --ignore-path .gitignore . "!.claude/**"
npx playwright test e2e/admin-auth.spec.ts      # 고치는 동안
npm run test:e2e                                 # PR을 열기 전에 전체
```

pgTAP은 PR CI의 `DB test`로 돌린다(draft PR).

## 브랜치와 PR

`feat/admin-allowlist`(PR 1b가 병합되고 두 관리자 행이 들어간 뒤의 `main`에서). 병합할 때 이 계획 문서를 `git rm`한다.

## 계획이 정한 것

1. **`requireAdmin`의 결과.** `{ user, admin: { displayName } }`. 라우트는 지금처럼 `auth.user`를 쓰고, `/api/activity-logs`는
   `auth.admin.displayName`을 행위자 이름으로 쓴다(자체 조회를 지운다, 설계 6장).
2. **목록에 없을 때.** 403 `{ error: "관리자 목록에 없는 계정이에요" }`. `logFailure`에 `action: "admin.access"`,
   `reason: "forbidden"`, `status: 403`, 요청 경로를 넘긴다. `admin.access`는 `FAILURE_ACTION_LABELS`에 `관리자 기능 접근`으로
   더한다. 조회가 실패하면 500 `{ error: "관리자 권한을 확인하지 못했어요" }`, `forbidden`은 남기지 않는다.
3. **브라우저 쪽.** 403은 서버가 기록하므로 `authedFetch` 관문은 그대로 둔다(PR 1b의 `missedServerLog`가 403을 보고하지 않는다).
4. **RLS 마이그레이션.** 첫 문장이 `admin_users`가 비었으면 예외. 단, 설정 `app.db_test`가 `on`이면 건너뛴다 — `DB test` 잡의
   스냅샷에는 데이터가 없어 목록이 늘 비기 때문이다(설계 6장). 적용 스크립트가 마이그레이션에만 `PGOPTIONS="-c app.db_test=on"`을
   준다. 정책은 `"admin write"`, `for all to authenticated using (public.is_admin()) with check (public.is_admin())` — 마이그레이션이
   만든 지금의 `"authenticated write"`와 같은 꼴이고 읽기 정책은 건드리지 않는다.
5. **화면 진입(설계 6장).** `is_admin()` RPC가 `false`면 `signOut()` 뒤 `/admin?reason=not-admin`. 로그인 화면은 그 사유를 읽어
   `관리자 목록에 없는 계정입니다`를 기존 오류 자리(`#admin-login-error`)에 보인다. RPC가 실패하면 로그아웃하지 않고
   `관리자 권한을 확인하지 못했어요` + `다시 시도`. 사유 문자열과 문구는 `src/lib/adminAccess.ts` 한 곳에 둔다.
6. **목 백엔드(설계 8.4).** `MockState.listedAdmin`(기본 `true`)과 `installMockBackend(page, { listedAdmin })`. `rpc/is_admin`이
   이 값을 그대로 돌려준다. 이 처리가 없으면 공통 POST가 배열을 돌려주고 레이아웃이 그것을 참으로 읽는다.

---

### Task 0: 착수 전 확인 (사람 + 에이전트, 설계 11장 5)

**Files:** 없음

- [ ] **Step 1: 두 관리자 행.** 운영 SQL Editor에서 `select display_name from public.admin_users;` → 두 사람이 나오는지 본다. 결과를
      PR 본문 초안에 붙인다.
- [ ] **Step 2: 운영 정책 목록.** 운영 SQL Editor에서 설계 6장의 질의를 그대로 실행한다(읽기만 한다).

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by 1, 2;
```

- [ ] **Step 3: 고칠 정책을 고른다.** 결과에서 `tablename`이 `buildings`·`building_facilities`·`building_photos`·`landmarks`·
      `slope_segments`이고, `cmd`가 `INSERT`·`UPDATE`·`DELETE`·`ALL` 중 하나이며, `roles`에 `authenticated` 또는 `public`이 든 행을
      모두 적는다. 이 목록이 Task 3의 `drop policy` 줄이 된다. PR 0 스냅샷(`supabase/baseline/schema.sql`의 `CREATE POLICY`)과 다르면
      운영이 마이그레이션 밖에서 바뀐 것이다 — 멈추고 보고한다(스냅샷을 다시 떠야 할 수 있다, `docs/database-migrations.md`).
- [ ] **Step 4:** 결과 표와 고른 목록을 PR 본문 초안에 붙이고, 설계 11장 5에 "2026-xx-xx 확인 — <요약>"을 한 줄 더한다.

### Task 1: `requireAdmin`이 관리자 목록을 본다

**Files:**

- Modify: `src/lib/requireAdmin.ts`, `src/lib/requireAdmin.test.ts`, `src/lib/activityLabels.ts`, `src/lib/activityLabels.test.ts`,
  `src/app/api/activity-logs/route.ts`, `src/app/api/activity-logs/route.test.ts`

**Interfaces:**

- Consumes: PR 1b의 `findListedAdmin`, `logFailure`.
- Produces: `RequireAdminResult = { response } | { user: User; admin: { displayName: string } }`.

- [ ] **Step 1: 무너지는 단언을 바꾸고 새 단언을 더한다(설계 8.4 첫 항목)** — `src/lib/requireAdmin.test.ts`

```diff
diff --git a/src/lib/requireAdmin.test.ts b/src/lib/requireAdmin.test.ts
index adc6506..8aff767 100644
--- a/src/lib/requireAdmin.test.ts
+++ b/src/lib/requireAdmin.test.ts
@@ -4,6 +4,10 @@ const getUser = vi.fn();
 const createClient = vi.fn(() => ({ auth: { getUser } }));

 vi.mock("@supabase/supabase-js", () => ({ createClient }));
+const findListedAdmin = vi.fn();
+vi.mock("@/lib/server/adminUsers", () => ({ findListedAdmin }));
+const logFailure = vi.fn();
+vi.mock("@/lib/server/activityLog", () => ({ logFailure }));

 describe("requireAdmin", () => {
   beforeEach(() => {
@@ -69,9 +73,10 @@ describe("requireAdmin", () => {
     expect(serviceRoleResult.response.status).toBe(401);
   });

-  it("returns the user for a valid access token", async () => {
+  it("returns the user and display name when the account is listed", async () => {
     const user = { id: "admin-user" };
     getUser.mockResolvedValueOnce({ data: { user }, error: null });
+    findListedAdmin.mockResolvedValueOnce({ displayName: "관리자" });
     const { requireAdmin } = await loadRequireAdmin();

     const result = await requireAdmin(
@@ -80,6 +85,52 @@ describe("requireAdmin", () => {
       }),
     );

-    expect(result).toEqual({ user });
+    expect(result).toEqual({ user, admin: { displayName: "관리자" } });
+    expect(findListedAdmin).toHaveBeenCalledWith("admin-user");
+    expect(logFailure).not.toHaveBeenCalled();
+  });
+
+  it("returns 403 and logs forbidden when the account is not listed", async () => {
+    const user = { id: "stranger", email: "stranger@example.com" };
+    getUser.mockResolvedValueOnce({ data: { user }, error: null });
+    findListedAdmin.mockResolvedValueOnce(null);
+    const { requireAdmin } = await loadRequireAdmin();
+
+    const result = (await requireAdmin(
+      new Request("https://local.test/api/upload-facility-photo", {
+        headers: { authorization: "Bearer valid-token" },
+      }),
+    )) as { response: Response };
+
+    expect(result.response.status).toBe(403);
+    await expect(result.response.json()).resolves.toEqual({
+      error: "관리자 목록에 없는 계정이에요",
+    });
+    expect(logFailure).toHaveBeenCalledWith({
+      route: "/api/upload-facility-photo",
+      action: "admin.access",
+      actor: { kind: "admin", user },
+      reason: "forbidden",
+      status: 403,
+    });
+  });
+
+  it("returns 500 without logging forbidden when the list lookup fails", async () => {
+    getUser.mockResolvedValueOnce({
+      data: { user: { id: "admin-user" } },
+      error: null,
+    });
+    findListedAdmin.mockRejectedValueOnce(new Error("db down"));
+    vi.spyOn(console, "error").mockImplementation(() => {});
+    const { requireAdmin } = await loadRequireAdmin();
+
+    const result = (await requireAdmin(
+      new Request("https://local.test/api", {
+        headers: { authorization: "Bearer valid-token" },
+      }),
+    )) as { response: Response };
+
+    expect(result.response.status).toBe(500);
+    expect(logFailure).not.toHaveBeenCalled();
   });
 });
```

`src/lib/activityLabels.test.ts`의 "작업 키를 읽는다"에 `expect(actionLabel("admin.access")).toBe("관리자 기능 접근");`을 더한다.

`src/app/api/activity-logs/route.test.ts` — 403은 이제 `requireAdmin`이 만든다.

```diff
diff --git a/src/app/api/activity-logs/route.test.ts b/src/app/api/activity-logs/route.test.ts
index 0d504e2..b8f4785 100644
--- a/src/app/api/activity-logs/route.test.ts
+++ b/src/app/api/activity-logs/route.test.ts
@@ -3,8 +3,6 @@ import { queryStub } from "@/test/queryStub";

 const requireAdmin = vi.fn();
 vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
-const findListedAdmin = vi.fn();
-vi.mock("@/lib/server/adminUsers", () => ({ findListedAdmin }));
 let writeResult: unknown;
 const from = vi.fn(() => queryStub(writeResult));
 vi.mock("@/lib/server/supabaseAdmin", () => ({
@@ -52,8 +50,10 @@ describe("POST /api/activity-logs", () => {
     vi.clearAllMocks();
     vi.useFakeTimers({ toFake: ["Date"] });
     vi.setSystemTime(NOW);
-    requireAdmin.mockResolvedValue({ user: { id: "u1" } });
-    findListedAdmin.mockResolvedValue({ displayName: "관리자" });
+    requireAdmin.mockResolvedValue({
+      user: { id: "u1" },
+      admin: { displayName: "관리자" },
+    });
     writeResult = { error: null };
     errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
   });
@@ -71,8 +71,13 @@ describe("POST /api/activity-logs", () => {
     expect(from).not.toHaveBeenCalled();
   });

-  it("로그인했지만 admin_users에 없는 계정은 403", async () => {
-    findListedAdmin.mockResolvedValue(null);
+  it("로그인했지만 admin_users에 없는 계정은 requireAdmin의 403을 그대로 돌려준다", async () => {
+    requireAdmin.mockResolvedValue({
+      response: Response.json(
+        { error: "관리자 목록에 없는 계정이에요" },
+        { status: 403 },
+      ),
+    });
     const { POST } = await import("./route");
     expect((await POST(post({ reports: [report()] }))).status).toBe(403);
     expect(from).not.toHaveBeenCalled();
```

실패를 보고 커밋: `test(auth): 관리자 목록에 없는 계정은 403이고 forbidden을 남기는지 시험한다`.

- [ ] **Step 2: 구현** — `src/lib/requireAdmin.ts` 전체

```ts
import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { logFailure } from "@/lib/server/activityLog";
import { findListedAdmin } from "@/lib/server/adminUsers";

const authClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export type RequireAdminResult =
  | { response: NextResponse; user?: undefined; admin?: undefined }
  | { response?: undefined; user: User; admin: { displayName: string } };

function unauthorized(): RequireAdminResult {
  return {
    response: NextResponse.json({ error: "인증 필요" }, { status: 401 }),
  };
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** 로그인한 계정이 `admin_users`에 있어야 통과한다. 설계: docs/specs/2026-10-19-activity-log-design.md 6장 */
export async function requireAdmin(
  request: Request,
): Promise<RequireAdminResult> {
  const token = getBearerToken(request);
  if (!token) {
    return unauthorized();
  }

  let user: User;
  try {
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user) {
      return unauthorized();
    }
    user = data.user;
  } catch {
    return unauthorized();
  }

  let admin: { displayName: string } | null;
  try {
    admin = await findListedAdmin(user.id);
  } catch (error) {
    console.error("[require-admin] admin lookup failed", {
      message: (error as { message?: unknown } | null)?.message,
    });
    return {
      response: NextResponse.json(
        { error: "관리자 권한을 확인하지 못했어요" },
        { status: 500 },
      ),
    };
  }
  if (!admin) {
    logFailure({
      route: new URL(request.url).pathname,
      action: "admin.access",
      actor: { kind: "admin", user },
      reason: "forbidden",
      status: 403,
    });
    return {
      response: NextResponse.json(
        { error: "관리자 목록에 없는 계정이에요" },
        { status: 403 },
      ),
    };
  }
  return { user, admin };
}
```

`src/lib/activityLabels.ts`의 `FAILURE_ACTION_LABELS` 끝(`"buildings.osm_sync": "OSM 동기화",` 다음)에
`"admin.access": "관리자 기능 접근",`을 더한다.

`src/app/api/activity-logs/route.ts`

```diff
diff --git a/src/app/api/activity-logs/route.ts b/src/app/api/activity-logs/route.ts
index 14486d7..ae1bdf6 100644
--- a/src/app/api/activity-logs/route.ts
+++ b/src/app/api/activity-logs/route.ts
@@ -1,7 +1,6 @@
 import { NextResponse } from "next/server";
 import { acceptedOccurredAt, parseReports } from "@/lib/failureReport";
 import { requireAdmin } from "@/lib/requireAdmin";
-import { findListedAdmin } from "@/lib/server/adminUsers";
 import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

 /** 브라우저 실패 보고를 받는다. 설계: docs/specs/2026-10-19-activity-log-design.md 4.3 */
@@ -9,26 +8,6 @@ export async function POST(request: Request) {
   const auth = await requireAdmin(request);
   if (auth.response) return auth.response;

-  // requireAdmin이 목록을 확인하게 되면(PR 2, 설계 6장) 이 확인을 지운다.
-  let admin: { displayName: string } | null;
-  try {
-    admin = await findListedAdmin(auth.user.id);
-  } catch (error) {
-    console.error("[activity-logs] admin lookup failed", {
-      message: (error as { message?: unknown } | null)?.message,
-    });
-    return NextResponse.json(
-      { error: "관리자 목록을 확인하지 못했어요" },
-      { status: 500 },
-    );
-  }
-  if (!admin) {
-    return NextResponse.json(
-      { error: "관리자 목록에 없는 계정이에요" },
-      { status: 403 },
-    );
-  }
-
   const reports = parseReports(await request.json().catch(() => null));
   if (!reports) {
     return NextResponse.json(
@@ -37,7 +16,7 @@ export async function POST(request: Request) {
     );
   }

-  const actorLabel = admin.displayName;
+  const actorLabel = auth.admin.displayName;
   const now = Date.now();
   const rows = reports
     .filter((report) => report.owner_user_id === auth.user.id)
```

- [ ] **Step 3:** `npm run typecheck && npm run test` 통과. 다른 라우트 테스트는 `requireAdmin`을 목으로 바꾸므로 그대로 돈다. 커밋:
      `feat(auth): requireAdmin이 admin_users에 있는 계정만 통과시킨다`.

### Task 2: `settings/feedback-emails`를 `requireAdmin`으로 옮긴다

**Files:**

- Modify: `src/app/api/settings/feedback-emails/route.ts`
- Create: `src/app/api/settings/feedback-emails/route.test.ts`(설계 8.4 넷째 항목 — 지금 테스트가 없다)

- [ ] **Step 1: 테스트를 쓴다**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const logFailure = vi.fn();
vi.mock("@/lib/server/activityLog", () => ({ logFailure }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
let saveResult: unknown;
const from = vi.fn(() => queryStub(saveResult));
const supabaseAdmin = vi.fn(() => ({ from }));
vi.mock("@/lib/server/supabaseAdmin", () => ({ supabaseAdmin }));

const post = (body: unknown) =>
  new Request("https://local.test/api/settings/feedback-emails", {
    method: "POST",
    body: JSON.stringify(body),
  });

const valid = {
  to: "help@example.com",
  cc: ["cc@example.com"],
  subject: "[지도] 의견",
};

describe("POST /api/settings/feedback-emails", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({
      user: { id: "admin", email: "admin@example.com" },
      admin: { displayName: "관리자" },
    });
    saveResult = { error: null };
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("토큰이 없으면 requireAdmin의 401을 돌려준다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "인증 필요" }, { status: 401 }),
    });
    const { POST } = await import("./route");
    expect((await POST(post(valid))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("관리자 목록에 없으면 requireAdmin의 403을 돌려준다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json(
        { error: "관리자 목록에 없는 계정이에요" },
        { status: 403 },
      ),
    });
    const { POST } = await import("./route");
    expect((await POST(post(valid))).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("관리자를 행위자로 실어 저장하고 공개 지도를 갱신한다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, value: valid });
    expect(supabaseAdmin).toHaveBeenCalledWith({ userId: "admin" });
    const upsert = (
      from.mock.results[0].value as {
        calls: { method: string; args: unknown[] }[];
      }
    ).calls.find((call) => call.method === "upsert");
    expect(upsert?.args[0]).toMatchObject({
      key: "feedback_emails",
      value: valid,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(logFailure).not.toHaveBeenCalled();
  });

  it("형식이 틀리면 400과 입력 오류 기록", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ ...valid, to: "nope" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "수신 이메일 형식 오류" });
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.feedback_emails",
        reason: "invalid_input",
        status: 400,
      }),
    );
  });

  it("저장이 실패하면 500과 서버 오류 기록", async () => {
    saveResult = { error: { code: "XX000", message: "db down" } };
    const { POST } = await import("./route");
    const response = await POST(post(valid));
    expect(response.status).toBe(500);
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "server_error", status: 500 }),
    );
  });
});
```

실패(403 테스트가 `verifyAdmin` 때문에 통과하지 못함)를 보고 커밋: `test(api): 피드백 메일 설정 저장의 권한과 기록을 시험한다`.

- [ ] **Step 2: 구현** — 파일 전체. `verifyAdmin()`과 그 anon 클라이언트를 지운다. 401 문구는 `Unauthorized`에서 `requireAdmin`의
      `인증 필요`로 바뀐다(`FeedbackEmailModal`은 `json.error`를 그대로 보인다).

```ts
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

function isEmail(s: unknown): boolean {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/settings/feedback-emails",
    action: "settings.feedback_emails",
    actor: { kind: "admin", user: auth.user },
    target: { table: "app_settings", id: "feedback_emails" },
  });

  const body = await request.json().catch(() => null);
  if (!body) return failures.respond(400, "Invalid JSON", "invalid_input");

  const to = body.to?.trim();
  const subject = body.subject?.trim();
  const ccRaw = Array.isArray(body.cc) ? body.cc : [];
  const cc = ccRaw.map((s: unknown) => (s as string)?.trim()).filter(Boolean);

  if (!isEmail(to))
    return failures.respond(400, "수신 이메일 형식 오류", "invalid_input");
  if (!subject) return failures.respond(400, "제목 필수", "invalid_input");
  for (const addr of cc) {
    if (!isEmail(addr))
      return failures.respond(
        400,
        `참조 이메일 형식 오류: ${addr}`,
        "invalid_input",
      );
  }

  const value = { to, cc, subject };

  const { error } = await supabaseAdmin({ userId: auth.user.id })
    .from("app_settings")
    .upsert(
      { key: "feedback_emails", value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

  if (error) {
    console.error("[settings/feedback-emails] save failed", {
      code: error.code,
      message: error.message,
    });
    return failures.respond(500, error.message, "server_error", { error });
  }

  revalidatePath("/");
  return Response.json({ ok: true, value });
}
```

- [ ] **Step 3: 완료 조건(설계 6장)을 명령으로 본다.**

```bash
for f in $(git ls-files 'src/app/api/**/route.ts'); do grep -q requireAdmin "$f" || echo "$f"; done
```

Expected: `buildings`, `facilities`, `landmarks`, `slopes`, `feedback`, `facility-requests/[id]/photos`의 `route.ts`만. 다른 파일이
나오면 멈추고 보고한다. 출력을 PR 본문에 붙인다.

- [ ] **Step 4:** 커밋 `fix(api): 피드백 메일 설정 저장도 관리자 목록으로 막는다`.

### Task 3: 브라우저 쓰기 RLS를 `is_admin()`으로

**Files:**

- Modify: `scripts/apply-db-test-schema.sh`
- Create: `supabase/tests/admin_write_policies.test.sql`
- Create: `supabase/migrations/<버전>_restrict_admin_writes.sql`

- [ ] **Step 1: 적용 스크립트가 마이그레이션에만 설정을 준다** — `scripts/apply-db-test-schema.sh`의 마이그레이션 루프에서
      `run_sql "$db_url" "$file"`을 다음으로 바꾼다.

```bash
    # app.db_test: docs/specs/2026-10-19-activity-log-design.md 6장
    PGOPTIONS="-c app.db_test=on" psql "$db_url" --quiet --no-psqlrc -v ON_ERROR_STOP=1 --file "$file"
```

- [ ] **Step 2: 테스트를 쓴다** — `supabase/tests/admin_write_policies.test.sql`. 아래는 `landmarks`·`slope_segments` 몫이다. Task 0
      Step 3에서 고른 `buildings`·`building_facilities`·`building_photos`도 같은 꼴로 단언을 더하고(목록에 없는 계정은 넣지 못함,
      관리자는 넣음) `plan(N)`을 단언 수로 맞춘다. 수는 파일의 `select throws_ok|lives_ok|is(` 줄을 세어 정한다
      (`rg -c "^select (throws_ok|lives_ok|is)\(" supabase/tests/admin_write_policies.test.sql`).

```sql
-- 설계: docs/specs/2026-10-19-activity-log-design.md 6장
begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'stranger@example.com');
insert into public.admin_users (user_id, display_name)
values ('00000000-0000-4000-8000-000000000001', '관리자');
insert into public.landmarks (id, name, lat, lng)
values ('10000000-0000-4000-8000-000000000001', '중앙광장', 37.5, 127.0);

create function pg_temp.act_as(person uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', person, 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select throws_ok(
  $$insert into public.landmarks (name, lat, lng) values ('새 명소', 37.5, 127.0)$$,
  '42501', null, '목록에 없는 계정은 명소를 넣지 못한다');
update public.landmarks set name = '바뀐 이름';
select is(
  (select name from public.landmarks where id = '10000000-0000-4000-8000-000000000001'),
  '중앙광장', '목록에 없는 계정의 수정은 한 행도 바꾸지 못한다');
select throws_ok(
  $$insert into public.slope_segments (name, segments) values ('새 경로', '[]')$$,
  '42501', null, '목록에 없는 계정은 경사도 경로를 넣지 못한다');

select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select lives_ok(
  $$insert into public.landmarks (name, lat, lng) values ('새 명소', 37.5, 127.0)$$,
  '관리자는 명소를 넣는다');
update public.landmarks set name = '바뀐 이름'
where id = '10000000-0000-4000-8000-000000000001';
select is(
  (select name from public.landmarks where id = '10000000-0000-4000-8000-000000000001'),
  '바뀐 이름', '관리자는 명소를 고친다');
select lives_ok(
  $$insert into public.slope_segments (name, segments) values ('새 경로', '[]')$$,
  '관리자는 경사도 경로를 넣는다');

reset role;
select * from finish();
rollback;
```

draft PR로 푸시해 `DB test`가 `목록에 없는 계정은 명소를 넣지 못한다`부터 실패하는 것을 본다. 커밋:
`test(db): 관리자 목록에 없는 계정의 브라우저 쓰기가 막히는지 시험한다`.

- [ ] **Step 3: 마이그레이션** — `supabase/migrations/<버전>_restrict_admin_writes.sql`. 아래는 마이그레이션이 만든 정책 둘이다.
      Task 0 Step 3의 목록에서 `buildings`·`building_facilities`·`building_photos`의 쓰기 정책마다
      `drop policy "<운영 이름>" on public.<테이블>;`(`if exists` 없이)을 두고, 테이블마다 같은 `"admin write"` 정책을 만든다.

```sql
-- 브라우저가 바로 쓰는 테이블의 쓰기를 관리자 목록 기준으로 좁힌다.
-- 설계: docs/specs/2026-10-19-activity-log-design.md 6장·7장

do $$
begin
  -- app.db_test는 DB test 잡의 적용 스크립트만 준다(설계 6장).
  if coalesce(current_setting('app.db_test', true), '') <> 'on'
    and not exists (select 1 from public.admin_users) then
    raise exception 'admin_users is empty. Insert the admin rows before this migration (docs/specs/2026-10-19-activity-log-design.md 7).';
  end if;
end;
$$;

drop policy if exists "authenticated write" on public.landmarks;
create policy "admin write"
  on public.landmarks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "authenticated write" on public.slope_segments;
create policy "admin write"
  on public.slope_segments for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

- [ ] **Step 4:** 푸시해 `DB test` 초록(기존 pgTAP 두 파일 포함). 커밋:
      `feat(db): 브라우저가 바로 쓰는 테이블의 쓰기를 관리자 목록으로 좁힌다`.

### Task 4: 관리자 화면 진입

**Files:**

- Create: `src/lib/adminAccess.ts`
- Modify: `src/app/admin/dashboard/layout.tsx`, `src/app/admin/page.tsx`, `e2e/support/mockBackend.ts`, `e2e/admin-auth.spec.ts`

- [ ] **Step 1: 목 백엔드와 시나리오(설계 8.4 둘째 항목)**

```diff
diff --git a/e2e/support/mockBackend.ts b/e2e/support/mockBackend.ts
index 72c6955..6e62c07 100644
--- a/e2e/support/mockBackend.ts
+++ b/e2e/support/mockBackend.ts
@@ -37,6 +37,8 @@ import type { Page, Route } from "@playwright/test";
 type Row = Record<string, unknown>;
 export interface MockState {
   authenticated: boolean;
+  /** `rpc/is_admin`의 답 */
+  listedAdmin: boolean;
   /** 건물 사진·명소 사진 업로드(`/api/upload-building-photo`·`/api/upload-landmark-photo`)가 같이 센다 */
   photoUploadAttempts: number;
   /** 남은 횟수만큼 건물·명소 사진 업로드가 500으로 실패한다 */
@@ -222,6 +224,7 @@ function seedActivityLogs(): Row[] {
 function createState(authenticated: boolean): MockState {
   return {
     authenticated,
+    listedAdmin: true,
     photoUploadAttempts: 0,
     photoUploadFailuresRemaining: 0,
     translationFailuresRemaining: 0,
@@ -769,6 +772,8 @@ function nextId(name: string, state: MockState) {
 async function handleRest(route: Route, state: MockState, url: URL) {
   const name = url.pathname.split("/rest/v1/")[1];
   const method = route.request().method();
+  // 이 처리가 없으면 아래 공통 POST가 배열을 돌려주고, 레이아웃은 그것을 참으로 읽어 확인 없이 통과한다(설계 2026-10-19 8.4).
+  if (name === "rpc/is_admin") return json(route, state.listedAdmin);
   if (name === "rpc/get_admin_building_summary") {
     // 프로덕션 함수와 같은 모양: 건물 단위 숫자는 플래그 뷰를 세고, 시설 단위
     // 숫자(등록된 시설·번역 필요 시설)는 시설을 뷰에 조인해 센다.
@@ -1367,9 +1372,12 @@ export async function installMockBackend(
     currentLocation?: { latitude: number; longitude: number } | null;
     /** 위치 응답을 늦춘다(ms) */
     geolocationDelayMs?: number;
+    /** false면 `rpc/is_admin`이 거짓을 돌려준다 — 로그인은 되지만 관리자 목록에 없는 계정 */
+    listedAdmin?: boolean;
   } = {},
 ) {
   const state = createState(Boolean(options.authenticated));
+  state.listedAdmin = options.listedAdmin ?? true;
   state.photoUploadFailuresRemaining = options.failPhotoUploads ?? 0;
   state.translationFailuresRemaining = options.failTranslations ?? 0;
   // 1) 페이지 로드 전 브라우저 API 스텁(인증 토큰·음성·위치). 실제 권한/기기 없이 결정론적.
```

```diff
diff --git a/e2e/admin-auth.spec.ts b/e2e/admin-auth.spec.ts
index 41c6219..3521808 100644
--- a/e2e/admin-auth.spec.ts
+++ b/e2e/admin-auth.spec.ts
@@ -36,6 +36,24 @@ test.describe("관리자 인증과 공통 기능", () => {
     await expect(page).toHaveURL("http://127.0.0.1:3100/admin");
   });

+  test("관리자 목록에 없는 계정은 안내와 함께 로그인 화면으로 돌아간다", async ({
+    page,
+  }) => {
+    await installMockBackend(page, { listedAdmin: false });
+    await page.goto("/admin");
+    await page.locator('input[type="email"]').fill("admin@example.com");
+    await page.locator('input[type="password"]').fill("secret");
+    await page.getByRole("button", { name: "로그인" }).click();
+
+    await expect(page).toHaveURL(/\/admin\?reason=not-admin$/);
+    await expect(page.locator("#admin-login-error")).toHaveText(
+      "관리자 목록에 없는 계정입니다",
+    );
+    await expect(page.getByRole("link", { name: /관리자 콘솔/ })).toHaveCount(
+      0,
+    );
+  });
+
   test("피드백 수신 이메일을 변경한다", async ({ page }) => {
     await installMockBackend(page);
     await page.goto("/admin");
```

`npx playwright test e2e/admin-auth.spec.ts`로 새 시나리오가 실패하는 것을 보고(대시보드로 들어가 버린다) 커밋:
`test(e2e): 관리자 목록에 없는 계정은 로그인 화면으로 돌아가는지 시험한다`.

- [ ] **Step 2: 구현** — `src/lib/adminAccess.ts`

```ts
/** 대시보드가 관리자 목록에 없는 계정을 로그인 화면으로 돌려보낼 때 주소에 붙이는 사유(설계 2026-10-19 6장). */
export const NOT_ADMIN_REASON = "not-admin";
export const NOT_ADMIN_MESSAGE = "관리자 목록에 없는 계정입니다";
```

`src/app/admin/dashboard/layout.tsx`

```diff
diff --git a/src/app/admin/dashboard/layout.tsx b/src/app/admin/dashboard/layout.tsx
index 713ba4f..a8fd935 100644
--- a/src/app/admin/dashboard/layout.tsx
+++ b/src/app/admin/dashboard/layout.tsx
@@ -7,6 +7,7 @@ import Link from "next/link";
 import Image from "next/image";
 import { supabase } from "@/lib/supabaseClient";
 import { flushQueue } from "@/lib/activityReport";
+import { NOT_ADMIN_REASON } from "@/lib/adminAccess";
 import { authedFetch } from "@/lib/authedFetch";
 import {
   FEEDBACK_EMAILS_FALLBACK,
@@ -46,6 +47,7 @@ export default function DashboardLayout({
 function DashboardShell({ children }: { children: React.ReactNode }) {
   const [user, setUser] = useState<User | null>(null);
   const [authChecked, setAuthChecked] = useState(false);
+  const [accessCheckFailed, setAccessCheckFailed] = useState(false);
   const [feedbackEmails, setFeedbackEmails] = useState(
     FEEDBACK_EMAILS_FALLBACK,
   );
@@ -91,15 +93,30 @@ function DashboardShell({ children }: { children: React.ReactNode }) {
   }, [pathname]);

   useEffect(() => {
-    supabase.auth.getUser().then(({ data: { user: authenticatedUser } }) => {
+    async function checkAccess() {
+      const {
+        data: { user: authenticatedUser },
+      } = await supabase.auth.getUser();
       if (!authenticatedUser) {
         router.push("/admin");
         return;
       }
+      // API의 requireAdmin과 같은 기준(admin_users)으로 화면 진입을 막는다. 설계 2026-10-19 6장
+      const { data: listed, error } = await supabase.rpc("is_admin");
+      if (error) {
+        setAccessCheckFailed(true);
+        return;
+      }
+      if (!listed) {
+        await supabase.auth.signOut();
+        router.push(`/admin?reason=${NOT_ADMIN_REASON}`);
+        return;
+      }
       setUser(authenticatedUser);
       setAuthChecked(true);
       void flushQueue();
-    });
+    }
+    void checkAccess();
   }, [router]);

   useEffect(() => {
@@ -147,6 +164,19 @@ function DashboardShell({ children }: { children: React.ReactNode }) {
     };
   }

+  if (accessCheckFailed)
+    return (
+      <div className="ku-admin-loading" role="alert">
+        <p>관리자 권한을 확인하지 못했어요.</p>
+        <button
+          className="ku-admin-button"
+          type="button"
+          onClick={() => window.location.reload()}
+        >
+          다시 시도
+        </button>
+      </div>
+    );
   if (!authChecked)
     return <div className="ku-admin-loading">불러오는 중...</div>;
```

`src/app/admin/page.tsx`

```diff
diff --git a/src/app/admin/page.tsx b/src/app/admin/page.tsx
index 6c69ab1..727eb7f 100644
--- a/src/app/admin/page.tsx
+++ b/src/app/admin/page.tsx
@@ -1,6 +1,7 @@
 "use client";

 import { useState, useEffect } from "react";
+import { NOT_ADMIN_MESSAGE, NOT_ADMIN_REASON } from "@/lib/adminAccess";
 import { supabase } from "@/lib/supabaseClient";
 import { useRouter } from "next/navigation";
 import Image from "next/image";
@@ -20,7 +21,10 @@ export default function AdminLogin() {
       } = await supabase.auth.getUser();
       if (user) {
         router.push("/admin/dashboard");
+        return;
       }
+      const reason = new URLSearchParams(window.location.search).get("reason");
+      if (reason === NOT_ADMIN_REASON) setError(NOT_ADMIN_MESSAGE);
     }
     checkSession();
   }, [router]);
```

- [ ] **Step 3:** `npx playwright test e2e/admin-auth.spec.ts` → 5개 통과, 그다음 `npm run test:e2e` 전체. 커밋:
      `feat(admin): 관리자 목록에 없는 계정은 대시보드에 들어오지 못한다`.

### Task 5: TODO를 닫고 문서를 맞춘다

**Files:**

- Delete: `docs/TODO_list/auth/require-admin-role-check.md`
- Modify: `docs/specs/2026-10-19-activity-log-design.md`, 역추적에서 나온 문서

- [ ] **Step 1: 결론이 설계에 있는지 본다(TODO README 규칙 4).** TODO의 `착수 시 정할 것` 네 항목이 설계에 답이 있는지 확인한다 —
      식별 수단(`admin_users`, 설계 1.2·2.1), 범위(`requireAdmin`과 자체 가드 라우트, 6장), 화면 진입(6장), 기존 세션(7장의 순서와
      "그래도 잠겼을 때"). 빠진 것이 있으면 설계 6장에 더한다.
- [ ] **Step 2:** `git rm docs/TODO_list/auth/require-admin-role-check.md`.
- [ ] **Step 3: 참조 역추적(전역 지침 Reference Back-Trace).**

```bash
rg -n "require-admin-role-check|verifyAdmin|로그인 여부만" docs src
```

설계 문서의 링크(`../TODO_list/auth/require-admin-role-check.md`)는 링크를 풀고 "PR 2에서 닫았다"로 바꾼다. 날짜가 붙은 기록(예:
TODO를 옮겨 왔다는 다른 설계의 `후속 과제`)은 그대로 둔다. 출력과 판단을 PR 본문에 붙인다.

- [ ] **Step 4: 커밋과 PR** — `docs: requireAdmin 역할 확인 TODO를 닫는다`. PR 본문에 Task 0의 두 결과, Task 2 Step 3과 Task 5
      Step 3의 출력, 병합 전 체크리스트(`select display_name from public.admin_users;` → 두 사람)를 둔다. 끝에
      `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## 병합 뒤 (사람)

- 두 관리자가 각자 로그인해 대시보드에 들어가고 저장이 되는지 본다.
- 잠겼다면 Table Editor에서 `admin_users` 행을 넣는다 — 요청마다 조회하므로 재배포 없이 풀린다(설계 7장).
