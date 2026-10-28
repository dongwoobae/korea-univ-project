"use client";

import { useSyncExternalStore } from "react";
import { COLOR_MODE_STORAGE_KEY, type ColorMode } from "./colorMode";

const listeners = new Set<() => void>();

function readColorMode(): ColorMode {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

export function subscribeColorMode(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setColorMode(mode: ColorMode) {
  const root = document.documentElement;
  if (mode === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
  try {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  } catch {
    // 저장이 막힌 환경 — 화면만 바꾼다
  }
  for (const listener of listeners) listener();
}

/** 서버와 hydration 동안은 밝음, 그 뒤로는 <html>의 실제 값(설계 2.1) */
export function useColorMode(): ColorMode {
  return useSyncExternalStore(subscribeColorMode, readColorMode, () => "light");
}
