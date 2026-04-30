import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export const revalidate = 3600;

export async function GET() {
  const { data, error } = await supabase
    .from("building_facilities")
    .select("*, facility_types(code, label, icon), buildings(name)")
    .not("lat", "is", null)
    .not("lng", "is", null);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(data ?? []);
}
