import { createClient } from "@supabase/supabase-js";
import { parseFeedbackInput } from "@/lib/feedback";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 10_000) {
    return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
  }

  const body = await request.json().catch(() => null);

  // A filled honeypot is treated as accepted without storing the payload.
  if (
    body &&
    typeof body === "object" &&
    typeof body.website === "string" &&
    body.website.length > 0
  ) {
    return Response.json({ ok: true }, { status: 201 });
  }

  const input = parseFeedbackInput(body);
  if (!input) {
    return Response.json(
      { error: "피드백 유형과 내용을 확인해주세요." },
      { status: 400 },
    );
  }

  const { error } = await admin.from("feedback_submissions").insert({
    feedback_type: input.type,
    content: input.content,
    page_url: input.pageUrl,
  });

  if (error) {
    console.error("[feedback] submission failed", {
      code: error.code,
      message: error.message,
    });
    return Response.json(
      { error: "피드백을 저장하지 못했습니다." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true }, { status: 201 });
}
