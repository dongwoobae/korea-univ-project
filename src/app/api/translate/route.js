import { NextResponse } from "next/server";

const EMAIL = process.env.TRANSLATE_EMAIL ?? "";

async function translateOne(text, target) {
  if (!text?.trim()) return "";
  const url =
    `https://api.mymemory.translated.net/get` +
    `?q=${encodeURIComponent(text)}` +
    `&langpair=ko|${target}` +
    (EMAIL ? `&de=${encodeURIComponent(EMAIL)}` : "");
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return text;
    const data = await res.json();
    if (data.responseStatus !== 200) return text;
    return data.responseData?.translatedText ?? text;
  } catch {
    return text;
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.texts || typeof body.texts !== "object") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const en = {};
  const zh = {};

  for (const [key, value] of Object.entries(body.texts)) {
    if (!value?.trim()) continue;
    [en[key], zh[key]] = await Promise.all([
      translateOne(value, "en"),
      translateOne(value, "zh"),
    ]);
  }

  return NextResponse.json({ en, zh });
}
