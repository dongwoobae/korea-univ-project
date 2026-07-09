"use client";

import { Marker } from "react-leaflet";
import L from "leaflet";
import { SUBWAY_STATIONS } from "./subwayStations";
import type { LangCode } from "@/lib/translations";

const subwayIcon = (name: string) =>
  L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))"><div style="background:#B9282D;color:white;border:2.5px solid white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;">🚇</div><div style="background:#B9282D;color:white;border-radius:10px;padding:2px 7px;font-size:11px;font-weight:700;margin-top:3px;white-space:nowrap;border:1.5px solid white;">${name}</div></div>`,
    iconAnchor: [16, 44],
    popupAnchor: [0, -46],
  });

interface SubwayMarkersProps {
  lang: LangCode;
  onSelect: (station: { id: number; name: string }) => void;
}

export default function SubwayMarkers({ lang, onSelect }: SubwayMarkersProps) {
  return (
    <>
      {SUBWAY_STATIONS.map((s) => {
        const displayName = lang === "ko" ? s.name : lang === "en" ? s.name_en : s.name_zh;
        return (
          <Marker
            key={s.name}
            position={[s.lat, s.lng]}
            icon={subwayIcon(displayName)}
            zIndexOffset={1000}
            eventHandlers={{ click() { onSelect({ id: s.id, name: displayName }); } }}
          />
        );
      })}
    </>
  );
}
