import { parseFacilityFields } from "@/lib/facilityFields";
import {
  UPLOAD_TOKEN_TTL_MS,
  clientHash,
  clientIp,
  signUploadToken,
} from "@/lib/server/requestSecurity";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { verifyTurnstile } from "@/lib/server/turnstile";

const MAX_BODY_BYTES = 10_000;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail("invalid", 413);
  }
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("invalid", 400);
  }

  // 봇이 걸렸다는 걸 알아채지 못하게 성공으로 답한다(피드백 라우트와 같다).
  if (typeof body.website === "string" && body.website.length > 0) {
    return Response.json({ ok: true }, { status: 201 });
  }

  const hashSecret = process.env.FACILITY_REQUEST_HASH_SECRET;
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!hashSecret || !turnstileSecret) return fail("unavailable", 503);

  const ip = clientIp(request);
  const token =
    typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  if (!(await verifyTurnstile(token, ip, turnstileSecret)))
    return fail("turnstile", 400);

  const buildingId = body.buildingId;
  const fields = parseFacilityFields(body.fields);
  if (
    typeof buildingId !== "number" ||
    !Number.isSafeInteger(buildingId) ||
    buildingId <= 0 ||
    !fields
  ) {
    return fail("invalid", 400);
  }

  const db = supabaseAdmin();
  const [buildingResult, typeResult] = await Promise.all([
    // is_deleted가 null인 건물도 살아 있다 — eq(false)는 null을 빼 버린다.
    db
      .from("buildings")
      .select("id")
      .eq("id", buildingId)
      .not("is_deleted", "is", true)
      .maybeSingle(),
    db
      .from("facility_types")
      .select("code")
      .eq("code", fields.facility_code)
      .maybeSingle(),
  ]);
  if (buildingResult.error || typeResult.error) {
    console.error("[facility-requests] lookup failed", {
      building: buildingResult.error?.code,
      type: typeResult.error?.code,
    });
    return fail("server", 500);
  }
  if (!buildingResult.data || !typeResult.data) return fail("invalid", 400);

  const { data: result, error } = await db.rpc("create_facility_request", {
    p_fields: {
      building_id: buildingId,
      facility_code: fields.facility_code,
      name: fields.name,
      description: fields.description,
      floor_info: fields.floor_info,
      lat: fields.lat,
      lng: fields.lng,
    },
    // IP가 없는 요청은 거절하지 않고 한 버킷을 공유한다. Vercel은 항상 x-real-ip를 넣으므로 그 밖의 실행 환경에서만 생긴다.
    p_client_hash: clientHash(ip ?? "unknown", hashSecret),
  });
  if (error || !result) {
    console.error("[facility-requests] create failed", {
      code: error?.code,
      message: error?.message,
    });
    return fail("server", 500);
  }
  if (result === "rate_limited") return fail("rate_limited", 429);

  return Response.json(
    {
      id: result,
      uploadToken: signUploadToken(
        result,
        Date.now() + UPLOAD_TOKEN_TTL_MS,
        hashSecret,
      ),
    },
    { status: 201 },
  );
}
