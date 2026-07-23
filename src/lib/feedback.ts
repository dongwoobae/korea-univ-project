export const FEEDBACK_TYPES = [
  { value: "error", label: "오류 제보" },
  { value: "facility", label: "시설 정보 수정" },
  { value: "feature", label: "기능 제안" },
  { value: "other", label: "기타" },
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number]["value"];

export interface FeedbackInput {
  type: FeedbackType;
  content: string;
  pageUrl: string | null;
}

const feedbackTypeValues = new Set<string>(
  FEEDBACK_TYPES.map(({ value }) => value),
);

export function parseFeedbackInput(value: unknown): FeedbackInput | null {
  if (!value || typeof value !== "object") return null;

  const input = value as Record<string, unknown>;
  if (!feedbackTypeValues.has(String(input.type))) return null;

  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (content.length < 3 || content.length > 2000) return null;

  let pageUrl: string | null = null;
  if (typeof input.pageUrl === "string" && input.pageUrl.length > 0) {
    if (input.pageUrl.length > 500) return null;
    try {
      const url = new URL(input.pageUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      pageUrl = url.toString();
    } catch {
      return null;
    }
  }

  return {
    type: input.type as FeedbackType,
    content,
    pageUrl,
  };
}
