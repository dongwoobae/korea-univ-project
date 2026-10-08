import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));

const removeFolder = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({ removeFolder }));

let rowResult: { error: unknown } = { error: null };
const from = vi.fn(() => queryStub(rowResult));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const FACILITY = "5b0c1d2e-0000-4000-8000-0000000000f1";
const post = (body: unknown) =>
  new Request("https://local.test/api/delete-facility-photos", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/delete-facility-photos", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    removeFolder.mockResolvedValue(true);
    rowResult = { error: null };
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("관리자가 아니면 그 응답을 그대로 돌려주고 지우지 않는다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "인증 필요" }, { status: 401 }),
    });
    const { POST } = await import("./route");
    expect((await POST(post({ facilityId: FACILITY }))).status).toBe(401);
    expect(removeFolder).not.toHaveBeenCalled();
  });

  it("시설 폴더를 통째로 지운 뒤 그 시설의 사진 행을 지운다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ facilityId: FACILITY }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(removeFolder).toHaveBeenCalledWith("facility-photos", FACILITY);
    const query = from.mock.results[0].value as {
      calls: { method: string; args: unknown[] }[];
    };
    expect(from).toHaveBeenCalledWith("facility_photos");
    expect(query.calls).toContainEqual({ method: "delete", args: [] });
    expect(query.calls).toContainEqual({
      method: "eq",
      args: ["facility_id", FACILITY],
    });
  });

  it("폴더를 지우지 못하면 행을 남기고 500", async () => {
    removeFolder.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(post({ facilityId: FACILITY }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "사진 파일을 지우지 못했어요",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("행 삭제가 실패하면 로그를 남기고 500", async () => {
    rowResult = { error: { message: "boom" } };
    const { POST } = await import("./route");
    const response = await POST(post({ facilityId: FACILITY }));
    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
  });

  it("시설 id가 없으면 400, 형식이 틀리면 지우기 전에 404", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({}))).status).toBe(400);
    expect((await POST(post({ facilityId: "../x" }))).status).toBe(404);
    expect(removeFolder).not.toHaveBeenCalled();
  });
});
