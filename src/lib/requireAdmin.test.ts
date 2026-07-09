import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const createClient = vi.fn(() => ({ auth: { getUser } }));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

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

  it("returns the user for a valid access token", async () => {
    const user = { id: "admin-user" };
    getUser.mockResolvedValueOnce({ data: { user }, error: null });
    const { requireAdmin } = await loadRequireAdmin();

    const result = await requireAdmin(
      new Request("https://local.test/api", {
        headers: { authorization: "Bearer valid-token" },
      }),
    );

    expect(result).toEqual({ user });
  });
});
