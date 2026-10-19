# 관리자 감사 로그 PR 1b 구현 계획 — 실패 기록과 로그 화면

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans로
> 태스크 순서대로 실행한다. 단계는 체크박스(`- [ ]`)로 추적한다. TDD로 간다 — 테스트를 먼저 커밋하고 기대한 이유로 실패하는지
> 본 뒤 구현을 커밋한다.

**Goal:** 관리자 화면의 실패를 왜 실패했는지와 함께 감사 로그에 남기고(서버 `logFailure()`, 브라우저 `reportFailure()`), 관리자 헤더의
`로그` 탭에서 변경과 실패를 한 줄 요약·유형 필터·상세 모달로 읽게 한다. **권한 검사는 바꾸지 않는다.**

**Architecture:** 순수 모듈 셋이 규칙을 갖는다 — 표시(`activityLabels.ts`), 사유 분류(`failureReason.ts`), 보고 형식
(`failureReport.ts`). 서버는 라우트마다 `routeFailures()` 묶음으로 실패 응답과 기록을 한 번에 만들고, 기록은 `after()`에 맡겨
응답을 기다리게 하지 않는다. 브라우저는 실패가 지나가는 관문 두 곳(`authedFetch`, 브라우저 Supabase 클라이언트의 `global.fetch`)과
관문 밖의 처리 실패 몇 곳에서 `reportFailure()`를 부르고, 보내지 못한 보고는 `localStorage` 대기열에 두었다가 같은 계정이 대시보드를
열 때 보낸다. 로그 화면은 브라우저 Supabase 클라이언트로 `activity_logs`를 바로 읽고(RLS가 관리자만 허용), 제보함과 같은 리듀서 +
세대 번호 패턴으로 쪽을 잇는다.

**Tech Stack:** Next.js 16.2.4 App Router(`after` from `next/server`), React 19.2.4(React Compiler), `@supabase/supabase-js` 2.105,
Vitest 3(node 환경), Playwright 1.61(목 백엔드).

**Spec:** `docs/specs/2026-10-19-activity-log-design.md`(이하 "설계 N.N") 4장, 5장, 7장(PR 1의 앱 부분), 8.1, 8.2, 9장. 계획과
설계가 다르면 설계가 맞다 — 멈추고 보고한다.

**앞선 일:** PR 1a(`2026-10-19-activity-log-pr1a-db.md`)가 병합돼 운영에 `activity_logs`·`admin_users`·`is_admin()`이 있고,
`supabaseAdmin(actor)`와 생성 타입(`activity_logs`·`admin_users`)이 `main`에 있어야 한다.

**계획 뒤에 생긴 라우트:** `POST /api/settings/slope-bands`(PR #44, `app_settings`의 `slope_bands` 행). Task 5의 라우트 표와
Task 6의 경로 표에 없다. 실행할 때 `settings/feedback-emails` 줄을 본떠 더한다.

**이 계획의 코드:** 아래 새 파일과 기존 파일 수정분은 2026-10-19에 PR 1a의 `supabaseAdmin`·생성 타입을 임시로 얹은 작업 사본에서
`npm run typecheck`, 전체 vitest(87개 파일 686개 통과), 바꾼 파일의 eslint·prettier, `e2e/admin-activity-logs.spec.ts` 8개를 돌려
확인했다. 라우트 실패 기록(Task 5)은 본보기 `delete-facility-photo` 하나만 그렇게 확인했다 — 나머지 라우트는 Task 5의 규칙과 표로
옮긴다. 같은 사본에서 `npm run test:e2e` 전체는 370개 중 364개가 통과했고, 실패한 6개(`admin-inbox.spec.ts` 모바일 M1~M3,
`admin-landmarks-workspace.spec.ts`의 목록·지도 셋)는 단독으로 다시 돌리자 모두 통과했다. 변경 전 기준선의 전체 실행과는 비교하지
않았다 — Task 9 Step 4에서 다시 보고, 같은 것이 또 실패하면 기준선에서도 실패하는지 확인한다.

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
| 9      |      |      |
| 10     |      |      |

## Global Constraints

- **권한은 그대로다**(설계 7장). `requireAdmin`·RLS·레이아웃의 진입 확인을 바꾸지 않는다. `/api/activity-logs`만 목록 확인을 직접
  한다(설계 4.3) — PR 2가 그 확인을 `requireAdmin`으로 옮긴다.
- 서버 기록은 기존 `console.error`를 지우지 않는다(설계 4.2). `logFailure`는 던지지 않는다.
- 기록에 오류 객체·응답 본문·헤더를 통째로 넣지 않는다. `detail`은 `sanitizeDetail`의 허용 키만(설계 4.4).
- 공개 라우트는 5xx와 예상 못 한 예외만 남긴다(설계 4.6). 읽기 전용 관리자 라우트(`admin-feedback` GET, `facility-requests` GET·
  `[id]` GET, `inbox-counts`, `translate`)는 기록을 붙이지 않는다 — 설계 4.1의 표는 저장·변경 실패를 대상으로 한다.
- 브라우저 보고는 관문 두 곳과 설계 4.3이 꼽은 자리에서만 부른다. 토스트 자리마다 부르지 않는다(2026-10-19 결정, 설계 4.3).
- 색은 `globals.css` 토큰만 쓴다(설계 5.6). 모서리는 `--ku-radius`. 인라인 색을 쓰지 않는다 — `e2e/admin-dark.spec.ts`가 잡는다.
- React Compiler와 `eslint-config-next`가 켜져 있다. 렌더 중에 `new Date()`·`Date.now()`를 부르지 않고(시각은 `formatLogTime`의
  기본 인자가 만든다), effect 안의 동기 `setState`를 새로 만들지 않는다(URL은 `setTimeout` 뒤 읽는다 — 제보함과 같다).
- Next 페이지 파일(`page.tsx`)은 기본 내보내기 말고 다른 것을 내보내지 않는다.
- vitest는 `environment: "node"`다. 컴포넌트는 Playwright로 본다. `window`·`localStorage`·`fetch`는 `vi.stubGlobal`로 바꾼다.
- 주석은 이유·외부 제약·위험만 적는다. 다른 파일의 줄 번호·개수·상수 값을 적지 않고 심볼 이름이나 설계 절로 가리킨다.
- 커밋 메시지는 한국어 `type(scope): 내용`. `Co-Authored-By`를 붙이지 않고, 작업 과정(리뷰·점검)을 적지 않는다.
- 이 저장소는 `core.autocrlf=true`다. 파일은 UTF-8로 쓴다. 커밋 전에 `rg -n "\x{FFFD}" <바꾼 파일>`로 깨진 글자가 없는지 본다.
- Next 16 문서는 `node_modules/next/dist/docs/`에 있다(AGENTS.md). `after`는 `01-app/03-api-reference/04-functions/after.md`.

## 검증 방법

```bash
npm run typecheck
npm run test
npx eslint --ignore-pattern ".claude/**" .
npx prettier --check --end-of-line auto --ignore-path .prettierignore --ignore-path .gitignore . "!.claude/**"
npx playwright test e2e/admin-activity-logs.spec.ts e2e/admin-dark.spec.ts   # 고치는 동안
npm run test:e2e                                                             # PR을 열기 전에 전체
```

- 테스트만 커밋한 상태에서 새 테스트를 돌려 **기대한 이유로** 실패하는지 본 뒤 구현한다. 모듈이 아직 없어 typecheck와 vitest가
  함께 실패하는 것은 기대한 실패다.
- Playwright는 포트 3100의 떠 있는 서버를 다시 쓴다. 앞 실행에서 남은 `next dev`가 있으면 끄고 돌린다.

## 브랜치와 PR

`feat/activity-log-app`(PR 1a가 병합된 `main`에서). 병합할 때 이 계획 문서를 `git rm`한다.

## 계획이 정한 것

1. **모듈과 책임.**

   | 파일                                           | 책임                                                                           |
   | ---------------------------------------------- | ------------------------------------------------------------------------------ |
   | `src/lib/activityLabels.ts`                    | 기록 대상 테이블, 작업 키와 그 이름, 칸·값 표시, 목록 요약, 대상 칸, 시각      |
   | `src/lib/failureReason.ts`                     | 사유 코드, `classifyFailure`, `sanitizeDetail`·`redact`·`fitDetail`, 유형      |
   | `src/lib/failureReport.ts`                     | 브라우저 보고 형식 `FailureReport`, 서버의 `parseReports`·`acceptedOccurredAt` |
   | `src/lib/server/adminUsers.ts`                 | `findListedAdmin`·`isListedAdmin`(설계 4.3)                                    |
   | `src/lib/server/activityLog.ts`                | `logFailure`·`writeFailure`(설계 4.2)                                          |
   | `src/lib/server/routeFailures.ts`              | 라우트용 묶음 `routeFailures` — 응답과 기록을 한 번에                          |
   | `src/app/api/activity-logs/route.ts`           | 브라우저 보고 받기(설계 4.3)                                                   |
   | `src/lib/activityReport.ts`                    | `reportFailure`·`flushQueue`·대기열, `authedFetch`용 `reportApiOutcome`        |
   | `src/lib/supabaseWriteReporting.ts`            | 브라우저 Supabase 클라이언트의 보고하는 `fetch`                                |
   | `src/lib/activityLogList.ts`                   | 유형 URL, 커서, `fetchLogPage`, 목록 리듀서                                    |
   | `src/components/admin/logs/*`, `logs/page.tsx` | 화면: 목록 훅, 유형 배지, 상세 모달, 페이지                                    |

2. **작업 키.** 이름이 붙은 키는 `FAILURE_ACTION_LABELS`(예: `facility_photo.upload` → `시설 사진 업로드`). 브라우저 직접 쓰기와
   트리거의 기록 실패 행(설계 3.7)은 `<테이블>.<insert|update|delete>`이고 이름은 `<테이블 이름> <동작>`(예: `시설 수정`)으로
   만든다. 서버는 `isActionKey`로 허용 목록을 본다.
3. **실패 문장(설계 4.4, 2026-10-19 결정).** `<작업 이름> 실패: <사유 문장>`. 대상은 문장에 넣지 않는다. 300자에서 자른다. 라우트가
   돌려준 사유 문장(예: `사진 ID 누락`)은 `reasonText`로 넘겨 입력 오류·충돌·없음 사유에 붙는다.
4. **서버 행위자 이름.** 관리자는 `admin_users.display_name`, 없으면 `미등록 계정(<이메일>)`, 조회가 실패하면
   `관리자(이름 확인 실패: <이메일>)`. 시스템은 `자동 번역`·`OSM 동기화`, 방문자는 `방문자`.
5. **`after`(설계 11장 6).** `logFailure`는 `after(() => writeFailure(input))`. 요청 범위 밖에서 `after`는 던지므로(Next 소스
   `server/after/after.js`) 그때는 바로 `writeFailure`를 부른다. 라우트 테스트는 `@/lib/server/activityLog`를 목으로 바꾼다.
6. **브라우저 관문(설계 4.1·4.3).** `authedFetch`는 응답이나 던진 오류를 `reportApiOutcome`에 넘긴다. 보고 조건: 경로 표
   (`API_ACTIONS`)에 있는 쓰기 호출이고, `fetch`가 던졌거나(사용자 취소 `AbortError`는 빼고) 응답에 `x-vercel-error`가 있거나
   504·401일 때. 413이면 요청 본문의 첫 파일 크기·형식과 한도 `VERCEL_BODY_LIMIT_BYTES`를 싣는다. 브라우저 Supabase 클라이언트는
   `global.fetch`로 `reportingFetch()`를 쓴다. `/rest/v1/<기록 대상 테이블>`의 `POST`·`PATCH`·`DELETE`가 실패하면 PostgREST 오류
   코드와 함께 보고한다. `activityReport`가 `supabaseClient`를 import하므로 `supabaseWriteReporting`은 보고 모듈을 동적
   `import()`로 부른다(정적 import는 순환).
7. **대기열(설계 4.3).** 키 `ku-activity-report-queue`, 최대 50건(넘치면 오래된 것부터 버림). 보낼 때 응답이 성공이면 대기열에서
   지우고, 400·403이면 버리고, 그 밖(던짐·401·5xx)이면 남긴다. 비우기는 지금 로그인한 계정의 항목만, 한 번에 50건까지.
   대시보드 레이아웃이 인증을 확인한 직후와 보고가 한 번 성공한 뒤에 비운다.
8. **보고 받기(설계 4.3).** 묶음 `{ reports: FailureReport[] }`(1~50건). 하나라도 허용 목록 밖이면 400. `owner_user_id`가 토큰
   계정과 다른 항목은 버린다. 행위자·`kind`는 서버가 정한다. `message`는 가린 뒤 300자, `target_id`·`target_label`은 100자.
   `occurred_at`이 미래거나 30일보다 오래됐으면 받은 시각. 저장은 `client_event_id` 충돌을 무시하는 `upsert`
   (`ignoreDuplicates: true`, PostgREST의 `on conflict do nothing`). PostgREST 묶음 insert는 빠진 칸을 null로 채우므로
   `occurred_at`은 늘 싣는다.
9. **로그 화면(설계 5장).** 경로 `/admin/dashboard/logs`, NAV의 `제보함` 오른쪽. 데스크톱은 `ul[aria-label="로그 목록"]` 안의 행
   버튼(머리글 줄은 `aria-hidden`), 모바일(`ADMIN_MOBILE_QUERY`)은 같은 이름의 카드 목록 — JS로 하나만 그린다(제보함과 같다).
   유형은 `<select aria-label="로그 유형">`(`전체`·`info`·`warning`·`error`), 값은 `?level=`에 둔다. 최신순 50건, `더 보기`는
   `(occurred_at, id)` 커서. 유형 배지는 `.ku-row-badge`의 `neutral`·`warn`·`missing` 톤에 글자를 그대로 쓴다.
10. **상세 모달(설계 5.4).** `useModalFocus`(닫기 버튼에 첫 포커스, `Esc` 닫기, 닫은 뒤 연 행으로 포커스 복귀). 머리: 대상(제목)·
    시각·(1분 넘게 다르면) 기록된 시각·유형·사람·동작. 수정은 `칸 | 이전 | 이후`, 등록은 `칸 | 값`, 삭제는 `칸 | 지워진 값`. 실패는
    문장·`사유 코드: <코드>`·접힌 `원문(개발자용)`.
11. **목 백엔드.** `MockState`에 `activityLogs`(시드 다섯 줄)와 `activityReports`(받은 보고). `activity_logs` 조회는 `level=eq.`와
    커서 `or=`만 흉내 낸다. 시나리오가 행을 더하도록 `activityLogRow(overrides)`를 내보낸다.

---

### Task 1: 표시 규칙 — `activityLabels`

**Files:**

- Create: `src/lib/activityLabels.test.ts`, `src/lib/activityLabels.ts`

**Interfaces:**

- Produces: `ActivityLogRow`, `AUDIT_TABLES`, `AuditTable`, `TableActionKey`, `FAILURE_ACTION_LABELS`, `ActionKey`, `isAuditTable`,
  `isActionKey`, `actionLabel`, `tableLabel`, `columnLabel`, `formatValue`, `isShapeSummary`, `changeVerb`, `ChangeLine`,
  `changeLines`, `summarize`, `targetText`, `formatLogTime(iso, now?)`, `recordedLate`.

- [ ] **Step 1: 테스트를 쓴다** — `src/lib/activityLabels.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  actionLabel,
  changeLines,
  changeVerb,
  formatLogTime,
  formatValue,
  isActionKey,
  recordedLate,
  summarize,
  targetText,
} from "./activityLabels";

describe("activityLabels", () => {
  it("칸과 값을 한글로 바꾼다", () => {
    expect(formatValue("is_installed", true)).toBe("설치됨");
    expect(formatValue("is_installed", false)).toBe("미설치");
    expect(formatValue("is_visible", true)).toBe("예");
    expect(formatValue("name", null)).toBe("(비어 있음)");
    expect(formatValue("name", "")).toBe("(비어 있음)");
    expect(formatValue("lat", 37.5)).toBe("37.5");
  });

  it("참조 칸은 기록된 이름을, 가린 입력과 형상은 요약을 보인다", () => {
    expect(
      formatValue("facility_code", { value: "ramp", label: "경사로" }),
    ).toBe("경사로");
    expect(formatValue("facility_code", { value: "ramp", label: null })).toBe(
      "ramp",
    );
    expect(formatValue("content", { redacted: true, length: 17 })).toBe(
      "(방문자 입력 17자, 기록하지 않음)",
    );
    expect(formatValue("geojson", { changed: true, points: 5 })).toBe(
      "형상 변경됨 (꼭짓점 5개)",
    );
  });

  it("사전에 없는 칸은 원래 이름을 그대로 쓴다", () => {
    const [line] = changeLines({
      action: "update",
      target_table: "landmarks",
      changes: { brand_new_column: ["a", "b"] },
    });
    expect(line).toEqual({
      kind: "diff",
      column: "brand_new_column",
      label: "brand_new_column",
      before: "a",
      after: "b",
    });
  });

  it("건물의 is_deleted 변경은 삭제·복구로 보인다", () => {
    const base = { action: "update", target_table: "buildings" } as const;
    expect(
      changeVerb({ ...base, changes: { is_deleted: [false, true] } }),
    ).toBe("삭제");
    expect(changeVerb({ ...base, changes: { is_deleted: [null, true] } })).toBe(
      "삭제",
    );
    expect(
      changeVerb({ ...base, changes: { is_deleted: [true, false] } }),
    ).toBe("복구");
    expect(changeVerb({ ...base, changes: { name: ["a", "b"] } })).toBe("수정");
  });

  it("변경 요약은 첫 칸과 나머지 칸 수를 보인다", () => {
    expect(
      summarize({
        kind: "change",
        action: "update",
        target_table: "building_facilities",
        changes: {
          floor_info: ["1층", "2층"],
          is_installed: [true, false],
          name: ["경사로", "1층 경사로"],
        },
        message: null,
      }),
    ).toBe("수정: 이름 경사로 → 1층 경사로 외 2칸");
    expect(
      summarize({
        kind: "change",
        action: "delete",
        target_table: "landmarks",
        changes: { name: "분수대" },
        message: null,
      }),
    ).toBe("삭제");
    expect(
      summarize({
        kind: "failure",
        action: "facility_photo.upload",
        target_table: null,
        changes: null,
        message: "시설 사진 업로드 실패: 로그인이 만료됨",
      }),
    ).toBe("시설 사진 업로드 실패: 로그인이 만료됨");
  });

  it("대상 칸은 종류와 이름을 잇고, 설정 키는 한글 이름으로 바꾼다", () => {
    expect(
      targetText({
        target_table: "building_facilities",
        target_label: "하나스퀘어 · 1층 경사로",
      }),
    ).toBe("시설 · 하나스퀘어 · 1층 경사로");
    expect(
      targetText({
        target_table: "app_settings",
        target_label: "feedback_emails",
      }),
    ).toBe("설정 · 제보 알림 메일");
    expect(targetText({ target_table: null, target_label: null })).toBe("—");
  });

  it("작업 키를 읽는다", () => {
    expect(actionLabel("facility_photo.upload")).toBe("시설 사진 업로드");
    expect(actionLabel("building_facilities.update")).toBe("시설 수정");
    expect(actionLabel("mystery.key")).toBe("mystery.key");
    expect(isActionKey("slope_segments.delete")).toBe(true);
    expect(isActionKey("toString")).toBe(false);
    expect(isActionKey("buildings.truncate")).toBe(false);
  });

  it("시각은 서울 기준이고 올해가 아니면 연도를 붙인다", () => {
    const now = new Date("2026-10-19T09:00:00Z");
    expect(formatLogTime("2026-10-19T05:02:00Z", now)).toBe("10/19 14:02");
    expect(formatLogTime("2025-12-31T15:30:00Z", now)).toBe("01/01 00:30");
    expect(formatLogTime("2025-12-31T14:30:00Z", now)).toBe("2025/12/31 23:30");
  });

  it("발생과 기록이 1분 넘게 다르면 늦게 들어온 기록이다", () => {
    expect(
      recordedLate({
        occurred_at: "2026-10-19T05:00:00Z",
        recorded_at: "2026-10-19T05:00:50Z",
      }),
    ).toBe(false);
    expect(
      recordedLate({
        occurred_at: "2026-10-19T05:00:00Z",
        recorded_at: "2026-10-19T05:02:00Z",
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: 실패를 본다** — `npx vitest run src/lib/activityLabels.test.ts` → 모듈이 없어 실패. 커밋:
      `test(logs): 감사 로그 표시 규칙을 시험한다`.
- [ ] **Step 3: 구현** — `src/lib/activityLabels.ts`

```ts
import type { Database, Json } from "@supabase-types";

/** 로그 화면의 표시 규칙. 설계: docs/specs/2026-10-19-activity-log-design.md 5.5 */

export type ActivityLogRow =
  Database["public"]["Tables"]["activity_logs"]["Row"];

export const AUDIT_TABLES = [
  "buildings",
  "building_facilities",
  "building_photos",
  "facility_photos",
  "landmarks",
  "slope_segments",
  "colleges",
  "facility_types",
  "app_settings",
  "admin_users",
  "facility_requests",
  "feedback_submissions",
] as const;
export type AuditTable = (typeof AUDIT_TABLES)[number];
export type ChangeOperation = "insert" | "update" | "delete";
export type TableActionKey = `${AuditTable}.${ChangeOperation}`;

const TABLE_LABELS: Record<AuditTable, string> = {
  buildings: "건물",
  building_facilities: "시설",
  building_photos: "건물 사진",
  facility_photos: "시설 사진",
  landmarks: "명소",
  slope_segments: "경사도 경로",
  colleges: "단과대학",
  facility_types: "시설 종류",
  app_settings: "설정",
  admin_users: "관리자",
  facility_requests: "등록 요청",
  feedback_submissions: "의견 제보",
};

const OPERATION_LABELS: Record<ChangeOperation, string> = {
  insert: "등록",
  update: "수정",
  delete: "삭제",
};

export const FAILURE_ACTION_LABELS = {
  "building_photo.upload": "건물 사진 업로드",
  "building_photo.delete": "건물 사진 삭제",
  "facility_photo.upload": "시설 사진 업로드",
  "facility_photo.delete": "시설 사진 삭제",
  "facility_photo.delete_all": "시설 사진 정리",
  "facility_video.upload": "시설 동영상 업로드",
  "facility_video.delete": "시설 동영상 삭제",
  "landmark_photo.upload": "명소 사진 업로드",
  "landmark_photo.delete": "명소 사진 삭제",
  "facility.translate": "자동 번역",
  "public_map.revalidate": "공개 지도 갱신",
  "feedback.status": "의견 상태 변경",
  "feedback.submit": "의견 제보 접수",
  "facility_request.status": "등록 요청 상태 변경",
  "facility_request.approve": "등록 요청 승인",
  "facility_request.reject": "등록 요청 거절",
  "facility_request.cleanup": "등록 요청 사진 정리",
  "facility_request.submit": "등록 요청 접수",
  "facility_request.photo_upload": "등록 요청 사진 업로드",
  "settings.feedback_emails": "제보 알림 메일 저장",
  "buildings.osm_sync": "OSM 동기화",
} as const;
export type NamedActionKey = keyof typeof FAILURE_ACTION_LABELS;
export type ActionKey = NamedActionKey | TableActionKey;

/** 사전 순서가 목록 요약의 "첫 번째 바뀐 칸"을 정한다. */
const COLUMN_LABELS = new Map<string, string>([
  ["name", "이름"],
  ["label", "이름"],
  ["display_name", "표시 이름"],
  ["is_installed", "설치 여부"],
  ["is_deleted", "삭제 여부"],
  ["status", "상태"],
  ["facility_code", "시설 종류"],
  ["building_id", "건물"],
  ["college_id", "단과대학"],
  ["facility_id", "시설"],
  ["campus", "캠퍼스"],
  ["floor_info", "층 정보"],
  ["description", "설명"],
  ["content", "내용"],
  ["feedback_type", "제보 종류"],
  ["caption", "사진 설명"],
  ["video_caption", "동영상 설명"],
  ["lat", "위도"],
  ["lng", "경도"],
  ["geojson", "건물 형상"],
  ["segments", "경로 형상"],
  ["icon", "아이콘"],
  ["photo_url", "사진"],
  ["image_url", "이미지"],
  ["url", "사진 주소"],
  ["storage_path", "저장 위치"],
  ["sort_order", "순서"],
  ["video_url", "동영상"],
  ["video_poster_url", "동영상 포스터"],
  ["translation_status", "번역 상태"],
  ["name_en", "이름(영어)"],
  ["name_zh", "이름(중국어)"],
  ["label_en", "이름(영어)"],
  ["label_zh", "이름(중국어)"],
  ["description_en", "설명(영어)"],
  ["description_zh", "설명(중국어)"],
  ["floor_info_en", "층 정보(영어)"],
  ["floor_info_zh", "층 정보(중국어)"],
  ["caption_en", "사진 설명(영어)"],
  ["caption_zh", "사진 설명(중국어)"],
  ["video_caption_en", "동영상 설명(영어)"],
  ["video_caption_zh", "동영상 설명(중국어)"],
  ["value", "값"],
  ["key", "설정"],
  ["code", "코드"],
  ["gpx_file", "GPX 파일"],
  ["page_url", "페이지 주소"],
  ["reviewed_at", "검토 시각"],
  ["deleted_at", "삭제 시각"],
  ["user_id", "계정"],
  ["id", "ID"],
]);
const COLUMN_ORDER = [...COLUMN_LABELS.keys()];

const BOOLEAN_LABELS = new Map<string, readonly [string, string]>([
  ["is_installed", ["설치됨", "미설치"]],
  ["is_deleted", ["삭제됨", "공개"]],
]);

const SETTING_LABELS = new Map<string, string>([
  ["feedback_emails", "제보 알림 메일"],
]);

const EMPTY = "(비어 있음)";
const SUMMARY_VALUE_LIMIT = 40;

export function isAuditTable(value: unknown): value is AuditTable {
  return (
    typeof value === "string" &&
    (AUDIT_TABLES as readonly string[]).includes(value)
  );
}

function isNamedAction(value: string): value is NamedActionKey {
  return Object.prototype.hasOwnProperty.call(FAILURE_ACTION_LABELS, value);
}

function splitTableAction(key: string): [AuditTable, ChangeOperation] | null {
  const [table, operation, ...rest] = key.split(".");
  if (rest.length > 0 || !isAuditTable(table)) return null;
  return operation === "insert" ||
    operation === "update" ||
    operation === "delete"
    ? [table, operation]
    : null;
}

export function isActionKey(value: unknown): value is ActionKey {
  return (
    typeof value === "string" &&
    (isNamedAction(value) || splitTableAction(value) !== null)
  );
}

export function actionLabel(key: string): string {
  if (isNamedAction(key)) return FAILURE_ACTION_LABELS[key];
  const split = splitTableAction(key);
  return split
    ? `${TABLE_LABELS[split[0]]} ${OPERATION_LABELS[split[1]]}`
    : key;
}

export function tableLabel(table: string | null): string | null {
  if (table === null) return null;
  return isAuditTable(table) ? TABLE_LABELS[table] : table;
}

export function columnLabel(column: string): string {
  return COLUMN_LABELS.get(column) ?? column;
}

type JsonObject = { [key: string]: Json | undefined };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isShapeSummary(
  value: Json | undefined,
): value is { changed: true; points: number } {
  return (
    isObject(value) &&
    value.changed === true &&
    typeof value.points === "number"
  );
}

function isRedacted(
  value: Json | undefined,
): value is { redacted: true; length: number } {
  return (
    isObject(value) &&
    value.redacted === true &&
    typeof value.length === "number"
  );
}

function isReference(
  value: Json | undefined,
): value is { value: Json; label: Json } {
  return (
    isObject(value) &&
    "value" in value &&
    "label" in value &&
    Object.keys(value).length === 2
  );
}

export function formatValue(column: string, value: Json | undefined): string {
  if (value === undefined || value === null || value === "") return EMPTY;
  if (isRedacted(value))
    return `(방문자 입력 ${value.length}자, 기록하지 않음)`;
  if (isShapeSummary(value)) return `형상 변경됨 (꼭짓점 ${value.points}개)`;
  if (isReference(value)) {
    return typeof value.label === "string" && value.label !== ""
      ? value.label
      : formatValue(column, value.value);
  }
  if (typeof value === "boolean") {
    const labels = BOOLEAN_LABELS.get(column);
    if (labels) return value ? labels[0] : labels[1];
    return value ? "예" : "아니오";
  }
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  return JSON.stringify(value);
}

type ChangeSource = Pick<ActivityLogRow, "action" | "target_table" | "changes">;

export function changeVerb(row: ChangeSource): string {
  if (row.action === "insert") return OPERATION_LABELS.insert;
  if (row.action === "delete") return OPERATION_LABELS.delete;
  if (row.target_table === "buildings" && isObject(row.changes ?? undefined)) {
    const pair = (row.changes as JsonObject).is_deleted;
    if (Array.isArray(pair)) {
      if (pair[1] === true && pair[0] !== true) return "삭제";
      if (pair[0] === true && pair[1] !== true) return "복구";
    }
  }
  return OPERATION_LABELS.update;
}

export type ChangeLine =
  | {
      kind: "diff";
      column: string;
      label: string;
      before: string;
      after: string;
    }
  | { kind: "value"; column: string; label: string; value: string };

function columnRank(column: string): number {
  const index = COLUMN_ORDER.indexOf(column);
  return index === -1 ? COLUMN_ORDER.length : index;
}

export function changeLines(row: ChangeSource): ChangeLine[] {
  const changes = row.changes ?? undefined;
  if (!isObject(changes)) return [];
  return Object.keys(changes)
    .sort((a, b) => columnRank(a) - columnRank(b) || a.localeCompare(b))
    .map((column): ChangeLine => {
      const label = columnLabel(column);
      const entry = changes[column];
      if (
        row.action === "update" &&
        Array.isArray(entry) &&
        entry.length === 2
      ) {
        return {
          kind: "diff",
          column,
          label,
          before: formatValue(column, entry[0]),
          after: formatValue(column, entry[1]),
        };
      }
      return {
        kind: "value",
        column,
        label,
        value: formatValue(column, entry),
      };
    });
}

function clip(text: string, limit = SUMMARY_VALUE_LIMIT): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** 목록의 `내용` 칸. 실패는 저장된 문장을, 변경은 `<동작>: <첫 칸> 외 N칸`을 보인다. */
export function summarize(
  row: Pick<
    ActivityLogRow,
    "kind" | "action" | "target_table" | "changes" | "message"
  >,
): string {
  if (row.kind === "failure")
    return row.message ?? `${actionLabel(row.action)} 실패`;
  const verb = changeVerb(row);
  if (verb === "삭제" || verb === "복구") return verb;
  const lines = changeLines(row);
  if (lines.length === 0) return verb;
  const first = lines[0];
  const text =
    first.kind === "diff"
      ? `${first.label} ${clip(first.before)} → ${clip(first.after)}`
      : `${first.label} ${clip(first.value)}`;
  return lines.length > 1
    ? `${verb}: ${text} 외 ${lines.length - 1}칸`
    : `${verb}: ${text}`;
}

export function targetText(
  row: Pick<ActivityLogRow, "target_table" | "target_label">,
): string {
  const kind = tableLabel(row.target_table);
  const name =
    row.target_table === "app_settings" && row.target_label
      ? (SETTING_LABELS.get(row.target_label) ?? row.target_label)
      : row.target_label;
  const parts = [kind, name].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : "—";
}

const SEOUL_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function seoulParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    SEOUL_PARTS.formatToParts(date).map((part) => [part.type, part.value]),
  );
}

/** 올해면 `MM/DD HH:mm`, 아니면 `YYYY/MM/DD HH:mm`. 관리자가 한국에 있어 서울 시각으로 고정한다. */
export function formatLogTime(iso: string, now: Date = new Date()): string {
  const at = seoulParts(new Date(iso));
  const time = `${at.month}/${at.day} ${at.hour}:${at.minute}`;
  return at.year === seoulParts(now).year ? time : `${at.year}/${time}`;
}

export function recordedLate(
  row: Pick<ActivityLogRow, "occurred_at" | "recorded_at">,
): boolean {
  return (
    Math.abs(Date.parse(row.recorded_at) - Date.parse(row.occurred_at)) > 60_000
  );
}
```

- [ ] **Step 4:** `npx vitest run src/lib/activityLabels.test.ts` → 9개 통과. 커밋: `feat(logs): 감사 로그의 칸·값·작업 이름 표시 규칙을 둔다`.

### Task 2: 사유 분류 — `failureReason`

**Files:**

- Create: `src/lib/failureReason.test.ts`, `src/lib/failureReason.ts`

**Interfaces:**

- Consumes: Task 1의 `actionLabel`, `ActionKey`.
- Produces: `REASON_CODES`, `ReasonCode`, `isReportableReason`, `FailureDetail`, `FailureContext`, `FailureSource`
  (`thrown`·`response`·`postgrest`·`known`), `ClassifiedFailure`, `MESSAGE_LIMIT`, `clip`, `redact`, `fitDetail`,
  `sanitizeDetail`, `classifyFailure(source, context)`, `failureLevel(reason, followUp?)`.

- [ ] **Step 1: 테스트를 쓴다** — `src/lib/failureReason.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  classifyFailure,
  failureLevel,
  fitDetail,
  isReportableReason,
  sanitizeDetail,
} from "./failureReason";

const upload = { action: "facility_photo.upload" } as const;

describe("classifyFailure", () => {
  it("응답 없이 fetch가 던지면 network", () => {
    const result = classifyFailure(
      { kind: "thrown", error: new TypeError("Failed to fetch") },
      upload,
    );
    expect(result.reason_code).toBe("network");
    expect(result.message).toBe(
      "시설 사진 업로드 실패: 네트워크 연결이 끊겨 서버에 닿지 못함",
    );
  });

  it("상태 코드로 사유를 추정한다", () => {
    const reason = (status: number) =>
      classifyFailure({ kind: "response", status }, upload).reason_code;
    expect(reason(504)).toBe("timeout");
    expect(reason(413)).toBe("payload_too_large");
    expect(reason(401)).toBe("session_expired");
    expect(reason(403)).toBe("forbidden");
    expect(reason(404)).toBe("not_found");
    expect(reason(409)).toBe("conflict");
    expect(reason(415)).toBe("unsupported_type");
    expect(reason(400)).toBe("invalid_input");
    expect(reason(502)).toBe("server_error");
    expect(reason(418)).toBe("unknown");
  });

  it("413은 파일 크기와 한도를 문장에 넣는다", () => {
    const result = classifyFailure(
      {
        kind: "response",
        status: 413,
        vercelError: "FUNCTION_PAYLOAD_TOO_LARGE",
      },
      { ...upload, fileSize: 5.2 * 1024 * 1024, limit: 4.5 * 1024 * 1024 },
    );
    expect(result.message).toBe(
      "시설 사진 업로드 실패: 파일 5.2MB가 서버 한도 4.5MB를 넘음",
    );
    expect(result.detail).toMatchObject({
      status: 413,
      code: "FUNCTION_PAYLOAD_TOO_LARGE",
    });
  });

  it("PostgREST 오류 코드를 읽는다", () => {
    const reason = (code: string, status?: number) =>
      classifyFailure(
        { kind: "postgrest", status, error: { code, message: "x" } },
        { action: "building_facilities.update" },
      );
    expect(reason("23505").reason_code).toBe("conflict");
    expect(reason("23505").message).toBe(
      "시설 수정 실패: 같은 항목이 이미 있음",
    );
    expect(reason("23503").message).toBe(
      "시설 수정 실패: 연결된 항목이 있어 지울 수 없음",
    );
    expect(reason("42501", 403).reason_code).toBe("forbidden");
    expect(reason("PGRST301", 401).reason_code).toBe("session_expired");
  });

  it("라우트가 아는 사유는 그대로 쓰고 응답 문장을 붙인다", () => {
    expect(
      classifyFailure(
        { kind: "known", reason: "invalid_input", status: 400 },
        { action: "facility_photo.delete", reasonText: "사진 ID 누락" },
      ).message,
    ).toBe("시설 사진 삭제 실패: 입력값이 올바르지 않음: 사진 ID 누락");
    expect(
      classifyFailure(
        {
          kind: "known",
          reason: "storage_error",
          error: { message: "The resource was not found" },
        },
        { action: "facility_photo.delete" },
      ).message,
    ).toBe(
      "시설 사진 삭제 실패: 파일 저장소가 거부함: The resource was not found",
    );
  });

  it("unknown도 오류 원문을 남긴다", () => {
    const result = classifyFailure(
      { kind: "thrown", error: new Error("boom") },
      upload,
    );
    expect(result.reason_code).toBe("unknown");
    expect(result.message).toBe("시설 사진 업로드 실패: 알 수 없는 오류: boom");
    expect(result.detail.error_message).toBe("boom");
  });

  it("문장은 300자에서 자른다", () => {
    const result = classifyFailure(
      { kind: "thrown", error: new Error("x".repeat(400)) },
      upload,
    );
    expect(result.message).toHaveLength(300);
  });
});

describe("sanitizeDetail", () => {
  it("허용 목록 밖 키를 버린다", () => {
    expect(
      sanitizeDetail({ status: 500, body: { secret: 1 }, headers: "x" }),
    ).toEqual({ status: 500 });
  });

  it("URL 쿼리, Bearer 토큰, JWT를 가린다", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
    expect(
      sanitizeDetail({
        error_message: `GET https://r2.test/a.webp?X-Amz-Signature=abc failed with Bearer abc.def and ${jwt}`,
        route: "/api/upload?token=1",
      }),
    ).toEqual({
      error_message:
        "GET https://r2.test/a.webp failed with Bearer [가림] and [가림]",
      route: "/api/upload",
    });
  });

  it("4KB를 넘으면 truncated와 앞에서부터 들어가는 키만 남긴다", () => {
    expect(
      fitDetail(
        { status: 500, code: "x".repeat(40), error_message: "y".repeat(30) },
        90,
      ),
    ).toEqual({ truncated: true, status: 500, code: "x".repeat(40) });
  });
});

describe("유형", () => {
  it("뒤따르는 일의 실패와 forbidden은 warning", () => {
    expect(failureLevel("server_error")).toBe("error");
    expect(failureLevel("server_error", true)).toBe("warning");
    expect(failureLevel("forbidden")).toBe("warning");
  });

  it("브라우저는 audit_write_failed를 보고하지 못한다", () => {
    expect(isReportableReason("network")).toBe(true);
    expect(isReportableReason("audit_write_failed")).toBe(false);
    expect(isReportableReason("made_up")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 본다**, 커밋: `test(logs): 실패 사유 분류와 원문 가림을 시험한다`.
- [ ] **Step 3: 구현** — `src/lib/failureReason.ts`

```ts
import { actionLabel, type ActionKey } from "./activityLabels";

/** 실패 사유 분류. 서버와 브라우저가 같이 쓴다. 설계: docs/specs/2026-10-19-activity-log-design.md 4.4·4.5 */

export const REASON_CODES = [
  "network",
  "timeout",
  "payload_too_large",
  "invalid_input",
  "unsupported_type",
  "session_expired",
  "forbidden",
  "conflict",
  "not_found",
  "storage_error",
  "translation_error",
  "server_error",
  "unknown",
  "audit_write_failed",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** `audit_write_failed`는 트리거만 쓴다. 브라우저 보고로는 받지 않는다. */
export function isReportableReason(
  value: unknown,
): value is Exclude<ReasonCode, "audit_write_failed"> {
  return (
    typeof value === "string" &&
    value !== "audit_write_failed" &&
    (REASON_CODES as readonly string[]).includes(value)
  );
}

export type FailureDetail = {
  status?: number;
  code?: string;
  error_message?: string;
  file_size?: number;
  file_type?: string;
  limit?: number;
  route?: string;
  truncated?: true;
};

export type FailureContext = {
  action: ActionKey;
  route?: string;
  fileSize?: number;
  fileType?: string;
  limit?: number;
  /** 라우트가 응답에 실은 사유 문장. 입력 오류·충돌·없음 사유에 붙인다. */
  reasonText?: string;
};

export type FailureSource =
  | { kind: "thrown"; error: unknown }
  | { kind: "response"; status: number; vercelError?: string | null }
  | {
      kind: "postgrest";
      status?: number;
      error: { code?: string; message?: string };
    }
  | { kind: "known"; reason: ReasonCode; status?: number; error?: unknown };

export type ClassifiedFailure = {
  reason_code: ReasonCode;
  message: string;
  detail: FailureDetail;
};

export const MESSAGE_LIMIT = 300;
const ERROR_MESSAGE_LIMIT = 500;
const DETAIL_BYTE_LIMIT = 4096;

export function clip(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit) : text;
}

/** 지울 수 없는 로그에 토큰·서명 URL이 남지 않게 가린다(설계 4.4). */
export function redact(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s?#"']+)\?[^\s#"']*/g, "$1")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [가림]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[가림]");
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function fitDetail(
  detail: FailureDetail,
  maxBytes = DETAIL_BYTE_LIMIT,
): FailureDetail {
  if (byteLength(detail) <= maxBytes) return detail;
  const fitted: FailureDetail = { truncated: true };
  for (const [key, value] of Object.entries(detail)) {
    const next = { ...fitted, [key]: value };
    if (byteLength(next) > maxBytes) break;
    Object.assign(fitted, { [key]: value });
  }
  return fitted;
}

/** 허용한 키만 남긴다. 오류 객체나 응답 본문을 통째로 넣지 않는다(설계 4.4). */
export function sanitizeDetail(raw: Record<string, unknown>): FailureDetail {
  const detail: FailureDetail = {};
  if (typeof raw.status === "number") detail.status = raw.status;
  if (typeof raw.code === "string" && raw.code !== "")
    detail.code = clip(raw.code, 50);
  if (typeof raw.error_message === "string" && raw.error_message !== "")
    detail.error_message = clip(redact(raw.error_message), ERROR_MESSAGE_LIMIT);
  if (typeof raw.file_size === "number") detail.file_size = raw.file_size;
  if (typeof raw.file_type === "string" && raw.file_type !== "")
    detail.file_type = clip(raw.file_type, 100);
  if (typeof raw.limit === "number") detail.limit = raw.limit;
  if (typeof raw.route === "string" && raw.route !== "")
    detail.route = clip(redact(raw.route.split("?")[0]), 200);
  return fitDetail(detail);
}

function reasonOf(source: FailureSource): ReasonCode {
  switch (source.kind) {
    case "known":
      return source.reason;
    case "thrown":
      if (source.error instanceof Error && source.error.name === "TimeoutError")
        return "timeout";
      return source.error instanceof TypeError ? "network" : "unknown";
    case "response": {
      const status = source.status;
      if (status === 504) return "timeout";
      if (status === 413) return "payload_too_large";
      if (status === 401) return "session_expired";
      if (status === 403) return "forbidden";
      if (status === 404) return "not_found";
      if (status === 409) return "conflict";
      if (status === 415) return "unsupported_type";
      if (status === 400) return "invalid_input";
      return status >= 500 ? "server_error" : "unknown";
    }
    case "postgrest": {
      const code = source.error.code;
      if (code === "PGRST301" || source.status === 401)
        return "session_expired";
      if (code === "42501" || source.status === 403) return "forbidden";
      if (code === "23505" || code === "23503") return "conflict";
      if (code === "PGRST116") return "not_found";
      return (source.status ?? 0) >= 500 ? "server_error" : "unknown";
    }
  }
}

function errorParts(error: unknown): { code?: string; message?: string } {
  if (error instanceof Error) return { message: error.message };
  if (typeof error === "object" && error !== null) {
    const record = error as { code?: unknown; message?: unknown };
    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
    };
  }
  return typeof error === "string" ? { message: error } : {};
}

function sourceParts(source: FailureSource): {
  status?: number;
  code?: string;
  message?: string;
} {
  switch (source.kind) {
    case "known":
      return { status: source.status, ...errorParts(source.error) };
    case "thrown":
      return errorParts(source.error);
    case "response":
      return {
        status: source.status,
        code: source.vercelError ?? undefined,
      };
    case "postgrest":
      return {
        status: source.status,
        code: source.error.code,
        message: source.error.message,
      };
  }
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
const withText = (base: string, text?: string) =>
  text ? `${base}: ${text}` : base;

function sentence(
  reason: ReasonCode,
  detail: FailureDetail,
  context: FailureContext,
): string {
  switch (reason) {
    case "network":
      return "네트워크 연결이 끊겨 서버에 닿지 못함";
    case "timeout":
      return "서버 처리 시간이 초과됨";
    case "payload_too_large":
      return detail.file_size !== undefined && detail.limit !== undefined
        ? `파일 ${megabytes(detail.file_size)}가 서버 한도 ${megabytes(detail.limit)}를 넘음`
        : "파일이 서버 한도를 넘음";
    case "invalid_input":
      return withText("입력값이 올바르지 않음", context.reasonText);
    case "unsupported_type":
      return detail.file_type
        ? `지원하지 않는 형식(${detail.file_type})`
        : "지원하지 않는 형식";
    case "session_expired":
      return "로그인이 만료됨";
    case "forbidden":
      return "관리자 목록에 없는 계정";
    case "conflict":
      return (
        context.reasonText ??
        (detail.code === "23503"
          ? "연결된 항목이 있어 지울 수 없음"
          : "같은 항목이 이미 있음")
      );
    case "not_found":
      return context.reasonText ?? "대상이 이미 지워졌거나 없음";
    case "storage_error":
      return withText("파일 저장소가 거부함", detail.error_message);
    case "translation_error":
      return withText("번역 API 오류", detail.error_message);
    case "server_error":
      return withText("서버 내부 오류", detail.error_message);
    case "audit_write_failed":
      return withText("변경 기록 실패", detail.error_message);
    case "unknown":
      return withText("알 수 없는 오류", detail.error_message);
  }
}

export function classifyFailure(
  source: FailureSource,
  context: FailureContext,
): ClassifiedFailure {
  const reason = reasonOf(source);
  const parts = sourceParts(source);
  const detail = sanitizeDetail({
    status: parts.status,
    code: parts.code,
    error_message: parts.message,
    file_size: context.fileSize,
    file_type: context.fileType,
    limit: context.limit,
    route: context.route,
  });
  const message = clip(
    `${actionLabel(context.action)} 실패: ${sentence(reason, detail, context)}`,
    MESSAGE_LIMIT,
  );
  return { reason_code: reason, message, detail };
}

/** 저장은 됐지만 뒤따르는 일이 실패했거나 `forbidden`이면 warning(설계 4.5). */
export function failureLevel(
  reason: ReasonCode,
  followUp = false,
): "warning" | "error" {
  return followUp || reason === "forbidden" ? "warning" : "error";
}
```

- [ ] **Step 4:** `npx vitest run src/lib/failureReason.test.ts` → 12개 통과. 커밋:
      `feat(logs): 실패를 사유 코드와 사람이 읽는 문장으로 나누는 classifyFailure를 둔다`.

### Task 3: 서버 실패 기록 — `adminUsers`, `activityLog`, `routeFailures`

**Files:**

- Create: `src/lib/server/adminUsers.ts`(+`.test.ts`), `src/lib/server/activityLog.ts`(+`.test.ts`),
  `src/lib/server/routeFailures.ts`(+`.test.ts`)

**Interfaces:**

- Consumes: PR 1a의 `supabaseAdmin()`, Task 2의 `classifyFailure`·`failureLevel`.
- Produces:
  - `findListedAdmin(userId): Promise<{ displayName: string } | null>` — 조회가 실패하면 던진다.
  - `isListedAdmin(userId): Promise<boolean>` — PR 2의 `requireAdmin`이 쓴다.
  - `LogActor`, `FailureTarget`, `FailureLogInput`, `logFailure(input): void`, `writeFailure(input): Promise<void>`.
  - `routeFailures(scope)` → `setTarget(target)`, `respond(status, error, reason, extra?)`, `record(reason, extra?)`.

- [ ] **Step 1: 테스트 셋을 쓴다**

`src/lib/server/adminUsers.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

let result: unknown;
const from = vi.fn(() => queryStub(result));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

describe("adminUsers", () => {
  beforeEach(() => {
    from.mockClear();
  });

  it("목록에 있으면 표시 이름을 돌려준다", async () => {
    result = { data: { display_name: "관리자" }, error: null };
    const { findListedAdmin, isListedAdmin } = await import("./adminUsers");
    expect(await findListedAdmin("u1")).toEqual({ displayName: "관리자" });
    expect(await isListedAdmin("u1")).toBe(true);
    expect(from).toHaveBeenCalledWith("admin_users");
  });

  it("목록에 없으면 null", async () => {
    result = { data: null, error: null };
    const { findListedAdmin, isListedAdmin } = await import("./adminUsers");
    expect(await findListedAdmin("u2")).toBeNull();
    expect(await isListedAdmin("u2")).toBe(false);
  });

  it("조회가 실패하면 던진다", async () => {
    result = { data: null, error: { message: "db down" } };
    const { findListedAdmin } = await import("./adminUsers");
    await expect(findListedAdmin("u1")).rejects.toEqual({ message: "db down" });
  });
});
```

`src/lib/server/activityLog.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.fn();
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after,
}));
const insert = vi.fn();
const from = vi.fn(() => ({ insert }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));
const findListedAdmin = vi.fn();
vi.mock("@/lib/server/adminUsers", () => ({ findListedAdmin }));

const admin = {
  kind: "admin",
  user: { id: "u1", email: "admin@example.com" },
} as const;

describe("logFailure", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockResolvedValue({ error: null });
    findListedAdmin.mockResolvedValue({ displayName: "관리자" });
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("기록을 after에 맡기고 기다리지 않는다", async () => {
    const { logFailure } = await import("./activityLog");
    logFailure({
      route: "/api/delete-facility-photo",
      action: "facility_photo.delete",
      actor: admin,
      reason: "storage_error",
      status: 500,
      error: { message: "denied" },
      target: { table: "facility_photos", id: "p1" },
    });
    expect(insert).not.toHaveBeenCalled();
    await after.mock.calls[0][0]();
    expect(from).toHaveBeenCalledWith("activity_logs");
    expect(insert).toHaveBeenCalledWith({
      level: "error",
      kind: "failure",
      actor_kind: "admin",
      actor_id: "u1",
      actor_label: "관리자",
      action: "facility_photo.delete",
      target_table: "facility_photos",
      target_id: "p1",
      target_label: null,
      reason_code: "storage_error",
      message: "시설 사진 삭제 실패: 파일 저장소가 거부함: denied",
      detail: {
        status: 500,
        error_message: "denied",
        route: "/api/delete-facility-photo",
      },
    });
  });

  it("목록에 없는 관리자는 미등록 계정(이메일)로 남긴다", async () => {
    findListedAdmin.mockResolvedValue(null);
    const { writeFailure } = await import("./activityLog");
    await writeFailure({
      route: "/api/x",
      action: "facility_photo.upload",
      actor: admin,
      reason: "invalid_input",
    });
    expect(insert.mock.calls[0][0].actor_label).toBe(
      "미등록 계정(admin@example.com)",
    );
  });

  it("방문자와 시스템 행위자, 뒤따르는 일의 실패는 warning", async () => {
    const { writeFailure } = await import("./activityLog");
    await writeFailure({
      route: "/api/translate-facility",
      action: "facility.translate",
      actor: { kind: "system", system: "translation" },
      reason: "translation_error",
      followUp: true,
    });
    await writeFailure({
      route: "/api/feedback",
      action: "feedback.submit",
      actor: { kind: "visitor" },
      reason: "server_error",
    });
    expect(insert.mock.calls[0][0]).toMatchObject({
      level: "warning",
      actor_kind: "system",
      actor_label: "자동 번역",
      message: "자동 번역 실패: 번역 API 오류",
    });
    expect(insert.mock.calls[1][0]).toMatchObject({
      level: "error",
      actor_kind: "visitor",
      actor_id: null,
      actor_label: "방문자",
    });
  });

  it("insert가 실패해도 던지지 않고 console.error로 남긴다", async () => {
    insert.mockResolvedValue({ error: { message: "db down" } });
    const { writeFailure } = await import("./activityLog");
    await expect(
      writeFailure({
        route: "/api/x",
        action: "facility_photo.upload",
        actor: admin,
        reason: "server_error",
      }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "[activity-log] failure log write failed",
      expect.objectContaining({ message: "db down" }),
    );
  });

  it("after를 못 쓰면 바로 쓴다", async () => {
    after.mockImplementation(() => {
      throw new Error("outside request scope");
    });
    const { logFailure } = await import("./activityLog");
    logFailure({
      route: "/api/x",
      action: "facility_photo.upload",
      actor: { kind: "visitor" },
      reason: "server_error",
    });
    await vi.waitFor(() => expect(insert).toHaveBeenCalled());
  });
});
```

`src/lib/server/routeFailures.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const logFailure = vi.fn();
vi.mock("@/lib/server/activityLog", () => ({ logFailure }));

const scope = {
  route: "/api/delete-facility-photo",
  action: "facility_photo.delete",
  actor: { kind: "admin", user: { id: "u1", email: "admin@example.com" } },
} as const;

describe("routeFailures", () => {
  beforeEach(() => {
    logFailure.mockClear();
  });

  it("respond는 기록하고 { error } 응답을 만든다", async () => {
    const { routeFailures } = await import("./routeFailures");
    const failures = routeFailures(scope);
    failures.setTarget({ table: "facility_photos", id: "p1" });
    const response = failures.respond(404, "사진이 없어요", "not_found");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "사진이 없어요" });
    expect(logFailure).toHaveBeenCalledWith({
      ...scope,
      target: { table: "facility_photos", id: "p1" },
      reasonText: "사진이 없어요",
      reason: "not_found",
      status: 404,
    });
  });

  it("record는 응답 없이 기록하고 작업 키를 바꿀 수 있다", async () => {
    const { routeFailures } = await import("./routeFailures");
    routeFailures(scope).record("storage_error", {
      action: "facility_request.cleanup",
      followUp: true,
    });
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "facility_request.cleanup",
        followUp: true,
        reason: "storage_error",
      }),
    );
  });
});
```

- [ ] **Step 2: 실패를 본다**, 커밋: `test(server): 실패 기록이 응답을 막지 않고 행위자 이름을 붙이는지 시험한다`.
- [ ] **Step 3: 구현**

`src/lib/server/adminUsers.ts`

```ts
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

/** `admin_users`에 있으면 표시 이름을, 없으면 null. 조회가 실패하면 던진다 — 호출부가 "없음"과 구별해야 한다. */
export async function findListedAdmin(
  userId: string,
): Promise<{ displayName: string } | null> {
  const { data, error } = await supabaseAdmin()
    .from("admin_users")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { displayName: data.display_name } : null;
}

export async function isListedAdmin(userId: string): Promise<boolean> {
  return (await findListedAdmin(userId)) !== null;
}
```

`src/lib/server/activityLog.ts`

```ts
import { after } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { ActionKey, AuditTable } from "@/lib/activityLabels";
import {
  classifyFailure,
  failureLevel,
  type ReasonCode,
} from "@/lib/failureReason";
import { findListedAdmin } from "@/lib/server/adminUsers";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

/** 서버 실패 기록. 설계: docs/specs/2026-10-19-activity-log-design.md 4.2 */

export type LogActor =
  | { kind: "admin"; user: Pick<User, "id" | "email"> }
  | { kind: "visitor" }
  | { kind: "system"; system: "translation" | "osm_sync" };

export type FailureTarget = {
  table: AuditTable;
  id?: string | null;
  label?: string | null;
};

export type FailureLogInput = {
  route: string;
  action: ActionKey;
  actor: LogActor;
  reason: ReasonCode;
  status?: number;
  error?: unknown;
  followUp?: boolean;
  target?: FailureTarget;
  reasonText?: string;
  fileSize?: number;
  fileType?: string;
  limit?: number;
};

const SYSTEM_LABELS = {
  translation: "자동 번역",
  osm_sync: "OSM 동기화",
} as const;

async function actorColumns(actor: LogActor) {
  if (actor.kind === "visitor")
    return { actor_kind: "visitor", actor_id: null, actor_label: "방문자" };
  if (actor.kind === "system")
    return {
      actor_kind: "system",
      actor_id: null,
      actor_label: SYSTEM_LABELS[actor.system],
    };
  const fallback = actor.user.email ?? actor.user.id;
  const listed = await findListedAdmin(actor.user.id).then(
    (admin) => admin?.displayName ?? `미등록 계정(${fallback})`,
    () => `관리자(이름 확인 실패: ${fallback})`,
  );
  return { actor_kind: "admin", actor_id: actor.user.id, actor_label: listed };
}

export async function writeFailure(input: FailureLogInput): Promise<void> {
  try {
    const { reason_code, message, detail } = classifyFailure(
      {
        kind: "known",
        reason: input.reason,
        status: input.status,
        error: input.error,
      },
      {
        action: input.action,
        route: input.route,
        reasonText: input.reasonText,
        fileSize: input.fileSize,
        fileType: input.fileType,
        limit: input.limit,
      },
    );
    const { error } = await supabaseAdmin()
      .from("activity_logs")
      .insert({
        level: failureLevel(reason_code, input.followUp),
        kind: "failure",
        ...(await actorColumns(input.actor)),
        action: input.action,
        target_table: input.target?.table ?? null,
        target_id: input.target?.id ?? null,
        target_label: input.target?.label ?? null,
        reason_code,
        message,
        detail,
      });
    if (error) throw error;
  } catch (error) {
    console.error("[activity-log] failure log write failed", {
      route: input.route,
      action: input.action,
      reason: input.reason,
      message:
        error instanceof Error
          ? error.message
          : (error as { message?: unknown } | null)?.message,
    });
  }
}

/** 응답을 기다리게 하지 않는다. `after`를 못 쓰는 곳(요청 범위 밖)에서는 바로 쓴다. */
export function logFailure(input: FailureLogInput): void {
  try {
    after(() => writeFailure(input));
  } catch {
    void writeFailure(input);
  }
}
```

`src/lib/server/routeFailures.ts`

```ts
import { NextResponse } from "next/server";
import type { ReasonCode } from "@/lib/failureReason";
import {
  logFailure,
  type FailureLogInput,
  type FailureTarget,
} from "@/lib/server/activityLog";

type Scope = Pick<
  FailureLogInput,
  "route" | "action" | "actor" | "followUp"
> & {
  target?: FailureTarget;
};
type Extra = Partial<
  Omit<FailureLogInput, "route" | "actor" | "reason" | "status">
>;

/**
 * 라우트 하나의 실패 기록 묶음. `respond`는 기록하고 `{ error }` 응답을 만든다. `record`는 응답을 바꾸지 않는
 * 실패(저장은 됐지만 뒤따르는 일이 실패한 경우)를 기록한다.
 */
export function routeFailures(scope: Scope) {
  let target = scope.target;
  return {
    setTarget(next: FailureTarget) {
      target = next;
    },
    respond(
      status: number,
      error: string,
      reason: ReasonCode,
      extra: Extra = {},
    ) {
      logFailure({
        ...scope,
        target,
        reasonText: error,
        ...extra,
        reason,
        status,
      });
      return NextResponse.json({ error }, { status });
    },
    record(reason: ReasonCode, extra: Extra & { status?: number } = {}) {
      logFailure({ ...scope, target, ...extra, reason });
    },
  };
}
```

- [ ] **Step 4:** `npx vitest run src/lib/server` → 통과. 커밋: `feat(server): 실패를 after로 감사 로그에 남기는 logFailure와 라우트 묶음을 둔다`.

### Task 4: 브라우저 보고 받기 — `failureReport`, `POST /api/activity-logs`

**Files:**

- Create: `src/lib/failureReport.ts`, `src/app/api/activity-logs/route.test.ts`, `src/app/api/activity-logs/route.ts`

**Interfaces:**

- Consumes: Task 1의 `isActionKey`·`isAuditTable`, Task 2의 `sanitizeDetail`·`redact`·`clip`·`isReportableReason`, Task 3의
  `findListedAdmin`.
- Produces: `FailureReport`(Task 6이 만든다), `MAX_REPORTS_PER_REQUEST`, `parseReports(body)`, `acceptedOccurredAt(value, now)`.

- [ ] **Step 1: 테스트를 쓴다** — `src/app/api/activity-logs/route.test.ts`(설계 8.1의 `/api/activity-logs` 항목 전부)

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const findListedAdmin = vi.fn();
vi.mock("@/lib/server/adminUsers", () => ({ findListedAdmin }));
let writeResult: unknown;
const from = vi.fn(() => queryStub(writeResult));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const NOW = new Date("2026-10-19T09:00:00.000Z");

function report(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    client_event_id: "11111111-1111-4111-8111-111111111111",
    owner_user_id: "u1",
    occurred_at: "2026-10-19T08:30:00.000Z",
    level: "error",
    action: "facility_photo.upload",
    reason_code: "network",
    message: "시설 사진 업로드 실패: 네트워크 연결이 끊겨 서버에 닿지 못함",
    detail: { status: 0 },
    target_table: null,
    target_id: null,
    target_label: null,
    ...overrides,
  };
}

const post = (body: unknown) =>
  new Request("https://local.test/api/activity-logs", {
    method: "POST",
    body: JSON.stringify(body),
  });

function written(): Record<string, unknown>[] {
  const call = (
    from.mock.results[0].value as {
      calls: { method: string; args: unknown[] }[];
    }
  ).calls.find((entry) => entry.method === "upsert");
  return call?.args[0] as Record<string, unknown>[];
}

describe("POST /api/activity-logs", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    requireAdmin.mockResolvedValue({ user: { id: "u1" } });
    findListedAdmin.mockResolvedValue({ displayName: "관리자" });
    writeResult = { error: null };
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    errorSpy.mockRestore();
  });

  it("토큰이 없으면 401", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "인증 필요" }, { status: 401 }),
    });
    const { POST } = await import("./route");
    expect((await POST(post({ reports: [report()] }))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("로그인했지만 admin_users에 없는 계정은 403", async () => {
    findListedAdmin.mockResolvedValue(null);
    const { POST } = await import("./route");
    expect((await POST(post({ reports: [report()] }))).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("행위자는 본문이 아니라 토큰에서 정하고 kind는 언제나 failure", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post({
        reports: [
          report({ actor_label: "가짜", kind: "change", actor_id: "u9" }),
        ],
      }),
    );
    expect(await response.json()).toEqual({ accepted: 1 });
    expect(written()[0]).toMatchObject({
      kind: "failure",
      actor_kind: "admin",
      actor_id: "u1",
      actor_label: "관리자",
      occurred_at: "2026-10-19T08:30:00.000Z",
      client_event_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("owner_user_id가 토큰 계정과 다른 항목은 버린다", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post({
        reports: [
          report({ owner_user_id: "u2" }),
          report({
            client_event_id: "22222222-2222-4222-8222-222222222222",
          }),
        ],
      }),
    );
    expect(await response.json()).toEqual({ accepted: 1 });
    expect(written()).toHaveLength(1);
  });

  it("허용 목록 밖 값이면 400", async () => {
    const { POST } = await import("./route");
    for (const bad of [
      report({ level: "info" }),
      report({ reason_code: "audit_write_failed" }),
      report({ action: "drop.table" }),
      report({ target_table: "auth_users" }),
      report({ client_event_id: "not-a-uuid" }),
    ]) {
      expect((await POST(post({ reports: [bad] }))).status).toBe(400);
    }
    expect((await POST(post({ reports: [] }))).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("message·detail을 자르고 가린다", async () => {
    const { POST } = await import("./route");
    await POST(
      post({
        reports: [
          report({
            message: `Bearer secret ${"x".repeat(400)}`,
            detail: {
              status: 413,
              raw: { body: "x" },
              route: "/api/x?token=1",
            },
          }),
        ],
      }),
    );
    const row = written()[0];
    expect(row.message).toHaveLength(300);
    expect(String(row.message).startsWith("Bearer [가림]")).toBe(true);
    expect(row.detail).toEqual({ status: 413, route: "/api/x" });
  });

  it("미래이거나 30일보다 오래된 발생 시각은 받은 시각으로 바꾼다", async () => {
    const { POST } = await import("./route");
    await POST(
      post({
        reports: [
          report({ occurred_at: "2026-10-20T00:00:00.000Z" }),
          report({
            client_event_id: "33333333-3333-4333-8333-333333333333",
            occurred_at: "2026-09-01T00:00:00.000Z",
          }),
        ],
      }),
    );
    expect(written().map((row) => row.occurred_at)).toEqual([
      NOW.toISOString(),
      NOW.toISOString(),
    ]);
  });

  it("재전송은 client_event_id로 한 줄만 남긴다", async () => {
    const { POST } = await import("./route");
    await POST(post({ reports: [report()] }));
    const call = (
      from.mock.results[0].value as {
        calls: { method: string; args: unknown[] }[];
      }
    ).calls.find((entry) => entry.method === "upsert");
    expect(call?.args[1]).toEqual({
      onConflict: "client_event_id",
      ignoreDuplicates: true,
    });
  });
});
```

- [ ] **Step 2: 실패를 본다**, 커밋: `test(api): 브라우저 실패 보고를 받는 규칙을 시험한다`.
- [ ] **Step 3: 구현**

`src/lib/failureReport.ts`

```ts
import {
  isActionKey,
  isAuditTable,
  type ActionKey,
  type AuditTable,
} from "./activityLabels";
import {
  clip,
  isReportableReason,
  MESSAGE_LIMIT,
  redact,
  sanitizeDetail,
  type FailureDetail,
  type ReasonCode,
} from "./failureReason";

/** 브라우저가 `POST /api/activity-logs`로 보내는 실패 보고. 설계: docs/specs/2026-10-19-activity-log-design.md 4.3 */
export type FailureReport = {
  v: 1;
  client_event_id: string;
  owner_user_id: string;
  occurred_at: string;
  level: "warning" | "error";
  action: ActionKey;
  reason_code: ReasonCode;
  message: string;
  detail: FailureDetail;
  target_table: AuditTable | null;
  target_id: string | null;
  target_label: string | null;
};

export const MAX_REPORTS_PER_REQUEST = 50;
const TARGET_TEXT_LIMIT = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? clip(value, TARGET_TEXT_LIMIT) : undefined;
}

function parseReport(item: unknown): FailureReport | null {
  if (typeof item !== "object" || item === null) return null;
  const r = item as Record<string, unknown>;
  const targetTable = r.target_table ?? null;
  const targetId = optionalText(r.target_id);
  const targetLabel = optionalText(r.target_label);
  const detail = r.detail ?? {};
  if (
    r.v !== 1 ||
    typeof r.client_event_id !== "string" ||
    !UUID.test(r.client_event_id) ||
    typeof r.owner_user_id !== "string" ||
    typeof r.occurred_at !== "string" ||
    (r.level !== "warning" && r.level !== "error") ||
    !isActionKey(r.action) ||
    !isReportableReason(r.reason_code) ||
    typeof r.message !== "string" ||
    !(targetTable === null || isAuditTable(targetTable)) ||
    targetId === undefined ||
    targetLabel === undefined ||
    typeof detail !== "object" ||
    detail === null ||
    Array.isArray(detail)
  ) {
    return null;
  }
  return {
    v: 1,
    client_event_id: r.client_event_id,
    owner_user_id: r.owner_user_id,
    occurred_at: r.occurred_at,
    level: r.level,
    action: r.action,
    reason_code: r.reason_code,
    message: clip(redact(r.message), MESSAGE_LIMIT),
    detail: sanitizeDetail(detail as Record<string, unknown>),
    target_table: targetTable,
    target_id: targetId,
    target_label: targetLabel,
  };
}

/** 묶음 안에 하나라도 허용 목록 밖 값이 있으면 null(설계 4.3의 400). */
export function parseReports(body: unknown): FailureReport[] | null {
  if (typeof body !== "object" || body === null) return null;
  const reports = (body as { reports?: unknown }).reports;
  if (
    !Array.isArray(reports) ||
    reports.length === 0 ||
    reports.length > MAX_REPORTS_PER_REQUEST
  ) {
    return null;
  }
  const parsed: FailureReport[] = [];
  for (const item of reports) {
    const report = parseReport(item);
    if (!report) return null;
    parsed.push(report);
  }
  return parsed;
}

/** 미래이거나 30일보다 오래된 발생 시각은 받은 시각으로 바꾼다(설계 4.3). */
export function acceptedOccurredAt(value: string, now: number): string {
  const at = Date.parse(value);
  const received = new Date(now).toISOString();
  if (Number.isNaN(at) || at > now || at < now - MAX_AGE_MS) return received;
  return new Date(at).toISOString();
}
```

`src/app/api/activity-logs/route.ts`

```ts
import { NextResponse } from "next/server";
import { acceptedOccurredAt, parseReports } from "@/lib/failureReport";
import { requireAdmin } from "@/lib/requireAdmin";
import { findListedAdmin } from "@/lib/server/adminUsers";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

/** 브라우저 실패 보고를 받는다. 설계: docs/specs/2026-10-19-activity-log-design.md 4.3 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  // requireAdmin이 목록을 확인하게 되면(PR 2, 설계 6장) 이 확인을 지운다.
  let admin: { displayName: string } | null;
  try {
    admin = await findListedAdmin(auth.user.id);
  } catch (error) {
    console.error("[activity-logs] admin lookup failed", {
      message: (error as { message?: unknown } | null)?.message,
    });
    return NextResponse.json(
      { error: "관리자 목록을 확인하지 못했어요" },
      { status: 500 },
    );
  }
  if (!admin) {
    return NextResponse.json(
      { error: "관리자 목록에 없는 계정이에요" },
      { status: 403 },
    );
  }

  const reports = parseReports(await request.json().catch(() => null));
  if (!reports) {
    return NextResponse.json(
      { error: "보고 형식이 올바르지 않아요" },
      { status: 400 },
    );
  }

  const actorLabel = admin.displayName;
  const now = Date.now();
  const rows = reports
    .filter((report) => report.owner_user_id === auth.user.id)
    .map((report) => ({
      occurred_at: acceptedOccurredAt(report.occurred_at, now),
      level: report.level,
      kind: "failure",
      actor_kind: "admin",
      actor_id: auth.user.id,
      actor_label: actorLabel,
      action: report.action,
      target_table: report.target_table,
      target_id: report.target_id,
      target_label: report.target_label,
      reason_code: report.reason_code,
      message: report.message,
      detail: report.detail,
      client_event_id: report.client_event_id,
    }));
  if (rows.length === 0) return NextResponse.json({ accepted: 0 });

  const { error } = await supabaseAdmin()
    .from("activity_logs")
    .upsert(rows, { onConflict: "client_event_id", ignoreDuplicates: true });
  if (error) {
    console.error("[activity-logs] insert failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "보고를 저장하지 못했어요" },
      { status: 500 },
    );
  }
  return NextResponse.json({ accepted: rows.length });
}
```

- [ ] **Step 4:** `npx vitest run src/app/api/activity-logs` → 8개 통과. 커밋:
      `feat(api): 관리자 목록에 있는 계정의 실패 보고만 받아 감사 로그에 남긴다`.

### Task 5: 라우트에 실패 기록을 붙인다

**Files:**

- Modify: 아래 표의 `src/app/api/**/route.ts`와, 테스트가 있으면 그 `route.test.ts`

**규칙.**

1. `requireAdmin` 다음(공개 라우트는 핸들러 첫 줄)에 묶음을 만든다.

   ```ts
   const failures = routeFailures({
     route: "/api/<경로>", // 동적 구간은 [id]처럼 적는다
     action: "<작업 키>",
     actor: { kind: "admin", user: auth.user }, // 표의 행위자
   });
   ```

2. 대상 id를 안 뒤 `failures.setTarget({ table: "<표의 대상 테이블>", id })`.
3. 본문이 `{ error }` 하나뿐인 실패 응답 `NextResponse.json({ error: X }, { status: N })`(또는 `Response.json`)을
   `failures.respond(N, X, "<사유>", extra?)`로 바꾼다. 사유는 아래 기본 대응에서 고르고, 표가 따로 적은 것만 다르게 한다.
   `console.error`가 받은 오류 객체가 있으면 `{ error }`로 넘긴다. `console.error`는 지우지 않는다.

   | 상태              | 기본 사유           |
   | ----------------- | ------------------- |
   | 400               | `invalid_input`     |
   | 404               | `not_found`         |
   | 409               | `conflict`          |
   | 413               | `payload_too_large` |
   | 415               | `unsupported_type`  |
   | 500·502·503, 예외 | `server_error`      |

4. 본문에 `error` 말고 다른 것이 있는 실패 응답과, 성공 응답에 섞인 뒤따르는 실패(예: `cleanupFailed: true`)는 응답을 그대로 두고
   `failures.record("<사유>", { … })`를 그 앞에 둔다.
5. 401(`requireAdmin`)과 `buildings`의 `secret` 불일치 401은 기록하지 않는다 — 누군지 모른다(설계 4.1).
6. 공개 라우트(표의 아래 세 줄)는 5xx만 `respond`·`record`로 바꾸고 4xx는 그대로 둔다(설계 4.6).

| 라우트(`src/app/api/…`)          | 작업 키                         | 행위자                                      | 대상(`setTarget`)                   | 규칙과 다른 것                                                                                                                                                                                     |
| -------------------------------- | ------------------------------- | ------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin-feedback/[id]` PATCH      | `feedback.status`               | admin                                       | `feedback_submissions`, `id`        |                                                                                                                                                                                                    |
| `delete-building-photo`          | `building_photo.delete`         | admin                                       | `building_photos`, `photoId`        | 저장소 삭제 실패 500 → `storage_error`                                                                                                                                                             |
| `delete-facility-photo`          | `facility_photo.delete`         | admin                                       | `facility_photos`, `photoId`        | 아래 본보기                                                                                                                                                                                        |
| `delete-facility-photos`         | `facility_photo.delete_all`     | admin                                       | `building_facilities`, `facilityId` | `사진 파일을 지우지 못했어요` → `storage_error`                                                                                                                                                    |
| `delete-facility-video`          | `facility_video.delete`         | admin                                       | `building_facilities`, `facilityId` | R2 삭제 실패 → `storage_error`. 포스터 삭제 실패(응답은 성공) → `record("storage_error", { followUp: true })`                                                                                      |
| `delete-landmark-photo`          | `landmark_photo.delete`         | admin                                       | `landmarks`, `landmarkId`           | R2 삭제 실패 → `storage_error`                                                                                                                                                                     |
| `facility-requests/[id]/approve` | `facility_request.approve`      | admin                                       | `facility_requests`, `id`           | `사진을 옮기지 못했어요` → `storage_error`. 성공 응답의 `cleanupFailed: true` → `record("storage_error", { action: "facility_request.cleanup", followUp: true })`                                  |
| `facility-requests/[id]/reject`  | `facility_request.reject`       | admin                                       | `facility_requests`, `id`           | 성공 응답의 `cleanupFailed: true` → 위와 같은 `record`                                                                                                                                             |
| `facility-requests/[id]/status`  | `facility_request.status`       | admin                                       | `facility_requests`, `id`           |                                                                                                                                                                                                    |
| `facility-requests/[id]/cleanup` | `facility_request.cleanup`      | admin                                       | `facility_requests`, `id`           | 묶음에 `followUp: true`(파일 정리, 설계 4.5). `사진을 지우지 못했어요` → `storage_error`                                                                                                           |
| `facility-video-confirm`         | `facility_video.upload`         | admin                                       | `building_facilities`, `facilityId` |                                                                                                                                                                                                    |
| `facility-video-presign`         | `facility_video.upload`         | admin                                       | `building_facilities`, `facilityId` | 형식 400 → `unsupported_type`(`fileType`). 크기 400 → `payload_too_large`(`fileSize`, `limit: MAX_VIDEO_BYTES`)                                                                                    |
| `revalidate-facilities`          | `public_map.revalidate`         | admin                                       | 없음                                | 묶음에 `followUp: true`(공개 지도 갱신, 설계 4.5)                                                                                                                                                  |
| `revalidate-landmarks`           | `public_map.revalidate`         | admin                                       | 없음                                | 위와 같다                                                                                                                                                                                          |
| `settings/feedback-emails`       | `settings.feedback_emails`      | admin(`verifyAdmin`의 `user`)               | `app_settings`, `"feedback_emails"` | `{ error: "Unauthorized" }` 401은 기록하지 않는다                                                                                                                                                  |
| `translate-facility`             | `facility.translate`            | `{ kind: "system", system: "translation" }` | `building_facilities`, `facilityId` | 묶음에 `followUp: true`(설계 4.5). 번역 API 실패 502 → `translation_error`                                                                                                                         |
| `upload-building-photo`          | `building_photo.upload`         | admin                                       | `buildings`, `buildingId`           | `WebP 이미지만…` → `unsupported_type`. 저장소 오류 500 → `storage_error`                                                                                                                           |
| `upload-facility-photo`          | `facility_photo.upload`         | admin                                       | `building_facilities`, `facilityId` | `WebP 이미지만…` → `unsupported_type`. 4MB 413 → `payload_too_large`(`fileSize`, `limit: MAX_FACILITY_PHOTO_BYTES`). `사진을 올리지 못했어요` → `storage_error`                                    |
| `upload-facility-video`          | `facility_video.upload`         | admin                                       | `building_facilities`, `facilityId` | 형식 → `unsupported_type`. 크기 → `payload_too_large`. R2 저장 실패 → `storage_error`                                                                                                              |
| `upload-landmark-photo`          | `landmark_photo.upload`         | admin                                       | `landmarks`, `landmarkId`           | 형식 → `unsupported_type`. 크기 → `payload_too_large`(라우트의 `MAX_SIZE`). R2 저장 실패 → `storage_error`. 고아·옛 사진 정리 실패(응답은 성공) → `record("storage_error", { followUp: true })`    |
| `buildings` GET `?sync=true`     | `buildings.osm_sync`            | `{ kind: "system", system: "osm_sync" }`    | 없음                                | `Overpass 서버 모두 실패` 500 → `server_error`. 끝에 `failed > 0`이면 응답 전에 `record("server_error", { reasonText: \`${failed}건 저장 실패\` })`. 일반 GET(지도 읽기)은 공개 라우트 규칙(5xx만) |
| `feedback` POST                  | `feedback.submit`               | `{ kind: "visitor" }`                       | 없음                                | 공개 라우트: 500만                                                                                                                                                                                 |
| `facility-requests` POST         | `facility_request.submit`       | `{ kind: "visitor" }`                       | 없음                                | 공개 라우트: `fail(code, status)`에서 `status >= 500`일 때만 `failures.record("server_error", { status })`를 함께 부른다                                                                           |
| `facility-requests/[id]/photos`  | `facility_request.photo_upload` | `{ kind: "visitor" }`                       | `facility_requests`, `id`           | 공개 라우트: 500·503만                                                                                                                                                                             |

**본보기 — `src/app/api/delete-facility-photo/route.ts`의 결과(PR 1a 뒤 상태에서):**

```ts
import { NextResponse } from "next/server";
import { FACILITY_PHOTO_BUCKET } from "@/lib/facilityPhotos";
import { requireAdmin } from "@/lib/requireAdmin";
import { removeObject } from "@/lib/server/requestPhotoStorage";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/delete-facility-photo",
    action: "facility_photo.delete",
    actor: { kind: "admin", user: auth.user },
  });
  const body = (await request.json().catch(() => null)) as {
    photoId?: unknown;
  } | null;
  if (typeof body?.photoId !== "string") {
    return failures.respond(400, "사진 ID 누락", "invalid_input");
  }
  failures.setTarget({ table: "facility_photos", id: body.photoId });
  if (!isUuid(body.photoId)) {
    return failures.respond(404, "사진이 없어요", "not_found");
  }

  const db = supabaseAdmin({ userId: auth.user.id });
  const { data: photo, error: lookupError } = await db
    .from("facility_photos")
    .select("id, storage_path")
    .eq("id", body.photoId)
    .maybeSingle();
  if (lookupError) {
    console.error("[delete-facility-photo] lookup failed", {
      message: lookupError.message,
    });
    return failures.respond(
      500,
      "사진 정보를 불러오지 못했어요",
      "server_error",
      { error: lookupError },
    );
  }
  if (!photo) return failures.respond(404, "사진이 없어요", "not_found");

  // 파일이 남은 채 행만 지우면 공개 버킷에 아무도 모르는 파일이 남는다.
  if (!(await removeObject(FACILITY_PHOTO_BUCKET, photo.storage_path))) {
    return failures.respond(
      500,
      "사진 파일을 지우지 못했어요",
      "storage_error",
    );
  }
  const { error } = await db
    .from("facility_photos")
    .delete()
    .eq("id", photo.id);
  if (error) {
    console.error("[delete-facility-photo] row delete failed", {
      message: error.message,
    });
    return failures.respond(
      500,
      "사진 정보를 지우지 못했어요",
      "server_error",
      { error },
    );
  }
  return NextResponse.json({ ok: true });
}
```

**본보기의 테스트 변경(`route.test.ts`, PR 1a에서 `supabaseAdmin`을 목으로 바꾼 뒤 상태에 더한다):**

```diff
diff --git a/src/app/api/delete-facility-photo/route.test.ts b/src/app/api/delete-facility-photo/route.test.ts
index d510d93..4a7ff94 100644
--- a/src/app/api/delete-facility-photo/route.test.ts
+++ b/src/app/api/delete-facility-photo/route.test.ts
@@ -5,6 +5,8 @@ const requireAdmin = vi.fn();
 vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
 const removeObject = vi.fn();
 vi.mock("@/lib/server/requestPhotoStorage", () => ({ removeObject }));
+const logFailure = vi.fn();
+vi.mock("@/lib/server/activityLog", () => ({ logFailure }));

 const PHOTO_ID = "22222222-2222-4222-8222-222222222222";
 let lookup: unknown;
@@ -57,6 +59,7 @@ describe("POST /api/delete-facility-photo", () => {
       "eq",
     ]);
     expect(queryAt(1).calls[1].args).toEqual(["id", PHOTO_ID]);
+    expect(logFailure).not.toHaveBeenCalled();
   });

   it("파일 삭제가 실패하면 행을 남기고 500", async () => {
@@ -68,6 +71,16 @@ describe("POST /api/delete-facility-photo", () => {
       error: "사진 파일을 지우지 못했어요",
     });
     expect(from).toHaveBeenCalledTimes(1);
+    expect(logFailure).toHaveBeenCalledWith(
+      expect.objectContaining({
+        route: "/api/delete-facility-photo",
+        action: "facility_photo.delete",
+        actor: { kind: "admin", user: { id: "admin" } },
+        target: { table: "facility_photos", id: PHOTO_ID },
+        reason: "storage_error",
+        status: 500,
+      }),
+    );
   });

   it("없는 사진은 404", async () => {
@@ -117,5 +130,12 @@ describe("POST /api/delete-facility-photo", () => {
     expect(response.status).toBe(400);
     expect(await response.json()).toEqual({ error: "사진 ID 누락" });
     expect(from).not.toHaveBeenCalled();
+    expect(logFailure).toHaveBeenCalledWith(
+      expect.objectContaining({
+        reason: "invalid_input",
+        status: 400,
+        reasonText: "사진 ID 누락",
+      }),
+    );
   });
 });
```

- [ ] **Step 1: 테스트부터.** 표의 라우트 중 `route.test.ts`가 있는 것마다 `vi.mock("@/lib/server/activityLog", () => ({ logFailure }))`를
      더하고(없으면 실제 `logFailure`가 목 클라이언트에 쓰려다 `console.error`를 남긴다), 실패 경로 테스트 하나에
      `expect(logFailure).toHaveBeenCalledWith(expect.objectContaining({ action, reason, status }))`, 성공 경로 테스트 하나에
      `expect(logFailure).not.toHaveBeenCalled()`를 더한다(설계 8.1 마지막 항목). 테스트가 있는 라우트의 목록은 명령으로 얻는다:
      `for f in $(git ls-files 'src/app/api/**/route.ts'); do t="${f%.ts}.test.ts"; [ -f "$t" ] && echo "$t"; done`. 표에 없는
      라우트의 테스트는 건드리지 않는다. 기대한 실패(`logFailure`가 불리지 않음)를 보고 커밋:
      `test(api): 라우트의 실패 경로가 감사 로그를 남기는지 시험한다`.
- [ ] **Step 2: 라우트마다 규칙대로 바꾼다.** 한 라우트를 고칠 때마다 그 테스트를 돌린다(`npx vitest run src/app/api/<경로>`).
- [ ] **Step 3: 빠뜨린 실패 응답이 없는지 명령으로 본다.**

```bash
for f in $(git ls-files 'src/app/api/**/route.ts'); do
  rg -n 'status: (4|5)[0-9][0-9]' "$f" | sed "s|^|$f:|"
done
```

출력의 각 줄이 (a) `respond`·`record`로 바뀐 자리, (b) 401, (c) 공개 라우트의 4xx, (d) 읽기 전용 관리자 라우트 중 하나인지 본다.
판단을 PR 본문에 붙인다.

- [ ] **Step 4:** `npm run typecheck && npm run test` 통과. 커밋:
      `feat(api): 관리자 라우트의 실패를 사유와 함께 감사 로그에 남긴다`.

### Task 6: 브라우저 보고와 대기열 — `activityReport`

**Files:**

- Create: `src/lib/activityReport.test.ts`, `src/lib/activityReport.ts`

**Interfaces:**

- Consumes: Task 2의 `classifyFailure`·`failureLevel`·`FailureSource`, Task 4의 `FailureReport`.
- Produces: `ReportInput`, `reportFailure(input): Promise<void>`, `flushQueue(): Promise<void>`, `actionForApiRequest(pathname, method)`,
  `missedServerLog(response)`, `reportApiOutcome(input, init, outcome)`, `VERCEL_BODY_LIMIT_BYTES`.

- [ ] **Step 1: 테스트를 쓴다** — `src/lib/activityReport.test.ts`(설계 8.1의 `reportFailure` 항목 전부와 관문 판정)

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FailureReport } from "@/lib/failureReport";

const getSession = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));

const QUEUE_KEY = "ku-activity-report-queue";
const fetchMock = vi.fn();
let stored: Map<string, string>;
let storageThrows = false;
const storage = {
  getItem: (key: string) => {
    if (storageThrows) throw new Error("denied");
    return stored.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    if (storageThrows) throw new Error("denied");
    stored.set(key, value);
  },
};

function signIn(id: string | null) {
  getSession.mockResolvedValue({
    data: {
      session: id ? { access_token: `token-${id}`, user: { id } } : null,
    },
  });
}

function queue(): FailureReport[] {
  return JSON.parse(stored.get(QUEUE_KEY) ?? "[]") as FailureReport[];
}

function queued(owner: string, index: number): FailureReport {
  return {
    v: 1,
    client_event_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    owner_user_id: owner,
    occurred_at: "2026-10-19T05:00:00.000Z",
    level: "error",
    action: "facility_photo.upload",
    reason_code: "network",
    message: "시설 사진 업로드 실패: 네트워크 연결이 끊겨 서버에 닿지 못함",
    detail: {},
    target_table: null,
    target_id: null,
    target_label: null,
  };
}

const failure = {
  source: { kind: "thrown", error: new TypeError("Failed to fetch") },
  action: "facility_photo.upload",
} as const;

async function load() {
  vi.resetModules();
  return import("./activityReport");
}

describe("reportFailure", () => {
  beforeEach(() => {
    stored = new Map();
    storageThrows = false;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { localStorage: storage });
    signIn("u1");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("보고에 발생 시각·보고 id·계정을 붙여 보낸다", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { reportFailure } = await load();
    await reportFailure(failure);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/activity-logs");
    expect(init.headers.Authorization).toBe("Bearer token-u1");
    const [report] = JSON.parse(init.body).reports as FailureReport[];
    expect(report).toMatchObject({
      v: 1,
      owner_user_id: "u1",
      level: "error",
      action: "facility_photo.upload",
      reason_code: "network",
    });
    expect(report.client_event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(queue()).toEqual([]);
  });

  it("전송이 실패하면 대기열에 넣는다", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const { reportFailure } = await load();
    await reportFailure(failure);
    expect(queue()).toHaveLength(1);
  });

  it("401이면 대기열에 넣는다", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    const { reportFailure } = await load();
    await reportFailure(failure);
    expect(queue()).toHaveLength(1);
  });

  it("403이면 버린다", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
    const { reportFailure } = await load();
    await reportFailure(failure);
    expect(queue()).toEqual([]);
  });

  it("대기열은 50건까지, 넘치면 오래된 것부터 버린다", async () => {
    stored.set(
      QUEUE_KEY,
      JSON.stringify(Array.from({ length: 50 }, (_, i) => queued("u1", i))),
    );
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const { reportFailure } = await load();
    await reportFailure(failure);
    const items = queue();
    expect(items).toHaveLength(50);
    expect(items[0].client_event_id).toBe(queued("u1", 1).client_event_id);
  });

  it("보고가 성공하면 지금 계정의 대기 항목만 보내고 다른 계정 항목은 남긴다", async () => {
    stored.set(
      QUEUE_KEY,
      JSON.stringify([queued("u1", 1), queued("u2", 2), queued("u1", 3)]),
    );
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { reportFailure } = await load();
    await reportFailure(failure);
    const flushed = JSON.parse(fetchMock.mock.calls[1][1].body)
      .reports as FailureReport[];
    expect(flushed.map((report) => report.owner_user_id)).toEqual(["u1", "u1"]);
    expect(queue().map((report) => report.owner_user_id)).toEqual(["u2"]);
  });

  it("localStorage가 던져도 예외가 새지 않는다", async () => {
    storageThrows = true;
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const { reportFailure, flushQueue } = await load();
    await expect(reportFailure(failure)).resolves.toBeUndefined();
    await expect(flushQueue()).resolves.toBeUndefined();
  });

  it("로그인한 계정이 없으면 보내지 않는다", async () => {
    signIn(null);
    const { reportFailure } = await load();
    await reportFailure(failure);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("관리자 API 관문", () => {
  beforeEach(() => {
    stored = new Map();
    storageThrows = false;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { localStorage: storage });
    signIn("u1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("쓰기 경로만 작업 키를 얻는다", async () => {
    const { actionForApiRequest } = await load();
    expect(actionForApiRequest("/api/upload-facility-photo", "POST")).toBe(
      "facility_photo.upload",
    );
    expect(
      actionForApiRequest("/api/facility-requests/abc/approve", "POST"),
    ).toBe("facility_request.approve");
    expect(actionForApiRequest("/api/admin-feedback/abc", "PATCH")).toBe(
      "feedback.status",
    );
    expect(actionForApiRequest("/api/admin-feedback", "GET")).toBeNull();
    expect(actionForApiRequest("/api/inbox-counts", "POST")).toBeNull();
  });

  it("Vercel이 만든 413만 서버가 놓친 실패로 본다", async () => {
    const { missedServerLog } = await load();
    expect(
      missedServerLog(
        new Response("Request Entity Too Large", {
          status: 413,
          headers: { "x-vercel-error": "FUNCTION_PAYLOAD_TOO_LARGE" },
        }),
      ),
    ).toBe(true);
    expect(
      missedServerLog(
        Response.json({ error: "사진은 4MB까지" }, { status: 413 }),
      ),
    ).toBe(false);
    expect(missedServerLog(new Response("", { status: 504 }))).toBe(true);
    expect(missedServerLog(new Response("", { status: 401 }))).toBe(true);
    expect(missedServerLog(Response.json({}, { status: 500 }))).toBe(false);
  });

  it("413이면 보낸 파일 크기와 한도를 싣는다", async () => {
    const { reportApiOutcome } = await load();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(10)], { type: "image/webp" }));
    reportApiOutcome(
      "/api/upload-facility-photo",
      { method: "POST", body: form },
      new Response("Request Entity Too Large", {
        status: 413,
        headers: { "x-vercel-error": "FUNCTION_PAYLOAD_TOO_LARGE" },
      }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [report] = JSON.parse(fetchMock.mock.calls[0][1].body)
      .reports as FailureReport[];
    expect(report.reason_code).toBe("payload_too_large");
    expect(report.detail).toMatchObject({
      status: 413,
      code: "FUNCTION_PAYLOAD_TOO_LARGE",
      file_size: 10,
      file_type: "image/webp",
      route: "/api/upload-facility-photo",
    });
  });

  it("사용자가 취소한 요청은 보고하지 않는다", async () => {
    const { reportApiOutcome } = await load();
    reportApiOutcome(
      "/api/upload-facility-photo",
      { method: "POST" },
      new DOMException("aborted", "AbortError"),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패를 본다**, 커밋: `test(logs): 브라우저 실패 보고의 대기열과 관문 판정을 시험한다`.
- [ ] **Step 3: 구현** — `src/lib/activityReport.ts`

```ts
import type { ActionKey, AuditTable } from "@/lib/activityLabels";
import {
  classifyFailure,
  failureLevel,
  type FailureSource,
} from "@/lib/failureReason";
import type { FailureReport } from "@/lib/failureReport";
import { supabase } from "@/lib/supabaseClient";

/** 브라우저 실패 보고와 그 대기열. 설계: docs/specs/2026-10-19-activity-log-design.md 4.1·4.3 */

const ENDPOINT = "/api/activity-logs";
const QUEUE_KEY = "ku-activity-report-queue";
const QUEUE_LIMIT = 50;
export const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

export type ReportInput = {
  source: FailureSource;
  action: ActionKey;
  followUp?: boolean;
  target?: { table: AuditTable; id?: string | null; label?: string | null };
  route?: string;
  fileSize?: number;
  fileType?: string;
  limit?: number;
};

type SendOutcome = "sent" | "retry" | "drop";

function readQueue(): FailureReport[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(QUEUE_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is FailureReport =>
            typeof item === "object" &&
            item !== null &&
            item.v === 1 &&
            typeof item.owner_user_id === "string" &&
            typeof item.client_event_id === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writeQueue(items: FailureReport[]) {
  try {
    window.localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(items.slice(-QUEUE_LIMIT)),
    );
  } catch {
    // 저장소를 못 쓰면 이 보고만 잃는다(설계 4.3).
  }
}

async function session() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function send(reports: FailureReport[]): Promise<SendOutcome> {
  const token = (await session())?.access_token;
  if (!token) return "retry";
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reports }),
    });
  } catch {
    return "retry";
  }
  if (response.ok) return "sent";
  // 403: 목록에 없는 계정의 보고는 다시 보내도 받지 않는다. 400: 다시 보내도 같은 이유로 거절된다.
  return response.status === 403 || response.status === 400 ? "drop" : "retry";
}

/** 지금 로그인한 계정의 대기 항목만 보낸다. 다른 계정의 항목은 그 사람이 다시 로그인할 때 나간다. */
export async function flushQueue(): Promise<void> {
  try {
    const owner = (await session())?.user.id;
    if (!owner) return;
    const mine = readQueue()
      .filter((report) => report.owner_user_id === owner)
      .slice(0, QUEUE_LIMIT);
    if (mine.length === 0) return;
    if ((await send(mine)) === "retry") return;
    const done = new Set(mine.map((report) => report.client_event_id));
    writeQueue(
      readQueue().filter((report) => !done.has(report.client_event_id)),
    );
  } catch (error) {
    console.error("[activity-report] flush failed", error);
  }
}

export async function reportFailure(input: ReportInput): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const owner = (await session())?.user.id;
    if (!owner) return;
    const { reason_code, message, detail } = classifyFailure(input.source, {
      action: input.action,
      route: input.route,
      fileSize: input.fileSize,
      fileType: input.fileType,
      limit: input.limit,
    });
    const report: FailureReport = {
      v: 1,
      client_event_id: crypto.randomUUID(),
      owner_user_id: owner,
      occurred_at: new Date().toISOString(),
      level: failureLevel(reason_code, input.followUp),
      action: input.action,
      reason_code,
      message,
      detail,
      target_table: input.target?.table ?? null,
      target_id: input.target?.id ?? null,
      target_label: input.target?.label ?? null,
    };
    const outcome = await send([report]);
    if (outcome === "retry") writeQueue([...readQueue(), report]);
    if (outcome === "sent") await flushQueue();
  } catch (error) {
    console.error("[activity-report] report failed", error);
  }
}

const API_ACTIONS: [RegExp, ActionKey][] = [
  [/^\/api\/upload-building-photo$/, "building_photo.upload"],
  [/^\/api\/delete-building-photo$/, "building_photo.delete"],
  [/^\/api\/upload-facility-photo$/, "facility_photo.upload"],
  [/^\/api\/delete-facility-photo$/, "facility_photo.delete"],
  [/^\/api\/delete-facility-photos$/, "facility_photo.delete_all"],
  [
    /^\/api\/(upload-facility-video|facility-video-presign|facility-video-confirm)$/,
    "facility_video.upload",
  ],
  [/^\/api\/delete-facility-video$/, "facility_video.delete"],
  [/^\/api\/upload-landmark-photo$/, "landmark_photo.upload"],
  [/^\/api\/delete-landmark-photo$/, "landmark_photo.delete"],
  [/^\/api\/translate-facility$/, "facility.translate"],
  [/^\/api\/revalidate-(facilities|landmarks)$/, "public_map.revalidate"],
  [/^\/api\/admin-feedback\/[^/]+$/, "feedback.status"],
  [/^\/api\/facility-requests\/[^/]+\/status$/, "facility_request.status"],
  [/^\/api\/facility-requests\/[^/]+\/approve$/, "facility_request.approve"],
  [/^\/api\/facility-requests\/[^/]+\/reject$/, "facility_request.reject"],
  [/^\/api\/facility-requests\/[^/]+\/cleanup$/, "facility_request.cleanup"],
  [/^\/api\/settings\/feedback-emails$/, "settings.feedback_emails"],
];

/** 경로 표에 없는 호출(읽기)은 보고하지 않는다. */
export function actionForApiRequest(
  pathname: string,
  method: string,
): ActionKey | null {
  if (method.toUpperCase() === "GET") return null;
  return API_ACTIONS.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}

/** 서버 코드에 닿지 못해 서버가 기록하지 못한 응답인가(설계 4.1). */
export function missedServerLog(response: Response): boolean {
  return (
    response.headers.has("x-vercel-error") ||
    response.status === 504 ||
    response.status === 401
  );
}

function bodyFile(body: BodyInit | null | undefined): Blob | null {
  if (body instanceof Blob) return body;
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    for (const value of body.values()) if (value instanceof Blob) return value;
  }
  return null;
}

function pathOf(input: RequestInfo | URL): string {
  const href =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(href, "http://local").pathname;
}

/** `authedFetch`가 응답(또는 던져진 오류)을 넘긴다. 보고할 일이 아니면 아무것도 하지 않는다. */
export function reportApiOutcome(
  input: RequestInfo | URL,
  init: RequestInit,
  outcome: Response | unknown,
): void {
  const route = pathOf(input);
  const action = actionForApiRequest(route, init.method ?? "GET");
  if (!action) return;
  if (outcome instanceof Response) {
    if (!missedServerLog(outcome)) return;
    const file = outcome.status === 413 ? bodyFile(init.body) : null;
    void reportFailure({
      source: {
        kind: "response",
        status: outcome.status,
        vercelError: outcome.headers.get("x-vercel-error"),
      },
      action,
      route,
      ...(file
        ? {
            fileSize: file.size,
            fileType: file.type,
            limit: VERCEL_BODY_LIMIT_BYTES,
          }
        : {}),
    });
    return;
  }
  if (outcome instanceof Error && outcome.name === "AbortError") return;
  void reportFailure({
    source: { kind: "thrown", error: outcome },
    action,
    route,
  });
}
```

- [ ] **Step 4:** `npx vitest run src/lib/activityReport.test.ts` → 12개 통과. 커밋:
      `feat(logs): 브라우저 실패를 보고하고 못 보낸 보고는 계정별로 대기열에 둔다`.

### Task 7: 관문을 잇는다

**Files:**

- Create: `src/lib/supabaseWriteReporting.test.ts`, `src/lib/supabaseWriteReporting.ts`
- Modify: `src/lib/authedFetch.ts`, `src/lib/authedFetch.test.ts`, `src/lib/supabaseClient.ts`,
  `src/components/admin/FacilityPhotoManager.tsx`, `src/components/admin/BuildingPhotoManager.tsx`, `src/lib/facilityVideoUpload.ts`,
  `src/components/admin/FacilityVideoModal.tsx`, `src/components/admin/FeedbackEmailModal.tsx`, `src/app/admin/dashboard/layout.tsx`

**Interfaces:**

- Consumes: Task 6의 `reportApiOutcome`·`reportFailure`·`flushQueue`.
- Produces: `restWrite(url, method)`, `reportingFetch(baseFetch?, report?)`. `FacilityVideoUploadResult`의 `failed`에
  `reason?: "unsupported_type" | "payload_too_large"`, `size?: number`.

- [ ] **Step 1: 직접 쓰기 관문 테스트** — `src/lib/supabaseWriteReporting.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { reportingFetch, restWrite } from "./supabaseWriteReporting";

const REST = "https://db.test/rest/v1";

describe("restWrite", () => {
  it("기록 대상 테이블의 쓰기만 작업 키를 얻는다", () => {
    expect(
      restWrite(new URL(`${REST}/building_facilities?id=eq.f1`), "PATCH"),
    ).toEqual({
      action: "building_facilities.update",
      table: "building_facilities",
      id: "f1",
    });
    expect(restWrite(new URL(`${REST}/landmarks`), "POST")?.action).toBe(
      "landmarks.insert",
    );
    expect(restWrite(new URL(`${REST}/landmarks?id=eq.l1`), "GET")).toBeNull();
    expect(
      restWrite(new URL(`${REST}/rpc/get_admin_building_summary`), "POST"),
    ).toBeNull();
    expect(
      restWrite(new URL(`${REST}/admin_building_flags`), "POST"),
    ).toBeNull();
    expect(
      restWrite(new URL("https://db.test/auth/v1/token"), "POST"),
    ).toBeNull();
  });
});

describe("reportingFetch", () => {
  it("실패한 쓰기를 PostgREST 오류 코드와 함께 보고하고 응답은 그대로 돌려준다", async () => {
    const report = vi.fn().mockResolvedValue(undefined);
    const base = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: "42501",
          message: "new row violates row-level security policy",
        },
        { status: 403 },
      ),
    );
    const response = await reportingFetch(base, report)(
      `${REST}/building_facilities?id=eq.f1`,
      { method: "PATCH" },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "42501" });
    expect(report).toHaveBeenCalledWith({
      source: {
        kind: "postgrest",
        status: 403,
        error: {
          code: "42501",
          message: "new row violates row-level security policy",
        },
      },
      action: "building_facilities.update",
      target: { table: "building_facilities", id: "f1" },
    });
  });

  it("네트워크 오류는 보고하고 다시 던진다", async () => {
    const report = vi.fn().mockResolvedValue(undefined);
    const error = new TypeError("Failed to fetch");
    const base = vi.fn().mockRejectedValue(error);
    await expect(
      reportingFetch(base, report)(`${REST}/slope_segments`, {
        method: "POST",
      }),
    ).rejects.toBe(error);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { kind: "thrown", error },
        action: "slope_segments.insert",
      }),
    );
  });

  it("성공한 쓰기와 읽기는 보고하지 않는다", async () => {
    const report = vi.fn();
    const base = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    const run = reportingFetch(base, report);
    await run(`${REST}/landmarks`, { method: "POST" });
    await run(`${REST}/landmarks?select=*`, { method: "GET" });
    expect(report).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: `authedFetch` 테스트를 더한다** — `src/lib/authedFetch.test.ts`의 `vi.mock("@/lib/supabaseClient", …)` 다음에

```ts
const reportApiOutcome = vi.fn();
vi.mock("@/lib/activityReport", () => ({ reportApiOutcome }));
```

를 두고 `describe` 안에 둘을 더한다.

```ts
it("응답을 관문 보고에 넘긴다", async () => {
  getSession.mockResolvedValueOnce({ data: { session: null } });
  const response = new Response("{}");
  vi.mocked(global.fetch).mockResolvedValueOnce(response);
  const { authedFetch } = await import("./authedFetch");

  await authedFetch("/api/upload-facility-photo", { method: "POST" });

  expect(reportApiOutcome).toHaveBeenCalledWith(
    "/api/upload-facility-photo",
    expect.objectContaining({ method: "POST" }),
    response,
  );
});

it("fetch가 던지면 관문 보고에 넘기고 다시 던진다", async () => {
  getSession.mockResolvedValueOnce({ data: { session: null } });
  const error = new TypeError("Failed to fetch");
  vi.mocked(global.fetch).mockRejectedValueOnce(error);
  const { authedFetch } = await import("./authedFetch");

  await expect(
    authedFetch("/api/upload-facility-photo", { method: "POST" }),
  ).rejects.toBe(error);
  expect(reportApiOutcome).toHaveBeenCalledWith(
    "/api/upload-facility-photo",
    expect.objectContaining({ method: "POST" }),
    error,
  );
});
```

실패를 보고 커밋: `test(logs): 관리자 API와 직접 쓰기 관문이 실패를 넘기는지 시험한다`.

- [ ] **Step 3: 구현** — `src/lib/supabaseWriteReporting.ts`

```ts
import {
  isAuditTable,
  type AuditTable,
  type TableActionKey,
} from "@/lib/activityLabels";
import type { ReportInput } from "@/lib/activityReport";

/** 브라우저 Supabase 클라이언트의 직접 쓰기 실패를 보고하는 fetch. 설계: docs/specs/2026-10-19-activity-log-design.md 4.3 */

const OPERATIONS = {
  POST: "insert",
  PATCH: "update",
  DELETE: "delete",
} as const;
type WriteMethod = keyof typeof OPERATIONS;

export type RestWrite = {
  action: TableActionKey;
  table: AuditTable;
  id: string | null;
};

/** `rpc/`와 읽기, 기록 대상이 아닌 테이블은 null. */
export function restWrite(url: URL, method: string): RestWrite | null {
  const upper = method.toUpperCase();
  if (!(upper in OPERATIONS)) return null;
  const table = url.pathname.match(/\/rest\/v1\/([a-z_]+)$/)?.[1];
  if (!isAuditTable(table)) return null;
  const filter = url.searchParams.get("id");
  return {
    action: `${table}.${OPERATIONS[upper as WriteMethod]}`,
    table,
    id: filter?.startsWith("eq.") ? filter.slice(3) : null,
  };
}

type Report = (input: ReportInput) => Promise<void>;

// activityReport가 supabaseClient를 import하므로, 정적 import로 묶으면 순환이 생긴다.
const lazyReport: Report = (input) =>
  import("@/lib/activityReport").then((module) => module.reportFailure(input));

export function reportingFetch(
  baseFetch: typeof fetch = (...args) => globalThis.fetch(...args),
  report: Report = lazyReport,
): typeof fetch {
  return async (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    const write = restWrite(new URL(href, "http://local"), method);
    if (!write) return baseFetch(input, init);
    const target = { table: write.table, id: write.id };
    try {
      const response = await baseFetch(input, init);
      if (!response.ok) {
        const body = (await response
          .clone()
          .json()
          .catch(() => null)) as { code?: string; message?: string } | null;
        void report({
          source: {
            kind: "postgrest",
            status: response.status,
            error: { code: body?.code, message: body?.message },
          },
          action: write.action,
          target,
        });
      }
      return response;
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        void report({
          source: { kind: "thrown", error },
          action: write.action,
          target,
        });
      }
      throw error;
    }
  };
}
```

`src/lib/authedFetch.ts`

```diff
diff --git a/src/lib/authedFetch.ts b/src/lib/authedFetch.ts
index bc0cde6..42264af 100644
--- a/src/lib/authedFetch.ts
+++ b/src/lib/authedFetch.ts
@@ -1,5 +1,7 @@
+import { reportApiOutcome } from "@/lib/activityReport";
 import { supabase } from "@/lib/supabaseClient";

+/** 관리자 API 호출. 서버 코드에 닿지 못한 실패는 감사 로그로 보고한다(설계 2026-10-19 4.3). */
 export async function authedFetch(
   input: RequestInfo | URL,
   options: RequestInit = {},
@@ -11,8 +13,13 @@ export async function authedFetch(
     headers.set("Authorization", `Bearer ${data.session.access_token}`);
   }

-  return fetch(input, {
-    ...options,
-    headers,
-  });
+  const init = { ...options, headers };
+  try {
+    const response = await fetch(input, init);
+    reportApiOutcome(input, init, response);
+    return response;
+  } catch (error) {
+    reportApiOutcome(input, init, error);
+    throw error;
+  }
 }
```

`src/lib/supabaseClient.ts`

```diff
diff --git a/src/lib/supabaseClient.ts b/src/lib/supabaseClient.ts
index ab3167e..f6f1e47 100644
--- a/src/lib/supabaseClient.ts
+++ b/src/lib/supabaseClient.ts
@@ -1,7 +1,9 @@
 import { createClient } from "@supabase/supabase-js";
 import type { Database } from "@supabase-types";
+import { reportingFetch } from "@/lib/supabaseWriteReporting";

 export const supabase = createClient<Database>(
   process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
+  { global: { fetch: reportingFetch() } },
 );
```

- [ ] **Step 4: 관문 밖 자리(설계 4.3의 셋째 항목)**

`src/components/admin/FacilityPhotoManager.tsx`

```diff
diff --git a/src/components/admin/FacilityPhotoManager.tsx b/src/components/admin/FacilityPhotoManager.tsx
index 215e359..d63bae8 100644
--- a/src/components/admin/FacilityPhotoManager.tsx
+++ b/src/components/admin/FacilityPhotoManager.tsx
@@ -3,6 +3,7 @@
 import { useState } from "react";
 import Image from "next/image";
 import ConfirmModal from "@/components/ConfirmModal";
+import { reportFailure } from "@/lib/activityReport";
 import { authedFetch } from "@/lib/authedFetch";
 import {
   MAX_FACILITY_PHOTOS,
@@ -41,11 +42,26 @@ export default function FacilityPhotoManager({
       let blob: Blob;
       try {
         blob = await convertToWebP(file);
-      } catch {
+      } catch (error) {
+        void reportFailure({
+          source: { kind: "known", reason: "unsupported_type", error },
+          action: "facility_photo.upload",
+          target: { table: "building_facilities", id: facilityId },
+          fileSize: file.size,
+          fileType: file.type,
+        });
         showToast("사진을 변환하지 못했어요", "error");
         return;
       }
       if (blob.size > MAX_FACILITY_PHOTO_BYTES) {
+        void reportFailure({
+          source: { kind: "known", reason: "payload_too_large" },
+          action: "facility_photo.upload",
+          target: { table: "building_facilities", id: facilityId },
+          fileSize: blob.size,
+          fileType: blob.type,
+          limit: MAX_FACILITY_PHOTO_BYTES,
+        });
         showToast("사진은 4MB까지 올릴 수 있어요", "warning");
         return;
       }
```

`src/components/admin/BuildingPhotoManager.tsx`

```diff
diff --git a/src/components/admin/BuildingPhotoManager.tsx b/src/components/admin/BuildingPhotoManager.tsx
index 0d43ddf..443195b 100644
--- a/src/components/admin/BuildingPhotoManager.tsx
+++ b/src/components/admin/BuildingPhotoManager.tsx
@@ -3,6 +3,7 @@
 import { useCallback, useEffect, useState } from "react";
 import NextImage from "next/image";
 import { supabase } from "@/lib/supabaseClient";
+import { reportFailure } from "@/lib/activityReport";
 import { authedFetch } from "@/lib/authedFetch";
 import { convertToWebP } from "@/lib/imageToWebP";
 import ConfirmModal from "@/components/ConfirmModal";
@@ -122,6 +123,13 @@ export default function BuildingPhotoManager({
     try {
       blob = await convertToWebP(item.file);
     } catch (error) {
+      void reportFailure({
+        source: { kind: "known", reason: "unsupported_type", error },
+        action: "building_photo.upload",
+        target: { table: "buildings", id: String(buildingId) },
+        fileSize: item.file.size,
+        fileType: item.file.type,
+      });
       return {
         ...item,
         status: "error" as const,
```

`src/lib/facilityVideoUpload.ts`

```diff
diff --git a/src/lib/facilityVideoUpload.ts b/src/lib/facilityVideoUpload.ts
index 59a73f3..57aac6d 100644
--- a/src/lib/facilityVideoUpload.ts
+++ b/src/lib/facilityVideoUpload.ts
@@ -42,7 +42,13 @@ export interface FacilityVideoUploadDeps {
 export type FacilityVideoUploadResult =
   | { status: "uploaded"; videoUrl: string; usedOriginal: boolean }
   | { status: "cancelled" }
-  | { status: "failed"; message: string };
+  | {
+      status: "failed";
+      message: string;
+      /** 브라우저 안에서 멈춘 실패만 둔다. 서버·저장소 실패는 관문이 보고한다(설계 2026-10-19 4.3). */
+      reason?: "unsupported_type" | "payload_too_large";
+      size?: number;
+    };

 const CANCELLED = { status: "cancelled" } as const;

@@ -65,6 +71,7 @@ export async function uploadFacilityVideo(
         status: "failed",
         message:
           "이 영상은 브라우저에서 재생할 수 없고 변환도 실패했어요. H.264(mp4)로 저장해 다시 올려주세요",
+        reason: "unsupported_type",
       };
     }
     payload = file;
@@ -77,6 +84,8 @@ export async function uploadFacilityVideo(
     return {
       status: "failed",
       message: `${usedOriginal ? "파일이" : "변환 결과가"} 너무 커요 (${formatExcessSize(payload.size)}) · 최대 ${MAX_VIDEO_LABEL}`,
+      reason: "payload_too_large",
+      size: payload.size,
     };
   }
```

`src/lib/facilityVideoUpload.test.ts`의 두 실패 단언(재생 불가, 크기 초과)이 `toEqual`이면 `reason`·`size`를 더하거나
`toMatchObject`로 바꾼다 — 2026-10-19 작업 사본에서는 그대로 통과했다.

`src/components/admin/FacilityVideoModal.tsx`

```diff
diff --git a/src/components/admin/FacilityVideoModal.tsx b/src/components/admin/FacilityVideoModal.tsx
index c15c1e0..e76b905 100644
--- a/src/components/admin/FacilityVideoModal.tsx
+++ b/src/components/admin/FacilityVideoModal.tsx
@@ -15,7 +15,8 @@ import {
   type UploadPhase,
   uploadFacilityVideo,
 } from "@/lib/facilityVideoUpload";
-import { MAX_VIDEO_LABEL } from "@/lib/videoUpload";
+import { MAX_VIDEO_BYTES, MAX_VIDEO_LABEL } from "@/lib/videoUpload";
+import { reportFailure } from "@/lib/activityReport";

 export default function FacilityVideoModal({
   facility,
@@ -119,9 +120,28 @@ export default function FacilityVideoModal({
             onProgress(Math.round((ev.loaded / ev.total) * 100));
         };
       }
-      xhr.onload = () =>
-        xhr.status === 200 ? resolve() : reject(new Error("업로드 실패"));
-      xhr.onerror = () => reject(new Error("네트워크 오류가 발생했어요"));
+      // R2로 바로 올리는 PUT은 관문(authedFetch)을 지나지 않는다(설계 2026-10-19 4.3).
+      xhr.onload = () => {
+        if (xhr.status === 200) return resolve();
+        void reportFailure({
+          source: {
+            kind: "known",
+            reason: "storage_error",
+            status: xhr.status,
+          },
+          action: "facility_video.upload",
+          target: { table: "building_facilities", id: facility.id },
+        });
+        reject(new Error("업로드 실패"));
+      };
+      xhr.onerror = () => {
+        void reportFailure({
+          source: { kind: "known", reason: "network" },
+          action: "facility_video.upload",
+          target: { table: "building_facilities", id: facility.id },
+        });
+        reject(new Error("네트워크 오류가 발생했어요"));
+      };
       xhr.onabort = () => reject(new Error("업로드 취소됨"));
       xhr.open("PUT", url);
       xhr.setRequestHeader("Content-Type", contentType);
@@ -175,6 +195,18 @@ export default function FacilityVideoModal({
         else showToast("동영상이 업로드됐어요!");
         onUpdate();
       } else if (result.status === "failed") {
+        if (result.reason) {
+          void reportFailure({
+            source: { kind: "known", reason: result.reason },
+            action: "facility_video.upload",
+            target: { table: "building_facilities", id: facility.id },
+            fileSize: result.size ?? file.size,
+            fileType: file.type,
+            ...(result.reason === "payload_too_large"
+              ? { limit: MAX_VIDEO_BYTES }
+              : {}),
+          });
+        }
         showToast(result.message, "error");
       }
     } finally {
```

`src/components/admin/FeedbackEmailModal.tsx` — 관리자 API를 `authedFetch` 없이 부르던 유일한 자리다(`rg -n 'fetch\(\s*["\x60]/api'
src --glob '!**/*.test.*' | rg -v authedFetch`의 관리자 쪽 결과). 관문을 지나게 바꾼다.

```diff
diff --git a/src/components/admin/FeedbackEmailModal.tsx b/src/components/admin/FeedbackEmailModal.tsx
index 91f21a1..39eac70 100644
--- a/src/components/admin/FeedbackEmailModal.tsx
+++ b/src/components/admin/FeedbackEmailModal.tsx
@@ -1,6 +1,6 @@
 "use client";
 import { useId, useState, type CSSProperties } from "react";
-import { supabase } from "@/lib/supabaseClient";
+import { authedFetch } from "@/lib/authedFetch";
 import { useModalFocus } from "@/lib/useModalFocus";
 import type { FeedbackEmails } from "@/lib/settings";

@@ -47,19 +47,10 @@ export default function FeedbackEmailModal({
     setError(null);
     setSaving(true);
     try {
-      const {
-        data: { session },
-      } = await supabase.auth.getSession();
-      const token = session?.access_token;
-      if (!token) throw new Error("로그인 세션 없음");
-
       const cc = ccList.map((s) => s.trim()).filter(Boolean);
-      const res = await fetch("/api/settings/feedback-emails", {
+      const res = await authedFetch("/api/settings/feedback-emails", {
         method: "POST",
-        headers: {
-          "Content-Type": "application/json",
-          Authorization: `Bearer ${token}`,
-        },
+        headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ to: to.trim(), cc, subject: subject.trim() }),
       });
       const json = await res.json();
```

- [ ] **Step 5: 대시보드가 열릴 때 대기열을 비운다** — `src/app/admin/dashboard/layout.tsx`(NAV의 `로그` 줄은 Task 8에서 쓰지만 같은
      파일이라 여기서 함께 넣어도 된다)

```diff
diff --git a/src/app/admin/dashboard/layout.tsx b/src/app/admin/dashboard/layout.tsx
index 0b1fd03..713ba4f 100644
--- a/src/app/admin/dashboard/layout.tsx
+++ b/src/app/admin/dashboard/layout.tsx
@@ -6,6 +6,7 @@ import { usePathname, useRouter } from "next/navigation";
 import Link from "next/link";
 import Image from "next/image";
 import { supabase } from "@/lib/supabaseClient";
+import { flushQueue } from "@/lib/activityReport";
 import { authedFetch } from "@/lib/authedFetch";
 import {
   FEEDBACK_EMAILS_FALLBACK,
@@ -27,6 +28,7 @@ const NAV = [
   { label: "명소", href: "/admin/dashboard/landmarks" },
   { label: "경사도", href: "/admin/dashboard/slopes" },
   { label: "제보함", href: INBOX_HREF },
+  { label: "로그", href: "/admin/dashboard/logs" },
 ];

 export default function DashboardLayout({
@@ -96,6 +98,7 @@ function DashboardShell({ children }: { children: React.ReactNode }) {
       }
       setUser(authenticatedUser);
       setAuthChecked(true);
+      void flushQueue();
     });
   }, [router]);
```

- [ ] **Step 6:** `npm run typecheck && npm run test && npx eslint src/lib src/components/admin src/app/admin` 통과. 커밋:
      `feat(logs): 관리자 API·직접 쓰기·브라우저 처리 실패를 관문에서 보고한다`.

### Task 8: 로그 화면

**Files:**

- Create: `src/lib/activityLogList.test.ts`, `src/lib/activityLogList.ts`, `src/components/admin/logs/useActivityLogList.ts`,
  `src/components/admin/logs/LevelBadge.tsx`, `src/components/admin/logs/ActivityLogDetailModal.tsx`,
  `src/app/admin/dashboard/logs/page.tsx`
- Modify: `src/app/admin/admin-ui.css`(끝에 덧붙임), `src/app/admin/dashboard/layout.tsx`(NAV — Task 7 Step 5의 diff에 들어 있다)

**Interfaces:**

- Consumes: Task 1의 표시 함수, PR 1a의 RLS(`activity_logs_admin_read`).
- Produces: `LOG_LEVELS`, `LogLevel`, `LOG_PAGE_SIZE`, `LogCursor`, `readLogLevel`, `writeLogLevel`, `cursorFilter`, `fetchLogPage`,
  `LogListState`, `LogListAction`, `initialLogList`, `logListReducer`, `useActivityLogList(level)`.

- [ ] **Step 1: 테스트를 쓴다** — `src/lib/activityLogList.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

let result: unknown;
const from = vi.fn(() => queryStub(result));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));

const row = (id: number) => ({
  id,
  occurred_at: `2026-10-19T05:00:${String(id % 60).padStart(2, "0")}.000Z`,
});

describe("activityLogList", () => {
  beforeEach(() => {
    from.mockClear();
  });

  it("유형은 URL의 level에서 읽고 쓴다", async () => {
    const { readLogLevel, writeLogLevel } = await import("./activityLogList");
    expect(readLogLevel("?level=error")).toBe("error");
    expect(readLogLevel("?level=debug")).toBeNull();
    expect(readLogLevel("")).toBeNull();
    expect(writeLogLevel("?tab=x", "warning")).toBe("?tab=x&level=warning");
    expect(writeLogLevel("?level=error", null)).toBe("");
  });

  it("최신순으로 51건을 받아 50건과 다음 쪽 여부를 돌려준다", async () => {
    result = {
      data: Array.from({ length: 51 }, (_, i) => row(100 - i)),
      error: null,
    };
    const { fetchLogPage } = await import("./activityLogList");
    const page = await fetchLogPage("error", null);
    expect(page?.rows).toHaveLength(50);
    expect(page?.hasMore).toBe(true);
    const calls = (from.mock.results[0].value as { calls: unknown[] }).calls;
    expect(calls).toEqual([
      { method: "select", args: ["*"] },
      { method: "order", args: ["occurred_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: false }] },
      { method: "limit", args: [51] },
      { method: "eq", args: ["level", "error"] },
    ]);
  });

  it("더 보기는 (occurred_at, id) 커서 뒤를 받는다", async () => {
    result = { data: [], error: null };
    const { fetchLogPage } = await import("./activityLogList");
    await fetchLogPage(null, {
      occurred_at: "2026-10-19T05:00:00+00:00",
      id: 7,
    });
    const calls = (
      from.mock.results[0].value as {
        calls: { method: string; args: unknown[] }[];
      }
    ).calls;
    expect(calls.at(-1)).toEqual({
      method: "or",
      args: [
        'occurred_at.lt."2026-10-19T05:00:00+00:00",and(occurred_at.eq."2026-10-19T05:00:00+00:00",id.lt.7)',
      ],
    });
  });

  it("조회가 실패하면 null", async () => {
    result = { data: null, error: { message: "permission denied" } };
    const { fetchLogPage } = await import("./activityLogList");
    expect(await fetchLogPage(null, null)).toBeNull();
  });

  it("다른 세대의 응답은 버리고, 더 보기는 이어 붙인다", async () => {
    const { initialLogList, logListReducer } =
      await import("./activityLogList");
    let state = logListReducer(initialLogList, { type: "load", level: null });
    const stale = logListReducer(state, {
      type: "pageLoaded",
      generation: state.generation - 1,
      append: false,
      rows: [],
      hasMore: false,
    });
    expect(stale).toBe(state);
    state = logListReducer(state, {
      type: "pageLoaded",
      generation: state.generation,
      append: false,
      rows: [row(2)] as never,
      hasMore: true,
    });
    state = logListReducer(state, { type: "moreRequested" });
    expect(state.more).toBe("loading");
    state = logListReducer(state, {
      type: "pageLoaded",
      generation: state.generation,
      append: true,
      rows: [row(1)] as never,
      hasMore: false,
    });
    expect(state).toMatchObject({
      status: "ready",
      more: "idle",
      hasMore: false,
    });
    expect(state.rows.map((entry) => entry.id)).toEqual([2, 1]);
  });
});
```

실패를 보고 커밋: `test(logs): 로그 목록의 필터·커서·쪽 잇기를 시험한다`.

- [ ] **Step 2: 목록 모듈** — `src/lib/activityLogList.ts`

```ts
import type { ActivityLogRow } from "@/lib/activityLabels";
import { supabase } from "@/lib/supabaseClient";

/** 로그 목록의 필터·페이지. 설계: docs/specs/2026-10-19-activity-log-design.md 5.3 */

export const LOG_LEVELS = ["info", "warning", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export const LOG_PAGE_SIZE = 50;

export type LogCursor = Pick<ActivityLogRow, "occurred_at" | "id">;

export function readLogLevel(search: string): LogLevel | null {
  const value = new URLSearchParams(search).get("level");
  return (LOG_LEVELS as readonly (string | null)[]).includes(value)
    ? (value as LogLevel)
    : null;
}

export function writeLogLevel(search: string, level: LogLevel | null): string {
  const params = new URLSearchParams(search);
  if (level) params.set("level", level);
  else params.delete("level");
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** `(occurred_at, id) < cursor`. 시각의 `:`·`.`·`+`는 PostgREST 논리식에서 따옴표로 감싼다. */
export function cursorFilter(cursor: LogCursor): string {
  const at = `"${cursor.occurred_at}"`;
  return `occurred_at.lt.${at},and(occurred_at.eq.${at},id.lt.${cursor.id})`;
}

export type LogPage = { rows: ActivityLogRow[]; hasMore: boolean };

/** 읽기는 RLS(`is_admin()`)가 막는다(설계 2.4). 실패하면 빈 목록이 아니라 null. */
export async function fetchLogPage(
  level: LogLevel | null,
  cursor: LogCursor | null,
): Promise<LogPage | null> {
  let query = supabase
    .from("activity_logs")
    .select("*")
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LOG_PAGE_SIZE + 1);
  if (level) query = query.eq("level", level);
  if (cursor) query = query.or(cursorFilter(cursor));
  const { data, error } = await query;
  if (error || !data) return null;
  return {
    rows: data.slice(0, LOG_PAGE_SIZE),
    hasMore: data.length > LOG_PAGE_SIZE,
  };
}

export type LogListState = {
  /** undefined는 URL을 아직 읽지 않았다는 뜻이다. */
  level: LogLevel | null | undefined;
  generation: number;
  status: "loading" | "ready" | "error";
  rows: ActivityLogRow[];
  hasMore: boolean;
  more: "idle" | "loading" | "error";
};

export type LogListAction =
  | { type: "load"; level: LogLevel | null }
  | { type: "reload" }
  | { type: "moreRequested" }
  | ({ type: "pageLoaded"; generation: number; append: boolean } & LogPage)
  | { type: "pageFailed"; generation: number; append: boolean };

export const initialLogList: LogListState = {
  level: undefined,
  generation: 0,
  status: "loading",
  rows: [],
  hasMore: false,
  more: "idle",
};

export function logListReducer(
  state: LogListState,
  action: LogListAction,
): LogListState {
  switch (action.type) {
    case "load":
      return {
        ...initialLogList,
        level: action.level,
        generation: state.generation + 1,
      };
    case "reload":
      return {
        ...initialLogList,
        level: state.level,
        generation: state.generation + 1,
      };
    case "moreRequested":
      return { ...state, more: "loading" };
    case "pageLoaded":
      if (action.generation !== state.generation) return state;
      return action.append
        ? {
            ...state,
            rows: [...state.rows, ...action.rows],
            hasMore: action.hasMore,
            more: "idle",
          }
        : {
            ...state,
            status: "ready",
            rows: action.rows,
            hasMore: action.hasMore,
          };
    case "pageFailed":
      if (action.generation !== state.generation) return state;
      return action.append
        ? { ...state, more: "error" }
        : { ...state, status: "error" };
  }
}
```

`npx vitest run src/lib/activityLogList.test.ts` → 5개 통과.

- [ ] **Step 3: 화면** — `src/components/admin/logs/useActivityLogList.ts`

```ts
"use client";

import { useEffect, useEffectEvent, useReducer } from "react";
import {
  fetchLogPage,
  initialLogList,
  logListReducer,
  type LogCursor,
  type LogLevel,
} from "@/lib/activityLogList";

/** 응답에 요청한 때의 세대를 실어 필터를 바꾼 뒤 도착한 낡은 응답을 리듀서가 버리게 한다(제보함과 같다). */
export function useActivityLogList(level: LogLevel | null | undefined) {
  const [state, dispatch] = useReducer(logListReducer, initialLogList);

  if (level !== undefined && level !== state.level) {
    dispatch({ type: "load", level });
  }

  async function request(
    generation: number,
    requestLevel: LogLevel | null,
    cursor: LogCursor | null,
  ) {
    const page = await fetchLogPage(requestLevel, cursor);
    const append = cursor !== null;
    dispatch(
      page
        ? { type: "pageLoaded", generation, append, ...page }
        : { type: "pageFailed", generation, append },
    );
  }

  const startFirstPage = useEffectEvent((generation: number) => {
    if (generation === 0 || state.level === undefined) return;
    void request(generation, state.level, null);
  });
  useEffect(() => {
    startFirstPage(state.generation);
  }, [state.generation]);

  function loadMore() {
    const last = state.rows.at(-1);
    if (!last || state.level === undefined || state.status !== "ready") return;
    if (state.more === "loading" || (!state.hasMore && state.more !== "error"))
      return;
    dispatch({ type: "moreRequested" });
    void request(state.generation, state.level, {
      occurred_at: last.occurred_at,
      id: last.id,
    });
  }

  function reload() {
    dispatch({ type: "reload" });
  }

  return { state, loadMore, reload };
}
```

`src/components/admin/logs/LevelBadge.tsx`

```tsx
const TONES: Record<string, string> = {
  info: "neutral",
  warning: "warn",
  error: "missing",
};

/** 글자와 색을 함께 쓴다. 색만으로 구분하지 않는다(설계 5.2). */
export default function LevelBadge({ level }: { level: string }) {
  return (
    <span className="ku-row-badge" data-tone={TONES[level] ?? "neutral"}>
      {level}
    </span>
  );
}
```

`src/components/admin/logs/ActivityLogDetailModal.tsx`

```tsx
"use client";

import { useId, useRef } from "react";
import LevelBadge from "@/components/admin/logs/LevelBadge";
import {
  actionLabel,
  changeLines,
  changeVerb,
  formatLogTime,
  recordedLate,
  targetText,
  type ActivityLogRow,
} from "@/lib/activityLabels";
import { useModalFocus } from "@/lib/useModalFocus";

/** 설계: docs/specs/2026-10-19-activity-log-design.md 5.4 */
export default function ActivityLogDetailModal({
  row,
  onClose,
}: {
  row: ActivityLogRow;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: closeButtonRef,
  });
  const failure = row.kind === "failure";
  const verb = failure ? `${actionLabel(row.action)} 실패` : changeVerb(row);
  const lines = failure ? [] : changeLines(row);

  return (
    <div
      ref={dialogRef}
      className="ku-log-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="ku-facility-modal ku-log-modal">
        <div className="ku-log-modal-title">
          <h2 id={titleId}>{targetText(row)}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="ku-admin-button"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <dl className="ku-log-meta">
          <dt>시각</dt>
          <dd>{formatLogTime(row.occurred_at)}</dd>
          {recordedLate(row) && (
            <>
              <dt>기록된 시각</dt>
              <dd>{formatLogTime(row.recorded_at)}</dd>
            </>
          )}
          <dt>로그 유형</dt>
          <dd>
            <LevelBadge level={row.level} />
          </dd>
          <dt>사람</dt>
          <dd>{row.actor_label}</dd>
          <dt>동작</dt>
          <dd>{verb}</dd>
        </dl>

        {failure ? (
          <>
            <p className="ku-log-reason">{row.message}</p>
            <p className="ku-log-reason-code">사유 코드: {row.reason_code}</p>
            <details className="ku-log-raw">
              <summary>원문(개발자용)</summary>
              <pre>{JSON.stringify(row.detail ?? {}, null, 2)}</pre>
            </details>
          </>
        ) : lines.length === 0 ? null : (
          <table className="ku-log-changes">
            <thead>
              <tr>
                <th scope="col">칸</th>
                {row.action === "update" ? (
                  <>
                    <th scope="col">이전</th>
                    <th scope="col">이후</th>
                  </>
                ) : (
                  <th scope="col">
                    {row.action === "delete" ? "지워진 값" : "값"}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.column}>
                  <th scope="row">{line.label}</th>
                  {line.kind === "diff" ? (
                    <>
                      <td>{line.before}</td>
                      <td>{line.after}</td>
                    </>
                  ) : (
                    <td>{line.value}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

`src/app/admin/dashboard/logs/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import ActivityLogDetailModal from "@/components/admin/logs/ActivityLogDetailModal";
import LevelBadge from "@/components/admin/logs/LevelBadge";
import { useActivityLogList } from "@/components/admin/logs/useActivityLogList";
import { ADMIN_MOBILE_QUERY } from "@/components/admin/workspace/types";
import {
  formatLogTime,
  summarize,
  targetText,
  type ActivityLogRow,
} from "@/lib/activityLabels";
import {
  LOG_LEVELS,
  readLogLevel,
  writeLogLevel,
  type LogLevel,
} from "@/lib/activityLogList";
import { useMediaQuery } from "@/lib/useMediaQuery";

export default function ActivityLogsPage() {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const [level, setLevel] = useState<LogLevel | null | undefined>(undefined);
  const [selected, setSelected] = useState<ActivityLogRow | null>(null);
  const { state, loadMore, reload } = useActivityLogList(level);

  // useSearchParams는 Suspense 경계를 요구한다. 다른 관리자 화면처럼 location에서 읽는다.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setLevel(readLogLevel(window.location.search)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  function changeLevel(value: string) {
    const next = (LOG_LEVELS as readonly string[]).includes(value)
      ? (value as LogLevel)
      : null;
    const search = writeLogLevel(window.location.search, next);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search}${window.location.hash}`,
    );
    setLevel(next);
  }

  return (
    <div className="ku-admin-main">
      <div className="ku-admin-page-heading">
        <div>
          <h1 className="ku-admin-title">로그</h1>
          <p className="ku-admin-caption">
            관리자 화면의 변경과 실패 기록. 최신순
          </p>
        </div>
      </div>

      <div className="ku-admin-list-controls">
        <select
          aria-label="로그 유형"
          value={level ?? "all"}
          disabled={level === undefined}
          onChange={(event) => changeLevel(event.target.value)}
        >
          <option value="all">전체</option>
          {LOG_LEVELS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      {state.status === "loading" ? (
        <div className="ku-admin-empty">불러오는 중...</div>
      ) : state.status === "error" ? (
        <div className="ku-admin-empty">
          로그를 불러오지 못했어요.{" "}
          <button className="ku-admin-button" type="button" onClick={reload}>
            다시 시도
          </button>
        </div>
      ) : state.rows.length === 0 ? (
        <div className="ku-admin-empty">기록이 없습니다.</div>
      ) : mobile ? (
        <ul className="ku-log-cards" aria-label="로그 목록">
          {state.rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="ku-log-card"
                onClick={() => setSelected(row)}
              >
                <span className="ku-log-card-meta">
                  <span className="ku-log-time">
                    {formatLogTime(row.occurred_at)}
                  </span>
                  <LevelBadge level={row.level} />
                  <span>{row.actor_label}</span>
                </span>
                <span className="ku-log-card-target">{targetText(row)}</span>
                <span className="ku-log-card-summary">{summarize(row)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ku-log-list">
          <div className="ku-log-head" aria-hidden="true">
            <span>시각</span>
            <span>로그 유형</span>
            <span>사람</span>
            <span>대상</span>
            <span>내용</span>
          </div>
          <ul aria-label="로그 목록">
            {state.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="ku-log-row"
                  onClick={() => setSelected(row)}
                >
                  <span className="ku-log-cell ku-log-time">
                    {formatLogTime(row.occurred_at)}
                  </span>
                  <span className="ku-log-cell">
                    <LevelBadge level={row.level} />
                  </span>
                  <span className="ku-log-cell">{row.actor_label}</span>
                  <span className="ku-log-cell">{targetText(row)}</span>
                  <span className="ku-log-cell">{summarize(row)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.status === "ready" &&
        (state.hasMore || state.more === "error") && (
          <div className="ku-log-more">
            {state.more === "error" && (
              <span role="alert">더 불러오지 못했어요</span>
            )}
            <button
              type="button"
              className="ku-inbox-more"
              disabled={state.more === "loading"}
              onClick={loadMore}
            >
              {state.more === "error" ? "다시 시도" : "더 보기"}
            </button>
          </div>
        )}

      {selected && (
        <ActivityLogDetailModal
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 스타일** — `src/app/admin/admin-ui.css` 끝에 덧붙인다.

```css
/* 로그 탭. 설계: docs/specs/2026-10-19-activity-log-design.md 5장 */
.ku-log-list {
  border: 1px solid var(--ku-border);
  border-radius: var(--ku-radius);
  background: var(--ku-surface);
}
.ku-log-list ul,
.ku-log-cards {
  margin: 0;
  padding: 0;
  list-style: none;
}
.ku-log-head,
.ku-log-row {
  display: grid;
  grid-template-columns:
    96px 84px minmax(96px, 0.9fr) minmax(140px, 1.4fr)
    minmax(200px, 2.6fr);
  align-items: center;
  gap: 12px;
  padding: 0 16px;
}
.ku-log-head {
  min-height: 42px;
  border-bottom: 1px solid var(--ku-divider);
  color: var(--ku-text-3);
  background: var(--ku-bg);
  font-size: 12px;
  font-weight: 600;
}
.ku-log-row {
  width: 100%;
  min-height: 48px;
  border: 0;
  border-bottom: 1px solid var(--ku-divider);
  border-radius: 0;
  color: var(--ku-text-1);
  background: transparent;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.ku-log-list li:last-child .ku-log-row {
  border-bottom: 0;
}
.ku-log-row:hover {
  background: var(--ku-bg);
}
.ku-log-row:focus-visible,
.ku-log-card:focus-visible {
  outline: 2px solid var(--ku-primary);
  outline-offset: -2px;
}
.ku-log-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ku-log-time {
  color: var(--ku-text-2);
  font-variant-numeric: tabular-nums;
}
.ku-log-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 14px;
  color: var(--ku-text-2);
  font-size: 12.5px;
}
.ku-log-more .ku-inbox-more {
  padding: 0 16px;
}
.ku-log-cards {
  display: grid;
  gap: 9px;
}
.ku-log-card {
  display: grid;
  gap: 5px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--ku-border);
  border-radius: var(--ku-radius);
  color: var(--ku-text-1);
  background: var(--ku-surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ku-log-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--ku-text-2);
  font-size: 12px;
}
.ku-log-card-target {
  font-size: 13.5px;
  font-weight: 600;
}
.ku-log-card-summary {
  overflow: hidden;
  color: var(--ku-text-2);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ku-log-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--ku-backdrop);
}
.ku-log-modal {
  box-sizing: border-box;
  width: min(640px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
}
.ku-log-modal-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.ku-log-modal-title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.ku-log-meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 14px;
  margin: 0 0 16px;
  font-size: 13px;
}
.ku-log-meta dt {
  color: var(--ku-text-3);
}
.ku-log-meta dd {
  margin: 0;
}
.ku-log-reason {
  margin: 0 0 6px;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.ku-log-reason-code {
  margin: 0 0 12px;
  color: var(--ku-text-3);
  font-size: 12px;
}
.ku-log-raw summary {
  color: var(--ku-text-2);
  cursor: pointer;
  font-size: 12.5px;
}
.ku-log-raw pre {
  margin: 8px 0 0;
  padding: 10px;
  border: 1px solid var(--ku-divider);
  color: var(--ku-text-1);
  background: var(--ku-bg);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ku-log-changes {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.ku-log-changes th,
.ku-log-changes td {
  padding: 8px;
  border-bottom: 1px solid var(--ku-divider);
  text-align: left;
  vertical-align: top;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ku-log-changes thead th {
  color: var(--ku-text-3);
  font-weight: 600;
}
.ku-log-changes tbody th {
  width: 28%;
  color: var(--ku-text-2);
  font-weight: 600;
}
```

모바일에서 관리자 NAV는 아래 고정 막대라 탭 하나가 늘면 모든 탭이 좁아진다(`admin-ui.css`의 모바일 NAV 규칙). 390px 폭에서 여섯
탭의 글자가 잘리지 않는지 Task 9의 모바일 시나리오에서 눈으로 본다. 잘리면 멈추고 보고한다(탭 글자를 줄일지는 사람이 정한다).

- [ ] **Step 5:** `npm run typecheck && npx eslint src/app/admin src/components/admin/logs` 통과. 커밋:
      `feat(logs): 관리자 헤더에 로그 탭과 유형 필터·상세 모달을 둔다`.

### Task 9: e2e

**Files:**

- Modify: `e2e/support/mockBackend.ts`, `e2e/admin-dark.spec.ts`
- Create: `e2e/admin-activity-logs.spec.ts`

- [ ] **Step 1: 목 백엔드**

```diff
diff --git a/e2e/support/mockBackend.ts b/e2e/support/mockBackend.ts
index c982ab1..72c6955 100644
--- a/e2e/support/mockBackend.ts
+++ b/e2e/support/mockBackend.ts
@@ -53,6 +53,9 @@ export interface MockState {
   facilityPhotos: Row[];
   facilityRequests: Row[];
   facilityRequestPhotos: Row[];
+  activityLogs: Row[];
+  /** 브라우저가 `POST /api/activity-logs`로 보낸 실패 보고 */
+  activityReports: Row[];
 }

 // ── 픽스처(고정 데이터) ───────────────────────────────────────────────
@@ -126,6 +129,96 @@ export function stationBuildingRow(
 }

 // 테스트 1건의 초기 상태 생성(건물/시설/명소/경사/사진). 이후 in-memory로 변형됨.
+/** 로그 화면 시나리오용 행. 칸 이름은 `activity_logs`와 같다. */
+export function activityLogRow(overrides: Row): Row {
+  return {
+    occurred_at: "2026-10-19T05:00:00Z",
+    recorded_at: overrides.occurred_at ?? "2026-10-19T05:00:00Z",
+    level: "info",
+    kind: "change",
+    actor_kind: "admin",
+    actor_id: "admin-user",
+    actor_label: "성웅",
+    action: "update",
+    target_table: null,
+    target_id: null,
+    target_label: null,
+    changes: null,
+    reason_code: null,
+    message: null,
+    detail: null,
+    client_event_id: null,
+    ...overrides,
+  };
+}
+
+function seedActivityLogs(): Row[] {
+  return [
+    activityLogRow({
+      id: 5,
+      occurred_at: "2026-10-19T05:02:00Z",
+      target_table: "building_facilities",
+      target_id: "f-ramp",
+      target_label: "하나스퀘어 · 1층 경사로",
+      changes: {
+        is_installed: [true, false],
+        floor_info: ["1층", "2층"],
+        description: [null, "정문 옆"],
+      },
+    }),
+    activityLogRow({
+      id: 4,
+      occurred_at: "2026-10-19T05:01:00Z",
+      level: "warning",
+      kind: "failure",
+      actor_kind: "system",
+      actor_id: null,
+      actor_label: "자동 번역",
+      action: "facility.translate",
+      target_table: "building_facilities",
+      target_label: "하나스퀘어 · 1층 경사로",
+      reason_code: "translation_error",
+      message: "자동 번역 실패: 번역 API 오류: 응답 없음",
+      detail: { status: 502, error_message: "응답 없음" },
+    }),
+    activityLogRow({
+      id: 3,
+      occurred_at: "2026-10-19T04:40:00Z",
+      recorded_at: "2026-10-19T04:52:00Z",
+      level: "error",
+      kind: "failure",
+      actor_label: "김지원 선임연구원",
+      action: "facility_photo.upload",
+      target_table: "building_facilities",
+      target_label: "중앙광장 · 승강기",
+      reason_code: "payload_too_large",
+      message: "시설 사진 업로드 실패: 파일 5.2MB가 서버 한도 4.5MB를 넘음",
+      detail: {
+        status: 413,
+        code: "FUNCTION_PAYLOAD_TOO_LARGE",
+        file_size: 5452595,
+        limit: 4718592,
+        route: "/api/upload-facility-photo",
+      },
+    }),
+    activityLogRow({
+      id: 2,
+      occurred_at: "2026-10-18T09:00:00Z",
+      action: "delete",
+      target_table: "landmarks",
+      target_label: "분수대",
+      changes: { name: "분수대", lat: 37.5895, lng: 127.0324, icon: "⛲" },
+    }),
+    activityLogRow({
+      id: 1,
+      occurred_at: "2025-12-01T03:00:00Z",
+      target_table: "buildings",
+      target_label: "옛 학생회관",
+      changes: { is_deleted: [false, true] },
+    }),
+  ];
+}
+
 function createState(authenticated: boolean): MockState {
   return {
     authenticated,
@@ -336,6 +429,8 @@ function createState(authenticated: boolean): MockState {
     facilityPhotos: [],
     facilityRequests: [],
     facilityRequestPhotos: [],
+    activityLogs: seedActivityLogs(),
+    activityReports: [],
     photos: [
       {
         id: 1,
@@ -445,9 +540,37 @@ function table(state: MockState, name: string): Row[] {
   return [];
 }

+/**
+ * `activity_logs` 조회 흉내: `level=eq.`와 로그 화면의 `(occurred_at, id)` 커서(`or=`)만 읽고
+ * 최신순으로 돌려준다. 쪽 나누기(`limit`)는 공통 GET 처리가 한다.
+ */
+function activityLogRows(state: MockState, url: URL): Row[] {
+  let result = [...state.activityLogs];
+  const level = url.searchParams.get("level");
+  if (level?.startsWith("eq."))
+    result = result.filter((row) => row.level === level.slice(3));
+  const cursor = url.searchParams
+    .get("or")
+    ?.match(/occurred_at\.lt\."([^"]+)".*id\.lt\.(\d+)/);
+  if (cursor) {
+    const at = Date.parse(cursor[1]);
+    const id = Number(cursor[2]);
+    result = result.filter((row) => {
+      const time = Date.parse(String(row.occurred_at));
+      return time < at || (time === at && Number(row.id) < id);
+    });
+  }
+  return result.sort(
+    (a, b) =>
+      Date.parse(String(b.occurred_at)) - Date.parse(String(a.occurred_at)) ||
+      Number(b.id) - Number(a.id),
+  );
+}
+
 // 테이블 조회: 정적 테이블(facility_types/colleges/app_settings)은 즉시 반환,
 // 나머지는 id·building_id 필터를 PostgREST처럼 적용해 걸러낸다.
 function rows(state: MockState, name: string, url: URL): Row[] {
+  if (name === "activity_logs") return activityLogRows(state, url);
   if (name === "facility_types") return types;
   if (name === "colleges") return colleges;
   if (name === "app_settings")
@@ -792,6 +915,11 @@ const FEEDBACK_FILTER: Record<string, string[] | null> = {
 // 업로드·설정)을 상태 기반으로 응답. 매칭 안 되는 /api/*는 { ok: true }.
 async function handleApi(route: Route, state: MockState, url: URL) {
   const path = url.pathname;
+  if (path === "/api/activity-logs") {
+    const body = (route.request().postDataJSON() ?? {}) as { reports?: Row[] };
+    state.activityReports.push(...(body.reports ?? []));
+    return json(route, { accepted: body.reports?.length ?? 0 });
+  }
   if (path === "/api/buildings") {
     return json(route, {
       type: "FeatureCollection",
```

- [ ] **Step 2: 시나리오** — `e2e/admin-activity-logs.spec.ts`(설계 8.2의 항목 전부 + 관문 보고 하나)

```ts
import { expect, test, type Page } from "@playwright/test";
import { activityLogRow, installMockBackend } from "./support/mockBackend";

/** 설계: docs/specs/2026-10-19-activity-log-design.md 5장, 8.2 */

const logList = (page: Page) => page.getByRole("list", { name: "로그 목록" });

test.describe("관리자 로그", () => {
  test("헤더의 로그 탭으로 들어가 최신순 한 줄 요약을 본다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    await page
      .getByRole("navigation", { name: "관리자 메뉴" })
      .getByRole("link", { name: "로그" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/logs$/);

    const rows = logList(page).getByRole("button");
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText("10/19 14:02");
    await expect(rows.nth(0)).toContainText("info");
    await expect(rows.nth(0)).toContainText("성웅");
    await expect(rows.nth(0)).toContainText("시설 · 하나스퀘어 · 1층 경사로");
    await expect(rows.nth(0)).toContainText(
      "수정: 설치 여부 설치됨 → 미설치 외 2칸",
    );
    await expect(rows.nth(1)).toContainText("자동 번역");
    await expect(rows.nth(2)).toContainText(
      "시설 사진 업로드 실패: 파일 5.2MB가 서버 한도 4.5MB를 넘음",
    );
    await expect(rows.nth(3)).toContainText("삭제");
    await expect(rows.nth(4)).toContainText("2025/12/01 12:00");
    await expect(rows.nth(4)).toContainText("건물 · 옛 학생회관");
  });

  test("유형 드롭다운으로 거르고 주소에 남긴다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/logs");
    await expect(logList(page).getByRole("button")).toHaveCount(5);

    await page
      .getByRole("combobox", { name: "로그 유형" })
      .selectOption("error");
    await expect(page).toHaveURL(/\?level=error$/);
    await expect(logList(page).getByRole("button")).toHaveCount(1);
    await expect(logList(page)).toContainText("시설 사진 업로드 실패");

    await page.reload();
    await expect(page.getByRole("combobox", { name: "로그 유형" })).toHaveValue(
      "error",
    );
    await expect(logList(page).getByRole("button")).toHaveCount(1);
  });

  test("더 보기로 다음 50건을 이어 붙인다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.activityLogs.push(
      ...Array.from({ length: 60 }, (_, index) =>
        activityLogRow({
          id: 100 + index,
          occurred_at: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
          target_table: "landmarks",
          target_label: `명소 ${index}`,
          changes: { name: [`명소 ${index}`, `명소 ${index}!`] },
        }),
      ),
    );
    await page.goto("/admin/dashboard/logs");
    await expect(logList(page).getByRole("button")).toHaveCount(50);
    await page.getByRole("button", { name: "더 보기" }).click();
    await expect(logList(page).getByRole("button")).toHaveCount(65);
    await expect(page.getByRole("button", { name: "더 보기" })).toHaveCount(0);
  });

  test("행을 누르면 수정 전후 표가 열리고 Esc로 닫으면 행으로 돌아간다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/logs");
    const row = logList(page).getByRole("button").first();
    await row.click();

    const dialog = page.getByRole("dialog", {
      name: "시설 · 하나스퀘어 · 1층 경사로",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("columnheader", { name: "이전" }),
    ).toBeVisible();
    const installed = dialog.getByRole("row", { name: /설치 여부/ });
    await expect(installed).toContainText("설치됨");
    await expect(installed).toContainText("미설치");
    await expect(dialog.getByRole("row", { name: /설명/ })).toContainText(
      "(비어 있음)",
    );

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeFocused();
  });

  test("삭제 기록은 지워진 값 표를 보인다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/logs");
    await logList(page).getByRole("button").nth(3).click();
    const dialog = page.getByRole("dialog", { name: "명소 · 분수대" });
    await expect(
      dialog.getByRole("columnheader", { name: "지워진 값" }),
    ).toBeVisible();
    await expect(dialog.getByRole("row", { name: /이름/ })).toContainText(
      "분수대",
    );
  });

  test("실패 기록은 사유와 접힌 원문을 보이고, 늦게 들어온 기록은 두 시각을 보인다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/logs");
    await logList(page).getByRole("button").nth(2).click();
    const dialog = page.getByRole("dialog", {
      name: "시설 · 중앙광장 · 승강기",
    });
    await expect(dialog).toContainText(
      "시설 사진 업로드 실패: 파일 5.2MB가 서버 한도 4.5MB를 넘음",
    );
    await expect(dialog).toContainText("사유 코드: payload_too_large");
    await expect(dialog).toContainText("기록된 시각");

    const raw = dialog.locator("pre");
    await expect(raw).toBeHidden();
    await dialog.getByText("원문(개발자용)").click();
    await expect(raw).toContainText("FUNCTION_PAYLOAD_TOO_LARGE");
  });

  test("좁은 화면에서는 카드 목록으로 바뀐다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/logs");
    const cards = logList(page).getByRole("button");
    await expect(cards).toHaveCount(5);
    await expect(cards.first()).toContainText("시설 · 하나스퀘어 · 1층 경사로");
    await expect(page.locator(".ku-log-head")).toHaveCount(0);
  });

  test("관리자 API가 Vercel 504로 끝나면 실패를 보고한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.route("**/api/settings/feedback-emails", (route) =>
      route.fulfill({
        status: 504,
        headers: { "x-vercel-error": "FUNCTION_INVOCATION_TIMEOUT" },
        body: "An error occurred with your deployment",
      }),
    );
    await page.goto("/admin/dashboard/facilities");
    await page.getByRole("button", { name: "설정" }).click();
    await page.locator("input").first().fill("accessibility@example.com");
    await page.getByRole("button", { name: "저장" }).click();

    await expect.poll(() => state.activityReports.length).toBeGreaterThan(0);
    expect(state.activityReports[0]).toMatchObject({
      owner_user_id: "admin-user",
      action: "settings.feedback_emails",
      reason_code: "timeout",
      level: "error",
      detail: { status: 504, code: "FUNCTION_INVOCATION_TIMEOUT" },
    });
  });
});
```

- [ ] **Step 3: 다크 모드 가드** — `e2e/admin-dark.spec.ts`

```diff
diff --git a/e2e/admin-dark.spec.ts b/e2e/admin-dark.spec.ts
index 191940f..ad96096 100644
--- a/e2e/admin-dark.spec.ts
+++ b/e2e/admin-dark.spec.ts
@@ -77,6 +77,7 @@ const SCREENS = [
   { name: "경사도 보기 패널", path: "/admin/dashboard/slopes?id=2" },
   { name: "명소 목록", path: "/admin/dashboard/landmarks" },
   { name: "제보함", path: "/admin/dashboard/inbox" },
+  { name: "로그", path: "/admin/dashboard/logs" },
   { name: "건물 상세", path: "/admin/buildings/1" },
   { name: "건물 신규 등록", path: "/admin/buildings/new" },
   { name: "경사도 경로 그리기", path: "/admin/dashboard/slopes?new=1" },
@@ -126,6 +127,27 @@ test.describe("관리자 다크 모드 대비 회귀 가드 (P0-03)", () => {
     ).toHaveLength(0);
   });

+  test("로그 상세 모달에 하드코딩 밝은 색이 남지 않는다", async ({ page }) => {
+    await installMockBackend(page, { authenticated: true });
+    await page.goto("/admin/dashboard/logs");
+    await page
+      .getByRole("list", { name: "로그 목록" })
+      .getByRole("button")
+      .nth(2)
+      .click();
+    await page.getByRole("dialog").getByText("원문(개발자용)").click();
+
+    const result = await scanContrast(page);
+    expect(
+      result.nearWhiteBg,
+      `미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
+    ).toHaveLength(0);
+    expect(
+      result.nearBlackText,
+      `미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
+    ).toHaveLength(0);
+  });
+
   test("크림슨 채움은 모드마다 흰 글자 대비를 지키는 값이다", async ({
     page,
   }) => {
```

- [ ] **Step 4:** `npx playwright test e2e/admin-activity-logs.spec.ts e2e/admin-dark.spec.ts` → 통과, 그다음 `npm run test:e2e` 전체.
      커밋: `test(e2e): 로그 탭의 목록·필터·더 보기·상세 모달과 관문 보고를 시험한다`.

### Task 10: 문서

**Files:**

- Modify: `docs/specs/2026-08-14-strict-types-and-logging.md`, `docs/specs/2026-10-19-activity-log-design.md`(실행 중 다르게 간 것만)

- [ ] **Step 1: 머리부터 읽는다.** `docs/specs/2026-08-14-strict-types-and-logging.md`의 첫 40줄에 대체 배너·신구 대응표가 있는지 본다
      (2026-10-19 기준 없음). 있으면 본문을 고치지 않고 표에 더한다.
- [ ] **Step 2: 2절 "서버 로그는 실패만 남긴다"를 고친다**(설계 9장).
  - 첫 문단 "로그 싱크(집계·검색·보존)가 없어 stdout이 유일한 출력이다." 다음 줄에 덧붙인다:
    "2026-10-19 — 관리자 화면의 실패는 DB 감사 로그(`activity_logs`)에도 남는다(`docs/specs/2026-10-19-activity-log-design.md`
    4장). 아래 stdout 규칙은 그대로다. DB가 죽었을 때는 `console.error`가 유일한 기록이다."
  - "로깅 유틸을 만들지 않은 이유" 문단을 바꾼다: "로깅 유틸을 만들지 않은 이유(2026-08-14): 호출부가 소수이고 싱크가 없어
    `console.error` 래퍼 한 겹에 그쳤다. 2026-10-19에 DB 기록이 생겨 `logFailure()`·`routeFailures()`(`src/lib/server/`)를 두었다.
    이것들은 `console.error`를 대신하지 않는다."
- [ ] **Step 3: 계획과 다르게 간 것**이 있으면 설계의 해당 절을 고치고 12장 이력에 날짜와 함께 한 줄 더한다.
- [ ] **Step 4: 참조 역추적(전역 지침 Reference Back-Trace).** 출력과 판단을 PR 본문에 붙인다.

```bash
rg -n "console\.error|logFailure|reportFailure|authedFetch|supabaseClient|로깅 유틸|stdout이 유일" docs src/lib src/app/api e2e/support
```

- [ ] **Step 5: 커밋과 PR** — `docs: 실패가 DB 감사 로그에도 남는다는 것을 로깅 규칙에 적는다`. PR 본문에 Task 5 Step 3과 Task 10
      Step 4의 출력, 설계 8.5의 수동 확인 목록(병합 뒤 운영에서)을 적는다. 끝에
      `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## 병합 뒤 (사람, 설계 8.5)

- 4.5MB를 넘는 사진을 올려 `payload_too_large`와 파일 크기가 남는지 본다.
- 오프라인으로 저장을 실패시킨 뒤 다시 연결하고 대시보드를 열면 `network` 줄이 발생 시각 자리에 들어오는지 본다.
- 시설을 저장한 뒤 `자동 번역` 줄(실패했을 때만 warning)이 따라오는지 본다.
