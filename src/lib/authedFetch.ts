import { reportApiOutcome } from "@/lib/activityReport";
import { supabase } from "@/lib/supabaseClient";

/** 관리자 API 호출. 서버 코드에 닿지 못한 실패는 감사 로그로 보고한다(설계 2026-10-19 4.3). */
export async function authedFetch(
  input: RequestInfo | URL,
  options: RequestInit = {},
) {
  const { data } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  if (data?.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }

  const init = { ...options, headers };
  try {
    const response = await fetch(input, init);
    reportApiOutcome(input, init, response);
    return response;
  } catch (error) {
    reportApiOutcome(input, init, error);
    throw error;
  }
}
