import type { CompactEmoji } from "emojibase";

/**
 * emojibase의 group 번호. `emojibase-data/meta/groups.json`이 원본이고,
 * 2(component)는 맨 스킨톤 수정자 5건이라 고를 대상이 아니다.
 */
const GROUP_LABEL: Record<number, string> = {
  0: "스마일리",
  1: "사람",
  3: "동물 및 자연",
  4: "음식",
  5: "여행 및 장소",
  6: "활동",
  7: "사물",
  8: "기호",
  9: "깃발",
};

export const EMOJI_GROUP_ORDER = [0, 1, 3, 4, 5, 6, 7, 8, 9];

/** 한 글자 검색이 가장 큰 그룹(사람 388건)을 넘겨 격자가 끝없이 길어지는 것을 막는다. */
export const SEARCH_RESULT_LIMIT = 200;

export function emojiGroupLabel(group: number): string {
  return GROUP_LABEL[group] ?? "";
}

function isPickable(emoji: CompactEmoji): boolean {
  return emoji.group !== undefined && Object.hasOwn(GROUP_LABEL, emoji.group);
}

/** 스킨톤 변형을 부모 바로 뒤에 이어 붙여 한 층으로 만든다. */
export function flattenEmoji(list: CompactEmoji[]): CompactEmoji[] {
  return list.flatMap((emoji) => [
    emoji,
    ...(emoji.skins ?? []).map((skin) => ({ ...skin, group: emoji.group })),
  ]);
}

/**
 * 탭 격자는 스킨톤 변형을 펼치지 않는다 — 사람 그룹이 388건에서 세 배로
 * 불어나고, 명소 아이콘은 15px라 피부색이 보이지도 않는다.
 */
export function groupEmoji(
  list: CompactEmoji[],
): Record<number, CompactEmoji[]> {
  const grouped: Record<number, CompactEmoji[]> = {};
  for (const emoji of list) {
    if (!isPickable(emoji)) continue;
    (grouped[emoji.group as number] ??= []).push(emoji);
  }
  for (const group of Object.values(grouped)) {
    group.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return grouped;
}

/**
 * CLDR 주석은 부분 일치로 잡으면 잡음이 섞인다 — "책"이 🚶 보행자를 물고
 * (태그 `산책`), "벤치"가 💪 알통을 문다(태그 `벤치프레스`). 그래서 정확히
 * 같은 label을 맨 위에 두고, label 일치를 tag 일치보다 앞세운다.
 */
const RANK_EXACT = 0;
const RANK_PREFIX = 1;
const RANK_LABEL = 2;
const RANK_TAG = 3;

function rank(emoji: CompactEmoji, query: string): number | null {
  const label = emoji.label;
  if (label === query) return RANK_EXACT;
  if (label.startsWith(query)) return RANK_PREFIX;
  if (label.includes(query)) return RANK_LABEL;
  if (emoji.tags?.some((tag) => tag.includes(query))) return RANK_TAG;
  return null;
}

export function searchEmoji(
  list: CompactEmoji[],
  rawQuery: string,
): CompactEmoji[] {
  const query = rawQuery.trim();
  if (!query) return [];

  const hits: { emoji: CompactEmoji; rank: number }[] = [];
  for (const emoji of flattenEmoji(list)) {
    if (!isPickable(emoji)) continue;
    const matched = rank(emoji, query);
    if (matched !== null) hits.push({ emoji, rank: matched });
  }

  hits.sort(
    (a, b) => a.rank - b.rank || (a.emoji.order ?? 0) - (b.emoji.order ?? 0),
  );
  return hits.slice(0, SEARCH_RESULT_LIMIT).map((hit) => hit.emoji);
}
