import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";
import { DEFAULT_SLOPE_BANDS } from "./slopeBands";

const from = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));

const THREE_BANDS = [
  { name: "낮음", upperPercent: 5, color: "#2E7D32", description: "" },
  { name: "중간", upperPercent: 10, color: "#F9A825", description: "" },
  { name: "높음", upperPercent: null, color: "#6A1B9A", description: "" },
];

async function loadStore() {
  return import("./slopeBandsStore");
}

describe("slopeBandsStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("구독 전에는 읽지 않고, 첫 스냅샷은 서버 스냅샷과 같은 객체다", async () => {
    const store = await loadStore();
    expect(store.getSlopeBandsSnapshot()).toBe(
      store.getSlopeBandsServerSnapshot(),
    );
    expect(store.getSlopeBandsSnapshot().status).toBe("loading");
    expect(store.getSlopeBandsSnapshot().bands).toEqual(DEFAULT_SLOPE_BANDS);
    expect(from).not.toHaveBeenCalled();
  });

  it("행이 없으면 ready·기본값이고 slope_bands 한 행만 묻는다", async () => {
    const stub = queryStub({ data: null, error: null });
    from.mockReturnValue(stub);
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribeSlopeBands(listener);

    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("ready"),
    );
    expect(store.getSlopeBandsSnapshot().bands).toEqual(DEFAULT_SLOPE_BANDS);
    expect(listener).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("app_settings");
    expect(stub.calls).toContainEqual({
      method: "eq",
      args: ["key", "slope_bands"],
    });
    expect(stub.calls.map((call) => call.method)).toContain("maybeSingle");
  });

  it("저장된 값을 읽는다", async () => {
    from.mockReturnValue(
      queryStub({ data: { value: { bands: THREE_BANDS } }, error: null }),
    );
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});
    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("ready"),
    );
    expect(store.getSlopeBandsSnapshot().bands).toEqual(THREE_BANDS);
  });

  it("값이 깨졌으면 ready·기본값이다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    from.mockReturnValue(
      queryStub({ data: { value: { bands: "nope" } }, error: null }),
    );
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});
    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("ready"),
    );
    expect(store.getSlopeBandsSnapshot().bands).toEqual(DEFAULT_SLOPE_BANDS);
  });

  it("조회 오류는 error·기본값이고 콘솔에 남긴다", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValue(
      queryStub({ data: null, error: { code: "XX000", message: "boom" } }),
    );
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});
    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("error"),
    );
    expect(store.getSlopeBandsSnapshot().bands).toEqual(DEFAULT_SLOPE_BANDS);
    expect(error).toHaveBeenCalled();
  });

  it("조회가 예외를 던져도 error·기본값이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockImplementation(() => {
      throw new Error("network");
    });
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});
    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("error"),
    );
  });

  it("두 번 구독해도 한 번만 읽는다", async () => {
    from.mockReturnValue(queryStub({ data: null, error: null }));
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});
    store.subscribeSlopeBands(() => {});
    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("ready"),
    );
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("첫 읽기 응답 전에 저장하면 늦게 온 응답이 저장한 값을 되돌리지 않는다", async () => {
    let respond!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      respond = resolve;
    });
    from.mockReturnValue(queryStub(pending));
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});

    store.setSlopeBands(THREE_BANDS);
    respond({ data: null, error: null });
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getSlopeBandsSnapshot()).toEqual({
      bands: THREE_BANDS,
      status: "ready",
    });
  });
});
