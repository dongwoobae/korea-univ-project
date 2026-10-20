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
