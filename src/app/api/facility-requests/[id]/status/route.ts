import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";

const OPPOSITE = { new: "reviewing", reviewing: "new" } as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!isUuid(id))
    return Response.json({ error: "요청이 없어요" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  const status = body?.status;
  if (status !== "new" && status !== "reviewing") {
    return Response.json(
      { error: "상태 값이 올바르지 않아요" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin()
    .from("facility_requests")
    .update({ status })
    .eq("id", id)
    .eq("status", OPPOSITE[status])
    .select("id");
  if (error) {
    console.error("[facility-requests] status update failed", {
      id,
      code: error.code,
    });
    return Response.json({ error: "상태를 바꾸지 못했어요" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return Response.json(
      { error: "이미 처리됐거나 상태가 바뀐 요청이에요" },
      { status: 409 },
    );
  }
  return Response.json({ status });
}
