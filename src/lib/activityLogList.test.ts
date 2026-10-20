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
