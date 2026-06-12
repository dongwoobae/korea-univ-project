import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const authClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

function unauthorized() {
  return {
    response: NextResponse.json({ error: "인증 필요" }, { status: 401 }),
  };
}

function getBearerToken(request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function requireAdmin(request) {
  const token = getBearerToken(request);
  if (!token) {
    return unauthorized();
  }

  try {
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user) {
      return unauthorized();
    }

    return { user: data.user };
  } catch {
    return unauthorized();
  }
}
