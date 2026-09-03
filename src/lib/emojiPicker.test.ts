import { describe, expect, it } from "vitest";
import type { CompactEmoji } from "emojibase";
import realData from "emojibase-data/ko/compact.json";
import {
  EMOJI_GROUP_ORDER,
  SEARCH_RESULT_LIMIT,
  emojiGroupLabel,
  flattenEmoji,
  groupEmoji,
  searchEmoji,
} from "./emojiPicker";

/** 실제 ko/compact.json의 형상을 그대로 줄인 것. */
const 나무: CompactEmoji = {
  hexcode: "1F333",
  label: "나무",
  unicode: "🌳",
  group: 3,
  order: 754,
  tags: ["낙엽", "낙엽수", "숲"],
};
const 다람쥐: CompactEmoji = {
  hexcode: "1F43F-FE0F",
  label: "얼룩다람쥐",
  unicode: "🐿️",
  group: 3,
  order: 800,
  tags: ["다람쥐"],
};
const 나무늘보: CompactEmoji = {
  hexcode: "1F9A5",
  label: "나무늘보",
  unicode: "🦥",
  group: 3,
  order: 810,
  tags: [],
};
const 손: CompactEmoji = {
  hexcode: "1F44B",
  label: "손 흔들기",
  unicode: "👋",
  group: 1,
  order: 10,
  tags: ["인사"],
  skins: [
    {
      hexcode: "1F44B-1F3FB",
      label: "손 흔들기",
      unicode: "👋🏻",
      group: 1,
      order: 11,
    },
    {
      hexcode: "1F44B-1F3FC",
      label: "손 흔들기",
      unicode: "👋🏼",
      group: 1,
      order: 12,
    },
  ],
};
const 스킨톤: CompactEmoji = {
  hexcode: "1F3FB",
  label: "하얀 피부",
  unicode: "🏻",
  group: 2,
  order: 1,
  tags: [],
};
const 그룹없음: CompactEmoji = {
  hexcode: "0023",
  label: "숫자 기호",
  unicode: "#",
  order: 0,
  tags: [],
} as CompactEmoji;

const 표본 = [나무, 다람쥐, 나무늘보, 손, 스킨톤, 그룹없음];

describe("flattenEmoji", () => {
  it("스킨톤 변형을 같은 층으로 펼친다", () => {
    const flat = flattenEmoji([손]);
    expect(flat.map((e) => e.unicode)).toEqual(["👋", "👋🏻", "👋🏼"]);
  });

  it("변형이 없으면 그대로 하나다", () => {
    expect(flattenEmoji([나무])).toHaveLength(1);
  });
});

describe("groupEmoji", () => {
  // group 2(component)는 맨 스킨톤 수정자라 고를 대상이 아니고,
  // group이 없는 항목은 어느 탭에도 속하지 않는다.
  it("component 그룹과 그룹 없는 항목을 뺀다", () => {
    const grouped = groupEmoji(표본);
    const 전체 = Object.values(grouped).flat();
    expect(전체.map((e) => e.unicode)).not.toContain("🏻");
    expect(전체.map((e) => e.unicode)).not.toContain("#");
  });

  it("그룹별로 나누고 order로 정렬한다", () => {
    const grouped = groupEmoji([나무늘보, 나무, 다람쥐]);
    expect(grouped[3]?.map((e) => e.unicode)).toEqual(["🌳", "🐿️", "🦥"]);
  });

  it("스킨톤 변형은 탭 격자에 펼치지 않는다", () => {
    const grouped = groupEmoji([손]);
    expect(grouped[1]?.map((e) => e.unicode)).toEqual(["👋"]);
  });
});

describe("emojiGroupLabel", () => {
  it("탭에 한국어 이름을 준다", () => {
    expect(emojiGroupLabel(3)).toBe("동물 및 자연");
    expect(emojiGroupLabel(9)).toBe("깃발");
  });
});

describe("EMOJI_GROUP_ORDER", () => {
  it("component를 뺀 9개 그룹을 탭 순서대로 준다", () => {
    expect(EMOJI_GROUP_ORDER).toEqual([0, 1, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("searchEmoji", () => {
  it("한국어 label로 찾는다", () => {
    expect(searchEmoji(표본, "나무").map((e) => e.unicode)).toContain("🌳");
  });

  it("한국어 tag로도 찾는다", () => {
    expect(searchEmoji(표본, "다람쥐").map((e) => e.unicode)).toContain("🐿️");
  });

  // CLDR 주석은 부분 일치로 잡으면 잡음이 섞인다. 정확히 같은 label이 위에 온다.
  it("정확히 일치하는 label을 먼저 준다", () => {
    const hits = searchEmoji(표본, "나무");
    expect(hits[0]?.unicode).toBe("🌳");
  });

  it("label 포함이 tag 포함보다 앞선다", () => {
    const hits = searchEmoji([다람쥐, 나무늘보], "나무");
    expect(hits[0]?.unicode).toBe("🦥");
  });

  it("검색은 스킨톤 변형까지 훑는다", () => {
    const hits = searchEmoji([손], "손 흔들기");
    expect(hits.map((e) => e.unicode)).toContain("👋🏻");
  });

  it("검색에서도 component 그룹은 빠진다", () => {
    expect(searchEmoji(표본, "피부")).toHaveLength(0);
  });

  it("공백만 있는 검색어는 빈 결과다", () => {
    expect(searchEmoji(표본, "   ")).toEqual([]);
  });

  it("앞뒤 공백을 무시한다", () => {
    expect(searchEmoji(표본, "  나무  ").map((e) => e.unicode)).toContain("🌳");
  });

  // 한 글자 검색이 그룹 최대치를 넘긴다.
  it("결과 개수에 상한을 둔다", () => {
    const 많음 = Array.from({ length: SEARCH_RESULT_LIMIT + 50 }, (_, i) => ({
      ...나무,
      hexcode: `X${i}`,
      unicode: `🌳${i}`,
      order: i,
    }));
    expect(searchEmoji(많음, "나무")).toHaveLength(SEARCH_RESULT_LIMIT);
  });
});

// 목만 통과하면 의미가 없다. emojibase 판이 올라 그룹 번호나 한국어 주석이
// 바뀌면 여기서 깨진다.
describe("실제 emojibase 데이터", () => {
  it("탭 아홉 개가 모두 채워진다", () => {
    const grouped = groupEmoji(realData);
    for (const group of EMOJI_GROUP_ORDER) {
      expect(grouped[group]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("맨 스킨톤 수정자는 어느 탭에도 없다", () => {
    const all = Object.values(groupEmoji(realData))
      .flat()
      .map((emoji) => emoji.unicode);
    for (const tone of ["🏻", "🏼", "🏽", "🏾", "🏿"]) {
      expect(all).not.toContain(tone);
    }
  });

  it("현재 명소가 쓰는 이모지를 한국어로 찾는다", () => {
    expect(searchEmoji(realData, "나무")[0]?.unicode).toBe("🌳");
    expect(searchEmoji(realData, "얼룩다람쥐")[0]?.unicode).toBe("🐿️");
    expect(searchEmoji(realData, "벚꽃")[0]?.unicode).toBe("🌸");
    expect(searchEmoji(realData, "비둘기")[0]?.unicode).toBe("🕊️");
  });
});
