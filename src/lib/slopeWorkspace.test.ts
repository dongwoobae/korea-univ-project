import { describe, expect, it } from "vitest";
import { viewAdminCollection } from "./adminCollection";
import { formatAdminUpdatedAt } from "./adminList";
import {
  formatMeters,
  formatSlopeRouteMeta,
  SLOPE_COLLECTION_POLICY,
  slopeRouteBadge,
  summarizeSlopeRoute,
  verticesBounds,
  type SlopeListItem,
} from "./slopeWorkspace";
import type { SlopeSegment } from "@/types/domain";

const MOCK_ROUTE_2 = [
  { lat: 37.5861, lng: 127.0268, ele: null },
  {
    lat: 37.5862,
    lng: 127.0269,
    ele: null,
    slope: 7.2,
    distance: 12.4,
  },
];

const THREE_SEGMENTS = [
  { lat: 37.58, lng: 127.02 },
  { lat: 37.581, lng: 127.021, slope: 3, distance: 10.04 },
  { lat: 37.579, lng: 127.023, slope: 10, distance: 20.03 },
  { lat: 37.582, lng: 127.022, slope: 20, distance: 5.01 },
];

function item(id: number, name: string, raw: unknown): SlopeListItem {
  return {
    route: {
      id,
      name,
      segments: raw,
      updated_at: "2026-10-01T00:00:00Z",
    } as unknown as SlopeSegment,
    summary: summarizeSlopeRoute(raw),
  };
}

describe("summarizeSlopeRoute", () => {
  it("구간 하나짜리 경로를 요약한다", () => {
    const summary = summarizeSlopeRoute(MOCK_ROUTE_2);
    expect(summary).not.toBeNull();
    expect(summary!.segments).toHaveLength(1);
    expect(summary!.totalDistance).toBe(12.4);
    expect(summary!.maxSlope).toBe(7.2);
    expect(summary!.vertices).toEqual([
      { lat: 37.5861, lng: 127.0268 },
      { lat: 37.5862, lng: 127.0269 },
    ]);
    expect(summary!.segments[0].from).toEqual([37.5861, 127.0268]);
    expect(summary!.segments[0].to).toEqual([37.5862, 127.0269]);
  });

  it("세 구간의 합계·최대·경계", () => {
    const summary = summarizeSlopeRoute(THREE_SEGMENTS)!;
    expect(summary.totalDistance).toBe(35.1);
    expect(summary.maxSlope).toBe(20);
    expect(summary.bounds).toEqual([
      [37.579, 127.02],
      [37.582, 127.023],
    ]);
  });

  it("깨진 형식은 null이다", () => {
    expect(
      summarizeSlopeRoute([
        { lat: 1, lng: 2 },
        { lat: 1, lng: 2 },
      ]),
    ).toBeNull();
    expect(summarizeSlopeRoute([{ lat: 1, lng: 2 }])).toBeNull();
    expect(summarizeSlopeRoute({ lat: 1 })).toBeNull();
  });
});

describe("slopeRouteBadge", () => {
  it("형식 오류만 배지가 있다", () => {
    expect(slopeRouteBadge(null)).toEqual({
      label: "형식 오류",
      tone: "missing",
    });
    expect(slopeRouteBadge(summarizeSlopeRoute(THREE_SEGMENTS))).toBeNull();
    expect(slopeRouteBadge(summarizeSlopeRoute(MOCK_ROUTE_2))).toBeNull();
  });
});

describe("SLOPE_COLLECTION_POLICY", () => {
  const okOnly = item(1, "평지", [
    { lat: 37.58, lng: 127.02 },
    { lat: 37.581, lng: 127.021, slope: 1, distance: 5 },
  ]);
  const hasOver = item(2, "언덕", MOCK_ROUTE_2);
  const hasExtreme = item(3, "급경사", THREE_SEGMENTS);
  const broken = item(4, "깨짐", "nope");
  const items = [okOnly, hasOver, hasExtreme, broken];
  const query = {
    search: "",
    chip: "all",
    sort: "updated-desc",
    page: 1,
  } as const;

  it("검색은 이름으로 거른다", () => {
    const view = viewAdminCollection(items, SLOPE_COLLECTION_POLICY, {
      ...query,
      search: "언덕",
    });
    expect(view.matched.map((entry) => entry.route.name)).toEqual(["언덕"]);
  });

  it("id는 숫자 id도 문자열이다", () => {
    expect(SLOPE_COLLECTION_POLICY.id(hasOver)).toBe(String(2));
  });
});

describe("formatSlopeRouteMeta", () => {
  it("요약이 있으면 구간·거리·최대 경사·수정일", () => {
    const updatedAt = "2026-10-01T00:00:00Z";
    expect(
      formatSlopeRouteMeta(summarizeSlopeRoute(MOCK_ROUTE_2), updatedAt),
    ).toBe(`1개 구간 · 12.4m · 최대 7.2° · ${formatAdminUpdatedAt(updatedAt)}`);
  });

  it("요약이 없으면 수정일만", () => {
    const updatedAt = "2026-10-01T00:00:00Z";
    expect(formatSlopeRouteMeta(null, updatedAt)).toBe(
      formatAdminUpdatedAt(updatedAt),
    );
  });
});

describe("formatMeters / verticesBounds", () => {
  it("뒤 0 없이 m를 붙인다", () => {
    expect(formatMeters(40)).toBe("40m");
    expect(formatMeters(12.4)).toBe("12.4m");
  });

  it("꼭짓점이 없으면 경계도 없다", () => {
    expect(verticesBounds([])).toBeNull();
  });
});
