# 모두의 캠퍼스 — KU 배리어프리 웹 지도

> 고려대학교 장애인·이동약자를 위한 인터랙티브 배리어프리 웹 지도

[![Next.js](https://img.shields.io/badge/Next.js-16_App_Router-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-DB%20%2F%20Storage%20%2F%20Auth-3ECF8E?logo=supabase)](https://supabase.com/)
[![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-Storage-F38020?logo=cloudflare&logoColor=white)](https://www.cloudflare.com/developer-platform/r2/)
[![Leaflet](https://img.shields.io/badge/Leaflet-react--leaflet-199900?logo=leaflet)](https://leafletjs.com/)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?logo=vercel)](https://vercel.com/)

---

## 📖 프로젝트 소개

고려대학교 캠퍼스 내 엘리베이터, 경사로, 장애인 화장실, 점자블록 등 접근성 시설 정보를 통합 제공하는 웹 기반 배리어프리 지도입니다.

기존 정적 이미지 지도의 한계(분리 운영, 정보 미갱신, 검색 불가)를 극복하고, 인문·자연계 캠퍼스와 안암병원·녹지캠퍼스까지 아우르는 **통합 인터랙티브 플랫폼**을 구축하는 것을 목표로 합니다.

접근성 정보를 다루는 서비스인 만큼, 지도 UI 자체의 접근성(모달 초점 관리, 스크린리더 알림, 44px 터치 타겟, 키보드 탐색)도 별도 감사를 거쳐 구현했습니다.

본 프로젝트는 **2026학년도 고려대학교 체인지메이커스 프로젝트(대학원)**의 일환으로 진행됩니다.

---

## 🚀 핵심 성과

- **현장 실측 기반 경사도 입력** — 배포된 경로를 감사해 표시 구간 137개 중 31개(23%)가 GPS 고도 노이즈 탓에 0.0% 평지로 그려지는 것을 확인하고, 관리자가 지도에 경로를 그린 뒤 구간별 실측값을 직접 넣는 방식으로 전환
- **접근성 전수 감사 기반 개선** — UX 감사 문서(`docs/audits/`)로 P0~P3 항목을 분류하고, 모달 초점 트랩·라이브 리전·터치 타겟·폼 라벨을 순차 구현하며 E2E로 회귀를 고정
- **JavaScript → TypeScript 전면 이관** — 설계 문서를 먼저 작성한 뒤 `src/` 전체(138개 파일)를 `strict` 모드로 이관하고, 우회로 남아 있던 암묵적 `any` 162건까지 걷어 `no-explicit-any`를 error로 유지
- **결정론적 E2E 환경 구축** — 980줄 목 백엔드(PostgREST·Next 라우트·Auth·브라우저 API 스텁)로 외부 의존 없이 15개 spec·124개 시나리오를 실행
- **마이그레이션 안전장치** — 적용된 마이그레이션의 수정·삭제를 CI에서 차단하고, 적용 후 로컬↔원격 이력 일치를 별도 잡에서 검증
- **다국어 자동화** — Papago NMT 연동으로 시설·명소 정보를 자동 번역하고, 번역 실패를 관리자 화면에 드러내 개별·일괄 재번역 가능

---

## ✨ 주요 기능

### 사용자

- 🗺️ **캠퍼스 건물 폴리곤 지도** — OpenStreetMap 기반 고려대 건물 시각화, 캠퍼스별 색상 구분
- 🌓 **시스템 테마 연동** — OS 다크 모드에 맞춰 CARTO `light_all`/`dark_all` 타일 자동 전환, 다크 시 건물 색을 고대비로 교체
- 🛰️ **항공사진 전환** — Esri World Imagery 타일 토글, 위성 모드에서도 폴리곤 대비 유지
- 🏷️ **건물·명소 라벨** — 전용 Leaflet Pane에 상시 라벨 렌더, 줌 임계값(데스크톱 17 / 모바일 18) 이상에서만 노출, 언어 전환 시 즉시 갱신
- 🔍 **통합 검색** — 건물·명소 통합 콤보박스, ARIA 키보드 탐색(`aria-activedescendant`), 음성 검색, 결과 없음/총 개수 안내
- 📋 **둘러보기 목록** — 현재 화면 범위 안의 시설·명소를 사용자 위치 기준 거리순으로 정렬해 표시
- 📍 **현 위치** — 정확도 원과 마커 표시, 캠퍼스 범위 밖이면 이동하지 않고 안내, 권한 거부·타임아웃 구분
- 🏢 **건물 사이드패널** — 사진 캐러셀, 시설별 설치 상태, 즐겨찾기, **TTS 음성 안내**, 모바일 스와이프 닫기
- 📌 **시설·명소 마커** — 시설은 유형별 lucide 아이콘, 명소는 관리자가 지정한 이모지. 픽셀 격자 군집(zoom < 18)으로 저줌 가독성 확보, 확대 시 펼침
- 🏫 **필터** — 캠퍼스 영역(인문사회계/자연계/녹지캠퍼스/의료원), 시설 유형(DB 동적), 경사도, 명소. 모바일 활성 필터 개수 배지
- 📐 **경사도 오버레이** — 구간별 경사도 색상 시각화 + 범례 (법적 기준 1/12 구분선). 좌표나 경사값이 깨진 행은 그리기 전에 통째로 걸러 냄
- ⭐ **즐겨찾기** — localStorage 저장, 커스텀 이벤트로 지도 스타일 동기화
- 🌐 **다국어 지원** — 한국어 / English / 中文, 건물·시설·명소 정보까지 다국어 폴백
- 🚇 **지하철역 마커** — 고려대·안암·보문역
- 💬 **피드백** — 4개 유형 서버 접수, 허니팟 스팸 방지, 실패 시 재시도 + 메일 대안
- 🧯 **비차단 오류 배너** — 데이터 소스별 로딩/오류 상태를 "정보 없음"과 구분하고 재시도 제공
- 📱 **모바일 반응형** — 스마트폰 현장 조사 대응

### 관리자

- 🔒 **로그인 + 세션 유지** — Supabase Auth, 미인증 시 대시보드 진입 차단
- 📊 **건물 보완 현황 요약** — `admin_building_flags` 뷰를 집계한 `get_admin_building_summary()` RPC로 등록 시설 수 / 시설 정보 없음 / 사진 없음 / 위치 없음 / 갱신일 365일 경과 / 번역 필요를 카드로 표시. **카드를 누르면 같은 뷰 정의로 목록이 좁혀지고** 검색어와 AND로 걸립니다. 집계 실패는 화면에 드러냅니다
- 🏗️ **건물 추가** — 지도에서 폴리곤 직접 그리기 + 폴리곤 기반 **캠퍼스 자동 판정**
- ✏️ **건물 상세 관리** — 이름·단과대·시설·폴리곤을 카드 단위로 분리, 폴리곤은 편집 전에 미리 보고 편집으로 넘어갈 때 화면이 튀지 않음. **미저장 이탈 경고** 포함
- 🧱 **시설 상세 모달** — 목록의 시설 행을 누르면 상세 모달이 열리고, 손봐야 할 행에만 배지(미설치·번역 필요 등)를 붙여 상태를 드러냄
- 🖼️ **사진 업로드** — 브라우저에서 크기를 줄여 WebP로 변환한 뒤 올리고, 파일별 성공/실패를 개별 표시해 **실패한 항목만 재시도**
- 🎞️ **건물 동영상 섹션** — 시설 영상을 건물 단위 섹션에서 관리. presigned URL로 R2 직접 업로드, 퍼센트 진행률, 자막 저장. 업로드 전 **브라우저 재생 가능 여부를 검사**해 디코드 불가한 코덱(아이폰 HEVC 등)만 H.264로 변환하고, 용량 상한은 서버·클라이언트·안내 문구가 한 모듈에서만 값을 가져감
- 🧩 **독립 시설 관리** — 건물에 속하지 않는 시설 CRUD, 검색·유형·설치여부 필터·정렬
- 🌍 **번역 실패 표시** — 자동 번역 실패를 "번역 필요" 배지로 드러내고 **개별·일괄 재번역** 제공 (저장 성공과 번역 실패를 분리)
- 🏞️ **명소 관리** — 캠퍼스 명소 CRUD, 이모지 지정, 사진 유무 필터, 사진 포함 단일 저장
- 📐 **경사도 경로 관리** — 지도에 경로를 그리고 **구간별 실측 경사도를 직접 입력·수정**. 입력값에 따라 선 색을 미리 보여주고 법적 기준(1/12)·급경사 경고를 표시하되 저장은 막지 않습니다. GPX 업로드는 종료했고, 기존 GPX 행은 측정 원본이라 다운로드·삭제만 가능합니다
- 📄 **서버 페이지네이션** — 모든 목록에 번호 페이지네이션(`aria-current="page"` + 라이브 안내) 적용
- 🔄 **Overpass API 동기화** — 3개 서버 순차 시도 방어 로직
- ⚙️ **앱 설정 관리** — 피드백 수신 이메일 등 동적 설정

### 접근성 (a11y)

- 🎯 **모달 초점 관리** — 중첩 모달 스택 지원, Tab 순환 트랩, Escape 닫기(최상단만 반응), 닫힐 때 이전 초점 복원. 삭제 성공으로 실행 버튼이 사라진 경우 남은 모달 안으로 복귀
- 📢 **라이브 리전** — 오류 토스트는 `role="alert"`(assertive), 성공/안내는 `role="status"`(polite)
- 👆 **44px 터치 타겟** — 관리자 행 액션·지도 컨트롤·Leaflet 기본 컨트롤까지 모바일 최소 터치 영역 보장 (시각 크기는 유지하고 히트 영역만 확장)
- 🏷️ **폼 라벨 연결** — `htmlFor`/`id` 쌍 또는 `aria-label`로 모든 입력을 프로그램적으로 연결
- ⌨️ **키보드 탐색** — 검색 콤보박스 ARIA 패턴, 페이지네이션 `aria-current="page"`, 모바일 계정 메뉴 `role="menu"`
- 🙈 **장식 아이콘 은닉** — lucide 아이콘과 명소 이모지는 `aria-hidden`으로 접근성 트리에서 감추고, 같은 정보를 텍스트로 따로 남김

---

## 🛠️ 기술 스택

| 구분             | 기술                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Framework        | Next.js 16 (App Router)                                                                               |
| Language         | TypeScript 5.9 (`strict`)                                                                             |
| UI               | React 19 (React Compiler 활성화)                                                                      |
| 아이콘           | lucide-react(JSX) + lucide-static(Leaflet divIcon용 SVG 문자열)                                       |
| 지도             | Leaflet + react-leaflet, CARTO Positron/Dark Matter, Esri World Imagery                               |
| 폴리곤·경로 편집 | leaflet-geoman                                                                                        |
| Backend          | Next.js Route Handlers                                                                                |
| DB / Auth        | Supabase (PostgreSQL, Auth, RLS)                                                                      |
| Storage          | Supabase Storage(건물 사진) + Cloudflare R2(명소 사진·시설 영상)                                      |
| 번역             | Papago NMT API                                                                                        |
| 영상 처리        | ffmpeg.wasm (재생 불가 코덱만 H.264 변환)                                                             |
| 스타일           | CSS 파일 + CSS 변수 디자인 토큰(`--ku-*`), 라이트/다크 정의 (Tailwind 미사용)                         |
| Font             | Pretendard                                                                                            |
| Test             | Vitest(단위) + Playwright(E2E)                                                                        |
| Lint/Format      | ESLint 9 (flat config), Prettier                                                                      |
| CI               | GitHub Actions (migration-safety·lint·format·typecheck·test·e2e → migrate → verify-migration-history) |
| Analytics        | Vercel Analytics, Speed Insights                                                                      |
| 배포             | Vercel (`hnd1` 리전)                                                                                  |

---

## 📁 폴더 구조

```text
src/
  app/
    layout.tsx                       # 루트 레이아웃 — metadata/OG/JSON-LD, LanguageProvider, Analytics
    page.tsx                         # 메인 지도 페이지
    globals.css                      # 전역 CSS 변수 토큰(라이트/다크) + Leaflet 오버라이드
    sitemap.ts                       # 동적 사이트맵
    admin/
      admin-ui.css                   # 관리자 콘솔 스타일시트
      page.tsx                       # 관리자 로그인
      dashboard/
        layout.tsx                   # 인증 가드, 4탭 내비, 모바일 계정 메뉴
        page.tsx                     # /admin/dashboard → buildings 리다이렉트
        buildings/page.tsx           # 건물 목록 — 보완 현황 카드 + 플래그 필터 + 검색 + 서버 페이지네이션
        facilities/page.tsx          # 독립(건물 미소속) 시설 관리
        landmarks/page.tsx           # 캠퍼스 명소 관리
        slopes/page.tsx              # 경사도 경로 목록 — 수기/GPX 구분, GPX 다운로드·삭제
      buildings/
        new/page.tsx                 # 신규 건물 추가 (폴리곤 그리기 + 캠퍼스 자동 판정)
        [id]/page.tsx                # 건물 상세 — 카드 조합 + 저장·삭제·복구 오케스트레이션
      slopes/
        new/page.tsx                 # 경사도 경로 그리기
        [id]/page.tsx                # 경사도 경로 수정 (수기 경로만, 낙관적 잠금)
    api/
      buildings/route.ts             # 건물 GeoJSON + ?sync=true Overpass 동기화(3서버 폴백)
      facilities/route.ts            # 시설 마커 데이터
      landmarks/route.ts             # 명소 데이터
      slopes/route.ts                # 경사도 구간 데이터 (id·name·segments만)
      feedback/route.ts              # 피드백 접수 (service_role 경유)
      translate/route.ts             # Papago 번역 프록시 (requireAdmin)
      revalidate-facilities/route.ts # 시설 ISR 캐시 무효화
      revalidate-landmarks/route.ts  # 명소 ISR 캐시 무효화
      upload-building-photo/route.ts # 건물 사진 → Supabase Storage
      delete-building-photo/route.ts
      upload-landmark-photo/route.ts # 명소 사진 → R2
      delete-landmark-photo/route.ts
      upload-facility-video/route.ts # 시설 영상 → R2
      facility-video-presign/route.ts# R2 presigned PUT URL 발급 (용량 상한 강제)
      facility-video-confirm/route.ts# 업로드 완료 확인 후 DB 반영
      delete-facility-video/route.ts
      settings/feedback-emails/route.ts
  components/
    MapWrapper.tsx                   # dynamic import (ssr: false)
    SidePanel.tsx                    # 건물 상세 패널 (사진·시설·즐겨찾기·TTS·스와이프 닫기)
    FacilityMap.tsx                  # 시설 좌표 지정용 미니 지도
    PolygonEditor.tsx                # 관리자 폴리곤 그리기/편집
    BuildingPolygonPreview.tsx       # 편집 전 폴리곤 미리보기 (편집기와 같은 중심·주변 레이어)
    SlopeRouteEditor.tsx             # 경사도 경로 편집기 — 지도·구간 목록·저장 상태 소유
    Toast.tsx                        # 토스트 (role=alert/status)
    ConfirmModal.tsx                 # 확인 모달 (초점 관리 + pending 상태)
    map/
      Map.tsx                        # 지도 메인 — 타일 전환·폴리곤·툴팁·컨트롤 조합
      map-ui.css
      useMapData.ts                  # 데이터 로드 훅 + 소스별 status/retry
      MapViewportObserver.tsx        # 현재 뷰포트 관측
      MapErrorBanner.tsx             # 비차단 오류 배너 + 재시도
      MapBrowseList.tsx              # 현재 범위 시설·명소 둘러보기 목록
      SearchControl.tsx              # 통합검색 콤보박스 (키보드·음성)
      FilterPanel.tsx                # 캠퍼스·시설·경사도·명소 필터
      FavoritesList.tsx              # 즐겨찾기 목록
      LanguageSwitcher.tsx           # 언어 전환
      FacilityMarkers.tsx            # 시설 마커 + 픽셀 격자 군집
      LandmarkMarkers.tsx            # 명소 마커 + 군집 + 사진 팝업
      SubwayMarkers.tsx              # 지하철역 마커
      SlopeLayer.tsx / SlopeLegend.tsx
      FeedbackButton.tsx             # 피드백 모달 (서버 제출 + 메일 대안)
      iconography.tsx                # JSX용 lucide 아이콘 · 명소 이모지 컴포넌트
      facilityColors.ts / subwayStations.ts
    sidepanel/
      SidePanelHeader.tsx / PhotoCarousel.tsx / FacilityList.tsx
    slope/
      SlopeRouteMap.tsx              # Leaflet·geoman 격리 — 경로 그리기 + 색상 미리보기
      SlopeSegmentList.tsx           # 구간별 경사도 입력 + 기준 초과 경고
    admin/
      AdminListControls.tsx          # 검색 + 필터 슬롯 + 결과수(role=status)
      AdminPagination.tsx            # 번호 페이지네이션 (aria-current + 라이브 안내)
      FacilityDetailModal.tsx        # 시설 상세 모달 (행 클릭 진입점)
      FacilityFormModal.tsx          # 시설 생성/수정
      FacilityVideoModal.tsx         # 영상 업로드(진행률) + 자막
      FacilityInstallationControl.tsx# 설치 여부 토글
      FacilityTranslationControl.tsx # 번역 필요 배지 + 재번역
      BulkRetranslateButton.tsx      # 건물 단위 일괄 재번역
      BuildingPhotoManager.tsx       # 사진 업로드/삭제 (WebP 변환 · 실패만 재시도)
      BuildingVideoManager.tsx       # 건물 단위 시설 영상 섹션
      building-detail/               # 건물 상세 카드 — 헤더·이름·단과대·시설 목록·폴리곤
      LandmarkFormModal.tsx / FeedbackEmailModal.tsx / AddFacilityButton.tsx
  lib/
    supabaseClient.ts                # Supabase 클라이언트
    r2.ts                            # Cloudflare R2 클라이언트 / presign
    requireAdmin.ts                  # 관리자 API 가드
    authedFetch.ts                   # 인증 fetch 헬퍼
    LanguageContext.tsx              # 다국어 Context (KO/EN/ZH)
    translations.ts                  # UI 문자열 번역 딕셔너리
    theme.ts                         # 디자인 토큰 · 캠퍼스/시설/경사 색상
    mapIcons.ts                      # 아이콘 키 매핑 · lucide-static SVG · 명소 이모지 폴백
    mapTiles.ts                      # 라이트/다크 타일 URL 결정
    usePrefersDarkMode.ts            # prefers-color-scheme 구독
    useModalFocus.ts                 # 모달 초점 트랩/복원 (중첩 스택)
    mapMarkerLayout.ts               # 픽셀 격자 마커 군집
    campusGeometry.ts                # 폴리곤 → 캠퍼스 자동 판정
    polygonCenter.ts                 # 폴리곤 중심 (편집기·프리뷰 공용)
    neighborBuildings.ts             # 주변 건물 조회 + 모듈 캐시
    neighborLayer.ts                 # 주변 건물 회색 레이어 렌더
    slopeRoute.ts                    # 경사 경로 계산·검증·저장 포맷 변환 (순수 함수)
    adminBuildingSummary.ts          # 보완 현황 집계 판정 + 플래그 필터
    adminList.ts                     # 목록 검색·정렬·페이지 범위 계산
    facilityBadges.ts                # 시설 행 배지 판정
    facilityForm.ts / facilityDelete.ts / landmarkDelete.ts
    facilityTranslation.ts / facilityTranslationState.ts
    feedback.ts                      # 피드백 유형 정의·입력 검증
    settings.ts / useCampusBoundaries.ts / useDebouncedValue.ts
    imageToWebP.ts                   # 업로드 전 이미지 축소 + WebP 변환
    videoUpload.ts                   # 동영상 용량 상한과 표기의 단일 출처
    videoPlayback.ts                 # 업로드 전 비디오 트랙 디코드 가능 여부 판별
    compressVideo.ts                 # ffmpeg.wasm H.264 변환
  scripts/
    syncBuildings.ts                 # Overpass → Supabase 건물 동기화
  types/
    domain.ts                        # database.types.ts 기반 도메인 타입
e2e/                                 # Playwright E2E (15 spec) + support/mockBackend.ts
supabase/
  migrations/                        # SQL 마이그레이션 (15개)
  database.types.ts                  # 생성된 DB 타입
docs/
  specs/                             # 설계 문서
  plans/                             # 구현 계획서 (머지 시 회수)
  audits/                            # UX·모바일 UI 전수 감사
  TODO_list/                         # 남은 개별 과제
  future-development/                # 후속 개발 문서
  database-migrations.md             # 마이그레이션 운영 문서
scripts/
  check-migrations.sh                # 마이그레이션 안전 검사 (CI)
  build-supabase-db-url.sh           # 마스킹된 DB 접속 URI 구성 (CI 공용)
```

---

## 🗄️ DB 스키마 (Supabase)

```sql
-- 건물 정보
buildings
  id           bigint primary key   -- OSM way id (수동 추가는 음수)
  name         text
  name_en      text
  campus       text                 -- '인문사회계' | '자연계' | '녹지캠퍼스' | '의료원'
  college_id   bigint → colleges(id)
  geojson      jsonb                -- GeoJSON Feature (폴리곤)
  is_deleted   boolean default false
  deleted_at   timestamptz
  last_updated date
  created_at   timestamptz

-- 단과대
colleges
  id       bigint primary key
  name     text
  name_en  text
  name_zh  text

-- 건물 사진 (건물당 다중)
building_photos
  id          bigint primary key
  building_id bigint → buildings(id)
  url         text
  caption     text
  caption_en  text
  caption_zh  text
  created_at  timestamptz

-- 시설 유형 (아이콘은 DB가 아니라 코드의 lucide 매핑에서 고른다)
facility_types
  code      text primary key        -- 'elevator' | 'restroom' | 'ramp' | 'parking' | 'braille'
  label     text
  label_en  text
  label_zh  text

-- 시설 정보 (building_id가 NULL이면 독립 시설)
building_facilities
  id                 uuid primary key
  building_id        bigint → buildings(id)   -- nullable
  facility_code      text → facility_types(code)
  is_installed       boolean
  name               text / name_en / name_zh
  description        text / description_en / description_zh
  floor_info         text / floor_info_en / floor_info_zh
  lat                double precision
  lng                double precision
  video_url          text                     -- 시설 영상 (R2)
  video_caption      text / video_caption_en / video_caption_zh
  translation_status text not null            -- 'pending' | 'translated' | 'failed'
  created_at         timestamptz
  updated_at         timestamptz not null     -- 트리거 자동 갱신

-- 캠퍼스 명소
landmarks
  id          uuid primary key
  name        text / name_en / name_zh
  description text / description_en / description_zh
  lat         double precision
  lng         double precision
  icon        text not null default '✨'      -- 관리자가 지정하는 이모지, CHECK char_length ≤ 8
  image_url   text
  photo_url   text
  created_at  timestamptz
  updated_at  timestamptz

-- 경사도 구간
slope_segments
  id         uuid primary key
  name       text                    -- 구간 식별명
  segments   jsonb                   -- SlopePoint[] = { lat, lng, ele, slope?, distance? }
                                     -- 수기 경로는 ele=null이고 2번째 포인트부터 slope·distance를 담는다
  gpx_file   text                    -- NULL이면 수기 경로, 값이 있으면 GPX 측정 원본
  created_at timestamptz
  updated_at timestamptz not null    -- 수정 화면의 낙관적 잠금 조건

-- 사용자 피드백
feedback_submissions
  id            uuid primary key
  feedback_type text                 -- 'error' | 'facility' | 'feature' | 'other'
  content       text                 -- 3~2000자 (CHECK)
  page_url      text                 -- ≤500자
  status        text                 -- 'new' | 'reviewing' | 'resolved'
  created_at    timestamptz

-- 앱 동적 설정
app_settings
  key        text primary key
  value      jsonb                   -- 예) feedback_emails: { to, cc, subject }
  updated_at timestamptz

-- 건물별 보완 플래그 뷰 (security_invoker)
-- 요약 카드 숫자와 목록 필터가 둘 다 이 뷰를 보게 해 정의가 갈라지지 않게 한다.
admin_building_flags
  building_id        bigint
  missing_facility   boolean
  missing_photo      boolean
  missing_location   boolean
  stale_update       boolean         -- last_updated IS NULL OR < current_date - 365
  translation_needed boolean

-- 관리자 보완 현황 집계 함수 (위 뷰 기반)
get_admin_building_summary()
  → registered_facility_count, missing_facility_count, missing_photo_count,
    missing_location_count, stale_update_count, translation_needed_count,
    translation_needed_building_count
```

### RLS 정책

건물·시설 계열의 관리 작업은 브라우저에서 직접 쓰지 않고 **API Route의 service_role**을 경유합니다.

| 테이블                                                                    | anon               | authenticated | 비고                                       |
| ------------------------------------------------------------------------- | ------------------ | ------------- | ------------------------------------------ |
| buildings, building_facilities, facility_types, building_photos, colleges | SELECT             | SELECT        | 쓰기는 service_role 전용                   |
| slope_segments, landmarks                                                 | SELECT             | ALL           | 로그인 세션이 브라우저에서 직접 쓴다       |
| app_settings                                                              | SELECT             | SELECT        | 쓰기 정책 없음 → service_role 전용         |
| feedback_submissions                                                      | 없음               | 없음          | `revoke all` — `POST /api/feedback`만 접근 |
| `admin_building_flags` (view)                                             | revoke all         | grant select  | `security_invoker = on`                    |
| `get_admin_building_summary()`                                            | revoke from public | grant execute |                                            |

`rls_auto_enable()` 함수의 외부 EXECUTE 권한은 회수되어 있습니다.

`slope_segments`와 `landmarks`는 `authenticated` 전체에 쓰기가 열려 있어 폼을 거치지 않은 값이 REST로 들어올 수 있습니다. 그래서 `landmarks.icon`은 길이를 DB `CHECK`로 막고, 경사 경로는 공개 지도가 그리기 전에 좌표·경사값의 유한성을 확인해 못 쓰는 행을 통째로 버립니다. 관리자 역할 검사 도입은 [`docs/TODO_list/auth/require-admin-role-check.md`](docs/TODO_list/auth/require-admin-role-check.md)에 남겨 두었습니다.

---

## ⚙️ 환경 변수

프로젝트 루트에 `.env.local` 파일을 생성하세요. 값은 관리자에게 문의하세요.

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 건물 동기화 보호
SYNC_SECRET=

# Papago NMT (시설·명소 자동 번역)
PAPAGO_CLIENT_ID=
PAPAGO_CLIENT_SECRET=

# CARTO 베이스맵 (없으면 타일에 워터마크가 찍힌다)
NEXT_PUBLIC_CARTO_API_KEY=

# Cloudflare R2 (명소 사진·시설 영상)
CLOUDFLARE_R2_ENDPOINT=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=
CLOUDFLARE_R2_PUBLIC_URL=

# 로컬 마이그레이션용
SUPABASE_DB_URL=
SUPABASE_DB_PASSWORD=
```

---

## 🚀 로컬 실행

```bash
# 패키지 설치
npm install

# 개발 서버 실행
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

### 건물 데이터 동기화

```bash
npm run sync-buildings
```

Overpass API를 통해 고려대 캠퍼스 건물 데이터를 Supabase에 동기화합니다. 3개 Overpass 서버를 순차 시도하는 방어 로직이 있습니다.

관리자 API로 수동 실행도 가능합니다.

```
GET /api/buildings?sync=true&secret={SYNC_SECRET}
```

---

## 🧪 품질 관리

```bash
npm run lint          # ESLint
npm run format:check  # Prettier 검사
npm run typecheck     # tsc --noEmit
npm run test          # Vitest 단위 테스트
npm run test:e2e      # Playwright E2E
npm run test:e2e:ui   # Playwright UI 모드
```

### 테스트 범위

**Vitest 단위 테스트 (23개 파일, 146개 테스트)** — 목록 검색·정렬·페이지 계산(`adminList`), 보완 현황 집계·플래그 필터(`adminBuildingSummary`), 캠퍼스 자동 판정(`campusGeometry`), 폴리곤 중심(`polygonCenter`), 주변 건물 캐시(`neighborBuildings`), 마커 군집(`mapMarkerLayout`), 아이콘 매핑(`mapIcons`·`iconography`), 시설 색·배지(`facilityColors`·`facilityBadges`), 경사 경로 계산·검증·저장 포맷(`slopeRoute`), 타일 전환(`mapTiles`), 관리자 가드(`requireAdmin`), 인증 fetch(`authedFetch`), 시설·명소 폼/삭제/번역 로직, 동영상 상한·재생 가능 판정, 피드백 입력 검증, 피드백·명소 삭제 API 라우트.

경사 경로 판단 로직은 전부 `src/lib/slopeRoute.ts`의 순수 함수로 빼 두었습니다. Vitest가 `environment: "node"`로 돌기 때문에, Leaflet에 묶인 채로는 단위 테스트가 닿지 않습니다.

**Playwright E2E (15개 spec, 124개 시나리오)**

| 파일                                    | 검증 대상                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public-map.spec.ts`                    | 지도 로드, 건물·명소 라벨 줌·언어 반영, 패널 z-order, 검색→상세→즐겨찾기 영속, 필터, 마커 군집, 둘러보기 목록, 다국어 팝업, **시스템 색상 모드별 타일 교체**, 피드백 성공/실패, TTS·음성검색 미지원 안내                                                      |
| `public-map-p0.spec.ts`                 | 모바일 언어 드롭다운·상단 컨트롤 간격·목록 패널 겹침, 모바일 즐겨찾기, **API 실패 → 오류 배너 → 재시도 복구**, 조회 실패와 빈 상태 구분                                                                                                                       |
| `public-map-p1.spec.ts`                 | 현재위치 성공/권한거부, 모바일 필터 배지, 캠퍼스 필터                                                                                                                                                                                                         |
| `public-map-p1-remainder.spec.ts`       | 시설 영상 접근 이름·자막, 상세 패널 스와이프 닫기, 음성인식 실패 구분                                                                                                                                                                                         |
| `public-map-search.spec.ts`             | 영문 부분일치, 키보드 이동·Enter 선택, Escape 동작, 결과 없음, 라벨 언어 추종, 총 개수 안내                                                                                                                                                                   |
| `admin-auth.spec.ts`                    | 비로그인 리다이렉트, 로그인/로그아웃, 피드백 이메일 변경                                                                                                                                                                                                      |
| `admin-buildings-slopes.spec.ts`        | **보완 현황 서버 집계 표시**, 서버 페이지네이션, 건물 생성 검증·폴리곤 저장, 소프트 삭제/복원, **사진 파일별 성공/실패 + 실패만 재시도**, **경로 그리기·구간 입력·저장 포맷**, 열어둔 사이 바뀐 행·GPX 행 보호, **저장한 경로가 공개 지도에 그려지는지 확인** |
| `admin-buildings-flag-filter.spec.ts`   | 경고 카드 클릭 시 목록 개수가 카드 숫자와 일치, 필터·검색어 AND 결합, 0건 카드의 빈 목록 처리                                                                                                                                                                 |
| `admin-building-facility-modal.spec.ts` | 시설 행 → 상세 모달, 유형별 아이콘, 배지가 붙는 조건, 상태 토글의 목록 반영, 초점 복귀(닫기·ESC·삭제), 일괄 재번역 성공/실패                                                                                                                                  |
| `admin-building-video.spec.ts`          | 건물 동영상 섹션 목록, 업로드 모달, 교체 경고, 미설치 시설의 공개 안 됨 표시, 시설 없는 건물 비활성                                                                                                                                                           |
| `admin-content.spec.ts`                 | 독립 시설 검색·필터·정렬, 시설 CRUD, **저장 성공과 번역 실패 분리 + 재번역**, 영상 업로드→자막→삭제, 명소 CRUD·필터·페이지네이션                                                                                                                              |
| `accessibility-dialog-toast.spec.ts`    | 모달 초점 트랩·복귀, **중첩 모달 초점 복원**, 실행 버튼 소멸 시 대체 복귀, **오류=alert / 성공=status**, 폼 라벨 연결, **모바일 44px 터치 영역**                                                                                                              |
| `admin-p0.spec.ts`                      | 모바일 계정 메뉴, 상태 변경 실패 시 성공 메시지 미표시                                                                                                                                                                                                        |
| `admin-dark.spec.ts`                    | 다크 모드 대비 회귀 가드 — 하드코딩 밝은 색·근검정 텍스트 0건 단언                                                                                                                                                                                            |
| `admin-campus-boundaries.spec.ts`       | 캠퍼스 밖 시설 경고하되 저장 허용                                                                                                                                                                                                                             |

E2E는 `e2e/support/mockBackend.ts`(980줄)가 PostgREST·Next 라우트·Auth를 네트워크 레벨에서 흉내 내고 브라우저 API(geolocation·SpeechRecognition·speechSynthesis)를 스텁하므로, **실제 Supabase 없이 결정론적으로 실행**됩니다. 업로드·번역 실패도 카운터로 주입해 검증합니다. 쓰기 요청의 `id` 외 필터(`is.null`, `eq.`)도 실제 PostgREST처럼 적용하므로, 저장 조건에 건 잠금이 목 위에서만 통과하는 일이 없습니다.

---

## 🔄 CI/CD

`.github/workflows/ci.yml` — `main` push / PR / 수동 실행에서 8개 잡을 수행합니다.

| 잡                         | 내용                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `migration-safety`         | `scripts/check-migrations.sh` — 마이그레이션 변경 검사        |
| `lint`                     | ESLint                                                        |
| `format`                   | Prettier 검사                                                 |
| `typecheck`                | `tsc --noEmit`                                                |
| `test`                     | Vitest                                                        |
| `e2e`                      | Playwright (실패 시 `test-results/` 아티팩트 7일 보존)        |
| `migrate`                  | 위 전부 통과 + 마이그레이션 변경 있음 + push/수동일 때만 실행 |
| `verify-migration-history` | 로컬 마이그레이션 파일과 원격 적용 이력 대조 (push/수동 전용) |

**마이그레이션 안전 검사**(`scripts/check-migrations.sh`)는 다음을 강제합니다.

- 이미 적용된 마이그레이션 파일의 **수정·삭제·이름변경(M/D/R)을 실패 처리** — 추가(A)만 허용
- 파일명이 `YYYYMMDDHHMMSS_이름.sql` 형식인지, 파일이 비어 있지 않은지 검사

`migrate` 잡은 Session pooler URI(포트 5432) 형식과 비밀번호 플레이스홀더 치환 여부를 검증하고, `db push --dry-run`으로 미리 보여준 뒤 적용합니다. 접속 URI 구성은 `scripts/build-supabase-db-url.sh`가 맡아 두 잡이 같은 방식으로 마스킹합니다.

`verify-migration-history` 잡은 `migrate`가 변경 없음으로 건너뛴 평상시에도 돌아, 이력 검증이 함께 사라지는 사각지대를 없앱니다. CLI 출력 포맷에 기대지 않고 `psql`로 `supabase_migrations.schema_migrations`를 직접 읽어 파일 목록과 대조합니다. 자세한 운영 절차는 [데이터베이스 마이그레이션 문서](docs/database-migrations.md)를 참고하세요.

`.github/workflows/supabase-keep-alive.yml` — 주 2회(화·금 06:00 KST) 프로덕션 API를 호출해 Supabase 7일 비활성 정지를 방지합니다.

---

## 🗺️ 지도 설정

| 항목                   | 값                           |
| ---------------------- | ---------------------------- |
| 중심 좌표              | 37.5893, 127.0327            |
| Bounds SW              | 37.578, 127.018              |
| Bounds NE              | 37.600, 127.048              |
| minZoom / maxZoom      | 15 / 19                      |
| maxBoundsViscosity     | 0.7                          |
| 건물·명소 라벨 표시 줌 | 데스크톱 17 / 모바일 18 이상 |
| 마커 군집 해제 줌      | 18 이상                      |

---

## 📦 스토리지

| 자산      | 위치                                        | 경로                                                    |
| --------- | ------------------------------------------- | ------------------------------------------------------- |
| 건물 사진 | Supabase Storage `building-photos` (public) | `{buildingId}/{timestamp}-{rand}.webp`                  |
| 명소 사진 | Cloudflare R2                               | presigned 업로드, 삭제 시 R2 객체 선정리 후 DB row 삭제 |
| 시설 영상 | Cloudflare R2                               | 재생 가능 검사 → (필요 시 변환) → presigned PUT → 확인  |

건물 사진은 브라우저에서 긴 변 기준으로 줄인 뒤 webp로 변환해 올립니다. 영상은 `isVideoPlayable()`로 브라우저가 비디오 트랙을 디코드할 수 있는지 먼저 확인하고, **재생 불가한 경우에만** ffmpeg.wasm으로 H.264(+faststart)로 변환해 업로드합니다. MIME만으로는 걸러지지 않는 HEVC(hvc1) 영상이 "소리만 나고 화면은 검은" 상태로 배포되는 것을 막기 위한 장치입니다. 용량 상한은 presign 라우트가 R2에 직접 강제하므로 클라이언트 검사를 우회해도 통과하지 않습니다.

---

## 🌐 다국어 지원

UI 고정 문자열은 `src/lib/translations.ts`(언어당 키 68개)에서 관리합니다. 선택한 언어는 localStorage `ku_map_lang`에 유지됩니다.

콘텐츠 다국어는 DB 컬럼으로 지원합니다 — `facility_types.label_en/zh`, `building_facilities`와 `landmarks`의 `name/description/floor_info`별 `_en`·`_zh`, `building_photos.caption_en/zh`. 시설·명소 저장 시 Papago NMT로 자동 번역하며, 실패하면 `translation_status`를 통해 관리자 화면에 "번역 필요"로 노출됩니다.

새 언어 추가 시 `translations.ts`에 키를 추가하고 `LanguageContext.tsx`의 `SUPPORTED` 배열에 등록합니다.

---

## 🔄 개발 현황

### ✅ 완성된 기능

**사용자 지도**

- 건물 폴리곤, 건물·명소 라벨, hover 툴팁
- 시스템 테마 연동 다크 모드, 항공사진 전환
- 통합 검색(건물+명소, 키보드·음성), 둘러보기 목록
- 현 위치, 즐겨찾기, 지하철역 마커
- 건물 사이드패널(사진 캐러셀·시설 목록·TTS·스와이프 닫기)
- 시설·명소 마커 군집(유형별 lucide 아이콘 · 명소 이모지), 유형별 필터
- 캠퍼스 영역 필터, 경사도 오버레이 + 범례
- 다국어 KO/EN/ZH, 모바일 반응형
- 피드백 서버 접수(허니팟·재시도·메일 대안)
- 데이터 소스별 비차단 오류 배너 + 재시도

**관리자**

- 로그인 + 세션 유지, 모바일 계정 메뉴
- 건물 보완 현황 요약(뷰 기반 RPC 집계) + 카드 클릭 목록 필터
- 건물 추가(폴리곤 그리기 + 캠퍼스 자동 판정), 카드 단위 상세 관리, 폴리곤 미리보기, 소프트 삭제/복구
- 사진 업로드(브라우저 WebP 변환·파일별 성공/실패·실패만 재시도), 건물 동영상 섹션(진행률·용량 상한 서버 강제)
- 시설 상세 모달 + 상태 배지, 독립 시설 관리, 번역 실패 표시 + 개별·일괄 재번역
- 명소 관리(이모지 지정), 경사도 경로 수기 입력·수정
- 전 목록 서버 페이지네이션 + 검색·필터·정렬
- 피드백 수신 이메일 동적 설정

**품질/접근성**

- TypeScript 전면 이관(`strict`), 암묵적 `any` 제거, `no-console` 규칙
- 모달 초점 관리(중첩 스택), 토스트 라이브 리전, 44px 터치 타겟, 폼 라벨 연결
- Vitest 단위 23파일 + Playwright E2E 15 spec
- CI 8잡 게이트 + 마이그레이션 안전 검사·이력 대조
- Supabase keep-alive 크론

### 🚧 남은 작업

- [ ] **현장 조사 + 시설·경사도 데이터 입력** ← 최우선
- [ ] GPX 경사 경로 폐기 — 실측 데이터로 다시 채운 뒤 `gpx_file` 컬럼과 관련 분기 제거 (설계 문서의 2단계)
- [ ] [관리자 역할 검사](docs/TODO_list/auth/require-admin-role-check.md) — 로그인 세션이면 누구나 쓸 수 있는 테이블을 좁힌다
- [ ] [배리어프리 경로 안내](docs/future-development/accessible-routing.md) — 보행로 네트워크 확보 후
- [ ] [관리자 피드백함](docs/future-development/admin-feedback-inbox.md) — 접수된 피드백 목록·상태 관리
- [ ] 그 밖의 개별 과제는 [`docs/TODO_list/`](docs/TODO_list/)에 정리

---

## 🙋 프로젝트 정보

| 항목     | 내용                        |
| -------- | --------------------------- |
| 팀명     | The짱돌                     |
| 소속     | 고려대학교 에너지환경대학원 |
| 운영기간 | 2026.05 ~ 2027.12           |
| 주관     | 고려대학교 지속가능원       |

---

## 📄 라이선스

본 프로젝트는 고려대학교 구성원의 접근성 향상을 위한 비영리 목적으로 제작되었습니다.
