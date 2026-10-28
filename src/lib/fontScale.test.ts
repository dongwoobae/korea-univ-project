import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FONT_SCALE_INIT_SCRIPT,
  FONT_SCALES,
  parseStoredFontScale,
  scaledFontSize,
} from "./fontScale";
import { setFontScale, subscribeFontScale } from "./useFontScale";

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
  new Function("localStorage", "document", FONT_SCALE_INIT_SCRIPT)(
    { getItem },
    { documentElement: root },
  );
  return root.attributes.get("data-font-scale") ?? null;
}

describe("parseStoredFontScale", () => {
  it("정확히 small·large일 때만 그 단계다", () => {
    expect(parseStoredFontScale("small")).toBe("small");
    expect(parseStoredFontScale("large")).toBe("large");
    for (const value of ["normal", null, "LARGE", "1.2", ""])
      expect(parseStoredFontScale(value)).toBe("normal");
  });
});

describe("FONT_SCALES", () => {
  it("작은 것부터 세 단계다", () => {
    expect(FONT_SCALES).toEqual(["small", "normal", "large"]);
  });
});

describe("scaledFontSize", () => {
  it("배율 변수가 없으면 1배로 풀리는 calc를 만든다", () => {
    expect(scaledFontSize(13)).toBe("calc(13px * var(--ku-fs, 1))");
    expect(scaledFontSize(10.5)).toBe("calc(10.5px * var(--ku-fs, 1))");
  });
});

describe("FONT_SCALE_INIT_SCRIPT", () => {
  it("저장 값이 small·large면 html에 data-font-scale을 건다", () => {
    for (const value of ["small", "large"])
      expect(
        runInitScript((key) => (key === "ku_font_scale" ? value : null)),
      ).toBe(value);
  });

  it("그 밖의 값이면 걸지 않는다", () => {
    for (const value of ["normal", null, "LARGE"])
      expect(runInitScript(() => value)).toBeNull();
  });

  it("저장소가 예외를 던져도 밖으로 내지 않고 보통으로 둔다", () => {
    expect(
      runInitScript(() => {
        throw new Error("blocked");
      }),
    ).toBeNull();
  });
});

describe("setFontScale", () => {
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
    const unsubscribe = subscribeFontScale(listener);

    setFontScale("large");
    expect(root.getAttribute("data-font-scale")).toBe("large");
    expect(stored.get("ku_font_scale")).toBe("large");
    expect(listener).toHaveBeenCalledTimes(1);

    setFontScale("normal");
    expect(root.getAttribute("data-font-scale")).toBeNull();
    expect(stored.get("ku_font_scale")).toBe("normal");

    unsubscribe();
    setFontScale("small");
    expect(root.getAttribute("data-font-scale")).toBe("small");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("저장이 실패해도 화면은 바뀌고 예외를 내지 않는다", () => {
    const root = stub(() => {
      throw new Error("blocked");
    });
    expect(() => setFontScale("large")).not.toThrow();
    expect(root.getAttribute("data-font-scale")).toBe("large");
  });
});
