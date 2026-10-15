import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SlopeRoutePoints } from "@/types/domain";

const single = vi.fn();
const selectAfterInsert = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select: selectAfterInsert }));
const selectAfterUpdate = vi.fn();
const eqUpdatedAt = vi.fn(() => ({ select: selectAfterUpdate }));
const eqUpdateId = vi.fn(() => ({ eq: eqUpdatedAt }));
const update = vi.fn(() => ({ eq: eqUpdateId }));
const eqDelete = vi.fn();
const deleteRows = vi.fn(() => ({ eq: eqDelete }));
const from = vi.fn(() => ({ insert, update, delete: deleteRows }));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));

const segments: SlopeRoutePoints = [
  { lat: 37.58, lng: 127.02 },
  { lat: 37.581, lng: 127.021, slope: 7.2, distance: 12.4 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveSlopeRoute", () => {
  it("새 경로는 삽입하고 숫자 id도 문자열로 돌려준다", async () => {
    single.mockResolvedValue({ data: { id: 9 }, error: null });
    const { saveSlopeRoute } = await import("./slopeSave");
    const result = await saveSlopeRoute({
      routeId: null,
      loadedAt: null,
      name: "새 길",
      segments,
    });
    expect(from).toHaveBeenCalledWith("slope_segments");
    expect(insert).toHaveBeenCalledWith({
      name: "새 길",
      gpx_file: null,
      segments,
    });
    expect(selectAfterInsert).toHaveBeenCalledWith("id");
    expect(result).toEqual({ ok: true, routeId: "9", created: true });
  });

  it("삽입 오류는 error다", async () => {
    single.mockResolvedValue({ data: null, error: { message: "거부" } });
    const { saveSlopeRoute } = await import("./slopeSave");
    expect(
      await saveSlopeRoute({
        routeId: null,
        loadedAt: null,
        name: "새 길",
        segments,
      }),
    ).toEqual({ ok: false, reason: "error", message: "거부" });
  });

  it("기존 경로는 id와 updated_at 조건으로 수정한다", async () => {
    selectAfterUpdate.mockResolvedValue({ data: [{ id: 3 }], error: null });
    const { saveSlopeRoute } = await import("./slopeSave");
    const result = await saveSlopeRoute({
      routeId: "3",
      loadedAt: "2026-10-01T00:00:00Z",
      name: "고친 길",
      segments,
    });
    expect(update).toHaveBeenCalledWith({ name: "고친 길", segments });
    expect(eqUpdateId).toHaveBeenCalledWith("id", "3");
    expect(eqUpdatedAt).toHaveBeenCalledWith(
      "updated_at",
      "2026-10-01T00:00:00Z",
    );
    expect(selectAfterUpdate).toHaveBeenCalledWith("id");
    expect(result).toEqual({ ok: true, routeId: "3", created: false });
  });

  it("바뀐 행이 없으면 conflict다", async () => {
    selectAfterUpdate.mockResolvedValue({ data: [], error: null });
    const { saveSlopeRoute } = await import("./slopeSave");
    expect(
      await saveSlopeRoute({
        routeId: "3",
        loadedAt: "2026-10-01T00:00:00Z",
        name: "고친 길",
        segments,
      }),
    ).toEqual({ ok: false, reason: "conflict" });
  });

  it("수정 오류는 error다", async () => {
    selectAfterUpdate.mockResolvedValue({
      data: null,
      error: { message: "거부" },
    });
    const { saveSlopeRoute } = await import("./slopeSave");
    expect(
      await saveSlopeRoute({
        routeId: "3",
        loadedAt: "x",
        name: "고친 길",
        segments,
      }),
    ).toEqual({ ok: false, reason: "error", message: "거부" });
  });

  it("loadedAt이 null이면 빈 문자열로 건다", async () => {
    selectAfterUpdate.mockResolvedValue({ data: [], error: null });
    const { saveSlopeRoute } = await import("./slopeSave");
    await saveSlopeRoute({
      routeId: "3",
      loadedAt: null,
      name: "고친 길",
      segments,
    });
    expect(eqUpdatedAt).toHaveBeenCalledWith("updated_at", "");
  });
});

describe("deleteSlopeRoute", () => {
  it("id로 지우고 성공이면 null이다", async () => {
    eqDelete.mockResolvedValue({ error: null });
    const { deleteSlopeRoute } = await import("./slopeSave");
    expect(await deleteSlopeRoute("3")).toBeNull();
    expect(deleteRows).toHaveBeenCalled();
    expect(eqDelete).toHaveBeenCalledWith("id", "3");
  });

  it("오류면 삭제 실패 메시지다", async () => {
    eqDelete.mockResolvedValue({ error: { message: "거부" } });
    const { deleteSlopeRoute } = await import("./slopeSave");
    expect(await deleteSlopeRoute("3")).toBe("삭제 실패: 거부");
  });
});
