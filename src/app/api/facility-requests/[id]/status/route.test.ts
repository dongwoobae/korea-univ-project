import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
let updated: unknown[] = [{ id: "r1" }];
let queryError: unknown = null;
const from = vi.fn(() => queryStub({ data: updated, error: queryError }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const call = (body: unknown) =>
  [
    new Request("https://local.test/api/facility-requests/r1/status", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "r1" }) },
  ] as const;

describe("POST .../status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    updated = [{ id: "r1" }];
    queryError = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자가 아니면 그 응답을 돌려주고 갱신하지 않는다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "인증 필요" }, { status: 401 }),
    });
    const { POST } = await import("./route");
    const response = await POST(...call({ status: "reviewing" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "인증 필요" });
    expect(from).not.toHaveBeenCalled();
  });

  it("확인 중으로 바꿀 때는 신규인 요청만 바꾼다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...call({ status: "reviewing" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "reviewing" });
    const query = from.mock.results[0].value as {
      calls: { method: string; args: unknown[] }[];
    };
    expect(query.calls).toContainEqual({
      method: "update",
      args: [{ status: "reviewing" }],
    });
    expect(query.calls).toContainEqual({
      method: "eq",
      args: ["status", "new"],
    });
  });

  it("바뀐 행이 없으면(끝 상태 등) 409", async () => {
    updated = [];
    const { POST } = await import("./route");
    const response = await POST(...call({ status: "new" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "이미 처리됐거나 상태가 바뀐 요청이에요",
    });
  });

  it("new·reviewing 외 값은 400이고 갱신하지 않는다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...call({ status: "approved" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "상태 값이 올바르지 않아요",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("갱신이 실패하면 409가 아니라 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    queryError = { code: "XX000", message: "boom" };
    updated = [];
    const { POST } = await import("./route");
    const response = await POST(...call({ status: "new" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "상태를 바꾸지 못했어요" });
    expect(spy).toHaveBeenCalled();
  });
});
