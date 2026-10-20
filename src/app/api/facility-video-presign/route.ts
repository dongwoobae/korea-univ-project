import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2Presign, R2_BUCKET, getPublicR2Url } from "@/lib/r2";
import { routeFailures } from "@/lib/server/routeFailures";
import {
  MAX_POSTER_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_LABEL,
  exceedsVideoLimit,
  facilityVideoKey,
  facilityVideoPosterKey,
  isValidFileSize,
} from "@/lib/videoUpload";

const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/facility-video-presign",
    action: "facility_video.upload",
    actor: { kind: "admin", user: auth.user },
  });

  try {
    const { facilityId, contentType, fileSize, posterSize } =
      await request.json();

    if (!facilityId || !contentType) {
      return failures.respond(
        400,
        "facilityId 또는 contentType 누락",
        "invalid_input",
      );
    }
    // R2 key에 그대로 들어가므로 형식을 확인한다. `../`가 섞이면 버킷의
    // 다른 경로를 가리킬 수 있다. 시설 id는 UUID다.
    if (!UUID_PATTERN.test(String(facilityId))) {
      return failures.respond(
        400,
        "facilityId 형식이 올바르지 않아요",
        "invalid_input",
      );
    }
    failures.setTarget({
      table: "building_facilities",
      id: String(facilityId),
    });
    if (!ALLOWED_TYPES.includes(contentType)) {
      return failures.respond(
        400,
        "mp4, webm, mov 형식만 업로드 가능해요",
        "unsupported_type",
        { fileType: String(contentType) },
      );
    }
    // 생략을 허용하면 상한 검사 전체가 무력해진다 — `undefined > MAX`는 false다.
    if (!isValidFileSize(fileSize)) {
      return failures.respond(
        400,
        "파일 크기 정보가 필요해요",
        "invalid_input",
      );
    }
    if (exceedsVideoLimit(fileSize)) {
      return failures.respond(
        400,
        `파일 크기는 ${MAX_VIDEO_LABEL} 이하여야 해요`,
        "payload_too_large",
        { fileSize, limit: MAX_VIDEO_BYTES },
      );
    }
    if (
      posterSize !== undefined &&
      (!isValidFileSize(posterSize) || posterSize > MAX_POSTER_BYTES)
    ) {
      return failures.respond(
        400,
        "포스터 크기가 올바르지 않아요",
        "invalid_input",
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

    let posterPresignedUrl: string | null = null;
    let posterPublicUrl: string | null = null;
    if (posterSize !== undefined) {
      const posterKey = facilityVideoPosterKey(key);
      posterPresignedUrl = await getSignedUrl(
        r2Presign,
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: posterKey,
          ContentType: "image/jpeg",
          ContentLength: posterSize,
        }),
        {
          expiresIn: 3600,
          signableHeaders: new Set(["content-length"]),
        },
      );
      posterPublicUrl = getPublicR2Url(posterKey);
    }

    return NextResponse.json({
      presignedUrl,
      publicUrl: getPublicR2Url(key),
      posterPresignedUrl,
      posterPublicUrl,
    });
  } catch (err) {
    console.error("[facility-video-presign]", err);
    return failures.respond(500, "서버 오류", "server_error", { error: err });
  }
}
