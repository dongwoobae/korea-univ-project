import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME;
const PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL;

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
      r2,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 3600 },
    );

    return NextResponse.json({
      presignedUrl,
      publicUrl: `${PUBLIC_URL}/${key}`,
    });
  } catch (err) {
    console.error("[facility-video-presign]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
