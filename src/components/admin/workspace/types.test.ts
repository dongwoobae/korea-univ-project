import { describe, expect, it } from "vitest";
import {
  MOBILE_LIST_TOP,
  MOBILE_PICK_BAR,
  MOBILE_SHEET_COLLAPSED,
  workspaceInsets,
} from "./types";

const base = {
  mobile: false,
  narrow: false,
  detailOpen: true,
  height: 700,
  mapStrip: 190,
  picking: false,
};

describe("workspaceInsets", () => {
  it("모바일 상세는 위쪽 바와 지도 띠만 남긴다", () => {
    expect(workspaceInsets({ ...base, mobile: true })).toEqual({
      top: 52,
      right: 0,
      bottom: 700 - 52 - 190,
      left: 0,
    });
  });

  it("지도 띠가 없는 모바일 상세는 목록으로 돌아와도 보이게 목록 상태의 여백으로 모은다", () => {
    expect(workspaceInsets({ ...base, mobile: true, mapStrip: 0 })).toEqual({
      top: MOBILE_LIST_TOP,
      right: 0,
      bottom: MOBILE_SHEET_COLLAPSED,
      left: 0,
    });
  });

  it("모바일에서 위치를 고르는 동안은 확인 바만 비키고 지도 전체를 쓴다", () => {
    for (const mapStrip of [0, 190]) {
      expect(
        workspaceInsets({ ...base, mobile: true, mapStrip, picking: true }),
      ).toEqual({ top: 12, right: 0, bottom: MOBILE_PICK_BAR, left: 0 });
    }
  });

  it("고르는 동안 지도 위쪽을 덮는 막대가 있으면 그 아래부터 쓴다", () => {
    expect(
      workspaceInsets({
        ...base,
        mobile: true,
        mapStrip: 230,
        picking: true,
        pickingTop: 110,
      }),
    ).toEqual({ top: 110 + 12, right: 0, bottom: MOBILE_PICK_BAR, left: 0 });
  });

  it("데스크톱은 위치 고르기와 상관없이 목록과 상세 패널을 비킨다", () => {
    const expected = { top: 16, right: 16 + 460 + 16, bottom: 16, left: 436 };
    expect(workspaceInsets(base)).toEqual(expected);
    expect(workspaceInsets({ ...base, picking: true })).toEqual(expected);
  });

  it("좁은 화면에서 상세를 열면 숨은 목록 자리를 비우지 않는다", () => {
    expect(workspaceInsets({ ...base, narrow: true }).left).toBe(16);
    expect(
      workspaceInsets({ ...base, narrow: true, detailOpen: false }).left,
    ).toBe(436);
  });
});
