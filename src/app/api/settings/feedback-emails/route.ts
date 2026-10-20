import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

function isEmail(s: unknown): boolean {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/settings/feedback-emails",
    action: "settings.feedback_emails",
    actor: { kind: "admin", user: auth.user },
    target: { table: "app_settings", id: "feedback_emails" },
  });

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

  const { error } = await supabaseAdmin({ userId: auth.user.id })
    .from("app_settings")
    .upsert(
      { key: "feedback_emails", value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

  if (error) {
    console.error("[settings/feedback-emails] save failed", {
      code: error.code,
      message: error.message,
    });
    return failures.respond(500, error.message, "server_error", { error });
  }

  revalidatePath("/");
  return Response.json({ ok: true, value });
}
