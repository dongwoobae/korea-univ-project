import { createHmac, timingSafeEqual } from "node:crypto";

export const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

function sign(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** Turnstile 토큰은 한 번만 검증되므로 사진마다 봇 검사를 다시 하지 않으려고 둔다(설계 3.3). */
export function signUploadToken(
  requestId: string,
  expiresAt: number,
  secret: string,
): string {
  const payload = `${requestId}.${expiresAt}`;
  return `${payload}.${sign(secret, `upload:${payload}`)}`;
}

export function verifyUploadToken(
  token: string,
  requestId: string,
  now: number,
  secret: string,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [id, expires, signature] = parts;
  if (id !== requestId) return false;
  const expiresAt = Number(expires);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < now) return false;
  const expected = Buffer.from(sign(secret, `upload:${id}.${expires}`));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Vercel이 클라이언트가 보낸 값을 덮어쓰기 때문에 이 헤더를 믿을 수 있다.
 * Vercel 밖(next dev, E2E, 자체 호스팅)에서는 클라이언트가 임의로 정해 rate limit을 피할 수 있다.
 */
export function clientIp(request: Request): string | null {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || null;
}

/** IP 원문은 저장하지 않는다(설계 3.4). */
export function clientHash(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`client:${ip}`).digest("hex");
}
