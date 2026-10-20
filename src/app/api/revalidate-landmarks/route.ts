import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { routeFailures } from "@/lib/server/routeFailures";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/revalidate-landmarks",
    action: "public_map.revalidate",
    actor: { kind: "admin", user: auth.user },
    followUp: true,
  });

  try {
    revalidatePath("/api/landmarks");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[revalidate-landmarks]", err);
    return failures.respond(500, "서버 오류", "server_error", { error: err });
  }
}
