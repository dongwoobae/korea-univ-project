import { FACILITY_PHOTO_BUCKET } from "@/lib/facilityPhotos";
import { supabase } from "@/lib/supabaseClient";

/** 저장소 경로만 저장하고 주소는 읽을 때 만든다(설계 2.2). 네트워크 요청은 없다. */
export function facilityPhotoUrl(storagePath: string): string {
  return supabase.storage.from(FACILITY_PHOTO_BUCKET).getPublicUrl(storagePath)
    .data.publicUrl;
}
