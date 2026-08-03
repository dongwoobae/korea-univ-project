import type { Feature } from "geojson";
import { supabase } from "@/lib/supabaseClient";

/**
 * 주변 건물(회색 배경 레이어) 조회를 한 곳에 모은 모듈.
 *
 * 캐시는 모듈 수준이라 같은 세션에서 조회가 한 번만 나간다. 캐시가 담는 것은
 * `select("id, name, geojson")` 결과이므로 **이름·존재 여부·폴리곤 중 하나라도
 * 바꾸는 경로는 성공 직후 `invalidateNeighborBuildings()`를 호출해야 한다.**
 * 무효화 책임은 호출부에 있다.
 *
 * 무효화가 필요한 경로: 소프트 삭제 · 복구 · 건물명 저장 · 폴리곤 저장 · 신규 등록.
 * 소속(college_id) 저장은 캐시에 담기지 않으므로 무효화하지 않는다.
 */

export const NEIGHBOR_STYLE = {
  color: "#9ca3af",
  weight: 1,
  fillColor: "#9ca3af",
  fillOpacity: 0.25,
};

let cache: Promise<Feature[]> | null = null;

export function invalidateNeighborBuildings() {
  cache = null;
}

export function fetchNeighborBuildings(): Promise<Feature[]> {
  if (cache) return cache;

  async function load(): Promise<Feature[]> {
    const { data, error } = await supabase
      .from("buildings")
      .select("id, name, geojson")
      .eq("is_deleted", false)
      .not("geojson", "is", null);
    if (error) throw error;
    return (data ?? [])
      .filter((row) => (row.geojson as unknown as Feature | null)?.geometry)
      .map((row) => {
        const feature = row.geojson as unknown as Feature;
        return {
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            bid: row.id,
            name: row.name,
          },
        };
      });
  }

  const pending: Promise<Feature[]> = load().catch((error: unknown) => {
    // 실패한 Promise를 남기면 세션 내내 주변 건물이 안 그려진다.
    if (cache === pending) cache = null;
    throw error;
  });
  cache = pending;
  return pending;
}
