import { describe, expect, it } from "vitest";
import {
  readWorkspaceState,
  writeWorkspaceState,
  type WorkspaceState,
} from "./workspaceUrl";

const facilities = { allowEdit: false };
const slopes = { allowEdit: true };

describe("readWorkspaceState", () => {
  it("자기 파라미터가 없으면 닫힘이다", () => {
    expect(readWorkspaceState("", facilities)).toEqual({ mode: "closed" });
    expect(readWorkspaceState("?building=3", facilities)).toEqual({
      mode: "closed",
    });
  });

  it("id가 있으면 보기다", () => {
    expect(readWorkspaceState("?id=a1", facilities)).toEqual({
      mode: "view",
      id: "a1",
    });
  });

  it("빈 id는 닫힘이다", () => {
    expect(readWorkspaceState("?id=", facilities)).toEqual({ mode: "closed" });
  });

  it("new=1이면 id·edit을 무시하고 새로 만들기다", () => {
    expect(readWorkspaceState("?new=1", slopes)).toEqual({ mode: "new" });
    expect(readWorkspaceState("?id=a1&edit=1&new=1", slopes)).toEqual({
      mode: "new",
    });
  });

  it("new는 1일 때만 뜻이 있다", () => {
    expect(readWorkspaceState("?new=0&id=a1", facilities)).toEqual({
      mode: "view",
      id: "a1",
    });
  });

  it("edit=1은 id와 함께, 편집을 허용한 탭에서만 편집이다", () => {
    expect(readWorkspaceState("?id=a1&edit=1", slopes)).toEqual({
      mode: "edit",
      id: "a1",
    });
    expect(readWorkspaceState("?id=a1&edit=1", facilities)).toEqual({
      mode: "view",
      id: "a1",
    });
    expect(readWorkspaceState("?edit=1", slopes)).toEqual({ mode: "closed" });
  });
});

describe("writeWorkspaceState", () => {
  it("네 상태를 쓴다", () => {
    expect(writeWorkspaceState("", { mode: "view", id: "a1" })).toBe("?id=a1");
    expect(writeWorkspaceState("", { mode: "new" })).toBe("?new=1");
    expect(writeWorkspaceState("", { mode: "edit", id: "a1" })).toBe(
      "?id=a1&edit=1",
    );
    expect(writeWorkspaceState("?id=a1", { mode: "closed" })).toBe("");
  });

  it("자기 파라미터만 지우고 모르는 파라미터는 남긴다", () => {
    expect(
      writeWorkspaceState("?building=3&id=a1&edit=1", { mode: "new" }),
    ).toBe("?building=3&new=1");
    expect(
      writeWorkspaceState("?redirected=missing&new=1", { mode: "closed" }),
    ).toBe("?redirected=missing");
  });

  it("쓴 상태를 다시 읽으면 같은 상태다", () => {
    const states: WorkspaceState[] = [
      { mode: "closed" },
      { mode: "view", id: "a 1" },
      { mode: "new" },
      { mode: "edit", id: "x" },
    ];
    for (const state of states) {
      expect(
        readWorkspaceState(writeWorkspaceState("?tab=1", state), slopes),
      ).toEqual(state);
    }
  });
});
