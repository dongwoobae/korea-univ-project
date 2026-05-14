-- ============================================================
-- Security Advisor 경고 수정
-- 실행: Supabase Dashboard > SQL Editor
-- ============================================================

-- -----------------------------------------------
-- 1. buildings: 과도한 authenticated ALL 정책 제거
--    이유: admin 작업은 service_role key 사용 → RLS 우회
--          authenticated 롤에 CRUD 불필요
-- -----------------------------------------------
DROP POLICY IF EXISTS "authenticated crud buildings" ON public.buildings;

-- -----------------------------------------------
-- 2. building_facilities: 과도한 authenticated ALL 정책 제거
-- -----------------------------------------------
DROP POLICY IF EXISTS "authenticated crud building_facilities" ON public.building_facilities;

-- -----------------------------------------------
-- 3. facility_types: 과도한 authenticated ALL 정책 제거
-- -----------------------------------------------
DROP POLICY IF EXISTS "authenticated crud facility_types" ON public.facility_types;

-- -----------------------------------------------
-- 4. building_photos: 과도한 authenticated 정책 제거
-- -----------------------------------------------
DROP POLICY IF EXISTS "Authenticated delete building_photos" ON public.building_photos;
DROP POLICY IF EXISTS "Authenticated insert building_photos" ON public.building_photos;

-- -----------------------------------------------
-- 5. colleges: 과도한 authenticated 정책 제거
-- -----------------------------------------------
DROP POLICY IF EXISTS "Authenticated delete colleges" ON public.colleges;
DROP POLICY IF EXISTS "Authenticated insert colleges" ON public.colleges;
DROP POLICY IF EXISTS "Authenticated update colleges" ON public.colleges;

-- -----------------------------------------------
-- 6. rls_auto_enable 함수: anon/authenticated EXECUTE 권한 차단
-- -----------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

-- -----------------------------------------------
-- 참고: Leaked Password Protection → Pro plan 전용, 스킵
-- -----------------------------------------------
