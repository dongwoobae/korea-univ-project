"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_FONT_SCALE,
  FONT_SCALE_STORAGE_KEY,
  parseStoredFontScale,
  type FontScale,
} from "./fontScale";

const listeners = new Set<() => void>();

function readFontScale(): FontScale {
  return parseStoredFontScale(
    document.documentElement.getAttribute("data-font-scale"),
  );
}

export function subscribeFontScale(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setFontScale(scale: FontScale) {
  const root = document.documentElement;
  if (scale === DEFAULT_FONT_SCALE) root.removeAttribute("data-font-scale");
  else root.setAttribute("data-font-scale", String(scale));
  try {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(scale));
  } catch {
    // 저장이 막힌 환경 — 화면만 바꾼다
  }
  for (const listener of listeners) listener();
}

/** 서버와 hydration 동안은 100, 그 뒤로는 <html>의 실제 값 */
export function useFontScale(): FontScale {
  return useSyncExternalStore(
    subscribeFontScale,
    readFontScale,
    () => DEFAULT_FONT_SCALE,
  );
}
