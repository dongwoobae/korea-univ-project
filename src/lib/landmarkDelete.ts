import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";

/**
 * 명소를 삭제한다. 사진이 있으면 R2 객체를 먼저 정리한다.
 * 정리에 실패하면 고아 객체가 남지 않도록 row를 남겨두고 메시지를 반환한다.
 * @returns 성공 시 null, 실패 시 토스트용 메시지
 */
export async function deleteLandmark(landmark: {
  id: string;
  photo_url?: string | null;
}): Promise<string | null> {
  if (landmark.photo_url) {
    const res = await authedFetch("/api/delete-landmark-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        landmarkId: landmark.id,
        photoUrl: landmark.photo_url,
      }),
    });
    if (!res.ok) return "사진 삭제에 실패해 명소를 지우지 못했어요";
  }

  const { error } = await supabase
    .from("landmarks")
    .delete()
    .eq("id", landmark.id);

  return error ? error.message : null;
}
