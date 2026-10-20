import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const createClient = vi.fn(() => ({ auth: { getUser } }));

vi.mock("@supabase/supabase-js", () => ({ createClient }));
const findListedAdmin = vi.fn();
vi.mock("@/lib/server/adminUsers", () => ({ findListedAdmin }));
const logFailure = vi.fn();
vi.mock("@/lib/server/activityLog", () => ({ logFailure }));

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  async function loadRequireAdmin() {
    vi.resetModules();
    return import("./requireAdmin");
  }

  it("returns 401 when authorization header is missing", async () => {
    const { requireAdmin } = await loadRequireAdmin();

    const result = (await requireAdmin(
      new Request("https://local.test/api"),
    )) as {
      response: Response;
    };

    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({
      error: "인증 필요",
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when getUser rejects the token", async () => {
    getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("expired"),
    });
    const { requireAdmin } = await loadRequireAdmin();

    const result = (await requireAdmin(
      new Request("https://local.test/api", {
        headers: { authorization: "Bearer expired-token" },
      }),
    )) as { response: Response };

    expect(result.response.status).toBe(401);
    expect(getUser).toHaveBeenCalledWith("expired-token");
  });

  it("returns 401 when anon or service role keys are used as bearer tokens", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { requireAdmin } = await loadRequireAdmin();

    const anonResult = (await requireAdmin(
      new Request("https://local.test/api", {
        headers: { authorization: "Bearer anon-key" },
      }),
    )) as { response: Response };
    const serviceRoleResult = (await requireAdmin(
      new Request("https://local.test/api", {
        headers: { authorization: "Bearer service-role-key" },
      }),
    )) as { response: Response };

    expect(anonResult.response.status).toBe(401);
    expect(serviceRoleResult.response.status).toBe(401);
  });

  it("returns the user and display name when the account is listed", async () => {
    const user = { id: "admin-user" };
    getUser.mockResolvedValueOnce({ data: { user }, error: null });
    findListedAdmin.mockResolvedValueOnce({ displayName: "관리자" });
    const { requireAdmin } = await loadRequireAdmin();

    const result = await requireAdmin(
      new Request("https://local.test/api", {
        headers: { authorization: "Bearer valid-token" },
      }),
    );

    expect(result).toEqual({ user, admin: { displayName: "관리자" } });
    expect(findListedAdmin).toHaveBeenCalledWith("admin-user");
    expect(logFailure).not.toHaveBeenCalled();
  });

  it("returns 403 and logs forbidden when the account is not listed", async () => {
    const user = { id: "stranger", email: "stranger@example.com" };
    getUser.mockResolvedValueOnce({ data: { user }, error: null });
    findListedAdmin.mockResolvedValueOnce(null);
    const { requireAdmin } = await loadRequireAdmin();

    const result = (await requireAdmin(
      new Request("https://local.test/api/upload-facility-photo", {
        headers: { authorization: "Bearer valid-token" },
      }),
    )) as { response: Response };

    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toEqual({
      error: "관리자 목록에 없는 계정이에요",
    });
    expect(logFailure).toHaveBeenCalledWith({
      route: "/api/upload-facility-photo",
      action: "admin.access",
      actor: { kind: "admin", user },
      reason: "forbidden",
      status: 403,
    });
  });

  it("returns 500 without logging forbidden when the list lookup fails", async () => {
    getUser.mockResolvedValueOnce({
      data: { user: { id: "admin-user" } },
      error: null,
    });
    findListedAdmin.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { requireAdmin } = await loadRequireAdmin();

    const result = (await requireAdmin(
      new Request("https://local.test/api", {
        headers: { authorization: "Bearer valid-token" },
      }),
    )) as { response: Response };

    expect(result.response.status).toBe(500);
    expect(logFailure).not.toHaveBeenCalled();
  });
});
