import { describe, expect, it } from "vitest";
import { posterArgs, posterSeekTime, transcodeArgs } from "./videoTranscode";

const SCALE_1280 =
  "scale='if(gte(iw,ih),trunc(min(1280,iw)/2)*2,-2)':'if(gte(iw,ih),-2,trunc(min(1280,ih)/2)*2)'";
const SCALE_640 =
  "scale='if(gte(iw,ih),trunc(min(640,iw)/2)*2,-2)':'if(gte(iw,ih),-2,trunc(min(640,ih)/2)*2)'";

describe("transcodeArgs", () => {
  it("설계 4.1의 인자 전체를 preset만 바꿔 만든다", () => {
    expect(transcodeArgs("input.mov", "output.mp4", "ultrafast")).toEqual([
      "-i",
      "input.mov",
      "-vf",
      SCALE_1280,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
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
      "output.mp4",
    ]);
    expect(transcodeArgs("a", "b", "medium")).toContain("medium");
  });
});

describe("posterArgs", () => {
  it("한 프레임을 긴 변 640으로 뽑는다", () => {
    expect(posterArgs("in.mp4", "poster.jpg", 1)).toEqual([
      "-ss",
      "1",
      "-i",
      "in.mp4",
      "-frames:v",
      "1",
      "-vf",
      SCALE_640,
      "-q:v",
      "4",
      "poster.jpg",
    ]);
  });
});

describe("posterSeekTime", () => {
  it.each([
    [10, 1],
    [1, 0.5],
    [0, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])("길이 %s초면 %s초 지점", (duration, expected) => {
    expect(posterSeekTime(duration)).toBe(expected);
  });
});
