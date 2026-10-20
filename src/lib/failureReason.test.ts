import { describe, expect, it } from "vitest";
import {
  classifyFailure,
  failureLevel,
  fitDetail,
  isReportableReason,
  sanitizeDetail,
} from "./failureReason";

const upload = { action: "facility_photo.upload" } as const;

describe("classifyFailure", () => {
  it("응답 없이 fetch가 던지면 network", () => {
    const result = classifyFailure(
      { kind: "thrown", error: new TypeError("Failed to fetch") },
      upload,
    );
    expect(result.reason_code).toBe("network");
    expect(result.message).toBe(
      "시설 사진 업로드 실패: 네트워크 연결이 끊겨 서버에 닿지 못함",
    );
  });

  it("상태 코드로 사유를 추정한다", () => {
    const reason = (status: number) =>
      classifyFailure({ kind: "response", status }, upload).reason_code;
    expect(reason(504)).toBe("timeout");
    expect(reason(413)).toBe("payload_too_large");
    expect(reason(401)).toBe("session_expired");
    expect(reason(403)).toBe("forbidden");
    expect(reason(404)).toBe("not_found");
    expect(reason(409)).toBe("conflict");
    expect(reason(415)).toBe("unsupported_type");
    expect(reason(400)).toBe("invalid_input");
    expect(reason(502)).toBe("server_error");
    expect(reason(418)).toBe("unknown");
  });

  it("413은 파일 크기와 한도를 문장에 넣는다", () => {
    const result = classifyFailure(
      {
        kind: "response",
        status: 413,
        vercelError: "FUNCTION_PAYLOAD_TOO_LARGE",
      },
      { ...upload, fileSize: 5.2 * 1024 * 1024, limit: 4.5 * 1024 * 1024 },
    );
    expect(result.message).toBe(
      "시설 사진 업로드 실패: 파일 5.2MB가 서버 한도 4.5MB를 넘음",
    );
    expect(result.detail).toMatchObject({
      status: 413,
      code: "FUNCTION_PAYLOAD_TOO_LARGE",
    });
  });

  it("PostgREST 오류 코드를 읽는다", () => {
    const reason = (code: string, status?: number) =>
      classifyFailure(
        { kind: "postgrest", status, error: { code, message: "x" } },
        { action: "building_facilities.update" },
      );
    expect(reason("23505").reason_code).toBe("conflict");
    expect(reason("23505").message).toBe(
      "시설 수정 실패: 같은 항목이 이미 있음",
    );
    expect(reason("23503").message).toBe(
      "시설 수정 실패: 연결된 항목이 있어 지울 수 없음",
    );
    expect(reason("42501", 403).reason_code).toBe("forbidden");
    expect(reason("PGRST301", 401).reason_code).toBe("session_expired");
  });

  it("라우트가 아는 사유는 그대로 쓰고 응답 문장을 붙인다", () => {
    expect(
      classifyFailure(
        { kind: "known", reason: "invalid_input", status: 400 },
        { action: "facility_photo.delete", reasonText: "사진 ID 누락" },
      ).message,
    ).toBe("시설 사진 삭제 실패: 입력값이 올바르지 않음: 사진 ID 누락");
    expect(
      classifyFailure(
        {
          kind: "known",
          reason: "storage_error",
          error: { message: "The resource was not found" },
        },
        { action: "facility_photo.delete" },
      ).message,
    ).toBe(
      "시설 사진 삭제 실패: 파일 저장소가 거부함: The resource was not found",
    );
  });

  it("unknown도 오류 원문을 남긴다", () => {
    const result = classifyFailure(
      { kind: "thrown", error: new Error("boom") },
      upload,
    );
    expect(result.reason_code).toBe("unknown");
    expect(result.message).toBe("시설 사진 업로드 실패: 알 수 없는 오류: boom");
    expect(result.detail.error_message).toBe("boom");
  });

  it("문장은 300자에서 자른다", () => {
    const result = classifyFailure(
      { kind: "thrown", error: new Error("x".repeat(400)) },
      upload,
    );
    expect(result.message).toHaveLength(300);
  });
});

describe("sanitizeDetail", () => {
  it("허용 목록 밖 키를 버린다", () => {
    expect(
      sanitizeDetail({ status: 500, body: { secret: 1 }, headers: "x" }),
    ).toEqual({ status: 500 });
  });

  it("URL 쿼리, Bearer 토큰, JWT를 가린다", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
    expect(
      sanitizeDetail({
        error_message: `GET https://r2.test/a.webp?X-Amz-Signature=abc failed with Bearer abc.def and ${jwt}`,
        route: "/api/upload?token=1",
      }),
    ).toEqual({
      error_message:
        "GET https://r2.test/a.webp failed with Bearer [가림] and [가림]",
      route: "/api/upload",
    });
  });

  it("4KB를 넘으면 truncated와 앞에서부터 들어가는 키만 남긴다", () => {
    expect(
      fitDetail(
        { status: 500, code: "x".repeat(40), error_message: "y".repeat(30) },
        90,
      ),
    ).toEqual({ truncated: true, status: 500, code: "x".repeat(40) });
  });
});

describe("유형", () => {
  it("뒤따르는 일의 실패와 forbidden은 warning", () => {
    expect(failureLevel("server_error")).toBe("error");
    expect(failureLevel("server_error", true)).toBe("warning");
    expect(failureLevel("forbidden")).toBe("warning");
  });

  it("브라우저는 audit_write_failed를 보고하지 못한다", () => {
    expect(isReportableReason("network")).toBe(true);
    expect(isReportableReason("audit_write_failed")).toBe(false);
    expect(isReportableReason("made_up")).toBe(false);
  });
});
