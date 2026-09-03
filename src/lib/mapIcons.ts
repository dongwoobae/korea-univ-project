import {
  Accessibility,
  GripVertical,
  Sparkles,
  SquareParking,
  Toilet,
  TrainFront,
  TrendingUp,
} from "lucide-static";
import type { IconNode } from "lucide-react";
import type { FacilityCode } from "@/types/domain";

/**
 * lucide 1.31.0에 엘리베이터가 없어 직접 그린다. 아이콘 2,025개 중 이름에
 * `elevator`·`lift`가 붙은 것이 없고, `tags.json` 1,767건을 같은 말로 훑어도
 * 나오는 것은 `cable-car`·`forklift`·`layers-arrow-up`뿐이다.
 *
 * 화살표를 상자 안이 아니라 **위에 얹는** 것이 표준 픽토그램이고, 그 배치라야
 * 정렬(sort) 아이콘으로 읽히지 않는다. 상자 안을 문 이음새 하나로 끝낸 이유는
 * 가장 작은 렌더가 15px(공개 지도 필터 패널)이라서다 — 휠체어를 넣으면 그
 * 크기에서 바퀴와 사람이 한 덩어리로 뭉친다. 접근성 여부는 이 앱 전체가
 * 전제하는 것이고 `building_facilities`에 그것을 가르는 컬럼도 없다.
 */
export const ELEVATOR_ICON_NODE: IconNode = [
  ["path", { d: "M8 7V3", key: "elev-up-stem" }],
  ["path", { d: "m6 5 2-2 2 2", key: "elev-up-head" }],
  ["path", { d: "M16 3v4", key: "elev-down-stem" }],
  ["path", { d: "m14 5 2 2 2-2", key: "elev-down-head" }],
  [
    "rect",
    { x: "4", y: "9", width: "16", height: "13", rx: "2", key: "elev-car" },
  ],
  ["path", { d: "M12 9v13", key: "elev-seam" }],
];

/** lucide-static이 내보내는 문자열과 같은 모양으로 만든다. */
function iconNodeToSvg(name: string, node: IconNode): string {
  const children = node
    .map(([tag, attrs]) => {
      const rendered = Object.entries(attrs)
        .filter(([name]) => name !== "key")
        .map(([name, value]) => `${name}="${value}"`)
        .join(" ");
      return `<${tag} ${rendered} />`;
    })
    .join("");
  return (
    `<svg class="lucide lucide-${name}" xmlns="http://www.w3.org/2000/svg"` +
    ` width="24" height="24" viewBox="0 0 24 24" fill="none"` +
    ` stroke="currentColor" stroke-width="2" stroke-linecap="round"` +
    ` stroke-linejoin="round">${children}</svg>`
  );
}

export const ELEVATOR_ICON_SVG = iconNodeToSvg("elevator", ELEVATOR_ICON_NODE);

export type FacilityIconKey = FacilityCode | "fallback";

const FACILITY_ICON_KEY: Record<FacilityCode, FacilityIconKey> = {
  elevator: "elevator",
  restroom: "restroom",
  ramp: "ramp",
  parking: "parking",
  braille: "braille",
};

export function facilityIconKey(
  code: string | null | undefined,
): FacilityIconKey {
  const key = code ?? "";
  return Object.hasOwn(FACILITY_ICON_KEY, key)
    ? FACILITY_ICON_KEY[key as FacilityCode]
    : "fallback";
}

export const FACILITY_ICON_SVG: Record<FacilityIconKey, string> = {
  elevator: ELEVATOR_ICON_SVG,
  restroom: Toilet,
  ramp: TrendingUp,
  parking: SquareParking,
  braille: GripVertical,
  fallback: Accessibility,
};

export const LANDMARK_CATEGORY_ICON_SVG = Sparkles;
export const SUBWAY_ICON_SVG = TrainFront;
export const FACILITY_CLUSTER_ICON_SVG = Accessibility;

export const LANDMARK_FALLBACK_EMOJI = "✨";

/** 키캡(1️⃣)만 숫자·#·*로 시작한다. 그 밖의 ASCII는 아래에서 허용하지 않는다. */
const KEYCAP = /^[0-9#*]️?⃣$/;

/**
 * 이어 붙이는 부품(ZWJ·이형 선택자·스킨톤·태그)까지 허용하되,
 * `Extended_Pictographic`만으로는 국기(Regional_Indicator)가 빠진다.
 */
const EMOJI_ONLY =
  /^[\p{Extended_Pictographic}\p{Regional_Indicator}‍️\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]+$/u;

/** 부품만 있고 글리프가 없는 값(ZWJ 단독 등)을 막는다. */
const HAS_GLYPH = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

/**
 * 타입은 `string`이지만 배포 창에서는 필드 자체가 오지 않는다 —
 * 근거는 `docs/specs/2026-08-18-restore-landmark-emoji-design.md`의
 * "배포 순서" 절에 있다.
 *
 * 이모지가 아닌 값까지 걸러내는 이유는
 * `docs/specs/2026-09-03-landmark-emoji-picker-design.md`의 "렌더 가드" 절에 있다.
 */
export function landmarkEmoji(icon: string | null | undefined): string {
  const value = icon?.trim();
  if (!value) return LANDMARK_FALLBACK_EMOJI;
  const isEmoji =
    KEYCAP.test(value) || (EMOJI_ONLY.test(value) && HAS_GLYPH.test(value));
  return isEmoji ? value : LANDMARK_FALLBACK_EMOJI;
}

/** lucide-static SVG는 24px 고정이라 자리 크기에 맞춰 덮어쓴다. */
export function sizedIconSvg(svg: string, size: number): string {
  return svg
    .replace('width="24"', `width="${size}"`)
    .replace('height="24"', `height="${size}"`);
}

export function facilityIconSvg(
  code: string | null | undefined,
  size: number,
): string {
  return sizedIconSvg(FACILITY_ICON_SVG[facilityIconKey(code)], size);
}
