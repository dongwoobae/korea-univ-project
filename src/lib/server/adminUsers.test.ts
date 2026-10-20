import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

let result: unknown;
const from = vi.fn(() => queryStub(result));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

describe("adminUsers", () => {
  beforeEach(() => {
    from.mockClear();
  });

  it("목록에 있으면 표시 이름을 돌려준다", async () => {
    result = { data: { display_name: "관리자" }, error: null };
    const { findListedAdmin } = await import("./adminUsers");
    expect(await findListedAdmin("u1")).toEqual({ displayName: "관리자" });
    expect(from).toHaveBeenCalledWith("admin_users");
  });

  it("목록에 없으면 null", async () => {
    result = { data: null, error: null };
    const { findListedAdmin } = await import("./adminUsers");
    expect(await findListedAdmin("u2")).toBeNull();
  });

  it("조회가 실패하면 던진다", async () => {
    result = { data: null, error: { message: "db down" } };
    const { findListedAdmin } = await import("./adminUsers");
    await expect(findListedAdmin("u1")).rejects.toEqual({ message: "db down" });
  });
});
