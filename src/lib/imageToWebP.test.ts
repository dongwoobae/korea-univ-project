import { describe, expect, it, vi } from "vitest";
import { encodeCanvasToWebP } from "./imageToWebP";

function fakeCanvas(nativeType: string | null) {
  const imageData = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
  const canvas = {
    width: 2,
    height: 1,
    toBlob: (callback: (blob: Blob | null) => void) =>
      callback(nativeType ? new Blob(["x"], { type: nativeType }) : null),
    getContext: () => ({ getImageData: () => imageData }),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, imageData };
}

describe("encodeCanvasToWebP", () => {
  it("브라우저가 WebP를 만들면 wasm을 부르지 않는다", async () => {
    const { canvas } = fakeCanvas("image/webp");
    const encodeWasm = vi.fn();

    const blob = await encodeCanvasToWebP(canvas, encodeWasm);

    expect(blob.type).toBe("image/webp");
    expect(encodeWasm).not.toHaveBeenCalled();
  });

  it("PNG가 돌아오면(Safari) canvas 픽셀을 wasm으로 인코딩한다", async () => {
    const { canvas, imageData } = fakeCanvas("image/png");
    const encodeWasm = vi
      .fn()
      .mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);

    const blob = await encodeCanvasToWebP(canvas, encodeWasm);

    expect(encodeWasm).toHaveBeenCalledWith(imageData);
    expect(blob.type).toBe("image/webp");
    expect(blob.size).toBe(3);
  });

  it("toBlob이 null을 주면 wasm으로 인코딩한다", async () => {
    const { canvas } = fakeCanvas(null);
    const encodeWasm = vi.fn().mockResolvedValue(new ArrayBuffer(4));

    const blob = await encodeCanvasToWebP(canvas, encodeWasm);

    expect(encodeWasm).toHaveBeenCalledOnce();
    expect(blob.size).toBe(4);
  });
});
