"use client";

import { useSyncExternalStore } from "react";
import {
  facilityStyleOf,
  type FacilityStyle,
} from "@/lib/facilityStyleCatalog";
import { supabase } from "@/lib/supabaseClient";
import type { FacilityType } from "@/types/domain";

/** 시설 종류 목록을 한 번 받아 여러 화면이 같이 쓴다. 설계: docs/specs/2026-10-26-facility-type-management-design.md 2.1 */

export type FacilityTypesStatus = "loading" | "ready" | "error";

export interface FacilityTypesSnapshot {
  types: FacilityType[];
  status: FacilityTypesStatus;
  loaded: boolean;
}

// 서버 스냅숏과 첫 클라이언트 스냅숏이 같은 객체여야 hydration이 어긋나지 않는다
const INITIAL_SNAPSHOT: FacilityTypesSnapshot = {
  types: [],
  status: "loading",
  loaded: false,
};

let snapshot = INITIAL_SNAPSHOT;
let loadStarted = false;
let latestLoad = 0;
let latestLoadPromise: Promise<boolean> = Promise.resolve(false);
const listeners = new Set<() => void>();

function publish(next: FacilityTypesSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function load(): Promise<boolean> {
  latestLoad += 1;
  const thisLoad = latestLoad;
  let next: FacilityTypesSnapshot;
  try {
    const { data, error } = await supabase
      .from("facility_types")
      .select("*")
      .order("sort_order")
      .order("code");
    if (error) {
      console.error("[facility-types] read failed", {
        code: error.code,
        message: error.message,
      });
      next = { ...snapshot, status: "error" };
    } else {
      next = { types: data ?? [], status: "ready", loaded: true };
    }
  } catch (error) {
    console.error("[facility-types] read failed", error);
    next = { ...snapshot, status: "error" };
  }
  // 고친 뒤 다시 받기보다 먼저 시작한 응답이 나중에 오면 낡은 목록이다. 기다리던 쪽에는 최신 받기의 결과를 준다 —
  // 버려진 응답의 성공을 돌려주면 아직 맞춰지지 않은 목록을 맞춰졌다고 본다
  if (thisLoad !== latestLoad) return latestLoadPromise;
  publish(next);
  return next.status === "ready";
}

function startLoad(): Promise<boolean> {
  latestLoadPromise = load();
  return latestLoadPromise;
}

export function subscribeFacilityTypes(listener: () => void): () => void {
  listeners.add(listener);
  if (!loadStarted) {
    loadStarted = true;
    void startLoad();
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getFacilityTypesSnapshot(): FacilityTypesSnapshot {
  return snapshot;
}

export function getFacilityTypesServerSnapshot(): FacilityTypesSnapshot {
  return INITIAL_SNAPSHOT;
}

/**
 * 받는 동안에도 직전 목록을 둔다 — 비우면 열린 화면의 아이콘이 모두 대체 아이콘으로 번쩍인다.
 * 저장소에 반영된 받기가 성공했는지로 풀린다. 관리 화면이 다시 받은 뒤에 화면을 맞춘다(설계 2.1·3.2).
 */
export function reloadFacilityTypes(): Promise<boolean> {
  loadStarted = true;
  publish({ ...snapshot, status: "loading" });
  return startLoad();
}

export function useFacilityTypes(): FacilityTypesSnapshot {
  return useSyncExternalStore(
    subscribeFacilityTypes,
    getFacilityTypesSnapshot,
    getFacilityTypesServerSnapshot,
  );
}

export function useFacilityStyle(
  code: string | null | undefined,
): FacilityStyle {
  return facilityStyleOf(useFacilityTypes().types, code);
}
