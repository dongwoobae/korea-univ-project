export class TranslateKeyMissingError extends Error {
  constructor() {
    super("GOOGLE_TRANSLATE_API_KEY is not set");
  }
}

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

/** 한국어를 영어·중국어(간체)로 번역한다. 실패하면 던진다 — 원문을 번역문 자리에 돌려주지 않는다. */
export async function translateKoTexts(
  texts: Record<string, string>,
): Promise<{ en: Record<string, string>; zh: Record<string, string> }> {
  const entries = Object.entries(texts).filter(
    ([, value]) => value.trim() !== "",
  );
  if (entries.length === 0) return { en: {}, zh: {} };

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) throw new TranslateKeyMissingError();

  const sources = entries.map(([, value]) => value);
  const [en, zh] = await Promise.all([
    translateAll(sources, "en", apiKey),
    translateAll(sources, "zh-CN", apiKey),
  ]);
  return {
    en: Object.fromEntries(entries.map(([key], i) => [key, en[i]])),
    zh: Object.fromEntries(entries.map(([key], i) => [key, zh[i]])),
  };
}
