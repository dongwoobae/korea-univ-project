export const WEBP_SNIFF_BYTES = 16;

const IMAGE_CHUNKS = ["VP8 ", "VP8L", "VP8X"];

function hasAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** 근거: docs/specs/2026-10-07-sidepanel-media-loading-design.md 2.2 */
export function isWebP(head: Uint8Array, totalLength: number): boolean {
  if (head.length < WEBP_SNIFF_BYTES) return false;
  if (!hasAscii(head, 0, "RIFF") || !hasAscii(head, 8, "WEBP")) return false;
  if (!IMAGE_CHUNKS.some((chunk) => hasAscii(head, 12, chunk))) return false;
  const riffSize = new DataView(
    head.buffer,
    head.byteOffset,
    head.byteLength,
  ).getUint32(4, true);
  return riffSize === totalLength - 8;
}
