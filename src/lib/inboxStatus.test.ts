import { describe, expect, it } from "vitest";
import {
  feedbackStatusesFor,
  isEndStatus,
  parseInboxFilter,
  requestStatusesFor,
} from "./inboxStatus";

describe("inboxStatus", () => {
  it("기본 필터는 처리 전(신규 + 확인 중)이다", () => {
    expect(parseInboxFilter(null)).toBe("open");
    expect(parseInboxFilter("garbage")).toBe("open");
    expect(parseInboxFilter("done")).toBe("done");
  });

  it("처리 완료는 요청에선 승인·거절, 피드백에선 resolved다", () => {
    expect(requestStatusesFor("open")).toEqual(["new", "reviewing"]);
    expect(requestStatusesFor("done")).toEqual(["approved", "rejected"]);
    expect(requestStatusesFor("all")).toBeNull();
    expect(feedbackStatusesFor("open")).toEqual(["new", "reviewing"]);
    expect(feedbackStatusesFor("done")).toEqual(["resolved"]);
    expect(feedbackStatusesFor("reviewing")).toEqual(["reviewing"]);
  });

  it("끝 상태는 승인·거절뿐이다", () => {
    expect(isEndStatus("approved")).toBe(true);
    expect(isEndStatus("rejected")).toBe(true);
    expect(isEndStatus("reviewing")).toBe(false);
  });
});
