import { describe, expect, it } from "vitest";
import { ADMIN_PAGE_SIZE } from "./adminList";
import {
  columnCards,
  columnCount,
  compareInboxCards,
  feedbackPageHref,
  hasMorePages,
  inboxBoardOptionsKey,
  inboxBoardReducer,
  inboxCardKey,
  initialInboxBoardState,
  nextInboxCard,
  type InboxBoardOptions,
  type InboxBoardState,
  type InboxCard,
  type InboxSourceState,
} from "./inboxBoard";
import type { FacilityRequestListItem, FeedbackItem } from "./inboxStatus";

function req(id: string, created_at: string): InboxCard {
  const item: FacilityRequestListItem = {
    id,
    building_id: 1,
    building_name: null,
    facility_code: "ramp",
    name: null,
    floor_info: null,
    has_location: false,
    status: "new",
    created_at,
    facility_id: null,
    photo_count: 0,
    thumbnail_url: null,
  };
  return { kind: "requests", item };
}

function fb(id: string, created_at: string): InboxCard {
  const item: FeedbackItem = {
    id,
    feedback_type: "bug",
    content: "x",
    page_url: null,
    status: "new",
    created_at,
  };
  return { kind: "feedback", item };
}

const options: InboxBoardOptions = {
  columns: ["new", "done"],
  kinds: ["requests", "feedback"],
  building: null,
};

function source(
  state: InboxBoardState,
  filter: string,
  kind: "requests" | "feedback",
): InboxSourceState {
  return state.columns.find((c) => c.filter === filter)!.sources[kind]!;
}

describe("카드 키와 정렬", () => {
  it("키는 종류와 id다", () => {
    expect(inboxCardKey(req("a", "2026-01-01"))).toBe("requests:a");
    expect(inboxCardKey(fb("a", "2026-01-01"))).toBe("feedback:a");
  });

  it("접수 시각 내림차순, 같으면 등록 요청 먼저, 같으면 id 오름차순", () => {
    const sorted = [
      fb("a", "2026-01-01T00:00:00Z"),
      req("b", "2026-01-01T00:00:00Z"),
      req("a", "2026-01-01T00:00:00Z"),
      fb("z", "2026-02-01T00:00:00Z"),
    ].sort(compareInboxCards);
    expect(sorted.map(inboxCardKey)).toEqual([
      "feedback:z",
      "requests:a",
      "requests:b",
      "feedback:a",
    ]);
  });
});

describe("inboxBoardOptionsKey / initialInboxBoardState", () => {
  it("내용이 같으면 키가 같고 다르면 다르다", () => {
    expect(
      inboxBoardOptionsKey({ ...options, columns: [...options.columns] }),
    ).toBe(inboxBoardOptionsKey(options));
    expect(inboxBoardOptionsKey({ ...options, building: 3 })).not.toBe(
      inboxBoardOptionsKey(options),
    );
    expect(inboxBoardOptionsKey({ ...options, kinds: ["requests"] })).not.toBe(
      inboxBoardOptionsKey(options),
    );
  });

  it("처음 state는 세대 1에 모든 소스가 loading이다", () => {
    const state = initialInboxBoardState(options);
    expect(state.generation).toBe(1);
    expect(state.optionsKey).toBe(inboxBoardOptionsKey(options));
    expect(state.columns.map((c) => c.filter)).toEqual(["new", "done"]);
    for (const column of state.columns) {
      expect(Object.keys(column.sources).sort()).toEqual([
        "feedback",
        "requests",
      ]);
      for (const s of Object.values(column.sources)) {
        expect(s).toEqual({
          status: "loading",
          items: [],
          total: 0,
          page: 0,
          more: "idle",
        });
      }
    }
  });
});

describe("inboxBoardReducer", () => {
  const loaded = (
    state: InboxBoardState,
    page: number,
    cards: InboxCard[],
    total = 50,
    kind: "requests" | "feedback" = "requests",
    filter: "new" | "done" = "new",
  ) =>
    inboxBoardReducer(state, {
      type: "pageLoaded",
      generation: state.generation,
      filter,
      kind,
      page,
      cards,
      total,
    });
  const act = { filter: "new" as const, kind: "requests" as const };

  it("load가 세대를 올리고 옵션대로 다시 만든다", () => {
    const first = loaded(initialInboxBoardState(options), 1, [
      req("a", "2026-01-01"),
    ]);
    const next: InboxBoardOptions = {
      columns: ["open"],
      kinds: ["requests"],
      building: 5,
    };
    const state = inboxBoardReducer(first, { type: "load", options: next });
    expect(state.generation).toBe(first.generation + 1);
    expect(state.optionsKey).toBe(inboxBoardOptionsKey(next));
    expect(state.columns.map((c) => c.filter)).toEqual(["open"]);
    expect(Object.keys(state.columns[0].sources)).toEqual(["requests"]);
    expect(source(state, "open", "requests")).toMatchObject({
      status: "loading",
      items: [],
      page: 0,
    });
  });

  it("page 1은 갈아 끼운다", () => {
    const state = loaded(initialInboxBoardState(options), 1, [
      req("a", "2026-01-02"),
    ]);
    const s = source(state, "new", "requests");
    expect(s).toMatchObject({
      status: "ready",
      total: 50,
      page: 1,
      more: "idle",
    });
    expect(s.items.map(inboxCardKey)).toEqual(["requests:a"]);
  });

  it("page 2는 중복을 빼고 이어 붙인다", () => {
    let state = loaded(initialInboxBoardState(options), 1, [
      req("a", "2026-01-03"),
      req("b", "2026-01-02"),
    ]);
    state = inboxBoardReducer(state, { type: "moreRequested", ...act });
    expect(source(state, "new", "requests").more).toBe("loading");
    state = loaded(state, 2, [req("b", "2026-01-02"), req("c", "2026-01-01")]);
    const s = source(state, "new", "requests");
    expect(s.items.map(inboxCardKey)).toEqual([
      "requests:a",
      "requests:b",
      "requests:c",
    ]);
    expect(s).toMatchObject({ page: 2, more: "idle" });
  });

  it("낡은 세대 응답은 같은 객체를 돌려준다", () => {
    const state = initialInboxBoardState(options);
    const base = { generation: state.generation - 1, ...act, page: 1 };
    expect(
      inboxBoardReducer(state, {
        type: "pageLoaded",
        ...base,
        cards: [],
        total: 0,
      }),
    ).toBe(state);
    expect(inboxBoardReducer(state, { type: "pageFailed", ...base })).toBe(
      state,
    );
  });

  it("같은 다음 페이지가 두 번 오면 둘째는 버린다", () => {
    let state = loaded(initialInboxBoardState(options), 1, [
      req("a", "2026-01-03"),
    ]);
    state = inboxBoardReducer(state, { type: "moreRequested", ...act });
    state = loaded(state, 2, [req("b", "2026-01-02")]);
    expect(loaded(state, 2, [req("c", "2026-01-01")])).toBe(state);
  });

  it("more가 loading이 아니거나 건너뛴 페이지는 버린다", () => {
    const state = loaded(initialInboxBoardState(options), 1, [
      req("a", "2026-01-03"),
    ]);
    expect(loaded(state, 2, [])).toBe(state);
    const loadingMore = inboxBoardReducer(state, {
      type: "moreRequested",
      ...act,
    });
    expect(loaded(loadingMore, 3, [])).toBe(loadingMore);
  });

  it("loading이 아닌 소스의 첫 페이지는 버린다", () => {
    const state = loaded(initialInboxBoardState(options), 1, [
      req("a", "2026-01-03"),
    ]);
    expect(loaded(state, 1, [req("z", "2026-01-04")])).toBe(state);
  });

  it("page 1 실패는 status error, page 2 실패는 more error이고 카드는 남는다", () => {
    const initial = initialInboxBoardState(options);
    const failed = inboxBoardReducer(initial, {
      type: "pageFailed",
      generation: initial.generation,
      ...act,
      page: 1,
    });
    expect(source(failed, "new", "requests").status).toBe("error");

    let state = loaded(initial, 1, [req("a", "2026-01-03")]);
    state = inboxBoardReducer(state, { type: "moreRequested", ...act });
    state = inboxBoardReducer(state, {
      type: "pageFailed",
      generation: state.generation,
      ...act,
      page: 2,
    });
    const s = source(state, "new", "requests");
    expect(s).toMatchObject({ status: "ready", more: "error", page: 1 });
    expect(s.items).toHaveLength(1);
  });

  it("more error인 소스에 moreRequested를 하면 다시 loading이 된다", () => {
    let state = loaded(initialInboxBoardState(options), 1, [
      req("a", "2026-01-03"),
    ]);
    state = inboxBoardReducer(state, { type: "moreRequested", ...act });
    state = inboxBoardReducer(state, {
      type: "pageFailed",
      generation: state.generation,
      ...act,
      page: 2,
    });
    state = inboxBoardReducer(state, { type: "moreRequested", ...act });
    expect(source(state, "new", "requests").more).toBe("loading");
  });

  it("moreRequested는 이미 loading이면 같은 객체다", () => {
    let state = loaded(initialInboxBoardState(options), 1, [
      req("a", "2026-01-03"),
    ]);
    state = inboxBoardReducer(state, { type: "moreRequested", ...act });
    expect(inboxBoardReducer(state, { type: "moreRequested", ...act })).toBe(
      state,
    );
  });

  it("firstPageRetryRequested는 status error인 소스만 loading으로 바꾼다", () => {
    const initial = initialInboxBoardState(options);
    const ready = loaded(initial, 1, []);
    expect(
      inboxBoardReducer(ready, { type: "firstPageRetryRequested", ...act }),
    ).toBe(ready);
    const failed = inboxBoardReducer(initial, {
      type: "pageFailed",
      generation: initial.generation,
      ...act,
      page: 1,
    });
    const retried = inboxBoardReducer(failed, {
      type: "firstPageRetryRequested",
      ...act,
    });
    expect(source(retried, "new", "requests").status).toBe("loading");
    expect(source(retried, "new", "feedback")).toBe(
      source(failed, "new", "feedback"),
    );
  });
});

describe("hasMorePages / columnCards / columnCount", () => {
  const src = (over: Partial<InboxSourceState>): InboxSourceState => ({
    status: "ready",
    items: [],
    total: 0,
    page: 1,
    more: "idle",
    ...over,
  });

  it("hasMorePages는 page * 페이지 크기가 total보다 작을 때다", () => {
    expect(hasMorePages(src({ page: 1, total: ADMIN_PAGE_SIZE }))).toBe(false);
    expect(hasMorePages(src({ page: 1, total: ADMIN_PAGE_SIZE + 1 }))).toBe(
      true,
    );
    expect(hasMorePages(src({ page: 2, total: ADMIN_PAGE_SIZE + 1 }))).toBe(
      false,
    );
  });

  const column = {
    filter: "new" as const,
    sources: {
      requests: src({
        total: 3,
        items: [req("a", "2026-01-01"), req("b", "2026-01-03")],
      }),
      feedback: src({ total: 4, items: [fb("a", "2026-01-02")] }),
    },
  };

  it("columnCards는 보이는 종류만 합쳐 정렬한다", () => {
    expect(
      columnCards(column, ["requests", "feedback"]).map(inboxCardKey),
    ).toEqual(["requests:b", "feedback:a", "requests:a"]);
    expect(columnCards(column, ["feedback"]).map(inboxCardKey)).toEqual([
      "feedback:a",
    ]);
  });

  it("columnCards는 중복 키를 하나만 둔다", () => {
    const dup = {
      ...column,
      sources: {
        requests: src({
          items: [req("a", "2026-01-01"), req("a", "2026-01-01")],
        }),
      },
    };
    expect(columnCards(dup, ["requests"])).toHaveLength(1);
  });

  it("columnCount는 모두 ready일 때 total 합이다", () => {
    expect(columnCount(column, ["requests", "feedback"])).toBe(7);
    expect(columnCount(column, ["requests"])).toBe(3);
  });

  it("보이는 소스가 loading이나 error면 null이다", () => {
    for (const status of ["loading", "error"] as const) {
      const c = {
        ...column,
        sources: { ...column.sources, feedback: src({ status }) },
      };
      expect(columnCount(c, ["requests", "feedback"])).toBeNull();
      expect(columnCount(c, ["requests"])).toBe(3);
    }
  });
});

describe("nextInboxCard", () => {
  const a = req("a", "2026-01-05");
  const b = fb("b", "2026-01-04");
  const c = req("c", "2026-01-03");
  const d = req("d", "2026-01-02");

  it("목록 안 항목의 다음 카드다", () => {
    expect(nextInboxCard([a, b, c], [a, b, c], a)).toBe(b);
  });

  it("마지막이면 null이다", () => {
    expect(nextInboxCard([a, b], [a, b], b)).toBeNull();
  });

  it("목록에 없는 항목은 정렬 위치 다음 카드다", () => {
    expect(nextInboxCard([a, c], [a, c], b)).toBe(c);
  });

  it("스냅샷에만 있는 카드로도 간다", () => {
    expect(nextInboxCard([a, b, c, d], [a, b], b)).toBe(c);
  });

  it("같은 키는 지금 카드가 이긴다", () => {
    const fresh = req("c", "2026-01-03");
    expect(nextInboxCard([a, b, c], [a, b, fresh], b)).toBe(fresh);
  });

  it("스냅샷이 비어도 지금 목록으로 찾는다", () => {
    expect(nextInboxCard([], [a, b], a)).toBe(b);
  });
});

describe("feedbackPageHref", () => {
  const origin = "https://example.com";

  it("같은 출처 http(s)는 주소를 돌려준다", () => {
    expect(feedbackPageHref("https://example.com/map?x=1", origin)).toBe(
      "https://example.com/map?x=1",
    );
    expect(
      feedbackPageHref("http://localhost:3100/a", "http://localhost:3100"),
    ).toBe("http://localhost:3100/a");
  });

  it("다른 출처, 다른 프로토콜, 깨진 주소는 null이다", () => {
    for (const url of [
      "https://evil.com/",
      "http://example.com/",
      "javascript:alert(1)",
      "mailto:a@example.com",
      "not a url",
      "",
    ]) {
      expect(feedbackPageHref(url, origin)).toBeNull();
    }
  });
});
