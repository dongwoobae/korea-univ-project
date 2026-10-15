import { ADMIN_PAGE_SIZE } from "./adminList";
import type {
  FacilityRequestListItem,
  FeedbackItem,
  InboxFilter,
} from "./inboxStatus";

export type InboxKind = "requests" | "feedback";
export type InboxKindFilter = "all" | InboxKind;

export type InboxCard =
  | { kind: "requests"; item: FacilityRequestListItem }
  | { kind: "feedback"; item: FeedbackItem };

export function inboxCardKey(card: InboxCard): string {
  return `${card.kind}:${card.item.id}`;
}

const KIND_ORDER: Record<InboxKind, number> = { requests: 0, feedback: 1 };

/** 접수 시각 내림차순, 같으면 등록 요청 먼저, 같으면 id 오름차순 */
export function compareInboxCards(a: InboxCard, b: InboxCard): number {
  if (a.item.created_at !== b.item.created_at) {
    return a.item.created_at < b.item.created_at ? 1 : -1;
  }
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (a.item.id === b.item.id) return 0;
  return a.item.id < b.item.id ? -1 : 1;
}

/** 소스(열 × 종류) 하나의 상태 */
export interface InboxSourceState {
  status: "loading" | "error" | "ready";
  items: InboxCard[];
  total: number;
  /** 마지막으로 받은 페이지. 0이면 아직 없음 */
  page: number;
  more: "idle" | "loading" | "error";
}

export interface InboxBoardOptions {
  columns: InboxFilter[];
  kinds: InboxKind[];
  building: number | null;
}

type InboxColumnState = {
  filter: InboxFilter;
  sources: Partial<Record<InboxKind, InboxSourceState>>;
};

export interface InboxBoardState {
  generation: number;
  optionsKey: string;
  columns: InboxColumnState[];
}

export function inboxBoardOptionsKey(options: InboxBoardOptions): string {
  return JSON.stringify([options.columns, options.kinds, options.building]);
}

function loadingSource(): InboxSourceState {
  return { status: "loading", items: [], total: 0, page: 0, more: "idle" };
}

function buildColumns(options: InboxBoardOptions): InboxColumnState[] {
  return options.columns.map((filter) => ({
    filter,
    sources: Object.fromEntries(
      options.kinds.map((kind) => [kind, loadingSource()]),
    ),
  }));
}

export function initialInboxBoardState(
  options: InboxBoardOptions,
): InboxBoardState {
  return {
    generation: 1,
    optionsKey: inboxBoardOptionsKey(options),
    columns: buildColumns(options),
  };
}

export type InboxBoardAction =
  | { type: "load"; options: InboxBoardOptions }
  | {
      type: "pageLoaded";
      generation: number;
      filter: InboxFilter;
      kind: InboxKind;
      page: number;
      cards: InboxCard[];
      total: number;
    }
  | {
      type: "pageFailed";
      generation: number;
      filter: InboxFilter;
      kind: InboxKind;
      page: number;
    }
  | { type: "moreRequested"; filter: InboxFilter; kind: InboxKind }
  | { type: "firstPageRetryRequested"; filter: InboxFilter; kind: InboxKind };

// 오프셋 페이지라 사이에 새 접수가 들어오면 다음 페이지 첫 줄이 앞 페이지 끝 줄과 겹친다. 먼저 받은 것을 둔다.
function mergeUnique(base: InboxCard[], added: InboxCard[]): InboxCard[] {
  const seen = new Set(base.map(inboxCardKey));
  const merged = [...base];
  for (const card of added) {
    const key = inboxCardKey(card);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(card);
  }
  return merged;
}

/** 소스를 바꾼 새 state를 만든다. update가 같은 소스를 돌려주면 state도 그대로다. */
function updateSource(
  state: InboxBoardState,
  filter: InboxFilter,
  kind: InboxKind,
  update: (source: InboxSourceState) => InboxSourceState,
): InboxBoardState {
  const column = state.columns.find((c) => c.filter === filter);
  const source = column?.sources[kind];
  if (!column || !source) return state;
  const next = update(source);
  if (next === source) return state;
  return {
    ...state,
    columns: state.columns.map((c) =>
      c === column ? { ...c, sources: { ...c.sources, [kind]: next } } : c,
    ),
  };
}

export function inboxBoardReducer(
  state: InboxBoardState,
  action: InboxBoardAction,
): InboxBoardState {
  switch (action.type) {
    case "load":
      return {
        generation: state.generation + 1,
        optionsKey: inboxBoardOptionsKey(action.options),
        columns: buildColumns(action.options),
      };
    case "pageLoaded": {
      if (action.generation !== state.generation) return state;
      return updateSource(state, action.filter, action.kind, (source) => {
        if (action.page === 1) {
          if (source.status !== "loading") return source;
          return {
            status: "ready",
            items: mergeUnique([], action.cards),
            total: action.total,
            page: 1,
            more: "idle",
          };
        }
        if (source.more !== "loading" || action.page !== source.page + 1) {
          return source;
        }
        return {
          ...source,
          items: mergeUnique(source.items, action.cards),
          total: action.total,
          page: action.page,
          more: "idle",
        };
      });
    }
    case "pageFailed": {
      if (action.generation !== state.generation) return state;
      return updateSource(state, action.filter, action.kind, (source) => {
        if (action.page === 1) {
          return source.status === "loading"
            ? { ...source, status: "error" }
            : source;
        }
        return source.more === "loading" && action.page === source.page + 1
          ? { ...source, more: "error" }
          : source;
      });
    }
    case "moreRequested":
      return updateSource(state, action.filter, action.kind, (source) =>
        source.status !== "ready" || source.more === "loading"
          ? source
          : { ...source, more: "loading" },
      );
    case "firstPageRetryRequested":
      return updateSource(state, action.filter, action.kind, (source) =>
        source.status === "error" ? { ...source, status: "loading" } : source,
      );
  }
}

export function hasMorePages(source: InboxSourceState): boolean {
  return source.page * ADMIN_PAGE_SIZE < source.total;
}

export function columnCards(
  column: InboxColumnState,
  kinds: InboxKind[],
): InboxCard[] {
  const all = kinds.flatMap((kind) => column.sources[kind]?.items ?? []);
  return mergeUnique([], all).sort(compareInboxCards);
}

/** 보이는 소스가 하나라도 ready가 아니면 절반만 받은 합이라 null이다. */
export function columnCount(
  column: InboxColumnState,
  kinds: InboxKind[],
): number | null {
  let sum = 0;
  for (const kind of kinds) {
    const source = column.sources[kind];
    if (!source || source.status !== "ready") return null;
    sum += source.total;
  }
  return sum;
}

/**
 * 스냅샷과 지금 목록을 키로 합쳐(같은 키는 지금 카드) 정렬한 뒤 card 바로 뒤의 카드를 찾는다.
 * card가 두 목록에 없어도(열을 떠남) 정렬 위치로 찾는다.
 */
export function nextInboxCard(
  snapshot: InboxCard[],
  current: InboxCard[],
  card: InboxCard,
): InboxCard | null {
  const byKey = new Map<string, InboxCard>();
  for (const entry of snapshot) byKey.set(inboxCardKey(entry), entry);
  for (const entry of current) byKey.set(inboxCardKey(entry), entry);
  const sorted = [...byKey.values()].sort(compareInboxCards);
  return sorted.find((entry) => compareInboxCards(entry, card) > 0) ?? null;
}

/** 같은 출처 http(s) 주소만 링크로 건다. 그 밖(javascript: 등)은 null이다. */
export function feedbackPageHref(
  pageUrl: string,
  origin: string,
): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.origin === origin ? url.href : null;
}
