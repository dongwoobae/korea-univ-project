# 명소(Landmarks) 설계 스펙

날짜: 2026-07-20
상태: 승인 대기 (codex 1차 리뷰 반영본)
선행 작업: [독립 시설 설계 스펙](./2026-07-20-standalone-facilities-design.md) — 해당 스펙에서 "명소는 유형·필드가 달라 별도 테이블로 후속 작업에서 다룬다"고 명시한 그 후속 작업이다.

## 목적

캠퍼스 명소(다람쥐길, 참살이길, 애기능, 민주광장 등)를 지도에 귀여운 아이콘 마커로 표시한다. 배리어프리 시설과는 별개의 데이터/레이어로 다룬다.

## 스코프

- **점형 마커만.** 다람쥐길·참살이길 같은 길도 대표 지점 하나에 마커만 찍는다. 경로(폴리라인) 렌더링은 이번 작업에서 다루지 않는다.
- 명소별 개별 아이콘: 기본은 이모지(다람쥐길 🐿️ 등), 커스텀 일러스트 이미지로 대체할 수 있는 확장 지점만 열어둔다.
- 관리자 CRUD 포함.
- 팝업: 이름 + 설명 + 사진(선택).

## DB — `landmarks` 테이블 (Supabase)

| 컬럼                                                | 타입                          | 비고                                                                                                         |
| --------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`                                                | uuid PK                       | default `gen_random_uuid()`                                                                                  |
| `name` / `name_en` / `name_zh`                      | text                          | `name`만 필수, 기존 i18n 컬럼 패턴                                                                           |
| `description` / `description_en` / `description_zh` | text nullable                 |                                                                                                              |
| `lat` / `lng`                                       | double precision **NOT NULL** | 좌표 없는 명소는 허용하지 않는다 (유령 데이터 방지)                                                          |
| `icon`                                              | text NOT NULL                 | 이모지 문자 1개 (예: 🐿️)                                                                                     |
| `image_url`                                         | text nullable                 | 마커 아이콘을 이모지 대신 커스텀 이미지로 대체할 확장 지점. 이번 작업에서는 컬럼만 만들고 UI는 이모지만 지원 |
| `photo_url`                                         | text nullable                 | 팝업에 보여줄 명소 사진 (R2 공개 URL)                                                                        |
| `created_at`                                        | timestamptz                   | default `now()`                                                                                              |

**마이그레이션에 RLS를 명시적으로 포함한다** (기존 정책이 자동 적용되지 않음 — `slope_segments`의 `20260612163920_fix_slope_rls.sql` 패턴):

- `enable row level security`
- `anon read`: SELECT 공개
- `authenticated write`: INSERT/UPDATE/DELETE — 기존 시설 관리와 동일하게 클라이언트 supabase 세션으로 쓰기

**마이그레이션 후 `supabase/database.types.ts` 재생성** 및 `src/types/domain.ts`에 `Landmark` 타입 추가. 이 단계 없이는 typed Supabase 코드가 컴파일되지 않는다.

보안 모델 참고: 이 프로젝트는 공개 가입이 없고 "로그인 계정 = 관리자" 모델이다(`requireAdmin`은 토큰 유효성 검사). 명소도 같은 모델을 따르며 신규 위험을 추가하지 않는다. requireAdmin의 역할 검사 부재는 프로젝트 전반 이슈로 이 작업 범위 밖.

## R2 공용 모듈 추출 — `src/lib/r2.ts`

현재 R2 클라이언트가 동영상 라우트 3개(`upload-facility-video`, `facility-video-presign`, `delete-facility-video`)마다 `new S3Client({...})`로 중복 생성되어 있다. 단, **세 라우트의 클라이언트 옵션이 동일하지 않다** (presign 라우트만 `forcePathStyle`·checksum 관련 옵션 보유, 업로드 용량 제한도 라우트별 상이).

- `src/lib/r2.ts` 신설: 자격증명·`BUCKET`·`PUBLIC_URL` 상수는 무조건 공용화.
- `S3Client` 인스턴스는 구현 시 옵션 차이를 검증해 **통일 가능하면 단일 인스턴스, 불가하면 라우트별 옵션을 유지한 팩토리** 제공. 눈대중 통일 금지.
- 기존 동영상 라우트 3개를 공용 모듈 사용으로 교체. 동작 변화 없음이 목표이며, 회귀 여부는 동영상 업로드/삭제 수동 테스트로 확인한다.
- 신규 명소 사진 업로드/삭제 엔드포인트는 처음부터 이 모듈을 사용한다.

## API / 데이터 접근

- **`GET /api/landmarks`** — 전체 명소 조회. `/api/facilities` 패턴 복제 (service role 읽기, `revalidate = 3600`).
- **명소 CRUD(생성/수정/삭제)** — 별도 admin API를 만들지 않고, 기존 시설 관리(`FacilityFormModal`)와 동일하게 **클라이언트 supabase 세션으로 직접 insert/update/delete** (위 `authenticated write` RLS 정책이 허용).
- **`POST /api/upload-landmark-photo`** — 이미지 업로드 → R2 저장 → 공개 URL 반환. `requireAdmin` + `src/lib/r2.ts`. 이미지 MIME 타입·용량 검증(예: 5MB 제한). ffmpeg 처리 없음.
- **`POST /api/delete-landmark-photo`** — `landmarkId`/`photoUrl`을 받아 R2 객체 삭제 + `landmarks.photo_url` null 처리. `delete-facility-video`를 본뜬 **명소 전용 신규 라우트** (기존 라우트는 `building_facilities`에 묶여 있어 재사용 불가).
- 명소 삭제 시 사진이 있으면 R2 객체를 먼저 정리하고 row 삭제 (`src/lib/facilityDelete.ts` 패턴의 명소 버전 헬퍼).

## 지도 렌더링

- **`src/components/map/LandmarkMarkers.tsx`** 신설 — `FacilityMarkers.tsx`를 본뜬 구조. `L.divIcon` 원형 배지에 명소별 이모지를 렌더.
- 배지 색은 시설 마커와 구분되는 **명소 전용 색 1개**(따뜻한 노랑/베이지 계열)로 통일. 명소끼리는 이모지로 구분된다.
- `image_url`이 있으면 이모지 대신 이미지를 배지에 렌더 (확장 지점).
- **필터**: `FilterPanel.tsx`에 "명소" 토글 **1개** 추가. 시설 유형처럼 세분화하지 않는다.
- **데이터 로드**: `useMapData.ts`에 `/api/landmarks` fetch 추가 (기존 slopes/facilities 패턴 복제).

## 팝업

현재 언어(ko/en/zh)의 이름 + 설명 + 사진(있으면). **주의: 기존 시설 마커 팝업은 `_en`/`_zh` 컬럼을 사용하지 않으므로 "재사용"으로는 i18n이 충족되지 않는다.** 명소 팝업은 `FacilityList.tsx`의 언어 선택 패턴(현재 언어 컬럼, 없으면 ko 폴백)을 따라 직접 구현한다. 사진은 `photo_url` 그대로 `<img>` 렌더 (별도 라이트박스 없음).

## 관리자 — `/admin/dashboard/landmarks`

독립 시설 작업의 패턴(`FacilityFormModal`, `/admin/dashboard/facilities` 페이지)을 복제한 명소 전용 화면:

- 명소 목록 (이름·이모지·사진 유무)
- 신규/편집 모달: 지도 클릭으로 좌표 지정, 이름·설명(3개국어, 기존 자동번역 채움 패턴), 이모지 입력(텍스트 1칸), 사진 업로드/교체/삭제
- 삭제 시 확인 다이얼로그, 연결된 R2 사진 객체도 함께 삭제 (위 헬퍼 사용)
- `admin/dashboard/layout.tsx`의 NAV에 "명소" 메뉴 추가

## 시드 데이터

초기 등록 명소 (좌표는 구현 단계에서 지도로 확인해 확정, 마이그레이션 시드 대신 관리자 화면으로 등록해도 무방):

- 다람쥐길 🐿️
- 참살이길 (이모지 구현 시 선정, 예: 🌸)
- 애기능 (예: 🌳)
- 민주광장 (예: 🕊️)

## 에러 처리

- 사진 업로드 실패 시 명소 저장 자체는 막지 않는다 (사진은 선택 필드).
- `GET /api/landmarks` 실패 시 지도는 명소 레이어만 빈 상태로 렌더 (기존 facilities 실패 처리 패턴과 동일).

## 테스트

- vitest 기존 테스트 전건 PASS + `npm run build` PASS.
- 명소 삭제 헬퍼(사진 정리 포함)는 `facilityDelete.test.ts` 패턴의 단위 테스트 작성.
- R2 공용 모듈 교체 후 동영상 업로드/삭제 수동 회귀 확인.
- 수동 확인: 지도에서 명소 마커·필터 토글·팝업(3개국어), 관리자 CRUD 왕복.

## 스코프 제외

- 경로(폴리라인) 형태의 명소 렌더링
- 명소 카테고리/유형 분류 체계
- 커스텀 일러스트 이미지 제작 및 `image_url` 입력 UI (컬럼·렌더 분기만 준비)
- `requireAdmin`의 역할(role) 검사 도입 — 프로젝트 전반 보안 이슈로 별도 작업
