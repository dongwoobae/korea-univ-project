import { authedFetch } from "@/lib/authedFetch";
import { getFacilityTranslationTexts } from "@/lib/facilityTranslationState";
import { supabase } from "@/lib/supabaseClient";
import type { Facility } from "@/types/domain";

export async function translateFacility(
  facility: Pick<Facility, "id" | "name" | "description" | "floor_info">,
) {
  const texts = getFacilityTranslationTexts(facility);

  try {
    const translated = {
      name_en: null as string | null,
      name_zh: null as string | null,
      description_en: null as string | null,
      description_zh: null as string | null,
      floor_info_en: null as string | null,
      floor_info_zh: null as string | null,
      translation_status: "translated",
    };

    if (Object.keys(texts).length > 0) {
      const response = await authedFetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts }),
      });
      if (!response.ok) throw new Error("translate failed");

      const { en, zh } = await response.json();
      translated.name_en = en.name ?? null;
      translated.name_zh = zh.name ?? null;
      translated.description_en = en.description ?? null;
      translated.description_zh = zh.description ?? null;
      translated.floor_info_en = en.floor_info ?? null;
      translated.floor_info_zh = zh.floor_info ?? null;
    }

    const { error } = await supabase
      .from("building_facilities")
      .update(translated)
      .eq("id", facility.id);
    if (error) throw error;
    return true;
  } catch {
    await supabase
      .from("building_facilities")
      .update({ translation_status: "failed" })
      .eq("id", facility.id);
    return false;
  }
}
