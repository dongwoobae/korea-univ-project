import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const revalidate = 3600;

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("landmarks")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(data ?? []);
}
