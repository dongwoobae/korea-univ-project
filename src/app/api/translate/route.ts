import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

async function translateAll(
  texts: string[],
  target: string,
  apiKey: string,
): Promise<string[]> {
  const res = await fetch(
    "https://translation.googleapis.com/language/translate/v2",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      // 기본값 html이면 따옴표·꺾쇠가 &#39; 같은 엔티티로 돌아온다.
      body: JSON.stringify({ q: texts, source: "ko", target, format: "text" }),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`google translate ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const translations: unknown = data?.data?.translations;
  if (!Array.isArray(translations) || translations.length !== texts.length) {
    throw new Error("google translate: translation count mismatch");
  }
  return translations.map((item) => {
    if (typeof item?.translatedText !== "string") {
      throw new Error("google translate: missing translatedText");
    }
    return item.translatedText;
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body?.texts || typeof body.texts !== "object") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const entries = Object.entries(body.texts as Record<string, unknown>).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].trim() !== "",
  );
  if (entries.length === 0) return NextResponse.json({ en: {}, zh: {} });

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "번역 키가 설정되지 않았어요" },
      { status: 503 },
    );
  }

  const sources = entries.map(([, value]) => value);
  try {
    const [en, zh] = await Promise.all([
      translateAll(sources, "en", apiKey),
      translateAll(sources, "zh-CN", apiKey),
    ]);
    return NextResponse.json({
      en: Object.fromEntries(entries.map(([key], i) => [key, en[i]])),
      zh: Object.fromEntries(entries.map(([key], i) => [key, zh[i]])),
    });
  } catch (error) {
    console.error("[translate] google translate failed", error);
    return NextResponse.json({ error: "번역에 실패했어요" }, { status: 502 });
  }
}
