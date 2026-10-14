import { describe, expect, it } from "vitest";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  viewAdminCollection,
} from "./adminCollection";
import type { CampusBoundaryCollection } from "./campusGeometry";
import { LANDMARK_FALLBACK_EMOJI } from "./mapIcons";
import {
  LANDMARK_COLLECTION_POLICY,
  buildLandmarkPayload,
  landmarkCampusLabel,
  landmarkDisplayName,
  landmarkFormDirty,
  landmarkFormFromRow,
  landmarkNeedsTranslation,
  validateLandmarkForm,
} from "./landmarkWorkspace";
import type { Landmark } from "@/types/domain";

function landmark(overrides: Partial<Landmark> = {}): Landmark {
  return {
    id: "l1",
    name: "다람쥐길",
    name_en: "Squirrel Trail",
    name_zh: "松鼠路",
    description: null,
    description_en: null,
    description_zh: null,
    icon: "🐿️",
    image_url: null,
    lat: 37.59,
    lng: 127.03,
    photo_url: "https://cdn.test/l1.webp",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

const chips = LANDMARK_COLLECTION_POLICY.chips;

describe("landmarkNeedsTranslation", () => {
  it("원문이 있는 필드의 영문·중문이 다 차 있으면 필요 없다", () => {
    expect(landmarkNeedsTranslation(landmark())).toBe(false);
  });

  it("이름의 영문이나 중문이 비거나 공백이면 필요하다", () => {
    expect(landmarkNeedsTranslation(landmark({ name_en: null }))).toBe(true);
    expect(landmarkNeedsTranslation(landmark({ name_zh: "  " }))).toBe(true);
  });

  it("설명 원문이 비면 설명 번역은 보지 않는다", () => {
    expect(
      landmarkNeedsTranslation(
        landmark({ description: "  ", description_en: null }),
      ),
    ).toBe(false);
  });

  it("설명 원문이 있으면 설명 번역도 본다", () => {
    expect(
      landmarkNeedsTranslation(
        landmark({
          description: "쉬어가는 길",
          description_en: "A quiet trail",
          description_zh: null,
        }),
      ),
    ).toBe(true);
    expect(
      landmarkNeedsTranslation(
        landmark({
          description: "쉬어가는 길",
          description_en: "A quiet trail",
          description_zh: "安静的步道",
        }),
      ),
    ).toBe(false);
  });
});

describe("명소 칩", () => {
  it("사진 없음은 photo_url이 비어 있을 때다", () => {
    expect(chips["no-photo"](landmark({ photo_url: null }))).toBe(true);
    expect(chips["no-photo"](landmark({ photo_url: " " }))).toBe(true);
    expect(chips["no-photo"](landmark())).toBe(false);
  });

  it("번역 없음은 landmarkNeedsTranslation과 같다", () => {
    expect(chips.translation(landmark({ name_en: null }))).toBe(true);
    expect(chips.translation(landmark())).toBe(false);
  });

  it("칩 개수는 거르기와 상관없이 전체 행으로 센다", () => {
    const rows = [
      landmark({ id: "a", photo_url: null }),
      landmark({ id: "b", name_zh: null }),
      landmark({ id: "c", photo_url: null, name_en: null }),
      landmark({ id: "d" }),
    ];
    const view = viewAdminCollection(rows, LANDMARK_COLLECTION_POLICY, {
      ...INITIAL_ADMIN_COLLECTION_QUERY,
      chip: "no-photo",
      search: "없는 이름",
    });
    expect(view.matched).toEqual([]);
    expect(view.chipCounts).toEqual({
      all: 4,
      "no-photo": 2,
      translation: 2,
    });
  });

  it("영문·중문 이름과 설명에서도 찾는다", () => {
    const search = (text: string) =>
      viewAdminCollection(
        [
          landmark({ id: "a", name: "정문", name_en: "Main gate" }),
          landmark({ id: "b", name: "호상", name_zh: "虎像" }),
          landmark({ id: "c", name: "인촌", description: "동상 앞 광장" }),
        ],
        LANDMARK_COLLECTION_POLICY,
        { ...INITIAL_ADMIN_COLLECTION_QUERY, search: text },
      ).matched.map((row) => row.id);
    expect(search("main")).toEqual(["a"]);
    expect(search("虎像")).toEqual(["b"]);
    expect(search("광장")).toEqual(["c"]);
  });

  it("이름순과 수정순으로 정렬한다", () => {
    const rows = [
      landmark({ id: "a", name: "나", updated_at: "2026-07-02T00:00:00Z" }),
      landmark({ id: "b", name: "가", updated_at: "2026-07-03T00:00:00Z" }),
      landmark({ id: "c", name: "다", updated_at: "2026-07-01T00:00:00Z" }),
    ];
    const order = (sort: "updated-desc" | "updated-asc" | "name") =>
      viewAdminCollection(rows, LANDMARK_COLLECTION_POLICY, {
        ...INITIAL_ADMIN_COLLECTION_QUERY,
        sort,
      }).matched.map((row) => row.id);
    expect(order("updated-desc")).toEqual(["b", "a", "c"]);
    expect(order("updated-asc")).toEqual(["c", "a", "b"]);
    expect(order("name")).toEqual(["b", "a", "c"]);
  });
});

describe("landmarkDisplayName", () => {
  it("이름이 비면 대체 문구다", () => {
    expect(landmarkDisplayName(landmark())).toBe("다람쥐길");
    expect(landmarkDisplayName(landmark({ name: "  " }))).toBe(
      "이름 없는 명소",
    );
  });
});

describe("landmarkCampusLabel", () => {
  const boundaries: CampusBoundaryCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { campus: "서울캠퍼스" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [127.0, 37.5],
              [127.1, 37.5],
              [127.1, 37.6],
              [127.0, 37.6],
              [127.0, 37.5],
            ],
          ],
        },
      },
    ],
  };

  it("캠퍼스 안이면 캠퍼스 이름이다", () => {
    expect(landmarkCampusLabel({ lat: 37.55, lng: 127.05 }, boundaries)).toBe(
      "서울캠퍼스",
    );
  });

  it("캠퍼스 밖이면 캠퍼스 밖이다", () => {
    expect(landmarkCampusLabel({ lat: 36.6, lng: 127.3 }, boundaries)).toBe(
      "캠퍼스 밖",
    );
  });

  it("경계를 아직 받지 못했으면 빈 값이다", () => {
    expect(landmarkCampusLabel({ lat: 37.55, lng: 127.05 }, null)).toBe("");
  });
});

describe("landmarkFormFromRow", () => {
  it("새 명소는 빈 칸과 기본 이모지다", () => {
    expect(landmarkFormFromRow(null)).toEqual({
      name: "",
      name_en: "",
      name_zh: "",
      description: "",
      description_en: "",
      description_zh: "",
      icon: LANDMARK_FALLBACK_EMOJI,
      lat: "",
      lng: "",
    });
  });

  it("기존 명소는 값을 옮기고 이모지가 아닌 아이콘은 기본 이모지로 바꾼다", () => {
    const form = landmarkFormFromRow(
      landmark({ icon: "tree", description: "길", lat: 37.5, lng: 127 }),
    );
    expect(form).toMatchObject({
      name: "다람쥐길",
      name_en: "Squirrel Trail",
      description: "길",
      description_en: "",
      icon: LANDMARK_FALLBACK_EMOJI,
      lat: "37.5",
      lng: "127",
    });
  });
});

describe("landmarkFormDirty", () => {
  it("처음 값 그대로면 dirty가 아니다", () => {
    const row = landmark();
    expect(landmarkFormDirty(landmarkFormFromRow(row), row, null)).toBe(false);
    expect(landmarkFormDirty(landmarkFormFromRow(null), null, null)).toBe(
      false,
    );
  });

  it("앞뒤 공백만 바뀐 것은 dirty가 아니다", () => {
    const row = landmark();
    const form = { ...landmarkFormFromRow(row), name: " 다람쥐길 " };
    expect(landmarkFormDirty(form, row, null)).toBe(false);
  });

  it("글자·번역·이모지·위치가 바뀌면 dirty다", () => {
    const row = landmark();
    const base = landmarkFormFromRow(row);
    expect(landmarkFormDirty({ ...base, name: "청설모길" }, row, null)).toBe(
      true,
    );
    expect(landmarkFormDirty({ ...base, name_zh: "" }, row, null)).toBe(true);
    expect(landmarkFormDirty({ ...base, icon: "🌳" }, row, null)).toBe(true);
    expect(landmarkFormDirty({ ...base, lat: "37.5912345" }, row, null)).toBe(
      true,
    );
  });

  it("좌표는 숫자로 비교한다", () => {
    const row = landmark({ lat: 37.5 });
    const form = { ...landmarkFormFromRow(row), lat: "37.5000000" };
    expect(landmarkFormDirty(form, row, null)).toBe(false);
  });

  it("새 명소는 무엇이든 넣거나 사진만 골라도 dirty다", () => {
    const empty = landmarkFormFromRow(null);
    expect(landmarkFormDirty({ ...empty, lat: "37.5" }, null, null)).toBe(true);
    const file = new File(["x"], "a.webp", { type: "image/webp" });
    expect(landmarkFormDirty(empty, null, file)).toBe(true);
  });
});

describe("validateLandmarkForm", () => {
  const valid = { ...landmarkFormFromRow(landmark()) };

  it("이름·이모지·위치가 있으면 통과한다", () => {
    expect(validateLandmarkForm(valid)).toBeNull();
  });

  it("빠진 필수값의 안내 문구를 돌려준다", () => {
    expect(validateLandmarkForm({ ...valid, name: " " })).toBe(
      "명소 이름을 입력해주세요",
    );
    expect(validateLandmarkForm({ ...valid, icon: "" })).toBe(
      "이모지를 골라주세요",
    );
    expect(validateLandmarkForm({ ...valid, lat: "" })).toBe(
      "지도에서 위치를 선택해주세요",
    );
  });
});

describe("buildLandmarkPayload", () => {
  it("트림하고 빈 번역은 null, 좌표는 숫자다", () => {
    const payload = buildLandmarkPayload({
      name: " 정문 ",
      name_en: " ",
      name_zh: "正门",
      description: "",
      description_en: "",
      description_zh: "",
      icon: "🚪",
      lat: "37.5891234",
      lng: "127.0321234",
    });
    expect(payload).toEqual({
      name: "정문",
      name_en: null,
      name_zh: "正门",
      description: null,
      description_en: null,
      description_zh: null,
      icon: "🚪",
      lat: 37.5891234,
      lng: 127.0321234,
    });
  });

  it("사진 주소는 싣지 않는다 — 사진은 고르는 즉시 따로 저장한다", () => {
    const payload = buildLandmarkPayload(landmarkFormFromRow(landmark()));
    expect(payload).not.toHaveProperty("photo_url");
  });
});
