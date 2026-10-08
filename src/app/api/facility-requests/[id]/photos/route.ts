import {
  FACILITY_REQUEST_PHOTO_BUCKET,
  MAX_FACILITY_PHOTO_BYTES,
} from "@/lib/facilityPhotos";
import { removeObject, uploadPhoto } from "@/lib/server/requestPhotoStorage";
import { verifyUploadToken } from "@/lib/server/requestSecurity";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { WEBP_SNIFF_BYTES, isWebP } from "@/lib/webpBytes";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// multipart 경계·필드 이름이 파일 크기에 더해진다.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return fail("not_found", 404);
  const secret = process.env.FACILITY_REQUEST_HASH_SECRET;
  if (!secret) return fail("unavailable", 503);
  if (
    Number(request.headers.get("content-length") ?? 0) >
    MAX_FACILITY_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    return fail("too_large", 413);
  }

  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  if (
    typeof token !== "string" ||
    !verifyUploadToken(token, id, Date.now(), secret)
  ) {
    return fail("token", 403);
  }
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("invalid", 400);
  if (file.size > MAX_FACILITY_PHOTO_BYTES) return fail("too_large", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebP(bytes.subarray(0, WEBP_SNIFF_BYTES), bytes.length))
    return fail("not_webp", 400);

  const path = await uploadPhoto(FACILITY_REQUEST_PHOTO_BUCKET, id, bytes);
  if (!path) return fail("server", 500);

  // 상태 확인을 업로드 뒤 함수에서 한다 — 먼저 확인하면 승인·정리가 끝난 요청에 사진이 붙는다(설계 3.5).
  const { data: result, error } = await supabaseAdmin().rpc(
    "add_facility_request_photo",
    {
      p_request_id: id,
      p_storage_path: path,
    },
  );
  if (
    error ||
    !result ||
    result === "not_new" ||
    result === "full" ||
    result === "not_found"
  ) {
    // 이 삭제가 실패해도 파일은 요청 폴더 안이라 정리(설계 2.7) 때 지워진다.
    await removeObject(FACILITY_REQUEST_PHOTO_BUCKET, path);
    if (error || !result) {
      console.error("[facility-request-photos] add failed", {
        message: error?.message,
      });
      return fail("server", 500);
    }
    return fail(result, result === "not_found" ? 404 : 409);
  }
  return Response.json({ id: result }, { status: 201 });
}
