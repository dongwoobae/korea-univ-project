import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const row = {
  id: "fb1",
  feedback_type: "error",
  content: "본문",
  page_url: null,
  status: "new",
  created_at: "x",
};
const from = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

type Calls = { method: string; args: unknown[] }[];

describe("GET /api/admin-feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    from.mockImplementation(() =>
      queryStub({ data: [row], error: null, count: 1 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("처리 완료 필터는 resolved만 고른다", async () => {
    const stub = queryStub({ data: [row], error: null, count: 1 });
    from.mockReturnValueOnce(stub);
    const { GET } = await import("./route");
    const body = await (
      await GET(
        new Request("https://local.test/api/admin-feedback?status=done"),
      )
    ).json();
    expect(body.total).toBe(1);
    expect(body.items).toEqual([row]);
    expect(stub.calls).toContainEqual({
      method: "in",
      args: ["status", ["resolved"]],
    });
  });

  it("전체 필터는 상태 조건을 걸지 않는다", async () => {
    const stub = queryStub({ data: [row], error: null, count: 1 });
    from.mockReturnValueOnce(stub);
    const { GET } = await import("./route");
    await GET(new Request("https://local.test/api/admin-feedback?status=all"));
    expect((stub.calls as Calls).some((call) => call.method === "in")).toBe(
      false,
    );
  });

  it("비로그인은 401이고 조회하지 않는다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({}, { status: 401 }),
    });
    const { GET } = await import("./route");
    expect(
      (await GET(new Request("https://local.test/api/admin-feedback"))).status,
    ).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("조회가 실패하면 빈 목록이 아니라 500이다", async () => {
    from.mockImplementation(() =>
      queryStub({
        data: null,
        error: { code: "XX000", message: "boom" },
        count: null,
      }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://local.test/api/admin-feedback"),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "피드백을 불러오지 못했어요",
    });
    expect(spy).toHaveBeenCalled();
  });
});
