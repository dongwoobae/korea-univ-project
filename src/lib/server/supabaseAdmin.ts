import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@supabase-types";

/** 트리거가 행위자를 정하는 헤더의 원천. 규칙: docs/specs/2026-10-19-activity-log-design.md 3.3·3.4 */
export type Actor = { userId: string } | { system: "translation" | "osm_sync" };

let anonymous: SupabaseClient<Database> | null = null;

function create(headers?: Record<string, string>): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return headers
    ? createClient<Database>(url, key, { global: { headers } })
    : createClient<Database>(url, key);
}

/** 서비스 키라 RLS를 우회한다. 서버 라우트에서만 import한다. 쓰는 라우트는 actor를 넘긴다. */
export function supabaseAdmin(actor?: Actor): SupabaseClient<Database> {
  if (!actor) return (anonymous ??= create());
  return create(
    "userId" in actor
      ? { "x-actor-id": actor.userId }
      : { "x-actor-system": actor.system },
  );
}
