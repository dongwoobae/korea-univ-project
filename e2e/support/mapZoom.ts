/**
 * Leaflet 지도의 줌을 읽고 한 단계씩 바꾸는 헬퍼. 지도 인스턴스는 페이지 밖에서 잡을 수 없어 DOM에서 읽는다.
 */
import { expect, type Locator } from "@playwright/test";

/**
 * 지도의 지금 줌. Leaflet은 지금 줌의 타일 판에 가장 큰 z-index를 준다. 그 판에 깔린 타일 주소에서 읽는다
 * (타일 요청은 막혀도 주소는 남는다)
 */
export function tileZoom(map: Locator) {
  return map.locator(".leaflet-tile-container").evaluateAll((levels) => {
    const [top] = (levels as HTMLElement[]).sort(
      (a, b) => Number(b.style.zIndex) - Number(a.style.zIndex),
    );
    const match = top
      ?.querySelector("img")
      ?.src.match(/\/(\d+)\/\d+\/\d+(?:@2x)?\.png/);
    return match ? Number(match[1]) : null;
  });
}

/** 축소 버튼을 한 번 누르고 줌 애니메이션이 끝나기를 기다린다. 애니메이션 중에 누른 줌은 Leaflet이 버린다 */
export async function zoomOutTo(map: Locator, zoom: number) {
  const zoomOut = map.locator(".leaflet-control-zoom-out");
  await expect(zoomOut).not.toHaveClass(/leaflet-disabled/);
  await zoomOut.click();
  await expect.poll(() => tileZoom(map)).toBe(zoom);
  await expect(map.locator(".leaflet-map-pane")).not.toHaveClass(
    /leaflet-zoom-anim/,
  );
}

/** 지금 줌에서 `minZoom`까지 한 단계씩 물러난 뒤, 더는 물러날 수 없는지(축소 버튼이 꺼졌는지) 본다 */
export async function expectMinZoom(
  map: Locator,
  from: number,
  minZoom: number,
) {
  await expect.poll(() => tileZoom(map)).toBe(from);
  for (let zoom = from - 1; zoom >= minZoom; zoom--) await zoomOutTo(map, zoom);
  await expect(map.locator(".leaflet-control-zoom-out")).toHaveClass(
    /leaflet-disabled/,
  );
}
