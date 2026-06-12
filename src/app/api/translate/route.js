import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

const CLIENT_ID = process.env.PAPAGO_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.PAPAGO_CLIENT_SECRET ?? "";

async function translateOne(text, target) {
  if (!text?.trim()) return text;
  try {
    const res = await fetch(
      "https://papago.apigw.ntruss.com/nmt/v1/translation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-NCP-APIGW-API-KEY-ID": CLIENT_ID,
          "X-NCP-APIGW-API-KEY": CLIENT_SECRET,
        },
        body: JSON.stringify({ source: "ko", target, text }),
        cache: "no-store",
      },
    );
    if (!res.ok) return text;
    const data = await res.json();
    return data.message?.result?.translatedText ?? text;
  } catch {
    return text;
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

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
      translateOne(value, "zh-CN"),
    ]);
  }

  return NextResponse.json({ en, zh });
}
