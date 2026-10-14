import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FACILITY_FIELDS } from "./facilityFields";

const authedFetch = vi.fn();
const translateFacility = vi.fn();
const single = vi.fn();
const select = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select }));
const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ insert, update }));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));
vi.mock("@/lib/authedFetch", () => ({ authedFetch }));
vi.mock("@/lib/facilityTranslation", () => ({ translateFacility }));

const form = {
  ...EMPTY_FACILITY_FIELDS,
  facility_code: "ramp",
  name: "정문 경사로",
  floor_info: "1층",
  is_installed: false,
  lat: "37.5900000",
  lng: "127.0300000",
};

describe("buildFacilityPayload", () => {
  it("독립 시설은 층 정보를 비우고, 설치 상태는 실으라 할 때만 싣는다", async () => {
    const { buildFacilityPayload } = await import("./facilitySave");
    const payload = buildFacilityPayload(form, {
      buildingId: null,
      includeInstalled: false,
    });
    expect(payload).toEqual({
      building_id: null,
      facility_code: "ramp",
      name: "정문 경사로",
      description: null,
      floor_info: null,
      lat: 37.59,
      lng: 127.03,
      translation_status: "pending",
    });
    expect("is_installed" in payload).toBe(false);
  });

  it("건물 시설은 층 정보와 설치 상태를 싣는다", async () => {
    const { buildFacilityPayload } = await import("./facilitySave");
    expect(
      buildFacilityPayload(
        { ...form, lat: "", lng: "" },
        { buildingId: 3, includeInstalled: true },
      ),
    ).toMatchObject({
      building_id: 3,
      floor_info: "1층",
      is_installed: false,
      lat: null,
      lng: null,
    });
  });
});

describe("saveFacility", () => {
  const payload = {
    building_id: null,
    facility_code: "ramp",
    name: "정문 경사로",
    description: null,
    floor_info: null,
    lat: 37.59,
    lng: 127.03,
    translation_status: "pending",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    eq.mockResolvedValue({ error: null });
    single.mockResolvedValue({ data: { id: "f-new" }, error: null });
    translateFacility.mockResolvedValue(true);
    authedFetch.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  it("수정은 update 뒤 번역과 revalidate를 하고 결과를 돌려준다", async () => {
    const { saveFacility } = await import("./facilitySave");
    const result = await saveFacility("f1", payload);

    expect(from).toHaveBeenCalledWith("building_facilities");
    expect(update).toHaveBeenCalledWith(payload);
    expect(eq).toHaveBeenCalledWith("id", "f1");
    expect(translateFacility).toHaveBeenCalledWith("f1");
    expect(authedFetch).toHaveBeenCalledWith("/api/revalidate-facilities", {
      method: "POST",
    });
    expect(result).toEqual({
      status: "saved",
      facilityId: "f1",
      translated: true,
      revalidated: true,
    });
  });

  it("추가는 insert한 행의 id로 번역한다", async () => {
    const { saveFacility } = await import("./facilitySave");
    const result = await saveFacility(null, payload);

    expect(insert).toHaveBeenCalledWith(payload);
    expect(select).toHaveBeenCalledWith("id");
    expect(translateFacility).toHaveBeenCalledWith("f-new");
    expect(result).toMatchObject({ status: "saved", facilityId: "f-new" });
  });

  it("DB 저장이 실패하면 번역·revalidate 없이 실패를 돌려준다", async () => {
    eq.mockResolvedValue({ error: { message: "denied" } });
    const { saveFacility } = await import("./facilitySave");

    expect(await saveFacility("f1", payload)).toEqual({ status: "failed" });
    expect(translateFacility).not.toHaveBeenCalled();
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it("insert가 행을 돌려주지 않으면 실패다", async () => {
    single.mockResolvedValue({ data: null, error: null });
    const { saveFacility } = await import("./facilitySave");

    expect(await saveFacility(null, payload)).toEqual({ status: "failed" });
  });

  it("번역이 실패해도 저장됨이고 revalidate는 한다", async () => {
    translateFacility.mockResolvedValue(false);
    const { saveFacility } = await import("./facilitySave");

    expect(await saveFacility("f1", payload)).toEqual({
      status: "saved",
      facilityId: "f1",
      translated: false,
      revalidated: true,
    });
    expect(authedFetch).toHaveBeenCalledTimes(1);
  });

  it("revalidate가 실패하거나 거절돼도 저장됨이고 revalidated만 거짓이다", async () => {
    const { saveFacility } = await import("./facilitySave");

    authedFetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    expect(await saveFacility("f1", payload)).toMatchObject({
      status: "saved",
      revalidated: false,
    });

    authedFetch.mockRejectedValueOnce(new Error("network"));
    expect(await saveFacility("f1", payload)).toMatchObject({
      status: "saved",
      revalidated: false,
    });
  });
});
