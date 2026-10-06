# 같은 시설을 동시에 고치면 나중 저장이 앞의 변경과 번역을 덮는다

`FacilityFormModal`은 열 때 시설 값 전체를 폼 상태로 복사하고
(`src/components/admin/FacilityFormModal.tsx`의 `useState` 초기값), 저장할 때 그 전체를 payload로 보낸다.
이름만 고쳐도 `facility_code`·좌표·층·`is_installed`가 같이 간다. 갱신 조건은 `id` 하나뿐이다.

그래서 두 가지가 생긴다.

**1. 열어둔 사이 바뀐 값이 되돌아간다.**
A가 설치된 시설의 수정 폼을 연다 → B가 상세 모달에서 그 시설을 미설치로 바꾼다 → A가 이름만 고쳐 저장한다 →
A가 열 때 복사한 `is_installed: true`가 다시 써진다. 충돌 안내는 없다. 공개 사이드패널에 다시 설치로 보인다.

**2. 늦게 끝난 번역이 최신 원문과 다른 번역을 남긴다.**
저장 뒤 `translateFacility`(`src/lib/facilityTranslation.ts`)가 번역 결과를 `id` 조건만으로 쓴다.
A가 이름을 바꿔 저장하고 번역이 늦어지는 사이 B가 이름을 다시 바꿔 저장하고 번역까지 끝내면, 마지막에 도착한
A의 번역이 덮는다. 한국어 원문은 B의 것, `name_en`·`name_zh`는 A의 것인 채 `translated`가 된다.

## 막힌 이유

**차단 사유 없음.** 지금 독립 시설 수정(`/admin/dashboard/facilities`)에 이미 있는 동작이고, 건물 안 시설 수정
버튼(2026-10-06 설계 부록 A)은 같은 폼으로 들어가는 입구를 하나 더 다는 것뿐이라 범위를 넓히지 않았다.
관리자가 두 명이라 같은 시설을 동시에 고칠 일이 드물다.

## 트리거

- 관리자가 늘거나, 관리 주체가 바뀌어 여러 사람이 같은 건물 데이터를 동시에 손본다
- 공개 화면에서 설치 상태나 번역이 원문과 어긋난 사례가 실제로 나온다

## 착수 시 정할 것

- **1번:** 바뀐 필드만 보낼지(폼 열 때 값과 비교), `updated_at`을 조건으로 건 낙관적 잠금으로 충돌을 알릴지.
  `building_facilities`에는 `updated_at` 컬럼이 있다(`supabase/migrations/20260723000000_add_admin_content_updated_at.sql`).
  경사도 수정 화면(`src/app/admin/slopes/[id]/page.tsx`)이 이미 `updated_at`으로 잠근다. 바뀐 필드만 보내는 쪽은
  같은 필드를 둘이 고친 경우를 여전히 조용히 덮는다.
- **2번:** 번역 결과를 쓸 때 원문(또는 수정 시각)이 번역을 시작한 시점과 같을 때만 쓸지. 다르면 결과를 버리고
  상태를 무엇으로 둘지(`pending` 유지 또는 재번역).

## 출처

2026-10-06 — 건물 안 시설 수정 버튼 설계 중 확인. `docs/specs/2026-10-06-slope-units-and-editor-design.md` 9장.
