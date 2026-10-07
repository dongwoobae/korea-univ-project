import { describe, expect, it } from "vitest";
import { isWebP } from "./webpBytes";

const ascii = (text: string) => new TextEncoder().encode(text);

function webp(chunk: string, payload = 10): Uint8Array {
  const bytes = new Uint8Array(16 + payload);
  bytes.set(ascii("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(ascii(`WEBP${chunk}`), 8);
  return bytes;
}

describe("isWebP", () => {
  it.each(["VP8 ", "VP8L", "VP8X"])(
    "%s 청크로 시작하는 WebP를 받는다",
    (chunk) => {
      const bytes = webp(chunk);
      expect(isWebP(bytes, bytes.length)).toBe(true);
    },
  );

  it("PNG는 거른다", () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
      0x44, 0x52,
    ]);
    expect(isWebP(png, 3_527_628)).toBe(false);
  });

  it("JPEG는 거른다", () => {
    const jpeg = new Uint8Array(16);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(isWebP(jpeg, 300_000)).toBe(false);
  });

  it("RIFF....WEBP 12바이트만 있는 입력은 거른다", () => {
    const bytes = webp("VP8 ").slice(0, 12);
    expect(isWebP(bytes, 12)).toBe(false);
  });

  it("이미지 청크가 아니면 거른다", () => {
    const bytes = webp("ABCD");
    expect(isWebP(bytes, bytes.length)).toBe(false);
  });

  it("RIFF 크기와 전체 길이가 다르면(잘린 파일) 거른다", () => {
    const bytes = webp("VP8 ");
    expect(isWebP(bytes, bytes.length - 1)).toBe(false);
  });
});
