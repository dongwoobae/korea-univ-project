import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const from = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));

const RAMP = {
  code: "ramp",
  label: "경사로",
  icon: "trending-up",
  color: "#B25617",
};
const LOUNGE = {
  code: "student_lounge",
  label: "장애학생 휴게실",
  icon: "sofa",
  color: "#0F766E",
};

async function loadStore() {
  return import("./facilityTypesStore");
}

function deferred() {
  let respond!: (value: unknown) => void;
  const pending = new Promise((resolve) => {
    respond = resolve;
  });
  return { pending, respond };
}

describe("facilityTypesStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("구독 전에는 읽지 않고, 첫 스냅숏은 서버 스냅숏과 같은 객체다", async () => {
    const store = await loadStore();
    expect(store.getFacilityTypesSnapshot()).toBe(
      store.getFacilityTypesServerSnapshot(),
    );
    expect(store.getFacilityTypesSnapshot()).toEqual({
      types: [],
      status: "loading",
      loaded: false,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("두 번 구독해도 한 번만, sort_order·code 순으로 읽는다", async () => {
    const stub = queryStub({ data: [RAMP, LOUNGE], error: null });
    from.mockReturnValue(stub);
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});
    store.subscribeFacilityTypes(() => {});

    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("ready"),
    );
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("facility_types");
    expect(stub.calls).toEqual([
      { method: "select", args: ["*"] },
      { method: "order", args: ["sort_order"] },
      { method: "order", args: ["code"] },
    ]);
    expect(store.getFacilityTypesSnapshot()).toEqual({
      types: [RAMP, LOUNGE],
      status: "ready",
      loaded: true,
    });
  });

  it("처음 읽기가 실패하면 error·빈 목록이고 loaded는 거짓이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValue(
      queryStub({ data: null, error: { code: "XX000", message: "boom" } }),
    );
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});

    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("error"),
    );
    expect(store.getFacilityTypesSnapshot()).toEqual({
      types: [],
      status: "error",
      loaded: false,
    });
  });

  it("다시 받는 동안과 다시 받기가 실패해도 직전 목록을 둔다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValueOnce(queryStub({ data: [RAMP], error: null }));
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});
    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("ready"),
    );

    const { pending, respond } = deferred();
    from.mockReturnValueOnce(queryStub(pending));
    store.reloadFacilityTypes();
    expect(store.getFacilityTypesSnapshot()).toEqual({
      types: [RAMP],
      status: "loading",
      loaded: true,
    });

    respond({ data: null, error: { code: "XX000", message: "boom" } });
    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("error"),
    );
    expect(store.getFacilityTypesSnapshot()).toEqual({
      types: [RAMP],
      status: "error",
      loaded: true,
    });
  });

  it("먼저 시작한 응답이 나중에 와도 최근 다시 받기 결과를 덮지 않는다", async () => {
    const first = deferred();
    from.mockReturnValueOnce(queryStub(first.pending));
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});

    from.mockReturnValueOnce(queryStub({ data: [RAMP, LOUNGE], error: null }));
    store.reloadFacilityTypes();
    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("ready"),
    );

    first.respond({ data: [RAMP], error: null });
    await first.pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getFacilityTypesSnapshot().types).toEqual([RAMP, LOUNGE]);
  });

  it("다시 받기는 끝나면 성공 여부로 풀린다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValueOnce(queryStub({ data: [RAMP], error: null }));
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});
    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("ready"),
    );

    from.mockReturnValueOnce(queryStub({ data: [RAMP, LOUNGE], error: null }));
    await expect(store.reloadFacilityTypes()).resolves.toBe(true);
    expect(store.getFacilityTypesSnapshot().types).toEqual([RAMP, LOUNGE]);

    from.mockReturnValueOnce(
      queryStub({ data: null, error: { code: "XX000", message: "boom" } }),
    );
    await expect(store.reloadFacilityTypes()).resolves.toBe(false);
    expect(store.getFacilityTypesSnapshot().types).toEqual([RAMP, LOUNGE]);
  });

  it("더 늦게 시작한 받기에 밀려난 받기는 그 최신 받기의 결과로 풀린다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValueOnce(queryStub({ data: [RAMP], error: null }));
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});
    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("ready"),
    );

    const older = deferred();
    const newer = deferred();
    from
      .mockReturnValueOnce(queryStub(older.pending))
      .mockReturnValueOnce(queryStub(newer.pending));
    const olderReload = store.reloadFacilityTypes();
    const newerReload = store.reloadFacilityTypes();
    // 먼저 시작한 받기는 성공했지만 버려진다. 최신 받기는 실패한다
    older.respond({ data: [RAMP, LOUNGE], error: null });
    newer.respond({ data: null, error: { code: "XX000", message: "boom" } });

    await expect(olderReload).resolves.toBe(false);
    await expect(newerReload).resolves.toBe(false);
    expect(store.getFacilityTypesSnapshot()).toEqual({
      types: [RAMP],
      status: "error",
      loaded: true,
    });
  });

  it("조회가 예외를 던져도 error다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockImplementation(() => {
      throw new Error("network");
    });
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});
    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("error"),
    );
  });
});
