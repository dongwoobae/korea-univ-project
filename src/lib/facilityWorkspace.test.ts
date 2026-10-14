import { describe, expect, it } from "vitest";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  viewAdminCollection,
} from "./adminCollection";
import { EMPTY_FACILITY_FIELDS } from "./facilityFields";
import {
  FACILITY_COLLECTION_POLICY,
  facilityDisplayName,
  facilityFormDirty,
  facilityFormFromRow,
} from "./facilityWorkspace";
import type { FacilityWithType } from "@/types/domain";

function facility(overrides: Partial<FacilityWithType> = {}): FacilityWithType {
  return {
    id: "f1",
    building_id: null,
    facility_code: "ramp",
    name: "중앙 경사로",
    name_en: "Central ramp",
    name_zh: "中央坡道",
    description: null,
    description_en: null,
    description_zh: null,
    floor_info: null,
    floor_info_en: null,
    floor_info_zh: null,
    is_installed: true,
    lat: 37.59,
    lng: 127.03,
    translation_status: "translated",
    video_url: null,
    video_caption: null,
    video_caption_en: null,
    video_caption_zh: null,
    video_poster_url: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    facility_types: { code: "ramp", label: "경사로" },
    ...overrides,
  };
}

const chips = FACILITY_COLLECTION_POLICY.chips;

describe("독립 시설 칩", () => {
  it("미설치는 is_installed가 false일 때만이다", () => {
    expect(chips.missing(facility({ is_installed: false }))).toBe(true);
    expect(chips.missing(facility({ is_installed: true }))).toBe(false);
    expect(chips.missing(facility({ is_installed: null }))).toBe(false);
  });

  it("번역 필요는 facilityNeedsTranslation과 같다", () => {
    expect(chips.translation(facility({ translation_status: "failed" }))).toBe(
      true,
    );
    expect(chips.translation(facility({ name_en: null }))).toBe(true);
    expect(chips.translation(facility())).toBe(false);
  });

  it("동영상 없음은 video_url이 비어 있을 때다", () => {
    expect(chips["no-video"](facility({ video_url: null }))).toBe(true);
    expect(chips["no-video"](facility({ video_url: "  " }))).toBe(true);
    expect(
      chips["no-video"](facility({ video_url: "https://cdn.test/v.mp4" })),
    ).toBe(false);
  });

  it("칩 개수를 센다", () => {
    const rows = [
      facility({ id: "a", is_installed: false }),
      facility({ id: "b", translation_status: "failed" }),
      facility({ id: "c", video_url: "https://cdn.test/v.mp4" }),
    ];
    const view = viewAdminCollection(
      rows,
      FACILITY_COLLECTION_POLICY,
      INITIAL_ADMIN_COLLECTION_QUERY,
    );
    expect(view.chipCounts).toEqual({
      all: 3,
      missing: 1,
      translation: 1,
      "no-video": 2,
    });
  });

  it("영문·중문 이름과 설명에서도 찾는다", () => {
    const view = viewAdminCollection(
      [facility({ id: "a" }), facility({ id: "b", name_en: "North gate" })],
      FACILITY_COLLECTION_POLICY,
      { ...INITIAL_ADMIN_COLLECTION_QUERY, search: "north" },
    );
    expect(view.matched.map((row) => row.id)).toEqual(["b"]);

    const search = (text: string) =>
      viewAdminCollection(
        [
          facility({ id: "a" }),
          facility({ id: "b", name_zh: "北门" }),
          facility({ id: "c", description: "정문 옆 출입구" }),
        ],
        FACILITY_COLLECTION_POLICY,
        { ...INITIAL_ADMIN_COLLECTION_QUERY, search: text },
      ).matched.map((row) => row.id);
    expect(search("北门")).toEqual(["b"]);
    expect(search("출입구")).toEqual(["c"]);
  });
});

describe("facilityDisplayName", () => {
  it("이름, 유형 이름, 대체 문구 순이다", () => {
    expect(facilityDisplayName(facility())).toBe("중앙 경사로");
    expect(facilityDisplayName(facility({ name: null }))).toBe("경사로");
    expect(
      facilityDisplayName(facility({ name: null, facility_types: null })),
    ).toBe("이름 없는 시설");
  });
});

describe("facilityFormFromRow", () => {
  it("새로 만들기는 빈 값이다", () => {
    expect(facilityFormFromRow(null)).toEqual(EMPTY_FACILITY_FIELDS);
  });

  it("행을 폼 문자열로 옮긴다", () => {
    expect(facilityFormFromRow(facility({ description: "정문" }))).toEqual({
      facility_code: "ramp",
      name: "중앙 경사로",
      description: "정문",
      floor_info: "",
      is_installed: true,
      lat: "37.59",
      lng: "127.03",
    });
  });
});

describe("facilityFormDirty", () => {
  it("처음 값이면 dirty가 아니다", () => {
    const row = facility();
    expect(facilityFormDirty(facilityFormFromRow(row), row)).toBe(false);
  });

  it("좌표는 숫자로 비교한다 — 지도 클릭의 toFixed(7)과 저장값이 같으면 dirty가 아니다", () => {
    const row = facility({ lat: 37.59, lng: 127.03 });
    expect(
      facilityFormDirty(
        { ...facilityFormFromRow(row), lat: "37.5900000", lng: "127.0300000" },
        row,
      ),
    ).toBe(false);
    expect(
      facilityFormDirty({ ...facilityFormFromRow(row), lat: "37.5901" }, row),
    ).toBe(true);
  });

  it("이름·설명·유형을 고치면 dirty다", () => {
    const row = facility();
    const form = facilityFormFromRow(row);
    expect(facilityFormDirty({ ...form, name: "고친 이름" }, row)).toBe(true);
    expect(facilityFormDirty({ ...form, description: "설명" }, row)).toBe(true);
    expect(facilityFormDirty({ ...form, facility_code: "parking" }, row)).toBe(
      true,
    );
  });

  it("기존 시설의 설치 상태는 바로 저장하므로 초안 비교에서 뺀다", () => {
    const row = facility({ is_installed: false });
    expect(
      facilityFormDirty(
        { ...facilityFormFromRow(row), is_installed: true },
        row,
      ),
    ).toBe(false);
  });

  it("새로 만들기는 빈 값과 다르면 dirty다", () => {
    expect(facilityFormDirty(EMPTY_FACILITY_FIELDS, null)).toBe(false);
    expect(
      facilityFormDirty(
        { ...EMPTY_FACILITY_FIELDS, facility_code: "ramp" },
        null,
      ),
    ).toBe(true);
    expect(
      facilityFormDirty(
        { ...EMPTY_FACILITY_FIELDS, is_installed: false },
        null,
      ),
    ).toBe(true);
  });
});
