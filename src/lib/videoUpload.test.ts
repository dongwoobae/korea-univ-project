import { describe, expect, it } from "vitest";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_LABEL,
  exceedsVideoLimit,
  formatFileSize,
  isValidFileSize,
} from "./videoUpload";

describe("MAX_VIDEO_LABEL", () => {
  it("상한 바이트를 그대로 옮긴 표기다", () => {
    // 라벨과 상한이 따로 놀면 안내가 조용히 거짓이 된다. 실제로 모달이
    // 500MB를 허용하면서 200MB라고 안내하던 적이 있다.
    expect(MAX_VIDEO_LABEL).toBe(formatFileSize(MAX_VIDEO_BYTES));
  });
});

describe("exceedsVideoLimit", () => {
  it("상한과 같으면 넘지 않은 것으로 본다", () => {
    expect(exceedsVideoLimit(MAX_VIDEO_BYTES)).toBe(false);
  });

  it("상한을 1바이트 넘으면 넘은 것으로 본다", () => {
    expect(exceedsVideoLimit(MAX_VIDEO_BYTES + 1)).toBe(true);
  });

  it("빈 파일도 통과시킨다", () => {
    expect(exceedsVideoLimit(0)).toBe(false);
  });
});

describe("isValidFileSize", () => {
  it("유한한 0 이상의 수만 받는다", () => {
    expect(isValidFileSize(0)).toBe(true);
    expect(isValidFileSize(1024)).toBe(true);
  });

  it("생략하면 거부한다", () => {
    // 이게 핵심이다. undefined를 통과시키면 exceedsVideoLimit(undefined)가
    // false가 되어 상한 검사 전체가 무력해진다.
    expect(isValidFileSize(undefined)).toBe(false);
    expect(isValidFileSize(null)).toBe(false);
  });

  it("숫자가 아니거나 음수·NaN·Infinity면 거부한다", () => {
    expect(isValidFileSize("500")).toBe(false);
    expect(isValidFileSize(-1)).toBe(false);
    expect(isValidFileSize(Number.NaN)).toBe(false);
    expect(isValidFileSize(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("딱 떨어지는 값은 소수점 없이 보여준다", () => {
    expect(formatFileSize(500 * 1024 * 1024)).toBe("500MB");
    expect(formatFileSize(1024 * 1024)).toBe("1MB");
  });

  it("1MB 미만도 소수 첫째 자리까지 보여준다", () => {
    expect(formatFileSize(512 * 1024)).toBe("0.5MB");
  });

  it("상한을 살짝 넘은 파일이 상한과 같은 표기로 보이지 않는다", () => {
    // 정수로 반올림하면 500.4MB가 "500MB"가 되어
    // `파일이 너무 커요 (500MB) · 최대 500MB`라는 자기모순 문구가 나온다.
    const justOver = Math.round(500.4 * 1024 * 1024);
    expect(exceedsVideoLimit(justOver)).toBe(true);
    expect(formatFileSize(justOver)).not.toBe(MAX_VIDEO_LABEL);
    expect(formatFileSize(justOver)).toBe("500.4MB");
  });
});
