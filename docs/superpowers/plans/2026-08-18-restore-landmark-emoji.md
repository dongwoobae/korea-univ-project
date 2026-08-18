# 명소 아이콘 이모지 복원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 명소마다 다르던 이모지 아이콘을 되살린다 — `landmarks.icon` 컬럼, 관리자 폼 입력, 개별 명소 5개 렌더 지점.

**Architecture:** DB에 이모지 문자열을 그대로 저장하고 렌더 지점이 그 값을 출력한다. 값이 없을 때 기본 이모지로 떨어지는 순수 함수 하나를 `src/lib/mapIcons.ts`에 두어 배포 창(프론트가 마이그레이션보다 먼저 뜨는 구간)에서 공개 지도가 깨지지 않게 한다. 카테고리를 뜻하는 클러스터·필터 토글은 lucide `Sparkles`로 남는다.

**Tech Stack:** Next.js · React · Supabase(PostgREST) · Leaflet(`divIcon`) · vitest · Playwright

**설계 문서:** `docs/superpowers/specs/2026-08-18-restore-landmark-emoji-design.md`

---

## 이 저장소에서 먼저 알아야 할 것

- **`npm run format:check`를 전체로 돌리지 마라.** Windows `core.autocrlf` 때문에 손대지 않은 파일 ~50개가 함께 실패한다. 변경한 파일만 `npx prettier --check --end-of-line auto <files>`로 본다.
- **Playwright `-g`는 테스트 제목 전체가 필요하다.** 부분 제목은 `No tests found`가 난다. `npm run test:e2e -- … -g "여러 단어"`는 npm이 따옴표를 벗겨 인자를 쪼개므로 `npx playwright test`를 직접 쓴다.
- **PowerShell 툴이 다른 repo에서 시작할 수 있다.** 항상 `korea-univ-project`에서 실행한다.
- `supabase/database.types.ts`는 생성물이지만 로컬에 supabase CLI가 없어 **수기로 편집하고 typecheck로 검증한다.** PR #12에서 걷어낼 때도 같은 방식이었다.
- 마이그레이션 파일은 **새로 추가만** 할 수 있다. `scripts/check-migrations.sh`가 기존 파일 수정·삭제·이름변경을 막고, 파일명은 `YYYYMMDDHHMMSS_lower_snake_case.sql`이어야 하며 빈 파일도 막는다.

## 파일 구조

| 파일                                                           | 책임                                                    | 작업          |
| -------------------------------------------------------------- | ------------------------------------------------------- | ------------- |
| `supabase/migrations/20260818000000_restore_landmark_icon.sql` | 컬럼 복원·backfill·제약                                 | 생성 (Task 1) |
| `supabase/database.types.ts`                                   | DB 스키마의 타입 반영                                   | 수정 (Task 2) |
| `src/lib/mapIcons.ts`                                          | 아이콘 단일 출처. 여기에 이모지 폴백 순수 함수를 더한다 | 수정 (Task 3) |
| `src/lib/mapIcons.test.ts`                                     | 위 함수의 단위 테스트                                   | 수정 (Task 3) |
| `src/components/map/LandmarkMarkers.tsx`                       | 지도 마커 divIcon + 팝업                                | 수정 (Task 4) |
| `src/components/map/MapBrowseList.tsx`                         | 목록 패널. `MapBrowseItem` 타입 소유                    | 수정 (Task 5) |
| `src/components/map/Map.tsx`                                   | `MapBrowseItem` 생산자                                  | 수정 (Task 5) |
| `src/components/map/SearchControl.tsx`                         | 검색 결과                                               | 수정 (Task 6) |
| `src/app/admin/dashboard/landmarks/page.tsx`                   | 관리자 목록                                             | 수정 (Task 6) |
| `src/components/admin/LandmarkFormModal.tsx`                   | 관리자 입력 폼                                          | 수정 (Task 7) |
| `e2e/support/mockBackend.ts`                                   | e2e 픽스처                                              | 수정 (Task 8) |
| `e2e/public-map.spec.ts` · `e2e/admin-content.spec.ts`         | 깨지는 기존 단언                                        | 수정 (Task 8) |

**Task 4~7은 서로 독립이지만 Task 3에 의존한다.** Task 3을 먼저 끝내라.

---

### Task 1: 마이그레이션 — 컬럼 복원과 backfill

**Files:**

- Create: `supabase/migrations/20260818000000_restore_landmark_icon.sql`

- [ ] **Step 1: 마이그레이션 파일을 쓴다**

`add column if not exists` 한 줄로 끝내지 않는다. 그 구문은 컬럼이 이미 있으면 아무것도 하지 않아 default·not null·check 보강을 건너뛴다. drop을 적용하지 않은 환경에는 default 없는 `icon text not null`이 남아 있다.

```sql
-- 명소 아이콘을 lucide 단일화에서 이모지로 되돌리면서 컬럼을 되살린다.
-- 20260813000000_drop_icon_columns.sql이 지운 것을 앞으로 되돌리는 것이라
-- 그 파일은 수정하지 않는다.
alter table landmarks add column if not exists icon text;
alter table landmarks alter column icon set default '✨';

update landmarks set icon = '🐿️' where name = '다람쥐길';
update landmarks set icon = '🌳' where name = '애기능';
update landmarks set icon = '🌸' where name = '참살이길';
update landmarks set icon = '🕊️' where name = '민주광장';

update landmarks set icon = '✨' where icon is null;

alter table landmarks alter column icon set not null;

-- 폼의 maxLength는 클라이언트 전용이고 RLS가 with check (true)라 REST로 긴
-- 문자열이 들어올 수 있다. 그 값은 공개 지도의 divIcon innerHTML로 간다.
alter table landmarks drop constraint if exists landmarks_icon_length;
alter table landmarks
  add constraint landmarks_icon_length check (char_length(icon) <= 8);
```

- [ ] **Step 2: 마이그레이션 검사를 통과하는지 본다**

Run: `bash scripts/check-migrations.sh`
Expected: 통과. 실패하면 파일명이 `YYYYMMDDHHMMSS_lower_snake_case.sql` 형식이 아니거나 기존 파일을 건드린 것이다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260818000000_restore_landmark_icon.sql
git commit -m "feat(db): landmarks.icon을 되살리고 명소 4건을 이름으로 채운다"
```

---

### Task 2: 타입 — `database.types.ts`에 `icon` 복구

**Files:**

- Modify: `supabase/database.types.ts` (`landmarks`의 `Row`/`Insert`/`Update`)

- [ ] **Step 1: 세 블록에 `icon`을 넣는다**

`landmarks` 블록을 찾아 알파벳 순서를 지켜 `id` 다음, `image_url` 앞에 넣는다.

`Row`:

```ts
id: string;
icon: string;
image_url: string | null;
```

`Insert`와 `Update`는 선택 필드로 넣는다(둘 다 default가 있으므로 생략 가능하다):

```ts
          id?: string;
          icon?: string;
          image_url?: string | null;
```

- [ ] **Step 2: typecheck로 확인한다**

Run: `npm run typecheck`
Expected: 통과. 이 시점에는 `icon`을 읽는 코드가 아직 없으므로 오류가 없어야 한다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/database.types.ts
git commit -m "feat(types): landmarks.icon을 생성 타입에 되돌린다"
```

---

### Task 3: 폴백 함수 — 값이 없어도 지도가 살아 있게

배포 창에서 프론트가 마이그레이션보다 먼저 뜨면 `/api/landmarks` 응답에 `icon` 필드 자체가 없다. 타입은 `string`이라 컴파일은 통과하고, 런타임에 `escapeHtml(undefined)`가 `undefined.replaceAll`로 터져 **공개 지도 마커가 통째로 사라진다.** 그래서 렌더 지점은 전부 이 함수를 거친다.

**Files:**

- Modify: `src/lib/mapIcons.ts`
- Test: `src/lib/mapIcons.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/mapIcons.test.ts`의 `import` 목록에 `LANDMARK_FALLBACK_EMOJI`와 `landmarkEmoji`를 더하고, 파일 끝에 붙인다.

```ts
describe("landmarkEmoji", () => {
  it("저장된 이모지를 그대로 돌려준다", () => {
    expect(landmarkEmoji("🐿️")).toBe("🐿️");
  });

  it("값이 없으면 기본 이모지로 떨어진다", () => {
    expect(landmarkEmoji(null)).toBe(LANDMARK_FALLBACK_EMOJI);
    expect(landmarkEmoji(undefined)).toBe(LANDMARK_FALLBACK_EMOJI);
    expect(landmarkEmoji("")).toBe(LANDMARK_FALLBACK_EMOJI);
    expect(landmarkEmoji("   ")).toBe(LANDMARK_FALLBACK_EMOJI);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/mapIcons.test.ts`
Expected: FAIL — `landmarkEmoji is not a function` 또는 import 해석 실패.

- [ ] **Step 3: 최소 구현을 넣는다**

`src/lib/mapIcons.ts`의 `export const LANDMARK_ICON_SVG = Sparkles;` 아래에 넣는다.

```ts
export const LANDMARK_FALLBACK_EMOJI = "✨";

/**
 * 마이그레이션이 프론트 배포보다 늦게 적용되는 창에서는 응답에 icon 필드가
 * 아예 없다. 타입은 string이라 컴파일이 잡아주지 못한다.
 */
export function landmarkEmoji(icon: string | null | undefined): string {
  const value = icon?.trim();
  return value ? value : LANDMARK_FALLBACK_EMOJI;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/mapIcons.test.ts`
Expected: PASS. 기존 `sizedIconSvg`·`facilityIconSvg` 테스트도 함께 통과해야 한다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/mapIcons.ts src/lib/mapIcons.test.ts
git commit -m "feat(map): 명소 이모지 폴백 함수를 세운다"
```

---

### Task 4: 지도 마커와 팝업

**Files:**

- Modify: `src/components/map/LandmarkMarkers.tsx`

- [ ] **Step 1: import를 바꾼다**

`LANDMARK_ICON_SVG`는 클러스터가 계속 쓰므로 남긴다.

```ts
import { LANDMARK_ICON_SVG, landmarkEmoji, sizedIconSvg } from "@/lib/mapIcons";
```

- [ ] **Step 2: `landmarkMarkerIcon`의 캐시 키와 html을 바꾼다**

**캐시 키에 이모지를 넣는 것이 핵심이다.** `iconCache`는 모듈 수준 `Map`이라, 키가 그대로면 이름을 안 바꾸고 이모지만 바꿨을 때 옛 마커가 계속 나온다.

```ts
const landmarkMarkerIcon = (
  landmark: Landmark,
  name: string,
  showLabel: boolean,
) => {
  const emoji = landmarkEmoji(landmark.icon);
  return cachedIcon(
    `landmark|${landmark.id}|${name}|${emoji}|${showLabel}`,
    () =>
      L.divIcon({
        className: "",
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;white-space:nowrap"><div data-testid="landmark-marker-${escapeHtml(landmark.id)}" style="width:30px;height:30px;background:white;border:2px solid #C08A2D;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#C08A2D;box-shadow:0 2px 7px rgba(28,25,23,0.22);"><span aria-hidden="true" style="display:flex;font-size:15px;line-height:1">${escapeHtml(emoji)}</span></div>${showLabel ? `<span data-testid="landmark-label" style="padding:2px 5px;border-radius:999px;color:#7A5C16;background:rgba(255,255,255,.92);box-shadow:0 1px 3px rgba(28,25,23,.12);font:700 10.5px Pretendard,sans-serif">${escapeHtml(name)}</span>` : ""}</div>`,
        iconAnchor: [17, 17],
        popupAnchor: [0, -20],
      }),
  );
};
```

lucide SVG는 `sizedIconSvg(..., 15)`가 크기를 정했지만 이모지는 텍스트라 `font-size:15px`가 그 자리를 대신한다. `line-height:1`이 없으면 30px 원 안에서 세로 중심이 어긋난다.

- [ ] **Step 3: 팝업의 `<LandmarkIcon>`을 이모지로 바꾼다**

`<Popup>` 안 제목 줄이다.

```tsx
<span aria-hidden="true" style={{ fontSize: 15 }}>
  {landmarkEmoji(landmark.icon)}
</span>;
{
  name;
}
```

`LandmarkIcon` import가 이 파일에서 더 쓰이지 않으면 지운다. 남겨두면 lint가 잡는다.

- [ ] **Step 4: 클러스터는 건드리지 않는다**

`landmarkClusterIcon`은 여러 명소를 묶은 것이라 고를 이모지가 없다. `LANDMARK_ICON_SVG`(`Sparkles`) 그대로 둔다.

- [ ] **Step 5: 검증**

Run: `npm run typecheck && npx eslint src/components/map/LandmarkMarkers.tsx`
Expected: 둘 다 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/components/map/LandmarkMarkers.tsx
git commit -m "feat(map): 명소 마커와 팝업이 저장된 이모지를 그린다"
```

---

### Task 5: 목록 패널 — 타입·생산자·소비자를 함께

타입에 필드를 더하는 것만으로는 값이 흐르지 않는다. `Map.tsx`의 생산자가 채워야 한다.

**Files:**

- Modify: `src/components/map/MapBrowseList.tsx` (`MapBrowseItem` 타입 + 렌더)
- Modify: `src/components/map/Map.tsx` (`landmarkBrowseItem`, `facilityBrowseItem`)

- [ ] **Step 1: `MapBrowseItem`에 `icon`을 더한다**

`code`를 재사용하지 않는다 — `code`는 시설 코드 전용이라 의미가 섞인다.

```ts
export interface MapBrowseItem {
  key: string;
  kind: "facility" | "landmark";
  /** facility 전용. landmark는 icon을 쓴다. */
  code: string | null;
  /** landmark 전용. facility는 code로 아이콘을 고른다. */
  icon: string | null;
  name: string;
  detail: string;
  lat: number;
  lng: number;
}
```

- [ ] **Step 2: 렌더를 바꾼다**

```tsx
<span className="ku-map-browse-icon">
  {item.kind === "landmark" ? (
    <span aria-hidden="true" style={{ fontSize: 16 }}>
      {landmarkEmoji(item.icon)}
    </span>
  ) : (
    <FacilityTypeIcon code={item.code} size={16} />
  )}
</span>
```

import를 더한다: `import { landmarkEmoji } from "@/lib/mapIcons";`
`LandmarkIcon`이 이 파일에서 더 쓰이지 않으면 import에서 지운다.

- [ ] **Step 3: 생산자 두 곳을 고친다**

`Map.tsx`의 `facilityBrowseItem` 반환에 `icon: null`을, `landmarkBrowseItem` 반환에 `icon: landmark.icon`을 더한다. 새 필수 필드라 둘 다 넣지 않으면 typecheck가 잡는다.

```ts
    kind: "facility",
    code: facility.facility_types?.code ?? null,
    icon: null,
```

```ts
    kind: "landmark",
    code: null,
    icon: landmark.icon,
```

- [ ] **Step 4: 검증**

Run: `npm run typecheck`
Expected: 통과. `icon`을 한 곳이라도 빠뜨리면 여기서 잡힌다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/map/MapBrowseList.tsx src/components/map/Map.tsx
git commit -m "feat(map): 목록 패널이 명소별 이모지를 싣고 그린다"
```

---

### Task 6: 검색 결과와 관리자 목록

**Files:**

- Modify: `src/components/map/SearchControl.tsx`
- Modify: `src/app/admin/dashboard/landmarks/page.tsx`

- [ ] **Step 1: 검색 결과 아이콘을 바꾼다**

`SearchControl.tsx`에서 `<LandmarkIcon size={15} />`를 감싼 `<span className="ku-search-result-icon">` 안을 바꾼다. **`result.kind === "landmark"` 분기는 둘이지만 아이콘을 그리는 것은 앞의 하나뿐이다.** 뒤의 분기는 `t("landmarkToggle")` 텍스트 태그라 손대지 않는다.

```tsx
{
  result.kind === "landmark" && (
    <span className="ku-search-result-icon" aria-hidden="true">
      <span style={{ fontSize: 15 }}>
        {landmarkEmoji(result.landmark.icon)}
      </span>
    </span>
  );
}
```

import를 더한다: `import { landmarkEmoji } from "@/lib/mapIcons";`
`LandmarkIcon` import가 더 쓰이지 않으면 지운다.

- [ ] **Step 2: 관리자 목록 아이콘을 바꾼다**

`src/app/admin/dashboard/landmarks/page.tsx`의 `<LandmarkIcon size={20} />`를 바꾼다.

```tsx
<div style={{ display: "grid", placeItems: "center", width: 28 }}>
  <span aria-hidden="true" style={{ fontSize: 20 }}>
    {landmarkEmoji(landmark.icon)}
  </span>
</div>
```

import를 더한다: `import { landmarkEmoji } from "@/lib/mapIcons";`
`LandmarkIcon` import가 더 쓰이지 않으면 지운다.

- [ ] **Step 3: 검증**

Run: `npm run typecheck && npx eslint src/components/map/SearchControl.tsx src/app/admin/dashboard/landmarks/page.tsx`
Expected: 둘 다 통과. 쓰지 않는 import가 남아 있으면 eslint가 잡는다.

- [ ] **Step 4: 커밋**

```bash
git add src/components/map/SearchControl.tsx src/app/admin/dashboard/landmarks/page.tsx
git commit -m "feat: 검색 결과와 관리자 목록이 명소별 이모지를 그린다"
```

---

### Task 7: 관리자 폼 — 이모지 입력 복구

`9760976`이 걷어낸 네 곳을 되돌린다. 그 커밋의 역방향이지만 `git revert`는 쓰지 않는다 — 같은 커밋이 마이그레이션과 `database.types.ts`도 건드렸고 그쪽은 이미 Task 1·2가 다르게 처리했다.

**Files:**

- Modify: `src/components/admin/LandmarkFormModal.tsx`

- [ ] **Step 1: 폼 상태에 `icon`을 넣는다**

`useState` 초기값의 `description_zh` 다음 줄이다.

```ts
    description_zh: landmark?.description_zh ?? "",
    icon: landmark?.icon ?? "✨",
```

- [ ] **Step 2: 검증을 되살린다**

`validate()`의 이름 검사 다음 줄이다.

```ts
if (!form.name.trim()) return "명소 이름을 입력해주세요";
if (!form.icon.trim()) return "이모지를 입력해주세요";
```

- [ ] **Step 3: 저장 페이로드에 넣는다**

`payload` 객체의 `description_zh` 다음 줄이다.

```ts
      description_zh: form.description_zh.trim() || null,
      icon: form.icon.trim(),
```

- [ ] **Step 4: 입력란을 되살린다**

중문 설명 `<textarea>` 다음, `위치 (지도에서 클릭해서 선택) *` 앞이다.

```tsx
        <label style={labelStyle} htmlFor={`${fieldId}-icon`}>
          이모지 *
        </label>
        <input
          id={`${fieldId}-icon`}
          value={form.icon}
          onChange={(e) => setForm({ ...form, icon: e.target.value })}
          maxLength={4}
          style={{ ...inputStyle, width: 90, fontSize: 20 }}
        />
```

- [ ] **Step 5: 검증**

Run: `npm run typecheck && npx eslint src/components/admin/LandmarkFormModal.tsx`
Expected: 둘 다 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/components/admin/LandmarkFormModal.tsx
git commit -m "feat(admin): 명소 폼에 이모지 입력을 되돌린다"
```

---

### Task 8: e2e — 깨지는 단언을 뒤집고 새 단언을 세운다

**세 곳이 지금 이모지가 없다는 것을 회귀로 잡고 있다.** 그대로 두면 반드시 실패한다.

**Files:**

- Modify: `e2e/support/mockBackend.ts` (명소 픽스처)
- Modify: `e2e/public-map.spec.ts` (마커 안 sparkles 단언)
- Modify: `e2e/admin-content.spec.ts` (이모지 입력란 부재 단언)

- [ ] **Step 1: 픽스처에 `icon`을 되살린다**

`mockBackend.ts`의 `landmarks` 배열, `다람쥐길` 행이다. `description_zh` 다음에 넣는다.

```ts
        description_zh: "安静的学生步道",
        icon: "🐿️",
```

- [ ] **Step 2: 공개 지도 단언을 뒤집는다**

`e2e/public-map.spec.ts`에서 마커 **안**의 sparkles를 세던 단언을 이모지 단언으로 바꾼다. 클러스터를 세는 단언은 그대로 둔다.

바꾸기 전:

```ts
await expect(
  page.locator('[data-testid^="landmark-marker-"] svg.lucide-sparkles'),
).toHaveCount(1);
```

바꾼 뒤:

```ts
await expect(page.locator('[data-testid^="landmark-marker-"]')).toContainText(
  "🐿️",
);
```

- [ ] **Step 3: 관리자 단언을 뒤집는다**

`e2e/admin-content.spec.ts`에서 이모지 입력란이 없다고 단언하는 곳이다. 주석까지 함께 뒤집는다 — 낡은 이유가 남으면 다음 사람이 오해한다.

바꾸기 전:

```ts
// 이모지 입력란은 lucide 전환으로 사라졌다. 남아 있으면 필수 검증이
// 되살아나 저장이 막히므로 없다는 것을 회귀로 잡는다.
await expect(dialog.getByLabel("이모지 *")).toHaveCount(0);
```

바꾼 뒤:

```ts
// 이모지는 필수라 비우면 저장이 막힌다. 기본값이 들어와 있는지까지 본다.
const iconInput = dialog.getByLabel("이모지 *");
await expect(iconInput).toHaveValue("✨");
await iconInput.fill("📸");
```

- [ ] **Step 4: 세 스펙을 돌린다**

Run: `npx playwright test e2e/public-map.spec.ts e2e/admin-content.spec.ts`
Expected: PASS. 실패하면 Task 4~7 중 빠뜨린 렌더 지점이 있다는 뜻이다.

- [ ] **Step 5: 커밋**

```bash
git add e2e/support/mockBackend.ts e2e/public-map.spec.ts e2e/admin-content.spec.ts
git commit -m "test: 명소 이모지 복원에 맞춰 회귀 단언을 뒤집는다"
```

---

### Task 9: 전체 검증

- [ ] **Step 1: 단위 테스트**

Run: `npm run test`
Expected: 전부 통과. `mapIcons.test.ts`의 `LANDMARK_ICON_SVG` = sparkles 단언은 **그대로 통과해야 한다** — 그 상수는 이제 클러스터·필터 토글이 쓰는 카테고리 아이콘이다.

- [ ] **Step 2: typecheck와 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 통과.

- [ ] **Step 3: 변경한 파일만 포맷 검사**

Run: `npx prettier --check --end-of-line auto $(git diff --name-only main...HEAD)`
Expected: 통과. **전체 `format:check`는 돌리지 마라** — CRLF 때문에 손대지 않은 파일이 무더기로 실패한다.

- [ ] **Step 4: e2e 전체**

Run: `npm run test:e2e`
Expected: 전부 통과.

- [ ] **Step 5: 카테고리 아이콘이 남았는지 눈으로 확인**

`LANDMARK_ICON_SVG`/`LANDMARK_ICON`의 남은 소비자가 클러스터와 필터 토글 둘뿐인지 확인한다.

Run: `grep -rn "LANDMARK_ICON" src/`
Expected: `mapIcons.ts` 정의, `iconography.tsx` 정의, `LandmarkMarkers.tsx`의 클러스터, `FilterPanel.tsx`의 토글, 테스트 2파일. **개별 명소 렌더 지점에는 남아 있으면 안 된다.**

---

## 배포 후 확인

마이그레이션은 `ci.yml`의 적용 job이 e2e까지 통과한 뒤 main 머지 시점에 실행된다. Vercel 배포는 그 체인을 기다리지 않으므로 **프론트가 먼저 뜨는 창이 생긴다.** 그 사이 명소 저장은 실패하고(감수하기로 한 것), 지도는 Task 3의 폴백 덕에 기본 이모지로 뜬다.

- [ ] 관리자 명소 목록에서 4건이 각각 🐿️ 🌳 🌸 🕊️로 뜨는지 본다. 이름이 완전일치하지 않은 행은 `✨`로 남아 있다 — 폼에서 고치면 저장과 함께 캐시가 무효화된다.
- [ ] 공개 지도(`/`)에서 마커가 같은 이모지로 뜨는지 본다. 브라우저에 남은 옛 응답이 보이면 새로고침 한 번.

## 계획서 회수

구현이 끝나고 검증까지 통과해 base 브랜치로 머지할 때 이 파일을 `git rm`하고 그 삭제를 feature 브랜치에 커밋한다. git 이력이 전문을 보존한다.
