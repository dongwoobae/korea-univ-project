import { describe, expect, it, vi } from "vitest";
import {
  submitFacilityRequest,
  uploadRequestPhoto,
} from "./facilityRequestClient";

function fetchReturning(status: number, body: unknown) {
  return vi.fn(async () =>
    Response.json(body, { status }),
  ) as unknown as typeof fetch;
}

const input = {
  buildingId: 1,
  fields: {
    facility_code: "elevator",
    name: "",
    description: "",
    floor_info: "3층",
    lat: null,
    lng: null,
  },
  turnstileToken: "tok",
  website: "",
};

describe("submitFacilityRequest", () => {
  it("성공하면 id와 토큰을 준다", async () => {
    const result = await submitFacilityRequest(
      input,
      fetchReturning(201, { id: "r1", uploadToken: "t" }),
    );
    expect(result).toEqual({ ok: true, id: "r1", uploadToken: "t" });
  });

  it("honeypot 성공 응답(id 없음)도 성공이다", async () => {
    expect(
      await submitFacilityRequest(input, fetchReturning(201, { ok: true })),
    ).toEqual({
      ok: true,
      id: null,
      uploadToken: null,
    });
  });

  it("오류 코드를 그대로, 모르는 코드와 네트워크 오류는 server로", async () => {
    expect(
      await submitFacilityRequest(
        input,
        fetchReturning(429, { error: "rate_limited" }),
      ),
    ).toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect(
      await submitFacilityRequest(input, fetchReturning(500, { error: "??" })),
    ).toEqual({ ok: false, error: "server" });
    const broken = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await submitFacilityRequest(input, broken)).toEqual({
      ok: false,
      error: "server",
    });
  });
});

describe("uploadRequestPhoto", () => {
  it("응답을 다섯 결과로 나눈다", async () => {
    const blob = new Blob([new Uint8Array([1])], { type: "image/webp" });
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(201, { id: "p" }),
      ),
    ).toBe("done");
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(403, { error: "token" }),
      ),
    ).toBe("token");
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(409, { error: "not_new" }),
      ),
    ).toBe("closed");
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(409, { error: "full" }),
      ),
    ).toBe("closed");
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(413, { error: "too_large" }),
      ),
    ).toBe("too_large");
    expect(
      await uploadRequestPhoto(
        "r1",
        "t",
        blob,
        fetchReturning(500, { error: "server" }),
      ),
    ).toBe("failed");
  });

  it("요청 id 경로로 토큰과 파일을 보낸다", async () => {
    const fetchImpl = fetchReturning(201, { id: "p" });
    await uploadRequestPhoto(
      "r1",
      "t",
      new Blob([new Uint8Array([1])]),
      fetchImpl,
    );
    const [url, init] = (
      fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0];
    expect(url).toBe("/api/facility-requests/r1/photos");
    const form = init.body as FormData;
    expect(form.get("token")).toBe("t");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });
});
