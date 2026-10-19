import { describe, expect, it } from "vitest";
import { DEFAULT_SLOPE_BANDS } from "./slopeBands";
import {
  addBand,
  convertedUpper,
  draftFromBands,
  draftHasInputError,
  editUpper,
  redraftBandsForUnit,
  removeBand,
  validateBandsDraft,
} from "./slopeBandsDraft";

function expectDefaultUppers(rows: { upperPercent: number | null }[]) {
  rows.forEach((row, index) =>
    expect(
      Object.is(row.upperPercent, DEFAULT_SLOPE_BANDS[index].upperPercent),
    ).toBe(true),
  );
}

describe("draftFromBands", () => {
  it("상한은 지금 단위의 입력 문자열로 쓰고 숫자는 그대로 든다", () => {
    expect(
      draftFromBands(DEFAULT_SLOPE_BANDS, "deg").map((row) => row.upperInput),
    ).toEqual(["3.18", "4.76", "7.13", ""]);
    const percent = draftFromBands(DEFAULT_SLOPE_BANDS, "percent");
    expect(percent.map((row) => row.upperInput)).toEqual([
      "5.56",
      "8.33",
      "12.5",
      "",
    ]);
    expectDefaultUppers(percent);
    expect(new Set(percent.map((row) => row.key)).size).toBe(4);
  });
});

describe("editUpper", () => {
  const [row] = draftFromBands(DEFAULT_SLOPE_BANDS, "deg");

  // tan은 주기 함수라 190°가 약 17.6%로 바뀌어 % 검사를 통과한다(설계 6.2)
  it("도는 %로 바꾸기 전에 0 초과 45 이하인지 본다", () => {
    for (const raw of ["190", "45.01", "0", "-1"]) {
      const next = editUpper(row, raw, "deg");
      expect(next.upperError).toBe("0°보다 크고 45° 이하로 적어 주세요");
      expect(next.upperInput).toBe(raw);
      expect(Object.is(next.upperPercent, row.upperPercent)).toBe(true);
    }
    const max = editUpper(row, "45", "deg");
    expect(max.upperError).toBeNull();
    expect(max.upperPercent).toBeCloseTo(100, 10);
  });

  it("%는 0 초과 100 이하이고 친 그대로 든다", () => {
    for (const raw of ["100.01", "0"]) {
      expect(editUpper(row, raw, "percent").upperError).toBe(
        "0%보다 크고 100% 이하로 적어 주세요",
      );
    }
    expect(editUpper(row, "100", "percent")).toMatchObject({
      upperPercent: 100,
      upperError: null,
    });
    expect(editUpper(row, "5.01", "percent").upperPercent).toBe(5.01);
  });

  it("비우면 상한이 없는 상태다", () => {
    expect(editUpper(row, "", "deg")).toMatchObject({
      upperInput: "",
      upperPercent: null,
      upperError: null,
    });
  });
});

describe("redraftBandsForUnit", () => {
  it("손대지 않은 행은 단위를 몇 번 바꿔도 숫자가 그대로다", () => {
    let rows = draftFromBands(DEFAULT_SLOPE_BANDS, "deg");
    for (const unit of ["percent", "deg", "percent", "deg"] as const)
      rows = redraftBandsForUnit(rows, unit);
    expectDefaultUppers(rows);
    expect(rows.map((row) => row.upperInput)).toEqual([
      "3.18",
      "4.76",
      "7.13",
      "",
    ]);
  });

  it("범위 밖 입력은 버리고 마지막으로 받아들인 숫자로 다시 쓴다", () => {
    const rows = draftFromBands(DEFAULT_SLOPE_BANDS, "deg");
    rows[0] = editUpper(rows[0], "190", "deg");
    const [first] = redraftBandsForUnit(rows, "percent");
    expect(first).toMatchObject({ upperInput: "5.56", upperError: null });
    expect(
      Object.is(first.upperPercent, DEFAULT_SLOPE_BANDS[0].upperPercent),
    ).toBe(true);
  });
});

describe("addBand / removeBand", () => {
  it("구간 추가는 마지막 바로 앞에 빈 행을 넣고 색은 앞 구간의 색이다", () => {
    const rows = addBand(draftFromBands(DEFAULT_SLOPE_BANDS, "percent"));
    expect(rows).toHaveLength(5);
    expect(rows[3]).toMatchObject({
      name: "",
      color: "#FF9800",
      upperPercent: null,
      upperInput: "",
      upperError: null,
    });
    expect(rows[4].name).toBe("초과");
  });

  it("6개면 더하지 않는다", () => {
    const rows = addBand(
      addBand(draftFromBands(DEFAULT_SLOPE_BANDS, "percent")),
    );
    expect(rows).toHaveLength(6);
    expect(addBand(rows)).toBe(rows);
  });

  it("2개면 지우지 않는다", () => {
    const rows = removeBand(
      removeBand(draftFromBands(DEFAULT_SLOPE_BANDS, "percent"), 0),
      0,
    );
    expect(rows).toHaveLength(2);
    expect(removeBand(rows, 0)).toBe(rows);
  });

  it("마지막 행을 지우면 바로 앞 행이 새 마지막이 되어 상한을 잃는다", () => {
    const rows = removeBand(draftFromBands(DEFAULT_SLOPE_BANDS, "percent"), 3);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({
      name: "특례 범위",
      upperPercent: null,
      upperInput: "",
    });
  });

  it("행을 지워도 다른 행은 그대로다", () => {
    const before = draftFromBands(DEFAULT_SLOPE_BANDS, "percent");
    const after = removeBand(before, 1);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[2]);
  });
});

describe("validateBandsDraft / draftHasInputError / convertedUpper", () => {
  it("손대지 않은 기본값 초안은 기본값 상수 그대로 통과한다", () => {
    expect(
      validateBandsDraft(draftFromBands(DEFAULT_SLOPE_BANDS, "deg")),
    ).toEqual({ ok: true, value: { bands: DEFAULT_SLOPE_BANDS } });
  });

  it("상한을 넣지 않은 새 행이 있으면 통과하지 못한다", () => {
    expect(
      validateBandsDraft(addBand(draftFromBands(DEFAULT_SLOPE_BANDS, "deg")))
        .ok,
    ).toBe(false);
  });

  it("범위 밖 입력이 하나라도 있으면 입력 오류다", () => {
    const rows = draftFromBands(DEFAULT_SLOPE_BANDS, "deg");
    expect(draftHasInputError(rows)).toBe(false);
    rows[1] = editUpper(rows[1], "190", "deg");
    expect(draftHasInputError(rows)).toBe(true);
  });

  it("다른 단위 환산값은 받아들인 숫자가 있을 때만", () => {
    const [row] = draftFromBands(DEFAULT_SLOPE_BANDS, "deg");
    expect(convertedUpper(row, "deg")).toBe("5.56%");
    expect(convertedUpper(row, "percent")).toBe("3.18°");
    expect(convertedUpper(editUpper(row, "190", "deg"), "deg")).toBeNull();
    expect(convertedUpper(editUpper(row, "", "deg"), "deg")).toBeNull();
  });
});
