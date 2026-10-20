import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getPublicR2Url } from "@/lib/r2";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_SIZE = 200 * 1024 * 1024; // 200MB

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/upload-facility-video",
    action: "facility_video.upload",
    actor: { kind: "admin", user: auth.user },
  });
  const db = supabaseAdmin({ userId: auth.user.id });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const facilityId = formData.get("facilityId");

    if (
      !(file instanceof File) ||
      typeof facilityId !== "string" ||
      !facilityId
    ) {
      return failures.respond(400, "파일 또는 시설 ID 누락", "invalid_input");
    }
    failures.setTarget({ table: "building_facilities", id: facilityId });

    if (!ALLOWED_TYPES.includes(file.type)) {
      return failures.respond(
        400,
        "mp4, webm, mov 형식만 업로드 가능해요",
        "unsupported_type",
        { fileType: file.type },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.length > MAX_SIZE) {
      return failures.respond(
        400,
        "파일 크기는 200MB 이하여야 해요",
        "payload_too_large",
        { fileSize: buffer.length, limit: MAX_SIZE },
      );
    }

    const ext =
      file.type === "video/webm"
        ? "webm"
        : file.type === "video/quicktime"
          ? "mov"
          : "mp4";
    const key = `facility-videos/${facilityId}/${Date.now()}.${ext}`;

    try {
      await r2.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: file.type,
        }),
      );
    } catch (storageError) {
      console.error("[upload-facility-video] unexpected error:", storageError);
      return failures.respond(500, "서버 오류", "storage_error", {
        error: storageError,
      });
    }

    const videoUrl = getPublicR2Url(key);

    const { error: dbError } = await db
      .from("building_facilities")
      .update({ video_url: videoUrl })
      .eq("id", facilityId);

    if (dbError) {
      console.error("[upload-facility-video] db error:", dbError);
      return failures.respond(500, dbError.message, "server_error", {
        error: dbError,
      });
    }

    return NextResponse.json({ videoUrl });
  } catch (err) {
    console.error("[upload-facility-video] unexpected error:", err);
    return failures.respond(500, "서버 오류", "server_error", { error: err });
  }
}
