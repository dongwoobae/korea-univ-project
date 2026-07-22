import type { Page, Route } from "@playwright/test";

type Row = Record<string, unknown>;
export interface MockState {
  authenticated: boolean;
  buildings: Row[];
  facilities: Row[];
  landmarks: Row[];
  slopes: Row[];
  photos: Row[];
}

const types = [
  {
    code: "elevator",
    label: "엘리베이터",
    label_en: "Elevator",
    label_zh: "电梯",
    icon: "🛗",
  },
  {
    code: "ramp",
    label: "경사로",
    label_en: "Ramp",
    label_zh: "坡道",
    icon: "♿",
  },
  {
    code: "parking",
    label: "장애인 주차",
    label_en: "Accessible parking",
    label_zh: "无障碍停车",
    icon: "🅿️",
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

function createState(authenticated: boolean): MockState {
  return {
    authenticated,
    buildings: [
      {
        id: 1,
        name: "중앙도서관",
        name_en: "Central Library",
        campus: "인문사회계",
        college_id: 1,
        is_deleted: false,
        geojson: polygon,
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
      },
      {
        id: "f-building",
        building_id: 1,
        facility_code: "elevator",
        name: "중앙 엘리베이터",
        name_en: "Central Elevator",
        name_zh: "中央电梯",
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
      },
      {
        id: "f-uninstalled",
        building_id: null,
        facility_code: "parking",
        name: "공사 중 주차구역",
        is_installed: false,
        lat: 37.5896,
        lng: 127.0328,
        facility_types: types[2],
        buildings: null,
        created_at: "2026-07-21T00:00:00Z",
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

const filterId = (url: URL) => {
  const value = url.searchParams.get("id");
  return value?.startsWith("eq.") ? value.slice(3) : null;
};

function table(state: MockState, name: string): Row[] {
  if (name === "buildings") return state.buildings;
  if (name === "building_facilities") return state.facilities;
  if (name === "landmarks") return state.landmarks;
  if (name === "slope_segments") return state.slopes;
  if (name === "building_photos") return state.photos;
  return [];
}

function rows(state: MockState, name: string, url: URL): Row[] {
  if (name === "facility_types") return types;
  if (name === "colleges") return colleges;
  if (name === "app_settings")
    return [{ key: "feedback_emails", value: "help@example.com" }];
  let result = [...table(state, name)];
  const id = filterId(url);
  if (id) result = result.filter((row) => String(row.id) === id);
  if (name === "building_facilities") {
    const parent = url.searchParams.get("building_id");
    if (parent === "is.null")
      result = result.filter((row) => row.building_id == null);
    if (parent?.startsWith("eq."))
      result = result.filter(
        (row) => String(row.building_id) === parent.slice(3),
      );
  }
  if (name === "building_photos") {
    const parent = url.searchParams.get("building_id");
    if (parent?.startsWith("eq."))
      result = result.filter(
        (row) => String(row.building_id) === parent.slice(3),
      );
  }
  return result;
}

function nextId(name: string, state: MockState) {
  if (name === "buildings")
    return Math.max(1, ...state.buildings.map((row) => Number(row.id))) + 1;
  if (name === "landmarks") return "22222222-2222-2222-2222-222222222222";
  if (name === "building_facilities") return "f-created";
  if (name === "slope_segments")
    return Math.max(1, ...state.slopes.map((row) => Number(row.id))) + 1;
  return Date.now();
}

async function handleRest(route: Route, state: MockState, url: URL) {
  const name = url.pathname.split("/rest/v1/")[1];
  const method = route.request().method();
  const result = rows(state, name, url);
  if (method === "HEAD") {
    return route.fulfill({
      status: 200,
      headers: {
        "content-range": `0-${Math.max(0, result.length - 1)}/${result.length}`,
      },
      body: "",
    });
  }
  if (method === "GET") {
    const single = route.request().headers().accept?.includes("object+json");
    return json(
      route,
      single ? (result[0] ?? null) : result,
      single && !result[0] ? 406 : 200,
      {
        "content-range": `0-${Math.max(0, result.length - 1)}/${result.length}`,
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
    Object.assign(target[index], body);
    return json(route, [target[index]]);
  }
  if (method === "DELETE" && index >= 0) {
    return json(route, [target.splice(index, 1)[0]]);
  }
  return json(route, []);
}

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
  if (path.startsWith("/api/revalidate-")) return json(route, { ok: true });
  if (path === "/api/translate") {
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

export async function installMockBackend(
  page: Page,
  options: {
    authenticated?: boolean;
    currentLocation?: { latitude: number; longitude: number };
  } = {},
) {
  const state = createState(Boolean(options.authenticated));
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
