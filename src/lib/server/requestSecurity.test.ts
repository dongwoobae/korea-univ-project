import { describe, expect, it } from "vitest";
import {
  clientHash,
  clientIp,
  signUploadToken,
  verifyUploadToken,
} from "./requestSecurity";

const ID = "5b0c1d2e-0000-4000-8000-000000000001";
const OTHER = "5b0c1d2e-0000-4000-8000-000000000002";

describe("업로드 토큰", () => {
  it("같은 요청·만료 전이면 통과한다", () => {
    const token = signUploadToken(ID, 2_000, "s1");
    expect(verifyUploadToken(token, ID, 1_999, "s1")).toBe(true);
  });

  it("만료 시각이 지나면 거부한다", () => {
    const token = signUploadToken(ID, 2_000, "s1");
    expect(verifyUploadToken(token, ID, 2_001, "s1")).toBe(false);
  });

  it("다른 요청 id로는 쓸 수 없다", () => {
    const token = signUploadToken(ID, 2_000, "s1");
    expect(verifyUploadToken(token, OTHER, 1_000, "s1")).toBe(false);
  });

  it("다른 비밀값으로 서명했거나 만료를 고치면 거부한다", () => {
    expect(
      verifyUploadToken(signUploadToken(ID, 2_000, "s2"), ID, 1_000, "s1"),
    ).toBe(false);
    const [id, , signature] = signUploadToken(ID, 2_000, "s1").split(".");
    expect(
      verifyUploadToken(`${id}.9999999999999.${signature}`, ID, 1_000, "s1"),
    ).toBe(false);
  });

  it("서명이 요청 id에 묶여 있어 id 구간만 바꿔도 거부한다", () => {
    const [, expires, signature] = signUploadToken(ID, 2_000, "s1").split(".");
    expect(
      verifyUploadToken(`${OTHER}.${expires}.${signature}`, OTHER, 1_000, "s1"),
    ).toBe(false);
  });

  it("서명 길이가 다르면 예외 없이 거부한다", () => {
    expect(verifyUploadToken(`${ID}.2000.short`, ID, 1_000, "s1")).toBe(false);
  });

  it("형식이 깨진 토큰은 거부한다", () => {
    expect(verifyUploadToken("", ID, 0, "s1")).toBe(false);
    expect(verifyUploadToken("a.b", ID, 0, "s1")).toBe(false);
    expect(verifyUploadToken(`${ID}.abc.def`, ID, 0, "s1")).toBe(false);
  });
});

describe("clientIp", () => {
  it("x-real-ip를 먼저, 없으면 x-forwarded-for의 첫 값을 쓴다", () => {
    expect(
      clientIp(
        new Request("https://t.test", {
          headers: { "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" },
        }),
      ),
    ).toBe("1.1.1.1");
    expect(
      clientIp(
        new Request("https://t.test", {
          headers: { "x-forwarded-for": "2.2.2.2, 3.3.3.3" },
        }),
      ),
    ).toBe("2.2.2.2");
    expect(clientIp(new Request("https://t.test"))).toBeNull();
  });
});

describe("clientHash", () => {
  it("IP 원문을 담지 않고, 같은 입력이면 같은 값이다", () => {
    const hash = clientHash("1.1.1.1", "s1");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("1.1.1.1");
    expect(clientHash("1.1.1.1", "s1")).toBe(hash);
    expect(clientHash("1.1.1.1", "s2")).not.toBe(hash);
  });
});
