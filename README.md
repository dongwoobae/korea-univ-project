# 모두의 캠퍼스 — KU 배리어프리 웹 지도

> 고려대학교 장애인·이동약자를 위한 인터랙티브 배리어프리 웹 지도

[![Next.js](https://img.shields.io/badge/Next.js-App_Router-black?logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-DB%20%2F%20Storage%20%2F%20Auth-3ECF8E?logo=supabase)](https://supabase.com/)
[![Leaflet](https://img.shields.io/badge/Leaflet-react--leaflet-199900?logo=leaflet)](https://leafletjs.com/)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?logo=vercel)](https://vercel.com/)

---

## 📖 프로젝트 소개

고려대학교 캠퍼스 내 엘리베이터, 경사로, 장애인 화장실, 점자블록 등 접근성 시설 정보를 통합 제공하는 웹 기반 배리어프리 지도입니다.

기존 정적 이미지 지도의 한계(분리 운영, 정보 미갱신, 검색 불가)를 극복하고, 인문·자연계 캠퍼스와 안암병원·녹지캠퍼스까지 아우르는 **통합 인터랙티브 플랫폼**을 구축하는 것을 목표로 합니다.

본 프로젝트는 **2026학년도 고려대학교 체인지메이커스 프로젝트(대학원)**의 일환으로 진행됩니다.

---

## ✨ 주요 기능

- 🗺️ **캠퍼스 건물 폴리곤 지도** — OpenStreetMap(Overpass API) 기반 고려대 건물 시각화
- 🔍 **건물 검색 + 줌 이동** — 건물명 검색 시 해당 위치로 자동 이동
- 📍 **현 위치 버튼** — 사용자 현재 위치 표시
- 🏢 **건물 클릭 사이드패널** — 건물별 접근성 시설 정보(엘리베이터, 경사로 등) 표시
- 🔒 **관리자 페이지** — 로그인 · 건물 목록 · 시설 추가/수정/삭제 · 사진 업로드
- 📌 **시설 위치 등록** — 미니 지도에서 직접 위치를 찍어 시설 좌표 저장
- 🖼️ **건물 사진 업로드** — Supabase Storage 연동

---

## 🛠️ 기술 스택

| 구분                | 기술                                           |
| ------------------- | ---------------------------------------------- |
| Frontend            | Next.js (App Router, JavaScript)               |
| 지도                | Leaflet + react-leaflet, CartoDB Positron 타일 |
| Backend             | Next.js API Route                              |
| DB / Storage / Auth | Supabase                                       |
| 배포                | Vercel                                         |
| 스타일              | 인라인 style                                   |

---

## 📁 폴더 구조

```
src/
  app/
    page.js                      # 메인 지도 페이지
    admin/
      page.js                    # 관리자 로그인
      dashboard/
        page.js                  # 관리자 대시보드 (건물 목록)
      buildings/
        [id]/
          page.js                # 건물 상세 (시설 관리, 사진 업로드)
    api/
      buildings/
        route.js                 # Overpass API 호출 + 캐싱
    auth/
      confirm/
        page.js                  # 초대 수락 후 비밀번호 설정
  components/
    Map.js                       # Leaflet 지도 메인 컴포넌트
    MapWrapper.js                # dynamic import SSR 방지
    SidePanel.js                 # 건물 클릭 시 접근성 정보 패널
    FacilityMap.js               # 시설 위치 찍는 미니 지도
  lib/
    supabaseClient.js            # Supabase 클라이언트
  scripts/
    syncBuildings.js             # Overpass → Supabase 건물 동기화 스크립트
```

---

## 🗄️ DB 스키마 (Supabase)

```sql
-- 건물 정보
buildings
  id           bigint primary key   -- OSM way id
  name         text
  name_en      text
  campus       text default '서울'
  photo_url    text
  last_updated date
  created_at   timestamptz

-- 시설 유형
facility_types
  code   text primary key           -- 'elevator' | 'restroom' | 'ramp' | 'parking' | 'braille'
  label  text
  icon   text

-- 건물별 시설 정보
building_facilities
  id            uuid primary key
  building_id   bigint → buildings(id)
  facility_code text → facility_types(code)
  is_installed  boolean
  description   text
  floor_info    text
  name          text
  lat           double precision
  lng           double precision
  created_at    timestamptz
```

### RLS 정책

| 역할          | 테이블                                         | 권한   |
| ------------- | ---------------------------------------------- | ------ |
| anon          | buildings, building_facilities, facility_types | SELECT |
| authenticated | buildings, building_facilities, facility_types | ALL    |

---

## ⚙️ 환경 변수

프로젝트 루트에 `.env.local` 파일을 생성하고 아래 값을 입력하세요.

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
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

### 건물 데이터 동기화 (최초 1회)

```bash
node src/scripts/syncBuildings.js
```

> Overpass API를 통해 고려대 캠퍼스 건물 데이터를 Supabase에 동기화합니다.

---

## 🗺️ 지도 설정

| 항목      | 값                |
| --------- | ----------------- |
| 중심 좌표 | 37.5893, 127.0327 |
| Bounds SW | 37.578, 127.018   |
| Bounds NE | 37.600, 127.048   |
| minZoom   | 15                |
| maxZoom   | 19                |

---

## 📦 Supabase Storage

- 버킷명: `building-photos` (public)
- 파일명 형식: `{building_id}.{ext}`
- 업로드 후 URL → `buildings.photo_url`에 저장

---

## 🔄 개발 현황

### ✅ 완성된 기능

- 지도 + 고려대 건물 폴리곤
- 건물 hover 툴팁
- 건물 검색 + 줌 이동
- 현 위치 버튼
- 건물 클릭 사이드패널 (Supabase 접근성 데이터)
- 로딩 오버레이
- 관리자 로그인 + 세션 유지
- 관리자 대시보드
- 건물 상세 페이지
- 시설 추가 (미니 지도에서 위치 찍기)
- 시설 설치 여부 토글
- 시설 삭제
- 건물 사진 업로드 (Supabase Storage)
- Overpass API 방어 로직 (3개 서버 순차 시도)

### 🚧 남은 작업

- [ ] 지도에 시설 마커 표시 (엘리베이터 등 위치 아이콘)
- [ ] syncBuildings.js 실행 (네트워크 이슈 해결 후)
- [ ] UI 다듬기
- [ ] 모바일 대응
- [ ] 3D 뷰 (후순위)

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
