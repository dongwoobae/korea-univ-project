import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { logFailure } from "@/lib/server/activityLog";
import { findListedAdmin } from "@/lib/server/adminUsers";

const authClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export type RequireAdminResult =
  | { response: NextResponse; user?: undefined; admin?: undefined }
  | { response?: undefined; user: User; admin: { displayName: string } };

function unauthorized(): RequireAdminResult {
  return {
    response: NextResponse.json({ error: "인증 필요" }, { status: 401 }),
  };
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** 로그인한 계정이 `admin_users`에 있어야 통과한다. 설계: docs/specs/2026-10-19-activity-log-design.md 6장 */
export async function requireAdmin(
  request: Request,
): Promise<RequireAdminResult> {
  const token = getBearerToken(request);
  if (!token) {
    return unauthorized();
  }

  let user: User;
  try {
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user) {
      return unauthorized();
    }
    user = data.user;
  } catch {
    return unauthorized();
  }

  let admin: { displayName: string } | null;
  try {
    admin = await findListedAdmin(user.id);
  } catch (error) {
    console.error("[require-admin] admin lookup failed", {
      message: (error as { message?: unknown } | null)?.message,
    });
    return {
      response: NextResponse.json(
        { error: "관리자 권한을 확인하지 못했어요" },
        { status: 500 },
      ),
    };
  }
  if (!admin) {
    logFailure({
      route: new URL(request.url).pathname,
      action: "admin.access",
      actor: { kind: "admin", user },
      reason: "forbidden",
      status: 403,
    });
    return {
      response: NextResponse.json(
        { error: "관리자 목록에 없는 계정이에요" },
        { status: 403 },
      ),
    };
  }
  return { user, admin };
}
