import { supabase } from "@/lib/supabaseClient";
import type { SlopeRoutePoints } from "@/types/domain";
import type { Json } from "@supabase-types";

export type SlopeSaveResult =
  | { ok: true; routeId: string; created: boolean }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "error"; message: string };

/**
 * 수정은 패널을 연 때의 `updated_at`이 그대로일 때만 쓴다. 조건이 안 맞으면 PostgREST는
 * 오류가 아니라 0행을 주므로 빈 결과를 conflict로 본다(설계 2026-10-14 2.8).
 * `loadedAt`이 null이면 어떤 행에도 맞지 않는 빈 문자열을 걸어 conflict가 된다.
 */
export async function saveSlopeRoute(input: {
  routeId: string | null;
  loadedAt: string | null;
  name: string;
  segments: SlopeRoutePoints;
}): Promise<SlopeSaveResult> {
  const segments = input.segments as unknown as Json;

  if (input.routeId === null) {
    const { data, error } = await supabase
      .from("slope_segments")
      .insert({ name: input.name, gpx_file: null, segments })
      .select("id")
      .single();
    if (error || !data) {
      return {
        ok: false,
        reason: "error",
        message: error?.message ?? "저장 실패",
      };
    }
    // 목 백엔드는 id를 숫자로 돌려준다
    return { ok: true, routeId: String(data.id), created: true };
  }

  const { data, error } = await supabase
    .from("slope_segments")
    .update({ name: input.name, segments })
    .eq("id", input.routeId)
    .eq("updated_at", input.loadedAt ?? "")
    .select("id");
  if (error) return { ok: false, reason: "error", message: error.message };
  if (!data?.length) return { ok: false, reason: "conflict" };
  return { ok: true, routeId: input.routeId, created: false };
}

/** 실패 메시지, 성공이면 null */
export async function deleteSlopeRoute(
  routeId: string,
): Promise<string | null> {
  const { error } = await supabase
    .from("slope_segments")
    .delete()
    .eq("id", routeId);
  return error ? `삭제 실패: ${error.message}` : null;
}
