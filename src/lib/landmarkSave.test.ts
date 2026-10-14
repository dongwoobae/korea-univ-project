import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LandmarkFormValues } from "./landmarkWorkspace";

const authedFetch = vi.fn();
const single = vi.fn();
const select = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select }));
const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ insert, update }));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));
vi.mock("@/lib/authedFetch", () => ({ authedFetch }));

function json(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

const payload = {
  name: "다람쥐길",
  name_en: null,
  name_zh: null,
  description: null,
  description_en: null,
  description_zh: null,
  icon: "🐿️",
  lat: 37.59,
  lng: 127.03,
};

const photo = new File(["x"], "trail.webp", { type: "image/webp" });

function urlsCalled() {
  return authedFetch.mock.calls.map(([url]) => url);
}

describe("saveLandmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eq.mockResolvedValue({ error: null });
    single.mockResolvedValue({ data: { id: "l-new" }, error: null });
    authedFetch.mockImplementation((url: string) =>
      Promise.resolve(
        url === "/api/upload-landmark-photo"
          ? json({ photoUrl: "https://cdn.test/new.webp" })
          : json({ ok: true }),
      ),
    );
  });

  it("기존 명소는 id로 고치고 revalidate한다. 번역은 부르지 않는다", async () => {
    const { saveLandmark } = await import("./landmarkSave");
    const result = await saveLandmark("l1", payload, null);

    expect(from).toHaveBeenCalledWith("landmarks");
    expect(update).toHaveBeenCalledWith(payload);
    expect(eq).toHaveBeenCalledWith("id", "l1");
    expect(urlsCalled()).toEqual(["/api/revalidate-landmarks"]);
    expect(result).toEqual({
      ok: true,
      landmarkId: "l1",
      created: false,
      photoFailed: false,
      revalidated: true,
    });
  });

  it("고치기에 실패하면 실패만 돌려주고 revalidate하지 않는다", async () => {
    eq.mockResolvedValue({ error: { message: "denied" } });
    const { saveLandmark } = await import("./landmarkSave");
    expect(await saveLandmark("l1", payload, null)).toEqual({ ok: false });
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it("새 명소는 넣은 뒤 고른 사진을 올리고 revalidate한다", async () => {
    const { saveLandmark } = await import("./landmarkSave");
    const result = await saveLandmark(null, payload, photo);

    expect(insert).toHaveBeenCalledWith(payload);
    expect(select).toHaveBeenCalledWith("id");
    expect(urlsCalled()).toEqual([
      "/api/upload-landmark-photo",
      "/api/revalidate-landmarks",
    ]);
    const body = authedFetch.mock.calls[0][1].body as FormData;
    expect(body.get("landmarkId")).toBe("l-new");
    expect(body.get("file")).toBeInstanceOf(File);
    expect(result).toEqual({
      ok: true,
      landmarkId: "l-new",
      created: true,
      photoFailed: false,
      revalidated: true,
    });
  });

  it("넣기는 됐는데 사진 업로드가 실패하면 저장됨 + 사진 실패다", async () => {
    authedFetch.mockImplementation((url: string) =>
      Promise.resolve(
        url === "/api/upload-landmark-photo"
          ? json({ error: "too big" }, false)
          : json({ ok: true }),
      ),
    );
    const { saveLandmark } = await import("./landmarkSave");
    expect(await saveLandmark(null, payload, photo)).toMatchObject({
      ok: true,
      landmarkId: "l-new",
      photoFailed: true,
    });
  });

  it("넣기에 실패하면 사진을 올리지 않는다", async () => {
    single.mockResolvedValue({ data: null, error: { message: "denied" } });
    const { saveLandmark } = await import("./landmarkSave");
    expect(await saveLandmark(null, payload, photo)).toEqual({ ok: false });
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it("revalidate 실패는 저장 실패가 아니다", async () => {
    authedFetch.mockRejectedValue(new Error("offline"));
    const { saveLandmark } = await import("./landmarkSave");
    expect(await saveLandmark("l1", payload, null)).toMatchObject({
      ok: true,
      revalidated: false,
    });
  });
});

describe("명소 사진", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("올리면 새 사진 주소를 돌려준다", async () => {
    authedFetch.mockResolvedValue(
      json({ photoUrl: "https://cdn.test/a.webp" }),
    );
    const { uploadLandmarkPhoto } = await import("./landmarkSave");
    await expect(uploadLandmarkPhoto("l1", photo)).resolves.toBe(
      "https://cdn.test/a.webp",
    );
    const [url, init] = authedFetch.mock.calls[0];
    expect(url).toBe("/api/upload-landmark-photo");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("landmarkId")).toBe("l1");
  });

  it("업로드 실패는 서버 문구로, 없으면 기본 문구로 던진다", async () => {
    const { uploadLandmarkPhoto } = await import("./landmarkSave");
    authedFetch.mockResolvedValue(json({ error: "파일이 너무 커요" }, false));
    await expect(uploadLandmarkPhoto("l1", photo)).rejects.toThrow(
      "파일이 너무 커요",
    );
    authedFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error("not json")),
    });
    await expect(uploadLandmarkPhoto("l1", photo)).rejects.toThrow(
      "사진 업로드 실패",
    );
  });

  it("지우기는 명소 id와 지금 사진 주소를 보내고 성공 여부를 돌려준다", async () => {
    authedFetch.mockResolvedValue(json({ ok: true }));
    const { deleteLandmarkPhoto } = await import("./landmarkSave");
    await expect(
      deleteLandmarkPhoto("l1", "https://cdn.test/a.webp"),
    ).resolves.toBe(true);
    const [url, init] = authedFetch.mock.calls[0];
    expect(url).toBe("/api/delete-landmark-photo");
    expect(JSON.parse(init.body)).toEqual({
      landmarkId: "l1",
      photoUrl: "https://cdn.test/a.webp",
    });

    authedFetch.mockResolvedValue(json({ error: "x" }, false));
    await expect(
      deleteLandmarkPhoto("l1", "https://cdn.test/a.webp"),
    ).resolves.toBe(false);
    authedFetch.mockRejectedValue(new Error("offline"));
    await expect(
      deleteLandmarkPhoto("l1", "https://cdn.test/a.webp"),
    ).resolves.toBe(false);
  });
});

describe("명소 번역 채우기", () => {
  const form: LandmarkFormValues = {
    name: " 다람쥐길 ",
    name_en: "",
    name_zh: "",
    description: "",
    description_en: "",
    description_zh: "",
    icon: "🐿️",
    lat: "37.59",
    lng: "127.03",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("원문이 모두 비면 요청하지 않는다", async () => {
    const { requestLandmarkTranslations } = await import("./landmarkSave");
    expect(
      await requestLandmarkTranslations({
        ...form,
        name: " ",
        description: "",
      }),
    ).toEqual({ status: "empty" });
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it("원문이 있는 필드만 트림해 보낸다", async () => {
    authedFetch.mockResolvedValue(
      json({ en: { name: "Squirrel Trail" }, zh: { name: "松鼠路" } }),
    );
    const { requestLandmarkTranslations } = await import("./landmarkSave");
    expect(await requestLandmarkTranslations(form)).toEqual({
      status: "translated",
      en: { name: "Squirrel Trail" },
      zh: { name: "松鼠路" },
    });
    const [url, init] = authedFetch.mock.calls[0];
    expect(url).toBe("/api/translate");
    expect(JSON.parse(init.body)).toEqual({ texts: { name: "다람쥐길" } });
  });

  it("실패는 던지지 않고 실패로 돌려준다", async () => {
    const { requestLandmarkTranslations } = await import("./landmarkSave");
    authedFetch.mockResolvedValue(json({ error: "x" }, false));
    expect(await requestLandmarkTranslations(form)).toEqual({
      status: "failed",
    });
    authedFetch.mockRejectedValue(new Error("offline"));
    expect(await requestLandmarkTranslations(form)).toEqual({
      status: "failed",
    });
  });

  it("받은 번역은 빈 칸만 채우고 직접 고친 값은 남긴다", async () => {
    const { applyLandmarkTranslations } = await import("./landmarkSave");
    const filled = applyLandmarkTranslations(
      { ...form, name_en: "Squirrel Road", description: "길" },
      {
        en: { name: "Squirrel Trail", description: "A trail" },
        zh: { name: "松鼠路", description: "小路" },
      },
    );
    expect(filled).toMatchObject({
      name_en: "Squirrel Road",
      name_zh: "松鼠路",
      description_en: "A trail",
      description_zh: "小路",
    });
  });

  it("공백만 있는 칸은 빈 칸으로 보고 채운다", async () => {
    const { applyLandmarkTranslations } = await import("./landmarkSave");
    expect(
      applyLandmarkTranslations(
        { ...form, name_en: "  " },
        { en: { name: "Squirrel Trail" }, zh: {} },
      ),
    ).toMatchObject({ name_en: "Squirrel Trail", name_zh: "" });
  });
});
