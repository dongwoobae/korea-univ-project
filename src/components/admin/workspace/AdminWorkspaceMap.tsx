"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  GeoJSON,
  MapContainer,
  Pane,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import {
  NEIGHBOR_STYLE,
  fetchNeighborBuildings,
} from "@/lib/neighborBuildings";
import { neighborPointToLayer } from "@/lib/neighborLayer";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";
import { WORKSPACE_MAX_ZOOM, bindWorkspaceMapCommands } from "./focusMap";
import type { WorkspaceMapSlotProps } from "./types";

// 기본 tooltipPane은 markerPane 위라 이름표가 시설 마커를 가린다. 폴리곤과 마커 사이에 둔다(설계 2026-10-14 3.5)
const BUILDING_LABEL_PANE = "workspaceBuildingLabels";

function NeighborBuildings() {
  const [features, setFeatures] = useState<Feature[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchNeighborBuildings()
      .then((loaded) => {
        if (!cancelled) setFeatures(loaded);
      })
      .catch(() => {
        // 배경 건물은 보조 정보다. 실패해도 작업 화면은 쓸 수 있다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!features) return null;
  return (
    <GeoJSON
      key={features.length}
      data={{ type: "FeatureCollection", features } as FeatureCollection}
      style={NEIGHBOR_STYLE}
      interactive={false}
      pointToLayer={(_feature, latlng) => neighborPointToLayer(latlng)}
      onEachFeature={(feature, layer) => {
        if (feature.properties?.name) {
          layer.bindTooltip(feature.properties.name, {
            permanent: true,
            direction: "center",
            className: "bldg-label",
            pane: BUILDING_LABEL_PANE,
          });
        }
      }}
    />
  );
}

function MapEvents({
  onViewportChange,
  onMapClick,
}: {
  onViewportChange: WorkspaceMapSlotProps["onViewportChange"];
  onMapClick?: (lat: number, lng: number) => void;
}) {
  const map = useMapEvents({
    moveend() {
      const center = map.getCenter();
      onViewportChange({
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      });
    },
    click(event) {
      onMapClick?.(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function CommandsBridge({
  onCommandsReady,
}: Pick<WorkspaceMapSlotProps, "onCommandsReady">) {
  const map = useMap();
  const onCommandsReadyRef = useRef(onCommandsReady);

  useEffect(() => {
    onCommandsReadyRef.current = onCommandsReady;
  }, [onCommandsReady]);

  useEffect(() => {
    const { commands, dispose } = bindWorkspaceMapCommands(map);
    onCommandsReadyRef.current(commands);
    // React는 지운 트리의 effect 정리를 부모부터 부른다. MapContainer의 remove()가 이 정리보다 먼저 돈다
    return () => {
      dispose();
      onCommandsReadyRef.current(null);
    };
  }, [map]);

  return null;
}

interface AdminWorkspaceMapProps extends WorkspaceMapSlotProps {
  onMapClick?: (lat: number, lng: number) => void;
  /** 탭별 레이어(react-leaflet 컴포넌트) */
  children?: ReactNode;
}

export default function AdminWorkspaceMap({
  initialViewport,
  onViewportChange,
  onCommandsReady,
  onMapClick,
  children,
}: AdminWorkspaceMapProps) {
  const prefersDarkMode = usePrefersDarkMode();

  return (
    <MapContainer
      center={initialViewport.center}
      zoom={initialViewport.zoom}
      maxZoom={WORKSPACE_MAX_ZOOM}
      zoomControl={false}
      scrollWheelZoom
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        key={prefersDarkMode ? "dark" : "light"}
        url={getCartoTileUrl(prefersDarkMode)}
        attribution={CARTO_ATTRIBUTION}
        subdomains="abcd"
        maxZoom={WORKSPACE_MAX_ZOOM}
      />
      <Pane
        name={BUILDING_LABEL_PANE}
        style={{ zIndex: 450, pointerEvents: "none" }}
      />
      <NeighborBuildings />
      <ZoomControl position="topleft" zoomInTitle="확대" zoomOutTitle="축소" />
      <MapEvents onViewportChange={onViewportChange} onMapClick={onMapClick} />
      <CommandsBridge onCommandsReady={onCommandsReady} />
      {children}
    </MapContainer>
  );
}
