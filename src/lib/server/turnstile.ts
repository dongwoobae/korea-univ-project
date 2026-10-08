const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 5000;

// 설정·서버 쪽 원인이라 봇 판정과 구분해 로그를 남긴다. 사용자 쪽 실패 코드는 남기지 않는다.
const SERVER_SIDE_CODES = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "internal-error",
]);

export async function verifyTurnstile(
  token: string,
  ip: string | null,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[turnstile] siteverify 비정상 응답", {
        status: response.status,
      });
      return false;
    }
    const data = (await response.json()) as {
      success?: unknown;
      "error-codes"?: unknown;
    };
    if (data.success === true) return true;
    const codes = Array.isArray(data["error-codes"])
      ? (data["error-codes"] as unknown[]).filter(
          (code): code is string =>
            typeof code === "string" && SERVER_SIDE_CODES.has(code),
        )
      : [];
    if (codes.length > 0) {
      console.error("[turnstile] siteverify 설정·서버 오류", { codes });
    }
    return false;
  } catch (error) {
    console.error("[turnstile] siteverify 호출 실패", {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
