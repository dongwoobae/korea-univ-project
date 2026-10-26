import { describe, expect, it } from "vitest";
import {
  focusDirectionAfterMove,
  swapArgsFor,
  swapFailureAction,
  swapPhotos,
} from "@/lib/buildingPhotoOrder";

const photos = [
  { id: 11, sort_order: 0, caption: "정문" },
  { id: 12, sort_order: 1, caption: "로비" },
  { id: 13, sort_order: 2, caption: "야간" },
];

describe("swapArgsFor", () => {
  it("앞으로는 (왼쪽 사진, 누른 사진)을 화면 순서대로 준다", () => {
    expect(swapArgsFor(photos, 2, "earlier")).toEqual({
      p_first: 12,
      p_second: 13,
    });
  });

  it("뒤로는 (누른 사진, 오른쪽 사진)을 화면 순서대로 준다", () => {
    expect(swapArgsFor(photos, 0, "later")).toEqual({
      p_first: 11,
      p_second: 12,
    });
  });

  it("맨 앞의 앞으로, 맨 끝의 뒤로는 null이다", () => {
    expect(swapArgsFor(photos, 0, "earlier")).toBeNull();
    expect(swapArgsFor(photos, 2, "later")).toBeNull();
  });

  it("사진이 한 장이면 두 방향 모두 null이다", () => {
    expect(swapArgsFor([photos[0]], 0, "earlier")).toBeNull();
    expect(swapArgsFor([photos[0]], 0, "later")).toBeNull();
  });
});

describe("swapPhotos", () => {
  it("두 사진의 자리와 번호를 맞바꾸고 나머지는 그대로 둔다", () => {
    expect(swapPhotos(photos, 12, 13)).toEqual([
      { id: 11, sort_order: 0, caption: "정문" },
      { id: 13, sort_order: 1, caption: "야간" },
      { id: 12, sort_order: 2, caption: "로비" },
    ]);
  });

  it("같은 두 id로 한 번 더 부르면 제자리로 돌아온다", () => {
    expect(swapPhotos(swapPhotos(photos, 12, 13), 12, 13)).toEqual(photos);
  });

  it("그사이 바뀐 다른 칸은 되돌리지 않는다", () => {
    const swapped = swapPhotos(photos, 12, 13).map((photo) =>
      photo.id === 13 ? { ...photo, caption: "야간 입구" } : photo,
    );
    expect(swapPhotos(swapped, 12, 13)[2]).toEqual({
      id: 13,
      sort_order: 2,
      caption: "야간 입구",
    });
  });

  it("없는 id가 있으면 받은 배열을 그대로 돌려준다", () => {
    expect(swapPhotos(photos, 12, 99)).toBe(photos);
  });
});

describe("swapFailureAction", () => {
  it("이웃이 아님·사진 없음은 다시 불러온다", () => {
    expect(swapFailureAction("PT409")).toBe("reload");
    expect(swapFailureAction("P0002")).toBe("reload");
  });

  it("그 밖은 화면을 되돌린다", () => {
    for (const code of ["42501", "22023", "", undefined])
      expect(swapFailureAction(code)).toBe("revert");
  });
});

describe("focusDirectionAfterMove", () => {
  it("끝에 닿지 않으면 같은 방향이다", () => {
    expect(focusDirectionAfterMove(1, 3, "earlier")).toBe("earlier");
    expect(focusDirectionAfterMove(1, 3, "later")).toBe("later");
  });

  it("맨 앞에 닿으면 뒤로, 맨 끝에 닿으면 앞으로 간다", () => {
    expect(focusDirectionAfterMove(0, 3, "earlier")).toBe("later");
    expect(focusDirectionAfterMove(2, 3, "later")).toBe("earlier");
  });
});
