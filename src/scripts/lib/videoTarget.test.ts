import { describe, expect, it } from "vitest";
import { type VideoProbe, classifyVideo, moovBeforeMdat } from "./videoTarget";

const compliant: VideoProbe = {
  codec: "h264",
  pixFmt: "yuv420p",
  width: 720,
  height: 1280,
  duration: 8,
  moovBeforeMdat: true,
};

describe("moovBeforeMdat", () => {
  it.each([
    [["ftyp", "moov", "mdat"], true],
    [["ftyp", "wide", "mdat", "moov"], false],
    [["ftyp", "mdat"], false],
  ])("%j → %s", (atoms, expected) => {
    expect(moovBeforeMdat(atoms)).toBe(expected);
  });
});

describe("classifyVideo", () => {
  it("기준을 충족하고 포스터가 있으면 건너뛴다", () => {
    expect(classifyVideo(compliant, true, 1280)).toBe("skip");
  });

  it("기준을 충족하고 포스터가 없으면 포스터만 만든다", () => {
    expect(classifyVideo(compliant, false, 1280)).toBe("poster");
  });

  it.each([
    { codec: "hevc" },
    { pixFmt: "yuv420p10le" },
    { width: 1080, height: 1920 },
    { moovBeforeMdat: false },
  ])("%j이면 포스터가 있어도 변환한다", (change) => {
    expect(classifyVideo({ ...compliant, ...change }, true, 1280)).toBe(
      "transcode",
    );
  });
});
