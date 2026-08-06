import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2Presign, R2_BUCKET, getPublicR2Url } from "@/lib/r2";
import {
  MAX_VIDEO_LABEL,
  exceedsVideoLimit,
  facilityVideoKey,
  isValidFileSize,
} from "@/lib/videoUpload";

const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const { facilityId, contentType, fileSize } = await request.json();

    if (!facilityId || !contentType) {
      return NextResponse.json(
        { error: "facilityId 또는 contentType 누락" },
        { status: 400 },
      );
    }
    // R2 key에 그대로 들어가므로 형식을 확인한다. `../`가 섞이면 버킷의
    // 다른 경로를 가리킬 수 있다. 시설 id는 UUID다.
    if (!UUID_PATTERN.test(String(facilityId))) {
      return NextResponse.json(
        { error: "facilityId 형식이 올바르지 않아요" },
        { status: 400 },
      );
    }
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: "mp4, webm, mov 형식만 업로드 가능해요" },
        { status: 400 },
      );
    }
    // 생략을 허용하면 상한 검사 전체가 무력해진다 — `undefined > MAX`는 false다.
    if (!isValidFileSize(fileSize)) {
      return NextResponse.json(
        { error: "파일 크기 정보가 필요해요" },
        { status: 400 },
      );
    }
    if (exceedsVideoLimit(fileSize)) {
      return NextResponse.json(
        { error: `파일 크기는 ${MAX_VIDEO_LABEL} 이하여야 해요` },
        { status: 400 },
      );
    }

    const ext =
      contentType === "video/webm"
        ? "webm"
        : contentType === "video/quicktime"
          ? "mov"
          : "mp4";
    const key = facilityVideoKey(facilityId, ext, Date.now());

    // 크기를 서명에 넣어 R2가 직접 강제하게 한다. 이게 없으면 위 검사는
    // "신청서"만 보는 셈이라, fileSize를 1로 신청하고 5GB를 올릴 수 있다.
    // content-length를 SignedHeaders에 넣어야 실제로 걸린다(실측 확인).
    const presignedUrl = await getSignedUrl(
      r2Presign,
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: contentType,
        ContentLength: fileSize,
      }),
      {
        expiresIn: 3600,
        signableHeaders: new Set(["content-length"]),
      },
    );

    return NextResponse.json({
      presignedUrl,
      publicUrl: getPublicR2Url(key),
    });
  } catch (err) {
    console.error("[facility-video-presign]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
