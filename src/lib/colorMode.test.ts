import { afterEach, describe, expect, it, vi } from "vitest";
import { COLOR_MODE_INIT_SCRIPT, parseStoredColorMode } from "./colorMode";
import { setColorMode, subscribeColorMode } from "./useColorMode";

function fakeRoot() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
  };
}

function runInitScript(getItem: (key: string) => string | null) {
  const root = fakeRoot();
  new Function("localStorage", "document", COLOR_MODE_INIT_SCRIPT)(
    { getItem },
    { documentElement: root },
  );
  return root.attributes.get("data-theme") ?? null;
}

describe("parseStoredColorMode", () => {
  it("정확히 dark일 때만 다크다", () => {
    expect(parseStoredColorMode("dark")).toBe("dark");
    for (const value of ["light", null, "DARK", "1", ""])
      expect(parseStoredColorMode(value)).toBe("light");
  });
});

describe("COLOR_MODE_INIT_SCRIPT", () => {
  it("저장 값이 dark면 html에 data-theme을 건다", () => {
    expect(runInitScript((key) => (key === "ku_theme" ? "dark" : null))).toBe(
      "dark",
    );
  });

  it("그 밖의 값이면 걸지 않는다", () => {
    for (const value of ["light", null, "DARK"])
      expect(runInitScript(() => value)).toBeNull();
  });

  it("저장소가 예외를 던져도 밖으로 내지 않고 밝게 둔다", () => {
    expect(
      runInitScript(() => {
        throw new Error("blocked");
      }),
    ).toBeNull();
  });
});

describe("setColorMode", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(setItem: (key: string, value: string) => void) {
    const root = fakeRoot();
    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal("localStorage", { setItem });
    return root;
  }

  it("속성과 저장 값을 바꾸고 구독자를 부른다", () => {
    const stored = new Map<string, string>();
    const root = stub((key, value) => stored.set(key, value));
    const listener = vi.fn();
    const unsubscribe = subscribeColorMode(listener);

    setColorMode("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(stored.get("ku_theme")).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(1);

    setColorMode("light");
    expect(root.getAttribute("data-theme")).toBeNull();
    expect(stored.get("ku_theme")).toBe("light");

    unsubscribe();
    setColorMode("dark");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("저장이 실패해도 화면은 바뀌고 예외를 내지 않는다", () => {
    const root = stub(() => {
      throw new Error("blocked");
    });
    expect(() => setColorMode("dark")).not.toThrow();
    expect(root.getAttribute("data-theme")).toBe("dark");
  });
});
