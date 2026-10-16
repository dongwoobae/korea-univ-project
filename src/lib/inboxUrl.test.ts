import { describe, expect, it } from "vitest";
import { readInboxUrl, writeInboxUrl } from "./inboxUrl";

describe("readInboxUrl", () => {
  it("파라미터가 없으면 전체다", () => {
    expect(readInboxUrl("")).toEqual({ kind: "all", building: null });
  });

  it("tab 세 값을 읽는다", () => {
    expect(readInboxUrl("?tab=requests").kind).toBe("requests");
    expect(readInboxUrl("?tab=feedback").kind).toBe("feedback");
    expect(readInboxUrl("?tab=all").kind).toBe("all");
  });

  it("모르는 tab 값은 전체다", () => {
    expect(readInboxUrl("?tab=zzz").kind).toBe("all");
  });

  it("building은 양의 안전 정수만 받는다", () => {
    expect(readInboxUrl("?building=7").building).toBe(7);
    for (const bad of ["0", "-3", "1.5", "abc", "", "9007199254740993"]) {
      expect(readInboxUrl(`?building=${bad}`).building).toBeNull();
    }
  });

  it("building이 있으면 종류는 등록 요청이다", () => {
    expect(readInboxUrl("?tab=feedback&building=7")).toEqual({
      kind: "requests",
      building: 7,
    });
    expect(readInboxUrl("?building=7").kind).toBe("requests");
  });

  it("잘못된 building이면 tab을 따른다", () => {
    expect(readInboxUrl("?tab=feedback&building=0").kind).toBe("feedback");
  });
});

describe("writeInboxUrl", () => {
  it("전체이고 building이 없으면 빈 문자열이다", () => {
    expect(
      writeInboxUrl("?tab=feedback", { kind: "all", building: null }),
    ).toBe("");
  });

  it("tab과 building을 쓴다", () => {
    expect(writeInboxUrl("", { kind: "requests", building: 4 })).toBe(
      "?tab=requests&building=4",
    );
    expect(writeInboxUrl("", { kind: "feedback", building: null })).toBe(
      "?tab=feedback",
    );
  });

  it("building을 null로 쓰면 지운다", () => {
    expect(
      writeInboxUrl("?tab=requests&building=4", {
        kind: "requests",
        building: null,
      }),
    ).toBe("?tab=requests");
  });

  it("모르는 파라미터를 보존한다", () => {
    expect(
      writeInboxUrl("?foo=bar&tab=feedback", { kind: "all", building: null }),
    ).toBe("?foo=bar");
    expect(
      writeInboxUrl("?foo=bar", { kind: "requests", building: null }),
    ).toBe("?foo=bar&tab=requests");
  });
});
