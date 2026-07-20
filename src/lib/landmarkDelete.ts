import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";

/**
 * 紐낆냼瑜???젣?쒕떎. ?ъ쭊???덉쑝硫?R2 媛앹껜瑜?癒쇱? ?뺣━?쒕떎.
 * ?뺣━???ㅽ뙣?섎㈃ 怨좎븘 媛앹껜媛 ?⑥? ?딅룄濡?row瑜??④꺼?먭퀬 硫붿떆吏瑜?諛섑솚?쒕떎.
 * @returns ?깃났 ??null, ?ㅽ뙣 ???좎뒪?몄슜 硫붿떆吏
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
    if (!res.ok) return "?ъ쭊 ??젣???ㅽ뙣??紐낆냼瑜?吏?곗? 紐삵뻽?댁슂";
  }

  const { error } = await supabase
    .from("landmarks")
    .delete()
    .eq("id", landmark.id);

  return error ? error.message : null;
}
