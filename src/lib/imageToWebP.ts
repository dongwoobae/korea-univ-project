/** 업로드 전에 줄이는 긴 변 최대 길이(px). */
const MAX_EDGE = 1920;

const WEBP_QUALITY = 0.75;

type WasmWebPEncoder = (image: ImageData) => Promise<ArrayBuffer>;

/**
 * Safari의 canvas는 WebP를 인코딩하지 못하고 오류 없이 PNG를 돌려준다.
 * 그때만 wasm 인코더를 불러와 같은 품질로 다시 인코딩한다(설계 2026-10-07 2.1).
 */
export async function encodeCanvasToWebP(
  canvas: HTMLCanvasElement,
  encodeWasm: WasmWebPEncoder = encodeWithWasm,
): Promise<Blob> {
  const native = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  );
  if (native?.type === "image/webp") return native;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("WebP 변환 실패");
  const encoded = await encodeWasm(
    context.getImageData(0, 0, canvas.width, canvas.height),
  );
  return new Blob([encoded], { type: "image/webp" });
}

async function encodeWithWasm(image: ImageData): Promise<ArrayBuffer> {
  const { default: encode } = await import("@jsquash/webp/encode");
  return encode(image, { quality: WEBP_QUALITY * 100 });
}

/**
 * 이미지를 긴 변 기준 MAX_EDGE 이내로 줄여 WebP Blob으로 바꾼다.
 *
 * canvas와 URL.createObjectURL에 의존하므로 브라우저에서만 동작한다.
 */
export function convertToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_EDGE || h > MAX_EDGE) {
        if (w >= h) {
          h = Math.round((h * MAX_EDGE) / w);
          w = MAX_EDGE;
        } else {
          w = Math.round((w * MAX_EDGE) / h);
          h = MAX_EDGE;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      encodeCanvasToWebP(canvas).then(resolve, () =>
        reject(new Error("WebP 변환 실패")),
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지 로드 실패"));
    };
    img.src = objectUrl;
  });
}
