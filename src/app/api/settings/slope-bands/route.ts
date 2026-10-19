import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { SLOPE_BANDS_SETTING_KEY, validateSlopeBands } from "@/lib/slopeBands";

// 공개 지도는 클라이언트에서 설정을 읽어 revalidatePath를 부르지 않는다. 동시 편집은 나중에 저장한 쪽이 이긴다(설계 6.3)
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const body: unknown = await request.json().catch(() => null);
  const result = validateSlopeBands(body);
  if (!result.ok)
    return Response.json({ error: result.errors[0] }, { status: 400 });

  const { error } = await supabaseAdmin({ userId: auth.user.id })
    .from("app_settings")
    .upsert(
      {
        key: SLOPE_BANDS_SETTING_KEY,
        value: result.value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  if (error) {
    console.error("[slope-bands] upsert failed", {
      code: error.code,
      message: error.message,
    });
    return Response.json(
      { error: "범례를 저장하지 못했어요" },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, value: result.value });
}
