export type RequestErrorCode =
  "invalid" | "turnstile" | "rate_limited" | "unavailable" | "server";

const ERROR_CODES: RequestErrorCode[] = [
  "invalid",
  "turnstile",
  "rate_limited",
  "unavailable",
  "server",
];

export const REQUEST_ERROR_KEYS: Record<RequestErrorCode, string> = {
  invalid: "requestErrorInvalid",
  turnstile: "requestErrorTurnstile",
  rate_limited: "requestErrorRateLimited",
  unavailable: "requestErrorUnavailable",
  server: "requestErrorServer",
};

export interface SubmitInput {
  buildingId: number;
  fields: {
    facility_code: string;
    name: string;
    description: string;
    floor_info: string;
    lat: number | null;
    lng: number | null;
  };
  turnstileToken: string;
  website: string;
}

export type SubmitResult =
  | { ok: true; id: string | null; uploadToken: string | null }
  | { ok: false; error: RequestErrorCode };

export type PhotoUploadResult =
  "done" | "token" | "closed" | "too_large" | "failed";

export async function submitFacilityRequest(
  input: SubmitInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  try {
    const response = await fetchImpl("/api/facility-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (response.ok) {
      return {
        ok: true,
        id: typeof body.id === "string" ? body.id : null,
        uploadToken:
          typeof body.uploadToken === "string" ? body.uploadToken : null,
      };
    }
    const code = ERROR_CODES.find((candidate) => candidate === body.error);
    return { ok: false, error: code ?? "server" };
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function uploadRequestPhoto(
  requestId: string,
  uploadToken: string,
  blob: Blob,
  fetchImpl: typeof fetch = fetch,
): Promise<PhotoUploadResult> {
  const form = new FormData();
  form.append("token", uploadToken);
  form.append("file", blob, "photo.webp");
  try {
    const response = await fetchImpl(
      `/api/facility-requests/${requestId}/photos`,
      {
        method: "POST",
        body: form,
      },
    );
    if (response.ok) return "done";
    const body = (await response.json().catch(() => ({}))) as {
      error?: unknown;
    };
    if (body.error === "token") return "token";
    if (body.error === "not_new" || body.error === "full") return "closed";
    if (body.error === "too_large") return "too_large";
    return "failed";
  } catch {
    return "failed";
  }
}
