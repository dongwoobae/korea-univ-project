const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const OVERPASS_QUERY = `
[out:json][timeout:30];
way["building"]["name"](37.5855,127.0270,37.5940,127.0400);
out geom qt;
`;

async function syncBuildings() {
  console.log("Overpass에서 건물 검색데이터 가져오는 중...");

  const res = await fetch("https://overpass.kumi.systems/api/interpreter", {
    method: "POST",
    body: new URLSearchParams({ data: OVERPASS_QUERY }),
    headers: { "User-Agent": "KU-BarrierFree-Map/1.0" },
  });

  const data = await res.json();
  const buildings = data.elements.filter((el) => el.tags?.name);
  console.log(`건물${buildings.length}개 발견`);

  const { data: existingBuildings } = await supabase
    .from("buildings")
    .select("id");

  const existingIds = new Set(existingBuildings.map((b) => b.id));
  console.log(`기존 건물${existingIds.size}개`);

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

    if (error) {
      console.error(`실패: ${building.tags.name}`, error);
    } else {
      console.log(`추가: ${building.tags.name} (${building.id})`);
      added++;
    }
  }

  console.log(`완료 — 추가 ${added}개 / 스킵 ${skipped}개`);
}

syncBuildings();
