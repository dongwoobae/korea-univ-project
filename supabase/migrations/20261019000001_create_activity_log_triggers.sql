-- 변경 기록 트리거. 설계: docs/specs/2026-10-19-activity-log-design.md 3장

-- PostgREST는 request.* 값을 트랜잭션 로컬로 설정한다. 같은 세션의 다음 트랜잭션에서는
-- NULL이 아니라 ''가 남아 nullif로 둘 다 "없음"으로 읽는다(설계 11장 1).
create function public.activity_actor(
  out actor_kind text,
  out actor_id uuid,
  out actor_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  claimed_role text := claims ->> 'role';
  header_actor text := headers ->> 'x-actor-id';
  header_system text := headers ->> 'x-actor-system';
  person uuid;
begin
  if claims is null then
    actor_kind := 'system';
    actor_label := 'DB 직접 변경';
    return;
  end if;

  if claimed_role = 'authenticated' then
    person := nullif(claims ->> 'sub', '')::uuid;
  elsif claimed_role = 'service_role'
    and header_actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    person := header_actor::uuid;
  elsif claimed_role = 'service_role' then
    actor_kind := 'system';
    actor_label := case header_system
      when 'translation' then '자동 번역'
      when 'osm_sync' then 'OSM 동기화'
      when 'script' then '운영 스크립트'
      else '시스템(미상)'
    end;
    return;
  elsif claimed_role = 'anon' then
    actor_kind := 'visitor';
    actor_label := '방문자';
    return;
  end if;

  if person is null then
    actor_kind := 'system';
    actor_label := '시스템(미상)';
    return;
  end if;

  actor_kind := 'admin';
  actor_id := person;
  select a.display_name into actor_label
  from public.admin_users a
  where a.user_id = person;
  if actor_label is null then
    select '미등록 계정(' || coalesce(u.email, person::text) || ')' into actor_label
    from auth.users u
    where u.id = person;
    actor_label := coalesce(actor_label, '미등록 계정(' || person::text || ')');
  end if;
end;
$$;

create function public.activity_point_count(shape jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from jsonb_path_query(shape, 'strict $.**') as node
  where (jsonb_typeof(node) = 'array' and jsonb_typeof(node -> 0) = 'number')
     or (jsonb_typeof(node) = 'object' and jsonb_typeof(node -> 'lat') = 'number');
$$;

create function public.activity_value(
  table_name text,
  column_name text,
  value jsonb,
  operation text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if value is null or jsonb_typeof(value) = 'null' then
    return value;
  end if;

  if (table_name, column_name) in (
    ('feedback_submissions', 'content'),
    ('facility_requests', 'description')
  ) then
    return jsonb_build_object('redacted', true, 'length', char_length(value #>> '{}'));
  end if;

  if operation <> 'delete' and (table_name, column_name) in (
    ('buildings', 'geojson'),
    ('slope_segments', 'segments')
  ) then
    return jsonb_build_object('changed', true, 'points', public.activity_point_count(value));
  end if;

  if column_name = 'facility_code' then
    return jsonb_build_object('value', value, 'label',
      (select t.label from public.facility_types t where t.code = value #>> '{}'));
  elsif column_name = 'building_id' then
    return jsonb_build_object('value', value, 'label',
      (select b.name from public.buildings b where b.id = (value #>> '{}')::bigint));
  elsif column_name = 'college_id' then
    return jsonb_build_object('value', value, 'label',
      (select c.name from public.colleges c where c.id = (value #>> '{}')::bigint));
  end if;

  return value;
end;
$$;

create function public.activity_facility_label(facility jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(concat_ws(' · ',
    (select b.name from public.buildings b where b.id = (facility ->> 'building_id')::bigint),
    coalesce(
      nullif(facility ->> 'name', ''),
      (select t.label from public.facility_types t where t.code = facility ->> 'facility_code')
    )
  ), '');
$$;

create function public.activity_target_label(table_name text, row_data jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  label text;
begin
  case table_name
    when 'buildings', 'landmarks', 'slope_segments', 'colleges' then
      return row_data ->> 'name';
    when 'facility_types' then
      return row_data ->> 'label';
    when 'app_settings' then
      return row_data ->> 'key';
    when 'admin_users' then
      return '관리자 ' || (row_data ->> 'display_name');
    when 'feedback_submissions' then
      return '의견 제보 #' || left(row_data ->> 'id', 8);
    when 'building_facilities' then
      return public.activity_facility_label(row_data);
    when 'facility_photos' then
      select public.activity_facility_label(to_jsonb(f)) into label
      from public.building_facilities f
      where f.id = (row_data ->> 'facility_id')::uuid;
      return label || ' 사진';
    when 'building_photos' then
      select b.name into label
      from public.buildings b
      where b.id = (row_data ->> 'building_id')::bigint;
      return label || ' 사진';
    when 'facility_requests' then
      return coalesce(
        nullif(row_data ->> 'name', ''),
        (select t.label from public.facility_types t where t.code = row_data ->> 'facility_code')
      ) || ' 등록 요청';
    else
      return null;
  end case;
end;
$$;

-- 기록이 실패해도 원래 저장은 진행한다. 내용을 만들다 난 오류는 audit_write_failed 행으로
-- 남기고, 그 행마저 못 넣으면 warning으로 끝낸다(설계 3.7).
create function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_column text := tg_argv[0];
  operation text := lower(tg_op);
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  source_row jsonb := coalesce(new_row, old_row);
  row_key text := source_row ->> key_column;
  ignored text[] := array['created_at', 'updated_at', 'last_updated', 'client_hash'];
  diff jsonb := '{}'::jsonb;
  column_name text;
  actor record;
begin
  begin
    if tg_op = 'UPDATE' then
      for column_name in select jsonb_object_keys(new_row) loop
        continue when column_name = any(ignored);
        continue when new_row -> column_name is not distinct from old_row -> column_name;
        diff := diff || jsonb_build_object(column_name, jsonb_build_array(
          public.activity_value(tg_table_name, column_name, old_row -> column_name, operation),
          public.activity_value(tg_table_name, column_name, new_row -> column_name, operation)
        ));
      end loop;
      if diff = '{}'::jsonb then
        return null;
      end if;
    else
      for column_name in select jsonb_object_keys(source_row) loop
        continue when column_name = any(ignored);
        continue when tg_op = 'INSERT' and jsonb_typeof(source_row -> column_name) = 'null';
        diff := diff || jsonb_build_object(column_name,
          public.activity_value(tg_table_name, column_name, source_row -> column_name, operation));
      end loop;
    end if;

    select * into actor from public.activity_actor();
    insert into public.activity_logs (
      level, kind, actor_kind, actor_id, actor_label, action,
      target_table, target_id, target_label, changes
    ) values (
      'info', 'change', actor.actor_kind, actor.actor_id, actor.actor_label, operation,
      tg_table_name, row_key, public.activity_target_label(tg_table_name, source_row), diff
    );
  exception when others then
    begin
      insert into public.activity_logs (
        level, kind, actor_kind, actor_label, action,
        target_table, target_id, reason_code, message
      ) values (
        'error', 'failure', 'system', '변경 기록', tg_table_name || '.' || operation,
        tg_table_name, row_key, 'audit_write_failed', left('변경 기록 실패: ' || sqlerrm, 300)
      );
    exception when others then
      raise warning 'activity log write failed for %.% %: %',
        tg_table_name, row_key, operation, sqlerrm;
    end;
  end;
  return null;
end;
$$;

revoke all on function public.activity_actor() from public, anon, authenticated;
revoke all on function public.activity_point_count(jsonb) from public, anon, authenticated;
revoke all on function public.activity_value(text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.activity_facility_label(jsonb) from public, anon, authenticated;
revoke all on function public.activity_target_label(text, jsonb) from public, anon, authenticated;
revoke all on function public.log_change() from public, anon, authenticated;

create trigger log_buildings_change
  after insert or update or delete on public.buildings
  for each row execute function public.log_change('id');
create trigger log_building_facilities_change
  after insert or update or delete on public.building_facilities
  for each row execute function public.log_change('id');
create trigger log_building_photos_change
  after insert or update or delete on public.building_photos
  for each row execute function public.log_change('id');
create trigger log_facility_photos_change
  after insert or update or delete on public.facility_photos
  for each row execute function public.log_change('id');
create trigger log_landmarks_change
  after insert or update or delete on public.landmarks
  for each row execute function public.log_change('id');
create trigger log_slope_segments_change
  after insert or update or delete on public.slope_segments
  for each row execute function public.log_change('id');
create trigger log_colleges_change
  after insert or update or delete on public.colleges
  for each row execute function public.log_change('id');
create trigger log_facility_types_change
  after insert or update or delete on public.facility_types
  for each row execute function public.log_change('code');
create trigger log_app_settings_change
  after insert or update or delete on public.app_settings
  for each row execute function public.log_change('key');
create trigger log_admin_users_change
  after insert or update or delete on public.admin_users
  for each row execute function public.log_change('user_id');
create trigger log_facility_requests_change
  after update or delete on public.facility_requests
  for each row execute function public.log_change('id');
create trigger log_feedback_submissions_change
  after update or delete on public.feedback_submissions
  for each row execute function public.log_change('id');
