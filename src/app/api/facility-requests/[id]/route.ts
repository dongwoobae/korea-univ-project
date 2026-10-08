import type { FacilityRequestDetail, RequestStatus } from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import { signedUrls } from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!isUuid(id))
    return Response.json({ error: "요청이 없어요" }, { status: 404 });

  const { data: row, error } = await supabaseAdmin()
    .from("facility_requests")
    .select(
      "id, building_id, facility_code, name, description, floor_info, lat, lng, status, created_at, reviewed_at, facility_id, buildings(id, name, geojson), facility_request_photos(id, storage_path, sort_order)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[facility-requests] detail failed", {
      code: error.code,
      message: error.message,
    });
    return Response.json(
      { error: "요청을 불러오지 못했어요" },
      { status: 500 },
    );
  }
  if (!row) return Response.json({ error: "요청이 없어요" }, { status: 404 });

  const photos = [...(row.facility_request_photos ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const urls = await signedUrls(photos.map((photo) => photo.storage_path));
  const detail: FacilityRequestDetail = {
    id: row.id,
    building_id: row.building_id,
    facility_code: row.facility_code,
    name: row.name,
    description: row.description,
    floor_info: row.floor_info,
    lat: row.lat,
    lng: row.lng,
    status: row.status as RequestStatus,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
    facility_id: row.facility_id,
    building: row.buildings
      ? {
          id: row.buildings.id,
          name: row.buildings.name,
          geojson: row.buildings.geojson,
        }
      : null,
    photos: photos.map((photo) => ({
      id: photo.id,
      sort_order: photo.sort_order,
      url: urls.get(photo.storage_path) ?? null,
    })),
  };
  return Response.json(detail);
}
