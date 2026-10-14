import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  TranslateKeyMissingError,
  translateKoTexts,
} from "@/lib/server/googleTranslate";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body?.texts || typeof body.texts !== "object") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const texts = Object.fromEntries(
    Object.entries(body.texts as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  try {
    return NextResponse.json(await translateKoTexts(texts));
  } catch (error) {
    if (error instanceof TranslateKeyMissingError) {
      return NextResponse.json(
        { error: "번역 키가 설정되지 않았어요" },
        { status: 503 },
      );
    }
    console.error("[translate] google translate failed", error);
    return NextResponse.json({ error: "번역에 실패했어요" }, { status: 502 });
  }
}
