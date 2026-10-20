import { describe, expect, it } from "vitest";
import {
  actionLabel,
  changeLines,
  changeVerb,
  formatLogTime,
  formatValue,
  isActionKey,
  recordedLate,
  summarize,
  targetText,
} from "./activityLabels";

describe("activityLabels", () => {
  it("칸과 값을 한글로 바꾼다", () => {
    expect(formatValue("is_installed", true)).toBe("설치됨");
    expect(formatValue("is_installed", false)).toBe("미설치");
    expect(formatValue("is_visible", true)).toBe("예");
    expect(formatValue("name", null)).toBe("(비어 있음)");
    expect(formatValue("name", "")).toBe("(비어 있음)");
    expect(formatValue("lat", 37.5)).toBe("37.5");
  });

  it("참조 칸은 기록된 이름을, 가린 입력과 형상은 요약을 보인다", () => {
    expect(
      formatValue("facility_code", { value: "ramp", label: "경사로" }),
    ).toBe("경사로");
    expect(formatValue("facility_code", { value: "ramp", label: null })).toBe(
      "ramp",
    );
    expect(formatValue("content", { redacted: true, length: 17 })).toBe(
      "(방문자 입력 17자, 기록하지 않음)",
    );
    expect(formatValue("geojson", { changed: true, points: 5 })).toBe(
      "형상 변경됨 (꼭짓점 5개)",
    );
  });

  it("사전에 없는 칸은 원래 이름을 그대로 쓴다", () => {
    const [line] = changeLines({
      action: "update",
      target_table: "landmarks",
      changes: { brand_new_column: ["a", "b"] },
    });
    expect(line).toEqual({
      kind: "diff",
      column: "brand_new_column",
      label: "brand_new_column",
      before: "a",
      after: "b",
    });
  });

  it("건물의 is_deleted 변경은 삭제·복구로 보인다", () => {
    const base = { action: "update", target_table: "buildings" } as const;
    expect(
      changeVerb({ ...base, changes: { is_deleted: [false, true] } }),
    ).toBe("삭제");
    expect(changeVerb({ ...base, changes: { is_deleted: [null, true] } })).toBe(
      "삭제",
    );
    expect(
      changeVerb({ ...base, changes: { is_deleted: [true, false] } }),
    ).toBe("복구");
    expect(changeVerb({ ...base, changes: { name: ["a", "b"] } })).toBe("수정");
  });

  it("변경 요약은 첫 칸과 나머지 칸 수를 보인다", () => {
    expect(
      summarize({
        kind: "change",
        action: "update",
        target_table: "building_facilities",
        changes: {
          floor_info: ["1층", "2층"],
          is_installed: [true, false],
          name: ["경사로", "1층 경사로"],
        },
        message: null,
      }),
    ).toBe("수정: 이름 경사로 → 1층 경사로 외 2칸");
    expect(
      summarize({
        kind: "change",
        action: "delete",
        target_table: "landmarks",
        changes: { name: "분수대" },
        message: null,
      }),
    ).toBe("삭제");
    expect(
      summarize({
        kind: "failure",
        action: "facility_photo.upload",
        target_table: null,
        changes: null,
        message: "시설 사진 업로드 실패: 로그인이 만료됨",
      }),
    ).toBe("시설 사진 업로드 실패: 로그인이 만료됨");
  });

  it("대상 칸은 종류와 이름을 잇고, 설정 키는 한글 이름으로 바꾼다", () => {
    expect(
      targetText({
        target_table: "building_facilities",
        target_label: "하나스퀘어 · 1층 경사로",
      }),
    ).toBe("시설 · 하나스퀘어 · 1층 경사로");
    expect(
      targetText({
        target_table: "app_settings",
        target_label: "feedback_emails",
      }),
    ).toBe("설정 · 제보 알림 메일");
    expect(
      targetText({ target_table: "app_settings", target_label: "slope_bands" }),
    ).toBe("설정 · 경사도 범례");
    expect(targetText({ target_table: null, target_label: null })).toBe("—");
  });

  it("작업 키를 읽는다", () => {
    expect(actionLabel("facility_photo.upload")).toBe("시설 사진 업로드");
    expect(actionLabel("building_facilities.update")).toBe("시설 수정");
    expect(actionLabel("settings.slope_bands")).toBe("경사도 범례 저장");
    expect(actionLabel("mystery.key")).toBe("mystery.key");
    expect(isActionKey("slope_segments.delete")).toBe(true);
    expect(isActionKey("toString")).toBe(false);
    expect(isActionKey("buildings.truncate")).toBe(false);
  });

  it("시각은 서울 기준이고 올해가 아니면 연도를 붙인다", () => {
    const now = new Date("2026-10-19T09:00:00Z");
    expect(formatLogTime("2026-10-19T05:02:00Z", now)).toBe("10/19 14:02");
    expect(formatLogTime("2025-12-31T15:30:00Z", now)).toBe("01/01 00:30");
    expect(formatLogTime("2025-12-31T14:30:00Z", now)).toBe("2025/12/31 23:30");
  });

  it("발생과 기록이 1분 넘게 다르면 늦게 들어온 기록이다", () => {
    expect(
      recordedLate({
        occurred_at: "2026-10-19T05:00:00Z",
        recorded_at: "2026-10-19T05:00:50Z",
      }),
    ).toBe(false);
    expect(
      recordedLate({
        occurred_at: "2026-10-19T05:00:00Z",
        recorded_at: "2026-10-19T05:02:00Z",
      }),
    ).toBe(true);
  });
});
