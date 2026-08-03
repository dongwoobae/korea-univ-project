import { beforeEach, describe, expect, it, vi } from "vitest";

const not = vi.fn();
const eq = vi.fn(() => ({ not }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));

const polygon = {
  type: "Feature",
  geometry: { type: "Polygon", coordinates: [[[127.03, 37.58]]] },
  properties: {},
};

describe("fetchNeighborBuildings", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    not.mockResolvedValue({
      data: [
        { id: 1, name: "중앙도서관", geojson: polygon },
        { id: 2, name: "폴리곤 없음", geojson: null },
        { id: 3, name: "geometry 없음", geojson: { type: "Feature" } },
      ],
      error: null,
    });
  });

  it("geometry가 있는 행만 남기고 properties에 bid와 name을 넣는다", async () => {
    const { fetchNeighborBuildings } = await import("./neighborBuildings");

    const features = await fetchNeighborBuildings();

    expect(features).toHaveLength(1);
    expect(features[0].properties).toMatchObject({
      bid: 1,
      name: "중앙도서관",
    });
    expect(from).toHaveBeenCalledWith("buildings");
    expect(select).toHaveBeenCalledWith("id, name, geojson");
    expect(eq).toHaveBeenCalledWith("is_deleted", false);
    expect(not).toHaveBeenCalledWith("geojson", "is", null);
  });

  it("두 번 호출해도 조회는 한 번만 나간다", async () => {
    const { fetchNeighborBuildings } = await import("./neighborBuildings");

    await fetchNeighborBuildings();
    await fetchNeighborBuildings();

    expect(from).toHaveBeenCalledTimes(1);
  });

  it("동시에 호출하면 진행 중인 Promise를 공유한다", async () => {
    const { fetchNeighborBuildings } = await import("./neighborBuildings");

    const [first, second] = await Promise.all([
      fetchNeighborBuildings(),
      fetchNeighborBuildings(),
    ]);

    expect(from).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("무효화하면 다음 호출이 다시 조회한다", async () => {
    const { fetchNeighborBuildings, invalidateNeighborBuildings } =
      await import("./neighborBuildings");

    await fetchNeighborBuildings();
    invalidateNeighborBuildings();
    await fetchNeighborBuildings();

    expect(from).toHaveBeenCalledTimes(2);
  });

  it("조회에 실패하면 캐시를 비워 다음 호출이 재시도한다", async () => {
    not.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { fetchNeighborBuildings } = await import("./neighborBuildings");

    await expect(fetchNeighborBuildings()).rejects.toBeTruthy();
    await expect(fetchNeighborBuildings()).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledTimes(2);
  });
});
