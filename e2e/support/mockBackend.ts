/**
 * Playwright E2E 목(mock) 백엔드 — Supabase/Next API를 네트워크 레벨에서 흉내낸다.
 * 실제 서버 없이 공개 지도·관리자 흐름을 결정론적으로 테스트하기 위한 것.
 *
 * ┌─ 구조 ──────────────────────────────────────────────────────────────┐
 * 1) 픽스처(고정 데이터): `types`(시설 유형) · `colleges` · `polygon`(건물 형상).
 *    `createState()`가 이들을 조합해 테스트 1건의 초기 상태 `MockState`를 만든다.
 *      - 건물 1: 중앙도서관(id 1, 인문사회계)
 *      - 시설: `f-installed`(설치 경사로·건물 미소속) · `f-building`(건물 1 소속 엘리베이터)
 *              · `f-uninstalled`(미설치 주차)
 *      - 명소 1(다람쥐길) · 경사 1 · 사진 1
 *
 * 2) 라우팅: `installMockBackend()`가 전역 `page.route`로 모든 요청을 가로챈다.
 *      - `/rest/v1/<table>` → `handleRest()`: PostgREST 흉내.
 *          GET·HEAD·POST·PATCH·DELETE 지원,
 *          `?id=eq.|in.(…)` / `?building_id=eq.|is.null|in.(…)` 필터,
 *          `?select=…`의 임베드 투영(`projectEmbeds`),
 *          `Accept: object+json`이면 단건(.single()) 응답.
 *          `admin_building_flags` 뷰와 `rpc/get_admin_building_summary`는
 *          `buildingFlags()` **한 곳**에서 나온다(아래 주석 참고).
 *      - `/api/<route>`     → `handleApi()`: Next 라우트 핸들러 흉내(/api/buildings 등).
 *      - `/auth/v1/*`       → 로그인·로그아웃·현재 유저 조회.
 *      - 타일/CDN/업로드 호스트(cartocdn·arcgis·unpkg·cdn.test·upload.test)는 abort 또는 빈 200.
 *
 * 3) `addInitScript`: 페이지 로드 전 브라우저 API 스텁 —
 *      인증 토큰(localStorage) · SpeechRecognition 제거(미지원 흉내) ·
 *      speechSynthesis(발화 텍스트를 `window.__spoken`에 기록) · navigator.geolocation(고정 좌표).
 *
 * 상태는 테스트마다 새로 생성되고 POST/PATCH/DELETE가 in-memory로 변형한다.
 * 특정 응답만 바꾸려면 `installMockBackend` 호출 뒤에 `page.route`를 추가하면(LIFO) 먼저
 * 실행되고, 조건이 안 맞을 때 `route.fallback()`으로 이 목에 위임하면 된다.
 * └─────────────────────────────────────────────────────────────────────┘
 */
import type { Page, Route } from "@playwright/test";

type Row = Record<string, unknown>;
export interface MockState {
  authenticated: boolean;
  buildingPhotoUploadAttempts: number;
  buildingPhotoFailuresRemaining: number;
  translationFailuresRemaining: number;
  buildings: Row[];
  facilities: Row[];
  feedbackSubmissions: Row[];
  landmarks: Row[];
  slopes: Row[];
  photos: Row[];
}

// ── 픽스처(고정 데이터) ───────────────────────────────────────────────
// facility_types / colleges 조회에 그대로 반환되고, 시설 POST 시 code로 매칭된다.
const types = [
  {
    code: "elevator",
    label: "엘리베이터",
    label_en: "Elevator",
    label_zh: "电梯",
  },
  {
    code: "ramp",
    label: "경사로",
    label_en: "Ramp",
    label_zh: "坡道",
  },
  {
    code: "parking",
    label: "장애인 주차",
    label_en: "Accessible parking",
    label_zh: "无障碍停车",
  },
];
const colleges = [
  {
    id: 1,
    name: "문과대학",
    name_en: "College of Liberal Arts",
    name_zh: "文科学院",
  },
];
const polygon = {
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [127.0319, 37.5891],
        [127.0324, 37.5891],
        [127.0324, 37.5895],
        [127.0319, 37.5895],
        [127.0319, 37.5891],
      ],
    ],
  },
  properties: {},
};

// 테스트 1건의 초기 상태 생성(건물/시설/명소/경사/사진). 이후 in-memory로 변형됨.
function createState(authenticated: boolean): MockState {
  return {
    authenticated,
    buildingPhotoUploadAttempts: 0,
    buildingPhotoFailuresRemaining: 0,
    translationFailuresRemaining: 0,
    feedbackSubmissions: [],
    buildings: [
      {
        id: 1,
        name: "중앙도서관",
        name_en: "Central Library",
        campus: "인문사회계",
        college_id: 1,
        is_deleted: false,
        geojson: polygon,
        last_updated: "2026-07-22",
        colleges: colleges[0],
      },
    ],
    facilities: [
      {
        id: "f-installed",
        building_id: null,
        facility_code: "ramp",
        name: "중앙광장 경사로",
        name_en: "Central Plaza Ramp",
        name_zh: "中央广场坡道",
        translation_status: "translated",
        description: "정문 방향",
        description_en: "Toward the main gate",
        description_zh: "正门方向",
        floor_info: null,
        floor_info_en: null,
        floor_info_zh: null,
        is_installed: true,
        lat: 37.5894,
        lng: 127.0325,
        video_url: null,
        video_caption: null,
        facility_types: types[1],
        buildings: null,
        created_at: "2026-07-21T00:00:00Z",
        updated_at: "2026-07-22T03:00:00Z",
      },
      {
        id: "f-building",
        building_id: 1,
        facility_code: "elevator",
        name: "중앙 엘리베이터",
        name_en: "Central Elevator",
        name_zh: "中央电梯",
        translation_status: "translated",
        description: "1층 로비",
        description_en: "First-floor lobby",
        description_zh: "一层大厅",
        floor_info: "1층",
        floor_info_en: "Floor 1",
        floor_info_zh: "1层",
        is_installed: true,
        lat: 37.5893,
        lng: 127.0321,
        video_url: null,
        video_caption: null,
        facility_types: types[0],
        buildings: { name: "중앙도서관", name_en: "Central Library" },
        created_at: "2026-07-21T00:00:00Z",
        updated_at: "2026-07-22T02:00:00Z",
      },
      {
        id: "f-building-missing",
        building_id: 1,
        facility_code: "ramp",
        name: "북측 진입로",
        name_en: "North approach",
        name_zh: "北侧通道",
        translation_status: "translated",
        description: "공사 중",
        description_en: "Under construction",
        description_zh: "施工中",
        floor_info: null,
        floor_info_en: null,
        floor_info_zh: null,
        is_installed: false,
        lat: 37.5895,
        lng: 127.0322,
        video_url: null,
        video_caption: null,
        facility_types: types[1],
        buildings: { name: "중앙도서관", name_en: "Central Library" },
        created_at: "2026-07-21T00:00:01Z",
        updated_at: "2026-07-22T02:00:00Z",
      },
      {
        id: "f-building-untranslated",
        building_id: 1,
        facility_code: "elevator",
        name: "지하 1층 엘리베이터",
        name_en: null,
        name_zh: null,
        translation_status: "failed",
        description: "전 층",
        description_en: null,
        description_zh: null,
        floor_info: null,
        floor_info_en: null,
        floor_info_zh: null,
        is_installed: true,
        lat: 37.5892,
        lng: 127.0323,
        video_url: null,
        video_caption: null,
        facility_types: types[0],
        buildings: { name: "중앙도서관", name_en: "Central Library" },
        created_at: "2026-07-21T00:00:02Z",
        updated_at: "2026-07-22T02:00:00Z",
      },
      {
        id: "f-building-video",
        building_id: 1,
        facility_code: "parking",
        name: "지하 주차장 진입로",
        name_en: "Underground parking approach",
        name_zh: "地下停车场入口",
        translation_status: "translated",
        description: "지하 1층",
        description_en: "B1",
        description_zh: "地下一层",
        floor_info: null,
        floor_info_en: null,
        floor_info_zh: null,
        is_installed: true,
        lat: 37.5891,
        lng: 127.0324,
        video_url:
          "https://cdn.example.com/facility-videos/f-building-video/1.mp4",
        video_caption: "진입로 경사",
        facility_types: types[2],
        buildings: { name: "중앙도서관", name_en: "Central Library" },
        created_at: "2026-07-21T00:00:03Z",
        updated_at: "2026-07-22T02:00:00Z",
      },
      {
        id: "f-uninstalled",
        building_id: null,
        facility_code: "parking",
        name: "공사 중 주차구역",
        name_en: "Parking area under construction",
        name_zh: "施工中的停车区",
        translation_status: "translated",
        is_installed: false,
        lat: 37.5896,
        lng: 127.0328,
        facility_types: types[2],
        buildings: null,
        created_at: "2026-07-21T00:00:00Z",
        updated_at: "2026-07-22T01:00:00Z",
      },
    ],
    landmarks: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "다람쥐길",
        name_en: "Squirrel Trail",
        name_zh: "松鼠路",
        description: "학생들이 쉬어가는 길",
        description_en: "A quiet student trail",
        description_zh: "安静的学生步道",
        icon: "🐿️",
        lat: 37.58955,
        lng: 127.03225,
        photo_url: "https://cdn.test/landmark.webp",
        created_at: "2026-07-21T00:00:00Z",
        updated_at: "2026-07-22T00:00:00Z",
      },
    ],
    slopes: [
      {
        id: 1,
        name: "정문-중앙광장",
        gpx_file: "정문-중앙광장.gpx",
        segments: [
          { lat: 37.589, lng: 127.032, ele: 20 },
          { lat: 37.5892, lng: 127.0322, ele: 22 },
        ],
        created_at: "2026-07-21T00:00:00Z",
        updated_at: "2026-07-22T00:00:00Z",
      },
      {
        id: 2,
        name: "안암병원 정문 경사로",
        gpx_file: null,
        segments: [
          { lat: 37.5861, lng: 127.0268, ele: null },
          {
            lat: 37.5862,
            lng: 127.0269,
            ele: null,
            slope: 7.2,
            distance: 12.4,
          },
        ],
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-08-30T00:00:00Z",
      },
    ],
    photos: [
      {
        id: 1,
        building_id: 1,
        url: "https://cdn.test/library.webp",
        caption: "정문",
        caption_en: "Main entrance",
        caption_zh: "正门",
      },
    ],
  };
}

// ── 응답 헬퍼 & 조회 로직 ─────────────────────────────────────────────
// CORS 허용 헤더를 붙여 JSON으로 응답.
function json(
  route: Route,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", ...headers },
    body: JSON.stringify(body),
  });
}

// `?id=eq.<v>` → `<v>` 추출(PostgREST 필터 문법).
const filterId = (url: URL) => {
  const value = url.searchParams.get("id");
  return value?.startsWith("eq.") ? value.slice(3) : null;
};

// `in.("a","b")` → Set{a, b}. supabase-js의 `.in()`이 만드는 형태.
const parseInList = (value: string) =>
  new Set(
    value
      .slice(4, -1)
      .split(",")
      .map((item) => item.replace(/^"|"$/g, "")),
  );

// admin_building_flags 뷰가 내보내는 불리언 컬럼.
const FLAG_KEYS = [
  "missing_facility",
  "missing_photo",
  "missing_location",
  "stale_update",
  "translation_needed",
] as const;

/**
 * `admin_building_flags` 뷰 흉내.
 *
 * 프로덕션에서는 요약 함수와 목록 필터가 이 뷰 **하나**를 본다. 그래야 카드
 * 숫자와 목록 개수가 갈라지지 않는다. mock도 같은 구조를 지켜야 그 계약이
 * E2E로 검증된다 — 여기서 조건을 두 벌로 두면 테스트가 초록불이어도 아무것도
 * 보장하지 못한다. 조건을 고칠 일이 생기면 이 함수만 고친다.
 */
function buildingFlags(state: MockState): Row[] {
  return state.buildings
    .filter((building) => !building.is_deleted)
    .map((building) => ({
      building_id: building.id,
      missing_facility: !state.facilities.some(
        (facility) => facility.building_id === building.id,
      ),
      missing_photo: !state.photos.some(
        (photo) => photo.building_id === building.id,
      ),
      missing_location: building.geojson == null,
      // 프로덕션은 `current_date - 365`지만 mock은 고정 날짜를 쓴다. 상대 날짜로
      // 두면 시간이 흐르면서 픽스처의 stale 여부가 조용히 뒤집혀 스위트가 터진다.
      stale_update:
        building.last_updated == null ||
        String(building.last_updated) < "2025-07-23",
      translation_needed: state.facilities.some(
        (facility) =>
          facility.building_id === building.id &&
          facility.translation_status !== "translated",
      ),
    }));
}

// 테이블명 → 해당 상태 배열 매핑.
function table(state: MockState, name: string): Row[] {
  if (name === "buildings") return state.buildings;
  if (name === "building_facilities") return state.facilities;
  if (name === "landmarks") return state.landmarks;
  if (name === "slope_segments") return state.slopes;
  if (name === "building_photos") return state.photos;
  return [];
}

// 테이블 조회: 정적 테이블(facility_types/colleges/app_settings)은 즉시 반환,
// 나머지는 id·building_id 필터를 PostgREST처럼 적용해 걸러낸다.
function rows(state: MockState, name: string, url: URL): Row[] {
  if (name === "facility_types") return types;
  if (name === "colleges") return colleges;
  if (name === "app_settings")
    return [
      {
        key: "feedback_emails",
        value: {
          to: "help@example.com",
          cc: "cc@example.com",
          subject: "[테스트] 피드백",
        },
      },
    ];
  if (name === "admin_building_flags") {
    let flagRows = buildingFlags(state);
    for (const key of FLAG_KEYS) {
      const filter = url.searchParams.get(key);
      if (filter?.startsWith("eq."))
        flagRows = flagRows.filter(
          (row) => String(row[key]) === filter.slice(3),
        );
    }
    return flagRows;
  }
  let result = [...table(state, name)];
  const idFilter = url.searchParams.get("id");
  if (idFilter?.startsWith("eq.")) {
    const id = idFilter.slice(3);
    result = result.filter((row) => String(row.id) === id);
  }
  // 플래그 필터가 거른 건물 id를 `.in()`으로 되돌려 준다. eq.만 처리하면 이
  // 필터가 통째로 무시돼 목록이 좁혀지지 않는다.
  if (idFilter?.startsWith("in.(")) {
    const ids = parseInList(idFilter);
    result = result.filter((row) => ids.has(String(row.id)));
  }
  if (name === "building_facilities") {
    const parent = url.searchParams.get("building_id");
    if (parent === "is.null")
      result = result.filter((row) => row.building_id == null);
    if (parent?.startsWith("eq."))
      result = result.filter(
        (row) => String(row.building_id) === parent.slice(3),
      );
    if (parent?.startsWith("in.(")) {
      const ids = parseInList(parent);
      result = result.filter((row) => ids.has(String(row.building_id)));
    }
  }
  if (name === "building_photos") {
    const parent = url.searchParams.get("building_id");
    if (parent?.startsWith("eq."))
      result = result.filter(
        (row) => String(row.building_id) === parent.slice(3),
      );
  }
  const facilityCode = url.searchParams.get("facility_code");
  if (facilityCode?.startsWith("eq.")) {
    result = result.filter(
      (row) => String(row.facility_code) === facilityCode.slice(3),
    );
  }
  const installed = url.searchParams.get("is_installed");
  if (installed?.startsWith("eq.")) {
    result = result.filter(
      (row) => String(row.is_installed) === installed.slice(3),
    );
  }
  const deleted = url.searchParams.get("is_deleted");
  if (deleted?.startsWith("eq.")) {
    result = result.filter(
      (row) => String(row.is_deleted) === deleted.slice(3),
    );
  }
  const photoUrl = url.searchParams.get("photo_url");
  if (photoUrl === "is.null")
    result = result.filter((row) => row.photo_url == null);
  if (photoUrl === "not.is.null")
    result = result.filter((row) => row.photo_url != null);
  if (photoUrl === "neq.")
    result = result.filter(
      (row) => row.photo_url != null && row.photo_url !== "",
    );

  const orFilter = url.searchParams.get("or");
  if (orFilter) {
    const clauses = orFilter.replace(/^\(|\)$/g, "").split(",");
    result = result.filter((row) =>
      clauses.some((clause) => {
        const [column, operator, ...patternParts] = clause.split(".");
        if (operator !== "ilike") return false;
        const pattern = patternParts.join(".");
        const expression = pattern
          .split("*")
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*");
        return new RegExp(`^${expression}$`, "i").test(
          String(row[column] ?? ""),
        );
      }),
    );
  }

  const order = url.searchParams.get("order");
  if (order) {
    const rules = order.split(",").map((rule) => {
      const [column, direction, nulls] = rule.split(".");
      return {
        column,
        ascending: direction !== "desc",
        nullsFirst: nulls === "nullsfirst",
      };
    });
    result.sort((left, right) => {
      for (const rule of rules) {
        const a = left[rule.column];
        const b = right[rule.column];
        if (a == null && b == null) continue;
        if (a == null) return rule.nullsFirst ? -1 : 1;
        if (b == null) return rule.nullsFirst ? 1 : -1;
        const comparison = String(a).localeCompare(String(b), "ko");
        if (comparison !== 0) return rule.ascending ? comparison : -comparison;
      }
      return 0;
    });
  }
  return result;
}

/**
 * `select=*, rel(a,b)`의 임베드 투영 흉내 — 임베드 객체를 나열된 컬럼으로 좁힌다.
 *
 * 픽스처를 통째로 돌려주면 프론트가 select에 넣지 않은 필드도 읽히기 때문에
 * "select 누락" 회귀가 목 위에서 전부 초록불이 된다. 좁혀야 그 계약이 검증된다.
 * 다만 좁히는 대상은 단건 임베드 객체뿐이다 — 배열(to-many) 임베드와 최상위
 * 컬럼은 그대로 나가므로 그쪽 select 누락은 여전히 드러나지 않는다.
 */
function projectEmbeds(result: Row[], select: string | null): Row[] {
  if (!select) return result;
  const embeds = [...select.matchAll(/(\w+)\(([^()]*)\)/g)].map((match) => ({
    name: match[1],
    columns: match[2].split(",").map((column) => column.trim()),
  }));
  if (embeds.length === 0) return result;
  return result.map((row) => {
    const projected = { ...row };
    for (const embed of embeds) {
      const value = projected[embed.name];
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const source = value as Row;
      projected[embed.name] = Object.fromEntries(
        embed.columns
          .filter((column) => column in source)
          .map((column) => [column, source[column]]),
      );
    }
    return projected;
  });
}

// POST로 생성되는 새 행의 id 생성 규칙(테이블별).
function nextId(name: string, state: MockState) {
  if (name === "buildings")
    return Math.max(1, ...state.buildings.map((row) => Number(row.id))) + 1;
  if (name === "landmarks") return "22222222-2222-2222-2222-222222222222";
  if (name === "building_facilities") return "f-created";
  if (name === "slope_segments")
    return Math.max(1, ...state.slopes.map((row) => Number(row.id))) + 1;
  return Date.now();
}

// ── /rest/v1/* : PostgREST(GET·HEAD·POST·PATCH·DELETE) 흉내 ──────────────
// HEAD는 content-range로 개수만, GET은 배열(또는 object+json이면 단건),
// POST/PATCH/DELETE는 상태 배열을 직접 변형하고 변형된 행을 돌려준다.
async function handleRest(route: Route, state: MockState, url: URL) {
  const name = url.pathname.split("/rest/v1/")[1];
  const method = route.request().method();
  if (name === "rpc/get_admin_building_summary") {
    // 프로덕션 함수와 같은 모양: 건물 단위 숫자는 플래그 뷰를 세고, 시설 단위
    // 숫자(등록된 시설·번역 필요 시설)는 시설을 뷰에 조인해 센다.
    const flags = buildingFlags(state);
    const activeIds = new Set(flags.map((flag) => flag.building_id));
    const linkedFacilities = state.facilities.filter(
      (facility) =>
        facility.building_id != null && activeIds.has(facility.building_id),
    );
    const countFlag = (key: (typeof FLAG_KEYS)[number]) =>
      flags.filter((flag) => flag[key]).length;
    return json(route, {
      registered_facility_count: linkedFacilities.length,
      missing_facility_count: countFlag("missing_facility"),
      missing_photo_count: countFlag("missing_photo"),
      missing_location_count: countFlag("missing_location"),
      stale_update_count: countFlag("stale_update"),
      translation_needed_count: linkedFacilities.filter(
        (facility) => facility.translation_status !== "translated",
      ).length,
      translation_needed_building_count: countFlag("translation_needed"),
    });
  }
  const result = projectEmbeds(
    rows(state, name, url),
    url.searchParams.get("select"),
  );
  if (method === "HEAD") {
    return route.fulfill({
      status: 200,
      headers: {
        "access-control-expose-headers": "Content-Range",
        "content-range": `0-${Math.max(0, result.length - 1)}/${result.length}`,
      },
      body: "",
    });
  }
  if (method === "GET") {
    const single = route.request().headers().accept?.includes("object+json");
    const rangeHeader = route.request().headers().range;
    const rangeMatch = rangeHeader?.match(/^(\d+)-(\d+)$/);
    const offset = url.searchParams.get("offset");
    const limit = url.searchParams.get("limit");
    const from = rangeMatch
      ? Number(rangeMatch[1])
      : offset
        ? Number(offset)
        : 0;
    const to = rangeMatch
      ? Number(rangeMatch[2])
      : limit
        ? from + Number(limit) - 1
        : result.length - 1;
    const paged = rangeMatch || limit ? result.slice(from, to + 1) : result;
    const contentRange =
      result.length === 0
        ? "*/0"
        : `${from}-${from + Math.max(0, paged.length - 1)}/${result.length}`;
    return json(
      route,
      single ? (paged[0] ?? null) : paged,
      single && !result[0] ? 406 : 200,
      {
        "access-control-expose-headers": "Content-Range",
        "content-range": contentRange,
      },
    );
  }
  const body = (route.request().postDataJSON() ?? {}) as Row | Row[];
  const target = table(state, name);
  if (method === "POST") {
    const input = Array.isArray(body) ? body[0] : body;
    const created: Row = {
      id: nextId(name, state),
      created_at: "2026-07-21T01:00:00Z",
      updated_at: "2026-07-21T01:00:00Z",
      ...input,
    };
    if (name === "building_facilities") {
      created.facility_types =
        types.find((type) => type.code === created.facility_code) ?? null;
      created.buildings = null;
    }
    target.push(created);
    const single = route.request().headers().accept?.includes("object+json");
    return json(route, single ? created : [created], 201);
  }
  const id = filterId(url);
  const index = target.findIndex((row) => String(row.id) === id);
  if (method === "PATCH" && index >= 0) {
    Object.assign(target[index], body, {
      updated_at: "2026-07-23T00:00:00Z",
    });
    return json(route, [target[index]]);
  }
  if (method === "DELETE" && index >= 0) {
    return json(route, [target.splice(index, 1)[0]]);
  }
  return json(route, []);
}

// ── /api/* : Next 라우트 핸들러 흉내 ─────────────────────────────────────
// 공개 데이터(buildings/facilities/landmarks/slopes)와 관리자 액션(번역·사진/영상
// 업로드·설정)을 상태 기반으로 응답. 매칭 안 되는 /api/*는 { ok: true }.
async function handleApi(route: Route, state: MockState, url: URL) {
  const path = url.pathname;
  if (path === "/api/buildings") {
    return json(route, {
      type: "FeatureCollection",
      features: state.buildings
        .filter((row) => !row.is_deleted)
        .map((row) => ({
          ...(row.geojson as Row),
          properties: {
            id: row.id,
            name: row.name,
            name_en: row.name_en,
          },
        })),
    });
  }
  if (path === "/api/facilities")
    return json(
      route,
      state.facilities.filter((row) => row.is_installed),
    );
  if (path === "/api/landmarks") return json(route, state.landmarks);
  if (path === "/api/slopes") return json(route, state.slopes);
  if (path === "/api/feedback") {
    const submission = route.request().postDataJSON() as Row;
    state.feedbackSubmissions.push(submission);
    return json(route, { ok: true }, 201);
  }
  if (path.startsWith("/api/revalidate-")) return json(route, { ok: true });
  if (path === "/api/translate") {
    if (state.translationFailuresRemaining > 0) {
      state.translationFailuresRemaining -= 1;
      return json(route, { error: "테스트 번역 실패" }, 500);
    }
    const { texts } = route.request().postDataJSON() as {
      texts: Record<string, string>;
    };
    return json(route, {
      en: Object.fromEntries(
        Object.keys(texts).map((key) => [key, `EN ${texts[key]}`]),
      ),
      zh: Object.fromEntries(
        Object.keys(texts).map((key) => [key, `ZH ${texts[key]}`]),
      ),
    });
  }
  if (path === "/api/upload-landmark-photo") {
    const landmark = state.landmarks.at(-1);
    if (landmark)
      landmark.photo_url = "https://cdn.test/uploaded-landmark.webp";
    return json(route, { photoUrl: "https://cdn.test/uploaded-landmark.webp" });
  }
  if (path === "/api/upload-building-photo") {
    state.buildingPhotoUploadAttempts += 1;
    if (state.buildingPhotoFailuresRemaining > 0) {
      state.buildingPhotoFailuresRemaining -= 1;
      return json(route, { error: "테스트 업로드 실패" }, 500);
    }
    const rawBody = route.request().postData() ?? "";
    const buildingIdMatch = rawBody.match(/name="buildingId"\r?\n\r?\n(\d+)/);
    const buildingId = Number(buildingIdMatch?.[1] ?? 1);
    const id =
      Math.max(0, ...state.photos.map((photo) => Number(photo.id))) + 1;
    const photo = {
      id,
      building_id: buildingId,
      url: `https://cdn.test/uploaded-building-${id}.webp`,
      caption: null,
      caption_en: null,
      caption_zh: null,
      created_at: "2026-07-23T00:00:00Z",
    };
    state.photos.push(photo);
    return json(route, { id: photo.id, url: photo.url });
  }
  if (path === "/api/delete-landmark-photo") {
    const { landmarkId } = route.request().postDataJSON() as {
      landmarkId: string;
    };
    const landmark = state.landmarks.find((row) => row.id === landmarkId);
    if (landmark) landmark.photo_url = null;
    return json(route, { ok: true });
  }
  if (path === "/api/facility-video-presign") {
    return json(route, {
      presignedUrl: "https://upload.test/video",
      publicUrl: "https://cdn.test/video.mp4",
    });
  }
  if (path === "/api/facility-video-confirm") {
    const { facilityId, videoUrl } = route.request().postDataJSON() as {
      facilityId: string;
      videoUrl: string;
    };
    const facility = state.facilities.find((row) => row.id === facilityId);
    if (facility) facility.video_url = videoUrl;
    return json(route, { ok: true });
  }
  if (path === "/api/delete-facility-video") {
    const { facilityId } = route.request().postDataJSON() as {
      facilityId: string;
    };
    const facility = state.facilities.find((row) => row.id === facilityId);
    if (facility) facility.video_url = null;
    return json(route, { ok: true });
  }
  if (path === "/api/settings/feedback-emails") {
    return json(
      route,
      route.request().method() === "GET"
        ? { value: "help@example.com" }
        : { ok: true },
    );
  }
  return json(route, { ok: true });
}

// ── 진입점 ───────────────────────────────────────────────────────────
// 테스트 beforeEach에서 호출. 브라우저 API 스텁(addInitScript)을 심고, 이후
// 모든 네트워크 요청을 위 핸들러들로 라우팅한다. 생성된 state를 반환하므로
// 테스트에서 초기 데이터를 참조할 수 있다.
// options.authenticated: 관리자 세션으로 시작할지 / options.currentLocation: geolocation 좌표.
export async function installMockBackend(
  page: Page,
  options: {
    authenticated?: boolean;
    failBuildingPhotoUploads?: number;
    failTranslations?: number;
    currentLocation?: { latitude: number; longitude: number };
  } = {},
) {
  const state = createState(Boolean(options.authenticated));
  state.buildingPhotoFailuresRemaining = options.failBuildingPhotoUploads ?? 0;
  state.translationFailuresRemaining = options.failTranslations ?? 0;
  // 1) 페이지 로드 전 브라우저 API 스텁(인증 토큰·음성·위치). 실제 권한/기기 없이 결정론적.
  await page.addInitScript(
    ({ authenticated, currentLocation }) => {
      if (authenticated) {
        localStorage.setItem(
          "sb-127-auth-token",
          JSON.stringify({
            access_token: "e2e-access-token",
            refresh_token: "e2e-refresh-token",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: "admin-user",
              email: "admin@example.com",
              aud: "authenticated",
              role: "authenticated",
            },
          }),
        );
      }
      delete (window as typeof window & { SpeechRecognition?: unknown })
        .SpeechRecognition;
      delete (window as typeof window & { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition;
      const currentWindow = window as typeof window & {
        __spoken?: string;
        __speechCancelled?: boolean;
      };
      class Utterance {
        text: string;
        lang = "ko-KR";
        onend: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      }
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        value: Utterance,
      });
      Object.defineProperty(window, "speechSynthesis", {
        value: {
          speak(value: Utterance) {
            currentWindow.__spoken = value.text;
            setTimeout(() => value.onend?.(), 0);
          },
          cancel() {
            currentWindow.__speechCancelled = true;
          },
        },
      });
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(success: PositionCallback) {
            success({
              coords: currentLocation,
            } as GeolocationPosition);
          },
        },
      });
    },
    {
      authenticated: state.authenticated,
      currentLocation: options.currentLocation ?? {
        latitude: 37.5893,
        longitude: 127.0327,
      },
    },
  );

  // 2) 전역 라우트 인터셉트: 외부 타일/CDN은 차단, auth/rest/api는 위 핸들러로 위임.
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      ["cartocdn.com", "arcgisonline.com", "unpkg.com"].some((host) =>
        url.hostname.includes(host),
      )
    ) {
      return route.abort();
    }
    if (url.hostname === "cdn.test")
      return route.fulfill({
        status: 200,
        contentType: "image/webp",
        body: "",
      });
    if (url.hostname === "upload.test") {
      return route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": "*" },
        body: "",
      });
    }

    if (url.pathname.startsWith("/auth/v1/")) {
      if (url.pathname.endsWith("/token")) {
        const credentials = request.postDataJSON() as { email?: string };
        if (credentials.email !== "admin@example.com")
          return json(route, { message: "Invalid login credentials" }, 400);
        state.authenticated = true;
        return json(route, {
          access_token: "e2e-access-token",
          refresh_token: "e2e-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          user: {
            id: "admin-user",
            email: "admin@example.com",
            aud: "authenticated",
            role: "authenticated",
          },
        });
      }
      if (url.pathname.endsWith("/logout")) {
        state.authenticated = false;
        return json(route, {});
      }
      if (url.pathname.endsWith("/user")) {
        return state.authenticated
          ? json(route, {
              id: "admin-user",
              email: "admin@example.com",
              aud: "authenticated",
              role: "authenticated",
            })
          : json(route, { message: "not authenticated" }, 401);
      }
    }
    if (url.pathname.startsWith("/rest/v1/"))
      return handleRest(route, state, url);
    if (url.pathname.startsWith("/api/")) return handleApi(route, state, url);
    return route.continue();
  });
  return state;
}
