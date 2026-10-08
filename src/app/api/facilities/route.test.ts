import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const from = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from }),
}));

const facility = (id: string, buildings: unknown) => ({
  id,
  is_installed: true,
  lat: 37.5,
  lng: 127.0,
  buildings,
});

describe("GET /api/facilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("소프트 삭제된 건물의 시설은 빼고 독립 시설은 남긴다", async () => {
    from.mockReturnValue(
      queryStub({
        data: [
          facility("alive", { name: "중앙도서관", is_deleted: false }),
          facility("legacy", { name: "아산이학관", is_deleted: null }),
          facility("deleted", { name: "철거동", is_deleted: true }),
          facility("standalone", null),
        ],
        error: null,
      }),
    );
    const { GET } = await import("./route");
    const body = (await (await GET()).json()) as { id: string }[];
    expect(body.map((row) => row.id)).toEqual([
      "alive",
      "legacy",
      "standalone",
    ]);
  });

  it("조회가 실패하면 500이다", async () => {
    from.mockReturnValue(queryStub({ data: null, error: { message: "boom" } }));
    const { GET } = await import("./route");
    expect((await GET()).status).toBe(500);
  });
});
