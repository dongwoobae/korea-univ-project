import { authedFetch } from "@/lib/authedFetch";
import type {
  buildLandmarkPayload,
  LandmarkFormValues,
} from "@/lib/landmarkWorkspace";
import { supabase } from "@/lib/supabaseClient";

export type LandmarkWritePayload = ReturnType<typeof buildLandmarkPayload>;

export type LandmarkSaveResult =
  | { ok: false }
  | {
      ok: true;
      landmarkId: string;
      created: boolean;
      photoFailed: boolean;
      revalidated: boolean;
    };

export async function uploadLandmarkPhoto(
  landmarkId: string,
  file: File,
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("landmarkId", landmarkId);

  const response = await authedFetch("/api/upload-landmark-photo", {
    method: "POST",
    body: formData,
  });
  const data = (await response.json().catch(() => ({}))) as {
    photoUrl?: string;
    error?: string;
  };
  if (!response.ok || !data.photoUrl) {
    throw new Error(data.error ?? "사진 업로드 실패");
  }
  return data.photoUrl;
}

/** 서버가 지금 사진 주소와 같을 때만 지우고, 실패하면 되돌린다 */
export async function deleteLandmarkPhoto(
  landmarkId: string,
  photoUrl: string,
): Promise<boolean> {
  return authedFetch("/api/delete-landmark-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ landmarkId, photoUrl }),
  }).then(
    (response) => response.ok,
    () => false,
  );
}

/**
 * 명소 저장. 번역은 부르지 않는다 — 번역은 `자동번역 채우기`로 초안에 채운 값을 그대로 싣는다.
 * 새 명소의 사진은 id가 생긴 뒤에야 올릴 수 있어 넣은 다음에 올린다. 토스트와 닫기는 화면이 이 결과로 정한다.
 */
export async function saveLandmark(
  landmarkId: string | null,
  payload: LandmarkWritePayload,
  pendingPhoto: File | null,
): Promise<LandmarkSaveResult> {
  let savedId: string;
  let photoFailed = false;
  if (landmarkId) {
    const { error } = await supabase
      .from("landmarks")
      .update(payload)
      .eq("id", landmarkId);
    if (error) return { ok: false };
    savedId = landmarkId;
  } else {
    const { data, error } = await supabase
      .from("landmarks")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) return { ok: false };
    savedId = data.id;
    if (pendingPhoto) {
      photoFailed = await uploadLandmarkPhoto(savedId, pendingPhoto).then(
        () => false,
        () => true,
      );
    }
  }

  const revalidated = await authedFetch("/api/revalidate-landmarks", {
    method: "POST",
  }).then(
    (response) => response.ok,
    () => false,
  );
  return {
    ok: true,
    landmarkId: savedId,
    created: landmarkId === null,
    photoFailed,
    revalidated,
  };
}

type TranslatedTexts = { name?: string; description?: string };

export type LandmarkTranslationResult =
  | { status: "empty" }
  | { status: "failed" }
  | { status: "translated"; en: TranslatedTexts; zh: TranslatedTexts };

export async function requestLandmarkTranslations(
  form: Pick<LandmarkFormValues, "name" | "description">,
): Promise<LandmarkTranslationResult> {
  const texts: Record<string, string> = {};
  if (form.name.trim()) texts.name = form.name.trim();
  if (form.description.trim()) texts.description = form.description.trim();
  if (Object.keys(texts).length === 0) return { status: "empty" };

  try {
    const response = await authedFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });
    if (!response.ok) return { status: "failed" };
    const { en, zh } = (await response.json()) as {
      en?: TranslatedTexts;
      zh?: TranslatedTexts;
    };
    return { status: "translated", en: en ?? {}, zh: zh ?? {} };
  } catch {
    return { status: "failed" };
  }
}

function fill(current: string, translated: string | undefined) {
  return current.trim() ? current : (translated ?? current);
}

/** 빈 칸만 채운다. 요청이 도는 사이 직접 고친 값과 원래 있던 번역을 덮지 않는다 */
export function applyLandmarkTranslations<T extends LandmarkFormValues>(
  form: T,
  translations: { en: TranslatedTexts; zh: TranslatedTexts },
): T {
  return {
    ...form,
    name_en: fill(form.name_en, translations.en.name),
    name_zh: fill(form.name_zh, translations.zh.name),
    description_en: fill(form.description_en, translations.en.description),
    description_zh: fill(form.description_zh, translations.zh.description),
  };
}
