import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn(() => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

async function load() {
  vi.resetModules();
  return import("./supabaseAdmin");
}

describe("supabaseAdmin", () => {
  beforeEach(() => {
    createClient.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  });

  it("actor가 없으면 헤더 없이 한 번만 만든다", async () => {
    const { supabaseAdmin } = await load();
    expect(supabaseAdmin()).toBe(supabaseAdmin());
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith("https://db.test", "service-key");
  });

  it("관리자 actor는 x-actor-id를 싣는다", async () => {
    const { supabaseAdmin } = await load();
    supabaseAdmin({ userId: "user-1" });
    expect(createClient).toHaveBeenCalledWith(
      "https://db.test",
      "service-key",
      { global: { headers: { "x-actor-id": "user-1" } } },
    );
  });

  it("시스템 actor는 x-actor-system을 싣는다", async () => {
    const { supabaseAdmin } = await load();
    supabaseAdmin({ system: "translation" });
    expect(createClient).toHaveBeenCalledWith(
      "https://db.test",
      "service-key",
      { global: { headers: { "x-actor-system": "translation" } } },
    );
  });

  it("actor가 있는 클라이언트는 요청마다 새로 만든다", async () => {
    const { supabaseAdmin } = await load();
    supabaseAdmin({ userId: "user-1" });
    supabaseAdmin({ userId: "user-2" });
    supabaseAdmin();
    supabaseAdmin();
    expect(createClient).toHaveBeenCalledTimes(3);
  });
});
