"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import {
  WORKSPACE_MAX_ZOOM,
  focusWorkspaceMap,
} from "@/components/admin/workspace/focusMap";
import type {
  WorkspaceMapCommands,
  WorkspaceMapSlotProps,
} from "@/components/admin/workspace/types";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import { KU_BOUNDS, containsPoint } from "@/lib/mapBounds";
import { fetchNeighborBuildings } from "@/lib/neighborBuildings";
import { addNeighborLayer } from "@/lib/neighborLayer";
import { readRoutePoints, type Vertex } from "@/lib/slopeRoute";
import {
  SLOPE_GRADE_COLORS,
  isSlopeDegInRange,
  slopeGradeFromDeg,
} from "@/lib/slopeScale";
import { supabase } from "@/lib/supabaseClient";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";
import type {
  SlopeEditDraft,
  SlopeEditMode,
  SlopeEditorCommands,
  SlopeEditorHandle,
  SlopeEditorState,
} from "./types";

// 꼭짓점 추가·삭제를 막는다. 개수가 고정되면 구간과 입력값의 대응이
// 그리기 직후에 확정되고 그 뒤로 어긋나지 않는다.
const EDIT_OPTIONS = {
  allowSelfIntersection: true,
  hideMiddleMarkers: true,
  preventMarkerRemoval: true,
};

// 기존 선과 geoman이 새로 그리는 선이 같은 모양이어야 한다. 색은 다크에서도 보이게 CSS가 토큰으로 칠한다.
// Leaflet은 className을 선을 만들 때만 붙인다
const EDIT_LINE_OPTIONS = { className: "ku-slope-edit-line", weight: 3 };

// geoman 2.19.3 dist/leaflet-geoman.js의 Draw.Line 비공개 메서드다. geoman 자기 액션 버튼(끝내기·마지막
// 꼭지점 제거)이 이것을 부른다. 타입 선언에 없어 좁은 타입으로 단언하므로 geoman을 올릴 때 다시 확인한다
interface LineDrawInternals {
  _finishShape(): void;
  _removeLastVertex(): void;
}

/** 마운트 effect가 만들어 잠금 effect와 손잡이 내놓기 effect가 같이 쓴다 */
interface EditorController {
  commands: SlopeEditorCommands;
  setLocked(locked: boolean): void;
}

interface SlopeRouteMapProps extends WorkspaceMapSlotProps {
  /** 마운트 때만 읽는다 */
  initialVertices: Vertex[] | null;
  /** 다른 경로로 깔지 않을 경로. 새 경로면 null */
  editingRouteId: string | null;
  /** owner가 맞는 것만 페이지가 넘긴다 */
  draft: SlopeEditDraft | null;
  /** 정리될 때 먼저 null을 보낸다 */
  onEditorChange: (editor: SlopeEditorHandle | null) => void;
}

export default function SlopeRouteMap({
  initialViewport,
  onViewportChange,
  onCommandsReady,
  initialVertices,
  editingRouteId,
  draft,
  onEditorChange,
}: SlopeRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const previewRef = useRef<L.LayerGroup | null>(null);
  const labelsRef = useRef<L.LayerGroup | null>(null);
  const verticesRef = useRef<Vertex[]>([]);
  const controllerRef = useRef<EditorController | null>(null);
  const mountRef = useRef({ initialViewport, initialVertices, editingRouteId });
  const draftRef = useRef(draft);
  const onViewportChangeRef = useRef(onViewportChange);
  const onCommandsReadyRef = useRef(onCommandsReady);
  const onEditorChangeRef = useRef(onEditorChange);
  const prefersDarkMode = usePrefersDarkMode();
  const [editorState, setEditorState] = useState<SlopeEditorState>(() => ({
    hasLine: Boolean(initialVertices?.length),
    drawing: false,
    mode: "vertex",
    snap: false,
  }));
  // 미리보기는 초안의 slopes와 지도의 좌표로 그린다. slopes가 같은 채 좌표만 바뀌어도(꼭짓점 끌기)
  // 다시 그리도록 따로 신호를 준다.
  const [vertexVersion, setVertexVersion] = useState(0);
  const owner = editingRouteId === null ? "edit:new" : `edit:${editingRouteId}`;
  const slopes = draft?.slopes;
  const locked = draft?.locked ?? false;

  useEffect(() => {
    draftRef.current = draft;
    onViewportChangeRef.current = onViewportChange;
    onCommandsReadyRef.current = onCommandsReady;
    onEditorChangeRef.current = onEditorChange;
  }, [draft, onViewportChange, onCommandsReady, onEditorChange]);

  useEffect(() => {
    const {
      initialViewport: viewport,
      initialVertices: initial,
      editingRouteId: skipRouteId,
    } = mountRef.current;
    let disposed = false;
    let mode: SlopeEditMode = "vertex";
    let editLocked = false;
    let line: L.Polyline | null = null;

    // 보기 지도에서 바꿔 끼울 때 화면이 그대로여야 한다. 기존 경로라도 선에 맞춰 옮기지 않고 넘겨받은 화면으로 연다.
    // ?id=&edit=1로 바로 들어오면 작업 화면의 focus 명령이 맞춘다(설계 2026-10-14 6.4)
    const map = L.map(containerRef.current!, {
      scrollWheelZoom: true,
      maxZoom: WORKSPACE_MAX_ZOOM,
      zoomControl: false,
    }).setView(viewport.center, viewport.zoom);
    L.control
      .zoom({ position: "topleft", zoomInTitle: "확대", zoomOutTitle: "축소" })
      .addTo(map);

    tileLayerRef.current = L.tileLayer(getCartoTileUrl(false), {
      attribution: CARTO_ATTRIBUTION,
      subdomains: "abcd",
      maxZoom: WORKSPACE_MAX_ZOOM,
    }).addTo(map);

    map.on("moveend", () => {
      const center = map.getCenter();
      onViewportChangeRef.current({
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      });
    });

    const buildingPane = map.createPane("slopeBuildings");
    buildingPane.style.zIndex = "300";
    void fetchNeighborBuildings()
      .then((features) => {
        if (disposed) return;
        // 드래그·편집 대상에서는 빼고 스냅 목록에는 남긴다. 스냅은 setSnap이 켜고 끈다.
        addNeighborLayer(map, features, null, {
          pane: "slopeBuildings",
          pmIgnore: true,
          snapIgnore: false,
        });
      })
      .catch(() => {
        // 배경 건물은 보조 정보다. 실패해도 경로는 그릴 수 있다.
      });

    // 이미 그린 곳과 안 그린 곳을 보는 용도라 스냅·드래그 모드 대상(pmIgnore)에서 뺀다.
    const othersPane = map.createPane("slopeOthers");
    othersPane.style.zIndex = "320";
    void supabase
      .from("slope_segments")
      .select("id, segments")
      .then(({ data, error }) => {
        if (disposed || error) return;
        for (const route of data ?? []) {
          if (String(route.id) === skipRouteId) continue;
          const points = readRoutePoints(route.segments);
          if (!points) continue;
          const [, ...measured] = points;
          measured.forEach((point, i) => {
            L.polyline(
              [
                [points[i].lat, points[i].lng],
                [point.lat, point.lng],
              ],
              {
                color: SLOPE_GRADE_COLORS[slopeGradeFromDeg(point.slope)],
                weight: 4,
                opacity: 0.55,
                interactive: false,
                pmIgnore: true,
                pane: "slopeOthers",
              },
            ).addTo(map);
          });
        }
      });

    // 편집선(overlayPane, z-index 400)보다 아래에 둔다. "아래에 그린다"를 말로만
    // 두면 실제 순서가 보장되지 않는다.
    const pane = map.createPane("slopePreview");
    pane.style.zIndex = "350";
    pane.classList.add("slope-preview-pane");
    previewRef.current = L.layerGroup([], { pane: "slopePreview" }).addTo(map);
    labelsRef.current = L.layerGroup().addTo(map);

    // 이벤트는 "뭔가 바뀌었다"는 신호로만 쓴다. 무슨 편집이었는지 추론하지
    // 않고 좌표를 레이어에서 다시 읽는다. 멱등이라 중복 호출이 안전하다.
    function syncVertices() {
      const next = line
        ? (line.getLatLngs() as L.LatLng[]).map(({ lat, lng }) => ({
            lat,
            lng,
          }))
        : [];
      verticesRef.current = next;
      // 편집 패널이 초안을 아직 내놓지 않았으면 버린다. 첫 알림은 패널의 초기값과 같은 꼭짓점이다
      draftRef.current?.onVerticesChange(next);
      setVertexVersion((version) => version + 1);
    }

    function lockDrawButton() {
      map.pm.disableDraw("Line");
      map.pm.Toolbar.setButtonDisabled("drawPolyline", true);
    }

    function applyMode() {
      if (!line) return;
      if (mode === "vertex") {
        // geoman의 enableLayerDrag가 꼭짓점 편집을 끄므로, 드래그 모드를 끈 뒤 다시 켠다
        map.pm.disableGlobalDragMode();
        line.pm.enable(EDIT_OPTIONS);
        return;
      }
      line.pm.disable();
      map.pm.enableGlobalDragMode();
    }

    // PolygonEditor.handleReset과 같은 방식: 레이어를 지도에서 직접 지우고
    // 그리기를 다시 연다. key로 지도를 리마운트하면 initialVertices를 다시 읽어
    // 원래 선을 되그리므로 그 방식은 쓰지 않는다.
    function resetLine() {
      map.pm.disableGlobalEditMode();
      map.pm.disableGlobalDragMode();
      if (line) map.removeLayer(line);
      line = null;
      mode = "vertex";
      previewRef.current?.clearLayers();
      map.pm.Toolbar.setButtonDisabled("drawPolyline", false);
      map.pm.enableDraw("Line");
      setEditorState((state) => ({
        ...state,
        hasLine: false,
        mode: "vertex",
      }));
      syncVertices();
    }

    function attachLine(next: L.Polyline) {
      line = next;
      line.pm.enable(EDIT_OPTIONS);
      line.on("pm:edit", syncVertices);
      line.on("pm:markerdragend", syncVertices);
      line.on("pm:dragend", syncVertices);
    }

    map.pm.setLang("ko");
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
    // geoman의 스냅 기본값은 켜짐이다. 건물 스냅은 꺼진 채 시작한다(2026-10-06 설계 5.5)
    map.pm.setGlobalOptions({ snappable: false });
    map.pm.setPathOptions(EDIT_LINE_OPTIONS);

    if (initial?.length) {
      attachLine(
        L.polyline(
          initial.map((vertex) => [vertex.lat, vertex.lng] as [number, number]),
          EDIT_LINE_OPTIONS,
        ).addTo(map),
      );
      lockDrawButton();
      syncVertices();
    }

    map.on("pm:create", (event) => {
      attachLine(event.layer as L.Polyline);
      lockDrawButton();
      setEditorState((state) => ({ ...state, hasLine: true }));
      syncVertices();
    });
    map.on("pm:drawstart", () =>
      setEditorState((state) => ({ ...state, drawing: true })),
    );
    map.on("pm:drawend", () =>
      setEditorState((state) => ({ ...state, drawing: false })),
    );

    if (!initial?.length && "geolocation" in navigator) {
      // 응답은 최대 10초 뒤에 온다. 그 사이 사용자가 지도를 움직였거나 그리기를
      // 시작했으면 화면을 옮기지 않는다 — 그리던 선이 화면 밖으로 사라진다(2026-10-06 설계 5.4).
      let followLocation = true;
      const stopFollowing = () => {
        followLocation = false;
      };
      map.once("dragstart", stopFollowing);
      map.once("zoomstart", stopFollowing);
      map.once("pm:drawstart", stopFollowing);

      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (disposed) return;
          const { latitude, longitude } = coords;
          if (!containsPoint(KU_BOUNDS, latitude, longitude)) return;
          L.circleMarker([latitude, longitude], {
            radius: 7,
            color: "#fff",
            weight: 2,
            fillColor: "#2563EB",
            fillOpacity: 1,
            interactive: false,
            pmIgnore: true,
          }).addTo(map);
          if (followLocation)
            map.setView([latitude, longitude], 18, { animate: false });
        },
        () => {
          // 거부·실패면 넘겨받은 화면에 그대로 둔다.
        },
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    }

    const drawLine = map.pm.Draw.Line as unknown as LineDrawInternals;
    const commands: SlopeEditorCommands = {
      startDraw() {
        if (disposed || editLocked || line) return;
        map.pm.enableDraw("Line");
      },
      finishDraw() {
        if (disposed || !map.pm.globalDrawModeEnabled()) return;
        drawLine._finishShape();
      },
      removeLastVertex() {
        if (disposed || !map.pm.globalDrawModeEnabled()) return;
        drawLine._removeLastVertex();
      },
      cancelDraw() {
        if (disposed) return;
        map.pm.disableDraw();
      },
      setMode(next) {
        if (disposed || editLocked || !line || next === mode) return;
        mode = next;
        applyMode();
        setEditorState((state) => ({ ...state, mode: next }));
      },
      setSnap(on) {
        if (disposed) return;
        map.pm.setGlobalOptions({ snappable: on });
        setEditorState((state) => ({ ...state, snap: on }));
      },
      reset() {
        if (disposed || editLocked) return;
        resetLine();
      },
    };
    controllerRef.current = {
      commands,
      // 저장 요청에 실린 좌표와 화면의 선이 달라지지 않게 저장 중에는 그리기·끌기를 막는다(설계 2026-10-14 3.5)
      setLocked(next) {
        if (disposed || next === editLocked) return;
        editLocked = next;
        if (editLocked) {
          map.pm.disableDraw();
          map.pm.disableGlobalDragMode();
          line?.pm.disable();
          return;
        }
        applyMode();
      },
    };

    const workspaceCommands: WorkspaceMapCommands = {
      focus(target, insets) {
        if (disposed) return false;
        focusWorkspaceMap(map, target, insets);
        return true;
      },
    };
    onCommandsReadyRef.current(workspaceCommands);

    return () => {
      disposed = true;
      // 정리된 지도에 명령이 가지 않게 손잡이부터 거둔다(설계 2026-10-14 3.2)
      onEditorChangeRef.current(null);
      onCommandsReadyRef.current(null);
      controllerRef.current = null;
      map.remove();
      tileLayerRef.current = null;
      previewRef.current = null;
      labelsRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setLocked(locked);
  }, [locked]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    onEditorChangeRef.current({
      owner,
      state: editorState,
      commands: controller.commands,
    });
  }, [owner, editorState]);

  useEffect(() => {
    tileLayerRef.current?.setUrl(getCartoTileUrl(prefersDarkMode));
  }, [prefersDarkMode]);

  useEffect(() => {
    const group = previewRef.current;
    const labels = labelsRef.current;
    if (!group || !labels) return;
    group.clearLayers();
    labels.clearLayers();
    const vertices = verticesRef.current;
    for (let i = 0; i < vertices.length - 1; i++) {
      const from = vertices[i];
      const to = vertices[i + 1];
      L.marker([(from.lat + to.lat) / 2, (from.lng + to.lng) / 2], {
        icon: L.divIcon({
          className: "ku-slope-segment-label",
          html: String(i + 1),
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        interactive: false,
        keyboard: false,
        pmIgnore: true,
      }).addTo(labels);

      // 초안이 아직 없으면(패널이 곧 내놓는다) 미리보기 없이 둔다
      const slope = slopes?.[i];
      if (
        slope === null ||
        slope === undefined ||
        !Number.isFinite(slope) ||
        !isSlopeDegInRange(slope)
      )
        continue;
      L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        {
          color: SLOPE_GRADE_COLORS[slopeGradeFromDeg(slope)],
          weight: 9,
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
      className="ku-slope-route-map"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
