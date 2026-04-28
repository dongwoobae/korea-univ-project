import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

const OVERPASS_QUERY = `
[out:json][timeout:30];
way["building"]["name"](37.5855,127.0270,37.5940,127.0400);
out geom qt;
`;

export async function GET() {
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

  const buildings = data.elements.filter((el) => el.tags?.name);

  const { data: existingBuildings } = await supabase
    .from("buildings")
    .select("id");
  const existingIds = new Set(existingBuildings.map((b) => b.id));

  let added = 0;
  let skipped = 0;

  for (const building of buildings) {
    if (existingIds.has(building.id)) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from("buildings").insert({
      id: building.id,
      name: building.tags.name,
      name_en: building.tags["name:en"] ?? null,
      campus: "서울",
    });

    if (!error) added++;
  }

  return Response.json({ success: true, added, skipped });
}
