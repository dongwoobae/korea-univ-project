import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    revalidatePath("/api/landmarks");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[revalidate-landmarks]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
