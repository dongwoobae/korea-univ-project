import { describe, expect, it } from "vitest";
import {
  fieldsFromRequest,
  initialPhotoSelection,
  isReviewDraftDirty,
  requestLocationNote,
} from "./facilityRequestReview";
import type { FacilityRequestDetail } from "./inboxStatus";

function detail(
  patch: Partial<FacilityRequestDetail> = {},
): FacilityRequestDetail {
  return {
    id: "r1",
    building_id: 3,
    facility_code: "ramp",
    name: "정문 경사로",
    description: "설명",
    floor_info: "1층",
    lat: 37.5,
    lng: 127.0,
    status: "new",
    created_at: "2026-10-01T00:00:00Z",
    reviewed_at: null,
    facility_id: null,
    building: null,
    photos: [
      { id: "p1", sort_order: 0, url: "https://x/1" },
      { id: "p2", sort_order: 1, url: null },
      { id: "p3", sort_order: 2, url: "https://x/3" },
    ],
    ...patch,
  };
}

describe("fieldsFromRequest", () => {
  it("요청 값을 필드로 옮긴다", () => {
    expect(fieldsFromRequest(detail())).toEqual({
      facility_code: "ramp",
      name: "정문 경사로",
      description: "설명",
      floor_info: "1층",
      is_installed: true,
      lat: "37.5",
      lng: "127",
    });
  });

  it("비어 있는 값은 빈 문자열이다", () => {
    const fields = fieldsFromRequest(
      detail({
        name: null,
        description: null,
        floor_info: null,
        lat: null,
        lng: null,
      }),
    );
    expect(fields).toMatchObject({
      name: "",
      description: "",
      floor_info: "",
      lat: "",
      lng: "",
    });
  });
});

describe("initialPhotoSelection", () => {
  it("서명 주소가 있는 사진만 고른다", () => {
    expect([...initialPhotoSelection(detail())]).toEqual(["p1", "p3"]);
  });
});

describe("isReviewDraftDirty", () => {
  const base = detail();
  const fields = fieldsFromRequest(base);
  const selection = initialPhotoSelection(base);

  it("처음 값이면 false다", () => {
    expect(isReviewDraftDirty(base, fields, selection)).toBe(false);
  });

  it("필드 하나만 달라도 true다", () => {
    expect(
      isReviewDraftDirty(base, { ...fields, name: "다름" }, selection),
    ).toBe(true);
    expect(
      isReviewDraftDirty(base, { ...fields, is_installed: false }, selection),
    ).toBe(true);
    expect(isReviewDraftDirty(base, { ...fields, lat: "1" }, selection)).toBe(
      true,
    );
  });

  it("사진 선택이 달라지면 true다", () => {
    expect(isReviewDraftDirty(base, fields, new Set(["p1"]))).toBe(true);
    expect(
      isReviewDraftDirty(base, fields, new Set(["p1", "p3", "p2"])),
    ).toBe(true);
  });

  it("끝 상태면 항상 false다", () => {
    for (const status of ["approved", "rejected"] as const) {
      expect(
        isReviewDraftDirty(
          detail({ status }),
          { ...fields, name: "다름" },
          new Set(),
        ),
      ).toBe(false);
    }
  });
});

describe("requestLocationNote", () => {
  const base = detail();

  it("요청 위치 그대로면 reporter다", () => {
    expect(requestLocationNote(base, fieldsFromRequest(base))).toBe(
      "reporter",
    );
  });

  it("관리자가 옮겼으면 picked다", () => {
    expect(
      requestLocationNote(base, {
        ...fieldsFromRequest(base),
        lat: "37.6",
        lng: "127.1",
      }),
    ).toBe("picked");
  });

  it("요청에 위치가 없었는데 찍었으면 picked다", () => {
    const none = detail({ lat: null, lng: null });
    expect(
      requestLocationNote(none, {
        ...fieldsFromRequest(none),
        lat: "1",
        lng: "2",
      }),
    ).toBe("picked");
  });

  it("필드에 위치가 없으면 none이다", () => {
    const none = detail({ lat: null, lng: null });
    expect(requestLocationNote(none, fieldsFromRequest(none))).toBe("none");
    expect(
      requestLocationNote(base, {
        ...fieldsFromRequest(base),
        lat: "",
        lng: "",
      }),
    ).toBe("none");
  });
});
