"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";
import { slopeColor } from "@/lib/theme";
import type { Vertex } from "@/lib/slopeRoute";

const KU_CENTER: [number, number] = [37.5893, 127.0327];

interface SlopeRouteMapProps {
  initialVertices: Vertex[] | null;
  onVerticesChange: (vertices: Vertex[]) => void;
  slopes: (number | null)[];
}

export default function SlopeRouteMap({
  initialVertices,
  onVerticesChange,
  slopes,
}: SlopeRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const onChangeRef = useRef(onVerticesChange);
  const initialRef = useRef(initialVertices);
  const previewRef = useRef<L.LayerGroup | null>(null);
  const verticesRef = useRef<Vertex[]>([]);
  const prefersDarkMode = usePrefersDarkMode();
  // slopes prop이 참조 동일성을 유지한 채로 좌표만 바뀔 수 있어(꼭짓점 드래그),
  // 좌표 변경도 미리보기 effect를 다시 돌리도록 별도로 신호를 준다.
  const [vertexVersion, setVertexVersion] = useState(0);

  useEffect(() => {
    onChangeRef.current = onVerticesChange;
  }, [onVerticesChange]);

  useEffect(() => {
    if (mapRef.current) return;
    const initial = initialRef.current;

    const center: [number, number] = initial?.length
      ? [initial[0].lat, initial[0].lng]
      : KU_CENTER;
    const map = L.map(containerRef.current!, { scrollWheelZoom: true }).setView(
      center,
      19,
    );
    mapRef.current = map;

    tileLayerRef.current = L.tileLayer(getCartoTileUrl(false), {
      attribution: CARTO_ATTRIBUTION,
      subdomains: "abcd",
    }).addTo(map);

    // 편집선(overlayPane, z-index 400)보다 아래에 둔다. "아래에 그린다"를 말로만
    // 두면 실제 순서가 보장되지 않는다.
    const pane = map.createPane("slopePreview");
    pane.style.zIndex = "350";
    pane.classList.add("slope-preview-pane");
    previewRef.current = L.layerGroup([], { pane: "slopePreview" }).addTo(map);

    // 이벤트는 "뭔가 바뀌었다"는 신호로만 쓴다. 무슨 편집이었는지 추론하지
    // 않고 좌표를 레이어에서 다시 읽는다. 멱등이라 중복 호출이 안전하다.
    function syncVertices() {
      const line = lineRef.current;
      if (!line) {
        verticesRef.current = [];
        onChangeRef.current([]);
        setVertexVersion((version) => version + 1);
        return;
      }
      const latlngs = line.getLatLngs() as L.LatLng[];
      const next = latlngs.map((latlng) => ({
        lat: latlng.lat,
        lng: latlng.lng,
      }));
      verticesRef.current = next;
      onChangeRef.current(next);
      setVertexVersion((version) => version + 1);
    }

    function lockDrawButton() {
      map.pm.disableDraw("Line");
      map.pm.Toolbar.setButtonDisabled("drawPolyline", true);
    }

    function attachLine(line: L.Polyline) {
      lineRef.current = line;
      // 꼭짓점 추가·삭제를 막는다. 개수가 고정되면 구간과 입력값의 대응이
      // 그리기 직후에 확정되고 그 뒤로 어긋나지 않는다.
      line.pm.enable({
        allowSelfIntersection: true,
        hideMiddleMarkers: true,
        preventMarkerRemoval: true,
      });
      line.on("pm:edit", syncVertices);
      line.on("pm:markerdragend", syncVertices);
      line.on("pm:dragend", syncVertices);
    }

    map.pm.addControls({
      position: "topleft",
      drawPolyline: true,
      editMode: false,
      dragMode: true,
      cutPolygon: false,
      removalMode: false,
      drawMarker: false,
      drawCircle: false,
      drawPolygon: false,
      drawRectangle: false,
      drawCircleMarker: false,
      drawText: false,
      rotateMode: false,
    });

    if (initial?.length) {
      const line = L.polyline(
        initial.map((vertex) => [vertex.lat, vertex.lng] as [number, number]),
        { color: "#2563EB", weight: 3 },
      ).addTo(map);
      attachLine(line);
      lockDrawButton();
      syncVertices();
      map.fitBounds(line.getBounds(), { padding: [40, 40] });
    }

    map.on("pm:create", (event) => {
      const line = event.layer as L.Polyline;
      attachLine(line);
      lockDrawButton();
      syncVertices();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      lineRef.current = null;
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    tileLayerRef.current?.setUrl(getCartoTileUrl(prefersDarkMode));
  }, [prefersDarkMode]);

  useEffect(() => {
    const group = previewRef.current;
    if (!group) return;
    group.clearLayers();
    const vertices = verticesRef.current;
    for (let i = 0; i < vertices.length - 1; i++) {
      const slope = slopes[i];
      if (slope === null || slope === undefined || !Number.isFinite(slope))
        continue;
      L.polyline(
        [
          [vertices[i].lat, vertices[i].lng],
          [vertices[i + 1].lat, vertices[i + 1].lng],
        ],
        {
          color: slopeColor(Math.abs(slope)),
          weight: 8,
          opacity: 0.85,
          // geoman이 편집 대상으로 잡지 않게 한다. 없으면 색칠용 선에
          // 꼭짓점 핸들이 붙는다.
          pmIgnore: true,
          // 편집선으로 가야 할 클릭을 가로채지 않게 한다.
          interactive: false,
          pane: "slopePreview",
        },
      ).addTo(group);
    }
  }, [slopes, vertexVersion]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 420,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--ku-border)",
      }}
    />
  );
}
