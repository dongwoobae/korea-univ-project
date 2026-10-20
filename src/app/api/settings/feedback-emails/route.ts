import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function isEmail(s: unknown): boolean {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

async function verifyAdmin(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/, "");
  if (!token) return null;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await client.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  const user = await verifyAdmin(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = supabaseAdmin({ userId: user.id });
  const failures = routeFailures({
    route: "/api/settings/feedback-emails",
    action: "settings.feedback_emails",
    actor: { kind: "admin", user },
  });
  failures.setTarget({ table: "app_settings", id: "feedback_emails" });

  const body = await request.json().catch(() => null);
  if (!body) return failures.respond(400, "Invalid JSON", "invalid_input");

  const to = body.to?.trim();
  const subject = body.subject?.trim();
  const ccRaw = Array.isArray(body.cc) ? body.cc : [];
  const cc = ccRaw.map((s: unknown) => (s as string)?.trim()).filter(Boolean);

  if (!isEmail(to))
    return failures.respond(400, "수신 이메일 형식 오류", "invalid_input");
  if (!subject) return failures.respond(400, "제목 필수", "invalid_input");
  for (const addr of cc) {
    if (!isEmail(addr))
      return failures.respond(
        400,
        `참조 이메일 형식 오류: ${addr}`,
        "invalid_input",
        { reasonText: "참조 이메일 형식 오류" },
      );
  }

  const value = { to, cc, subject };

  const { error } = await db
    .from("app_settings")
    .upsert(
      { key: "feedback_emails", value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

  if (error)
    return failures.respond(500, error.message, "server_error", { error });

  revalidatePath("/");
  return Response.json({ ok: true, value });
}
