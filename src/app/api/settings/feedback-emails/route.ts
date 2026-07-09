import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceKey);

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

async function verifyAdmin(request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/, "");
  if (!token) return null;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await client.auth.getUser();
  return user;
}

export async function POST(request) {
  const user = await verifyAdmin(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const to = body.to?.trim();
  const subject = body.subject?.trim();
  const ccRaw = Array.isArray(body.cc) ? body.cc : [];
  const cc = ccRaw.map((s) => s?.trim()).filter(Boolean);

  if (!isEmail(to)) return Response.json({ error: "수신 이메일 형식 오류" }, { status: 400 });
  if (!subject) return Response.json({ error: "제목 필수" }, { status: 400 });
  for (const addr of cc) {
    if (!isEmail(addr)) return Response.json({ error: `참조 이메일 형식 오류: ${addr}` }, { status: 400 });
  }

  const value = { to, cc, subject };

  const { error } = await admin
    .from("app_settings")
    .upsert({ key: "feedback_emails", value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  revalidatePath("/");
  return Response.json({ ok: true, value });
}
