-- app_settings: key-value 설정 저장 (피드백 이메일 등 admin이 런타임 변경하는 값)

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- 읽기: 모두 허용 (FeedbackButton 등에서 anon key로 조회)
create policy "public read app_settings"
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

-- 쓰기 정책 없음 → service_role만 가능 (admin API route)

-- 초기 데이터
insert into public.app_settings (key, value) values
  ('feedback_emails', jsonb_build_object(
    'to', 'hnsn9716@korea.ac.kr',
    'cc', 'dw5817@naver.com',
    'subject', '[모두의 캠퍼스] 피드백'
  ))
on conflict (key) do nothing;
