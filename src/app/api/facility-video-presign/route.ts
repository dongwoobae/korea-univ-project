import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2Presign, R2_BUCKET, getPublicR2Url } from "@/lib/r2";

const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_SIZE = 500 * 1024 * 1024; // 500MB

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
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: "mp4, webm, mov 형식만 업로드 가능해요" },
        { status: 400 },
      );
    }
    if (fileSize > MAX_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 500MB 이하여야 해요" },
        { status: 400 },
      );
    }

    const ext =
      contentType === "video/webm"
        ? "webm"
        : contentType === "video/quicktime"
          ? "mov"
          : "mp4";
    const key = `facility-videos/${facilityId}/${Date.now()}.${ext}`;

    const presignedUrl = await getSignedUrl(
      r2Presign,
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 3600 },
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
