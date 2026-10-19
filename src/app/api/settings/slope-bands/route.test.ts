import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SLOPE_BANDS } from "@/lib/slopeBands";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const from = vi.fn();
const supabaseAdmin = vi.fn(() => ({ from }));
vi.mock("@/lib/server/supabaseAdmin", () => ({ supabaseAdmin }));

function post(body: unknown) {
  return new Request("https://local.test/api/settings/slope-bands", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const TWO_BANDS = {
  bands: [
    { name: " 낮음 ", upperPercent: 5, color: "#00ff00", description: "" },
    { name: "높음", upperPercent: null, color: "#FF0000", description: "" },
  ],
};
const TWO_BANDS_NORMALIZED = {
  bands: [
    { name: "낮음", upperPercent: 5, color: "#00FF00", description: "" },
    { name: "높음", upperPercent: null, color: "#FF0000", description: "" },
  ],
};

describe("POST /api/settings/slope-bands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    from.mockImplementation(() => queryStub({ error: null }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("검증한 값을 slope_bands 행에 upsert하고 돌려준다", async () => {
    const stub = queryStub({ error: null });
    from.mockReturnValueOnce(stub);
    const { POST } = await import("./route");
    const response = await POST(post(TWO_BANDS));

    expect(response.status).toBe(200);
    expect(supabaseAdmin).toHaveBeenCalledWith({ userId: "admin" });
    expect(await response.json()).toEqual({
      ok: true,
      value: TWO_BANDS_NORMALIZED,
    });
    expect(from).toHaveBeenCalledWith("app_settings");
    const upsert = stub.calls.find((call) => call.method === "upsert")!;
    expect(upsert.args[0]).toMatchObject({
      key: "slope_bands",
      value: TWO_BANDS_NORMALIZED,
    });
    expect(typeof (upsert.args[0] as { updated_at: unknown }).updated_at).toBe(
      "string",
    );
    expect(upsert.args[1]).toEqual({ onConflict: "key" });
  });

  it("기본값의 상한을 반올림하지 않고 그대로 저장한다", async () => {
    const stub = queryStub({ error: null });
    from.mockReturnValueOnce(stub);
    const { POST } = await import("./route");
    await POST(post({ bands: DEFAULT_SLOPE_BANDS }));
    const upsert = stub.calls.find((call) => call.method === "upsert")!;
    expect(
      (
        upsert.args[0] as {
          value: { bands: { upperPercent: number | null }[] };
        }
      ).value.bands.map((band) => band.upperPercent),
    ).toEqual(DEFAULT_SLOPE_BANDS.map((band) => band.upperPercent));
  });

  it("검증에 실패하면 400과 첫 오류 문구이고 저장하지 않는다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ bands: [TWO_BANDS.bands[1]] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "구간은 2~6개여야 해요" });
    expect(from).not.toHaveBeenCalled();
  });

  it("JSON이 아닌 본문은 400이고 저장하지 않는다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post("nope"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "범례 설정 형식이 올바르지 않아요",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("관리자가 아니면 그 응답을 돌려주고 저장하지 않는다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({}, { status: 401 }),
    });
    const { POST } = await import("./route");
    expect((await POST(post(TWO_BANDS))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("저장이 실패하면 500이고 콘솔에 남긴다", async () => {
    from.mockImplementation(() =>
      queryStub({ error: { code: "XX000", message: "boom" } }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");
    const response = await POST(post(TWO_BANDS));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "범례를 저장하지 못했어요",
    });
    expect(spy).toHaveBeenCalled();
  });
});
