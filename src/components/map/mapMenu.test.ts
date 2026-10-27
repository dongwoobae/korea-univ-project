import { describe, expect, it, vi } from "vitest";
import {
  activeFilterCount,
  menuLayout,
  readMenuCollapsed,
  visibleArea,
  writeMenuCollapsed,
} from "./mapMenu";

function fakeStorage(value: string | null) {
  return { getItem: vi.fn(() => value), setItem: vi.fn() };
}

const throwing = () => {
  throw new Error("SecurityError");
};

describe("접힘 저장 값", () => {
  it('"true"만 접힘이고 그 밖은 펼침이다', () => {
    expect(readMenuCollapsed(() => fakeStorage("true"))).toBe(true);
    for (const value of ["false", "yes", "", null])
      expect(readMenuCollapsed(() => fakeStorage(value))).toBe(false);
  });

  it("저장소에 닿지 못하거나 읽다가 던지면 펼침이다", () => {
    expect(readMenuCollapsed(throwing)).toBe(false);
    expect(readMenuCollapsed(() => ({ getItem: throwing }))).toBe(false);
  });

  it("문자열로 저장하고, 저장하다 던져도 삼킨다", () => {
    const storage = fakeStorage(null);
    writeMenuCollapsed(() => storage, true);
    expect(storage.setItem).toHaveBeenCalledWith("ku_menu_collapsed", "true");
    writeMenuCollapsed(() => storage, false);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      "ku_menu_collapsed",
      "false",
    );
    expect(() => writeMenuCollapsed(throwing, true)).not.toThrow();
    expect(() =>
      writeMenuCollapsed(() => ({ setItem: throwing }), true),
    ).not.toThrow();
  });
});

describe("화면 모드", () => {
  it("모바일은 저장 값과 상관없이 아래 줄이다", () => {
    expect(menuLayout(true, false)).toBe("bar");
    expect(menuLayout(true, true)).toBe("bar");
  });

  it("웹은 접힘이면 줄, 아니면 펼침이다", () => {
    expect(menuLayout(false, true)).toBe("rail");
    expect(menuLayout(false, false)).toBe("expanded");
  });
});

describe("필터 수", () => {
  const initial = {
    activeCampuses: {
      인문사회계: false,
      자연계: false,
      녹지캠퍼스: false,
      의료원: false,
    },
    activeTypes: { ramp: false, elevator: false },
    showSlope: false,
    showLandmarks: true,
  };

  it("첫 로드는 0이고 명소를 끄면 1이다", () => {
    expect(activeFilterCount(initial)).toBe(0);
    expect(activeFilterCount({ ...initial, showLandmarks: false })).toBe(1);
  });

  it("캠퍼스·시설·경사도를 모두 더한다", () => {
    expect(
      activeFilterCount({
        activeCampuses: {
          ...initial.activeCampuses,
          자연계: true,
          의료원: true,
        },
        activeTypes: { ramp: true, elevator: false },
        showSlope: true,
        showLandmarks: true,
      }),
    ).toBe(4);
  });
});

describe("모바일 검색이 들 세로 범위", () => {
  it("키보드가 없으면 아래 줄 위까지다", () => {
    expect(
      visibleArea({ viewport: { offsetTop: 0, height: 844 }, barTop: 784 }),
    ).toEqual({ top: 0, bottom: 784 });
  });

  it("키보드가 보이는 영역을 줄이면 그 아래 경계까지다", () => {
    expect(
      visibleArea({ viewport: { offsetTop: 0, height: 420 }, barTop: 784 }),
    ).toEqual({ top: 0, bottom: 420 });
  });

  it("보이는 영역이 아래로 옮겨지면 위도 따라간다", () => {
    expect(
      visibleArea({ viewport: { offsetTop: 120, height: 420 }, barTop: 784 }),
    ).toEqual({ top: 120, bottom: 540 });
  });

  it("visualViewport가 없으면 화면 위에서 아래 줄 위까지다", () => {
    expect(visibleArea({ viewport: null, barTop: 784 })).toEqual({
      top: 0,
      bottom: 784,
    });
  });
});
