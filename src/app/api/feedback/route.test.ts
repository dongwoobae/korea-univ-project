import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from }),
}));

function request(body: unknown) {
  return new Request("https://local.test/api/feedback", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("feedback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockResolvedValue({ error: null });
  });

  it("stores a validated anonymous submission", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      request({
        type: "facility",
        content: "경사로 위치를 확인해주세요.",
        pageUrl: "https://campus.example/",
        website: "",
      }),
    );

    expect(response.status).toBe(201);
    expect(from).toHaveBeenCalledWith("feedback_submissions");
    expect(insert).toHaveBeenCalledWith({
      feedback_type: "facility",
      content: "경사로 위치를 확인해주세요.",
      page_url: "https://campus.example/",
    });
  });

  it("rejects invalid content without touching the database", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ type: "error", content: "짧" }));

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts a filled honeypot without storing it", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      request({ type: "error", content: "자동 제출 내용", website: "bot" }),
    );

    expect(response.status).toBe(201);
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns a safe error when storage fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    insert.mockResolvedValueOnce({
      error: { code: "TEST", message: "database details" },
    });
    const { POST } = await import("./route");

    const response = await POST(
      request({ type: "feature", content: "검색 기능을 개선해주세요." }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("피드백을 저장하지 못했습니다.");
    consoleError.mockRestore();
  });
});
