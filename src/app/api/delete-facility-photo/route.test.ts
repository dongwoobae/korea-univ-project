import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const removeObject = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({ removeObject }));

const PHOTO_ID = "22222222-2222-4222-8222-222222222222";
let lookup: unknown;
let deletion: unknown;
// 첫 호출은 조회, 두 번째는 행 삭제.
const from = vi.fn(() =>
  queryStub(from.mock.calls.length === 1 ? lookup : deletion),
);
const queryAt = (index: number) =>
  from.mock.results[index].value as {
    calls: { method: string; args: unknown[] }[];
  };
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const post = (photoId: unknown = PHOTO_ID) =>
  new Request("https://local.test/api/delete-facility-photo", {
    method: "POST",
    body: JSON.stringify({ photoId }),
  });

describe("POST /api/delete-facility-photo", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    lookup = { data: { id: PHOTO_ID, storage_path: "f1/x.webp" }, error: null };
    deletion = { error: null };
    removeObject.mockResolvedValue(true);
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("파일을 먼저 지우고 행을 지운다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(removeObject).toHaveBeenCalledWith("facility-photos", "f1/x.webp");
    expect(from).toHaveBeenCalledTimes(2);
    expect(queryAt(0).calls).toContainEqual({
      method: "eq",
      args: ["id", PHOTO_ID],
    });
    expect(queryAt(1).calls.map((call) => call.method)).toEqual([
      "delete",
      "eq",
    ]);
    expect(queryAt(1).calls[1].args).toEqual(["id", PHOTO_ID]);
  });

  it("파일 삭제가 실패하면 행을 남기고 500", async () => {
    removeObject.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(post());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "사진 파일을 지우지 못했어요",
    });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("없는 사진은 404", async () => {
    lookup = { data: null, error: null };
    const { POST } = await import("./route");
    const response = await POST(post());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "사진이 없어요" });
    expect(removeObject).not.toHaveBeenCalled();
  });

  it("조회가 실패하면 404가 아니라 500, 파일을 지우지 않는다", async () => {
    lookup = { data: null, error: { message: "down" } };
    const { POST } = await import("./route");
    const response = await POST(post());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "사진 정보를 불러오지 못했어요",
    });
    expect(removeObject).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("행 삭제가 실패하면 500", async () => {
    deletion = { error: { message: "denied" } };
    const { POST } = await import("./route");
    const response = await POST(post());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "사진 정보를 지우지 못했어요",
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("uuid가 아닌 사진 ID는 조회 없이 404", async () => {
    const { POST } = await import("./route");
    const response = await POST(post("fp1"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "사진이 없어요" });
    expect(from).not.toHaveBeenCalled();
    expect(removeObject).not.toHaveBeenCalled();
  });

  it("사진 ID가 없으면 400", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(null));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "사진 ID 누락" });
    expect(from).not.toHaveBeenCalled();
  });
});
