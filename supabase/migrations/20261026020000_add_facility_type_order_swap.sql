-- 설계: docs/specs/2026-10-26-facility-type-management-design.md 3.2

-- 맞바꾸기는 한 문장으로 두 행을 바꾼다. 행마다가 아니라 문장 끝에 검사하도록 deferrable로 둔다.
-- 시퀀스보다 먼저 더한다: 같은 트랜잭션 안이면 여기서 잡은 표 잠금이 아래 시퀀스 맞추기까지 다른 삽입을 막는다.
alter table public.facility_types
  add constraint facility_types_sort_order_key unique (sort_order) deferrable initially immediate;

-- 멘토링 ② 마이그레이션(20261026000000)이 identity가 채운 번호를 손으로 덮어써, 시퀀스의 다음 값이 이미 쓰인 번호일 수 있다.
select setval(
  pg_get_serial_sequence('public.facility_types', 'sort_order'),
  coalesce((select max(sort_order) from public.facility_types), 0) + 1,
  false
);

create function public.swap_facility_type_order(p_first text, p_second text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_first record;
  v_second record;
  v_updated integer;
begin
  if p_first = p_second then
    raise exception 'cannot swap a facility type with itself' using errcode = '22023';
  end if;

  -- 잠근 뒤에 읽는다. 잠금 없이 읽으면 겹치는 두 쌍(A·B와 B·C)을 동시에 바꿀 때 둘 다 옛 번호로 판정하고 써서 번호가 겹친다.
  perform pg_advisory_xact_lock(hashtext('facility_types.sort_order'));

  -- 삭제는 위 잠금을 잡지 않으므로 행 잠금으로 끝날 때까지 두 행이 지워지지 않게 한다. RLS는 고칠 권한이 없는 행을 for update에서 거른다.
  select code, sort_order into v_first from public.facility_types where code = p_first for update;
  select code, sort_order into v_second from public.facility_types where code = p_second for update;
  if v_first.code is null or v_second.code is null then
    if (select count(*) from public.facility_types where code in (p_first, p_second)) = 2 then
      raise exception 'not allowed to reorder facility types' using errcode = '42501';
    end if;
    raise exception 'facility type not found' using errcode = 'P0002';
  end if;

  -- 화면은 p_first를 바로 앞 종류로 넘긴다. 지금 그렇지 않으면 다른 관리자가 그사이 순서를 바꾼 것이다 — 방향까지 봐야
  -- 오래된 화면이 같은 쌍을 다시 눌러 앞서 바꾼 것을 몰래 되돌리는 것도 잡는다. 화면은 이 코드를 받으면 다시 불러온다.
  if v_first.sort_order > v_second.sort_order or exists (
    select 1
    from public.facility_types
    where sort_order > v_first.sort_order
      and sort_order < v_second.sort_order
  ) then
    raise exception 'facility types are no longer adjacent in this order' using errcode = 'PT409';
  end if;

  update public.facility_types
  set sort_order = case code when p_first then v_second.sort_order else v_first.sort_order end
  where code in (p_first, p_second);
  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'not allowed to reorder facility types' using errcode = '42501';
  end if;
end;
$$;

-- Supabase 기본 권한이 새 함수를 service_role에도 준다. 관리자 화면의 브라우저 클라이언트만 부른다.
revoke all on function public.swap_facility_type_order(text, text) from public, anon, service_role;
grant execute on function public.swap_facility_type_order(text, text) to authenticated;
