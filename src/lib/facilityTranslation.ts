import { authedFetch } from "@/lib/authedFetch";

/** 서버가 원문을 읽어 번역하고 저장한다. 실패면 서버가 `failed`를 남긴다. */
export async function translateFacility(facilityId: string) {
  const response = await authedFetch("/api/translate-facility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facilityId }),
  }).catch(() => null);
  return Boolean(response?.ok);
}
