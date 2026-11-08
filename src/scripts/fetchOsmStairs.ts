import { readFile, writeFile } from "node:fs/promises";
import {
  buildStairsSnapshot,
  campusBoundingBox,
  overpassStairsQuery,
} from "../lib/osmStairs.ts";

// syncBuildings.ts의 서버가 2026-11-08 응답하지 않아 공개 기본 서버
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CAMPUS_FILE = "public/campus-boundaries.geojson";
const SNAPSHOT_FILE = "public/osm-stairs.geojson";

async function main() {
  const campuses: unknown = JSON.parse(await readFile(CAMPUS_FILE, "utf8"));
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    body: new URLSearchParams({
      data: overpassStairsQuery(campusBoundingBox(campuses)),
    }),
    headers: { "User-Agent": "KU-BarrierFree-Map/1.0" },
  });
  if (!response.ok) throw new Error(`Overpass ${response.status}`);
  // Overpass는 오류를 200 + XML로도 준다. json()이 던지면 파일을 덮지 않는다
  const snapshot = buildStairsSnapshot(
    await response.json(),
    campuses,
    new Date().toISOString(),
  );
  await writeFile(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`계단 ${snapshot.features.length}개를 ${SNAPSHOT_FILE}에 썼어요`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
