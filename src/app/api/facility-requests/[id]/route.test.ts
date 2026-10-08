import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const signedUrls = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({ signedUrls }));
let row: unknown = null;
let queryError: unknown = null;
const from = vi.fn(() => queryStub({ data: row, error: queryError }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const ID = "5b0c1d2e-0000-4000-8000-000000000001";
const call = (id = ID) =>
  [
    new Request(`https://local.test/api/facility-requests/${id}`),
    { params: Promise.resolve({ id }) },
  ] as const;

describe("GET /api/facility-requests/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryError = null;
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    row = {
      id: ID,
      building_id: 1,
      facility_code: "elevator",
      name: null,
      description: null,
      floor_info: null,
      lat: null,
      lng: null,
      status: "new",
      created_at: "x",
      reviewed_at: null,
      facility_id: null,
      client_hash: "secret-hash",
      buildings: { id: 1, name: "아산이학관", geojson: null },
      facility_request_photos: [
        { id: "p1", storage_path: `${ID}/a.webp`, sort_order: 0 },
      ],
    };
    signedUrls.mockResolvedValue(
      new Map([[`${ID}/a.webp`, "https://signed/a"]]),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("형식이 틀린 id는 조회 전에 404다", async () => {
    const { GET } = await import("./route");
    const response = await GET(...call("../x"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "요청이 없어요" });
    expect(from).not.toHaveBeenCalled();
    expect(signedUrls).not.toHaveBeenCalled();
  });

  it("관리자가 아니면 그 응답을 그대로 돌려주고 조회하지 않는다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "인증 필요" }, { status: 401 }),
    });
    const { GET } = await import("./route");
    expect((await GET(...call())).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("사진을 서명 주소로 주고 client_hash는 내보내지 않는다", async () => {
    const { GET } = await import("./route");
    const body = await (await GET(...call())).json();
    expect(body.photos).toEqual([
      { id: "p1", sort_order: 0, url: "https://signed/a" },
    ]);
    expect(body.building).toEqual({ id: 1, name: "아산이학관", geojson: null });
    expect(body).not.toHaveProperty("client_hash");
  });

  it("없으면 404", async () => {
    row = null;
    const { GET } = await import("./route");
    expect((await GET(...call())).status).toBe(404);
  });

  it("조회가 실패하면 404가 아니라 500이다", async () => {
    queryError = { code: "XX000", message: "boom" };
    row = null;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("./route");
    const response = await GET(...call());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "요청을 불러오지 못했어요",
    });
    expect(spy).toHaveBeenCalled();
    expect(signedUrls).not.toHaveBeenCalled();
  });
});
