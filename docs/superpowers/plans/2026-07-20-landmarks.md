# 명소(landmarks) 기능 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캠퍼스 명소를 배리어프리 시설과 별개인 `landmarks` 테이블/레이어로 관리하고, 지도에 명소 전용 마커·필터·다국어 팝업을 표시한다.

**Architecture:** Supabase에 `landmarks` 테이블을 추가하고 RLS는 공개 읽기와 authenticated 쓰기를 명시한다. 공개 지도는 `GET /api/landmarks`를 통해 service role로 읽고, 관리자 CRUD는 기존 시설 관리와 동일하게 클라이언트 Supabase 세션으로 직접 insert/update/delete한다. 사진 업로드/삭제만 `requireAdmin`이 붙은 Route Handler를 사용하고 R2 공용 모듈을 거친다. 지도는 `useMapData`가 landmarks를 가져오고 `LandmarkMarkers`가 `L.divIcon` 원형 배지를 렌더한다. 관리자에는 `/admin/dashboard/landmarks` 페이지와 명소 전용 모달을 추가한다.

**Tech Stack:** Next.js 16(App Router Route Handlers, client components) + Supabase(js client) + Cloudflare R2 S3 API + react-leaflet + vitest. 패키지 매니저는 **npm**.

**스펙:** `docs/superpowers/specs/2026-07-20-landmarks-design.md`

**Global Constraints:**

- 저장소: `C:\Users\dw581\project\korea-univ-project` (모든 명령은 이 디렉터리에서 실행)
- 브랜치 시작 전 `git status --short`로 사용자 변경을 확인하고, 관련 없는 변경은 건드리지 않는다.
- Next.js 16 문서 확인 결과: Route Handler는 `app/**/route.ts`에 `GET`/`POST` 함수를 export하며, `GET`은 기본 캐시되지 않는다. 기존 `/api/facilities`와 동일하게 `export const revalidate = 3600`을 유지하고 `Response.json`/`NextResponse.json`을 사용한다. Client Component 안에 Server Function을 정의하지 않는다.
- R2 판정: `upload-facility-video`와 `delete-facility-video`는 기본 `S3Client` 옵션만 사용하고, `facility-video-presign`만 `forcePathStyle`, `requestChecksumCalculation`, `responseChecksumValidation` 옵션을 사용한다. 따라서 **단일 인스턴스로 통일하지 않고** `src/lib/r2.ts`에서 `r2`(기본)와 `r2Presign`(presign 전용)을 함께 export한다. 자격증명·버킷·공개 URL·키 파서는 공용화한다.
- `supabase/database.types.ts`는 repo에 커밋된 generated file이다. 이 저장소에는 `supabase/config.toml`이 없으므로 기본 절차는 원격 프로젝트 기준 CLI 재생성이며, CLI 접근이 막히면 같은 태스크의 수동 편집 블록을 적용한다.
- 커밋: Conventional Commits 한국어. **Co-Authored-By/Generated-with 트레일러 금지.**
- 검증 명령은 실제 스크립트만 사용한다: `npm test`, `npm test -- <pattern>`, `npm run typecheck`, `npm run lint`, `npm run build`.

---

### Task 0: 브랜치 생성

**Files:** 없음 (git만)

- [ ] **Step 1: 깨끗한 상태 확인 후 브랜치 생성**

```bash
git status --short
git checkout -b feature/landmarks
```

---

### Task 1: `landmarks` 테이블 마이그레이션 + 타입 추가 (DB)

**Files:**

- Create: `supabase/migrations/20260720000000_create_landmarks.sql`
- Modify: `supabase/database.types.ts`
- Modify: `src/types/domain.ts`

**Interfaces:**

- Consumes: Supabase public schema, authenticated Supabase client session
- Produces: `public.landmarks` table
- Produces: `export type Landmark = Tables["landmarks"]["Row"];`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/20260720000000_create_landmarks.sql`:

```sql
create table if not exists public.landmarks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  name_zh text,
  description text,
  description_en text,
  description_zh text,
  lat double precision not null,
  lng double precision not null,
  icon text not null,
  image_url text,
  photo_url text,
  created_at timestamptz default now()
);

alter table public.landmarks enable row level security;

drop policy if exists "anon read" on public.landmarks;
drop policy if exists "authenticated write" on public.landmarks;

create policy "anon read"
on public.landmarks
for select
to anon, authenticated
using (true);

create policy "authenticated write"
on public.landmarks
for all
to authenticated
using (true)
with check (true);
```

- [ ] **Step 2: 마이그레이션 문법 검토**

Run: `Get-Content -Raw supabase\migrations\20260720000000_create_landmarks.sql`
Expected: 위 SQL과 동일하며 `enable row level security`, `anon read`, `authenticated write`가 모두 포함된다.

- [ ] **Step 3: database.types.ts 재생성 또는 수동 편집**

CLI가 원격 프로젝트에 연결되어 있으면 실행:

```bash
npx supabase gen types typescript --project-id "$env:SUPABASE_PROJECT_ID" --schema public > supabase/database.types.ts
```

CLI가 불가능하면 `supabase/database.types.ts`의 `public.Tables` 안에 `facility_types` 앞 또는 뒤로 아래 블록을 직접 추가한다.

```ts
      landmarks: {
        Row: {
          created_at: string | null;
          description: string | null;
          description_en: string | null;
          description_zh: string | null;
          icon: string;
          id: string;
          image_url: string | null;
          lat: number;
          lng: number;
          name: string;
          name_en: string | null;
          name_zh: string | null;
          photo_url: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          description_zh?: string | null;
          icon: string;
          id?: string;
          image_url?: string | null;
          lat: number;
          lng: number;
          name: string;
          name_en?: string | null;
          name_zh?: string | null;
          photo_url?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          description_zh?: string | null;
          icon?: string;
          id?: string;
          image_url?: string | null;
          lat?: number;
          lng?: number;
          name?: string;
          name_en?: string | null;
          name_zh?: string | null;
          photo_url?: string | null;
        };
        Relationships: [];
      };
```

- [ ] **Step 4: domain 타입 추가**

`src/types/domain.ts`의 `BuildingPhoto` export 아래에 추가:

```ts
export type Landmark = Tables["landmarks"]["Row"];
```

- [ ] **Step 5: 타입 검증**

Run: `npm run typecheck`
Expected: PASS. `Tables["landmarks"]` 타입이 존재한다.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260720000000_create_landmarks.sql supabase/database.types.ts src/types/domain.ts
git commit -m "feat: 명소 테이블과 타입 추가"
```

---

### Task 2: R2 공용 모듈 추출 + 기존 동영상 라우트 교체 (리팩터링)

**Files:**

- Create: `src/lib/r2.ts`
- Modify: `src/app/api/upload-facility-video/route.ts`
- Modify: `src/app/api/facility-video-presign/route.ts`
- Modify: `src/app/api/delete-facility-video/route.ts`

**Interfaces:**

- Produces: `r2: S3Client`
- Produces: `r2Presign: S3Client`
- Produces: `R2_BUCKET: string`
- Produces: `R2_PUBLIC_URL: string`
- Produces: `getPublicR2Url(key: string): string`
- Produces: `getR2KeyFromPublicUrl(url: string): string | null`
- Consumes: `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL`

- [ ] **Step 1: 공용 모듈 작성**

`src/lib/r2.ts`:

```ts
import { S3Client } from "@aws-sdk/client-s3";

const baseOptions = {
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
} as const;

export const r2 = new S3Client(baseOptions);

export const r2Presign = new S3Client({
  ...baseOptions,
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
export const R2_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL!;

export function getPublicR2Url(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

export function getR2KeyFromPublicUrl(url: string): string | null {
  return url.startsWith(R2_PUBLIC_URL + "/")
    ? url.slice(R2_PUBLIC_URL.length + 1)
    : null;
}
```

- [ ] **Step 2: upload-facility-video 라우트 교체**

`src/app/api/upload-facility-video/route.ts`의 AWS import와 로컬 R2 상수를 제거하고 아래 import를 추가:

```ts
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, getPublicR2Url } from "@/lib/r2";
```

기존 `new S3Client`, `BUCKET`, `PUBLIC_URL` 블록은 삭제한다. 업로드 호출과 URL 생성은 아래처럼 바꾼다.

```ts
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      }),
    );

    const videoUrl = getPublicR2Url(key);
```

- [ ] **Step 3: facility-video-presign 라우트 교체**

`src/app/api/facility-video-presign/route.ts`의 AWS import와 로컬 R2 상수를 제거하고 아래 import를 추가:

```ts
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Presign, R2_BUCKET, getPublicR2Url } from "@/lib/r2";
```

presign 생성부를 아래처럼 바꾼다.

```ts
    const presignedUrl = await getSignedUrl(
      r2Presign,
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 3600 },
    );

    return NextResponse.json({
      presignedUrl,
      publicUrl: getPublicR2Url(key),
    });
```

- [ ] **Step 4: delete-facility-video 라우트 교체**

`src/app/api/delete-facility-video/route.ts`의 AWS import와 로컬 R2 상수를 제거하고 아래 import를 추가:

```ts
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, getR2KeyFromPublicUrl } from "@/lib/r2";
```

key 파싱과 삭제 호출을 아래처럼 바꾼다.

```ts
    const key = getR2KeyFromPublicUrl(videoUrl);

    console.log(`[delete-facility-video] facilityId=${facilityId} key=${key}`);

    if (key) {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    }
```

- [ ] **Step 5: 정적 검증**

Run: `npm run typecheck && npm run lint`
Expected: PASS. 기존 동영상 API 응답 형식은 변하지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/r2.ts src/app/api/upload-facility-video/route.ts src/app/api/facility-video-presign/route.ts src/app/api/delete-facility-video/route.ts
git commit -m "refactor: R2 클라이언트 설정 공용화"
```

---

### Task 3: `GET /api/landmarks` 추가

**Files:**

- Create: `src/app/api/landmarks/route.ts`

**Interfaces:**

- Consumes: `public.landmarks`
- Produces: `GET /api/landmarks -> Landmark[] | { error: string }`

- [ ] **Step 1: Route Handler 작성**

`src/app/api/landmarks/route.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@supabase-types";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const revalidate = 3600;

export async function GET() {
  const { data, error } = await supabase
    .from("landmarks")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(data ?? []);
}
```

- [ ] **Step 2: 검증**

Run: `npm run typecheck && npm run lint`
Expected: PASS. `Response.json`은 기존 `/api/facilities`와 같은 방식으로 사용한다.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/landmarks/route.ts
git commit -m "feat: 명소 조회 API 추가"
```

---

### Task 4: 명소 사진 업로드 API 추가

**Files:**

- Create: `src/app/api/upload-landmark-photo/route.ts`

**Interfaces:**

- Consumes: multipart `FormData` with `file: File`, `landmarkId: string`
- Produces: `POST /api/upload-landmark-photo -> { photoUrl: string } | { error: string }`

- [ ] **Step 1: Route Handler 작성**

`src/app/api/upload-landmark-photo/route.ts`:

```ts
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@supabase-types";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getPublicR2Url } from "@/lib/r2";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024;

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const landmarkId = formData.get("landmarkId");

    if (!(file instanceof File) || typeof landmarkId !== "string") {
      return NextResponse.json(
        { error: "파일 또는 명소 ID 누락" },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "jpg, png, webp, gif 형식만 업로드 가능해요" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_SIZE) {
      return NextResponse.json(
        { error: "사진 크기는 5MB 이하여야 해요" },
        { status: 400 },
      );
    }

    const key = `landmark-photos/${landmarkId}/${Date.now()}.${extensionFor(
      file.type,
    )}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      }),
    );

    const photoUrl = getPublicR2Url(key);
    const { error: dbError } = await supabaseAdmin
      .from("landmarks")
      .update({ photo_url: photoUrl })
      .eq("id", landmarkId);

    if (dbError) {
      console.error("[upload-landmark-photo] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ photoUrl });
  } catch (err) {
    console.error("[upload-landmark-photo] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
```

- [ ] **Step 2: 검증**

Run: `npm run typecheck && npm run lint`
Expected: PASS. 이미지 MIME과 5MB 제한이 코드에 명시되어 있다.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/upload-landmark-photo/route.ts
git commit -m "feat: 명소 사진 업로드 API 추가"
```

---

### Task 5: 명소 사진 삭제 API + row 삭제 헬퍼 (TDD)

**Files:**

- Create: `src/app/api/delete-landmark-photo/route.ts`
- Create: `src/lib/landmarkDelete.ts`
- Test: `src/lib/landmarkDelete.test.ts`

**Interfaces:**

- Consumes: `POST /api/delete-landmark-photo` JSON `{ landmarkId: string; photoUrl: string }`
- Produces: `POST /api/delete-landmark-photo -> { ok: true } | { error: string }`
- Produces: `deleteLandmark(landmark: { id: string; photo_url?: string | null }): Promise<string | null>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/landmarkDelete.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const authedFetch = vi.fn();
const eq = vi.fn();
const del = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ delete: del }));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));
vi.mock("@/lib/authedFetch", () => ({ authedFetch }));

describe("deleteLandmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eq.mockResolvedValue({ error: null });
  });

  it("사진이 없으면 R2 정리 없이 row만 삭제한다", async () => {
    const { deleteLandmark } = await import("./landmarkDelete");

    const result = await deleteLandmark({ id: "l1", photo_url: null });

    expect(authedFetch).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("landmarks");
    expect(eq).toHaveBeenCalledWith("id", "l1");
    expect(result).toBeNull();
  });

  it("사진이 있으면 R2를 먼저 정리한 뒤 row를 삭제한다", async () => {
    authedFetch.mockResolvedValueOnce({ ok: true });
    const { deleteLandmark } = await import("./landmarkDelete");

    const result = await deleteLandmark({
      id: "l2",
      photo_url: "https://cdn.example.com/landmark-photos/l2/a.webp",
    });

    expect(authedFetch).toHaveBeenCalledWith(
      "/api/delete-landmark-photo",
      expect.objectContaining({ method: "POST" }),
    );
    expect(eq).toHaveBeenCalledWith("id", "l2");
    expect(result).toBeNull();
  });

  it("사진 정리에 실패하면 row를 삭제하지 않고 메시지를 반환한다", async () => {
    authedFetch.mockResolvedValueOnce({ ok: false });
    const { deleteLandmark } = await import("./landmarkDelete");

    const result = await deleteLandmark({
      id: "l3",
      photo_url: "https://cdn.example.com/landmark-photos/l3/a.webp",
    });

    expect(eq).not.toHaveBeenCalled();
    expect(result).toBe("사진 삭제에 실패해 명소를 지우지 못했어요");
  });

  it("row 삭제에 실패하면 메시지를 반환한다", async () => {
    eq.mockResolvedValueOnce({ error: { message: "권한 없음" } });
    const { deleteLandmark } = await import("./landmarkDelete");

    const result = await deleteLandmark({ id: "l4", photo_url: null });

    expect(result).toBe("권한 없음");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- landmarkDelete`
Expected: FAIL — `Failed to resolve import "./landmarkDelete"`

- [ ] **Step 3: 삭제 사진 API 작성**

`src/app/api/delete-landmark-photo/route.ts`:

```ts
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@supabase-types";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getR2KeyFromPublicUrl } from "@/lib/r2";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const { landmarkId, photoUrl } = await request.json();

    if (!landmarkId || !photoUrl) {
      return NextResponse.json(
        { error: "landmarkId 또는 photoUrl 누락" },
        { status: 400 },
      );
    }

    const key = getR2KeyFromPublicUrl(photoUrl);
    console.log(`[delete-landmark-photo] landmarkId=${landmarkId} key=${key}`);

    if (key) {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    }

    const { error: dbError } = await supabaseAdmin
      .from("landmarks")
      .update({ photo_url: null })
      .eq("id", landmarkId);

    if (dbError) {
      console.error("[delete-landmark-photo] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-landmark-photo] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
```

- [ ] **Step 4: 헬퍼 최소 구현**

`src/lib/landmarkDelete.ts`:

```ts
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";

/**
 * 명소를 삭제한다. 사진이 있으면 R2 객체를 먼저 정리한다.
 * 정리에 실패하면 고아 객체가 남지 않도록 row를 남겨두고 메시지를 반환한다.
 * @returns 성공 시 null, 실패 시 토스트용 메시지
 */
export async function deleteLandmark(landmark: {
  id: string;
  photo_url?: string | null;
}): Promise<string | null> {
  if (landmark.photo_url) {
    const res = await authedFetch("/api/delete-landmark-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        landmarkId: landmark.id,
        photoUrl: landmark.photo_url,
      }),
    });
    if (!res.ok) return "사진 삭제에 실패해 명소를 지우지 못했어요";
  }

  const { error } = await supabase
    .from("landmarks")
    .delete()
    .eq("id", landmark.id);

  return error ? error.message : null;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- landmarkDelete`
Expected: PASS (4 tests)

- [ ] **Step 6: 타입/린트 검증**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/app/api/delete-landmark-photo/route.ts src/lib/landmarkDelete.ts src/lib/landmarkDelete.test.ts
git commit -m "feat: 명소 삭제 헬퍼와 사진 삭제 API 추가"
```

---

### Task 6: 명소 마커 컴포넌트 추가

**Files:**

- Create: `src/components/map/LandmarkMarkers.tsx`

**Interfaces:**

- Consumes: `Landmark[]`
- Consumes: `showLandmarks: boolean`
- Produces: React component `LandmarkMarkers({ landmarks, showLandmarks }: LandmarkMarkersProps): JSX.Element`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/map/LandmarkMarkers.tsx`:

```tsx
"use client";

import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Landmark } from "@/types/domain";
import { useLanguage } from "@/lib/LanguageContext";

const LANDMARK_COLOR = "#F4B942";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const landmarkMarkerIcon = (landmark: Landmark) => {
  const content = landmark.image_url
    ? `<img src="${escapeHtml(landmark.image_url)}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;display:block;" />`
    : escapeHtml(landmark.icon);

  return L.divIcon({
    className: "",
    html: `<div style="width:34px;height:34px;background:${LANDMARK_COLOR};border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 7px rgba(0,0,0,0.24);">${content}</div>`,
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  });
};

function localizedText(
  landmark: Landmark,
  field: "name" | "description",
  lang: "ko" | "en" | "zh",
): string | null {
  if (field === "name") {
    if (lang === "en") return landmark.name_en ?? landmark.name;
    if (lang === "zh") return landmark.name_zh ?? landmark.name;
    return landmark.name;
  }

  if (lang === "en") return landmark.description_en ?? landmark.description;
  if (lang === "zh") return landmark.description_zh ?? landmark.description;
  return landmark.description;
}

interface LandmarkMarkersProps {
  landmarks: Landmark[];
  showLandmarks: boolean;
}

export default function LandmarkMarkers({
  landmarks,
  showLandmarks,
}: LandmarkMarkersProps) {
  const { lang } = useLanguage();
  if (!showLandmarks) return null;

  return (
    <>
      {landmarks.map((landmark) => {
        const name = localizedText(landmark, "name", lang);
        const description = localizedText(landmark, "description", lang);

        return (
          <Marker
            key={landmark.id}
            position={[landmark.lat, landmark.lng]}
            icon={landmarkMarkerIcon(landmark)}
            zIndexOffset={650}
          >
            <Popup>
              <div style={{ minWidth: 180, maxWidth: 240 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#222" }}>
                  <span style={{ marginRight: 6 }}>{landmark.icon}</span>
                  {name}
                </div>
                {description && (
                  <div style={{ fontSize: 12, color: "#666", marginTop: 5 }}>
                    {description}
                  </div>
                )}
                {landmark.photo_url && (
                  <img
                    src={landmark.photo_url}
                    alt={name ?? "명소 사진"}
                    style={{
                      width: "100%",
                      maxHeight: 150,
                      objectFit: "cover",
                      borderRadius: 6,
                      marginTop: 8,
                      display: "block",
                    }}
                  />
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm run typecheck && npm run lint`
Expected: PASS. `image_url`이 있으면 이미지, 없으면 이모지를 렌더한다.

- [ ] **Step 3: 커밋**

```bash
git add src/components/map/LandmarkMarkers.tsx
git commit -m "feat: 명소 지도 마커 추가"
```

---

### Task 7: 지도 데이터 로드 + 명소 필터 + Map 배선

**Files:**

- Modify: `src/components/map/useMapData.ts`
- Modify: `src/components/map/FilterPanel.tsx`
- Modify: `src/components/map/Map.tsx`

**Interfaces:**

- Produces: `useMapData()` return에 `landmarks: Landmark[]`
- Produces: `FilterPanel` props에 `showLandmarks: boolean`, `setShowLandmarks: Dispatch<SetStateAction<boolean>>`
- Consumes: `LandmarkMarkers` component

- [ ] **Step 1: useMapData에 landmarks fetch 추가**

`src/components/map/useMapData.ts` import를 수정:

```ts
import type {
  FacilityType,
  Landmark,
  MapFacility,
  SlopeSegment,
} from "@/types/domain";
```

state와 effect를 추가:

```ts
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
```

```ts
  useEffect(() => {
    fetch("/api/landmarks")
      .then((r) => r.json())
      .then((data) => setLandmarks(Array.isArray(data) ? data : []))
      .catch(() => setLandmarks([]));
  }, []);
```

return 객체에 추가:

```ts
    landmarks,
```

- [ ] **Step 2: FilterPanel props와 데스크탑 토글 추가**

`FilterPanel` 함수 시그니처에 추가:

```tsx
  showLandmarks,
  setShowLandmarks,
```

데스크탑 패널의 경사도 토글 아래, 캠퍼스 구분선 앞에 추가:

```tsx
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            marginBottom: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showLandmarks}
            onChange={() => setShowLandmarks((v) => !v)}
            style={{ accentColor: "#F4B942", width: 17, height: 17 }}
          />
          <span style={{ fontSize: 17 }}>✨</span>
          <span style={{ fontSize: 14, color: "#333", fontWeight: 500 }}>
            {lang === "en" ? "Landmarks" : lang === "zh" ? "景点" : "명소"}
          </span>
        </label>
```

`MobileFilterSheet` props에 `showLandmarks`, `setShowLandmarks`를 추가하고 시설 섹션 위에 추가:

```tsx
        <div style={{ borderTop: "1px solid #e5e7eb", margin: "14px 0" }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Chip
            active={showLandmarks}
            color="#F4B942"
            activeTextColor="#333"
            onClick={() => setShowLandmarks((v) => !v)}
          >
            <span>✨</span>
            <span>
              {lang === "en" ? "Landmarks" : lang === "zh" ? "景点" : "명소"}
            </span>
          </Chip>
        </div>
```

모바일 호출부에 props를 전달:

```tsx
        <MobileFilterSheet
          facilityTypes={facilityTypes}
          activeTypes={activeTypes}
          setActiveTypes={setActiveTypes}
          activeCampuses={activeCampuses}
          setActiveCampuses={setActiveCampuses}
          showLandmarks={showLandmarks}
          setShowLandmarks={setShowLandmarks}
          onClose={() => setShowFilter(false)}
        />
```

- [ ] **Step 3: Map 배선**

`src/components/map/Map.tsx` import 추가:

```tsx
import LandmarkMarkers from "./LandmarkMarkers";
```

`useMapData` destructuring에 추가:

```tsx
    landmarks,
```

state 추가:

```tsx
  const [showLandmarks, setShowLandmarks] = useState(false);
```

`FacilityMarkers` 아래에 추가:

```tsx
        <LandmarkMarkers
          landmarks={landmarks}
          showLandmarks={showLandmarks}
        />
```

`FilterPanel` props에 추가:

```tsx
        showLandmarks={showLandmarks}
        setShowLandmarks={setShowLandmarks}
```

- [ ] **Step 4: 검증**

Run: `npm run typecheck && npm run lint`
Expected: PASS. `/api/landmarks` 실패 시 landmarks는 빈 배열로 유지된다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/map/useMapData.ts src/components/map/FilterPanel.tsx src/components/map/Map.tsx
git commit -m "feat: 지도에 명소 레이어와 필터 연결"
```

---

### Task 8: LandmarkFormModal 구현

**Files:**

- Create: `src/components/admin/LandmarkFormModal.tsx`

**Interfaces:**

- Consumes: `landmark: Landmark | null`
- Consumes: `center: [number, number]`
- Consumes: `onClose(): void`, `onSaved(): void`, `showToast(message: string, type?: string): void`
- Produces: client Supabase insert/update to `landmarks`
- Produces: photo upload/delete through `POST /api/upload-landmark-photo`, `POST /api/delete-landmark-photo`

- [ ] **Step 1: 모달 작성**

`src/components/admin/LandmarkFormModal.tsx`:

```tsx
"use client";

import { useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import type { Landmark } from "@/types/domain";

const FacilityMap = dynamic(() => import("@/components/FacilityMap"), {
  ssr: false,
});

interface LandmarkFormModalProps {
  center: [number, number];
  landmark: Landmark | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, type?: string) => void;
}

export default function LandmarkFormModal({
  center,
  landmark,
  onClose,
  onSaved,
  showToast,
}: LandmarkFormModalProps) {
  const editing = landmark !== null;
  const [form, setForm] = useState({
    name: landmark?.name ?? "",
    name_en: landmark?.name_en ?? "",
    name_zh: landmark?.name_zh ?? "",
    description: landmark?.description ?? "",
    description_en: landmark?.description_en ?? "",
    description_zh: landmark?.description_zh ?? "",
    icon: landmark?.icon ?? "✨",
    lat: landmark?.lat != null ? String(landmark.lat) : "",
    lng: landmark?.lng != null ? String(landmark.lng) : "",
    photo_url: landmark?.photo_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function fillTranslations() {
    const texts: Record<string, string> = {};
    if (form.name) texts.name = form.name;
    if (form.description) texts.description = form.description;
    if (Object.keys(texts).length === 0) return;

    try {
      const res = await authedFetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts }),
      });
      if (!res.ok) throw new Error("translate failed");
      const { en, zh } = await res.json();
      setForm((prev) => ({
        ...prev,
        name_en: prev.name_en || en.name || "",
        name_zh: prev.name_zh || zh.name || "",
        description_en: prev.description_en || en.description || "",
        description_zh: prev.description_zh || zh.description || "",
      }));
    } catch {
      showToast("자동번역에 실패했어요", "warning");
    }
  }

  function validate(): string | null {
    if (!form.name.trim()) return "명소 이름을 입력해주세요";
    if (!form.icon.trim()) return "이모지를 입력해주세요";
    if (!form.lat || !form.lng) return "지도에서 위치를 선택해주세요";
    return null;
  }

  async function uploadPhoto(landmarkId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("landmarkId", landmarkId);

    const res = await authedFetch("/api/upload-landmark-photo", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "사진 업로드 실패");
    setForm((prev) => ({ ...prev, photo_url: data.photoUrl }));
  }

  async function handlePhotoChange(file: File | null) {
    if (!file) return;
    if (!landmark?.id) {
      showToast("명소를 먼저 저장한 뒤 사진을 올려주세요", "warning");
      return;
    }
    setUploading(true);
    try {
      await uploadPhoto(landmark.id, file);
      showToast("사진이 업로드되었어요");
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "사진 업로드 실패", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePhoto() {
    if (!landmark?.id || !form.photo_url) return;
    const res = await authedFetch("/api/delete-landmark-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        landmarkId: landmark.id,
        photoUrl: form.photo_url,
      }),
    });
    if (!res.ok) {
      showToast("사진 삭제에 실패했어요", "error");
      return;
    }
    setForm((prev) => ({ ...prev, photo_url: "" }));
    showToast("사진이 삭제되었어요");
    onSaved();
  }

  async function handleSave() {
    const invalid = validate();
    if (invalid) {
      showToast(invalid, "warning");
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      name_en: form.name_en.trim() || null,
      name_zh: form.name_zh.trim() || null,
      description: form.description.trim() || null,
      description_en: form.description_en.trim() || null,
      description_zh: form.description_zh.trim() || null,
      icon: form.icon.trim(),
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      photo_url: form.photo_url || null,
    };

    if (landmark) {
      const { error } = await supabase
        .from("landmarks")
        .update(payload)
        .eq("id", landmark.id);
      setSaving(false);
      if (error) {
        showToast(error.message, "error");
        return;
      }
      onSaved();
      showToast("명소가 수정되었어요");
      return;
    }

    const { error } = await supabase.from("landmarks").insert(payload);
    setSaving(false);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    onSaved();
    showToast("명소가 추가되었어요");
  }

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #ddd",
    borderRadius: 6,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    marginTop: 4,
  };
  const labelStyle: CSSProperties = {
    fontSize: 12,
    color: "#555",
    display: "block",
    marginTop: 12,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: 560,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          {editing ? "명소 수정" : "명소 추가"}
        </div>

        <label style={labelStyle}>이름 *</label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="예: 다람쥐길"
          style={inputStyle}
        />

        <label style={labelStyle}>설명</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="명소 설명"
          style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
        />

        <button
          onClick={fillTranslations}
          type="button"
          style={{
            marginTop: 10,
            padding: "7px 10px",
            border: "1px solid #2563EB",
            borderRadius: 6,
            background: "#fff",
            color: "#2563EB",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          자동번역 채우기
        </button>

        <label style={labelStyle}>영문 이름</label>
        <input
          value={form.name_en}
          onChange={(e) => setForm({ ...form, name_en: e.target.value })}
          style={inputStyle}
        />

        <label style={labelStyle}>중문 이름</label>
        <input
          value={form.name_zh}
          onChange={(e) => setForm({ ...form, name_zh: e.target.value })}
          style={inputStyle}
        />

        <label style={labelStyle}>영문 설명</label>
        <textarea
          value={form.description_en}
          onChange={(e) =>
            setForm({ ...form, description_en: e.target.value })
          }
          style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
        />

        <label style={labelStyle}>중문 설명</label>
        <textarea
          value={form.description_zh}
          onChange={(e) =>
            setForm({ ...form, description_zh: e.target.value })
          }
          style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
        />

        <label style={labelStyle}>이모지 *</label>
        <input
          value={form.icon}
          onChange={(e) => setForm({ ...form, icon: e.target.value })}
          maxLength={4}
          style={{ ...inputStyle, width: 90, fontSize: 20 }}
        />

        <label style={labelStyle}>위치 (지도에서 클릭해서 선택) *</label>
        <div
          style={{
            marginTop: 4,
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #ddd",
          }}
        >
          <FacilityMap
            center={center}
            markerPosition={
              form.lat && form.lng
                ? [parseFloat(form.lat), parseFloat(form.lng)]
                : null
            }
            onMapClick={(lat, lng) =>
              setForm((prev) => ({
                ...prev,
                lat: lat.toFixed(7),
                lng: lng.toFixed(7),
              }))
            }
          />
        </div>

        {form.lat && form.lng && (
          <div style={{ fontSize: 12, color: "#2563EB", marginTop: 8 }}>
            선택된 위치: {form.lat}, {form.lng}
          </div>
        )}

        <label style={labelStyle}>사진</label>
        {form.photo_url && (
          <img
            src={form.photo_url}
            alt="명소 사진"
            style={{
              width: "100%",
              maxHeight: 180,
              objectFit: "cover",
              borderRadius: 8,
              marginTop: 8,
            }}
          />
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading || !landmark?.id}
            onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
            style={{ flex: 1, fontSize: 12 }}
          />
          {form.photo_url && (
            <button
              type="button"
              onClick={handleDeletePhoto}
              style={{
                padding: "7px 10px",
                border: "1px solid #DC2626",
                borderRadius: 6,
                background: "#fff",
                color: "#DC2626",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              사진 삭제
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: "10px",
              background: "#2563EB",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm run typecheck && npm run lint`
Expected: PASS. 신규 명소는 먼저 저장한 뒤 편집 모드에서 사진 업로드가 가능하다. 사진 업로드 실패는 명소 저장을 막지 않는다.

- [ ] **Step 3: 커밋**

```bash
git add src/components/admin/LandmarkFormModal.tsx
git commit -m "feat: 명소 입력 모달 추가"
```

---

### Task 9: 관리자 명소 페이지 + NAV 추가

**Files:**

- Create: `src/app/admin/dashboard/landmarks/page.tsx`
- Modify: `src/app/admin/dashboard/layout.tsx`

**Interfaces:**

- Produces: `/admin/dashboard/landmarks`
- Consumes: `LandmarkFormModal`
- Consumes: `deleteLandmark`
- Consumes: Supabase client direct CRUD on `landmarks`

- [ ] **Step 1: 관리자 페이지 작성**

`src/app/admin/dashboard/landmarks/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { deleteLandmark } from "@/lib/landmarkDelete";
import type { Landmark } from "@/types/domain";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import LandmarkFormModal from "@/components/admin/LandmarkFormModal";

const KU_CENTER: [number, number] = [37.5893, 127.0327];

export default function LandmarksPage() {
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [editingLandmark, setEditingLandmark] = useState<Landmark | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Landmark | null>(null);

  function showToast(message: string, type = "success") {
    setToast({ message, type });
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data } = await supabase
      .from("landmarks")
      .select("*")
      .order("created_at", { ascending: true });
    setLandmarks(data ?? []);
    setLoading(false);
  }

  async function handleDelete(landmark: Landmark) {
    const error = await deleteLandmark(landmark);
    setConfirmDelete(null);
    if (error) {
      showToast(error, "error");
      return;
    }
    fetchData();
    showToast("명소가 삭제되었어요");
  }

  if (loading)
    return <div style={{ padding: 40, color: "#aaa" }}>불러오는 중...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 860, margin: "0 auto" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 10,
          padding: 20,
          border: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>명소</div>
          <button
            onClick={() => setCreating(true)}
            style={{
              fontSize: 13,
              padding: "8px 16px",
              background: "#2563EB",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            + 명소 추가
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
          지도에 표시할 캠퍼스 명소를 관리해요.
        </div>

        {landmarks.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#aaa",
              fontSize: 13,
              padding: "20px 0",
            }}
          >
            등록된 명소가 없어요
          </div>
        ) : (
          landmarks.map((landmark) => (
            <div
              key={landmark.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 0",
                borderBottom: "1px solid #f5f5f5",
              }}
            >
              <div style={{ fontSize: 22, width: 28, textAlign: "center" }}>
                {landmark.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {landmark.name}
                </div>
                {landmark.description && (
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {landmark.description}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#bbb" }}>
                  위도 {landmark.lat} / 경도 {landmark.lng}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 20,
                  background: landmark.photo_url ? "#FEF3C7" : "#F3F4F6",
                  color: landmark.photo_url ? "#92400E" : "#6B7280",
                  flexShrink: 0,
                }}
              >
                {landmark.photo_url ? "사진 있음" : "사진 없음"}
              </span>
              <button
                onClick={() => setEditingLandmark(landmark)}
                style={{
                  fontSize: 12,
                  color: "#2563EB",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                수정
              </button>
              <button
                onClick={() => setConfirmDelete(landmark)}
                style={{
                  fontSize: 12,
                  color: "#DC2626",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                삭제
              </button>
            </div>
          ))
        )}
      </div>

      {creating && (
        <LandmarkFormModal
          center={KU_CENTER}
          landmark={null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            fetchData();
          }}
          showToast={showToast}
        />
      )}

      {editingLandmark && (
        <LandmarkFormModal
          center={[editingLandmark.lat, editingLandmark.lng]}
          landmark={editingLandmark}
          onClose={() => setEditingLandmark(null)}
          onSaved={() => {
            setEditingLandmark(null);
            fetchData();
          }}
          showToast={showToast}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message="명소를 삭제할까요?"
          description="삭제한 명소와 연결된 사진은 복구할 수 없어요."
          confirmLabel="삭제"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: NAV 메뉴 추가**

`src/app/admin/dashboard/layout.tsx`의 `NAV`를 아래처럼 바꾼다.

```tsx
const NAV = [
  { label: "🏢 건물 관리", href: "/admin/dashboard/buildings" },
  { label: "📍 독립 시설", href: "/admin/dashboard/facilities" },
  { label: "✨ 명소", href: "/admin/dashboard/landmarks" },
  { label: "📐 경사도 경로", href: "/admin/dashboard/slopes" },
];
```

- [ ] **Step 3: 검증**

Run: `npm run typecheck && npm run lint`
Expected: PASS. `/admin/dashboard/landmarks`가 dashboard layout 아래에서 렌더된다.

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/dashboard/landmarks/page.tsx src/app/admin/dashboard/layout.tsx
git commit -m "feat: 명소 관리자 페이지 추가"
```

---

### Task 10: 시드 데이터 등록

**Files:** 없음 또는 선택적 SQL 콘솔 입력

**Interfaces:**

- Consumes: authenticated 관리자 화면 또는 Supabase SQL editor
- Produces: 최소 4개 landmarks row

- [ ] **Step 1: 관리자 화면으로 등록**

Run: `npm run dev`
Then: `/admin/dashboard/landmarks`에서 아래 명소를 지도 클릭으로 좌표 확인 후 등록한다.

```text
다람쥐길 / 🐿️
참살이길 / 🌸
애기능 / 🌳
민주광장 / 🕊️
```

- [ ] **Step 2: SQL로 등록하는 경우**

관리자 화면 대신 SQL을 쓰는 경우, 좌표는 구현자가 지도에서 확인한 값으로 바꿔 실행한다.

```sql
insert into public.landmarks (name, name_en, name_zh, description, lat, lng, icon)
values
  ('다람쥐길', 'Squirrel Path', '松鼠路', null, 37.5893000, 127.0327000, '🐿️'),
  ('참살이길', 'Chamsari Path', '参沙里路', null, 37.5893000, 127.0327000, '🌸'),
  ('애기능', 'Aegineung', '爱基陵', null, 37.5893000, 127.0327000, '🌳'),
  ('민주광장', 'Democracy Plaza', '民主广场', null, 37.5893000, 127.0327000, '🕊️');
```

- [ ] **Step 3: 커밋**

관리자 화면 또는 SQL 콘솔로 운영 데이터만 넣었다면 커밋할 파일은 없다.

```bash
git status --short
```

---

### Task 11: 최종 검증

**Files:** 없음 (검증만)

**Interfaces:**

- Consumes: 전체 구현
- Produces: 검증 결과와 수동 체크리스트

- [ ] **Step 1: 자동 검증 전건 실행**

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: 모두 PASS.

- [ ] **Step 2: R2 동영상 회귀 수동 확인**

Run: `npm run dev`
Then:

```text
1. /admin 로그인
2. 독립 시설 또는 건물 시설에서 동영상 presign 업로드 실행
3. 동영상 URL 저장 확인
4. 동영상 삭제 실행
5. R2 객체 삭제와 building_facilities.video_url null 처리 확인
```

- [ ] **Step 3: 명소 수동 확인**

Run: `npm run dev`
Then:

```text
1. /admin/dashboard/landmarks에서 명소 신규 생성
2. 좌표 없이 저장 시 경고 확인
3. 지도 클릭 좌표 지정 후 저장 확인
4. 편집 모드에서 자동번역 채우기 확인
5. 편집 모드에서 5MB 이하 이미지 업로드/교체/삭제 확인
6. 명소 삭제 시 사진이 있으면 사진 삭제 API가 먼저 호출되고 row가 삭제되는지 확인
7. / 지도에서 명소 필터 토글 ON/OFF 확인
8. 명소 마커 배지색이 시설 마커와 구분되는지 확인
9. ko/en/zh 언어 전환 시 팝업 이름/설명이 해당 컬럼을 쓰고 없으면 ko로 폴백하는지 확인
10. /api/landmarks 실패 상황에서는 지도 전체가 깨지지 않고 명소만 빈 레이어로 보이는지 확인
```

- [ ] **Step 4: 자체 검토**

문서 전체를 검색해 placeholder 문구가 남지 않았는지 확인한다. 아래 명령으로 필수 산출물 언급을 확인한다.

```bash
rg -n "landmarks|Landmark|upload-landmark-photo|delete-landmark-photo|LandmarkMarkers|LandmarkFormModal" docs/superpowers/plans/2026-07-20-landmarks.md
git status --short
```

Expected: `rg`는 각 필수 항목을 찾는다. `git status --short`는 의도한 변경만 표시한다.

- [ ] **Step 5: 종료 보고**

push와 PR은 하지 않는다. 자동 검증 결과, 수동 체크리스트 결과, 커밋 목록을 사용자에게 보고한다.
