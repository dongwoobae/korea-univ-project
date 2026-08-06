import { describe, expect, it } from "vitest";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_LABEL,
  exceedsVideoLimit,
  facilityVideoKey,
  formatExcessSize,
  formatFileSize,
  isFacilityVideoKey,
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

describe("facilityVideoKey / isFacilityVideoKey", () => {
  const facilityId = "efca8dfa-c6c2-47c8-b2b0-923cfb98fe5f";

  it("발급 키는 시설별 접두사 아래에 놓인다", () => {
    expect(facilityVideoKey(facilityId, "mp4", 1780848381078)).toBe(
      `facility-videos/${facilityId}/1780848381078.mp4`,
    );
  });

  it("자기 시설의 키만 자기 것으로 인정한다", () => {
    expect(
      isFacilityVideoKey(`facility-videos/${facilityId}/1.mp4`, facilityId),
    ).toBe(true);
  });

  it("다른 시설 · 다른 접두사의 키는 거부한다", () => {
    // 이게 핵심이다. confirm이 이걸 안 보면 landmark-photos/ 키를 시설에
    // 심어둔 뒤 delete를 불러 남의 객체를 지울 수 있다.
    expect(isFacilityVideoKey("landmark-photos/x/1.webp", facilityId)).toBe(
      false,
    );
    expect(
      isFacilityVideoKey(
        "facility-videos/00000000-0000-0000-0000-000000000000/1.mp4",
        facilityId,
      ),
    ).toBe(false);
  });

  it("상위 경로 탈출을 거부한다", () => {
    expect(
      isFacilityVideoKey(
        `facility-videos/${facilityId}/../../landmark-photos/1.webp`,
        facilityId,
      ),
    ).toBe(false);
  });

  it("접두사만 있고 파일명이 없으면 거부한다", () => {
    expect(
      isFacilityVideoKey(`facility-videos/${facilityId}/`, facilityId),
    ).toBe(false);
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

  it("소수 첫째 자리까지 반올림한다", () => {
    expect(formatFileSize(Math.round(500.4 * 1024 * 1024))).toBe("500.4MB");
  });
});

describe("formatExcessSize", () => {
  it("상한을 1바이트만 넘어도 상한 표기와 달라 보인다", () => {
    // 반올림으로는 500.05MB까지 "500MB"가 되어
    // `파일이 너무 커요 (500MB) · 최대 500MB`라는 자기모순이 남는다.
    const justOver = MAX_VIDEO_BYTES + 1;
    expect(exceedsVideoLimit(justOver)).toBe(true);
    expect(formatFileSize(justOver)).toBe(MAX_VIDEO_LABEL); // 반올림은 못 잡는다
    expect(formatExcessSize(justOver)).not.toBe(MAX_VIDEO_LABEL);
    expect(formatExcessSize(justOver)).toBe("500.1MB");
  });

  it("올림이라 상한 근처 어디서도 상한 표기와 겹치지 않는다", () => {
    for (const over of [1, 1024, 50 * 1024, 512 * 1024]) {
      expect(formatExcessSize(MAX_VIDEO_BYTES + over)).not.toBe(
        MAX_VIDEO_LABEL,
      );
    }
  });
});
