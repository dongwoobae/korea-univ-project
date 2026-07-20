# 명소(Landmarks) 설계 스펙

날짜: 2026-07-20
상태: 승인 대기
선행 작업: [독립 시설 설계 스펙](./2026-07-20-standalone-facilities-design.md) — 해당 스펙에서 "명소는 유형·필드가 달라 별도 테이블로 후속 작업에서 다룬다"고 명시한 그 후속 작업이다.

## 목적

캠퍼스 명소(다람쥐길, 참살이길, 애기능, 민주광장 등)를 지도에 귀여운 아이콘 마커로 표시한다. 배리어프리 시설과는 별개의 데이터/레이어로 다룬다.

## 스코프

- **점형 마커만.** 다람쥐길·참살이길 같은 길도 대표 지점 하나에 마커만 찍는다. 경로(폴리라인) 렌더링은 이번 작업에서 다루지 않는다.
- 명소별 개별 아이콘: 기본은 이모지(다람쥐길 🐿️ 등), 커스텀 일러스트 이미지로 대체할 수 있는 확장 지점만 열어둔다.
- 관리자 CRUD 포함.
- 팝업: 이름 + 설명 + 사진(선택).

## DB — `landmarks` 테이블 (Supabase)

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `id` | uuid PK | default `gen_random_uuid()` |
| `name` / `name_en` / `name_zh` | text | `name`만 필수, 기존 i18n 컬럼 패턴 |
| `description` / `description_en` / `description_zh` | text nullable | |
| `lat` / `lng` | double precision **NOT NULL** | 좌표 없는 명소는 허용하지 않는다 (유령 데이터 방지) |
| `icon` | text NOT NULL | 이모지 문자 1개 (예: 🐿️) |
| `image_url` | text nullable | 마커 아이콘을 이모지 대신 커스텀 이미지로 대체할 확장 지점. 이번 작업에서는 컬럼만 만들고 UI는 이모지만 지원 |
| `photo_url` | text nullable | 팝업에 보여줄 명소 사진 (R2 공개 URL) |
| `created_at` | timestamptz | default `now()` |

RLS는 기존 테이블(`building_facilities`) 정책 패턴을 따른다: 읽기 공개, 쓰기는 관리자만.

## R2 공용 모듈 추출 — `src/lib/r2.ts`

현재 R2 클라이언트가 동영상 라우트 3개(`upload-facility-video`, `facility-video-presign`, `delete-facility-video`)마다 `new S3Client({...})`로 중복 생성되어 있다. 이번 작업에서 다음으로 정리한다:

- `src/lib/r2.ts` 신설: R2 `S3Client` 인스턴스, `BUCKET`, `PUBLIC_URL` 상수를 한 곳에서 export.
- 기존 동영상 라우트 3개를 공용 모듈 사용으로 교체. **동작 변화 없음** (순수 리팩터링).
- 신규 명소 사진 업로드 엔드포인트는 처음부터 이 모듈을 사용한다.

## API

- **`GET /api/landmarks`** — 전체 명소 조회. `/api/facilities` 패턴 복제 (`revalidate = 3600`).
- **관리자 쓰기** — 명소 생성/수정/삭제. 기존 admin API의 `requireAdmin` 인증 패턴 그대로.
- **`POST /api/upload-landmark-photo`** — 이미지 업로드 → R2 저장 → 공개 URL 반환. `requireAdmin` + `src/lib/r2.ts` 사용. 이미지 MIME 타입·용량 검증(예: 5MB 제한). 동영상과 달리 ffmpeg 처리 없음.
- 사진 삭제/교체 시 기존 R2 객체 삭제는 `delete-facility-video` 패턴을 따른다.

## 지도 렌더링

- **`src/components/map/LandmarkMarkers.tsx`** 신설 — `FacilityMarkers.tsx`를 본뜬 구조. `L.divIcon` 원형 배지에 명소별 이모지를 렌더.
- 배지 색은 시설 마커와 구분되는 **명소 전용 색 1개**(따뜻한 노랑/베이지 계열)로 통일. 명소끼리는 이모지로 구분된다.
- `image_url`이 있으면 이모지 대신 이미지를 배지에 렌더 (확장 지점).
- **필터**: `FilterPanel.tsx`에 "명소" 토글 **1개** 추가. 시설 유형처럼 세분화하지 않는다.
- **데이터 로드**: `useMapData.ts`에 `/api/landmarks` fetch 추가 (기존 slopes/facilities 패턴 복제).

## 팝업

현재 언어(ko/en/zh)의 이름 + 설명 + 사진(있으면). 기존 시설 팝업 구성을 재사용하되 동영상 버튼 자리에 사진 이미지를 넣는다. 사진은 `photo_url` 그대로 `<img>` 렌더 (별도 라이트박스 없음).

## 관리자 — `/admin/dashboard/landmarks`

독립 시설 작업의 패턴(`FacilityFormModal` 등)을 복제한 명소 전용 화면:

- 명소 목록 (이름·이모지·좌표 유무·사진 유무)
- 신규/편집 모달: 지도 클릭으로 좌표 지정, 이름·설명(3개국어), 이모지 입력(텍스트 입력 1칸), 사진 업로드/교체/삭제
- 삭제 시 확인 다이얼로그, 연결된 R2 사진 객체도 함께 삭제

## 시드 데이터

초기 등록 명소 (좌표는 구현 시 확인):

- 다람쥐길 🐿️
- 참살이길 (이모지 구현 시 선정, 예: 🌸)
- 애기능 (예: 🌳)
- 민주광장 (예: 🕊️)

## 에러 처리

- 사진 업로드 실패 시 명소 저장 자체는 막지 않는다 (사진은 선택 필드).
- `GET /api/landmarks` 실패 시 지도는 명소 레이어만 빈 상태로 렌더 (기존 facilities 실패 처리 패턴과 동일).

## 테스트

- 기존 프로젝트 테스트 관례를 따른다: API 라우트(조회/쓰기 인증) 및 R2 공용 모듈 교체 후 동영상 라우트 회귀 확인.
- 수동 확인: 지도에서 명소 마커·필터 토글·팝업, 관리자 CRUD 왕복.

## 스코프 제외

- 경로(폴리라인) 형태의 명소 렌더링
- 명소 카테고리/유형 분류 체계
- 커스텀 일러스트 이미지 제작 및 `image_url` 입력 UI (컬럼·렌더 분기만 준비)
