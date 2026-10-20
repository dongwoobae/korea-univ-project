import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FailureReport } from "@/lib/failureReport";

const getSession = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));

const QUEUE_KEY = "ku-activity-report-queue";
const fetchMock = vi.fn();
let stored: Map<string, string>;
let storageThrows = false;
const storage = {
  getItem: (key: string) => {
    if (storageThrows) throw new Error("denied");
    return stored.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    if (storageThrows) throw new Error("denied");
    stored.set(key, value);
  },
};

function signIn(id: string | null) {
  getSession.mockResolvedValue({
    data: {
      session: id ? { access_token: `token-${id}`, user: { id } } : null,
    },
  });
}

function queue(): FailureReport[] {
  return JSON.parse(stored.get(QUEUE_KEY) ?? "[]") as FailureReport[];
}

function queued(owner: string, index: number): FailureReport {
  return {
    v: 1,
    client_event_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    owner_user_id: owner,
    occurred_at: "2026-10-19T05:00:00.000Z",
    level: "error",
    action: "facility_photo.upload",
    reason_code: "network",
    message: "시설 사진 업로드 실패: 네트워크 연결이 끊겨 서버에 닿지 못함",
    detail: {},
    target_table: null,
    target_id: null,
    target_label: null,
  };
}

const failure = {
  source: { kind: "thrown", error: new TypeError("Failed to fetch") },
  action: "facility_photo.upload",
} as const;

async function load() {
  vi.resetModules();
  return import("./activityReport");
}

describe("reportFailure", () => {
  beforeEach(() => {
    stored = new Map();
    storageThrows = false;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { localStorage: storage });
    signIn("u1");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("보고에 발생 시각·보고 id·계정을 붙여 보낸다", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { reportFailure } = await load();
    await reportFailure(failure);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/activity-logs");
    expect(init.headers.Authorization).toBe("Bearer token-u1");
    const [report] = JSON.parse(init.body).reports as FailureReport[];
    expect(report).toMatchObject({
      v: 1,
      owner_user_id: "u1",
      level: "error",
      action: "facility_photo.upload",
      reason_code: "network",
    });
    expect(report.client_event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(queue()).toEqual([]);
  });

  it("전송이 실패하면 대기열에 넣는다", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const { reportFailure } = await load();
    await reportFailure(failure);
    expect(queue()).toHaveLength(1);
  });

  it("401이면 대기열에 넣는다", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    const { reportFailure } = await load();
    await reportFailure(failure);
    expect(queue()).toHaveLength(1);
  });

  it("403이면 버린다", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
    const { reportFailure } = await load();
    await reportFailure(failure);
    expect(queue()).toEqual([]);
  });

  it("대기열은 50건까지, 넘치면 오래된 것부터 버린다", async () => {
    stored.set(
      QUEUE_KEY,
      JSON.stringify(Array.from({ length: 50 }, (_, i) => queued("u1", i))),
    );
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const { reportFailure } = await load();
    await reportFailure(failure);
    const items = queue();
    expect(items).toHaveLength(50);
    expect(items[0].client_event_id).toBe(queued("u1", 1).client_event_id);
  });

  it("보고가 성공하면 지금 계정의 대기 항목만 보내고 다른 계정 항목은 남긴다", async () => {
    stored.set(
      QUEUE_KEY,
      JSON.stringify([queued("u1", 1), queued("u2", 2), queued("u1", 3)]),
    );
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { reportFailure } = await load();
    await reportFailure(failure);
    const flushed = JSON.parse(fetchMock.mock.calls[1][1].body)
      .reports as FailureReport[];
    expect(flushed.map((report) => report.owner_user_id)).toEqual(["u1", "u1"]);
    expect(queue().map((report) => report.owner_user_id)).toEqual(["u2"]);
  });

  it("localStorage가 던져도 예외가 새지 않는다", async () => {
    storageThrows = true;
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const { reportFailure, flushQueue } = await load();
    await expect(reportFailure(failure)).resolves.toBeUndefined();
    await expect(flushQueue()).resolves.toBeUndefined();
  });

  it("로그인한 계정이 없으면 보내지 않는다", async () => {
    signIn(null);
    const { reportFailure } = await load();
    await reportFailure(failure);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("관리자 API 관문", () => {
  beforeEach(() => {
    stored = new Map();
    storageThrows = false;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { localStorage: storage });
    signIn("u1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("쓰기 경로만 작업 키를 얻는다", async () => {
    const { actionForApiRequest } = await load();
    expect(actionForApiRequest("/api/upload-facility-photo", "POST")).toBe(
      "facility_photo.upload",
    );
    expect(
      actionForApiRequest("/api/facility-requests/abc/approve", "POST"),
    ).toBe("facility_request.approve");
    expect(actionForApiRequest("/api/admin-feedback/abc", "PATCH")).toBe(
      "feedback.status",
    );
    expect(actionForApiRequest("/api/settings/slope-bands", "POST")).toBe(
      "settings.slope_bands",
    );
    expect(actionForApiRequest("/api/admin-feedback", "GET")).toBeNull();
    expect(actionForApiRequest("/api/inbox-counts", "POST")).toBeNull();
  });

  it("Vercel이 만든 413만 서버가 놓친 실패로 본다", async () => {
    const { missedServerLog } = await load();
    expect(
      missedServerLog(
        new Response("Request Entity Too Large", {
          status: 413,
          headers: { "x-vercel-error": "FUNCTION_PAYLOAD_TOO_LARGE" },
        }),
      ),
    ).toBe(true);
    expect(
      missedServerLog(
        Response.json({ error: "사진은 4MB까지" }, { status: 413 }),
      ),
    ).toBe(false);
    expect(missedServerLog(new Response("", { status: 504 }))).toBe(true);
    expect(missedServerLog(new Response("", { status: 401 }))).toBe(true);
    expect(missedServerLog(Response.json({}, { status: 500 }))).toBe(false);
  });

  it("413이면 보낸 파일 크기와 한도를 싣는다", async () => {
    const { reportApiOutcome } = await load();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(10)], { type: "image/webp" }));
    reportApiOutcome(
      "/api/upload-facility-photo",
      { method: "POST", body: form },
      new Response("Request Entity Too Large", {
        status: 413,
        headers: { "x-vercel-error": "FUNCTION_PAYLOAD_TOO_LARGE" },
      }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [report] = JSON.parse(fetchMock.mock.calls[0][1].body)
      .reports as FailureReport[];
    expect(report.reason_code).toBe("payload_too_large");
    expect(report.detail).toMatchObject({
      status: 413,
      code: "FUNCTION_PAYLOAD_TOO_LARGE",
      file_size: 10,
      file_type: "image/webp",
      route: "/api/upload-facility-photo",
    });
  });

  it("사용자가 취소한 요청은 보고하지 않는다", async () => {
    const { reportApiOutcome } = await load();
    reportApiOutcome(
      "/api/upload-facility-photo",
      { method: "POST" },
      new DOMException("aborted", "AbortError"),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
