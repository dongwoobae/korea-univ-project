import { describe, expect, it } from "vitest";
import { readErrorMessage } from "./responseError";

describe("readErrorMessage", () => {
  it("본문의 error 문자열을 돌려준다", async () => {
    const response = Response.json(
      { error: "사진은 3장까지예요" },
      { status: 409 },
    );
    expect(await readErrorMessage(response, "실패")).toBe("사진은 3장까지예요");
  });

  it("JSON이 아니거나 error가 문자열이 아니면 대체 문구다", async () => {
    expect(
      await readErrorMessage(new Response("<html>", { status: 500 }), "실패"),
    ).toBe("실패");
    expect(
      await readErrorMessage(
        Response.json({ error: 42 }, { status: 400 }),
        "실패",
      ),
    ).toBe("실패");
  });

  it("응답이 없으면(네트워크 오류) 대체 문구다", async () => {
    expect(await readErrorMessage(null, "실패")).toBe("실패");
  });
});
