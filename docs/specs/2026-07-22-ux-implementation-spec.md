# P0 구현 Spec — 모바일 핵심 기능 복구 · 신뢰성 · 다크 모드

- 작성일: 2026-07-22
- 근거 문서: [`docs/audits/2026-07-22-ux-audit.md`](../audits/2026-07-22-ux-audit.md)
- 범위: **Phase 1–2 (P0 6건 + 관리자 상태변경 오류처리)**. P1 이하는 audit 문서 참조.
- 검증 상태: 아래 각 항목은 실제 코드(커밋 기준) 대조로 확인함. audit 원문과 어긋난 3건은 **[수정]** 표시.

---

## 검증 시 발견한 audit 원문 수정 사항

1. **P0-03 근거 부정확 / 문제는 더 큼**: audit은 `.ku-admin-content > div`의 토큰이 다크에서 밝아진다고 했으나, 토큰(`--ku-*`)은 정상 반전된다. 실제 원인은 **`.tsx` 페이지의 인라인 하드코딩 색상(약 150곳)**. 특히 `src/app/admin/buildings/new/page.tsx`·`[id]/page.tsx`는 `.ku-admin-content` 래퍼 **밖**이라 CSS 폴백조차 없다.
2. **P0-05 문구 오기**: 실제 표시 문구는 `등록된 접근성 정보가 없어요`(`src/lib/translations.ts:27`), audit의 `등록된 시설 정보가 없습니다`는 오기. 동작(오류를 빈 상태로 오인)은 사실.
3. **A11Y 참고**: 시설/명소 모달은 `role="dialog"` + `aria-modal="true"`를 이미 가짐. 나머지 지적(포커스 관리 부재)은 사실 — 단 이 spec 범위(P0) 밖.

---

## Phase 1 — 모바일 핵심 기능 복구

### P0-01. 모바일 언어 선택 드롭다운

**대상 파일**

- `src/components/map/LanguageSwitcher.tsx` (현재 무상태 3버튼)
- `src/components/map/map-ui.css:695-741` (`@media (max-width: 767px)`에서 비활성 버튼 `display:none`)

**현재 상태**

- `map-ui.css:731-738` 모바일에서 `.ku-language button { display:none }`, `:741` `[aria-pressed="true"]`만 재노출 → 활성 언어 버튼 1개만 보임.
- 컴포넌트는 `onClick={() => setLang(code)}`뿐, 펼침 상태 없음 → 그 버튼을 눌러도 같은 언어 재선택.

**구현 방식**

1. `LanguageSwitcher`를 트리거 + 팝오버 구조로 변경.
   - `useState(false)` open 상태, 트리거 버튼에 `aria-haspopup="listbox"`, `aria-expanded={open}`.
   - 데스크톱은 기존 3버튼 인라인 유지, 모바일은 트리거→목록 방식. **CSS 미디어쿼리로 표현만 분기**(컴포넌트 로직은 공통)하는 것을 우선 검토; 어려우면 `isMobile` 분기.
   - 목록은 `role="listbox"`, 각 항목 `role="option"` + `aria-selected`.
2. 닫힘 동작: 바깥 클릭(`pointerdown` 리스너), `Escape`(`keydown`). 선택 후 트리거로 `focus()` 복귀.
3. `map-ui.css` 모바일 규칙 수정: 트리거만 보이고, open 시 목록이 팝오버로 뜨도록. `display:none`으로 언어를 지우는 현재 규칙 제거/대체.

**완료 기준**

- 390px 폭에서 ko/en/zh 모두 선택 가능.
- 키보드: Tab으로 트리거 진입 → Enter/Space로 열림 → ↑↓로 이동(선택) 또는 Tab, Escape로 닫힘 + 초점 복귀.
- 스크린리더로 현재 선택 언어와 옵션 목록이 읽힘.

**테스트**: Playwright 모바일 뷰포트 — 트리거 탭 → en 선택 → UI 텍스트가 영문으로 바뀌는지 assert. Escape 닫힘 assert.

---

### P0-02. 모바일 즐겨찾기 진입점 복구

**대상 파일**

- `src/components/map/map-ui.css:712-714` (`.ku-favorite-button { display:none }` @ max-width 767px)
- 즐겨찾기 버튼/목록 렌더 지점(검색 컨트롤 인근) 및 개수 소스

**현재 상태**: 모바일에서 즐겨찾기 버튼이 완전히 숨겨져 저장 목록 접근 불가.

**구현 방식**

1. `map-ui.css`의 `display:none` 제거. 모바일에서 검색창 내부/옆 또는 모바일 필터 트리거 옆에 즐겨찾기 진입점 유지.
2. 저장 개수 배지 표시(0개면 배지 숨김, 빈 상태 안내 노출).
3. 터치 영역 44×44px 이상 확보(인접 버튼과 간격).

**완료 기준**: 모바일에서 즐겨찾기 목록 열기 → 빈 상태 확인 → 항목 선택 시 해당 건물로 지도 이동.

**테스트**: Playwright 모바일 — 즐겨찾기 진입 버튼 노출 assert, 목록 열림 assert.

---

### P0-06. 모바일 관리자 계정/설정 메뉴 복구

**대상 파일**

- `src/app/admin/admin-ui.css:399-419` (`@media (max-width:767px)`에서 `.ku-admin-email, .ku-admin-settings, .ku-admin-map-link { display:none }`)
- `src/app/admin/dashboard/layout.tsx:78-101` (`.ku-admin-account` 헤더, 자식 4개: 이메일/설정/지도보기/로그아웃)

**현재 상태**: 모바일 헤더에 로그아웃만 남음. 이메일 설정·공개 지도 보기 접근 불가.

**구현 방식**

1. `layout.tsx` 헤더에 모바일용 "더보기/계정" 메뉴(케밥 또는 계정 아이콘) 추가.
   - 메뉴 항목: 피드백 이메일 설정, 공개 지도 보기, 로그아웃.
   - `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`/`role="menuitem"`, Escape·바깥클릭 닫힘·초점 복귀.
2. `admin-ui.css` 모바일 규칙 조정: 데스크톱은 인라인 유지, 모바일은 더보기 메뉴 안으로 이동(개별 `display:none` 대신 메뉴로 재배치).

**완료 기준**: 모바일 관리자에서 데스크톱과 동일한 계정·설정·지도보기·로그아웃 접근.

**테스트**: Playwright 모바일 관리자 — 더보기 메뉴에서 3개 항목 접근 가능 assert.

---

### Phase 1 공통

- 위 3건에 대한 모바일 E2E 시나리오를 `tests/`(기존 Playwright 구조)에 추가.
- 데스크톱 회귀가 없는지 기존 E2E 재실행.

---

## Phase 2 — 신뢰성과 다크 모드

### P0-03. 관리자 인라인 색상 → 디자인 토큰 전환

**대상 파일 (하드코딩 색상 offender)**

- `src/app/admin/page.tsx` — 57,76,93,104,105,123,124
- `src/app/admin/dashboard/facilities/page.tsx` — 96,109,112,132,140,157,166,171,185–187,202,203,216,228
- `src/app/admin/dashboard/slopes/page.tsx` — 130,132,161,162,174,178,187,189,197,199,212,217,220,226,237,239,251,253
- `src/app/admin/dashboard/landmarks/page.tsx` — 63,76,79,96,97,106,114,131,142,146,155,156,166,178
- `src/app/admin/buildings/new/page.tsx` — 17,22,28,99,100,112,126,129,176,179,186,206,222,223,227,238,239 **(래퍼 밖)**
- `src/app/admin/buildings/[id]/page.tsx` — 약 54곳(199~941) **(래퍼 밖, 최우선)**
- 토큰 정의: `src/app/globals.css` — light `:root` (3-28), dark `@media prefers-color-scheme` (30-57): `--ku-surface #211d1a`, `--ku-text-1 #f7f3ef`, `--ku-border #453e38` 등.

**구현 방식 (매핑 규칙)**

- 표면 `#fff`/`background:"#fff"` → `var(--ku-surface)`
- 본문 텍스트 `#111`,`#1c1917` → `var(--ku-text-1)`; 보조 `#555`,`#888` → `var(--ku-text-2)`; 흐린 `#aaa`,`#bbb` → `var(--ku-text-3)`
- 경계 `#e5e7eb`,`#ddd`,`#f5f5f5`,`#d1d5db` → `var(--ku-border)`
- 상태 pill(`#EAF3DE/#3B6D11`, `#FCEBEB/#A32D2D`, `#FEF3C7/#92400E`), 주요/위험 버튼(`#2563EB`,`#DC2626`,`#8C0000`), 오버레이 `rgba(0,0,0,0.55)`: 필요한 토큰이 없으면 `globals.css`에 상태/오버레이 토큰을 신설한 뒤 매핑.
- `--campus-color` 폴백 `#8A837D`(buildings/page 168,223)은 표면/텍스트 아님 → 대비 이슈 없으면 유지.
- **주의(한글 인코딩)**: 편집 후 커밋 전 mojibake 검수(`git diff`에서 한글 깨짐 확인).

**작업 순서(우선순위)**: 래퍼 밖 폴백 없는 2파일 먼저 → `[id]/page.tsx`(최다) → `new/page.tsx` → 나머지 dashboard 4파일.

**완료 기준**: 시스템 다크 모드에서 관리자 로그인·시설/명소/경사도/건물 목록·건물 상세·모든 모달의 본문·보조문구·입력값이 WCAG AA(본문 4.5:1, 큰 텍스트 3:1) 충족.

**테스트**: 라이트/다크 시각 회귀 스냅샷(관리자 핵심 화면). 대비는 대표 조합 수동/자동 체크.

---

### P0-04. 공개 지도 데이터 오류·재시도 상태

**대상 파일**: `src/components/map/useMapData.ts`

**현재 상태**

- 빈 catch: `:48`(facilities), `:66`(slopes). 명소 실패는 `:73` 빈 배열 대체. `facility_types` 쿼리(51-59)는 오류 처리 없음.
- 모든 fetch가 `.then(r => r.json())`로 `.ok` 미확인.
- 상태: `loadingMap`은 buildings+boundaries `Promise.all`만 커버(30/41). facilities·slopes·landmarks·facilityTypes는 로딩/에러 플래그 없음.

**구현 방식**

1. 데이터 소스별 `{ status: 'loading' | 'error' | 'ready', retry }` 상태 도입(buildings, facilities, slopes, landmarks, facilityTypes).
2. 각 fetch에서 `res.ok` 확인 → 실패 시 `error` 상태로. **접근성 시설/경사도 오류는 빈 배열로 대체 금지**(오류로 유지).
3. 재시도: 각 소스 refetch 함수를 반환하거나 `retry()` 노출.
4. UI: 지도 상단에 비차단 배너/토스트로 "○○ 정보를 불러오지 못했어요 · 다시 시도" 표시. 빈 데이터 문구와 구분.

**완료 기준**: 각 API의 4xx/5xx/네트워크 실패에서 오류 종류 + 재시도가 표시되고, "정보 없음"과 구분됨.

**테스트**: fetch 목으로 각 소스 4xx/5xx/네트워크 실패 주입 → 오류 배너·재시도 노출, 빈 상태와 구분 assert.

---

### P0-05. 건물 상세 조회 실패 구분

**대상 파일**: `src/components/SidePanel.tsx` (병렬 조회 84-106)

**현재 상태**

- `Promise.all`에서 `{ data }`만 구조분해, Supabase `error` 미사용(84-103). `:104-106` 데이터만 상태 저장.
- 실패 시 `facilities`가 `[]` → `FacilityList`(`:29-30`)가 `등록된 접근성 정보가 없어요`(translations.ts:27) 렌더 → 오류를 "정보 없음"으로 오인. `loading` 상태만 존재, error 상태 없음.

**구현 방식**

1. 세 조회(building/facilities/photos) 각각 `error` 구조분해.
2. 섹션별 `error` 상태 추가 — 어느 조회가 실패했는지 구분.
3. 실패 섹션에 재시도 버튼 + 오류 안내. `FacilityList`에 "오류" 브랜치 추가(빈 상태와 별개).

**완료 기준**: 조회 실패 시 빈 상태 문구 대신 오류 안내 + 다시 불러오기 노출.

**테스트**: Supabase 목으로 각 조회 개별 실패 → 해당 섹션 오류·재시도 노출, 빈 상태와 구분 assert.

---

### P1-12. 관리자 시설 상태 변경 오류 처리 (Phase 2 포함)

**대상 파일**: `src/app/admin/buildings/[id]/page.tsx:187-196` (`handleToggleInstalled`)

**현재 상태**: `await supabase...update()` 결과의 `error`를 확인하지 않고 `fetchData()` + 성공 토스트 호출 → 실패해도 성공으로 표시.

**구현 방식**: 형제 핸들러와 동일 패턴 적용(참조: `handleDeleteBuilding` 126-135, `handleSaveName` 156-170).

```
const { error } = await supabase.from("building_facilities").update(...).eq("id", ...);
if (error) { showToast("변경에 실패했어요", "error"); return; }
```

- 처리 중 버튼 비활성화(중복 클릭 방지). 낙관적 갱신을 쓸 경우 실패 시 롤백.

**완료 기준**: 변경 실패 시 성공 토스트 미표시 + 오류 토스트 노출, 상태 원복.

**테스트**: update 목 실패 주입 → 성공 토스트 미노출 + 상태 유지 assert.

---

### Phase 2 공통

- 라이트/다크 시각 회귀 테스트를 공개·관리자 핵심 화면에 추가.

---

## 완료 체크리스트 (P0)

- [ ] 390px에서 언어 변경(ko/en/zh) 가능 · 키보드/스크린리더 동등
- [ ] 390px에서 즐겨찾기 열기·빈상태·항목 선택·지도 이동
- [ ] 모바일 관리자에서 설정·지도보기·로그아웃 접근
- [ ] 다크 모드 관리자 핵심 화면 텍스트 대비 WCAG AA
- [ ] facilities/slopes/landmarks/buildings API 오류·빈상태 구분 + 재시도
- [ ] 건물 상세 조회 실패 구분 + 재시도
- [ ] 시설 상태 변경 실패 시 성공 메시지 미표시
- [ ] 관련 모바일·다크·오류 E2E/회귀 테스트 추가 및 통과
