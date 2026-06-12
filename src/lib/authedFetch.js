import { supabase } from "@/lib/supabaseClient";

export async function authedFetch(input, options = {}) {
  const { data } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  if (data?.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }

  return fetch(input, {
    ...options,
    headers,
  });
}
