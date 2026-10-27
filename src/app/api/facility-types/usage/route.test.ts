import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub, type QueryCall } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const from = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const call = () =>
  new Request("https://local.test/api/facility-types/usage") as Request;

const COUNTS: Record<string, Record<string, number>> = {
  building_facilities: { ramp: 3, type_lounge01: 0 },
  facility_requests: { ramp: 0, type_lounge01: 2 },
};

function codeOf(calls: QueryCall[]) {
  return String(
    calls.find(
      (item) => item.method === "eq" && item.args[0] === "facility_code",
    )?.args[1],
  );
}

function stubTables(failing?: string) {
  from.mockImplementation((table: string) =>
    table === "facility_types"
      ? queryStub({
          data: [{ code: "ramp" }, { code: "type_lounge01" }],
          error: null,
        })
      : queryStub((calls) =>
          table === failing
            ? { count: null, error: { code: "XX000", message: "boom" } }
            : { count: COUNTS[table][codeOf(calls)], error: null },
        ),
  );
}

function queriesOn(table: string) {
  return from.mock.calls
    .map(([name], index) => ({
      name,
      query: from.mock.results[index].value as { calls: QueryCall[] },
    }))
    .filter((item) => item.name === table)
    .map((item) => item.query);
}

describe("GET /api/facility-types/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    stubTables();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자가 아니면 그 응답을 그대로 돌려주고 세지 않는다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "권한 없음" }, { status: 403 }),
    });
    const { GET } = await import("./route");
    expect((await GET(call())).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("종류마다 쓰는 시설 수와 검토 대기 요청 수를 준다", async () => {
    const { GET } = await import("./route");
    const response = await GET(call());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ramp: { facilities: 3, pendingRequests: 0 },
      type_lounge01: { facilities: 0, pendingRequests: 2 },
    });
  });

  it("행이 아니라 개수만 묻고, 요청은 검토 대기(new·reviewing)만 센다", async () => {
    const { GET } = await import("./route");
    await GET(call());
    const counted = [
      ...queriesOn("building_facilities"),
      ...queriesOn("facility_requests"),
    ];
    expect(counted).toHaveLength(4);
    for (const query of counted)
      expect(query.calls).toContainEqual({
        method: "select",
        args: ["id", { count: "exact", head: true }],
      });
    for (const query of queriesOn("facility_requests"))
      expect(query.calls).toContainEqual({
        method: "in",
        args: ["status", ["new", "reviewing"]],
      });
  });

  it("세기가 하나라도 실패하면 0이 아니라 500이다", async () => {
    stubTables("facility_requests");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("./route");
    const response = await GET(call());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "사용 현황을 불러오지 못했어요",
    });
    expect(spy).toHaveBeenCalled();
  });

  it("종류를 읽지 못하면 500이다", async () => {
    from.mockImplementation(() =>
      queryStub({ data: null, error: { code: "XX000", message: "boom" } }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("./route");
    expect((await GET(call())).status).toBe(500);
  });
});
