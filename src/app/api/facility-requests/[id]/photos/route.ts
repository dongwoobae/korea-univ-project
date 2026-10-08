import {
  FACILITY_REQUEST_PHOTO_BUCKET,
  MAX_FACILITY_PHOTO_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  UPLOAD_TOKEN_HEADER,
} from "@/lib/facilityPhotos";
import { removeObject, uploadPhoto } from "@/lib/server/requestPhotoStorage";
import { verifyUploadToken } from "@/lib/server/requestSecurity";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";
import { WEBP_SNIFF_BYTES, isWebP } from "@/lib/webpBytes";

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return fail("not_found", 404);
  const secret = process.env.FACILITY_REQUEST_HASH_SECRET;
  if (!secret) return fail("unavailable", 503);
  // 공개 라우트라 본문(최대 수 MB)을 읽기 전에 토큰부터 본다.
  const token = request.headers.get(UPLOAD_TOKEN_HEADER) ?? "";
  if (!verifyUploadToken(token, id, Date.now(), secret))
    return fail("token", 403);
  if (
    Number(request.headers.get("content-length") ?? 0) >
    MAX_FACILITY_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    return fail("too_large", 413);
  }

  const form = await request.formData().catch(() => null);
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
    // not_new·full·함수 실패에서는 이 삭제가 실패해도 요청 행이 있어 정리(설계 2.7) 때 폴더째 지워진다. not_found는 행이 없어 지울 기회가 이 삭제뿐이다.
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
