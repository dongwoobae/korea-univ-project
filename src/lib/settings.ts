import { supabase } from "./supabaseClient";
import type { Json } from "@supabase-types";

export interface FeedbackEmails {
  to: string;
  cc: string[];
  subject: string;
}

export const FEEDBACK_EMAILS_FALLBACK: FeedbackEmails = {
  to: "hnsn9716@korea.ac.kr",
  cc: ["dw5817@naver.com"],
  subject: "[모두의 캠퍼스] 피드백",
};

export function normalizeFeedbackEmails(value: unknown): FeedbackEmails {
  if (!value || typeof value !== "object") return FEEDBACK_EMAILS_FALLBACK;

  const raw = value as Record<string, unknown>;
  const cc = Array.isArray(raw.cc)
    ? raw.cc.filter((item): item is string => typeof item === "string")
    : typeof raw.cc === "string"
      ? [raw.cc]
      : FEEDBACK_EMAILS_FALLBACK.cc;

  return {
    to:
      typeof raw.to === "string" && raw.to
        ? raw.to
        : FEEDBACK_EMAILS_FALLBACK.to,
    cc,
    subject:
      typeof raw.subject === "string" && raw.subject
        ? raw.subject
        : FEEDBACK_EMAILS_FALLBACK.subject,
  };
}

export async function getSetting<T = Json>(
  key: string,
  fallback: T | null = null,
): Promise<T | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  return data.value as T;
}
