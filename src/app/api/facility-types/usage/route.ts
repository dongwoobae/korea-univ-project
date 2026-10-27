import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

// 끝난 요청(승인·거절)은 기록이라 삭제를 막지 않는다. 설계: docs/specs/2026-10-26-facility-type-management-design.md 3.4
const PENDING_REQUEST_STATUSES = ["new", "reviewing"];

function failed() {
  return Response.json(
    { error: "사용 현황을 불러오지 못했어요" },
    { status: 500 },
  );
}

/**
 * 관리 화면이 쓰이는 종류의 삭제를 막는 데 쓴다. 등록 요청은 로그인 계정도 읽지 못해(20261008000000) 서비스 키로 센다.
 * 행을 받아 세면 PostgREST 최대 행 수에서 잘려 덜 센다 — 종류마다 개수만 묻는다(설계 3.2).
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const db = supabaseAdmin();
  const types = await db.from("facility_types").select("code");
  if (types.error) {
    console.error("[facility-types-usage] type read failed", {
      code: types.error.code,
    });
    return failed();
  }
  const counts = await Promise.all(
    (types.data ?? []).map(async ({ code }) => {
      const [facilities, requests] = await Promise.all([
        db
          .from("building_facilities")
          .select("id", { count: "exact", head: true })
          .eq("facility_code", code),
        db
          .from("facility_requests")
          .select("id", { count: "exact", head: true })
          .eq("facility_code", code)
          .in("status", PENDING_REQUEST_STATUSES),
      ]);
      return { code, facilities, requests };
    }),
  );
  const broken = counts.find(
    ({ facilities, requests }) => facilities.error || requests.error,
  );
  if (broken) {
    console.error("[facility-types-usage] count failed", {
      type: broken.code,
      facilities: broken.facilities.error?.code,
      requests: broken.requests.error?.code,
    });
    return failed();
  }
  return Response.json(
    Object.fromEntries(
      counts.map(({ code, facilities, requests }) => [
        code,
        {
          facilities: facilities.count ?? 0,
          pendingRequests: requests.count ?? 0,
        },
      ]),
    ),
  );
}
