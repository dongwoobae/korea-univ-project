"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_SLOPE_BANDS,
  SLOPE_BANDS_SETTING_KEY,
  readSlopeBands,
  type SlopeBand,
} from "@/lib/slopeBands";
import { supabase } from "@/lib/supabaseClient";

export type SlopeBandsStatus = "loading" | "ready" | "error";

export interface SlopeBandsSnapshot {
  bands: readonly SlopeBand[];
  status: SlopeBandsStatus;
}

// 서버 스냅샷과 첫 클라이언트 스냅샷이 같은 객체여야 hydration이 어긋나지 않는다
const INITIAL_SNAPSHOT: SlopeBandsSnapshot = {
  bands: DEFAULT_SLOPE_BANDS,
  status: "loading",
};

let snapshot = INITIAL_SNAPSHOT;
let loadStarted = false;
let writeCount = 0;
const listeners = new Set<() => void>();

function publish(next: SlopeBandsSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

// getSetting은 조회 오류와 행 없음을 같은 fallback으로 돌려줘 둘을 가르지 못한다(설계 3장)
async function load() {
  const writesAtStart = writeCount;
  let next: SlopeBandsSnapshot;
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SLOPE_BANDS_SETTING_KEY)
      .maybeSingle();
    if (error) {
      console.error("[slope-bands] read failed", {
        code: error.code,
        message: error.message,
      });
      next = { bands: DEFAULT_SLOPE_BANDS, status: "error" };
    } else {
      next = {
        bands: data ? readSlopeBands(data.value) : DEFAULT_SLOPE_BANDS,
        status: "ready",
      };
    }
  } catch (error) {
    console.error("[slope-bands] read failed", error);
    next = { bands: DEFAULT_SLOPE_BANDS, status: "error" };
  }
  // 응답을 기다리는 사이 관리자가 저장했으면 그 값이 최신이다
  if (writeCount !== writesAtStart) return;
  publish(next);
}

export function subscribeSlopeBands(listener: () => void): () => void {
  listeners.add(listener);
  if (!loadStarted) {
    loadStarted = true;
    void load();
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getSlopeBandsSnapshot(): SlopeBandsSnapshot {
  return snapshot;
}

export function getSlopeBandsServerSnapshot(): SlopeBandsSnapshot {
  return INITIAL_SNAPSHOT;
}

/** 관리자가 저장한 값으로 열린 화면 전체를 바꾼다 */
export function setSlopeBands(bands: readonly SlopeBand[]) {
  writeCount += 1;
  publish({ bands, status: "ready" });
}

export function useSlopeBands(): SlopeBandsSnapshot {
  return useSyncExternalStore(
    subscribeSlopeBands,
    getSlopeBandsSnapshot,
    getSlopeBandsServerSnapshot,
  );
}
