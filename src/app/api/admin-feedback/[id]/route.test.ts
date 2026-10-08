import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const from = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const call = (body: unknown) =>
  [
    new Request("https://local.test/x", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "fb1" }) },
  ] as const;

describe("PATCH /api/admin-feedback/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    from.mockImplementation(() =>
      queryStub({ data: [{ id: "fb1" }], error: null }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("세 상태 중 하나로 바꾼다", async () => {
    const stub = queryStub({ data: [{ id: "fb1" }], error: null });
    from.mockReturnValueOnce(stub);
    const { PATCH } = await import("./route");
    const response = await PATCH(...call({ status: "resolved" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "resolved" });
    expect(stub.calls).toContainEqual({
      method: "update",
      args: [{ status: "resolved" }],
    });
    expect(stub.calls).toContainEqual({ method: "eq", args: ["id", "fb1"] });
  });

  it("허용되지 않은 상태는 400이고 갱신하지 않는다", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(...call({ status: "approved" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "상태 값이 올바르지 않아요",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("없는 피드백은 404", async () => {
    from.mockImplementation(() => queryStub({ data: [], error: null }));
    const { PATCH } = await import("./route");
    const response = await PATCH(...call({ status: "new" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "피드백이 없어요" });
  });

  it("갱신이 실패하면 404가 아니라 500이다", async () => {
    from.mockImplementation(() =>
      queryStub({
        data: null,
        error: { code: "XX000", message: "boom" },
      }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { PATCH } = await import("./route");
    const response = await PATCH(...call({ status: "new" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "상태를 바꾸지 못했어요" });
    expect(spy).toHaveBeenCalled();
  });

  it("관리자가 아니면 그 응답을 돌려주고 갱신하지 않는다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({}, { status: 401 }),
    });
    const { PATCH } = await import("./route");
    expect((await PATCH(...call({ status: "new" }))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});
