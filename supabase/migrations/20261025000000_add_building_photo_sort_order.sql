-- 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 3.3
-- 지금 업로드 코드는 sort_order 없이 넣는다. 화면 코드(PR ①-2)보다 먼저 나가도 그대로 돌게 번호는 DB가 매긴다.

alter table public.building_photos add column sort_order integer;

-- 채우기가 사진마다 변경 기록을 남기지 않게 그동안만 끈다.
alter table public.building_photos disable trigger log_building_photos_change;
update public.building_photos as photo
set sort_order = ranked.position
from (
  select id, row_number() over (partition by building_id order by created_at, id) - 1 as position
  from public.building_photos
) as ranked
where photo.id = ranked.id;
alter table public.building_photos enable trigger log_building_photos_change;

alter table public.building_photos
  alter column sort_order set not null,
  add constraint building_photos_sort_order_check check (sort_order >= 0),
  -- 맞바꾸기는 한 문장으로 두 행을 바꾼다. 행마다가 아니라 문장 끝에 검사하도록 deferrable로 둔다.
  add constraint building_photos_building_id_sort_order_key
    unique (building_id, sort_order) deferrable initially immediate;

create function public.assign_building_photo_sort_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 같은 건물의 삽입과 맞바꾸기를 줄 세운다. 번호를 직접 준 삽입도 잡는다 — 맞바꾸기가 이웃을 확인한 뒤 그 사이로 끼어들지 않게.
  perform pg_advisory_xact_lock(hashtext('building_photos.sort_order:' || new.building_id));
  if new.sort_order is null then
    -- READ COMMITTED 전제: 아래 max는 잠금을 얻은 뒤의 스냅숏으로 읽힌다.
    select coalesce(max(sort_order), -1) + 1
    into new.sort_order
    from public.building_photos
    where building_id = new.building_id;
  end if;
  return new;
end;
$$;

revoke all on function public.assign_building_photo_sort_order() from public, anon, authenticated;

create trigger assign_building_photo_sort_order
  before insert on public.building_photos
  for each row execute function public.assign_building_photo_sort_order();

create function public.swap_building_photo_order(p_first integer, p_second integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_building_id bigint;
  v_first record;
  v_second record;
  v_updated integer;
begin
  if p_first = p_second then
    raise exception 'cannot swap a photo with itself' using errcode = '22023';
  end if;

  select building_id into v_building_id from public.building_photos where id = p_first;
  if not found then
    raise exception 'building photo % not found', p_first using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('building_photos.sort_order:' || v_building_id));

  -- 잠금을 기다리는 사이 순서가 바뀌었을 수 있어 다시 읽는다. 지우기 라우트는 위 잠금을 잡지 않으므로 행 잠금으로
  -- 끝날 때까지 두 행이 지워지지 않게 한다. RLS는 고칠 권한이 없는 행을 for update에서 거른다.
  select building_id, sort_order into v_first from public.building_photos where id = p_first for update;
  select building_id, sort_order into v_second from public.building_photos where id = p_second for update;
  if v_first.building_id is null or v_second.building_id is null then
    if (select count(*) from public.building_photos where id in (p_first, p_second)) = 2 then
      raise exception 'not allowed to reorder building photos' using errcode = '42501';
    end if;
    raise exception 'building photo not found' using errcode = 'P0002';
  end if;
  if v_first.building_id <> v_second.building_id then
    raise exception 'photos belong to different buildings' using errcode = '22023';
  end if;

  -- 다른 관리자가 그사이 순서를 바꿨다. 화면은 이 코드를 받으면 다시 불러온다.
  if exists (
    select 1
    from public.building_photos
    where building_id = v_first.building_id
      and sort_order > least(v_first.sort_order, v_second.sort_order)
      and sort_order < greatest(v_first.sort_order, v_second.sort_order)
  ) then
    raise exception 'photos are no longer adjacent' using errcode = 'PT409';
  end if;

  update public.building_photos
  set sort_order = case id when p_first then v_second.sort_order else v_first.sort_order end
  where id in (p_first, p_second);
  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'not allowed to reorder building photos' using errcode = '42501';
  end if;
end;
$$;

-- Supabase 기본 권한이 새 함수를 service_role에도 준다. 관리자 화면의 브라우저 클라이언트만 부른다.
revoke all on function public.swap_building_photo_order(integer, integer) from public, anon, service_role;
grant execute on function public.swap_building_photo_order(integer, integer) to authenticated;
