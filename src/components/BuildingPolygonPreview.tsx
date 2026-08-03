"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Feature, Polygon } from "geojson";
import "leaflet/dist/leaflet.css";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";
import { fetchNeighborBuildings } from "@/lib/neighborBuildings";
import { addNeighborLayer } from "@/lib/neighborLayer";
import { getPolygonRingCenter } from "@/lib/polygonCenter";

interface BuildingPolygonPreviewProps {
  geojson: Feature<Polygon>;
  buildingId: number;
}

/**
 * 읽기 전용 폴리곤 프리뷰.
 *
 * 뷰포트·타일·주변 건물 그림을 `PolygonEditor`와 맞춘다. 편집 버튼을 눌렀을 때
 * 화면이 튀지 않게 하려는 것이므로, 한쪽만 바꾸지 않는다.
 *
 * 초기 폴리곤을 **한 번만** 읽는다. 폴리곤을 저장해도 지도가 그대로인 버그를
 * 막으려면 호출부가 `key`로 재마운트를 강제해야 한다.
 */
export default function BuildingPolygonPreview({
  geojson,
  buildingId,
}: BuildingPolygonPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const initialGeojsonRef = useRef(geojson);
  const buildingIdRef = useRef(buildingId);
  const prefersDarkMode = usePrefersDarkMode();

  useEffect(() => {
    if (mapRef.current) return;
    const initialGeojson = initialGeojsonRef.current;
    const excludeId = buildingIdRef.current;

    // 지도 옵션과 레이어 옵션을 함께 끈다. 지도 옵션만 끄면 폴리곤이 마우스
    // 이벤트를 잡아 커서가 바뀐다.
    const map = L.map(containerRef.current!, {
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomControl: false,
    }).setView(getPolygonRingCenter(initialGeojson), 18);
    mapRef.current = map;

    tileLayerRef.current = L.tileLayer(getCartoTileUrl(false), {
      attribution: CARTO_ATTRIBUTION,
      subdomains: "abcd",
    }).addTo(map);

    let cancelled = false;
    void fetchNeighborBuildings()
      .then((neighbors) => {
        if (cancelled || !mapRef.current) return;
        addNeighborLayer(map, neighbors, excludeId);
      })
      .catch(() => {
        // 주변 건물은 보조 정보다. 실패해도 이 건물 폴리곤은 그린다.
      });

    // Point geojson(지하철역 3건)은 폴리곤이 아니므로 그리지 않는다.
    // Point 처리 정책은 별도 과제로 남아 있다.
    if (initialGeojson.geometry?.type === "Polygon") {
      L.geoJSON(initialGeojson, {
        style: { color: "#2563EB", weight: 2, fillOpacity: 0.3 },
        interactive: false,
      }).addTo(map);
    }

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    tileLayerRef.current?.setUrl(getCartoTileUrl(prefersDarkMode));
  }, [prefersDarkMode]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="건물 폴리곤 미리보기"
      style={{
        width: "100%",
        height: 260,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--ku-border)",
      }}
    />
  );
}
