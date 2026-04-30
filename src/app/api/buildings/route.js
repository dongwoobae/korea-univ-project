import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

export const revalidate = 86400;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

const OVERPASS_QUERY = `
[out:json][timeout:30];
way(26253960);
map_to_area->.campus;
way["building"]["name"](area.campus);
out geom qt;
`;

function toGeoJSONFeature(element) {
  const coords = element.geometry.map((pt) => [pt.lon, pt.lat]);
  // 폴리곤 링 닫기
  if (coords.length > 0) {
    const [f, l] = [coords[0], coords[coords.length - 1]];
    if (f[0] !== l[0] || f[1] !== l[1]) coords.push(f);
  }
  return {
    type: "Feature",
    properties: {
      id: element.id,
      name: element.tags.name,
      name_en: element.tags["name:en"] ?? null,
    },
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // ?sync=true → Overpass 동기화 모드 (관리자가 수동 실행)
  if (searchParams.get("sync") === "true") {
    //시크릿 키 검증
    const secret = searchParams.get("secret");
    if (secret !== process.env.SYNC_SECRET)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    return handleSync();
  }

  // 일반 모드 → Supabase에서 GeoJSON FeatureCollection 반환
  const { data, error } = await supabase
    .from("buildings")
    .select("id, name, name_en, geojson")
    .not("geojson", "is", null);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const featureCollection = {
    type: "FeatureCollection",
    features: data.map((b) => ({
      ...b.geojson,
      properties: {
        ...b.geojson.properties,
        id: b.id,
        name: b.name,
        name_en: b.name_en,
      },
    })),
  };

  return Response.json(featureCollection);
}

async function handleSync() {
  let data = null;

  for (const server of OVERPASS_SERVERS) {
    try {
      const res = await fetch(server, {
        method: "POST",
        body: new URLSearchParams({ data: OVERPASS_QUERY }),
        headers: { "User-Agent": "KU-BarrierFree-Map/1.0" },
      });
      if (!res.ok) continue;
      data = await res.json();
      break;
    } catch {
      continue;
    }
  }

  if (!data)
    return Response.json({ error: "Overpass 서버 모두 실패" }, { status: 500 });

  const buildings = data.elements.filter(
    (el) => el.tags?.name && el.geometry?.length > 0,
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  // geojson이 없는 건물만 업데이트
  const { data: existing } = await supabase
    .from("buildings")
    .select("id")
    .not("geojson", "is", null);

  const existingWithGeoJSON = new Set(existing.map((b) => b.id));

  for (const building of buildings) {
    if (existingWithGeoJSON.has(building.id)) {
      skipped++;
      continue; // geojson 있으면 패스
    }
    const geojson = toGeoJSONFeature(building);
    const { error } = await supabase.from("buildings").upsert(
      {
        id: building.id,
        name: building.tags.name,
        name_en: building.tags["name:en"] ?? null,
        //campus: "서울",
        geojson,
      },
      { onConflict: "id" },
    );
    if (!error) updated++;
    else failed++;
  }

  revalidatePath("/api/buildings");

  return Response.json({
    success: true,
    updated,
    skipped,
    failed,
    total: buildings.length,
  });
}
