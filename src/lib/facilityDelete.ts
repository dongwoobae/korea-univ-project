import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";

/**
 * 시설을 삭제한다. 동영상이 있으면 R2 객체를 먼저 정리한다.
 * 정리에 실패하면 고아 객체가 남지 않도록 row를 남겨두고 메시지를 반환한다.
 * @returns 성공 시 null, 실패 시 토스트용 메시지
 */
export async function deleteFacility(facility: {
  id: string;
  video_url?: string | null;
}): Promise<string | null> {
  if (facility.video_url) {
    const res = await authedFetch("/api/delete-facility-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facilityId: facility.id,
        videoUrl: facility.video_url,
      }),
    });
    if (!res.ok) return "동영상 삭제에 실패해 시설을 지우지 못했어요";
  }

  const { error } = await supabase
    .from("building_facilities")
    .delete()
    .eq("id", facility.id);

  return error ? error.message : null;
}
