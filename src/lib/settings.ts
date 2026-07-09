import { supabase } from "./supabaseClient";

export const FEEDBACK_EMAILS_FALLBACK = {
  to: "hnsn9716@korea.ac.kr",
  cc: ["dw5817@naver.com"],
  subject: "[모두의 캠퍼스] 피드백",
};

export async function getSetting(key, fallback = null) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  return data.value;
}
