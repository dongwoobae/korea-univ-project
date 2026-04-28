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

export const revalidate = 86400;

export async function GET() {
  let lastError = null;

  for (const server of OVERPASS_SERVERS) {
    try {
      console.log(`Overpass 요청 시도: ${server}`);

      const res = await fetch(server, {
        method: "POST",
        body: new URLSearchParams({ data: OVERPASS_QUERY }),
        headers: { "User-Agent": "KU-BarrierFree-Map/1.0" },
        next: { revalidate: 86400 },
      });

      if (!res.ok) {
        console.log(`${server} 실패 — status: ${res.status}`);
        lastError = `status ${res.status}`;
        continue;
      }

      const text = await res.text();
      const data = JSON.parse(text);

      console.log(`성공: ${server}`);
      return Response.json(data);
    } catch (err) {
      console.error(`${server} 오류:`, err.message);
      lastError = err.message;
      continue;
    }
  }

  console.error("모든 Overpass 서버 실패:", lastError);
  return Response.json(
    { error: "모든 서버 요청 실패", detail: lastError },
    { status: 500 },
  );
}
