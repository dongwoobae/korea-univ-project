import { describe, expect, it } from "vitest";
import {
  draftsFromSlopes,
  redraftForUnit,
  resizeToSegments,
  slopeDraftDirty,
  type SlopeDraftValues,
} from "./slopeDraft";

const initial: SlopeDraftValues = {
  name: "정문 경사로",
  vertices: [
    { lat: 37.58, lng: 127.02 },
    { lat: 37.581, lng: 127.021 },
  ],
  slopes: [7.2],
};

describe("slopeDraftDirty", () => {
  it("이름 앞뒤 공백만 바뀐 것은 아니다", () => {
    expect(
      slopeDraftDirty({ ...initial, name: "  정문 경사로 " }, initial),
    ).toBe(false);
  });

  it("값이 같은 새 꼭짓점 배열은 아니다", () => {
    expect(
      slopeDraftDirty(
        { ...initial, vertices: initial.vertices.map((v) => ({ ...v })) },
        initial,
      ),
    ).toBe(false);
  });

  it("꼭짓점 좌표 하나가 바뀌면 맞다", () => {
    expect(
      slopeDraftDirty(
        {
          ...initial,
          vertices: [initial.vertices[0], { lat: 37.581, lng: 127.0211 }],
        },
        initial,
      ),
    ).toBe(true);
  });

  it("경사 하나가 바뀌면 맞다", () => {
    expect(slopeDraftDirty({ ...initial, slopes: [7.3] }, initial)).toBe(true);
  });

  it("새 경로에 이름만 넣어도 맞다", () => {
    const blank: SlopeDraftValues = { name: "", vertices: [], slopes: [] };
    expect(slopeDraftDirty(blank, blank)).toBe(false);
    expect(slopeDraftDirty({ ...blank, name: "새 길" }, blank)).toBe(true);
  });
});

describe("resizeToSegments", () => {
  it("구간 수가 같으면 같은 참조다", () => {
    const prev = [1, 2];
    expect(resizeToSegments(prev, 3, 0)).toBe(prev);
  });

  it("다르면 empty로 채운 새 배열이다", () => {
    const prev = [1, 2];
    expect(resizeToSegments(prev, 4, 0)).toEqual([0, 0, 0]);
    expect(resizeToSegments(prev, 0, 0)).toEqual([]);
    expect(resizeToSegments<number | null>([], 1, null)).toEqual([]);
  });
});

describe("draftsFromSlopes", () => {
  it("값은 단위 문자열로, null은 빈 문자열로", () => {
    expect(draftsFromSlopes([7.2, null], "deg")).toEqual(["7.2", ""]);
    expect(draftsFromSlopes([7.2, null], "percent")).toEqual(["12.63", ""]);
  });
});

describe("redraftForUnit", () => {
  it("범위 안 값은 새 단위 문자열로 다시 쓴다", () => {
    expect(redraftForUnit([7.2], ["7.2"], "percent")).toEqual(["12.63"]);
  });

  it("null과 범위 밖 값은 이전 문자열을 그대로 둔다", () => {
    expect(redraftForUnit([null, 181], ["", "181"], "percent")).toEqual([
      "",
      "181",
    ]);
  });
});
