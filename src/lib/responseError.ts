/** 관리자 API의 실패 응답 `{ error: "<문장>" }`을 읽는다. 응답이 없거나 형식이 다르면 대체 문구. */
export async function readErrorMessage(
  response: Response | null,
  fallback: string,
): Promise<string> {
  if (!response) return fallback;
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === "string" ? body.error : fallback;
}
