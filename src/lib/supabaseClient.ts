import { createClient } from "@supabase/supabase-js";
import type { Database } from "@supabase-types";
import { reportingFetch } from "@/lib/supabaseWriteReporting";

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { global: { fetch: reportingFetch() } },
);
