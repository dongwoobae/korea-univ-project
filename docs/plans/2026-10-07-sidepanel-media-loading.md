# 사이드패널 사진·영상 로딩 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사이드패널을 열 때 사진 3.4MB PNG와 24Mbps 원본 영상을 받던 것을, WebP 사진과 포스터만 받고 영상은 재생할 때 720p로 받게 바꾼다. 이미 올라간 파일도 바꾼다.

**Architecture:** 사진은 브라우저가 WebP를 만들고(Safari는 wasm), 서버는 바이트로 WebP만 받는다. 영상은 업로드마다 ffmpeg.wasm으로 변환을 시도하고 포스터를 함께 저장한다. 변환 인자는 브라우저와 로컬 일괄 스크립트가 한 모듈에서 가져간다. 기존 파일은 사용자가 실행하는 두 스크립트가 journal을 남기며 교체하고, 원본은 확인 뒤 `--purge`로 지운다.

**Tech Stack:** Next.js 16.2.4(App Router, Turbopack), React 19, Supabase(Postgres·Storage), Cloudflare R2(@aws-sdk/client-s3), ffmpeg.wasm 0.12, @jsquash/webp 1.5.0, sharp 0.34.5, Vitest 3(environment `node`), Playwright.

**Spec:** `docs/specs/2026-10-07-sidepanel-media-loading-design.md` — 각 작업의 근거는 이 문서다. 계획과 설계가 다르면 설계가 이긴다.

## Global Constraints

- 사진: 긴 변 1920px 이내, WebP 품질 0.75(canvas) / 75(wasm·sharp). 저장 `cacheControl` `"31536000"`.
- 사진 서버 판정: 0–3 `RIFF`, 8–11 `WEBP`, 12–15 `VP8 `·`VP8L`·`VP8X`, 4–7(LE) = 전체 길이 − 8. 실패 시 400.
- 영상 변환: 긴 변 1280px 이내·짝수·비확대, `libx264`, CRF `28`, `-pix_fmt yuv420p`, AAC `128k`, `-movflags +faststart`. preset은 브라우저 `ultrafast`, 스크립트 `medium`.
- 포스터: 긴 변 640px, 브라우저 JPEG 0.8, 위치 `min(1, 길이/2)`초, 상한 1MB(`1024 * 1024`), 키 = 영상 키의 확장자를 `.jpg`로 바꾼 것.
- presign 응답: `{ presignedUrl, publicUrl, posterPresignedUrl, posterPublicUrl }` — `posterSize`가 없으면 포스터 두 필드는 `null`.
- 화면 문구(그대로): `가로 영상을 추천드려요` · `용량을 줄이지 못해 원본을 올렸어요` · `용량을 줄이는 중... N%` · `변환 도구 불러오는 중...` · `업로드 준비 중...` · `업로드 중... N%`.
- 공유 모듈 `src/lib/videoTranscode.ts`·`src/lib/webpBytes.ts`·`src/lib/buildingPhotos.ts`·`src/lib/videoUpload.ts`는 **아무것도 import하지 않는다**(Node가 스크립트에서 직접 실행).
- 스크립트는 Node 24(`node --env-file=.env.local src/scripts/<이름>.ts`)로 실행한다. `@/` 별칭 금지, 상대 경로 `.ts` 확장자 import, 타입 import는 `import type`. CI는 Node 20이라 스크립트를 실행하지 않는다(타입 검사·린트·단위 테스트만).
- 운영 쓰기(스크립트의 `DRY_RUN=0`, `--purge`)는 사용자가 실행한다. Claude는 `DRY_RUN` 기본값(읽기 전용)까지만 돌린다.
- 주석은 기본적으로 쓰지 않는다. 근거는 설계 문서에 있으므로 필요하면 그 절을 가리킨다.
- 커밋 메시지는 한국어, 기존 형식(`feat(...)`, `fix(...)`, `test(...)`, `docs:`). 리뷰·점검 같은 작업 과정을 적지 않고, AI 서명(`Co-Authored-By`)을 붙이지 않는다.
- 각 작업 끝에 `npx prettier --check <바꾼 파일>`을 통과시킨다(CI `format:check`가 `docs/plans`까지 본다).

## 브랜치와 PR 구성

설계 5장대로 **마이그레이션이 코드보다 먼저** 운영에 적용돼야 한다.

| PR  | 브랜치                      | 내용                                                                           |
| --- | --------------------------- | ------------------------------------------------------------------------------ |
| 1   | `chore/video-poster-column` | 설계 문서 커밋(`b81d8dc`, `d9cdeda`, `42330ee`) + Task 1(마이그레이션·DB 타입) |
| 2   | `fix/media-loading`         | 이 계획서 + Task 1을 cherry-pick한 커밋 + Task 2~16                            |

PR 1이 병합되고 CI가 운영 DB에 적용한 것을 확인한 뒤 PR 2를 병합한다. PR 1 병합 후 `fix/media-loading`을 `origin/main` 위로 rebase하면 중복 커밋은 git이 건너뛴다.

## 파일 지도

| 파일                                                               | 책임                                                    | 작업 |
| ------------------------------------------------------------------ | ------------------------------------------------------- | ---- |
| `supabase/migrations/20261007000000_add_facility_video_poster.sql` | `video_poster_url` 컬럼                                 | 1    |
| `supabase/database.types.ts`                                       | 컬럼 타입                                               | 1    |
| `src/lib/webpBytes.ts` (신규)                                      | WebP 바이트 판정                                        | 2    |
| `src/lib/buildingPhotos.ts` (신규)                                 | 건물 사진 버킷·경로·캐시 규칙                           | 3    |
| `src/app/api/upload-building-photo/route.ts`                       | 바이트 판정·캐시                                        | 3    |
| `src/app/api/delete-building-photo/route.ts`                       | 경로 추출을 `buildingPhotos.ts`로                       | 3    |
| `src/lib/imageToWebP.ts`                                           | canvas → WebP, Safari면 wasm                            | 4    |
| `src/lib/videoTranscode.ts` (신규)                                 | 변환·포스터 ffmpeg 인자, 포스터 위치                    | 5    |
| `src/lib/compressVideo.ts`                                         | 공유 인자 사용, 불러오는 중 종료, 실패 시 인스턴스 폐기 | 5    |
| `src/lib/videoUpload.ts`                                           | 포스터 키·상한                                          | 6    |
| `src/app/api/facility-video-presign/route.ts`                      | 포스터 PUT URL                                          | 7    |
| `src/app/api/facility-video-confirm/route.ts`                      | `posterUrl` 검증·저장                                   | 8    |
| `src/app/api/delete-facility-video/route.ts`                       | 영상 → 포스터 순서 삭제                                 | 9    |
| `src/lib/videoPoster.ts` (신규)                                    | 브라우저 포스터 캡처                                    | 10   |
| `src/lib/facilityVideoUpload.ts` (신규)                            | 업로드 순서·대체·취소 판단(의존성 주입)                 | 11   |
| `src/components/admin/FacilityVideoModal.tsx`                      | 위 함수 연결, 취소 ref, 문구                            | 12   |
| `src/components/sidepanel/FacilityList.tsx`                        | `preload="none"`·`poster`                               | 13   |
| `src/scripts/lib/mediaJournal.ts` (신규)                           | journal 읽기·쓰기, 재실행 정리·purge 대상               | 14   |
| `src/scripts/convertBuildingPhotosToWebP.ts` (신규)                | 기존 사진 변환                                          | 14   |
| `src/scripts/lib/videoTarget.ts` (신규)                            | 영상 대상 분류                                          | 15   |
| `src/scripts/transcodeFacilityVideos.ts` (신규)                    | 기존 영상 변환                                          | 15   |
| `e2e/support/mockBackend.ts`                                       | presign·confirm·delete 목업에 포스터                    | 12   |
| `README.md`                                                        | 기능·스키마·저장소 흐름·트리·테스트 수                  | 16   |

---

### Task 1: `video_poster_url` 컬럼 (PR 1)

**Files:**

- Create: `supabase/migrations/20261007000000_add_facility_video_poster.sql`
- Modify: `supabase/database.types.ts` (`building_facilities`의 `Row`·`Insert`·`Update`)

**Interfaces:**

- Produces: `Database["public"]["Tables"]["building_facilities"]["Row"]["video_poster_url"]: string | null` — `FacilityWithType`에도 자동으로 실린다.

- [ ] **Step 1: PR 1 브랜치를 설계 커밋 위에 만든다**

```bash
git switch -c chore/video-poster-column 42330ee
```

- [ ] **Step 2: 마이그레이션을 쓴다**

`supabase/migrations/20261007000000_add_facility_video_poster.sql`:

```sql
alter table public.building_facilities
  add column if not exists video_poster_url text;
```

- [ ] **Step 3: DB 타입에 컬럼을 넣는다**

`supabase/database.types.ts`의 `building_facilities` 안에서, 세 블록 모두 `video_caption_zh` 줄 바로 아래에 넣는다.

`Row`:

```ts
video_poster_url: string | null;
```

`Insert`와 `Update`:

```ts
          video_poster_url?: string | null;
```

- [ ] **Step 4: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음

- [ ] **Step 5: 마이그레이션 이력 검사를 로컬에서 돌린다**

Run: `EVENT_NAME=pull_request BASE_SHA=$(git rev-parse origin/main) HEAD_SHA=$(git rev-parse HEAD) bash scripts/check-migrations.sh`
Expected: 기존 마이그레이션 수정·삭제가 없다는 결과(새 파일 1개 추가만)

- [ ] **Step 6: 커밋하고 기능 브랜치로 가져온다**

```bash
git add supabase/migrations/20261007000000_add_facility_video_poster.sql supabase/database.types.ts
git commit -m "feat(db): 시설 영상 포스터 컬럼을 추가한다"
git switch fix/media-loading
git cherry-pick chore/video-poster-column
```

- [ ] **Step 7: PR 1 (사용자 승인 후)**

푸시와 PR 생성은 사용자에게 확인을 받고 한다. 본문에는 설계 5장의 배포 순서를 적는다. 병합한 뒤 GitHub Actions에서 마이그레이션 적용 단계가 성공했는지 확인한다.

---

### Task 2: WebP 바이트 판정

**Files:**

- Create: `src/lib/webpBytes.ts`
- Test: `src/lib/webpBytes.test.ts`

**Interfaces:**

- Produces: `WEBP_SNIFF_BYTES = 16`, `isWebP(head: Uint8Array, totalLength: number): boolean` — `head`는 파일 앞부분(최소 16바이트), `totalLength`는 파일 전체 길이.

- [ ] **Step 1: 실패하는 테스트**

`src/lib/webpBytes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isWebP } from "./webpBytes";

const ascii = (text: string) => new TextEncoder().encode(text);

function webp(chunk: string, payload = 10): Uint8Array {
  const bytes = new Uint8Array(16 + payload);
  bytes.set(ascii("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(ascii(`WEBP${chunk}`), 8);
  return bytes;
}

describe("isWebP", () => {
  it.each(["VP8 ", "VP8L", "VP8X"])(
    "%s 청크로 시작하는 WebP를 받는다",
    (chunk) => {
      const bytes = webp(chunk);
      expect(isWebP(bytes, bytes.length)).toBe(true);
    },
  );

  it("PNG는 거른다", () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
      0x44, 0x52,
    ]);
    expect(isWebP(png, 3_527_628)).toBe(false);
  });

  it("JPEG는 거른다", () => {
    const jpeg = new Uint8Array(16);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(isWebP(jpeg, 300_000)).toBe(false);
  });

  it("RIFF....WEBP 12바이트만 있는 입력은 거른다", () => {
    const bytes = webp("VP8 ").slice(0, 12);
    expect(isWebP(bytes, 12)).toBe(false);
  });

  it("이미지 청크가 아니면 거른다", () => {
    const bytes = webp("ABCD");
    expect(isWebP(bytes, bytes.length)).toBe(false);
  });

  it("RIFF 크기와 전체 길이가 다르면(잘린 파일) 거른다", () => {
    const bytes = webp("VP8 ");
    expect(isWebP(bytes, bytes.length - 1)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/webpBytes.test.ts`
Expected: FAIL — `./webpBytes`를 찾지 못함

- [ ] **Step 3: 구현**

`src/lib/webpBytes.ts`:

```ts
export const WEBP_SNIFF_BYTES = 16;

const IMAGE_CHUNKS = ["VP8 ", "VP8L", "VP8X"];

function hasAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** 근거: docs/specs/2026-10-07-sidepanel-media-loading-design.md 2.2 */
export function isWebP(head: Uint8Array, totalLength: number): boolean {
  if (head.length < WEBP_SNIFF_BYTES) return false;
  if (!hasAscii(head, 0, "RIFF") || !hasAscii(head, 8, "WEBP")) return false;
  if (!IMAGE_CHUNKS.some((chunk) => hasAscii(head, 12, chunk))) return false;
  const riffSize = new DataView(
    head.buffer,
    head.byteOffset,
    head.byteLength,
  ).getUint32(4, true);
  return riffSize === totalLength - 8;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/webpBytes.test.ts`
Expected: PASS (8개)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/webpBytes.ts src/lib/webpBytes.test.ts
git commit -m "feat(photo): 파일 앞 바이트로 WebP 여부를 판정한다"
```

---

### Task 3: 사진 업로드 라우트가 WebP만 받는다

**Files:**

- Create: `src/lib/buildingPhotos.ts`
- Modify: `src/app/api/upload-building-photo/route.ts`
- Modify: `src/app/api/delete-building-photo/route.ts:24` (경로 추출만 교체, 동작 동일)
- Test: `src/app/api/upload-building-photo/route.test.ts`

**Interfaces:**

- Consumes: `isWebP` (Task 2)
- Produces (`src/lib/buildingPhotos.ts`):
  - `BUILDING_PHOTO_BUCKET = "building-photos"`
  - `BUILDING_PHOTO_CACHE_CONTROL = "31536000"`
  - `buildingPhotoPath(buildingId: string | number, now: number, rand: string): string` → `"{buildingId}/{now}-{rand}.webp"`
  - `buildingPhotoPathFromUrl(url: string): string | null`

- [ ] **Step 1: 실패하는 테스트**

`src/app/api/upload-building-photo/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
const getPublicUrl = vi.fn(() => ({
  data: { publicUrl: "https://storage.test/building-photos/1/x.webp" },
}));
const single = vi.fn();
const insertQuery = { insert: vi.fn(), select: vi.fn(), single };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload, getPublicUrl }) },
    from: () => insertQuery,
  }),
}));
vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }),
}));

function webpBytes(): Uint8Array {
  const bytes = new Uint8Array(26);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBPVP8 "), 8);
  return bytes;
}

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
  0x44, 0x52,
]);

function request(bytes: Uint8Array) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/webp" }), "photo.webp");
  form.append("buildingId", "1");
  return new Request("https://local.test/api/upload-building-photo", {
    method: "POST",
    body: form,
  });
}

describe("upload building photo route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertQuery.insert.mockReturnValue(insertQuery);
    insertQuery.select.mockReturnValue(insertQuery);
    upload.mockResolvedValue({ error: null });
    single.mockResolvedValue({
      data: { id: 7, url: "https://storage.test/building-photos/1/x.webp" },
      error: null,
    });
  });

  it("이름표가 webp여도 내용이 PNG면 400으로 거절한다", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(pngBytes));

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("잘린 WebP는 400으로 거절한다", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(webpBytes().slice(0, 20)));

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("WebP는 image/webp와 1년 캐시로 저장한다", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(webpBytes()));

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^1\/\d+-[a-z0-9]+\.webp$/),
      expect.anything(),
      { contentType: "image/webp", cacheControl: "31536000" },
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/app/api/upload-building-photo/route.test.ts`
Expected: FAIL — PNG 테스트에서 `200`이 나옴(지금은 검사하지 않음), 캐시 테스트에서 `cacheControl` 없음

- [ ] **Step 3: 공유 규칙 모듈**

`src/lib/buildingPhotos.ts`:

```ts
export const BUILDING_PHOTO_BUCKET = "building-photos";

export const BUILDING_PHOTO_CACHE_CONTROL = "31536000";

export function buildingPhotoPath(
  buildingId: string | number,
  now: number,
  rand: string,
): string {
  return `${buildingId}/${now}-${rand}.webp`;
}

export function buildingPhotoPathFromUrl(url: string): string | null {
  return url.split(`/${BUILDING_PHOTO_BUCKET}/`)[1]?.split("?")[0] ?? null;
}
```

- [ ] **Step 4: 업로드 라우트**

`src/app/api/upload-building-photo/route.ts`에서 import를 추가한다.

```ts
import {
  BUILDING_PHOTO_BUCKET,
  BUILDING_PHOTO_CACHE_CONTROL,
  buildingPhotoPath,
} from "@/lib/buildingPhotos";
import { isWebP } from "@/lib/webpBytes";
```

`const buffer = ...`부터 업로드까지를 다음으로 바꾼다.

```ts
const buffer = Buffer.from(await file.arrayBuffer());
if (!isWebP(buffer, buffer.length)) {
  return NextResponse.json(
    { error: "WebP 이미지만 올릴 수 있어요" },
    { status: 400 },
  );
}
const fileName = buildingPhotoPath(
  String(buildingId),
  Date.now(),
  Math.random().toString(36).slice(2),
);

const { error: uploadError } = await supabaseAdmin.storage
  .from(BUILDING_PHOTO_BUCKET)
  .upload(fileName, buffer, {
    contentType: "image/webp",
    cacheControl: BUILDING_PHOTO_CACHE_CONTROL,
  });
```

같은 파일의 `getPublicUrl` 호출도 `.from(BUILDING_PHOTO_BUCKET)`으로 바꾼다.

- [ ] **Step 5: 삭제 라우트의 경로 추출을 같은 함수로**

`src/app/api/delete-building-photo/route.ts`:

```ts
import {
  BUILDING_PHOTO_BUCKET,
  buildingPhotoPathFromUrl,
} from "@/lib/buildingPhotos";
```

```ts
const storagePath = buildingPhotoPathFromUrl(url);
```

`.from("building-photos")`도 `.from(BUILDING_PHOTO_BUCKET)`으로 바꾼다. 동작은 바뀌지 않는다.

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run src/app/api/upload-building-photo/route.test.ts && npm run typecheck`
Expected: PASS (3개), 타입 오류 없음

- [ ] **Step 7: 커밋**

```bash
git add src/lib/buildingPhotos.ts src/app/api/upload-building-photo src/app/api/delete-building-photo/route.ts
git commit -m "fix(photo): 업로드 라우트가 내용이 WebP인 사진만 받고 1년 캐시로 저장한다"
```

---

### Task 4: Safari에서도 WebP를 만든다 (wasm 대체 인코딩)

**Files:**

- Modify: `src/lib/imageToWebP.ts`
- Modify: `package.json`, `package-lock.json` (`@jsquash/webp`)
- Test: `src/lib/imageToWebP.test.ts`
- Test: `e2e/admin-buildings-slopes.spec.ts` (Safari 흉내 업로드)

**Interfaces:**

- Produces: `encodeCanvasToWebP(canvas: HTMLCanvasElement, encodeWasm?: (image: ImageData) => Promise<ArrayBuffer>): Promise<Blob>` — 항상 `type: "image/webp"`. `convertToWebP(file: File): Promise<Blob>` 시그니처는 그대로다.

- [ ] **Step 1: 의존성 추가**

```bash
npm install @jsquash/webp@1.5.0
ls node_modules/@jsquash/webp/encode.d.ts
```

Expected: 파일이 있다. `package.json` `dependencies`에 `"@jsquash/webp": "^1.5.0"`.

- [ ] **Step 2: 실패하는 단위 테스트**

`src/lib/imageToWebP.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { encodeCanvasToWebP } from "./imageToWebP";

function fakeCanvas(nativeType: string | null) {
  const imageData = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
  const canvas = {
    width: 2,
    height: 1,
    toBlob: (callback: (blob: Blob | null) => void) =>
      callback(nativeType ? new Blob(["x"], { type: nativeType }) : null),
    getContext: () => ({ getImageData: () => imageData }),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, imageData };
}

describe("encodeCanvasToWebP", () => {
  it("브라우저가 WebP를 만들면 wasm을 부르지 않는다", async () => {
    const { canvas } = fakeCanvas("image/webp");
    const encodeWasm = vi.fn();

    const blob = await encodeCanvasToWebP(canvas, encodeWasm);

    expect(blob.type).toBe("image/webp");
    expect(encodeWasm).not.toHaveBeenCalled();
  });

  it("PNG가 돌아오면(Safari) canvas 픽셀을 wasm으로 인코딩한다", async () => {
    const { canvas, imageData } = fakeCanvas("image/png");
    const encodeWasm = vi
      .fn()
      .mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);

    const blob = await encodeCanvasToWebP(canvas, encodeWasm);

    expect(encodeWasm).toHaveBeenCalledWith(imageData);
    expect(blob.type).toBe("image/webp");
    expect(blob.size).toBe(3);
  });

  it("toBlob이 null을 주면 wasm으로 인코딩한다", async () => {
    const { canvas } = fakeCanvas(null);
    const encodeWasm = vi.fn().mockResolvedValue(new ArrayBuffer(4));

    const blob = await encodeCanvasToWebP(canvas, encodeWasm);

    expect(encodeWasm).toHaveBeenCalledOnce();
    expect(blob.size).toBe(4);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/lib/imageToWebP.test.ts`
Expected: FAIL — `encodeCanvasToWebP`가 export되지 않음

- [ ] **Step 4: 구현**

`src/lib/imageToWebP.ts` 전체:

```ts
/** 업로드 전에 줄이는 긴 변 최대 길이(px). */
const MAX_EDGE = 1920;

const WEBP_QUALITY = 0.75;

type WasmWebPEncoder = (image: ImageData) => Promise<ArrayBuffer>;

/**
 * Safari의 canvas는 WebP를 인코딩하지 못하고 오류 없이 PNG를 돌려준다.
 * 그때만 wasm 인코더를 불러와 같은 품질로 다시 인코딩한다(설계 2026-10-07 2.1).
 */
export async function encodeCanvasToWebP(
  canvas: HTMLCanvasElement,
  encodeWasm: WasmWebPEncoder = encodeWithWasm,
): Promise<Blob> {
  const native = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  );
  if (native?.type === "image/webp") return native;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("WebP 변환 실패");
  const encoded = await encodeWasm(
    context.getImageData(0, 0, canvas.width, canvas.height),
  );
  return new Blob([encoded], { type: "image/webp" });
}

async function encodeWithWasm(image: ImageData): Promise<ArrayBuffer> {
  const { default: encode } = await import("@jsquash/webp/encode");
  return encode(image, { quality: WEBP_QUALITY * 100 });
}

/**
 * 이미지를 긴 변 기준 MAX_EDGE 이내로 줄여 WebP Blob으로 바꾼다.
 *
 * canvas와 URL.createObjectURL에 의존하므로 브라우저에서만 동작한다.
 */
export function convertToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_EDGE || h > MAX_EDGE) {
        if (w >= h) {
          h = Math.round((h * MAX_EDGE) / w);
          w = MAX_EDGE;
        } else {
          w = Math.round((w * MAX_EDGE) / h);
          h = MAX_EDGE;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      encodeCanvasToWebP(canvas).then(resolve, () =>
        reject(new Error("WebP 변환 실패")),
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지 로드 실패"));
    };
    img.src = objectUrl;
  });
}
```

- [ ] **Step 5: 단위 테스트 통과**

Run: `npx vitest run src/lib/imageToWebP.test.ts && npm run typecheck`
Expected: PASS (3개), 타입 오류 없음

- [ ] **Step 6: 실제 번들에서 wasm 경로를 확인하는 E2E**

`e2e/admin-buildings-slopes.spec.ts`의 `"건물 사진의 파일별 성공·실패를 표시하고 실패만 재시도한다"` 테스트 바로 아래에 추가한다. Turbopack이 wasm을 실제로 내보내는지가 이 테스트로만 드러난다.

```ts
test("Safari처럼 canvas가 WebP를 못 만들면 wasm으로 WebP를 만들어 올린다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      return original.call(
        this,
        callback,
        type === "image/webp" ? "image/png" : type,
        quality,
      );
    };
  });
  const bodies: Buffer[] = [];
  await page.route("**/api/upload-building-photo", async (route) => {
    bodies.push(route.request().postDataBuffer() ?? Buffer.alloc(0));
    await route.fallback();
  });
  await page.goto("/admin/buildings/1");
  const photoSection = page.locator("#building-photos");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlAAAAABJRU5ErkJggg==",
    "base64",
  );

  await photoSection
    .locator('input[type="file"]')
    .setInputFiles([{ name: "정문.png", mimeType: "image/png", buffer: png }]);

  const progress = photoSection.getByLabel("사진 업로드 진행 상황");
  await expect(
    progress.getByRole("status", { name: /성공 1개 · 실패 0개/ }),
  ).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0].includes(Buffer.from("WEBPVP8"))).toBe(true);
  expect(bodies[0].includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
});
```

- [ ] **Step 7: E2E 실행**

Run: `npx playwright test e2e/admin-buildings-slopes.spec.ts -g "wasm"`
Expected: PASS. 실패하고 원인이 wasm 404면 `@jsquash/webp/encode`의 `init({ locateFile })`로 경로를 넘기는 방식으로 바꾸고(README "Manual WASM initialisation"), 그 결정을 설계 2.1에 한 줄 적는다.

- [ ] **Step 8: 커밋**

```bash
git add package.json package-lock.json src/lib/imageToWebP.ts src/lib/imageToWebP.test.ts e2e/admin-buildings-slopes.spec.ts
git commit -m "fix(photo): Safari에서 PNG로 떨어지던 사진을 wasm 인코더로 WebP로 만든다"
```

---

### Task 5: 변환 인자 모듈과 `compressVideo`

**Files:**

- Create: `src/lib/videoTranscode.ts`
- Modify: `src/lib/compressVideo.ts`
- Test: `src/lib/videoTranscode.test.ts`, `src/lib/compressVideo.test.ts`

**Interfaces:**

- Produces (`src/lib/videoTranscode.ts`, import 없음):
  - `type TranscodePreset = "ultrafast" | "medium"`
  - `VIDEO_MAX_EDGE = 1280`, `POSTER_MAX_EDGE = 640`
  - `transcodeArgs(input: string, output: string, preset: TranscodePreset): string[]`
  - `posterArgs(input: string, output: string, seekSeconds: number): string[]` (네이티브 ffmpeg용)
  - `posterSeekTime(duration: number): number`
- Produces (`compressVideo.ts`): `compressVideo(file: File, onProgress?, onPhase?)`·`terminateFFmpeg()` 시그니처는 그대로. 실패하면 인스턴스를 버린다.

- [ ] **Step 1: 실패하는 인자 테스트**

`src/lib/videoTranscode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { posterArgs, posterSeekTime, transcodeArgs } from "./videoTranscode";

const SCALE_1280 =
  "scale='if(gte(iw,ih),trunc(min(1280,iw)/2)*2,-2)':'if(gte(iw,ih),-2,trunc(min(1280,ih)/2)*2)'";
const SCALE_640 =
  "scale='if(gte(iw,ih),trunc(min(640,iw)/2)*2,-2)':'if(gte(iw,ih),-2,trunc(min(640,ih)/2)*2)'";

describe("transcodeArgs", () => {
  it("설계 4.1의 인자 전체를 preset만 바꿔 만든다", () => {
    expect(transcodeArgs("input.mov", "output.mp4", "ultrafast")).toEqual([
      "-i",
      "input.mov",
      "-vf",
      SCALE_1280,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "output.mp4",
    ]);
    expect(transcodeArgs("a", "b", "medium")).toContain("medium");
  });
});

describe("posterArgs", () => {
  it("한 프레임을 긴 변 640으로 뽑는다", () => {
    expect(posterArgs("in.mp4", "poster.jpg", 1)).toEqual([
      "-ss",
      "1",
      "-i",
      "in.mp4",
      "-frames:v",
      "1",
      "-vf",
      SCALE_640,
      "-q:v",
      "4",
      "poster.jpg",
    ]);
  });
});

describe("posterSeekTime", () => {
  it.each([
    [10, 1],
    [1, 0.5],
    [0, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])("길이 %s초면 %s초 지점", (duration, expected) => {
    expect(posterSeekTime(duration)).toBe(expected);
  });
});
```

배열 리터럴은 prettier가 한 줄에 하나씩 펼친다. 커밋 전에 `npx prettier --write`를 돌린다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/videoTranscode.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/videoTranscode.ts`:

```ts
/** 근거: docs/specs/2026-10-07-sidepanel-media-loading-design.md 4.1·4.4 */
export type TranscodePreset = "ultrafast" | "medium";

export const VIDEO_MAX_EDGE = 1280;

export const POSTER_MAX_EDGE = 640;

// 긴 변만 maxEdge로 묶고 작은 영상은 키우지 않는다. -2는 비율을 지키며 짝수로 맞춘다.
function scaleFilter(maxEdge: number): string {
  return (
    `scale='if(gte(iw,ih),trunc(min(${maxEdge},iw)/2)*2,-2)'` +
    `:'if(gte(iw,ih),-2,trunc(min(${maxEdge},ih)/2)*2)'`
  );
}

export function transcodeArgs(
  input: string,
  output: string,
  preset: TranscodePreset,
): string[] {
  return [
    "-i",
    input,
    "-vf",
    scaleFilter(VIDEO_MAX_EDGE),
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    output,
  ];
}

export function posterArgs(
  input: string,
  output: string,
  seekSeconds: number,
): string[] {
  return [
    "-ss",
    String(seekSeconds),
    "-i",
    input,
    "-frames:v",
    "1",
    "-vf",
    scaleFilter(POSTER_MAX_EDGE),
    "-q:v",
    "4",
    output,
  ];
}

export function posterSeekTime(duration: number): number {
  return Number.isFinite(duration) && duration > 0
    ? Math.min(1, duration / 2)
    : 0;
}
```

- [ ] **Step 4: 인자 테스트 통과**

Run: `npx vitest run src/lib/videoTranscode.test.ts`
Expected: PASS (7개)

- [ ] **Step 5: 실패하는 `compressVideo` 테스트**

`src/lib/compressVideo.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { transcodeArgs } from "./videoTranscode";

const instances: FakeFFmpeg[] = [];
let coreGate: Promise<void> = Promise.resolve();

class FakeFFmpeg {
  resolveLoad: () => void = () => {};
  rejectLoad: (error: Error) => void = () => {};
  load = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        this.resolveLoad = resolve;
        this.rejectLoad = reject;
      }),
  );
  terminate = vi.fn(() =>
    this.rejectLoad(new Error("called FFmpeg.terminate()")),
  );
  writeFile = vi.fn(async () => true);
  exec = vi.fn(async () => 0);
  readFile = vi.fn(async () => new Uint8Array([1, 2, 3]));
  deleteFile = vi.fn(async () => true);
  on = vi.fn();
  off = vi.fn();
  constructor() {
    instances.push(this);
  }
}

vi.mock("@ffmpeg/ffmpeg", () => ({ FFmpeg: FakeFFmpeg }));
vi.mock("@ffmpeg/util", () => ({
  toBlobURL: vi.fn(async () => {
    await coreGate;
    return "blob:core";
  }),
  fetchFile: vi.fn(async () => new Uint8Array([0])),
}));

const clip = () =>
  Object.assign(new Blob(["v"], { type: "video/quicktime" }), {
    name: "clip.mov",
  }) as File;

async function load() {
  vi.resetModules();
  return import("./compressVideo");
}

describe("compressVideo", () => {
  beforeEach(() => {
    instances.length = 0;
    coreGate = Promise.resolve();
  });

  it("코어를 받는 중에 종료하면 load로 넘어가지 않고 거절된다", async () => {
    const { compressVideo, terminateFFmpeg } = await load();
    let openGate = () => {};
    coreGate = new Promise((resolve) => (openGate = resolve));

    const result = compressVideo(clip());
    terminateFFmpeg();
    openGate();

    await expect(result).rejects.toThrow();
    expect(instances[0].load).not.toHaveBeenCalled();
  });

  it("불러오는 중에 종료하면 거절된다", async () => {
    const { compressVideo, terminateFFmpeg } = await load();

    const result = compressVideo(clip());
    await vi.waitFor(() => expect(instances[0].load).toHaveBeenCalled());
    terminateFFmpeg();

    await expect(result).rejects.toThrow("terminate");
    expect(instances[0].terminate).toHaveBeenCalled();
  });

  it("공유 인자(ultrafast)로 변환하고 mp4 Blob을 돌려준다", async () => {
    const { compressVideo } = await load();

    const result = compressVideo(clip());
    await vi.waitFor(() => expect(instances[0].load).toHaveBeenCalled());
    instances[0].resolveLoad();

    const blob = await result;
    expect(instances[0].exec).toHaveBeenCalledWith(
      transcodeArgs("input.mov", "output.mp4", "ultrafast"),
    );
    expect(blob.type).toBe("video/mp4");
  });

  it("변환이 실패하면 인스턴스를 버리고 다음 호출은 새로 만든다", async () => {
    const { compressVideo } = await load();
    const first = compressVideo(clip());
    await vi.waitFor(() => expect(instances[0].load).toHaveBeenCalled());
    instances[0].exec.mockRejectedValueOnce(new Error("OOM"));
    instances[0].resolveLoad();
    await expect(first).rejects.toThrow("OOM");
    expect(instances[0].terminate).toHaveBeenCalled();

    void compressVideo(clip()).catch(() => {});
    await vi.waitFor(() => expect(instances).toHaveLength(2));
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run src/lib/compressVideo.test.ts`
Expected: FAIL — 첫 테스트에서 `load`가 호출됨, 마지막 테스트에서 `terminate`가 호출되지 않음

- [ ] **Step 7: `compressVideo.ts` 구현**

`src/lib/compressVideo.ts` 전체:

```ts
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { transcodeArgs } from "@/lib/videoTranscode";

const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

let ffmpeg: FFmpeg | null = null;
let ready: Promise<FFmpeg> | null = null;

export function terminateFFmpeg() {
  ffmpeg?.terminate();
  ffmpeg = null;
  ready = null;
}

function getFFmpeg(): Promise<FFmpeg> {
  if (ready) return ready;
  // load()가 끝나기 전에 넣어 둬야 불러오는 중에도 terminateFFmpeg가 이 인스턴스에 닿는다.
  const instance = new FFmpeg();
  ffmpeg = instance;
  const loading = (async () => {
    const coreURL = await toBlobURL(
      `${CORE_BASE_URL}/ffmpeg-core.js`,
      "text/javascript",
    );
    const wasmURL = await toBlobURL(
      `${CORE_BASE_URL}/ffmpeg-core.wasm`,
      "application/wasm",
    );
    // 코어를 받는 사이 종료됐다. 받는 요청 자체는 끊을 수단이 없다.
    if (ffmpeg !== instance) throw new Error("ffmpeg terminated");
    await instance.load({ coreURL, wasmURL });
    return instance;
  })();
  ready = loading;
  loading.catch(() => {
    if (ffmpeg === instance) {
      ffmpeg = null;
      ready = null;
    }
  });
  return loading;
}

export async function compressVideo(
  file: File,
  /** 0~100 */
  onProgress?: (progress: number) => void,
  onPhase?: (phase: "loading" | "compressing") => void,
): Promise<Blob> {
  if (ready === null) onPhase?.("loading");

  const ff = await getFFmpeg();
  onPhase?.("compressing");

  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(99, Math.round(progress * 100)));
  };
  ff.on("progress", handleProgress);

  const inputName = "input" + file.name.slice(file.name.lastIndexOf("."));
  try {
    await ff.writeFile(inputName, await fetchFile(file));
    await ff.exec(transcodeArgs(inputName, "output.mp4", "ultrafast"));
    const data = await ff.readFile("output.mp4");
    await ff.deleteFile(inputName);
    await ff.deleteFile("output.mp4");
    ff.off("progress", handleProgress);
    onProgress?.(100);
    return new Blob([data as unknown as BlobPart], { type: "video/mp4" });
  } catch (error) {
    // 메모리 부족 등으로 실패한 wasm을 다음 업로드가 다시 쓰지 않게 버린다.
    if (ffmpeg === ff) terminateFFmpeg();
    throw error;
  }
}
```

- [ ] **Step 8: 통과 확인**

Run: `npx vitest run src/lib/compressVideo.test.ts src/lib/videoTranscode.test.ts && npm run typecheck`
Expected: PASS (11개), 타입 오류 없음

- [ ] **Step 9: 커밋**

```bash
npx prettier --write src/lib/videoTranscode.ts src/lib/videoTranscode.test.ts src/lib/compressVideo.ts src/lib/compressVideo.test.ts
git add src/lib/videoTranscode.ts src/lib/videoTranscode.test.ts src/lib/compressVideo.ts src/lib/compressVideo.test.ts
git commit -m "feat(video): 변환 인자를 한 모듈로 모으고 세로 영상도 긴 변 1280으로 줄인다"
```

---

### Task 6: 포스터 키 규칙

**Files:**

- Modify: `src/lib/videoUpload.ts`
- Test: `src/lib/videoUpload.test.ts`

**Interfaces:**

- Produces: `MAX_POSTER_BYTES = 1024 * 1024`, `facilityVideoPosterKey(videoKey: string): string`, `isPosterKeyFor(posterKey: string, videoKey: string): boolean`

- [ ] **Step 1: 실패하는 테스트**

`src/lib/videoUpload.test.ts` 끝에 추가하고, 상단 import에 `facilityVideoPosterKey`, `isPosterKeyFor`를 더한다.

```ts
describe("facilityVideoPosterKey / isPosterKeyFor", () => {
  const facilityId = "efca8dfa-c6c2-47c8-b2b0-923cfb98fe5f";
  const videoKey = `facility-videos/${facilityId}/1780848381078.mp4`;

  it("영상 키의 확장자만 .jpg로 바꾼다", () => {
    expect(facilityVideoPosterKey(videoKey)).toBe(
      `facility-videos/${facilityId}/1780848381078.jpg`,
    );
  });

  it("같은 ts의 .jpg만 짝으로 본다", () => {
    expect(
      isPosterKeyFor(
        `facility-videos/${facilityId}/1780848381078.jpg`,
        videoKey,
      ),
    ).toBe(true);
    expect(
      isPosterKeyFor(
        `facility-videos/${facilityId}/1780848381079.jpg`,
        videoKey,
      ),
    ).toBe(false);
    expect(
      isPosterKeyFor(`facility-videos/other/1780848381078.jpg`, videoKey),
    ).toBe(false);
    expect(
      isPosterKeyFor(
        `facility-videos/${facilityId}/1780848381078.png`,
        videoKey,
      ),
    ).toBe(false);
    expect(isPosterKeyFor(videoKey, videoKey)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/videoUpload.test.ts`
Expected: FAIL — export 없음

- [ ] **Step 3: 구현**

`src/lib/videoUpload.ts` 끝에 추가:

```ts
export const MAX_POSTER_BYTES = 1024 * 1024;

/**
 * 포스터는 영상 키의 확장자만 `.jpg`로 바꾼 키에 둔다.
 * 둘이 한 쌍인지 키만 보고 검증하기 위해서다(설계 2026-10-07 4.5).
 */
export function facilityVideoPosterKey(videoKey: string): string {
  return videoKey.replace(/\.[^./]+$/, ".jpg");
}

export function isPosterKeyFor(posterKey: string, videoKey: string): boolean {
  return (
    posterKey !== videoKey && posterKey === facilityVideoPosterKey(videoKey)
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/videoUpload.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/videoUpload.ts src/lib/videoUpload.test.ts
git commit -m "feat(video): 포스터 키를 영상 키의 짝으로 정한다"
```

---

### Task 7: presign이 포스터 PUT URL을 발급한다

**Files:**

- Modify: `src/app/api/facility-video-presign/route.ts`
- Test: `src/app/api/facility-video-presign/route.test.ts`

**Interfaces:**

- Consumes: `MAX_POSTER_BYTES`, `facilityVideoPosterKey`, `isValidFileSize` (Task 6, 기존)
- Produces: 응답 `{ presignedUrl, publicUrl, posterPresignedUrl: string | null, posterPublicUrl: string | null }`

- [ ] **Step 1: 실패하는 테스트**

`src/app/api/facility-video-presign/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PutObjectCommand } from "@aws-sdk/client-s3";

const getSignedUrl = vi.fn(
  async (_client: unknown, command: PutObjectCommand) =>
    `https://signed.test/${command.input.Key}`,
);

vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));
vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }),
}));
vi.mock("@/lib/r2", () => ({
  r2Presign: {},
  R2_BUCKET: "bucket",
  getPublicR2Url: (key: string) => `https://cdn.test/${key}`,
}));

const facilityId = "efca8dfa-c6c2-47c8-b2b0-923cfb98fe5f";

function request(body: Record<string, unknown>) {
  return new Request("https://local.test/api/facility-video-presign", {
    method: "POST",
    body: JSON.stringify({
      facilityId,
      contentType: "video/mp4",
      fileSize: 1000,
      ...body,
    }),
  });
}

describe("facility video presign route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posterSize가 없으면 포스터 필드는 null이다", async () => {
    const { POST } = await import("./route");

    const data = await (await POST(request({}))).json();

    expect(data.posterPresignedUrl).toBeNull();
    expect(data.posterPublicUrl).toBeNull();
    expect(getSignedUrl).toHaveBeenCalledOnce();
  });

  it("posterSize가 있으면 짝 키를 크기·image/jpeg로 서명한다", async () => {
    const { POST } = await import("./route");

    const data = await (await POST(request({ posterSize: 2048 }))).json();

    const videoKey = data.publicUrl.replace("https://cdn.test/", "");
    expect(data.posterPublicUrl).toBe(
      `https://cdn.test/${videoKey.replace(/\.mp4$/, ".jpg")}`,
    );
    const posterCommand = getSignedUrl.mock.calls[1][1];
    expect(posterCommand.input.ContentType).toBe("image/jpeg");
    expect(posterCommand.input.ContentLength).toBe(2048);
  });

  it.each([1024 * 1024 + 1, -1, "2048"])(
    "posterSize %s는 400으로 거절한다",
    async (posterSize) => {
      const { POST } = await import("./route");

      const response = await POST(request({ posterSize }));

      expect(response.status).toBe(400);
      expect(getSignedUrl).not.toHaveBeenCalled();
    },
  );
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/app/api/facility-video-presign/route.test.ts`
Expected: FAIL — `posterPresignedUrl`이 `undefined`

- [ ] **Step 3: 구현**

`src/app/api/facility-video-presign/route.ts`의 videoUpload import에 `MAX_POSTER_BYTES`, `facilityVideoPosterKey`를 더한다.

요청 파싱을 바꾼다.

```ts
const { facilityId, contentType, fileSize, posterSize } = await request.json();
```

`exceedsVideoLimit` 검사 바로 아래에 추가한다.

```ts
if (
  posterSize !== undefined &&
  (!isValidFileSize(posterSize) || posterSize > MAX_POSTER_BYTES)
) {
  return NextResponse.json(
    { error: "포스터 크기가 올바르지 않아요" },
    { status: 400 },
  );
}
```

기존 `presignedUrl` 발급 아래, 응답 전에 추가하고 응답을 바꾼다.

```ts
let posterPresignedUrl: string | null = null;
let posterPublicUrl: string | null = null;
if (posterSize !== undefined) {
  const posterKey = facilityVideoPosterKey(key);
  posterPresignedUrl = await getSignedUrl(
    r2Presign,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: posterKey,
      ContentType: "image/jpeg",
      ContentLength: posterSize,
    }),
    {
      expiresIn: 3600,
      signableHeaders: new Set(["content-length"]),
    },
  );
  posterPublicUrl = getPublicR2Url(posterKey);
}

return NextResponse.json({
  presignedUrl,
  publicUrl: getPublicR2Url(key),
  posterPresignedUrl,
  posterPublicUrl,
});
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/app/api/facility-video-presign/route.test.ts && npm run typecheck`
Expected: PASS (5개)

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/facility-video-presign
git commit -m "feat(video): presign이 영상과 짝인 포스터 업로드 주소를 함께 발급한다"
```

---

### Task 8: confirm이 포스터를 함께 저장한다

**Files:**

- Modify: `src/app/api/facility-video-confirm/route.ts`
- Test: `src/app/api/facility-video-confirm/route.test.ts`

**Interfaces:**

- Consumes: `isPosterKeyFor` (Task 6)
- Produces: 요청 `{ facilityId, videoUrl, posterUrl?: string }` → `building_facilities.video_url`·`video_poster_url` 동시 갱신

- [ ] **Step 1: 실패하는 테스트**

`src/app/api/facility-video-confirm/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = { update: vi.fn(), eq: vi.fn() };
query.update.mockReturnValue(query);
const from = vi.fn(() => query);

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from }) }));
vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }),
}));
vi.mock("@/lib/r2", () => ({
  getR2KeyFromPublicUrl: (url: string) =>
    url.startsWith("https://cdn.test/")
      ? url.slice("https://cdn.test/".length)
      : null,
}));

const facilityId = "efca8dfa-c6c2-47c8-b2b0-923cfb98fe5f";
const videoUrl = `https://cdn.test/facility-videos/${facilityId}/100.mp4`;

function request(posterUrl?: string) {
  return new Request("https://local.test/api/facility-video-confirm", {
    method: "POST",
    body: JSON.stringify({ facilityId, videoUrl, posterUrl }),
  });
}

describe("facility video confirm route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.update.mockReturnValue(query);
    query.eq.mockResolvedValue({ error: null });
  });

  it("posterUrl이 없으면 video_poster_url을 null로 덮는다", async () => {
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith({
      video_url: videoUrl,
      video_poster_url: null,
    });
  });

  it("짝 포스터는 함께 저장한다", async () => {
    const { POST } = await import("./route");
    const posterUrl = `https://cdn.test/facility-videos/${facilityId}/100.jpg`;

    await POST(request(posterUrl));

    expect(query.update).toHaveBeenCalledWith({
      video_url: videoUrl,
      video_poster_url: posterUrl,
    });
  });

  it.each([
    `https://cdn.test/facility-videos/${facilityId}/101.jpg`,
    `https://cdn.test/facility-videos/other/100.jpg`,
    "https://elsewhere.test/poster.jpg",
  ])("짝이 아닌 posterUrl %s는 400이다", async (posterUrl) => {
    const { POST } = await import("./route");

    const response = await POST(request(posterUrl));

    expect(response.status).toBe(400);
    expect(query.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/app/api/facility-video-confirm/route.test.ts`
Expected: FAIL — `update`가 `{ video_url }`만 받음, 짝이 아닌 포스터가 200

- [ ] **Step 3: 구현**

`src/app/api/facility-video-confirm/route.ts`의 import를 `import { isFacilityVideoKey, isPosterKeyFor } from "@/lib/videoUpload";`로 바꾼다.

요청 파싱을 `const { facilityId, videoUrl, posterUrl } = await request.json();`로 바꾼다.

영상 키 검사 블록 바로 아래에 추가한다.

```ts
let posterValue: string | null = null;
if (posterUrl !== undefined && posterUrl !== null) {
  const posterKey =
    typeof posterUrl === "string" ? getR2KeyFromPublicUrl(posterUrl) : null;
  if (!posterKey || !isPosterKeyFor(posterKey, key)) {
    return NextResponse.json(
      { error: "이 동영상의 포스터 주소가 아니에요" },
      { status: 400 },
    );
  }
  posterValue = posterUrl;
}
```

`update`를 바꾼다.

```ts
      .update({ video_url: videoUrl, video_poster_url: posterValue })
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/app/api/facility-video-confirm/route.test.ts && npm run typecheck`
Expected: PASS (5개)

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/facility-video-confirm
git commit -m "feat(video): confirm이 영상과 짝인 포스터만 함께 저장한다"
```

---

### Task 9: 삭제는 영상 → 포스터 순서로

**Files:**

- Modify: `src/app/api/delete-facility-video/route.ts`
- Test: `src/app/api/delete-facility-video/route.test.ts`

**Interfaces:**

- 요청·응답 형식은 그대로. 불변식: DB가 없는 객체를 가리키지 않는다(설계 4.5).

- [ ] **Step 1: 실패하는 테스트**

`src/app/api/delete-facility-video/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const maybeSingle = vi.fn();
const query = {
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  maybeSingle,
};
const from = vi.fn(() => query);

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from }) }));
vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }),
}));
vi.mock("@/lib/r2", () => ({
  r2: { send },
  R2_BUCKET: "bucket",
  getR2KeyFromPublicUrl: (url: string) =>
    url.startsWith("https://cdn.test/")
      ? url.slice("https://cdn.test/".length)
      : null,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const facilityId = "efca8dfa-c6c2-47c8-b2b0-923cfb98fe5f";
const videoUrl = `https://cdn.test/facility-videos/${facilityId}/100.mp4`;
const posterUrl = `https://cdn.test/facility-videos/${facilityId}/100.jpg`;

function request() {
  return new Request("https://local.test/api/delete-facility-video", {
    method: "POST",
    body: JSON.stringify({ facilityId, videoUrl }),
  });
}

function deletedKeys() {
  return send.mock.calls.map(([command]) => command.input.Key);
}

describe("delete facility video route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of [query.select, query.update, query.eq, query.is])
      fn.mockReturnValue(query);
    maybeSingle
      .mockResolvedValueOnce({
        data: { video_url: videoUrl, video_poster_url: posterUrl },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: facilityId }, error: null });
  });

  it("영상을 먼저, 포스터를 나중에 지운다", async () => {
    send.mockResolvedValue({});
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith({
      video_url: null,
      video_poster_url: null,
    });
    expect(deletedKeys()).toEqual([
      `facility-videos/${facilityId}/100.mp4`,
      `facility-videos/${facilityId}/100.jpg`,
    ]);
  });

  it("영상 삭제가 실패하면 두 컬럼을 되돌리고 포스터는 지우지 않는다", async () => {
    send.mockRejectedValueOnce(new Error("R2 down"));
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(deletedKeys()).toHaveLength(1);
    expect(query.update).toHaveBeenLastCalledWith({
      video_url: videoUrl,
      video_poster_url: posterUrl,
    });
  });

  it("포스터 삭제만 실패하면 성공으로 응답하고 되돌리지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("R2 down"));
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledTimes(1);
  });

  it("포스터가 없으면 영상만 지운다", async () => {
    maybeSingle.mockReset();
    maybeSingle
      .mockResolvedValueOnce({
        data: { video_url: videoUrl, video_poster_url: null },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: facilityId }, error: null });
    send.mockResolvedValue({});
    const { POST } = await import("./route");

    await POST(request());

    expect(deletedKeys()).toEqual([`facility-videos/${facilityId}/100.mp4`]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/app/api/delete-facility-video/route.test.ts`
Expected: FAIL — 포스터를 지우지 않음, `update`에 `video_poster_url` 없음

- [ ] **Step 3: 구현**

`src/app/api/delete-facility-video/route.ts`에서 다음을 바꾼다.

조회 컬럼: `.select("video_url, video_poster_url")`

영상 키 검증 블록 아래에 추가한다.

```ts
// DB 값이 이 시설의 키가 아니면 객체는 건드리지 않고 컬럼만 비운다.
const posterKey = current.video_poster_url
  ? getR2KeyFromPublicUrl(current.video_poster_url)
  : null;
const deletablePosterKey =
  posterKey && isFacilityVideoKey(posterKey, String(facilityId))
    ? posterKey
    : null;
```

`update({ video_url: null })`를 `update({ video_url: null, video_poster_url: null })`로 바꾼다.

R2 삭제부터 `revalidatePath` 앞까지를 다음으로 바꾼다.

```ts
try {
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
} catch (storageError) {
  await supabaseAdmin
    .from("building_facilities")
    .update({
      video_url: videoUrl,
      video_poster_url: current.video_poster_url,
    })
    .eq("id", facilityId)
    .is("video_url", null);
  throw storageError;
}

// 영상이 이미 지워졌으므로 되돌리지 않는다. DB는 포스터를 참조하지 않아 고아 jpg만 남는다.
if (deletablePosterKey) {
  try {
    await r2.send(
      new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: deletablePosterKey }),
    );
  } catch (posterError) {
    console.error(
      `[delete-facility-video] 포스터 삭제 실패 key=${deletablePosterKey}`,
      posterError,
    );
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/app/api/delete-facility-video/route.test.ts && npm run typecheck`
Expected: PASS (4개)

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/delete-facility-video
git commit -m "feat(video): 삭제가 영상을 먼저 지우고 포스터는 실패해도 되돌리지 않는다"
```

---

### Task 10: 브라우저 포스터 캡처

**Files:**

- Create: `src/lib/videoPoster.ts`
- Test: `src/lib/videoPoster.test.ts`

**Interfaces:**

- Consumes: `POSTER_MAX_EDGE`, `posterSeekTime` (Task 5)
- Produces: `posterSize(width: number, height: number): { width: number; height: number }`, `captureVideoPoster(file: Blob, options?: { createVideo?: () => HTMLVideoElement; createCanvas?: () => HTMLCanvasElement; timeoutMs?: number }): Promise<Blob | null>` — 실패하면 `null`, 예외를 던지지 않는다.

- [ ] **Step 1: 실패하는 테스트**

`src/lib/videoPoster.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { captureVideoPoster, posterSize } from "./videoPoster";

function createFakeVideo() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    preload: "",
    muted: false,
    src: "",
    duration: 10,
    currentTime: 0,
    videoWidth: 1920,
    videoHeight: 1080,
    addEventListener(type: string, fn: () => void) {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
    removeAttribute() {},
    load() {},
    emit(type: string) {
      for (const fn of [...(listeners[type] ?? [])]) fn();
    },
  };
}

function createFakeCanvas() {
  const drawImage = vi.fn();
  const toBlob = vi.fn((callback: (blob: Blob | null) => void) =>
    callback(new Blob(["jpg"], { type: "image/jpeg" })),
  );
  return {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob,
    drawImage,
  };
}

function capture(
  video: ReturnType<typeof createFakeVideo>,
  canvas = createFakeCanvas(),
) {
  return {
    canvas,
    result: captureVideoPoster(new Blob(["v"], { type: "video/mp4" }), {
      createVideo: () => video as unknown as HTMLVideoElement,
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
    }),
  };
}

describe("posterSize", () => {
  it.each([
    [1920, 1080, 640, 360],
    [1080, 1920, 360, 640],
    [320, 240, 320, 240],
  ])("%sx%s → %sx%s", (w, h, ew, eh) => {
    expect(posterSize(w, h)).toEqual({ width: ew, height: eh });
  });
});

describe("captureVideoPoster", () => {
  it("1초 지점으로 이동해 640px JPEG(0.8)를 만든다", async () => {
    const video = createFakeVideo();
    const { canvas, result } = capture(video);

    video.emit("loadedmetadata");
    expect(video.currentTime).toBe(1);
    video.emit("seeked");

    const blob = await result;
    expect(blob?.type).toBe("image/jpeg");
    expect([canvas.width, canvas.height]).toEqual([640, 360]);
    expect(canvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.8,
    );
  });

  it("디코드 오류면 null", async () => {
    const video = createFakeVideo();
    const { result } = capture(video);

    video.emit("error");

    await expect(result).resolves.toBeNull();
  });

  it("화면 크기가 0이면(디코드 불가 코덱) null", async () => {
    const video = createFakeVideo();
    video.videoWidth = 0;
    const { result } = capture(video);

    video.emit("loadedmetadata");
    video.emit("seeked");

    await expect(result).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/videoPoster.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/videoPoster.ts`:

```ts
import { POSTER_MAX_EDGE, posterSeekTime } from "@/lib/videoTranscode";

const POSTER_QUALITY = 0.8;
const POSTER_TIMEOUT_MS = 15_000;

type PosterOptions = {
  createVideo?: () => HTMLVideoElement;
  createCanvas?: () => HTMLCanvasElement;
  timeoutMs?: number;
};

export function posterSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function captureVideoPoster(
  file: Blob,
  {
    createVideo,
    createCanvas,
    timeoutMs = POSTER_TIMEOUT_MS,
  }: PosterOptions = {},
): Promise<Blob | null> {
  const video = createVideo ? createVideo() : document.createElement("video");
  const url = URL.createObjectURL(file);

  return new Promise<Blob | null>((resolve) => {
    let settled = false;

    const finish = (poster: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(poster);
    };

    const onMetadata = () => {
      video.currentTime = posterSeekTime(video.duration);
    };
    const onSeeked = () => {
      if (!video.videoWidth || !video.videoHeight) return finish(null);
      const size = posterSize(video.videoWidth, video.videoHeight);
      const canvas = createCanvas
        ? createCanvas()
        : document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) return finish(null);
      context.drawImage(video, 0, 0, size.width, size.height);
      canvas.toBlob(finish, "image/jpeg", POSTER_QUALITY);
    };
    const onError = () => finish(null);
    const timer = setTimeout(() => finish(null), timeoutMs);

    video.preload = "auto";
    video.muted = true;
    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.src = url;
    video.load();
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/videoPoster.test.ts && npm run typecheck`
Expected: PASS (6개)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/videoPoster.ts src/lib/videoPoster.test.ts
git commit -m "feat(video): 업로드할 영상에서 긴 변 640px 포스터를 캡처한다"
```

---

### Task 11: 업로드 순서를 한 함수로 (대체·취소·포스터)

**Files:**

- Create: `src/lib/facilityVideoUpload.ts`
- Test: `src/lib/facilityVideoUpload.test.ts`

**Interfaces:**

- Consumes: `exceedsVideoLimit`, `formatExcessSize`, `MAX_VIDEO_LABEL` (기존 `videoUpload.ts`)
- Produces:

```ts
export type UploadPhase =
  "loading" | "compressing" | "checking" | "preparing" | "uploading";
export interface PresignResult {
  presignedUrl: string;
  publicUrl: string;
  posterPresignedUrl: string | null;
  posterPublicUrl: string | null;
}
export interface FacilityVideoUploadDeps {
  compress: (
    file: File,
    onProgress: (progress: number) => void,
    onPhase: (phase: "loading" | "compressing") => void,
  ) => Promise<Blob>;
  isPlayable: (file: Blob) => Promise<boolean>;
  capturePoster: (video: Blob) => Promise<Blob | null>;
  presign: (request: {
    contentType: string;
    fileSize: number;
    posterSize?: number;
  }) => Promise<PresignResult>;
  put: (
    url: string,
    body: Blob,
    contentType: string,
    onProgress?: (progress: number) => void,
  ) => Promise<void>;
  confirm: (request: { videoUrl: string; posterUrl?: string }) => Promise<void>;
  isCancelled: () => boolean;
  onPhase: (phase: UploadPhase) => void;
  onProgress: (progress: number) => void;
}
export type FacilityVideoUploadResult =
  | { status: "uploaded"; videoUrl: string; usedOriginal: boolean }
  | { status: "cancelled" }
  | { status: "failed"; message: string };
export function uploadFacilityVideo(
  file: File,
  deps: FacilityVideoUploadDeps,
): Promise<FacilityVideoUploadResult>;
```

`presign`·`put`·`confirm`이 던지는 `Error.message`는 그대로 사용자에게 보여 줄 문장이다(Task 12에서 만든다).

- [ ] **Step 1: 실패하는 테스트**

`src/lib/facilityVideoUpload.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  type FacilityVideoUploadDeps,
  uploadFacilityVideo,
} from "./facilityVideoUpload";
import { MAX_VIDEO_BYTES } from "./videoUpload";

const original = Object.assign(
  new Blob(["original-bytes"], { type: "video/quicktime" }),
  { name: "clip.mov" },
) as File;

function deps(
  overrides: Partial<FacilityVideoUploadDeps> = {},
): FacilityVideoUploadDeps {
  return {
    compress: vi.fn(async () => new Blob(["small"], { type: "video/mp4" })),
    isPlayable: vi.fn(async () => true),
    capturePoster: vi.fn(async () => new Blob(["jpg"], { type: "image/jpeg" })),
    presign: vi.fn(async () => ({
      presignedUrl: "https://upload.test/video",
      publicUrl: "https://cdn.test/v.mp4",
      posterPresignedUrl: "https://upload.test/poster",
      posterPublicUrl: "https://cdn.test/v.jpg",
    })),
    put: vi.fn(async () => {}),
    confirm: vi.fn(async () => {}),
    isCancelled: () => false,
    onPhase: vi.fn(),
    onProgress: vi.fn(),
    ...overrides,
  };
}

describe("uploadFacilityVideo", () => {
  it("변환본과 포스터를 올리고 함께 확정한다", async () => {
    const d = deps();

    const result = await uploadFacilityVideo(original, d);

    expect(result).toEqual({
      status: "uploaded",
      videoUrl: "https://cdn.test/v.mp4",
      usedOriginal: false,
    });
    expect(d.presign).toHaveBeenCalledWith({
      contentType: "video/mp4",
      fileSize: 5,
      posterSize: 3,
    });
    expect(d.put).toHaveBeenCalledTimes(2);
    expect(d.confirm).toHaveBeenCalledWith({
      videoUrl: "https://cdn.test/v.mp4",
      posterUrl: "https://cdn.test/v.jpg",
    });
    expect(d.isPlayable).not.toHaveBeenCalled();
  });

  it("변환이 실패해도 원본이 재생되면 원본을 올린다", async () => {
    const d = deps({ compress: vi.fn().mockRejectedValue(new Error("OOM")) });

    const result = await uploadFacilityVideo(original, d);

    expect(result).toMatchObject({ status: "uploaded", usedOriginal: true });
    expect(d.presign).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "video/quicktime",
        fileSize: original.size,
      }),
    );
  });

  it("변환이 실패하고 원본도 재생되지 않으면 실패한다", async () => {
    const d = deps({
      compress: vi.fn().mockRejectedValue(new Error("OOM")),
      isPlayable: vi.fn(async () => false),
    });

    const result = await uploadFacilityVideo(original, d);

    expect(result.status).toBe("failed");
    expect(d.presign).not.toHaveBeenCalled();
  });

  it("변환 중 취소로 실패하면 원본으로 넘어가지 않는다", async () => {
    let cancelled = false;
    const d = deps({
      compress: vi.fn(async () => {
        cancelled = true;
        throw new Error("called FFmpeg.terminate()");
      }),
      isCancelled: () => cancelled,
    });

    const result = await uploadFacilityVideo(original, d);

    expect(result).toEqual({ status: "cancelled" });
    expect(d.isPlayable).not.toHaveBeenCalled();
    expect(d.presign).not.toHaveBeenCalled();
  });

  it("presign 뒤에 취소되면 올리지 않는다", async () => {
    let cancelled = false;
    const d = deps({ isCancelled: () => cancelled });
    vi.mocked(d.presign).mockImplementationOnce(async () => {
      cancelled = true;
      return {
        presignedUrl: "u",
        publicUrl: "p",
        posterPresignedUrl: null,
        posterPublicUrl: null,
      };
    });

    const result = await uploadFacilityVideo(original, d);

    expect(result).toEqual({ status: "cancelled" });
    expect(d.put).not.toHaveBeenCalled();
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it("포스터를 못 만들면 포스터 없이 올린다", async () => {
    const d = deps({ capturePoster: vi.fn(async () => null) });

    await uploadFacilityVideo(original, d);

    expect(d.presign).toHaveBeenCalledWith({
      contentType: "video/mp4",
      fileSize: 5,
    });
    expect(d.confirm).toHaveBeenCalledWith({
      videoUrl: "https://cdn.test/v.mp4",
    });
  });

  it("포스터 PUT이 실패하면 posterUrl 없이 확정한다", async () => {
    const d = deps();
    vi.mocked(d.put)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("업로드 실패"));

    const result = await uploadFacilityVideo(original, d);

    expect(result.status).toBe("uploaded");
    expect(d.confirm).toHaveBeenCalledWith({
      videoUrl: "https://cdn.test/v.mp4",
    });
  });

  it("결과가 상한을 넘으면 올리지 않는다", async () => {
    const d = deps({
      compress: vi.fn(async () => ({ size: MAX_VIDEO_BYTES + 1 }) as Blob),
    });

    const result = await uploadFacilityVideo(original, d);

    expect(result).toMatchObject({ status: "failed" });
    expect((result as { message: string }).message).toContain("최대 500MB");
    expect(d.presign).not.toHaveBeenCalled();
  });

  it("확정이 실패하면 그 문장으로 실패한다", async () => {
    const d = deps({
      confirm: vi.fn().mockRejectedValue(new Error("저장 실패: db")),
    });

    const result = await uploadFacilityVideo(original, d);

    expect(result).toEqual({ status: "failed", message: "저장 실패: db" });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/facilityVideoUpload.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/facilityVideoUpload.ts`:

```ts
import {
  MAX_VIDEO_LABEL,
  exceedsVideoLimit,
  formatExcessSize,
} from "@/lib/videoUpload";

export type UploadPhase =
  "loading" | "compressing" | "checking" | "preparing" | "uploading";

export interface PresignResult {
  presignedUrl: string;
  publicUrl: string;
  posterPresignedUrl: string | null;
  posterPublicUrl: string | null;
}

export interface FacilityVideoUploadDeps {
  compress: (
    file: File,
    onProgress: (progress: number) => void,
    onPhase: (phase: "loading" | "compressing") => void,
  ) => Promise<Blob>;
  isPlayable: (file: Blob) => Promise<boolean>;
  capturePoster: (video: Blob) => Promise<Blob | null>;
  presign: (request: {
    contentType: string;
    fileSize: number;
    posterSize?: number;
  }) => Promise<PresignResult>;
  put: (
    url: string,
    body: Blob,
    contentType: string,
    onProgress?: (progress: number) => void,
  ) => Promise<void>;
  confirm: (request: { videoUrl: string; posterUrl?: string }) => Promise<void>;
  isCancelled: () => boolean;
  onPhase: (phase: UploadPhase) => void;
  onProgress: (progress: number) => void;
}

export type FacilityVideoUploadResult =
  | { status: "uploaded"; videoUrl: string; usedOriginal: boolean }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

const CANCELLED = { status: "cancelled" } as const;

/** 순서와 예외 규칙: docs/specs/2026-10-07-sidepanel-media-loading-design.md 4.2–4.4 */
export async function uploadFacilityVideo(
  file: File,
  deps: FacilityVideoUploadDeps,
): Promise<FacilityVideoUploadResult> {
  let payload: Blob;
  let contentType: string;
  let usedOriginal = false;
  try {
    payload = await deps.compress(file, deps.onProgress, deps.onPhase);
    contentType = "video/mp4";
  } catch {
    if (deps.isCancelled()) return CANCELLED;
    deps.onPhase("checking");
    if (!(await deps.isPlayable(file))) {
      return {
        status: "failed",
        message:
          "이 영상은 브라우저에서 재생할 수 없고 변환도 실패했어요. H.264(mp4)로 저장해 다시 올려주세요",
      };
    }
    payload = file;
    contentType = file.type;
    usedOriginal = true;
  }
  if (deps.isCancelled()) return CANCELLED;

  if (exceedsVideoLimit(payload.size)) {
    return {
      status: "failed",
      message: `${usedOriginal ? "파일이" : "변환 결과가"} 너무 커요 (${formatExcessSize(payload.size)}) · 최대 ${MAX_VIDEO_LABEL}`,
    };
  }

  deps.onPhase("preparing");
  const poster = await deps.capturePoster(payload);
  if (deps.isCancelled()) return CANCELLED;

  try {
    const signed = await deps.presign({
      contentType,
      fileSize: payload.size,
      ...(poster ? { posterSize: poster.size } : {}),
    });
    if (deps.isCancelled()) return CANCELLED;

    deps.onPhase("uploading");
    deps.onProgress(0);
    await deps.put(signed.presignedUrl, payload, contentType, deps.onProgress);
    if (deps.isCancelled()) return CANCELLED;

    let posterUrl: string | undefined;
    if (poster && signed.posterPresignedUrl && signed.posterPublicUrl) {
      try {
        await deps.put(signed.posterPresignedUrl, poster, "image/jpeg");
        posterUrl = signed.posterPublicUrl;
      } catch {
        // 포스터 없이도 영상은 재생된다.
      }
      if (deps.isCancelled()) return CANCELLED;
    }

    await deps.confirm({
      videoUrl: signed.publicUrl,
      ...(posterUrl ? { posterUrl } : {}),
    });
    return { status: "uploaded", videoUrl: signed.publicUrl, usedOriginal };
  } catch (error) {
    if (deps.isCancelled()) return CANCELLED;
    return {
      status: "failed",
      message:
        error instanceof Error ? error.message : "네트워크 오류가 발생했어요",
    };
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/facilityVideoUpload.test.ts && npm run typecheck`
Expected: PASS (9개)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/facilityVideoUpload.ts src/lib/facilityVideoUpload.test.ts
git commit -m "feat(video): 업로드가 항상 변환을 시도하고 실패·취소·포스터를 한 순서로 다룬다"
```

---

### Task 12: 업로드 모달 연결, 문구, E2E

**Files:**

- Modify: `src/components/admin/FacilityVideoModal.tsx`
- Modify: `e2e/support/mockBackend.ts` (presign·confirm·delete 목업)
- Modify: `e2e/admin-content.spec.ts`
- Delete: `docs/TODO_list/video/cancel-during-prepare.md`

**Interfaces:**

- Consumes: `uploadFacilityVideo`, `PresignResult` (Task 11), `compressVideo`·`terminateFFmpeg` (Task 5), `captureVideoPoster` (Task 10), `isVideoPlayable` (기존)

- [ ] **Step 1: E2E 목업에 포스터를 싣는다**

`e2e/support/mockBackend.ts`의 세 핸들러를 바꾼다.

```ts
if (path === "/api/facility-video-presign") {
  const { posterSize } = route.request().postDataJSON() as {
    posterSize?: number;
  };
  const withPoster = posterSize !== undefined;
  return json(route, {
    presignedUrl: "https://upload.test/video",
    publicUrl: "https://cdn.test/video.mp4",
    posterPresignedUrl: withPoster ? "https://upload.test/poster" : null,
    posterPublicUrl: withPoster ? "https://cdn.test/video.jpg" : null,
  });
}
if (path === "/api/facility-video-confirm") {
  const { facilityId, videoUrl, posterUrl } = route
    .request()
    .postDataJSON() as {
    facilityId: string;
    videoUrl: string;
    posterUrl?: string;
  };
  const facility = state.facilities.find((row) => row.id === facilityId);
  if (facility) {
    facility.video_url = videoUrl;
    facility.video_poster_url = posterUrl ?? null;
  }
  return json(route, { ok: true });
}
if (path === "/api/delete-facility-video") {
  const { facilityId } = route.request().postDataJSON() as {
    facilityId: string;
  };
  const facility = state.facilities.find((row) => row.id === facilityId);
  if (facility) {
    facility.video_url = null;
    facility.video_poster_url = null;
  }
  return json(route, { ok: true });
}
```

- [ ] **Step 2: 실패하는 E2E**

`e2e/admin-content.spec.ts`의 `"시설 동영상을 업로드하고 캡션 저장 후 삭제한다"`에서 `setInputFiles(PLAYABLE_VIDEO)` 바로 앞에 안내 문구 확인을, 바로 뒤에 대체 경로 확인을 넣는다. 목업은 `unpkg.com`을 끊으므로 변환은 항상 실패하고 원본이 올라간다.

```ts
await expect(page.getByText("가로 영상을 추천드려요")).toBeVisible();
await page
  .locator('input[type="file"][accept^="video/"]')
  .setInputFiles(PLAYABLE_VIDEO);
await expect(
  page.getByText("용량을 줄이지 못해 원본을 올렸어요"),
).toBeVisible();
await expect(page.locator("video")).toBeVisible();
expect(
  state.facilities.find((facility) => facility.id === "f-installed")
    ?.video_poster_url,
).toBe("https://cdn.test/video.jpg");
```

파일 상단 주석(5–6줄)을 바꾼다.

```ts
// 목업이 unpkg(ffmpeg 코어)를 끊어 변환은 항상 실패한다. 재생 가능한 원본으로
// 대체되는 경로를 타려면 더미 바이트가 아닌 실제 H.264 파일이 필요하다.
```

같은 describe에 두 테스트를 추가한다.

```ts
test("변환 도구를 불러오는 중에 나가면 업로드 요청이 나가지 않는다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  let releaseCore = () => {};
  await page.route("https://unpkg.com/**", async (route) => {
    await new Promise<void>((resolve) => (releaseCore = resolve));
    await route.abort();
  });
  const uploadCalls: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/facility-video")) uploadCalls.push(pathname);
  });
  await page.goto("/admin/dashboard/facilities");
  const row = page.getByText("중앙광장 경사로").locator("xpath=../..");
  await row.getByRole("button", { name: "동영상" }).click();

  await page
    .locator('input[type="file"][accept^="video/"]')
    .setInputFiles(PLAYABLE_VIDEO);
  // 진행 영역과 업로드 버튼 라벨에 같은 문구가 두 번 나온다.
  await expect(
    page.getByText("변환 도구 불러오는 중...").first(),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "동영상 관리" })
    .getByRole("button", { name: "닫기" })
    .click();
  await page.getByRole("button", { name: "중단하고 나가기" }).click();
  await expect(page.getByText("동영상 관리")).toHaveCount(0);
  releaseCore();

  // 취소 플래그가 없으면 이 사이에 재생 검사를 거쳐 presign이 나간다.
  await page.waitForTimeout(1500);
  expect(uploadCalls).toEqual([]);
});

test("포스터 업로드가 실패하면 포스터 없이 저장한다", async ({ page }) => {
  const state = await installMockBackend(page, { authenticated: true });
  await page.route("https://upload.test/poster", (route) =>
    route.fulfill({
      status: 500,
      headers: { "access-control-allow-origin": "*" },
      body: "",
    }),
  );
  await page.goto("/admin/dashboard/facilities");
  const row = page.getByText("중앙광장 경사로").locator("xpath=../..");
  await row.getByRole("button", { name: "동영상" }).click();

  await page
    .locator('input[type="file"][accept^="video/"]')
    .setInputFiles(PLAYABLE_VIDEO);

  await expect(page.locator("video")).toBeVisible();
  const facility = state.facilities.find((item) => item.id === "f-installed");
  expect(facility?.video_url).toBe("https://cdn.test/video.mp4");
  expect(facility?.video_poster_url).toBeNull();
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx playwright test e2e/admin-content.spec.ts -g "동영상|변환 도구|포스터"`
Expected: FAIL — 안내 문구 없음, 경고 토스트 없음

- [ ] **Step 4: 모달 구현**

`src/components/admin/FacilityVideoModal.tsx`:

import를 바꾼다.

```ts
import { isVideoPlayable } from "@/lib/videoPlayback";
import { compressVideo, terminateFFmpeg } from "@/lib/compressVideo";
import { captureVideoPoster } from "@/lib/videoPoster";
import {
  type PresignResult,
  type UploadPhase,
  uploadFacilityVideo,
} from "@/lib/facilityVideoUpload";
import { MAX_VIDEO_LABEL } from "@/lib/videoUpload";
```

상태를 바꾼다.

```ts
const [phase, setPhase] = useState<UploadPhase | null>(null);
```

`xhrRef` 아래에 추가한다.

```ts
const cancelledRef = useRef(false);
```

`handleForceClose`를 바꾼다.

```ts
async function handleForceClose() {
  cancelledRef.current = true;
  xhrRef.current?.abort();
  onUpdate();
  onClose();
}
```

`handleUpload` 전체를 다음 두 함수로 바꾼다.

```ts
function putWithXhr(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    if (onProgress) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable)
          onProgress(Math.round((ev.loaded / ev.total) * 100));
      };
    }
    xhr.onload = () =>
      xhr.status === 200 ? resolve() : reject(new Error("업로드 실패"));
    xhr.onerror = () => reject(new Error("네트워크 오류가 발생했어요"));
    xhr.onabort = () => reject(new Error("업로드 취소됨"));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(body);
  });
}

async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  cancelledRef.current = false;
  setPhase("compressing");
  setProgress(0);

  try {
    const result = await uploadFacilityVideo(file, {
      compress: compressVideo,
      isPlayable: (blob) => isVideoPlayable(blob),
      capturePoster: (blob) => captureVideoPoster(blob),
      presign: async (body): Promise<PresignResult> => {
        const res = await authedFetch("/api/facility-video-presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ facilityId: facility.id, ...body }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(`준비 실패: ${data.error}`);
        return data;
      },
      put: putWithXhr,
      confirm: async (body) => {
        const res = await authedFetch("/api/facility-video-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ facilityId: facility.id, ...body }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(`저장 실패: ${data.error}`);
      },
      isCancelled: () => cancelledRef.current,
      onPhase: setPhase,
      onProgress: setProgress,
    });

    if (result.status === "uploaded") {
      setCurrentVideoUrl(result.videoUrl);
      if (result.usedOriginal)
        showToast("용량을 줄이지 못해 원본을 올렸어요", "warning");
      else showToast("동영상이 업로드됐어요!");
      onUpdate();
    } else if (result.status === "failed") {
      showToast(result.message, "error");
    }
  } finally {
    setPhase(null);
    setProgress(0);
    e.target.value = "";
  }
}
```

`phaseLabel`의 `compressing` 문구를 바꾼다.

```ts
        : phase === "compressing"
          ? `용량을 줄이는 중... ${progress}%`
```

모달 본문에서 `{currentVideoUrl ? ( ... ) : ( ... )}` 블록 바로 뒤(본문 `div` 안)에 추가한다.

```tsx
<p style={{ margin: "8px 0 0", fontSize: 12, color: "#6b7280" }}>
  가로 영상을 추천드려요
</p>
```

- [ ] **Step 5: 해소된 TODO를 지운다**

결론은 설계 4.3에 있다(`docs/TODO_list/README.md` 규칙 4).

```bash
git rm docs/TODO_list/video/cancel-during-prepare.md
```

- [ ] **Step 6: 통과 확인**

Run: `npm run typecheck && npm run lint && npx playwright test e2e/admin-content.spec.ts e2e/admin-building-video.spec.ts`
Expected: 모두 PASS. `video_poster_url`이 `null`로 나와 첫 테스트만 실패하면, `e2e/fixtures/tiny-h264.mp4`(1,454바이트)에서 포스터 캡처가 `null`을 낸 것이다. 픽스처의 길이·프레임 수부터 확인하고(`ffprobe`는 Task 15에서 설치), 필요하면 1초짜리 H.264 픽스처로 바꾼다. 캡처 코드를 픽스처에 맞추지 않는다.

- [ ] **Step 7: 커밋**

```bash
git add src/components/admin/FacilityVideoModal.tsx e2e/support/mockBackend.ts e2e/admin-content.spec.ts
git commit -m "feat(video): 업로드 모달이 항상 용량을 줄여 올리고 취소하면 요청을 멈춘다"
```

---

### Task 13: 공개 패널은 재생을 누를 때 영상을 받는다

**Files:**

- Modify: `src/components/sidepanel/FacilityList.tsx:117-131`
- Modify: `e2e/public-map-p1-remainder.spec.ts` (`P1-06` 테스트)

- [ ] **Step 1: 실패하는 E2E**

`P1-06` 테스트의 주입 행에 `video_poster_url: "https://cdn.test/video.jpg",`를 `video_url` 아래에 넣는다. `installMockBackend(page)` 바로 아래에 요청 기록을 넣는다.

```ts
const videoRequests: string[] = [];
const posterRequests: string[] = [];
page.on("request", (request) => {
  if (request.url() === "https://cdn.test/video.mp4")
    videoRequests.push(request.url());
  if (request.url() === "https://cdn.test/video.jpg")
    posterRequests.push(request.url());
});
```

기존 자막 확인 뒤에 추가한다.

```ts
await expect(video).toHaveAttribute("preload", "none");
await expect(video).toHaveAttribute("poster", "https://cdn.test/video.jpg");
await expect.poll(() => posterRequests.length).toBeGreaterThan(0);
expect(videoRequests).toHaveLength(0);

await video.evaluate((element: HTMLVideoElement) => {
  element.muted = true;
  void element.play().catch(() => {});
});
await expect.poll(() => videoRequests.length).toBeGreaterThan(0);
```

같은 describe에 포스터가 없는 경우를 추가한다. 위 테스트의 `page.route` 블록을 그대로 쓰되 행에서 `video_poster_url: null`로 둔다.

```ts
test("P1-06 포스터가 없으면 poster 속성을 두지 않는다", async ({ page }) => {
  await installMockBackend(page);
  await page.route("**/rest/v1/building_facilities*", async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      url.searchParams.get("building_id") !== "eq.1"
    ) {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: JSON_HEADERS,
      body: JSON.stringify([
        {
          id: "f-building",
          building_id: 1,
          facility_code: "elevator",
          name: "중앙 엘리베이터",
          is_installed: true,
          video_url: "https://cdn.test/video.mp4",
          video_poster_url: null,
          facility_types: { code: "elevator", label: "엘리베이터" },
        },
      ]),
    });
  });
  await page.goto("/");
  await openLibraryPanel(page);

  const video = page.locator(".ku-facility-video video");
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).not.toHaveAttribute("poster");
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test e2e/public-map-p1-remainder.spec.ts -g "P1-06"`
Expected: FAIL — `preload` 속성 없음

- [ ] **Step 3: 구현**

`src/components/sidepanel/FacilityList.tsx`의 `<video>`:

```tsx
                      <video
                        src={facility.video_url}
                        poster={facility.video_poster_url ?? undefined}
                        preload="none"
                        controls
                        playsInline
```

- [ ] **Step 4: 통과 확인**

Run: `npx playwright test e2e/public-map-p1-remainder.spec.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/sidepanel/FacilityList.tsx e2e/public-map-p1-remainder.spec.ts
git commit -m "feat(map): 사이드패널 영상은 포스터만 보이고 재생할 때 받는다"
```

---

### Task 14: journal과 기존 사진 일괄 변환 스크립트

**Files:**

- Create: `src/scripts/lib/mediaJournal.ts`, `src/scripts/lib/mediaJournal.test.ts`
- Create: `src/scripts/convertBuildingPhotosToWebP.ts`
- Modify: `package.json`, `package-lock.json` (`sharp` devDependency)
- Modify: `tsconfig.json` (`allowImportingTsExtensions`)
- Modify: `.gitignore` (`/.media-migration/`)

**Interfaces:**

- Consumes: `isWebP`, `WEBP_SNIFF_BYTES` (Task 2), `BUILDING_PHOTO_*`, `buildingPhotoPath`, `buildingPhotoPathFromUrl` (Task 3)
- Produces (`mediaJournal.ts`):

```ts
export type JournalStatus = "uploaded" | "updated" | "discarded" | "purged";
export interface JournalEntry {
  id: string;
  status: JournalStatus;
  oldKeys: string[];
  newKeys: string[];
  at: string;
}
export function parseJournal(text: string): Map<string, JournalEntry>; // 같은 (id, newKeys)는 마지막 줄이 이긴다
export function readJournal(path: string): Map<string, JournalEntry>;
export function appendJournal(
  path: string,
  entry: Omit<JournalEntry, "at">,
): void;
export function pendingUploads(entries: Iterable<JournalEntry>): JournalEntry[];
export function resolvePending(
  entry: JournalEntry,
  referenced: Set<string>,
): "updated" | "discarded";
export function purgeCandidates(
  entries: Iterable<JournalEntry>,
  referenced: Set<string>,
): JournalEntry[];
```

- [ ] **Step 1: 설정**

```bash
npm install -D sharp@0.34.5
```

`tsconfig.json` `compilerOptions`에 `"allowImportingTsExtensions": true,`를 `"noEmit": true,` 아래에 넣는다.

`.gitignore` 끝에 추가한다.

```gitignore

# 일괄 변환 스크립트 journal (설계 2026-10-07 6.2)
/.media-migration/
```

- [ ] **Step 2: 실패하는 journal 테스트**

`src/scripts/lib/mediaJournal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  type JournalEntry,
  parseJournal,
  pendingUploads,
  purgeCandidates,
  resolvePending,
} from "./mediaJournal";

const line = (entry: Omit<JournalEntry, "at">) =>
  JSON.stringify({ ...entry, at: "2026-10-07T00:00:00Z" });

describe("parseJournal", () => {
  it("같은 항목은 마지막 상태가 이긴다", () => {
    const text = [
      line({ id: "7", status: "uploaded", oldKeys: ["a"], newKeys: ["b"] }),
      line({ id: "7", status: "updated", oldKeys: ["a"], newKeys: ["b"] }),
      "",
    ].join("\n");

    const entries = [...parseJournal(text).values()];

    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("updated");
  });
});

describe("pendingUploads / resolvePending", () => {
  const pending: JournalEntry = {
    id: "7",
    status: "uploaded",
    oldKeys: ["a"],
    newKeys: ["b", "b.jpg"],
    at: "",
  };

  it("uploaded에 머문 항목만 고른다", () => {
    expect(
      pendingUploads([pending, { ...pending, id: "8", status: "updated" }]),
    ).toEqual([pending]);
  });

  it("DB가 새 키를 모두 가리키면 updated, 아니면 discarded", () => {
    expect(resolvePending(pending, new Set(["b", "b.jpg"]))).toBe("updated");
    expect(resolvePending(pending, new Set(["b"]))).toBe("discarded");
    expect(resolvePending(pending, new Set(["a"]))).toBe("discarded");
  });
});

describe("purgeCandidates", () => {
  const updated: JournalEntry = {
    id: "7",
    status: "updated",
    oldKeys: ["a", "a.jpg"],
    newKeys: ["b"],
    at: "",
  };

  it("DB가 더 이상 참조하지 않는 옛 키만 지운다", () => {
    expect(purgeCandidates([updated], new Set(["b"]))).toEqual([updated]);
    expect(purgeCandidates([updated], new Set(["a"]))).toEqual([]);
  });

  it("updated가 아니거나 지울 키가 없으면 고르지 않는다", () => {
    expect(
      purgeCandidates([{ ...updated, status: "purged" }], new Set()),
    ).toEqual([]);
    expect(purgeCandidates([{ ...updated, oldKeys: [] }], new Set())).toEqual(
      [],
    );
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/scripts/lib/mediaJournal.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: journal 구현**

`src/scripts/lib/mediaJournal.ts`:

```ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/** 규칙: docs/specs/2026-10-07-sidepanel-media-loading-design.md 6.2 */
export type JournalStatus = "uploaded" | "updated" | "discarded" | "purged";

export interface JournalEntry {
  id: string;
  status: JournalStatus;
  oldKeys: string[];
  newKeys: string[];
  at: string;
}

function entryKey(entry: Pick<JournalEntry, "id" | "newKeys">): string {
  return `${entry.id}:${entry.newKeys.join(",")}`;
}

export function parseJournal(text: string): Map<string, JournalEntry> {
  const latest = new Map<string, JournalEntry>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as JournalEntry;
    latest.set(entryKey(entry), entry);
  }
  return latest;
}

export function readJournal(path: string): Map<string, JournalEntry> {
  return existsSync(path)
    ? parseJournal(readFileSync(path, "utf8"))
    : new Map();
}

export function appendJournal(
  path: string,
  entry: Omit<JournalEntry, "at">,
): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(
    path,
    JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n",
  );
}

export function pendingUploads(
  entries: Iterable<JournalEntry>,
): JournalEntry[] {
  return [...entries].filter((entry) => entry.status === "uploaded");
}

export function resolvePending(
  entry: JournalEntry,
  referenced: Set<string>,
): "updated" | "discarded" {
  return entry.newKeys.every((key) => referenced.has(key))
    ? "updated"
    : "discarded";
}

export function purgeCandidates(
  entries: Iterable<JournalEntry>,
  referenced: Set<string>,
): JournalEntry[] {
  return [...entries].filter(
    (entry) =>
      entry.status === "updated" &&
      entry.oldKeys.length > 0 &&
      entry.oldKeys.every((key) => !referenced.has(key)),
  );
}
```

- [ ] **Step 5: journal 테스트 통과**

Run: `npx vitest run src/scripts/lib/mediaJournal.test.ts`
Expected: PASS (6개)

- [ ] **Step 6: 사진 스크립트**

`src/scripts/convertBuildingPhotosToWebP.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  BUILDING_PHOTO_BUCKET,
  BUILDING_PHOTO_CACHE_CONTROL,
  buildingPhotoPath,
  buildingPhotoPathFromUrl,
} from "../lib/buildingPhotos.ts";
import { isWebP, WEBP_SNIFF_BYTES } from "../lib/webpBytes.ts";
import {
  appendJournal,
  pendingUploads,
  purgeCandidates,
  readJournal,
  resolvePending,
} from "./lib/mediaJournal.ts";

// 실행: node --env-file=.env.local src/scripts/convertBuildingPhotosToWebP.ts [--purge]
// 기본은 읽기만 한다. 실제로 쓰려면 DRY_RUN=0. 설계 2026-10-07 2.3·6.2.
const DRY_RUN = process.env.DRY_RUN !== "0";
const PURGE = process.argv.includes("--purge");
const JOURNAL = ".media-migration/building-photos.jsonl";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const bucket = supabase.storage.from(BUILDING_PHOTO_BUCKET);

type PhotoRow = { id: number; building_id: number; url: string };

const kb = (bytes: number) => `${Math.round(bytes / 1024)}KB`;

async function readHead(url: string) {
  const res = await fetch(url, {
    headers: { Range: `bytes=0-${WEBP_SNIFF_BYTES - 1}` },
  });
  const head = new Uint8Array(await res.arrayBuffer());
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  return { head, total: Number.isFinite(total) ? total : head.length };
}

async function referencedPaths(): Promise<Set<string>> {
  const { data, error } = await supabase.from("building_photos").select("url");
  if (error) throw error;
  return new Set(
    (data ?? [])
      .map((row) => buildingPhotoPathFromUrl(row.url))
      .filter((path): path is string => path !== null),
  );
}

async function reconcilePending() {
  const pending = pendingUploads(readJournal(JOURNAL).values());
  if (pending.length === 0) return;
  const referenced = await referencedPaths();
  for (const entry of pending) {
    const outcome = resolvePending(entry, referenced);
    console.log(`[정리] ${entry.id} ${entry.newKeys.join(",")} → ${outcome}`);
    if (DRY_RUN) continue;
    if (outcome === "discarded") await bucket.remove(entry.newKeys);
    appendJournal(JOURNAL, { ...entry, status: outcome });
  }
}

async function purge() {
  const candidates = purgeCandidates(
    readJournal(JOURNAL).values(),
    await referencedPaths(),
  );
  for (const entry of candidates) {
    console.log(`[purge] ${entry.id} ${entry.oldKeys.join(",")}`);
    if (DRY_RUN) continue;
    const { error } = await bucket.remove(entry.oldKeys);
    if (error) console.error(`[purge 실패] ${entry.id}`, error);
    else appendJournal(JOURNAL, { ...entry, status: "purged" });
  }
  console.log(
    `purge 대상 ${candidates.length}건${DRY_RUN ? " (DRY_RUN)" : ""}`,
  );
}

async function convert() {
  const { data, error } = await supabase
    .from("building_photos")
    .select("id, building_id, url")
    .order("id");
  if (error) throw error;
  let targets = 0;
  for (const row of (data ?? []) as PhotoRow[]) {
    const { head, total } = await readHead(row.url);
    if (isWebP(head, total)) continue;
    targets++;
    if (DRY_RUN) {
      console.log(`[대상] ${row.id} ${kb(total)} ${row.url}`);
      continue;
    }
    const original = Buffer.from(await (await fetch(row.url)).arrayBuffer());
    const webp = await sharp(original)
      .resize({
        width: 1920,
        height: 1920,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toBuffer();
    const oldPath = buildingPhotoPathFromUrl(row.url);
    const newPath = buildingPhotoPath(
      row.building_id,
      Date.now(),
      Math.random().toString(36).slice(2),
    );
    const { error: uploadError } = await bucket.upload(newPath, webp, {
      contentType: "image/webp",
      cacheControl: BUILDING_PHOTO_CACHE_CONTROL,
    });
    if (uploadError) {
      console.error(`[업로드 실패] ${row.id}`, uploadError);
      continue;
    }
    const entry = {
      id: String(row.id),
      oldKeys: oldPath ? [oldPath] : [],
      newKeys: [newPath],
    };
    appendJournal(JOURNAL, { ...entry, status: "uploaded" });
    const newUrl = `${bucket.getPublicUrl(newPath).data.publicUrl}?t=${Date.now()}`;
    const { data: updated } = await supabase
      .from("building_photos")
      .update({ url: newUrl })
      .eq("id", row.id)
      .eq("url", row.url)
      .select("id")
      .maybeSingle();
    if (updated) {
      appendJournal(JOURNAL, { ...entry, status: "updated" });
      console.log(`${row.id}: ${kb(total)} → ${kb(webp.length)}`);
    } else {
      await bucket.remove([newPath]);
      appendJournal(JOURNAL, { ...entry, status: "discarded" });
      console.log(`${row.id}: 그 사이 바뀌어 건너뜀`);
    }
  }
  console.log(
    `대상 ${targets}건${DRY_RUN ? " (DRY_RUN — DRY_RUN=0으로 실행해야 쓴다)" : ""}`,
  );
}

await reconcilePending();
await (PURGE ? purge() : convert());
```

- [ ] **Step 7: 정적 검사와 읽기 전용 실행**

Run: `npm run typecheck && npm run lint && node --env-file=.env.local src/scripts/convertBuildingPhotosToWebP.ts`
Expected: 타입·린트 통과. 실행은 `[대상]` 줄을 찍고 마지막에 `대상 63건 (DRY_RUN ...)`(2026-10-07 실측 기준. 그 사이 사진이 바뀌었으면 다를 수 있다). `MODULE_TYPELESS_PACKAGE_JSON` 경고는 예상된 것이다.

- [ ] **Step 8: 커밋**

```bash
npx prettier --write src/scripts tsconfig.json .gitignore
git add package.json package-lock.json tsconfig.json .gitignore src/scripts/lib/mediaJournal.ts src/scripts/lib/mediaJournal.test.ts src/scripts/convertBuildingPhotosToWebP.ts
git commit -m "feat(scripts): 이름만 webp인 기존 PNG 사진을 WebP로 바꾸는 스크립트를 추가한다"
```

---

### Task 15: ffmpeg 설치와 기존 영상 일괄 변환 스크립트

**Files:**

- Create: `src/scripts/lib/videoTarget.ts`, `src/scripts/lib/videoTarget.test.ts`
- Create: `src/scripts/transcodeFacilityVideos.ts`

**Interfaces:**

- Consumes: `transcodeArgs`, `posterArgs`, `posterSeekTime`, `VIDEO_MAX_EDGE` (Task 5), `facilityVideoKey`, `facilityVideoPosterKey` (Task 6, 기존), `r2`·`R2_BUCKET`·`getPublicR2Url`·`getR2KeyFromPublicUrl` (`src/lib/r2.ts`, `@aws-sdk/client-s3`만 import), journal (Task 14)
- Produces (`videoTarget.ts`):

```ts
export interface VideoProbe {
  codec: string;
  pixFmt: string;
  width: number;
  height: number;
  duration: number;
  moovBeforeMdat: boolean;
}
export type VideoAction = "transcode" | "poster" | "skip";
export function moovBeforeMdat(atomTypes: string[]): boolean;
export function classifyVideo(
  probe: VideoProbe,
  hasPoster: boolean,
  maxEdge: number,
): VideoAction;
```

- [ ] **Step 1: ffmpeg 설치 (사용자가 2026-10-07 승인: winget, C:)**

```powershell
winget install --id Gyan.FFmpeg.Essentials -e --accept-source-agreements --accept-package-agreements
```

새 셸을 열지 않아도 쓰도록 경로를 찾아 둔다.

```bash
ls ~/AppData/Local/Microsoft/WinGet/Links/ | grep -E "ffmpeg|ffprobe"
```

Expected: `ffmpeg.exe`, `ffprobe.exe`. 이후 명령은 `FFMPEG_PATH`·`FFPROBE_PATH`에 그 전체 경로를 넣어 실행한다. C: 여유가 300MB 아래로 떨어지면 멈추고 사용자에게 알린다(`df -h /c`).

- [ ] **Step 2: 스케일 식을 실제 ffmpeg로 확인**

Run(`F`·`P`는 위 경로):

```bash
for size in 1920x1080 1080x1920 640x360 1079x1919; do
  "$F" -v error -y -f lavfi -i "testsrc=size=$size:duration=1" \
    -vf "scale='if(gte(iw,ih),trunc(min(1280,iw)/2)*2,-2)':'if(gte(iw,ih),-2,trunc(min(1280,ih)/2)*2)'" \
    -c:v libx264 -pix_fmt yuv420p "$TMP/scale-$size.mp4" &&
  "$P" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$TMP/scale-$size.mp4"
done
```

Expected: `1280,720` / `720,1280` / `640,360` / `1078,1918`. 다르면 `videoTranscode.ts`의 식과 Task 5 테스트를 고치고 다시 확인한다.

- [ ] **Step 3: 실패하는 분류 테스트**

`src/scripts/lib/videoTarget.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type VideoProbe, classifyVideo, moovBeforeMdat } from "./videoTarget";

const compliant: VideoProbe = {
  codec: "h264",
  pixFmt: "yuv420p",
  width: 720,
  height: 1280,
  duration: 8,
  moovBeforeMdat: true,
};

describe("moovBeforeMdat", () => {
  it.each([
    [["ftyp", "moov", "mdat"], true],
    [["ftyp", "wide", "mdat", "moov"], false],
    [["ftyp", "mdat"], false],
  ])("%j → %s", (atoms, expected) => {
    expect(moovBeforeMdat(atoms)).toBe(expected);
  });
});

describe("classifyVideo", () => {
  it("기준을 충족하고 포스터가 있으면 건너뛴다", () => {
    expect(classifyVideo(compliant, true, 1280)).toBe("skip");
  });

  it("기준을 충족하고 포스터가 없으면 포스터만 만든다", () => {
    expect(classifyVideo(compliant, false, 1280)).toBe("poster");
  });

  it.each([
    { codec: "hevc" },
    { pixFmt: "yuv420p10le" },
    { width: 1080, height: 1920 },
    { moovBeforeMdat: false },
  ])("%j이면 포스터가 있어도 변환한다", (change) => {
    expect(classifyVideo({ ...compliant, ...change }, true, 1280)).toBe(
      "transcode",
    );
  });
});
```

- [ ] **Step 4: 실패 확인**

Run: `npx vitest run src/scripts/lib/videoTarget.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 5: 분류 구현**

`src/scripts/lib/videoTarget.ts`:

```ts
/** 판정 기준: docs/specs/2026-10-07-sidepanel-media-loading-design.md 6.1 */
export interface VideoProbe {
  codec: string;
  pixFmt: string;
  width: number;
  height: number;
  duration: number;
  moovBeforeMdat: boolean;
}

export type VideoAction = "transcode" | "poster" | "skip";

export function moovBeforeMdat(atomTypes: string[]): boolean {
  const moov = atomTypes.indexOf("moov");
  const mdat = atomTypes.indexOf("mdat");
  return moov !== -1 && (mdat === -1 || moov < mdat);
}

export function classifyVideo(
  probe: VideoProbe,
  hasPoster: boolean,
  maxEdge: number,
): VideoAction {
  const meetsTarget =
    probe.codec === "h264" &&
    probe.pixFmt === "yuv420p" &&
    Math.max(probe.width, probe.height) <= maxEdge &&
    probe.moovBeforeMdat;
  if (!meetsTarget) return "transcode";
  return hasPoster ? "skip" : "poster";
}
```

- [ ] **Step 6: 분류 테스트 통과**

Run: `npx vitest run src/scripts/lib/videoTarget.test.ts`
Expected: PASS (9개)

- [ ] **Step 7: 영상 스크립트**

`src/scripts/transcodeFacilityVideos.ts`:

```ts
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import {
  r2,
  R2_BUCKET,
  getPublicR2Url,
  getR2KeyFromPublicUrl,
} from "../lib/r2.ts";
import {
  VIDEO_MAX_EDGE,
  posterArgs,
  posterSeekTime,
  transcodeArgs,
} from "../lib/videoTranscode.ts";
import {
  facilityVideoKey,
  facilityVideoPosterKey,
} from "../lib/videoUpload.ts";
import {
  appendJournal,
  pendingUploads,
  purgeCandidates,
  readJournal,
  resolvePending,
} from "./lib/mediaJournal.ts";
import {
  type VideoAction,
  type VideoProbe,
  classifyVideo,
  moovBeforeMdat,
} from "./lib/videoTarget.ts";

// 실행: FFMPEG_PATH=... FFPROBE_PATH=... node --env-file=.env.local src/scripts/transcodeFacilityVideos.ts [--purge]
// 기본은 읽기만 한다. 실제로 쓰려면 DRY_RUN=0. 설계 2026-10-07 6장.
const DRY_RUN = process.env.DRY_RUN !== "0";
const PURGE = process.argv.includes("--purge");
const JOURNAL = ".media-migration/facility-videos.jsonl";
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type VideoRow = {
  id: string;
  video_url: string;
  video_poster_url: string | null;
};

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)}MB`;

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on(
      "data",
      (chunk) => (stderr = (stderr + chunk).slice(-2000)),
    );
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${command} exited ${code}: ${stderr}`)),
    );
  });
}

async function topLevelAtoms(url: string, total: number): Promise<string[]> {
  const types: string[] = [];
  let offset = 0;
  while (offset < total && types.length < 32) {
    const res = await fetch(url, {
      headers: { Range: `bytes=${offset}-${offset + 15}` },
    });
    const view = new DataView(await res.arrayBuffer());
    let size = view.getUint32(0);
    const type = String.fromCharCode(
      view.getUint8(4),
      view.getUint8(5),
      view.getUint8(6),
      view.getUint8(7),
    );
    if (size === 1) size = Number(view.getBigUint64(8));
    if (size === 0) size = total - offset;
    types.push(type);
    offset += size;
  }
  return types;
}

async function contentLength(url: string): Promise<number> {
  const res = await fetch(url, { method: "HEAD" });
  return Number(res.headers.get("content-length"));
}

async function probe(input: string, atoms: string[]): Promise<VideoProbe> {
  const out = await run(FFPROBE, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,pix_fmt,width,height:format=duration",
    "-of",
    "json",
    input,
  ]);
  const json = JSON.parse(out) as {
    streams: {
      codec_name: string;
      pix_fmt: string;
      width: number;
      height: number;
    }[];
    format: { duration?: string };
  };
  const stream = json.streams[0];
  return {
    codec: stream.codec_name,
    pixFmt: stream.pix_fmt,
    width: stream.width,
    height: stream.height,
    duration: Number(json.format.duration),
    moovBeforeMdat: moovBeforeMdat(atoms),
  };
}

async function download(url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download ${res.status} ${url}`);
  await pipeline(
    Readable.fromWeb(res.body as WebReadableStream),
    createWriteStream(path),
  );
}

async function putObject(key: string, path: string, contentType: string) {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: await readFile(path),
      ContentType: contentType,
    }),
  );
}

async function deleteObjects(keys: string[]) {
  for (const key of keys)
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

function rowKeys(row: {
  video_url: string | null;
  video_poster_url: string | null;
}) {
  return [row.video_url, row.video_poster_url]
    .map((url) => (url ? getR2KeyFromPublicUrl(url) : null))
    .filter((key): key is string => key !== null);
}

async function referencedKeys(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("building_facilities")
    .select("video_url, video_poster_url");
  if (error) throw error;
  return new Set((data ?? []).flatMap(rowKeys));
}

async function reconcilePending() {
  const pending = pendingUploads(readJournal(JOURNAL).values());
  if (pending.length === 0) return;
  const referenced = await referencedKeys();
  for (const entry of pending) {
    const outcome = resolvePending(entry, referenced);
    console.log(`[정리] ${entry.id} ${entry.newKeys.join(",")} → ${outcome}`);
    if (DRY_RUN) continue;
    if (outcome === "discarded") await deleteObjects(entry.newKeys);
    appendJournal(JOURNAL, { ...entry, status: outcome });
  }
}

async function purge() {
  const candidates = purgeCandidates(
    readJournal(JOURNAL).values(),
    await referencedKeys(),
  );
  for (const entry of candidates) {
    console.log(`[purge] ${entry.id} ${entry.oldKeys.join(",")}`);
    if (DRY_RUN) continue;
    await deleteObjects(entry.oldKeys);
    appendJournal(JOURNAL, { ...entry, status: "purged" });
  }
  console.log(
    `purge 대상 ${candidates.length}건${DRY_RUN ? " (DRY_RUN)" : ""}`,
  );
}

async function processRow(row: VideoRow, action: VideoAction, size: number) {
  const currentKey = getR2KeyFromPublicUrl(row.video_url);
  if (!currentKey) throw new Error(`R2 키가 아님: ${row.video_url}`);
  const tempDir = await mkdtemp(join(tmpdir(), "ku-video-"));
  try {
    const input = join(tempDir, "input");
    const output = join(tempDir, "output.mp4");
    const poster = join(tempDir, "poster.jpg");
    await download(row.video_url, input);

    let newVideoKey: string | null = null;
    let posterSource = input;
    if (action === "transcode") {
      await run(FFMPEG, [
        "-v",
        "error",
        "-y",
        ...transcodeArgs(input, output, "medium"),
      ]);
      newVideoKey = facilityVideoKey(row.id, "mp4", Date.now());
      posterSource = output;
    }
    const { duration } = await probe(posterSource, ["moov"]);
    await run(FFMPEG, [
      "-v",
      "error",
      "-y",
      ...posterArgs(posterSource, poster, posterSeekTime(duration)),
    ]);
    const newPosterKey = facilityVideoPosterKey(newVideoKey ?? currentKey);

    const newKeys = newVideoKey ? [newVideoKey, newPosterKey] : [newPosterKey];
    if (newVideoKey) await putObject(newVideoKey, output, "video/mp4");
    try {
      await putObject(newPosterKey, poster, "image/jpeg");
    } catch (error) {
      if (newVideoKey) await deleteObjects([newVideoKey]);
      throw error;
    }

    const oldKeys = newVideoKey ? rowKeys(row) : [];
    const entry = { id: row.id, oldKeys, newKeys };
    appendJournal(JOURNAL, { ...entry, status: "uploaded" });

    let update = supabase
      .from("building_facilities")
      .update({
        video_url: newVideoKey ? getPublicR2Url(newVideoKey) : row.video_url,
        video_poster_url: getPublicR2Url(newPosterKey),
      })
      .eq("id", row.id)
      .eq("video_url", row.video_url);
    update =
      row.video_poster_url === null
        ? update.is("video_poster_url", null)
        : update.eq("video_poster_url", row.video_poster_url);
    const { data: updated } = await update.select("id").maybeSingle();

    if (updated) {
      appendJournal(JOURNAL, { ...entry, status: "updated" });
      const after = newVideoKey ? (await stat(output)).size : size;
      console.log(`${row.id} ${action}: ${mb(size)} → ${mb(after)}`);
    } else {
      await deleteObjects(newKeys);
      appendJournal(JOURNAL, { ...entry, status: "discarded" });
      console.log(`${row.id}: 그 사이 바뀌어 건너뜀`);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function convert() {
  const { data, error } = await supabase
    .from("building_facilities")
    .select("id, video_url, video_poster_url")
    .not("video_url", "is", null)
    .order("id");
  if (error) throw error;
  const counts: Record<VideoAction, number> = {
    transcode: 0,
    poster: 0,
    skip: 0,
  };
  for (const row of (data ?? []) as VideoRow[]) {
    const size = await contentLength(row.video_url);
    const meta = await probe(
      row.video_url,
      await topLevelAtoms(row.video_url, size),
    );
    const action = classifyVideo(
      meta,
      row.video_poster_url !== null,
      VIDEO_MAX_EDGE,
    );
    counts[action]++;
    console.log(
      `[${action}] ${row.id} ${mb(size)} ${meta.codec}/${meta.pixFmt} ${meta.width}x${meta.height} moov앞=${meta.moovBeforeMdat}`,
    );
    if (DRY_RUN || action === "skip") continue;
    try {
      await processRow(row, action, size);
    } catch (error) {
      console.error(`[실패] ${row.id}`, error);
    }
  }
  console.log(
    `변환 ${counts.transcode} · 포스터만 ${counts.poster} · 건너뜀 ${counts.skip}${DRY_RUN ? " (DRY_RUN — DRY_RUN=0으로 실행해야 쓴다)" : ""}`,
  );
}

await reconcilePending();
await (PURGE ? purge() : convert());
```

`probe(output)`의 두 번째 인자 `["moov"]`는 duration만 쓰기 위한 값이다(변환 결과는 faststart).

- [ ] **Step 8: 정적 검사와 읽기 전용 실행**

Run: `npm run typecheck && npm run lint && FFMPEG_PATH="$F" FFPROBE_PATH="$P" node --env-file=.env.local src/scripts/transcodeFacilityVideos.ts`
Expected: 행마다 `[transcode]`·`[poster]`·`[skip]` 줄, 마지막 줄 합계가 59건(2026-10-07 기준). HEVC 2개와 moov가 끝에 있는 58개는 `transcode`로 나와야 한다. 다르면 분류 기준이 아니라 probe 값을 먼저 의심한다.

- [ ] **Step 9: 변환 결과 크기 확인 (운영에 쓰지 않음)**

DRY_RUN 출력에서 가장 큰 영상 하나의 URL을 골라 로컬에서만 변환해 본다.

인자는 `transcodeArgs(input, output, "medium")`의 배열과 같다.

```bash
curl -s -o "$TMP/sample.mov" "<URL>"
"$F" -v error -y -i "$TMP/sample.mov" \
  -vf "scale='if(gte(iw,ih),trunc(min(1280,iw)/2)*2,-2)':'if(gte(iw,ih),-2,trunc(min(1280,ih)/2)*2)'" \
  -c:v libx264 -preset medium -crf 28 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart "$TMP/sample.mp4"
"$P" -v error -show_entries format=size,bit_rate,duration:stream=codec_name,width,height,pix_fmt -of compact "$TMP/sample.mp4"
rm "$TMP/sample.mov" "$TMP/sample.mp4"
```

원본과 결과의 크기·비트레이트·해상도를 Step 10 커밋 메시지 본문에 남긴다.

- [ ] **Step 10: 커밋**

```bash
npx prettier --write src/scripts
git add src/scripts/lib/videoTarget.ts src/scripts/lib/videoTarget.test.ts src/scripts/transcodeFacilityVideos.ts
git commit -m "feat(scripts): 기존 시설 영상을 파일 내용으로 판정해 720p로 바꾸고 포스터를 만드는 스크립트를 추가한다"
```

---

### Task 16: README와 참조 역추적

**Files:**

- Modify: `README.md`

- [ ] **Step 1: README를 고친다**

| 줄(2026-10-07 기준)                 | 바꿀 내용                                                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 67 사진 업로드                      | "브라우저에서 크기를 줄여 WebP로 변환(Safari는 wasm 인코더)한 뒤 올리고, 서버는 내용이 WebP인 것만 받으며…"                                                                   |
| 68 건물 동영상 섹션                 | "업로드마다 긴 변 1280·H.264·faststart로 용량을 줄이고(실패하면 재생 가능한 원본), 포스터를 함께 저장"                                                                        |
| 102 영상 처리                       | `ffmpeg.wasm (모든 업로드를 720p H.264로 변환, 실패 시 원본)`                                                                                                                 |
| 197 `BuildingPhotoManager.tsx` 주석 | `(WebP 변환 · 실패만 재시도)` 유지                                                                                                                                            |
| 229–232 `src/lib` 트리              | `imageToWebP.ts`(Safari는 wasm), `videoTranscode.ts`(변환·포스터 인자, 스크립트와 공유), `videoPoster.ts`, `facilityVideoUpload.ts`, `webpBytes.ts`, `buildingPhotos.ts` 추가 |
| 233–234 `scripts/` 트리             | `convertBuildingPhotosToWebP.ts`, `transcodeFacilityVideos.ts`, `lib/` 추가                                                                                                   |
| 306 스키마                          | `video_url` 아래 `video_poster_url   text                     -- 영상 포스터 (R2, 영상 키의 짝 .jpg)`                                                                         |
| 535–539 스토리지 표·본문            | 건물 사진 행은 그대로. 시설 영상 행: `변환(실패 시 재생 가능한 원본) → 포스터 캡처 → presigned PUT ×2 → 확인`. 본문 단락은 아래 문단으로 바꾼다                               |

539줄 단락을 바꿀 문단:

> 건물 사진은 브라우저에서 긴 변 1920px 이내로 줄인 뒤 WebP로 인코딩해 올립니다. Safari처럼 canvas가 WebP를 만들지 못하면 wasm 인코더(`@jsquash/webp`)로 대신 인코딩하고, 서버는 파일 앞 바이트로 WebP인지 확인한 것만 저장합니다. 영상은 업로드마다 ffmpeg.wasm으로 긴 변 1280px·H.264·faststart 변환을 시도하고, 실패하면 재생 가능한 원본만 경고와 함께 올립니다. 업로드할 영상에서 포스터(긴 변 640px JPEG)를 캡처해 영상 키의 짝 `.jpg`로 함께 저장하므로, 공개 패널은 포스터만 받고 영상은 재생할 때 받습니다. 용량 상한은 presign 라우트가 R2에 직접 강제하므로 클라이언트 검사를 우회해도 통과하지 않습니다. 기준과 근거는 `docs/specs/2026-10-07-sidepanel-media-loading-design.md`에 있습니다.
> | 461·465·32·237 테스트 수 | 아래 Step 2 출력으로 고친다 |
> | 575 관리자 기능 | `사진 업로드(브라우저 WebP 변환, Safari는 wasm…)` |

- [ ] **Step 2: 테스트 수를 센다 (README에 쓰기 전에)**

Run: `npx vitest run 2>&1 | tail -5` 와 `npx playwright test --list 2>&1 | tail -2`
Expected: `Test Files N passed`, `Tests M passed`, `Total: K tests in L files`. 이 값으로 461·465·32·237의 수를 고친다. 세지 않은 수는 쓰지 않는다.

- [ ] **Step 3: 참조 역추적**

Run:

```bash
rg -n "재생 불가 코덱만|재생 불가한 경우에만|min\(1280,iw\)|cancel-during-prepare|convertToWebP|imageToWebP|video_url\b" README.md docs/specs docs/TODO_list src e2e --glob '!docs/review/**'
```

Expected: 각 결과가 (a) 이번 변경에서 고쳤거나, (b) 날짜가 붙은 기록이라 그 시점에 참이거나(`2026-08-04`, `2026-08-14` 설계), (c) 무관하다. 출력과 판정을 PR 본문에 붙인다.

- [ ] **Step 4: 커밋**

```bash
npx prettier --write README.md
git add README.md
git commit -m "docs: README를 사진 WebP 판정·영상 변환·포스터 흐름에 맞춘다"
```

---

### Task 17: 전체 검증, 배포, 운영 반영

- [ ] **Step 1: CI와 같은 검사를 로컬에서**

Run: `npm run lint && npm run typecheck && npm run test && npm run format:check && npm run test:e2e`
Expected: 모두 통과. 실패하면 출력 그대로 보고하고 고친다.

- [ ] **Step 2: 수동 확인 (로컬 dev, 운영에 쓰지 않음)**

`npm run dev`로 띄운 뒤 Chrome에서 확인한다. 로컬 dev는 `.env.local`의 운영 Supabase·R2를 쓰므로 **업로드는 하지 않는다**.

- 공개 지도에서 영상이 있는 건물 패널을 열고 DevTools Network에서 `r2.dev` 요청이 재생 전 0건인지 본다(이 시점 운영 데이터에는 포스터가 없으므로 검은 칸이 정상).

- [ ] **Step 3: PR 2 (사용자 승인 후)**

PR 1이 병합되고 마이그레이션이 적용된 것을 확인한 뒤 `git rebase origin/main`, 푸시, PR을 만든다. 본문에 Task 16 Step 3의 역추적 출력, 배포 후 할 일(아래 Step 5~7)을 적는다. 병합 직전에 이 계획 문서를 `git rm`하고 커밋한다(계획 문서 수명 규칙).

- [ ] **Step 4: 배포 확인 후 사용자 수동 확인**

관리 화면에서 아이폰 영상 하나를 올려 본다. 진행 문구가 `변환 도구 불러오는 중...` → `용량을 줄이는 중... N%`로 가는지, 공개 패널에 포스터가 뜨는지 확인한다. Claude는 올라간 객체를 HEAD·probe로 확인해 크기·해상도·faststart를 보고한다.

- [ ] **Step 5: 사용자 실행 — 사진**

```bash
node --env-file=.env.local src/scripts/convertBuildingPhotosToWebP.ts
DRY_RUN=0 node --env-file=.env.local src/scripts/convertBuildingPhotosToWebP.ts
```

실행하는 동안 관리 화면에서 사진·영상을 편집하지 않는다(설계 6.2 운영 규칙).

- [ ] **Step 6: 사용자 실행 — 영상**

```bash
FFMPEG_PATH=... FFPROBE_PATH=... node --env-file=.env.local src/scripts/transcodeFacilityVideos.ts
DRY_RUN=0 FFMPEG_PATH=... FFPROBE_PATH=... node --env-file=.env.local src/scripts/transcodeFacilityVideos.ts
```

- [ ] **Step 7: 운영 재측정과 기록**

2026-10-07에 쓴 Playwright 측정(`하나과학관 A동` 패널 열기: 사진 표시 시간, 재생 전 영상 요청, 재생 후 진행)을 다시 돌린다. 사진 판정·영상 probe 집계도 다시 낸다. 결과를 설계 문서 1장 끝에 `<측정한 날짜> 반영 후` 소절로 적고 커밋한다.

- [ ] **Step 8: 원본 정리 (사용자가 결과를 확인한 뒤)**

```bash
node --env-file=.env.local src/scripts/convertBuildingPhotosToWebP.ts --purge
DRY_RUN=0 node --env-file=.env.local src/scripts/convertBuildingPhotosToWebP.ts --purge
FFMPEG_PATH=... FFPROBE_PATH=... node --env-file=.env.local src/scripts/transcodeFacilityVideos.ts --purge
DRY_RUN=0 FFMPEG_PATH=... FFPROBE_PATH=... node --env-file=.env.local src/scripts/transcodeFacilityVideos.ts --purge
```
