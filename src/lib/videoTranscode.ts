/** 근거: docs/specs/2026-10-07-sidepanel-media-loading-design.md 4.1·4.4 */
export type TranscodePreset = "ultrafast" | "medium";

export const VIDEO_MAX_EDGE = 1280;

export const POSTER_MAX_EDGE = 640;

// 긴 변만 maxEdge로 묶고 작은 영상은 키우지 않는다. -2는 비율을 지키며 짝수로 맞춘다.
function scaleFilter(maxEdge: number): string {
  return (
    `scale='if(gte(iw,ih),trunc(min(${maxEdge},iw)/2)*2,-2)'` +
    `:'if(gte(iw,ih),-2,trunc(min(${maxEdge},ih)/2)*2)'`
  );
}

export function transcodeArgs(
  input: string,
  output: string,
  preset: TranscodePreset,
): string[] {
  return [
    "-i",
    input,
    "-vf",
    scaleFilter(VIDEO_MAX_EDGE),
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    output,
  ];
}

export function posterArgs(
  input: string,
  output: string,
  seekSeconds: number,
): string[] {
  return [
    "-ss",
    String(seekSeconds),
    "-i",
    input,
    "-frames:v",
    "1",
    "-vf",
    scaleFilter(POSTER_MAX_EDGE),
    "-q:v",
    "4",
    output,
  ];
}

export function posterSeekTime(duration: number): number {
  return Number.isFinite(duration) && duration > 0
    ? Math.min(1, duration / 2)
    : 0;
}
