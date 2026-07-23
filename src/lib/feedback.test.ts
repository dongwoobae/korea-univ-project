import { describe, expect, it } from "vitest";
import { parseFeedbackInput } from "./feedback";

describe("parseFeedbackInput", () => {
  it("normalizes a valid submission", () => {
    expect(
      parseFeedbackInput({
        type: "facility",
        content: "  경사로 위치가 다릅니다.  ",
        pageUrl: "https://campus.example/map?building=1",
      }),
    ).toEqual({
      type: "facility",
      content: "경사로 위치가 다릅니다.",
      pageUrl: "https://campus.example/map?building=1",
    });
  });

  it("rejects unknown types and invalid content lengths", () => {
    expect(
      parseFeedbackInput({ type: "unknown", content: "충분한 내용" }),
    ).toBeNull();
    expect(parseFeedbackInput({ type: "error", content: "짧" })).toBeNull();
    expect(
      parseFeedbackInput({ type: "error", content: "가".repeat(2001) }),
    ).toBeNull();
  });

  it("rejects non-http page URLs", () => {
    expect(
      parseFeedbackInput({
        type: "other",
        content: "충분한 피드백",
        pageUrl: "javascript:alert(1)",
      }),
    ).toBeNull();
  });
});
