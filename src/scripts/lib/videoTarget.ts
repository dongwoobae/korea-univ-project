/** 판정 기준: docs/specs/2026-10-07-sidepanel-media-loading-design.md 6.1 */
export interface VideoProbe {
  codec: string;
  pixFmt: string;
  width: number;
  height: number;
  duration: number;
  moovBeforeMdat: boolean;
}

export type VideoAction = "transcode" | "poster" | "skip";

export function moovBeforeMdat(atomTypes: string[]): boolean {
  const moov = atomTypes.indexOf("moov");
  const mdat = atomTypes.indexOf("mdat");
  return moov !== -1 && (mdat === -1 || moov < mdat);
}

export function classifyVideo(
  probe: VideoProbe,
  hasPoster: boolean,
  maxEdge: number,
): VideoAction {
  const meetsTarget =
    probe.codec === "h264" &&
    probe.pixFmt === "yuv420p" &&
    Math.max(probe.width, probe.height) <= maxEdge &&
    probe.moovBeforeMdat;
  if (!meetsTarget) return "transcode";
  return hasPoster ? "skip" : "poster";
}
