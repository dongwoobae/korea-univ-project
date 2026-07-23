"use client";

import { useCallback, useEffect } from "react";
import { useMap, useMapEvents } from "react-leaflet";

export interface MapViewport {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
}

interface MapViewportObserverProps {
  onChange: (viewport: MapViewport) => void;
}

export function containsMapPoint(
  viewport: MapViewport | null,
  lat: number,
  lng: number,
) {
  if (!viewport) return false;
  return (
    lat <= viewport.north &&
    lat >= viewport.south &&
    lng <= viewport.east &&
    lng >= viewport.west
  );
}

export default function MapViewportObserver({
  onChange,
}: MapViewportObserverProps) {
  const map = useMap();

  const publish = useCallback(() => {
    const bounds = map.getBounds();
    onChange({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
      zoom: map.getZoom(),
    });
  }, [map, onChange]);

  useMapEvents({
    moveend: publish,
    zoomend: publish,
  });

  useEffect(() => {
    publish();
  }, [publish]);

  return null;
}
