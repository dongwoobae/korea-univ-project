import { supabase } from "@/lib/supabaseClient";

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
