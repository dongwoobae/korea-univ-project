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

// 기본 키가 id가 아닌 기록 대상 테이블. 실패 보고의 대상 키를 이 칸의 `eq.` 필터에서 읽는다.
const KEY_COLUMNS: Partial<Record<AuditTable, string>> = {
  facility_types: "code",
};

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
  const filter = url.searchParams.get(KEY_COLUMNS[table] ?? "id");
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
