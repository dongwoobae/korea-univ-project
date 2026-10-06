import { describe, expect, it } from "vitest";
import { photoDownloadUrl, photoFileName } from "./photoDownload";

const STORED =
  "https://example.supabase.co/storage/v1/object/public/building-photos/1/a.webp?t=1700000000000";

describe("photoDownloadUrl", () => {
  it("기존 t 파라미터를 남기고 download를 더한다", () => {
    const url = new URL(photoDownloadUrl(STORED, "중앙도서관-1.webp"));
    expect(url.searchParams.get("t")).toBe("1700000000000");
    expect(url.searchParams.get("download")).toBe("중앙도서관-1.webp");
    expect(url.pathname).toBe(
      "/storage/v1/object/public/building-photos/1/a.webp",
    );
  });

  // 문자열을 이어 붙이면 &는 새 파라미터, #은 fragment로 잘린다.
  it("파일명의 예약 문자를 보존한다", () => {
    const name = "본관 & 별관 #1-1.webp";
    const url = new URL(photoDownloadUrl(STORED, name));
    expect(url.searchParams.get("download")).toBe(name);
    expect(url.hash).toBe("");
  });
});

describe("photoFileName", () => {
  it("건물명과 1부터 센 번호", () => {
    expect(photoFileName("중앙도서관", 0)).toBe("중앙도서관-1.webp");
  });
});
