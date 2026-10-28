// 서버 컴포넌트(루트 레이아웃)가 가져간다 — React를 가져오지 않는다. 훅은 useFontScale.ts(docs/specs/2026-10-28-font-scale-design.md 3.1)

export type FontScale = "small" | "normal" | "large";

export const FONT_SCALES: readonly FontScale[] = ["small", "normal", "large"];

export const FONT_SCALE_STORAGE_KEY = "ku_font_scale";

export function parseStoredFontScale(value: string | null): FontScale {
  return value === "small" || value === "large" ? value : "normal";
}

/** 공개 화면 글자 크기. --ku-fs가 없는 관리자 화면에서는 px 그대로다(설계 3.3) */
export function scaledFontSize(px: number) {
  return `calc(${px}px * var(--ku-fs, 1))`;
}

/** <head>에서 첫 그리기 전에 돈다. ES5만 쓴다. 다크 모드 스크립트 뒤에 이어 붙어 전역 변수를 남기지 않게 감싼다 */
export const FONT_SCALE_INIT_SCRIPT = `;(function(){try{var s=localStorage.getItem(${JSON.stringify(FONT_SCALE_STORAGE_KEY)});if(s==="small"||s==="large")document.documentElement.setAttribute("data-font-scale",s)}catch(e){}})();`;
