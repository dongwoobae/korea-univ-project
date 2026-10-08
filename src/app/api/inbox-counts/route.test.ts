import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const from = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const call = () =>
  new Request("https://local.test/api/inbox-counts") as Request;

describe("GET /api/inbox-counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    from.mockImplementation((table: string) =>
      queryStub({ count: table === "facility_requests" ? 2 : 5, error: null }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자가 아니면 그 응답을 그대로 돌려주고 조회하지 않는다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "인증 필요" }, { status: 401 }),
    });
    const { GET } = await import("./route");
    expect((await GET(call())).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("신규 요청 수와 신규 피드백 수를 준다", async () => {
    const { GET } = await import("./route");
    const body = await (await GET(call())).json();
    expect(body).toEqual({ requests: 2, feedback: 5 });
    expect(from.mock.results).toHaveLength(2);
    for (const result of from.mock.results) {
      const query = result.value as {
        calls: { method: string; args: unknown[] }[];
      };
      expect(query.calls).toContainEqual({
        method: "eq",
        args: ["status", "new"],
      });
    }
  });

  it("한쪽이 실패하면 0이 아니라 500이다", async () => {
    from.mockImplementation((table: string) =>
      table === "facility_requests"
        ? queryStub({ count: null, error: { code: "XX000", message: "boom" } })
        : queryStub({ count: 5, error: null }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("./route");
    const response = await GET(call());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "개수를 불러오지 못했어요",
    });
    expect(spy).toHaveBeenCalled();
  });
});
