"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Feature, Polygon } from "geojson";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { fetchNeighborBuildings } from "@/lib/neighborBuildings";
import { addNeighborLayer } from "@/lib/neighborLayer";
import { getPolygonRingCenter } from "@/lib/polygonCenter";
import ConfirmModal from "@/components/ConfirmModal";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";

type BuildingPolygon = Feature<Polygon>;

interface PolygonEditorProps {
  geojson: BuildingPolygon | null;
  onChange?: (geojson: BuildingPolygon | null) => void;
  onSave?: (geojson: BuildingPolygon) => void | Promise<void>;
  onCancel?: () => void;
  excludeId: number | null;
}

export default function PolygonEditor({
  geojson,
  onChange,
  onSave,
  onCancel,
  excludeId,
}: PolygonEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const onChangeRef = useRef(onChange);
  const initialGeojsonRef = useRef(geojson);
  const excludeIdRef = useRef(excludeId);
  const [hasPolygon, setHasPolygon] = useState(Boolean(geojson));
  const [confirmReset, setConfirmReset] = useState(false);
  const prefersDarkMode = usePrefersDarkMode();

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (mapRef.current) return;
    const initialGeojson = initialGeojsonRef.current;
    const initialExcludeId = excludeIdRef.current;

    const map = L.map(containerRef.current!, {
      scrollWheelZoom: true,
    }).setView(getPolygonRingCenter(initialGeojson), 18);
    mapRef.current = map;

    tileLayerRef.current = L.tileLayer(getCartoTileUrl(false), {
      attribution: CARTO_ATTRIBUTION,
      subdomains: "abcd",
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    function currentPolygon() {
      const layer = drawnItems.getLayers()[0];
      return layer
        ? ((layer as L.Polygon).toGeoJSON() as BuildingPolygon)
        : null;
    }

    function syncFormPolygon() {
      onChangeRef.current?.(currentPolygon());
    }

    // 기존 건물들을 회색 배경 레이어로 표시 (편집 대상 제외, 클릭 통과)
    let cancelled = false;
    void fetchNeighborBuildings()
      .then((neighbors) => {
        if (cancelled || !mapRef.current) return;
        addNeighborLayer(map, neighbors, initialExcludeId);
      })
      .catch(() => {
        // 주변 건물은 보조 정보다. 실패해도 편집 자체는 계속할 수 있다.
      });

    if (initialGeojson) {
      const layer = L.geoJSON(initialGeojson, {
        style: { color: "#2563EB", weight: 2, fillOpacity: 0.3 },
      });
      layer.eachLayer((l) => {
        drawnItems.addLayer(l);
        (l as L.Path).pm.enable({ allowSelfIntersection: false });
        (l as L.Path).pm.disable();
      });
    }

    map.pm.addControls({
      position: "topleft",
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: false,
      drawMarker: false,
      drawCircle: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircleMarker: false,
      rotateMode: false,
    });
    if (initialGeojson) {
      map.pm.Toolbar.setButtonDisabled("drawPolygon", true);
    }

    map.on("pm:create", (e) => {
      drawnItems.addLayer(e.layer);
      map.pm.disableDraw("Polygon");
      map.pm.Toolbar.setButtonDisabled("drawPolygon", true);
      setHasPolygon(true);
      syncFormPolygon();
    });
    map.on("pm:edit", syncFormPolygon);
    map.on("pm:dragend", syncFormPolygon);

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

  function handleSave() {
    const layers = drawnItemsRef.current?.getLayers() ?? [];
    if (layers.length === 0) {
      alert("폴리곤을 그려주세요");
      return;
    }
    onSave?.((layers[0] as L.Polygon).toGeoJSON() as BuildingPolygon);
  }

  function handleReset() {
    const map = mapRef.current;
    const drawnItems = drawnItemsRef.current;
    if (!map || !drawnItems) return;

    map.pm.disableGlobalEditMode();
    map.pm.disableGlobalDragMode();
    drawnItems.clearLayers();
    map.pm.Toolbar.setButtonDisabled("drawPolygon", false);
    map.pm.enableDraw("Polygon");
    setHasPolygon(false);
    onChangeRef.current?.(null);
    setConfirmReset(false);
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
        🖱️ 드래그로 통째 이동 · 꼭짓점 클릭으로 세부 편집
      </div>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: 420,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {hasPolygon && (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "1px solid var(--ku-danger)",
              color: "var(--ku-danger)",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            폴리곤 지우고 다시 그리기
          </button>
        )}
        {onSave && (
          <>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: "10px",
                background: "none",
                border: "1px solid #ddd",
                borderRadius: 8,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                flex: 1,
                padding: "10px",
                background: "#2563EB",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              폴리곤 변경 저장
            </button>
          </>
        )}
      </div>

      {confirmReset && (
        <ConfirmModal
          message="그린 폴리곤을 지우고 다시 그릴까요?"
          description="현재 폴리곤의 꼭짓점과 편집 내용이 모두 사라집니다. 취소하면 그대로 유지됩니다."
          confirmLabel="지우고 다시 그리기"
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
