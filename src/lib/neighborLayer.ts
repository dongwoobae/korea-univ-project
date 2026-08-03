import L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import { NEIGHBOR_STYLE } from "@/lib/neighborBuildings";

/**
 * 주변 건물(회색 배경) 레이어를 지도에 그린다.
 *
 * `BuildingPolygonPreview`와 `PolygonEditor` 둘 다 같은 방식으로 그려야 하므로
 * (편집 버튼을 눌렀을 때 화면이 튀지 않아야 한다) 렌더링 로직을 여기 한 곳에
 * 모은다. 복사해두면 한쪽만 고쳐지는 사고가 난다.
 *
 * `leaflet`을 정적으로 import하므로, 이 모듈은 SSR되는 페이지가 아니라
 * `dynamic(..., { ssr: false })`로 로드되는 컴포넌트에서만 import해야 한다.
 * 주변 건물 "조회"는 `src/lib/neighborBuildings.ts`가 맡고 있으며, 그 모듈은
 * 서버 렌더링되는 페이지에서도 정적으로 import되므로 Leaflet을 끌어들이면 안
 * 된다 — 이 파일을 분리해 둔 이유다.
 */
export function addNeighborLayer(
  map: L.Map,
  features: Feature[],
  excludeId: number | null,
): void {
  const filtered = features.filter(
    (feature) => String(feature.properties?.bid) !== String(excludeId ?? ""),
  );
  L.geoJSON(
    { type: "FeatureCollection", features: filtered } as FeatureCollection,
    {
      style: NEIGHBOR_STYLE,
      interactive: false,
      onEachFeature: (f, layer) => {
        if (f.properties?.name) {
          layer.bindTooltip(f.properties.name, {
            permanent: true,
            direction: "center",
            className: "bldg-label",
          });
        }
      },
    },
  ).addTo(map);
}
