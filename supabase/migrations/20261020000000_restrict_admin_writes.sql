-- 로그인 계정이면 누구나 쓰던 테이블의 쓰기를 관리자 목록 기준으로 좁힌다.
-- 설계: docs/specs/2026-10-19-activity-log-design.md 6장·7장

do $$
begin
  -- app.db_test는 DB test 잡의 적용 스크립트만 준다(설계 6장).
  if coalesce(current_setting('app.db_test', true), '') <> 'on'
    and not exists (select 1 from public.admin_users) then
    raise exception 'admin_users is empty. Insert the admin rows before this migration (docs/specs/2026-10-19-activity-log-design.md 7).';
  end if;
end;
$$;

-- 콘솔에서 만든 정책이라 마이그레이션에 없다. 이름은 운영 pg_policies 기준이다.
drop policy "authenticated can insert buildings" on public.buildings;
drop policy "authenticated can update buildings" on public.buildings;
drop policy "authenticated can delete buildings" on public.buildings;
drop policy "authenticated can insert building_facilities" on public.building_facilities;
drop policy "authenticated can update building_facilities" on public.building_facilities;
drop policy "authenticated can delete building_facilities" on public.building_facilities;
drop policy "authenticated can insert building_photos" on public.building_photos;
drop policy "authenticated can update building_photos" on public.building_photos;
drop policy "authenticated can delete building_photos" on public.building_photos;
drop policy "authenticated can insert colleges" on public.colleges;
drop policy "authenticated can update colleges" on public.colleges;
drop policy "authenticated can delete colleges" on public.colleges;
drop policy "authenticated can insert facility_types" on public.facility_types;
drop policy "authenticated can update facility_types" on public.facility_types;
drop policy "authenticated can delete facility_types" on public.facility_types;

drop policy "authenticated write" on public.landmarks;
drop policy "authenticated write" on public.slope_segments;

create policy "admin write" on public.buildings for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.building_facilities for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.building_photos for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.colleges for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.facility_types for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.landmarks for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.slope_segments for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
