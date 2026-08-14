/** 업로드 전에 줄이는 긴 변 최대 길이(px). */
const MAX_EDGE = 1920;

const WEBP_QUALITY = 0.75;

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
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("WebP 변환 실패"));
        },
        "image/webp",
        WEBP_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지 로드 실패"));
    };
    img.src = objectUrl;
  });
}
