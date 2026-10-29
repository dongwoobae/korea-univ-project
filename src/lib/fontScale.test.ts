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

const INVALID = [
  null,
  "",
  "95",
  "160",
  "80",
  "1.2",
  " 120",
  "120.0",
  "LARGE",
  "__proto__",
  "toString",
];

describe("parseStoredFontScale", () => {
  it("일곱 숫자 문자열은 그 백분율이다", () => {
    for (const scale of [90, 100, 110, 120, 130, 140, 150])
      expect(parseStoredFontScale(String(scale))).toBe(scale);
  });

  it("세 단계였을 때의 값을 이어받는다", () => {
    expect(parseStoredFontScale("small")).toBe(90);
    expect(parseStoredFontScale("normal")).toBe(100);
    expect(parseStoredFontScale("large")).toBe(120);
  });

  it("그 밖의 값은 100이다", () => {
    for (const value of INVALID) expect(parseStoredFontScale(value)).toBe(100);
  });
});

describe("FONT_SCALES", () => {
  it("90부터 150까지 10씩 일곱 칸이다", () => {
    expect(FONT_SCALES).toEqual([90, 100, 110, 120, 130, 140, 150]);
  });
});

describe("scaledFontSize", () => {
  it("배율 변수가 없으면 1배로 풀리는 calc를 만든다", () => {
    expect(scaledFontSize(13)).toBe("calc(13px * var(--ku-fs, 1))");
    expect(scaledFontSize(10.5)).toBe("calc(10.5px * var(--ku-fs, 1))");
  });
});

describe("FONT_SCALE_INIT_SCRIPT", () => {
  it("읽기 함수와 같은 값을 html에 건다 — 100이면 걸지 않는다", () => {
    const inputs = [
      ...FONT_SCALES.map(String),
      "small",
      "normal",
      "large",
      ...INVALID,
    ];
    for (const value of inputs) {
      const scale = parseStoredFontScale(value);
      expect(
        runInitScript((key) => (key === "ku_font_scale" ? value : null)),
      ).toBe(scale === 100 ? null : String(scale));
    }
  });

  it("저장소가 예외를 던져도 밖으로 내지 않고 100으로 둔다", () => {
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

    setFontScale(150);
    expect(root.getAttribute("data-font-scale")).toBe("150");
    expect(stored.get("ku_font_scale")).toBe("150");
    expect(listener).toHaveBeenCalledTimes(1);

    setFontScale(100);
    expect(root.getAttribute("data-font-scale")).toBeNull();
    expect(stored.get("ku_font_scale")).toBe("100");

    unsubscribe();
    setFontScale(90);
    expect(root.getAttribute("data-font-scale")).toBe("90");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("저장이 실패해도 화면은 바뀌고 예외를 내지 않는다", () => {
    const root = stub(() => {
      throw new Error("blocked");
    });
    expect(() => setFontScale(120)).not.toThrow();
    expect(root.getAttribute("data-font-scale")).toBe("120");
  });
});
