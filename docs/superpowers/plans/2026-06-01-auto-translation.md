# Auto-Translation for Admin-Entered Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 입력한 한국어 텍스트(시설 name/description/floor_info, 사진 caption)를 저장 시 MyMemory API로 자동번역해 DB에 EN/ZH 컬럼으로 저장하고, SidePanel에서 언어에 맞는 컬럼을 표시한다.

**Architecture:** 서버사이드 `/api/translate` route가 MyMemory API를 호출해 API key 없이 번역 처리. 관리자 저장 핸들러(insert/update 후)가 이 route를 호출해 `*_en`, `*_zh` 컬럼을 update. SidePanel은 `lang` 값에 따라 번역 컬럼을 우선 표시하고 없으면 원본 fallback.

**Tech Stack:** Next.js App Router API Route, MyMemory Translation API (무료, 이메일 파라미터만 필요), Supabase

**Prerequisites:**
- `supabase/migrations/20260601000000_add_i18n_columns.sql` 을 Supabase SQL Editor에서 실행 완료
- `.env.local`에 `TRANSLATE_EMAIL=본인이메일` 추가

---

## File Map

| 파일 | 작업 |
|------|------|
| `src/app/api/translate/route.js` | 신규 — MyMemory 호출 서버 route |
| `src/app/admin/buildings/[id]/page.js` | 수정 — `AddFacilityButton.handleSave`, `PhotoManager.handleSaveCaption` |
| `src/components/SidePanel.js` | 수정 — 번역 컬럼 사용, photos select 쿼리 |

---

## Task 1: Translation API Route 생성

**Files:**
- Create: `src/app/api/translate/route.js`

- [ ] **Step 1: 파일 생성**

```js
import { NextResponse } from "next/server";

const EMAIL = process.env.TRANSLATE_EMAIL ?? "";

async function translateOne(text, target) {
  if (!text?.trim()) return "";
  const url =
    `https://api.mymemory.translated.net/get` +
    `?q=${encodeURIComponent(text)}` +
    `&langpair=ko|${target}` +
    (EMAIL ? `&de=${encodeURIComponent(EMAIL)}` : "");
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return text;
    const data = await res.json();
    if (data.responseStatus !== 200) return text;
    return data.responseData?.translatedText ?? text;
  } catch {
    return text;
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.texts || typeof body.texts !== "object") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const en = {};
  const zh = {};

  for (const [key, value] of Object.entries(body.texts)) {
    if (!value?.trim()) continue;
    [en[key], zh[key]] = await Promise.all([
      translateOne(value, "en"),
      translateOne(value, "zh"),
    ]);
  }

  return NextResponse.json({ en, zh });
}
```

- [ ] **Step 2: 동작 확인 (개발 서버 실행 후)**

```bash
curl -X POST http://localhost:3000/api/translate \
  -H "Content-Type: application/json" \
  -d '{"texts":{"name":"정문 엘리베이터","floor_info":"1층~4층"}}'
```

Expected response:
```json
{
  "en": { "name": "Main Gate Elevator", "floor_info": "1st to 4th floor" },
  "zh": { "name": "正门电梯", "floor_info": "1楼~4楼" }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/translate/route.js
git commit -m "feat: MyMemory 자동번역 API route 추가"
```

---

## Task 2: AddFacilityButton — 시설 추가 시 번역

**Files:**
- Modify: `src/app/admin/buildings/[id]/page.js` (`AddFacilityButton` 컴포넌트의 `handleSave` 함수, 약 803~831번째 줄)

- [ ] **Step 1: `handleSave` 수정 — insert 후 번역 호출**

기존:
```js
async function handleSave() {
  if (!form.facility_code) {
    showToast("시설 유형을 선택해주세요", "warning");
    return;
  }
  setSaving(true);
  await supabase.from("building_facilities").insert({
    building_id: buildingId,
    facility_code: form.facility_code,
    name: form.name || null,
    description: form.description || null,
    floor_info: form.floor_info || null,
    is_installed: form.is_installed,
    lat: form.lat ? parseFloat(form.lat) : null,
    lng: form.lng ? parseFloat(form.lng) : null,
  });
  setSaving(false);
  setOpen(false);
  setForm({
    facility_code: "",
    name: "",
    description: "",
    floor_info: "",
    is_installed: true,
    lat: "",
    lng: "",
  });
  onAdd();
  showToast("시설이 추가되었어요!");
}
```

변경 후:
```js
async function handleSave() {
  if (!form.facility_code) {
    showToast("시설 유형을 선택해주세요", "warning");
    return;
  }
  setSaving(true);

  const { data: inserted } = await supabase
    .from("building_facilities")
    .insert({
      building_id: buildingId,
      facility_code: form.facility_code,
      name: form.name || null,
      description: form.description || null,
      floor_info: form.floor_info || null,
      is_installed: form.is_installed,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
    })
    .select("id")
    .single();

  if (inserted) {
    const texts = {};
    if (form.name) texts.name = form.name;
    if (form.description) texts.description = form.description;
    if (form.floor_info) texts.floor_info = form.floor_info;

    if (Object.keys(texts).length > 0) {
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts }),
        });
        const { en, zh } = await res.json();
        await supabase.from("building_facilities").update({
          name_en: en.name ?? null,
          name_zh: zh.name ?? null,
          description_en: en.description ?? null,
          description_zh: zh.description ?? null,
          floor_info_en: en.floor_info ?? null,
          floor_info_zh: zh.floor_info ?? null,
        }).eq("id", inserted.id);
      } catch {
        // 번역 실패해도 시설 저장은 완료
      }
    }
  }

  setSaving(false);
  setOpen(false);
  setForm({
    facility_code: "",
    name: "",
    description: "",
    floor_info: "",
    is_installed: true,
    lat: "",
    lng: "",
  });
  onAdd();
  showToast("시설이 추가되었어요!");
}
```

- [ ] **Step 2: 동작 확인**

관리자 페이지에서 시설 추가 → Supabase Table Editor에서 `building_facilities` 조회 → `name_en`, `name_zh` 컬럼에 번역값 확인

- [ ] **Step 3: 커밋**

```bash
git add src/app/admin/buildings/[id]/page.js
git commit -m "feat: 시설 추가 시 name/description/floor_info 자동번역 저장"
```

---

## Task 3: PhotoManager — 사진 캡션 저장 시 번역

**Files:**
- Modify: `src/app/admin/buildings/[id]/page.js` (`PhotoManager` 컴포넌트의 `handleSaveCaption` 함수, 약 633~645번째 줄)

- [ ] **Step 1: `handleSaveCaption` 수정**

기존:
```js
async function handleSaveCaption(photoId) {
  const caption = draftCaptions[photoId] ?? "";
  const original = photos.find((p) => p.id === photoId)?.caption ?? "";
  if (caption === original) return;
  setSavingCaption(photoId);
  const { error } = await supabase
    .from("building_photos")
    .update({ caption: caption || null })
    .eq("id", photoId);
  setSavingCaption(null);
  if (error) { showToast("캡션 저장 실패", "error"); return; }
  setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, caption: caption || null } : p));
}
```

변경 후:
```js
async function handleSaveCaption(photoId) {
  const caption = draftCaptions[photoId] ?? "";
  const original = photos.find((p) => p.id === photoId)?.caption ?? "";
  if (caption === original) return;
  setSavingCaption(photoId);

  const updateData = { caption: caption || null, caption_en: null, caption_zh: null };

  if (caption) {
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: { caption } }),
      });
      const { en, zh } = await res.json();
      updateData.caption_en = en.caption ?? null;
      updateData.caption_zh = zh.caption ?? null;
    } catch {
      // 번역 실패해도 캡션 저장은 진행
    }
  }

  const { error } = await supabase
    .from("building_photos")
    .update(updateData)
    .eq("id", photoId);
  setSavingCaption(null);
  if (error) { showToast("캡션 저장 실패", "error"); return; }
  setPhotos((prev) =>
    prev.map((p) => (p.id === photoId ? { ...p, ...updateData } : p)),
  );
}
```

- [ ] **Step 2: 동작 확인**

관리자 페이지에서 사진 캡션 입력 후 포커스 아웃 → Supabase Table Editor에서 `building_photos` 조회 → `caption_en`, `caption_zh` 확인

- [ ] **Step 3: 커밋**

```bash
git add src/app/admin/buildings/[id]/page.js
git commit -m "feat: 사진 캡션 저장 시 자동번역 저장"
```

---

## Task 4: SidePanel — 번역 컬럼 표시

**Files:**
- Modify: `src/components/SidePanel.js`
  - `fetchData` 내 `building_photos` select 쿼리 (약 80번째 줄)
  - 시설 표시 블록 (약 497~509번째 줄)
  - 사진 캡션 표시 블록 (약 420~432번째 줄)
  - `buildTtsText` 함수 (약 134~172번째 줄)

- [ ] **Step 1: building_photos 쿼리에 번역 컬럼 추가**

기존:
```js
supabase
  .from("building_photos")
  .select("id, url, caption")
  .eq("building_id", buildingId)
  .order("created_at"),
```

변경 후:
```js
supabase
  .from("building_photos")
  .select("id, url, caption, caption_en, caption_zh")
  .eq("building_id", buildingId)
  .order("created_at"),
```

- [ ] **Step 2: 시설 텍스트 표시 — 번역 컬럼 우선**

기존 (약 497~509번째 줄):
```jsx
<div style={{ fontSize: 13, fontWeight: 500, color: "#222" }}>
  {f.name ?? getFacilityLabel(f.facility_types)}
</div>
{f.description && (
  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
    {f.description}
  </div>
)}
{f.floor_info && (
  <div style={{ fontSize: 12, color: "#888" }}>
    {f.floor_info}
  </div>
)}
```

변경 후:
```jsx
<div style={{ fontSize: 13, fontWeight: 500, color: "#222" }}>
  {lang === "ko"
    ? (f.name ?? getFacilityLabel(f.facility_types))
    : (f[`name_${lang}`] ?? f.name ?? getFacilityLabel(f.facility_types))}
</div>
{f.description && (
  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
    {lang === "ko" ? f.description : (f[`description_${lang}`] ?? f.description)}
  </div>
)}
{f.floor_info && (
  <div style={{ fontSize: 12, color: "#888" }}>
    {lang === "ko" ? f.floor_info : (f[`floor_info_${lang}`] ?? f.floor_info)}
  </div>
)}
```

- [ ] **Step 3: 사진 캡션 표시 — 번역 컬럼 우선**

기존 (약 420번째 줄):
```jsx
{photos[photoIndex]?.caption && (
  <div
    style={{
      padding: "6px 14px",
      fontSize: 12,
      color: "#555",
      background: "#fafafa",
      borderBottom: "1px solid #f0f0f0",
    }}
  >
    {photos[photoIndex].caption}
  </div>
)}
```

변경 후:
```jsx
{photos[photoIndex]?.caption && (
  <div
    style={{
      padding: "6px 14px",
      fontSize: 12,
      color: "#555",
      background: "#fafafa",
      borderBottom: "1px solid #f0f0f0",
    }}
  >
    {lang === "ko"
      ? photos[photoIndex].caption
      : (photos[photoIndex][`caption_${lang}`] ?? photos[photoIndex].caption)}
  </div>
)}
```

- [ ] **Step 4: TTS buildTtsText — EN/ZH에서 번역 텍스트 사용**

기존 EN 블록 (약 138~148번째 줄):
```js
if (lang === "en") {
  let text = `This is ${name}. `;
  if (facilities.length === 0) return text + "No accessibility information available.";
  text += "Facilities: ";
  facilities.forEach((f) => {
    const label = f.facility_types?.label_en ?? f.facility_types?.label ?? "";
    text += `${label}, ${f.is_installed ? "available" : "unavailable"}. `;
    if (f.floor_info) text += `Location: ${f.floor_info}. `;
  });
  return text;
}
```

변경 후:
```js
if (lang === "en") {
  let text = `This is ${name}. `;
  if (facilities.length === 0) return text + "No accessibility information available.";
  text += "Facilities: ";
  facilities.forEach((f) => {
    const label = f.facility_types?.label_en ?? f.facility_types?.label ?? "";
    const facilityName = f.name_en ?? f.name ?? label;
    text += `${facilityName}, ${f.is_installed ? "available" : "unavailable"}. `;
    const location = f.floor_info_en ?? f.floor_info;
    if (location) text += `Location: ${location}. `;
  });
  return text;
}
```

기존 ZH 블록 (약 150~160번째 줄):
```js
if (lang === "zh") {
  let text = `这是${name}。`;
  if (facilities.length === 0) return text + "暂无无障碍设施信息。";
  text += "设施情况：";
  facilities.forEach((f) => {
    const label = f.facility_types?.label_zh ?? f.facility_types?.label ?? "";
    text += `${label}，${f.is_installed ? "已安装" : "未安装"}。`;
    if (f.floor_info) text += `位置：${f.floor_info}。`;
  });
  return text;
}
```

변경 후:
```js
if (lang === "zh") {
  let text = `这是${name}。`;
  if (facilities.length === 0) return text + "暂无无障碍设施信息。";
  text += "设施情况：";
  facilities.forEach((f) => {
    const label = f.facility_types?.label_zh ?? f.facility_types?.label ?? "";
    const facilityName = f.name_zh ?? f.name ?? label;
    text += `${facilityName}，${f.is_installed ? "已安装" : "未安装"}。`;
    const location = f.floor_info_zh ?? f.floor_info;
    if (location) text += `位置：${location}。`;
  });
  return text;
}
```

- [ ] **Step 5: 동작 확인**

1. 번역 컬럼이 있는 시설이 등록된 건물을 지도에서 클릭
2. 언어를 EN으로 전환 → 시설 name/description/floor_info가 영어로 표시되는지 확인
3. 언어를 ZH로 전환 → 중국어로 표시되는지 확인
4. 번역 컬럼이 없는 기존 데이터 → 원본 한국어 fallback 확인

- [ ] **Step 6: 커밋**

```bash
git add src/components/SidePanel.js
git commit -m "feat: SidePanel 시설·사진 캡션 다국어 번역 컬럼 표시"
```
