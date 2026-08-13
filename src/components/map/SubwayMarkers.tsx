"use client";

import { memo } from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";
import { SUBWAY_STATIONS } from "./subwayStations";
import type { LangCode } from "@/lib/translations";
import { SUBWAY_ICON_SVG, sizedIconSvg } from "@/lib/mapIcons";

// divIcon은 키별로 캐시해 참조를 유지 — 렌더마다 새 인스턴스를 만들면
// react-leaflet이 매번 setIcon으로 마커 DOM을 교체한다.
const iconCache = new Map<string, L.DivIcon>();

const subwayIcon = (name: string, showLabel: boolean) => {
  const key = `subway|${name}|${showLabel}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: "",
      html: `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))"><div style="background:#B9282D;color:white;border:2.5px solid white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;"><span aria-hidden="true" style="display:flex">${sizedIconSvg(SUBWAY_ICON_SVG, 17)}</span></div>${showLabel ? `<div data-testid="subway-label" style="background:#B9282D;color:white;border-radius:10px;padding:2px 7px;font-size:11px;font-weight:700;margin-top:3px;white-space:nowrap;border:1.5px solid white;">${name}</div>` : ""}</div>`,
      iconAnchor: [16, 44],
      popupAnchor: [0, -46],
    });
    iconCache.set(key, icon);
  }
  return icon;
};

interface SubwayMarkersProps {
  lang: LangCode;
  zoom: number;
  onSelect: (station: { id: number; name: string }) => void;
}

function SubwayMarkers({ lang, zoom, onSelect }: SubwayMarkersProps) {
  return (
    <>
      {SUBWAY_STATIONS.map((s) => {
        const displayName =
          lang === "ko" ? s.name : lang === "en" ? s.name_en : s.name_zh;
        return (
          <Marker
            key={s.name}
            position={[s.lat, s.lng]}
            icon={subwayIcon(displayName, zoom >= 17)}
            title={displayName}
            alt={displayName}
            zIndexOffset={1000}
            eventHandlers={{
              click() {
                onSelect({ id: s.id, name: displayName });
              },
            }}
          />
        );
      })}
    </>
  );
}

// 부모(Map)가 툴팁/뷰포트 갱신으로 리렌더될 때 마커 재생성을 건너뛴다.
// onSelect는 참조가 안정적이어야 memo가 유효하다(Map에서 setState를 직접 전달).
export default memo(SubwayMarkers);
