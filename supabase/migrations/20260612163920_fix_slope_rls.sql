alter table public.slope_segments enable row level security;

drop policy if exists "auth all" on public.slope_segments;
drop policy if exists "anon read" on public.slope_segments;
drop policy if exists "authenticated write" on public.slope_segments;

create policy "anon read"
on public.slope_segments
for select
to anon, authenticated
using (true);

create policy "authenticated write"
on public.slope_segments
for all
to authenticated
using (true)
with check (true);
