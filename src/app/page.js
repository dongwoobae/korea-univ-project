import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export default async function Home() {
  const { data, error } = await supabase.from("posts").select("*");

  if (error) {
    return <div>에러: {error.message}</div>;
  }

  return (
    <div>
      <h1>Supabase 연결 성공</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
