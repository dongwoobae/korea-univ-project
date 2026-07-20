# 독립 시설(건물 비종속) 등록 — 설계 스펙

날짜: 2026-07-20
상태: 사용자 승인 완료 (codex 1차 리뷰 반영본)

## 목적

배리어프리 시설(엘리베이터·장애인화장실·경사로·장애인주차장·점자블록)을 건물에
소속시키지 않고 독립적으로 등록·표시한다. 야외 경사로, 독립 주차구역 등
건물 단위로 묶이지 않는 시설이 대상이다.

**스코프 제외**: 명소(애기능·민주광장·다람쥐길 등)는 유형·필드가 달라
별도 테이블로 후속 작업에서 다룬다. 이번 작업에 포함하지 않는다.

## 데이터 모델

- 기존 `building_facilities` 테이블 재사용. **`building_id IS NULL` = 독립 시설**.
- `building_id`는 이미 nullable이므로 마이그레이션 없음.
- 동영상 presign/confirm/delete API 4종(`facility-video-*`, `upload-facility-video`,
  `delete-facility-video`)이 이 테이블 기준이므로 무수정 재사용.
- RLS: admin 쓰기는 기존 건물 시설과 동일 경로(클라이언트 supabase 세션)이며
  정책에 building_id 구분이 없어 추가 조치 불필요.

## 컴포넌트 분리

`src/app/admin/buildings/[id]/page.tsx`(1,663줄) 내부 컴포넌트를 분리한다.
(코드 정독 결과 수정 폼은 없고 추가 모달 + 동영상 모달 구조 — 둘을 각각 분리)

- `src/components/admin/FacilityFormModal.tsx`: 유형 선택, 이름/설명(+자동번역
  채움), 지도 클릭 좌표 선택, 설치 여부. prop `buildingId: number | null` —
  null이면 독립 시설 모드. prop `facility` — null이면 신규, 값이 있으면 편집.
  insert/update 오류를 검사해 실패 시 모달을 닫지 않고 오류 토스트를 띄운다
  (기존 코드는 항상 성공으로 처리하던 버그).
- `src/components/admin/AddFacilityButton.tsx`: "+ 시설 추가" 버튼과 open 상태만
  가진 얇은 래퍼. 건물 편집 페이지·독립 시설 페이지가 공유.
- `src/components/admin/FacilityVideoModal.tsx`: 동영상 업로드/캡션/삭제.
  건물 의존이 없어 순수 이동.
- 독립 시설 모드 차이:
  - `floor_info` 입력 숨김(야외 시설에 층 정보 무의미, 값은 null 저장).
  - `lat`/`lng` **필수** — 없으면 지도 마커에도 사이드패널에도 나타나지 않아
    유령 데이터가 되므로 저장 전 검증한다. (건물 시설은 기존대로 선택.)
- 건물 편집 페이지는 분리된 컴포넌트를 사용하도록 교체하며 동작 변화 없음(회귀 대상).

## 관리자 페이지

- 경로: `/admin/dashboard/facilities` (dashboard layout 하위 → 인증·네비 상속).
- 단일 페이지: 상단 목록(유형 아이콘·이름·좌표·설치 여부, 동영상/설치토글/수정/
  삭제 버튼) + AddFacilityButton — 건물 편집 페이지의 기존 인라인 패턴 유지.
- 목록 쿼리: `building_facilities` where `building_id is null`.
- **수정**: 목록의 "수정" 버튼이 `FacilityFormModal`을 편집 모드로 연다.
  독립 시설은 좌표가 핵심이라 삭제 후 재등록(동영상 재업로드 포함) 없이
  이름·설명·좌표를 고칠 수 있어야 한다.
- **삭제**: `src/lib/facilityDelete.ts`의 공용 헬퍼를 쓴다. `video_url`이 있으면
  `/api/delete-facility-video`로 R2 객체를 먼저 정리하고, 정리에 실패하면 row를
  남긴 채 오류를 반환한다(고아 객체 방지). **건물 편집 페이지의 시설 삭제도
  같은 헬퍼로 교체**한다 — 대칭 경로가 갈라지지 않도록.
- 메뉴: `src/app/admin/dashboard/layout.tsx`의 `NAV` 배열에
  `{ label: "📍 독립 시설", href: "/admin/dashboard/facilities" }` 추가.

## 지도 표시

- `/api/facilities`(GET)는 lat/lng not-null 필터만 있으므로 독립 시설이
  자동 포함된다. 쿼리 변경 없음.
- `FacilityMarkers.tsx` 팝업의 건물명 줄(`{f.buildings?.name}`)을 조건부 렌더로
  변경 — 독립 시설은 건물명 줄 자체를 그리지 않는다.
- 사이드패널(건물 상세)은 `.eq("building_id", ...)`로 조회하므로 독립 시설이
  섞이지 않는다. 변경 없음.
- 건물 관리 대시보드의 유형별 통계는 전체 시설을 세므로 독립 시설이 섞인다.
  쿼리에 `.not("building_id", "is", null)`을 추가해 제외한다.

## 검증

- vitest 기존 테스트 전건 PASS + `npm run build` PASS.
- 회귀: 건물 편집 페이지에서 시설 신규/수정/삭제/동영상 업로드가 폼 분리 후에도
  동일 동작하는지 확인.
- 신규: 독립 시설 등록 → 지도 마커 표시(팝업에 건물명 없음) 확인.
- 좌표 미입력 저장 시 차단 확인.

## 비고

- 패키지 매니저: npm (`package-lock.json`).
- 작업 브랜치: main에서 신규 브랜치 생성 예정.
