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

  it("기본 키가 code인 시설 종류는 code 필터에서 대상 키를 읽는다", () => {
    expect(
      restWrite(
        new URL(`${REST}/facility_types?code=eq.type_ab12cd34`),
        "DELETE",
      ),
    ).toEqual({
      action: "facility_types.delete",
      table: "facility_types",
      id: "type_ab12cd34",
    });
    expect(
      restWrite(new URL(`${REST}/facility_types?code=eq.ramp`), "PATCH")?.id,
    ).toBe("ramp");
    expect(restWrite(new URL(`${REST}/facility_types`), "POST")?.id).toBeNull();
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
