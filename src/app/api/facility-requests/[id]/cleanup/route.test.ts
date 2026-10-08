import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const cleanupRequestPhotos = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({ cleanupRequestPhotos }));
let row: unknown = { status: "rejected" };
let queryError: unknown = null;
const from = vi.fn(() => queryStub({ data: row, error: queryError }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

type Calls = { method: string; args: unknown[] }[];
const callsOf = (index: number) =>
  (from.mock.results[index].value as { calls: Calls }).calls;

const call = () =>
  [
    new Request("https://local.test/x", { method: "POST" }),
    { params: Promise.resolve({ id: "r1" }) },
  ] as const;

describe("POST .../cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    row = { status: "rejected" };
    queryError = null;
    cleanupRequestPhotos.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자가 아니면 그 응답을 돌려주고 조회·정리하지 않는다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "인증 필요" }, { status: 401 }),
    });
    const { POST } = await import("./route");
    const response = await POST(...call());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "인증 필요" });
    expect(from).not.toHaveBeenCalled();
    expect(cleanupRequestPhotos).not.toHaveBeenCalled();
  });

  it("끝 상태 요청만 정리한다 — 검토 전 사진은 관리자가 아직 볼 것이다", async () => {
    const { POST } = await import("./route");
    const ok = await POST(...call());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(callsOf(0)).toContainEqual({ method: "eq", args: ["id", "r1"] });
    expect(cleanupRequestPhotos).toHaveBeenCalledWith("r1");
    row = { status: "new" };
    const blocked = await POST(...call());
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({
      error: "처리가 끝난 요청만 정리할 수 있어요",
    });
    expect(cleanupRequestPhotos).toHaveBeenCalledTimes(1);
  });

  it("요청이 없으면 409이고 정리하지 않는다", async () => {
    row = null;
    const { POST } = await import("./route");
    expect((await POST(...call())).status).toBe(409);
    expect(cleanupRequestPhotos).not.toHaveBeenCalled();
  });

  it("조회가 실패하면 409가 아니라 500이고 정리하지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    queryError = { code: "XX000", message: "boom" };
    row = null;
    const { POST } = await import("./route");
    const response = await POST(...call());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "요청을 불러오지 못했어요",
    });
    expect(spy).toHaveBeenCalled();
    expect(cleanupRequestPhotos).not.toHaveBeenCalled();
  });

  it("정리가 실패하면 500", async () => {
    cleanupRequestPhotos.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(...call());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "사진을 지우지 못했어요" });
  });
});
