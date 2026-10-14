"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import {
  NEIGHBOR_STYLE,
  fetchNeighborBuildings,
} from "@/lib/neighborBuildings";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";
import type { WorkspaceMapCommands, WorkspaceMapSlotProps } from "./types";

const MAX_ZOOM = 19;
/** 멀리서 고른 항목은 이만큼은 당겨서 보인다 */
const FOCUS_MIN_ZOOM = 17;

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
      onEachFeature={(feature, layer) => {
        if (feature.properties?.name) {
          layer.bindTooltip(feature.properties.name, {
            permanent: true,
            direction: "center",
            className: "bldg-label",
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
    // 정리된 지도에 명령이 가지 않게 한다. 정리 순서가 바뀌어도 막히도록 unload도 본다.
    let disposed = false;
    const markDisposed = () => {
      disposed = true;
    };
    map.on("unload", markDisposed);
    const commands: WorkspaceMapCommands = {
      focus(target, insets) {
        if (disposed) return;
        const isPoint = "point" in target;
        const bounds = isPoint
          ? L.latLngBounds(target.point, target.point)
          : L.latLngBounds(target.bounds);
        map.fitBounds(bounds, {
          paddingTopLeft: [insets.left, insets.top],
          paddingBottomRight: [insets.right, insets.bottom],
          maxZoom: isPoint ? Math.max(map.getZoom(), FOCUS_MIN_ZOOM) : MAX_ZOOM,
        });
      },
    };
    onCommandsReadyRef.current(commands);
    return () => {
      disposed = true;
      map.off("unload", markDisposed);
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
      maxZoom={MAX_ZOOM}
      zoomControl={false}
      scrollWheelZoom
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        key={prefersDarkMode ? "dark" : "light"}
        url={getCartoTileUrl(prefersDarkMode)}
        attribution={CARTO_ATTRIBUTION}
        subdomains="abcd"
        maxZoom={MAX_ZOOM}
      />
      <NeighborBuildings />
      <ZoomControl position="topleft" zoomInTitle="확대" zoomOutTitle="축소" />
      <MapEvents onViewportChange={onViewportChange} onMapClick={onMapClick} />
      <CommandsBridge onCommandsReady={onCommandsReady} />
      {children}
    </MapContainer>
  );
}
