import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@supabase-types";

let client: SupabaseClient<Database> | null = null;

/** 서비스 키라 RLS를 우회한다. 서버 라우트에서만 import한다. */
export function supabaseAdmin(): SupabaseClient<Database> {
  client ??= createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return client;
}
