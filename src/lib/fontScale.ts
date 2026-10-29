// 서버 컴포넌트(루트 레이아웃)가 가져간다 — React를 가져오지 않는다. 훅은 useFontScale.ts(docs/specs/2026-10-28-font-scale-design.md 3.1)

/** 백분율. 슬라이더 한 칸이 10이다(docs/specs/2026-10-29-map-buttons-feedback-design.md 4.2) */
export const FONT_SCALES = [90, 100, 110, 120, 130, 140, 150] as const;

export type FontScale = (typeof FONT_SCALES)[number];

export const DEFAULT_FONT_SCALE: FontScale = 100;

export const FONT_SCALE_STORAGE_KEY = "ku_font_scale";

/** 세 단계였을 때 저장한 값. 고쳐 쓰지 않고 읽을 때마다 바꾼다 */
const LEGACY_FONT_SCALES = new Map<string, FontScale>([
  ["small", 90],
  ["normal", 100],
  ["large", 120],
]);

export function parseStoredFontScale(value: string | null): FontScale {
  if (value === null) return DEFAULT_FONT_SCALE;
  return (
    LEGACY_FONT_SCALES.get(value) ??
    FONT_SCALES.find((scale) => String(scale) === value) ??
    DEFAULT_FONT_SCALE
  );
}

/** 공개 화면 글자 크기. --ku-fs가 없는 관리자 화면에서는 px 그대로다(설계 3.3) */
export function scaledFontSize(px: number) {
  return `calc(${px}px * var(--ku-fs, 1))`;
}

const legacyScript = [...LEGACY_FONT_SCALES]
  .filter(([, scale]) => scale !== DEFAULT_FONT_SCALE)
  .map(
    ([name, scale]) =>
      `if(s===${JSON.stringify(name)})s=${JSON.stringify(String(scale))};`,
  )
  .join("");

const scaledPattern = FONT_SCALES.filter(
  (scale) => scale !== DEFAULT_FONT_SCALE,
).join("|");

/** <head>에서 첫 그리기 전에 돈다. ES5만 쓴다. 다크 모드 스크립트 뒤에 이어 붙어 전역 변수를 남기지 않게 감싼다 */
export const FONT_SCALE_INIT_SCRIPT = `;(function(){try{var s=localStorage.getItem(${JSON.stringify(FONT_SCALE_STORAGE_KEY)});${legacyScript}if(/^(${scaledPattern})$/.test(s))document.documentElement.setAttribute("data-font-scale",s)}catch(e){}})();`;
