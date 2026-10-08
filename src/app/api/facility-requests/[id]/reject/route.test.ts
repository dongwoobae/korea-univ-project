import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const ID = "5b0c1d2e-0000-4000-8000-000000000001";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const cleanupRequestPhotos = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({ cleanupRequestPhotos }));
let updated: unknown[] = [{ id: ID }];
let queryError: unknown = null;
const from = vi.fn(() => queryStub({ data: updated, error: queryError }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

type Calls = { method: string; args: unknown[] }[];
const callsOf = (index: number) =>
  (from.mock.results[index].value as { calls: Calls }).calls;

const call = (id = ID) =>
  [
    new Request("https://local.test/x", { method: "POST" }),
    { params: Promise.resolve({ id }) },
  ] as const;

describe("POST .../reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    updated = [{ id: ID }];
    queryError = null;
    cleanupRequestPhotos.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("형식이 틀린 id는 조회 전에 404다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...call("../x"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "요청이 없어요" });
    expect(from).not.toHaveBeenCalled();
    expect(cleanupRequestPhotos).not.toHaveBeenCalled();
  });

  it("관리자가 아니면 그 응답을 돌려주고 갱신·정리하지 않는다", async () => {
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

  it("신규·확인 중만 거절하고 사진을 정리한다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...call());
    expect(await response.json()).toEqual({ ok: true, cleanupFailed: false });
    const calls = callsOf(0);
    expect(calls).toContainEqual({
      method: "update",
      args: [
        expect.objectContaining({
          status: "rejected",
          reviewed_at: expect.any(String),
        }),
      ],
    });
    expect(calls).toContainEqual({ method: "eq", args: ["id", ID] });
    expect(calls).toContainEqual({
      method: "in",
      args: ["status", ["new", "reviewing"]],
    });
    expect(cleanupRequestPhotos).toHaveBeenCalledWith(ID);
  });

  it("이미 처리된 요청은 409이고 정리하지 않는다", async () => {
    updated = [];
    const { POST } = await import("./route");
    const response = await POST(...call());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "이미 처리된 요청이에요" });
    expect(cleanupRequestPhotos).not.toHaveBeenCalled();
  });

  it("정리가 실패해도 거절은 유지하고 알린다", async () => {
    cleanupRequestPhotos.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(...call());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, cleanupFailed: true });
  });

  it("갱신이 실패하면 409가 아니라 500이고 정리하지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    queryError = { code: "XX000", message: "boom" };
    updated = [];
    const { POST } = await import("./route");
    const response = await POST(...call());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "거절하지 못했어요" });
    expect(spy).toHaveBeenCalled();
    expect(cleanupRequestPhotos).not.toHaveBeenCalled();
  });
});
