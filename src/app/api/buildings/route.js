export const revalidate = 86400; // 24시간에 한 번만 Overpass 호출
const OVERPASS_QUERY = `
[out:json][timeout:30];
way(26253960);
map_to_area->.campus;
way["building"](area.campus);
out geom qt;
`;

export async function GET() {
  try {
    // const res = await fetch("https://overpass-api.de/api/interpreter", {
    //   method: "POST",
    //   body: new URLSearchParams({ data: OVERPASS_QUERY }),
    //   next: { revalidate: 86400 }, // Next.js fetch 캐시
    // });
    const res = await fetch("https://overpass.kumi.systems/api/interpreter", {
      method: "POST",
      body: new URLSearchParams({ data: OVERPASS_QUERY }),
      headers: {
        "User-Agent": "KU-BarrierFree-Map/1.0 (dw5817@naver.com)",
      },
      next: { revalidate: 86400 },
    });
    const text = await res.text();
    console.log("Overpass API 응답 status : ", res.status); // 응답 로그 추가
    console.log("Overpass 응답 body:", text); // 응답 본문 로그 추가

    if (!res.ok) {
      return Response.json(
        { error: "Overpass API 호출 실패" },
        { status: 500 },
      );
    }
    const data = JSON.parse(text);
    return Response.json(data);
  } catch (err) {
    console.error("Overpass API 호출 중 오류:", err);
    return Response.json({ error: "Overpass API 호출 실패" }, { status: 500 });
  }
}
