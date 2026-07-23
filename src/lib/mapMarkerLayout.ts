export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * 가까운 지도 항목을 화면 픽셀 기준 격자로 묶는다.
 * 위경도 고정 거리가 아니라 현재 줌의 투영 좌표를 사용하므로 줌이 낮을수록
 * 자연스럽게 더 많은 항목이 하나의 그룹에 포함된다.
 */
export function groupByPixelGrid<T>(
  items: T[],
  project: (item: T) => PixelPoint,
  cellSize = 52,
): T[][] {
  const groups: { anchor: PixelPoint; items: T[] }[] = [];

  for (const item of items) {
    const point = project(item);
    const group = groups.find(
      ({ anchor }) =>
        Math.hypot(point.x - anchor.x, point.y - anchor.y) < cellSize,
    );
    if (group) group.items.push(item);
    else groups.push({ anchor: point, items: [item] });
  }

  return groups.map((group) => group.items);
}
