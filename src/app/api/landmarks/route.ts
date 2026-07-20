import { createClient } from "@supabase/supabase-js";
import type { Database } from "@supabase-types";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const revalidate = 3600;

export async function GET() {
  const { data, error } = await supabase
    .from("landmarks")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(data ?? []);
}
