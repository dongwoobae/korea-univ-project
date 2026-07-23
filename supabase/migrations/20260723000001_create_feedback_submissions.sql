create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  feedback_type text not null
    check (feedback_type in ('error', 'facility', 'feature', 'other')),
  content text not null
    check (char_length(content) between 3 and 2000),
  page_url text
    check (page_url is null or char_length(page_url) <= 500),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'resolved')),
  created_at timestamptz not null default now()
);

alter table public.feedback_submissions enable row level security;

-- Public clients submit through /api/feedback only. No direct table access.
revoke all on table public.feedback_submissions from anon, authenticated;
