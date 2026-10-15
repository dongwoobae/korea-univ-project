import { afterEach, describe, expect, it, vi } from "vitest";

// 요약이 경계 없는 경로를 받지 않는 근거는 readRoutePoints가 두 점 미만을 거른다는 다른 파일의 불변식이다.
// 그 불변식이 깨져 빈 점 배열이 통과해도 요약이 형식 오류로 막는지 보려고 readRoutePoints만 바꿔 끼운다.
const override = vi.hoisted(() => ({ points: undefined as unknown }));

vi.mock("@/lib/slopeRoute", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/slopeRoute")>();
  return {
    ...actual,
    readRoutePoints: (raw: unknown) =>
      override.points === undefined
        ? actual.readRoutePoints(raw)
        : override.points,
  };
});

const { summarizeSlopeRoute } = await import("./slopeWorkspace");

afterEach(() => {
  override.points = undefined;
});

describe("summarizeSlopeRoute — 경계", () => {
  it("읽은 점이 없어 경계를 만들 수 없으면 형식 오류(null)다", () => {
    override.points = [];
    expect(summarizeSlopeRoute([])).toBeNull();
  });
});
