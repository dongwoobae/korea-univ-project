// 서버 컴포넌트(루트 레이아웃)가 가져간다 — React를 가져오지 않는다. 훅은 useColorMode.ts(docs/specs/2026-10-28-dark-mode-design.md 2.1)

export type ColorMode = "light" | "dark";

export const COLOR_MODE_STORAGE_KEY = "ku_theme";

export function parseStoredColorMode(value: string | null): ColorMode {
  return value === "dark" ? "dark" : "light";
}

/** <head>에서 첫 그리기 전에 돈다. ES5만 쓴다 */
export const COLOR_MODE_INIT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(COLOR_MODE_STORAGE_KEY)})==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;
