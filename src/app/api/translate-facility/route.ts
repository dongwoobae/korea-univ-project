import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";
import type { TablesUpdate } from "@supabase-types";
import { getFacilityTranslationTexts } from "@/lib/facilityTranslationState";
import { requireAdmin } from "@/lib/requireAdmin";
import { translateKoTexts } from "@/lib/server/googleTranslate";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";
import type { Facility } from "@/types/domain";

type Source = Pick<Facility, "id" | "name" | "description" | "floor_info">;
type Outcome = "translated" | "failed" | "superseded" | "error";

const SOURCE_FIELDS = ["name", "description", "floor_info"] as const;

async function translateAndStore(facility: Source): Promise<Outcome> {
  let update: TablesUpdate<"building_facilities">;
  try {
    const { en, zh } = await translateKoTexts(
      getFacilityTranslationTexts(facility),
    );
    update = {
      name_en: en.name ?? null,
      name_zh: zh.name ?? null,
      description_en: en.description ?? null,
      description_zh: zh.description ?? null,
      floor_info_en: en.floor_info ?? null,
      floor_info_zh: zh.floor_info ?? null,
      translation_status: "translated",
    };
  } catch (error) {
    console.error("[translate-facility] translate failed", error);
    update = { translation_status: "failed" };
  }

  // updated_at이 아니라 원문으로 잠근다 — 설계 문서 2026-10-14-server-side-facility-translation-design.md
  let query = supabaseAdmin({ system: "translation" })
    .from("building_facilities")
    .update(update)
    .eq("id", facility.id);
  for (const field of SOURCE_FIELDS) {
    const value = facility[field];
    query = value === null ? query.is(field, null) : query.eq(field, value);
  }
  const { data, error } = await query.select("id");
  if (error) {
    console.error("[translate-facility] store failed", {
      message: error.message,
    });
    return "error";
  }
  if (!data?.length) return "superseded";
  revalidatePath("/api/facilities");
  return update.translation_status === "translated" ? "translated" : "failed";
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    facilityId?: unknown;
  } | null;
  if (typeof body?.facilityId !== "string") {
    return NextResponse.json({ error: "시설 ID 누락" }, { status: 400 });
  }
  if (!isUuid(body.facilityId)) {
    return NextResponse.json({ error: "시설이 없어요" }, { status: 404 });
  }

  const { data: facility, error } = await supabaseAdmin()
    .from("building_facilities")
    .select("id, name, description, floor_info")
    .eq("id", body.facilityId)
    .maybeSingle();
  if (error) {
    console.error("[translate-facility] lookup failed", {
      message: error.message,
    });
    return NextResponse.json(
      { error: "시설 정보를 불러오지 못했어요" },
      { status: 500 },
    );
  }
  if (!facility) {
    return NextResponse.json({ error: "시설이 없어요" }, { status: 404 });
  }

  const job = translateAndStore(facility);
  // 관리자가 응답을 기다리지 않고 떠나도 job이 끝날 때까지 함수를 살려 둔다(Vercel waitUntil).
  after(() => job);
  const outcome = await job;

  if (outcome === "translated" || outcome === "superseded") {
    return NextResponse.json({ status: outcome });
  }
  if (outcome === "failed") {
    return NextResponse.json({ error: "번역에 실패했어요" }, { status: 502 });
  }
  return NextResponse.json(
    { error: "번역을 저장하지 못했어요" },
    { status: 500 },
  );
}
