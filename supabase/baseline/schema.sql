-- baseline-migration: 20261008000000
-- server-version: 17.6
-- dumped-at: 2026-10-19T07:45:17Z



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."add_facility_request_photo"("p_request_id" "uuid", "p_storage_path" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_status text;
  v_slot integer;
  v_id uuid;
begin
  -- approve_facility_request와 같은 행을 잠가 승인·거절과 차례로만 실행된다(설계 3.5).
  select status into v_status
  from public.facility_requests
  where id = p_request_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_status <> 'new' then
    return 'not_new';
  end if;

  select slot into v_slot
  from generate_series(0, 2) as slot
  where not exists (
    select 1
    from public.facility_request_photos photo
    where photo.request_id = p_request_id
      and photo.sort_order = slot
  )
  order by slot
  limit 1;

  if v_slot is null then
    return 'full';
  end if;

  insert into public.facility_request_photos (request_id, storage_path, sort_order)
  values (p_request_id, p_storage_path, v_slot)
  returning id into v_id;

  return v_id::text;
end;
$$;


ALTER FUNCTION "public"."add_facility_request_photo"("p_request_id" "uuid", "p_storage_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_facility_request"("p_request_id" "uuid", "p_facility_id" "uuid", "p_fields" "jsonb", "p_photos" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_request public.facility_requests%rowtype;
begin
  select * into v_request
  from public.facility_requests
  where id = p_request_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_request.status not in ('new', 'reviewing') then
    return 'already_processed';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_photos) as photo
    where not exists (
      select 1
      from public.facility_request_photos request_photo
      where request_photo.id = (photo->>'request_photo_id')::uuid
        and request_photo.request_id = p_request_id
    )
  ) then
    return 'photo_mismatch';
  end if;

  insert into public.building_facilities (
    id, building_id, facility_code, name, description, floor_info,
    is_installed, lat, lng, translation_status
  ) values (
    p_facility_id,
    v_request.building_id,
    p_fields->>'facility_code',
    nullif(p_fields->>'name', ''),
    nullif(p_fields->>'description', ''),
    nullif(p_fields->>'floor_info', ''),
    coalesce((p_fields->>'is_installed')::boolean, true),
    (p_fields->>'lat')::double precision,
    (p_fields->>'lng')::double precision,
    'pending'
  );

  insert into public.facility_photos (facility_id, storage_path, sort_order)
  select
    p_facility_id,
    photo->>'storage_path',
    (photo->>'sort_order')::smallint
  from jsonb_array_elements(p_photos) as photo;

  update public.facility_requests
  set status = 'approved',
      facility_id = p_facility_id,
      reviewed_at = now()
  where id = p_request_id;

  return 'approved';
end;
$$;


ALTER FUNCTION "public"."approve_facility_request"("p_request_id" "uuid", "p_facility_id" "uuid", "p_fields" "jsonb", "p_photos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_facility_request"("p_fields" "jsonb", "p_client_hash" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
begin
  -- 같은 해시의 동시 요청이 둘 다 9건을 보고 통과하지 않게 세기 전에 잠근다.
  -- READ COMMITTED 전제: 세는 문장의 스냅숏이 잠금 대기 뒤에 잡힌다. REPEATABLE READ 이상이면 둘 다 9건을 본다.
  perform pg_advisory_xact_lock(hashtext(p_client_hash));
  if (
    select count(*)
    from public.facility_requests
    where client_hash = p_client_hash
      and created_at > now() - interval '1 hour'
  ) >= 10 then
    return 'rate_limited';
  end if;

  insert into public.facility_requests (
    building_id, facility_code, name, description, floor_info, lat, lng, client_hash
  ) values (
    (p_fields->>'building_id')::bigint,
    p_fields->>'facility_code',
    nullif(p_fields->>'name', ''),
    nullif(p_fields->>'description', ''),
    nullif(p_fields->>'floor_info', ''),
    (p_fields->>'lat')::double precision,
    (p_fields->>'lng')::double precision,
    p_client_hash
  )
  returning id into v_id;

  return v_id::text;
end;
$$;


ALTER FUNCTION "public"."create_facility_request"("p_fields" "jsonb", "p_client_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_building_summary"() RETURNS TABLE("registered_facility_count" bigint, "missing_facility_count" bigint, "missing_photo_count" bigint, "missing_location_count" bigint, "stale_update_count" bigint, "translation_needed_count" bigint, "translation_needed_building_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select
    (
      select count(*)
      from public.building_facilities facility
      join public.admin_building_flags flag
        on flag.building_id = facility.building_id
    ) as registered_facility_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.missing_facility
    ) as missing_facility_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.missing_photo
    ) as missing_photo_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.missing_location
    ) as missing_location_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.stale_update
    ) as stale_update_count,
    (
      select count(*)
      from public.building_facilities facility
      join public.admin_building_flags flag
        on flag.building_id = facility.building_id
      where facility.translation_status <> 'translated'
    ) as translation_needed_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.translation_needed
    ) as translation_needed_building_count;
$$;


ALTER FUNCTION "public"."get_admin_building_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_content_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_admin_content_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."building_facilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "building_id" bigint,
    "facility_code" "text",
    "is_installed" boolean DEFAULT false,
    "description" "text",
    "floor_info" "text",
    "name" "text",
    "lat" double precision,
    "lng" double precision,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "video_url" "text",
    "video_caption" "text",
    "name_en" "text",
    "name_zh" "text",
    "description_en" "text",
    "description_zh" "text",
    "floor_info_en" "text",
    "floor_info_zh" "text",
    "video_caption_en" "text",
    "video_caption_zh" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "translation_status" "text" DEFAULT 'translated'::"text" NOT NULL,
    "video_poster_url" "text",
    CONSTRAINT "building_facilities_translation_status_check" CHECK (("translation_status" = ANY (ARRAY['pending'::"text", 'translated'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."building_facilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."building_photos" (
    "id" integer NOT NULL,
    "building_id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "caption" "text",
    "caption_en" "text",
    "caption_zh" "text"
);


ALTER TABLE "public"."building_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."buildings" (
    "id" bigint NOT NULL,
    "name" "text",
    "name_en" "text",
    "campus" "text" DEFAULT '서울'::"text",
    "last_updated" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "geojson" "jsonb",
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "college_id" integer
);


ALTER TABLE "public"."buildings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."admin_building_flags" WITH ("security_invoker"='on') AS
 SELECT "id" AS "building_id",
    (NOT (EXISTS ( SELECT 1
           FROM "public"."building_facilities" "facility"
          WHERE ("facility"."building_id" = "building"."id")))) AS "missing_facility",
    (NOT (EXISTS ( SELECT 1
           FROM "public"."building_photos" "photo"
          WHERE ("photo"."building_id" = "building"."id")))) AS "missing_photo",
    ("geojson" IS NULL) AS "missing_location",
    (("last_updated" IS NULL) OR ("last_updated" < (CURRENT_DATE - 365))) AS "stale_update",
    (EXISTS ( SELECT 1
           FROM "public"."building_facilities" "facility"
          WHERE (("facility"."building_id" = "building"."id") AND ("facility"."translation_status" <> 'translated'::"text")))) AS "translation_needed"
   FROM "public"."buildings" "building"
  WHERE (NOT COALESCE("is_deleted", false));


ALTER VIEW "public"."admin_building_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."building_photos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."building_photos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."building_photos_id_seq" OWNED BY "public"."building_photos"."id";



CREATE TABLE IF NOT EXISTS "public"."colleges" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "name_zh" "text"
);


ALTER TABLE "public"."colleges" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."colleges_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."colleges_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."colleges_id_seq" OWNED BY "public"."colleges"."id";



CREATE TABLE IF NOT EXISTS "public"."facility_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "facility_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "sort_order" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "facility_photos_sort_order_check" CHECK ((("sort_order" >= 0) AND ("sort_order" <= 2)))
);


ALTER TABLE "public"."facility_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facility_request_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "sort_order" smallint NOT NULL,
    CONSTRAINT "facility_request_photos_sort_order_check" CHECK ((("sort_order" >= 0) AND ("sort_order" <= 2)))
);


ALTER TABLE "public"."facility_request_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facility_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "building_id" bigint NOT NULL,
    "facility_code" "text" NOT NULL,
    "name" "text",
    "description" "text",
    "floor_info" "text",
    "lat" double precision,
    "lng" double precision,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "client_hash" "text" NOT NULL,
    "facility_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "facility_requests_description_check" CHECK ((("description" IS NULL) OR ("char_length"("description") <= 1000))),
    CONSTRAINT "facility_requests_floor_info_check" CHECK ((("floor_info" IS NULL) OR ("char_length"("floor_info") <= 100))),
    CONSTRAINT "facility_requests_lat_check" CHECK ((("lat" IS NULL) OR (("lat" >= ('-90'::integer)::double precision) AND ("lat" <= (90)::double precision)))),
    CONSTRAINT "facility_requests_lng_check" CHECK ((("lng" IS NULL) OR (("lng" >= ('-180'::integer)::double precision) AND ("lng" <= (180)::double precision)))),
    CONSTRAINT "facility_requests_name_check" CHECK ((("name" IS NULL) OR ("char_length"("name") <= 100))),
    CONSTRAINT "facility_requests_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'reviewing'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."facility_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facility_types" (
    "code" "text" NOT NULL,
    "label" "text",
    "label_en" "text",
    "label_zh" "text"
);


ALTER TABLE "public"."facility_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "feedback_type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "page_url" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feedback_submissions_content_check" CHECK ((("char_length"("content") >= 3) AND ("char_length"("content") <= 2000))),
    CONSTRAINT "feedback_submissions_feedback_type_check" CHECK (("feedback_type" = ANY (ARRAY['error'::"text", 'facility'::"text", 'feature'::"text", 'other'::"text"]))),
    CONSTRAINT "feedback_submissions_page_url_check" CHECK ((("page_url" IS NULL) OR ("char_length"("page_url") <= 500))),
    CONSTRAINT "feedback_submissions_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'reviewing'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."feedback_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."landmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "name_zh" "text",
    "description" "text",
    "description_en" "text",
    "description_zh" "text",
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "image_url" "text",
    "photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "icon" "text" DEFAULT '✨'::"text" NOT NULL,
    CONSTRAINT "landmarks_icon_length" CHECK (("char_length"("icon") <= 16))
);


ALTER TABLE "public"."landmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slope_segments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "gpx_file" "text",
    "segments" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."slope_segments" OWNER TO "postgres";


ALTER TABLE ONLY "public"."building_photos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."building_photos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."colleges" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."colleges_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."building_facilities"
    ADD CONSTRAINT "building_facilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."building_photos"
    ADD CONSTRAINT "building_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."colleges"
    ADD CONSTRAINT "colleges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facility_photos"
    ADD CONSTRAINT "facility_photos_facility_id_sort_order_key" UNIQUE ("facility_id", "sort_order");



ALTER TABLE ONLY "public"."facility_photos"
    ADD CONSTRAINT "facility_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facility_request_photos"
    ADD CONSTRAINT "facility_request_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facility_request_photos"
    ADD CONSTRAINT "facility_request_photos_request_id_sort_order_key" UNIQUE ("request_id", "sort_order");



ALTER TABLE ONLY "public"."facility_requests"
    ADD CONSTRAINT "facility_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facility_types"
    ADD CONSTRAINT "facility_types_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."feedback_submissions"
    ADD CONSTRAINT "feedback_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."landmarks"
    ADD CONSTRAINT "landmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slope_segments"
    ADD CONSTRAINT "slope_segments_pkey" PRIMARY KEY ("id");



CREATE INDEX "facility_requests_building_idx" ON "public"."facility_requests" USING "btree" ("building_id");



CREATE INDEX "facility_requests_client_hash_created_idx" ON "public"."facility_requests" USING "btree" ("client_hash", "created_at");



CREATE INDEX "facility_requests_status_created_idx" ON "public"."facility_requests" USING "btree" ("status", "created_at" DESC);



CREATE OR REPLACE TRIGGER "set_building_facilities_updated_at" BEFORE UPDATE ON "public"."building_facilities" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_content_updated_at"();



CREATE OR REPLACE TRIGGER "set_landmarks_updated_at" BEFORE UPDATE ON "public"."landmarks" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_content_updated_at"();



CREATE OR REPLACE TRIGGER "set_slope_segments_updated_at" BEFORE UPDATE ON "public"."slope_segments" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_content_updated_at"();



ALTER TABLE ONLY "public"."building_facilities"
    ADD CONSTRAINT "building_facilities_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."building_facilities"
    ADD CONSTRAINT "building_facilities_facility_code_fkey" FOREIGN KEY ("facility_code") REFERENCES "public"."facility_types"("code");



ALTER TABLE ONLY "public"."building_photos"
    ADD CONSTRAINT "building_photos_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "public"."colleges"("id");



ALTER TABLE ONLY "public"."facility_photos"
    ADD CONSTRAINT "facility_photos_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."building_facilities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."facility_request_photos"
    ADD CONSTRAINT "facility_request_photos_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."facility_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."facility_requests"
    ADD CONSTRAINT "facility_requests_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id");



ALTER TABLE ONLY "public"."facility_requests"
    ADD CONSTRAINT "facility_requests_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."building_facilities"("id") ON DELETE SET NULL;



CREATE POLICY "Public read building_photos" ON "public"."building_photos" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read colleges" ON "public"."colleges" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anon read" ON "public"."landmarks" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anon read" ON "public"."slope_segments" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated can delete building_facilities" ON "public"."building_facilities" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "authenticated can delete building_photos" ON "public"."building_photos" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "authenticated can delete buildings" ON "public"."buildings" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "authenticated can delete colleges" ON "public"."colleges" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "authenticated can delete facility_types" ON "public"."facility_types" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "authenticated can insert building_facilities" ON "public"."building_facilities" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated can insert building_photos" ON "public"."building_photos" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated can insert buildings" ON "public"."buildings" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated can insert colleges" ON "public"."colleges" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated can insert facility_types" ON "public"."facility_types" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated can select building_facilities" ON "public"."building_facilities" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated can select building_photos" ON "public"."building_photos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated can select buildings" ON "public"."buildings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated can select colleges" ON "public"."colleges" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated can select facility_types" ON "public"."facility_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated can update building_facilities" ON "public"."building_facilities" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "authenticated can update building_photos" ON "public"."building_photos" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "authenticated can update buildings" ON "public"."buildings" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "authenticated can update colleges" ON "public"."colleges" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "authenticated can update facility_types" ON "public"."facility_types" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "authenticated select building_facilities" ON "public"."building_facilities" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated write" ON "public"."landmarks" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated write" ON "public"."slope_segments" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."building_facilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."building_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."buildings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."colleges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facility_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "facility_photos_public_read" ON "public"."facility_photos" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."facility_request_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facility_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facility_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."landmarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public read app_settings" ON "public"."app_settings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "public read building_facilities" ON "public"."building_facilities" FOR SELECT TO "anon" USING (true);



CREATE POLICY "public read buildings" ON "public"."buildings" FOR SELECT TO "anon" USING (true);



CREATE POLICY "public read facility_types" ON "public"."facility_types" FOR SELECT TO "anon" USING (true);



ALTER TABLE "public"."slope_segments" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_facility_request_photo"("p_request_id" "uuid", "p_storage_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_facility_request_photo"("p_request_id" "uuid", "p_storage_path" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_facility_request"("p_request_id" "uuid", "p_facility_id" "uuid", "p_fields" "jsonb", "p_photos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_facility_request"("p_request_id" "uuid", "p_facility_id" "uuid", "p_fields" "jsonb", "p_photos" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_facility_request"("p_fields" "jsonb", "p_client_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_facility_request"("p_fields" "jsonb", "p_client_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_building_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_building_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_building_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_building_summary"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_admin_content_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_content_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_content_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."building_facilities" TO "anon";
GRANT ALL ON TABLE "public"."building_facilities" TO "authenticated";
GRANT ALL ON TABLE "public"."building_facilities" TO "service_role";



GRANT ALL ON TABLE "public"."building_photos" TO "anon";
GRANT ALL ON TABLE "public"."building_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."building_photos" TO "service_role";



GRANT ALL ON TABLE "public"."buildings" TO "anon";
GRANT ALL ON TABLE "public"."buildings" TO "authenticated";
GRANT ALL ON TABLE "public"."buildings" TO "service_role";



GRANT ALL ON TABLE "public"."admin_building_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_building_flags" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."building_photos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."building_photos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."building_photos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."colleges" TO "anon";
GRANT ALL ON TABLE "public"."colleges" TO "authenticated";
GRANT ALL ON TABLE "public"."colleges" TO "service_role";



GRANT ALL ON SEQUENCE "public"."colleges_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."colleges_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."colleges_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."facility_photos" TO "service_role";
GRANT SELECT ON TABLE "public"."facility_photos" TO "anon";
GRANT SELECT ON TABLE "public"."facility_photos" TO "authenticated";



GRANT ALL ON TABLE "public"."facility_request_photos" TO "service_role";



GRANT ALL ON TABLE "public"."facility_requests" TO "service_role";



GRANT ALL ON TABLE "public"."facility_types" TO "anon";
GRANT ALL ON TABLE "public"."facility_types" TO "authenticated";
GRANT ALL ON TABLE "public"."facility_types" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."landmarks" TO "anon";
GRANT ALL ON TABLE "public"."landmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."landmarks" TO "service_role";



GRANT ALL ON TABLE "public"."slope_segments" TO "anon";
GRANT ALL ON TABLE "public"."slope_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."slope_segments" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







