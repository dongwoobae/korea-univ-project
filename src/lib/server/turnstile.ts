const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

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
    const response = await fetchImpl(SITEVERIFY_URL, { method: "POST", body });
    if (!response.ok) return false;
    const data = (await response.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    return false;
  }
}
