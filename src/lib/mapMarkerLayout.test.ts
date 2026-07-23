import { describe, expect, it } from "vitest";
import { groupByPixelGrid } from "./mapMarkerLayout";

describe("groupByPixelGrid", () => {
  const project = (item: { x: number; y: number }) => item;

  it("같은 화면 격자의 항목을 하나로 묶는다", () => {
    const groups = groupByPixelGrid(
      [
        { id: "a", x: 10, y: 20 },
        { id: "b", x: 30, y: 40 },
        { id: "c", x: 120, y: 20 },
      ],
      project,
      52,
    );

    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("빈 입력은 빈 그룹을 반환한다", () => {
    expect(groupByPixelGrid([], project)).toEqual([]);
  });
});
