import type { InboxKindFilter } from "./inboxBoard";

export interface InboxUrlState {
  kind: InboxKindFilter;
  building: number | null;
}

function parseBuilding(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function readInboxUrl(search: string): InboxUrlState {
  const params = new URLSearchParams(search);
  const building = parseBuilding(params.get("building"));
  // 건물 필터는 등록 요청 API에만 있어서 피드백과 섞이지 않게 종류를 고정한다.
  if (building !== null) return { kind: "requests", building };
  const tab = params.get("tab");
  return {
    kind: tab === "requests" || tab === "feedback" ? tab : "all",
    building: null,
  };
}

export function writeInboxUrl(search: string, next: InboxUrlState): string {
  const params = new URLSearchParams(search);
  if (next.kind === "all") params.delete("tab");
  else params.set("tab", next.kind);
  if (next.building === null) params.delete("building");
  else params.set("building", String(next.building));
  const query = params.toString();
  return query ? `?${query}` : "";
}
