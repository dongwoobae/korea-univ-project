import type { Tooltip } from "leaflet";
import { describe, expect, it, vi } from "vitest";
import {
  LABEL_HOVERED_CLASS,
  LABEL_SELECTED_CLASS,
  detailPadding,
  labelRevealOffset,
  labelRevealOffsetX,
  mobileSheetHeight,
  setBuildingLabelEmphasis,
} from "./buildingLabel";

// vitest는 DOM 없이 돈다. 이름표 요소는 classList만 흉내 낸다
function fakeTooltip() {
  const classes = new Set<string>();
  const element = {
    classList: {
      contains: (name: string) => classes.has(name),
      toggle: (name: string, force: boolean) => {
        if (force) classes.add(name);
        else classes.delete(name);
        return force;
      },
    },
  };
  const update = vi.fn();
  const tooltip = { getElement: () => element, update } as unknown as Tooltip;
  return { tooltip, classes, update };
}

describe("setBuildingLabelEmphasis", () => {
  it("올림·선택을 클래스로 달고, 바뀔 때만 자리를 다시 잡는다", () => {
    const { tooltip, classes, update } = fakeTooltip();
    setBuildingLabelEmphasis(tooltip, { hovered: true, selected: false });
    expect([...classes]).toEqual([LABEL_HOVERED_CLASS]);
    expect(update).toHaveBeenCalledTimes(1);

    setBuildingLabelEmphasis(tooltip, { hovered: true, selected: false });
    expect(update).toHaveBeenCalledTimes(1);

    setBuildingLabelEmphasis(tooltip, { hovered: true, selected: true });
    expect(classes).toEqual(
      new Set([LABEL_HOVERED_CLASS, LABEL_SELECTED_CLASS]),
    );
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("하나를 떼도 다른 하나는 남는다", () => {
    const { tooltip, classes } = fakeTooltip();
    setBuildingLabelEmphasis(tooltip, { hovered: true, selected: true });
    setBuildingLabelEmphasis(tooltip, { hovered: false, selected: true });
    expect([...classes]).toEqual([LABEL_SELECTED_CLASS]);
  });

  it("이름표가 없거나 아직 열리지 않았으면 아무것도 하지 않는다", () => {
    expect(() =>
      setBuildingLabelEmphasis(undefined, { hovered: true, selected: true }),
    ).not.toThrow();
    const update = vi.fn();
    const closed = {
      getElement: () => undefined,
      update,
    } as unknown as Tooltip;
    setBuildingLabelEmphasis(closed, { hovered: true, selected: true });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("모바일 시트 위로 옮기기", () => {
  it("시트 높이는 창 높이의 62%이고 620px을 넘지 않는다", () => {
    expect(mobileSheetHeight(844)).toBeCloseTo(523.28);
    expect(mobileSheetHeight(1200)).toBe(620);
  });

  // 지도 844px, 시트 524px → 보이는 영역 0~320px, 가운데 160px. 이름표 높이 16px, 여백 12px
  const base = { labelHeight: 16, mapHeight: 844, sheetHeight: 524 };

  it("이름표가 보이는 영역 안이면 옮기지 않는다", () => {
    expect(labelRevealOffset({ ...base, labelCenterY: 160 })).toBe(0);
    // 아래 끝 308 = 320 - 12
    expect(labelRevealOffset({ ...base, labelCenterY: 300 })).toBe(0);
    // 위 끝 12
    expect(labelRevealOffset({ ...base, labelCenterY: 20 })).toBe(0);
  });

  it("시트에 가리면 보이는 영역 가운데로 오게 지도를 내린다", () => {
    expect(labelRevealOffset({ ...base, labelCenterY: 422 })).toBe(262);
    expect(labelRevealOffset({ ...base, labelCenterY: 302 })).toBe(142);
  });

  it("화면 위로 벗어나도 가운데로 옮긴다", () => {
    expect(labelRevealOffset({ ...base, labelCenterY: 10 })).toBe(-150);
  });
});

describe("상세가 덮을 자리", () => {
  it("세로는 아래 시트 높이만큼 준다", () => {
    expect(detailPadding("portrait", { width: 390, height: 844 })).toEqual([
      0,
      mobileSheetHeight(844),
    ]);
  });

  it("가로 좁은 화면은 옆 패널 폭만큼 주고 절반을 넘지 않는다", () => {
    expect(detailPadding("landscape", { width: 740, height: 360 })).toEqual([
      360, 0,
    ]);
    expect(detailPadding("landscape", { width: 600, height: 320 })).toEqual([
      300, 0,
    ]);
  });

  it("웹은 상세 패널 폭 340px이다", () => {
    expect(detailPadding("web", { width: 1280, height: 800 })).toEqual([
      340, 0,
    ]);
  });
});

describe("옆 패널 옆으로 옮기기", () => {
  // 지도 740px, 패널 360px → 보이는 영역 0~380px, 가운데 190px. 이름표 너비 60px, 여백 12px
  const base = { labelWidth: 60, mapWidth: 740, panelWidth: 360 };

  it("이름표가 보이는 영역 안이면 옮기지 않는다", () => {
    expect(labelRevealOffsetX({ ...base, labelCenterX: 190 })).toBe(0);
    // 오른쪽 끝 368 = 380 - 12 → 중심 338
    expect(labelRevealOffsetX({ ...base, labelCenterX: 338 })).toBe(0);
    // 왼쪽 끝 12 → 중심 42
    expect(labelRevealOffsetX({ ...base, labelCenterX: 42 })).toBe(0);
  });

  it("패널에 가리면 보이는 영역 가운데로 오게 지도를 왼쪽으로 옮긴다", () => {
    expect(labelRevealOffsetX({ ...base, labelCenterX: 500 })).toBe(310);
    expect(labelRevealOffsetX({ ...base, labelCenterX: 339 })).toBe(149);
  });

  it("화면 왼쪽으로 벗어나도 가운데로 옮긴다", () => {
    expect(labelRevealOffsetX({ ...base, labelCenterX: 20 })).toBe(-170);
  });
});
