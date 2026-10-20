import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

/** `admin_users`에 있으면 표시 이름을, 없으면 null. 조회가 실패하면 던진다 — 호출부가 "없음"과 구별해야 한다. */
export async function findListedAdmin(
  userId: string,
): Promise<{ displayName: string } | null> {
  const { data, error } = await supabaseAdmin()
    .from("admin_users")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { displayName: data.display_name } : null;
}

export async function isListedAdmin(userId: string): Promise<boolean> {
  return (await findListedAdmin(userId)) !== null;
}
