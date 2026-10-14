# Handoff: 관리자 콘솔 리디자인 — 지도 우선 (1b)

대상 저장소: `dongwoobae/korea-univ-project` (main)
대상 화면: `/admin/dashboard/facilities`, `/landmarks`, `/slopes`, `/inbox`, `/admin/slopes/[id]` (건물 탭은 범위 밖)

## Overview
건물 탭을 뺀 관리자 4개 탭을 하나의 일관된 레이아웃으로 정리한다.
- 독립 시설 · 명소 · 경사도: **지도가 화면 전체를 채우고**, 그 위에 왼쪽 목록 패널과 오른쪽 상세 패널이 떠 있다.
- 제보함: **상태별 보드**(신규 / 확인 중 / 처리 완료) + 오른쪽 검토 드로어.
- 행마다 있던 액션 버튼(동영상·설치 토글·번역·수정·삭제)은 모두 상세 패널로 옮긴다. 행에는 이름·메타·상태 배지만 남는다.
- 주 액션 색을 파랑(`--ku-primary`)에서 **크림슨 `#8C0000`**으로 바꾼다.

해결하려는 문제(사용자 피드백): 탭마다 레이아웃이 다름, 행 액션 과다, 정보 위계 약함, 폭이 좁아 빈 공간 많음(800px 카드), 제보함 처리 흐름 불편.

## About the Design Files
이 폴더의 `Admin B.dc.html`은 **HTML로 만든 디자인 레퍼런스**다. 의도한 모양과 동작을 보여주는 프로토타입이지 그대로 옮길 코드가 아니다. 기존 Next.js(App Router) + Supabase 코드베이스의 패턴(`admin-ui.css`의 `ku-*` 클래스, `AdminListControls`, `AdminPagination`, `FacilityFields`, `useModalFocus`, `Toast`, `ConfirmModal`, Leaflet `FacilityMap`/`SlopeRouteMap`)으로 다시 구현할 것. 데이터 조회·저장 로직(쿼리, revalidate, 번역, 낙관적 동시성 체크)은 **현재 코드를 그대로 유지**하고 프레젠테이션만 바꾼다.

브라우저로 `Admin B.dc.html`을 열면(같은 폴더의 `support.js` 필요) 클릭해 볼 수 있다. 지도는 줄무늬 플레이스홀더이고 핀·경로는 % 좌표 목업이다. 실제로는 Leaflet으로 렌더한다.

## Fidelity
**High-fidelity.** 색, 타이포, 간격, 반경, 상태 색은 최종값이다. 지도 타일/마커의 실제 모양만 Leaflet 구현에 맞춘다.

---

## 공통 셸 (`dashboard/layout.tsx`)
지금 구조를 유지한다. 바뀌는 건 다음뿐이다.
- 헤더 높이 60px (현재 64), padding 0 24px, 흰 배경, 하단 1px `#E8E4E0`.
- 제보함 nav 배지: 배경 `#8C0000` (현재 파랑), 18px 높이, 11px/700, radius 9.
- nav 활성: 글자 `#A31C12` 700, `box-shadow: inset 0 -2px 0 #8C0000`. 비활성 `#5C5652` 500, 13.5px.
- 우측 버튼(설정/지도 보기/로그아웃): 높이 34, padding 0 12, 1px `#D6D1CC`, radius 8, 12.5px/600.
- `.ku-admin-content > div { background: ... !important }` 같은 전역 덮어쓰기는 지도 페이지 레이아웃과 충돌하니 정리할 것.

## Screens

### 1. 지도 작업 화면 (독립 시설 · 명소 · 경사도 공통)
**레이아웃**
- 헤더 아래 영역 전체(`flex:1; min-height:0; position:relative; overflow:hidden`)가 지도다.
- **목록 패널**: `position:absolute; top:16; left:16; bottom:16; width:404px`, 흰색, radius 14, `box-shadow: 0 4px 20px rgba(28,25,23,.14)`, z-index 8, 세로 flex.
- **상세 패널**: 행/핀을 선택했을 때만. `top:16; right:16; bottom:16; width:460px`, 스타일은 목록 패널과 같음.
- **지도 가시 영역**: 마커가 패널 밑에 숨지 않게, 선택 항목으로 `fitBounds`/`panTo` 할 때 padding을 준다. 왼쪽 ≈ 436px, 오른쪽 = 상세 패널이 열려 있으면 ≈ 492px, 닫혀 있으면 16px (Leaflet `paddingTopLeft`/`paddingBottomRight`).
- 줌 컨트롤: 목록 패널 바로 오른쪽 위(left 436, top 16), 36×36 버튼 2개, radius 8, 그림자 floating.

**목록 패널 내부 (위→아래)**
1. 헤더 블록, padding 18 18 12, 하단 1px `#F0EDEA`:
   - 제목 20px/700, letter-spacing -0.01em ("독립 시설" / "명소" / "경사도 경로").
   - 캡션 12px `#8A837D`, line-height 1.45:
     - 독립 시설: `건물에 속하지 않는 야외 경사로, 주차구역 등 · 총 {n}개`
     - 명소: `지도에 표시하는 캠퍼스 명소 · 총 {n}개`
     - 경사도: `구간별 경사를 기록한 보행 경로 · 총 {n}개`
   - 우측 주 버튼: 높이 34, padding 0 12, `#8C0000`/흰 글자, radius 8, 12.5px/600. 문구 `＋ 시설 추가` / `＋ 명소 추가` / `＋ 경로 그리기`.
   - 검색: 높이 38, 1px `#D6D1CC`, radius 8, 13px, 왼쪽 `⌕` 아이콘 + padding-left 32. placeholder는 현재 문구 유지.
   - **필터 칩**(요약 카드 겸용, 하나만 선택): 높이 30, padding 0 11, radius 999, 12px/600, 개수는 같은 줄에 opacity .75. 선택: 배경·테두리 `#8C0000`, 흰 글자. 기본: 흰 배경, 1px `#D6D1CC`, `#5C5652`.
     - 독립 시설: 전체 · 미설치 · 번역 필요 · 동영상 없음
     - 명소: 전체 · 사진 없음 · 번역 없음
     - 경사도: 전체 · 1/12 초과 포함 · 확인 필요(16.7° 이상 구간 있음)
     - 칩은 기존 select 필터(유형/설치 상태/사진)를 대신한다. 유형 필터는 필요하면 검색 옆 드롭다운으로 둔다.
2. 결과 줄: padding 8 18, 11.5px/600 `#8A837D`, 왼쪽 `{n}개 표시`, 오른쪽 정렬 `최근 수정순 ▾` (기존 sort select).
3. 스크롤 목록(`flex:1; overflow:auto`). 마지막에 `AdminPagination`.
4. 범례 바: padding 10 18, 위 1px `#F0EDEA`, 배경 `#FBFAF9`, 8px 점 + 11px `#5C5652`.

**행 — 독립 시설/명소**
- `display:flex; align-items:center; gap:11px; padding:11px 18px; border-top:1px solid #F0EDEA`. 행 전체가 `<button>`.
- 아이콘 32×32 원: 시설은 유형 색 배경 + 흰 글자 12px/700 (`FacilityTypeIcon`으로 바꿔도 됨), 명소는 `#F7F5F3` 배경 + 이모지 17px.
- 이름 13.5px/600 한 줄 말줄임. 메타 11.5px `#8A837D`: 시설 `{유형} · {수정일}`, 명소 `{캠퍼스} · {수정일}`.
- 우측 배지(있을 때만): padding 2 7, radius 999, 11px/700.
  - 미설치 `#FCEBEB`/`#A32D2D` · 번역 필요/번역 없음 `#FEF3C7`/`#92400E` · 사진 없음 `#F0EDEA`/`#5C5652`
- hover `#FAF8F6`. 선택: 배경 `#FAF0EF`, 이름 `#8C0000`.

**행 — 경사도**
- 세로 flex, gap 8, padding 12 18.
- 1줄: 이름 13.5px/600 + 오른쪽 판정 배지. 배지 규칙(우선순위 순):
  - 16.7° 이상 구간 있음 → `확인 필요 {k}구간` `#FCEBEB`/`#A32D2D`
  - 4.76° 초과 구간 있음 → `1/12 초과 {k}구간` `#FEF3C7`/`#92400E`
  - 나머지 → `기준 이내` `#EAF3ED`/`#2F7A4F`
- 2줄: **경사 프로파일 바**. 높이 6, gap 2, 구간마다 `flex: 거리(m)`, radius 3, 색은 판정 색(아래 토큰).
- 3줄: 11.5px `#8A837D` `{구간 수}개 구간 · {총 거리}m · 최대 {x.x}° · {수정일}`.

**지도 마커**
- 시설: 24px 원, 유형 색, 2px 흰 테두리, `0 1px 4px rgba(0,0,0,.25)`, 가운데 유형 약자(엘/화/경/주/점) 10px/700. 선택 시 30px, `0 0 0 4px rgba(140,0,0,.3)` 링, 위에 툴팁(검정 `#1C1917` 배경, 흰 12px/600, radius 7, padding 5 9, 마커 위 20px).
- 명소: 30px 흰 원 + 이모지 15px. 선택 시 38px, 테두리 `#8C0000`.
- 경사도: 구간마다 polyline, 판정 색, 두께 5(선택 7, 편집 중 9), round cap. 하나를 선택하면 나머지는 opacity .28. 선택 경로는 구간 중점에 번호 라벨(22px 흰 원, 2px `#1C1917` 테두리, 11px/700) — 현재 `.ku-slope-segment-label`과 같다.
- 마커/선을 클릭하면 해당 행이 선택된다(목록과 지도 양방향 동기화).

### 2. 상세 패널 — 독립 시설 (`FacilityFormModal` + 행 액션 대체)
모달 대신 오른쪽 패널로 연다. 세로 flex: 스크롤 본문(padding 18 20, gap 16) + 고정 하단 바.
1. 헤더: 38px 유형 아이콘(radius 10) · 이름 17px/700 · 메타 12px `#8A837D` `{유형} · {수정일} 수정` · 오른쪽 ✕(32px, hover `#F7F5F3`).
2. **설치 상태 세그먼트**: 바탕 `#F0EDEA` radius 9 padding 3. 버튼 높이 30, padding 0 14, 12.5px/700. 활성은 흰 배경 + `0 1px 3px rgba(28,25,23,.12)`, 글자는 설치 `#2F7A4F` / 미설치 `#A32D2D`. 비활성 글자 `#8A837D`. 누르는 즉시 저장 + 토스트(현재 `handleToggleInstalled`).
   - 오른쪽 번역 상태: pending이면 알약(1px `#F5D48A`, 배경 `#FFFBEB`, 12px/600 `#92400E`) `영문·중문 번역 대기` + 안쪽 `재번역` 버튼(24px, `#92400E` 배경, 흰 11.5px/700). 완료면 `✓ 영문·중문 번역 완료` 12px/600 `#2F7A4F`.
3. 폼 그리드 2열, gap 12×14. 라벨 12px/600 `#5C5652`, 입력 높이 40, 1px `#D6D1CC`, radius 8, 14px. 포커스 테두리 `#8C0000` + `0 0 0 3px #F3DDDA`.
   - 시설 이름(2열), 설명 textarea 2줄(2열), 유형(select), 위치(좌표는 mono 12.5px, 아래 캠퍼스 판정 `#2F7A4F` 600 `{캠퍼스} 영역 · 지도에서 핀 이동`). 위치는 뒤의 지도에서 핀을 끌거나 클릭해서 바꾼다. 패널 안에 지도를 또 넣지 않는다. `현 위치로 찍기`는 위치 필드 옆 보조 버튼으로 둔다.
4. 미디어 2열: 사진 `사진 {n}장` + 58px 썸네일(radius 7) + 점선 `＋ 추가`(`FacilityPhotoManager`). 동영상: 연결됨이면 58px 높이 카드(▶ 썸네일 + `연결됨` + `교체` 버튼), 없으면 점선 버튼 `＋ 동영상 연결`(`FacilityVideoModal`을 연다).
5. 하단 바(padding 12 20, 위 1px `#F0EDEA`): 왼쪽 텍스트 버튼 `삭제` (`#DC2626`, hover `#FCEBEB`). 누르면 같은 자리가 인라인 확인으로 바뀐다: `삭제한 시설은 복구할 수 없어요.` + `취소` + 빨강 채움 `삭제`. 오른쪽 `닫기`(외곽선) · `저장`(크림슨 채움, 36px, padding 0 18, 13px/700).

### 3. 상세 패널 — 명소 (`LandmarkFormModal` 대체)
- 헤더: 44px 이모지 버튼(1px `#D6D1CC`, radius 10, 22px, 누르면 `EmojiPicker`) · 이름 · `{캠퍼스} · {수정일} 수정` · ✕.
- 2열 `minmax(0,1fr) 200px`: 왼쪽에 이름/설명, 오른쪽에 사진(있으면 이미지 + 오른쪽 아래 `변경`/`삭제` 미니 버튼, 없으면 점선 `＋ 사진 선택`, 최소 높이 120).
- 번역 카드(1px `#E8E4E0`, radius 10): 헤더 `번역` + `자동번역 채우기`(외곽선, 글자 `#A31C12`). 본문 그리드 `52px 1fr`: English / 中文 값. 비어 있으면 `번역 없음`을 `#B45309`로.
  - 영문/중문 **설명**은 접어서 보여준다(필요하면 펼침). 현재 폼처럼 6개 필드를 다 늘어놓지 않는다.
- 좌표 + 캠퍼스 판정 한 줄 + `지도를 클릭해 위치 변경`.
- 하단 바는 시설과 같다(확인 문구 `명소와 사진은 복구할 수 없어요.`).

### 4. 상세 패널 — 경사도 (보기 → 편집)
**보기**: 헤더(이름 17px/700, 메타 `{n}개 구간 · 총 {m}m · {수정일} 수정`) + `삭제` 텍스트 버튼 + 크림슨 `경로 편집`.
구간 표: 헤더 행(34px, `#F7F5F3`, radius 8, 11.5px/600 `#8A837D`) `구간 | 거리 | 경사 | 판정`, 열 `56px 1fr 1fr 1fr`. 행 40px: 색 점 + 번호, `{d}m`, `{x.x}° · {y.y}%`, 판정 배지.

**편집**(`/admin/slopes/[id]`를 대체하거나 같은 컴포넌트를 패널에 넣음): 페이지를 이동하지 않고 같은 패널이 편집 모드로 바뀐다. 지도에는 그 경로만 굵게 + 꼭짓점 핸들(14px 흰 원, 3px `#1C1917` 테두리)이 보인다.
- 지도 위 가운데 상단에 도구 바(흰색, radius 10, 그림자): `✎ 이어 그리기` · `◇ 꼭짓점 편집`(활성: `#FAF0EF`/`#8C0000`) · `⌫ 지우기`. Leaflet-Geoman 툴바를 이 모양으로 바꾼다.
- 패널 상단: 저장 상태 알약(`저장됨` `#EAF3DE`/`#3B6D11`, `저장 안 됨` `#FEF3C7`/`#92400E`) · `{n}개 구간 · 총 {m}m` · 단위 세그먼트 `°` / `%` · 경로 이름 입력(42px, 16px/700).
- 구간 카드(1px `#E8E4E0`, radius 10, padding 10 12, 그리드 `28px 1fr auto`): 판정 색 번호 원 26px · `구간 {n} · {d}m · = {환산값}` · 숫자 입력(72×36, 오른쪽 정렬, 14px/600) + 단위. 경고 문구는 `SlopeSegmentList`의 문구를 그대로 쓴다(1/12 초과 `#92400E`, 16.7° 이상 `#DC2626`).
- 하단: 안내 `지도에서 꼭짓점을 끌어 경로를 고쳐요` + `취소` + `저장`. 저장할 때 기존의 `updated_at` 동시성 체크를 유지한다.

### 5. 제보함 — 상태별 보드
- 페이지 padding 22 24 20, gap 14. 제목 `제보함` 22px/700 + 캡션 `처리 전 {n}건 · 카드를 눌러 검토해요`. 오른쪽에 종류 세그먼트 `전체 / 등록 요청 / 피드백`(바탕 `#EBE7E2`, 버튼 32px).
- 3열 그리드(gap 14), 열마다 배경 `#EFEBE7` radius 12. 열 헤더(padding 12 14): 8px 점 + 이름 13.5px/700 + 개수.
  - 신규(점 `#C27A12`) = new · 확인 중(`#4F3F86`) = reviewing · 처리 완료(`#2F7A4F`) = approved + rejected + resolved
  - 처리 완료 열은 최근 N건만 보여주고 `더 보기`를 둘 것(API 페이지네이션).
- 카드(흰색, 1px `#E8E4E0`, radius 10, padding 12, gap 8, 그림자 `0 1px 2px rgba(28,25,23,.06)`, hover 테두리 `#D6D1CC`):
  - 1줄: 종류 태그(`#F0EDEA`/`#5C5652`, 11px/700, radius 5) · 신규면 6px 크림슨 점 · 오른쪽 접수 시각 11.5px.
  - 2줄: 등록 요청은 44px 썸네일(사진 없으면 `#F0EDEA`) + 제목 `{유형} · {건물} {층}` + 설명 2줄. 피드백은 제목 = 유형 라벨, 본문 2줄. 신규면 제목 700, 아니면 500.
  - 3줄: 상태 알약 + 메타(`사진 n · 위치 있음/없음`).
- 카드를 누르면 **검토 드로어**가 열린다: 배경 dim `rgba(28,25,23,.22)`(누르면 닫힘) + 오른쪽 600px 패널, `-12px 0 32px rgba(28,25,23,.16)`. Esc로 닫기(`useModalFocus`).

### 6. 검토 드로어 — 등록 요청 (`FacilityRequestReviewModal` 대체)
- 헤더: 42px 유형 아이콘 · `{유형} 등록 요청` 19px/700 · 상태 알약 + 건물 링크(`#A31C12`) + `· {시각} 접수`.
- 제보 사진: 132px 정사각 썸네일, 오른쪽 위 22px 체크박스. 체크(공개): 테두리 2px `#8C0000`, 체크 배경 `#8C0000` ✓. 해제: 테두리 `#E8E4E0`, opacity .6. 오른쪽 위 안내 `체크한 사진만 공개돼요`. 사진 전체가 토글 대상이다.
- 2열: 왼쪽은 `FacilityFields`(유형/이름/층/설명), 오른쪽은 위치 미니맵(건물 폴리곤 강조 `#A31C12` 2px + 8% 채움, 핀) + 판정 문구(`제보자가 찍은 위치가 있어요` `#2F7A4F` / `위치 없음 · 지도에서 찍어 주세요` `#B45309`).
- 고정 하단 바(padding 14 28, 위 1px `#E8E4E0`):
  - 처리 전: `거절`(외곽선 `#F0A6A1`, 글자 `#DC2626`) · `확인 중으로 표시`/`신규로 되돌리기` · (여백) · `사진 {k}/{n}장 공개` 12px · `승인하고 등록`(크림슨).
  - `거절`을 누르면 바가 인라인 확인으로 바뀐다: `거절할까요? 요청 사진은 지워지고 거절됨으로 남아요.` + `취소` + 빨강 `거절`. ConfirmModal을 겹쳐 띄우지 않는다.
  - 처리 후: 상태 색 문구(`승인되어 시설로 등록됐어요` / `거절된 요청이에요`) + 승인이면 `만들어진 시설 보기 →`, 남은 사진이 있으면 `남은 사진 정리`.

### 7. 검토 드로어 — 피드백 (`FeedbackDetailModal` 대체)
- 유형 태그 + `{시각} 접수`. 본문 16px, line-height 1.7, max-width 640, `white-space: pre-wrap`.
- `보낸 화면` + page_url 링크(mono 12px).
- 하단 바: `처리 상태` 라벨 + 세그먼트 `신규 / 확인 중 / 처리 완료`(활성 글자 색은 각 상태 fg) · 오른쪽 `다음 항목 →`. 상태를 바꾸면 바로 PATCH + 토스트, 카드는 해당 열로 옮겨간다.

### 8. 모바일 (≤767px)
- 헤더 54px(로고 28px + `관리자 콘솔` + ⋮ 메뉴). 하단 nav는 지금처럼 고정 58px, 활성은 `inset 0 2px 0 #8C0000`.
- **지도 탭**: 지도가 전체를 채운다. 위에 떠 있는 검색(46px, radius 12, 그림자) + 가로 스크롤 칩. 아래 **바텀시트**: radius 18 18 0 0, 그림자 `0 -6px 24px rgba(28,25,23,.14)`. 핸들(40×4)을 누르면 펼침 58% ↔ 접힘 150px. 시트 안: 제목 18px/700 + `{n}개 표시` + `＋ 추가`, 행 최소 높이 64.
- **상세**: 전체 화면. 상단 바 `‹` + 제목. 미리보기(시설: 지도 190px, 명소: 사진 190px, 경사도: 경로 지도 230px) → 폼(입력 46px, 16px 글자) → 하단 고정 `취소`(1) / `저장`(2), 버튼 50px. 설치 세그먼트 40px. 삭제는 본문 맨 아래 텍스트 버튼.
- **경사도 상세(모바일)**: 보기와 편집을 합친다. 구간 카드마다 44px 입력 + `°`/`%` 세그먼트.
- **제보함(모바일)**: 세그먼트 `등록 요청 n / 피드백 n` + 상태 칩(처리 전·신규·확인 중·처리 완료·전체) + 카드 목록 → 상세 전체 화면. 하단 고정 바: 등록 요청은 `거절`(1) / `승인하고 등록`(2), 피드백은 상태 세그먼트 44px.
- 모든 터치 영역 ≥44px (현재 A11Y-P2-01 규칙 유지).

## Interactions & Behavior
- 행 클릭 ↔ 마커 클릭 → 선택(같은 항목을 다시 누르면 해제, 데스크톱만). 선택하면 지도를 그 항목으로 `panTo`(패널 padding 반영).
- 칩/검색/정렬을 바꾸면 페이지 1로 + 선택 해제.
- 설치 토글, 재번역, 피드백 상태: 즉시 저장 + 토스트. 이름/설명 등 폼 필드: `저장`을 눌러야 저장.
- 토스트: 아래 가운데(데스크톱 28px, 모바일 140px), `#1C1917`, 흰 13px/600, radius 10, 2.2초. 기존 `Toast`를 쓴다.
- 패널 열고 닫기: 트랜지션 없음 또는 150ms ease(전역 `transition` 규칙). `prefers-reduced-motion` 존중. 바텀시트 높이 변화는 250ms.
- 로딩: 목록 패널 안에 `불러오는 중...`(현재 문구), 지도는 유지. 오류: 패널 안에 문구 + `다시 시도`.
- 빈 상태: `조건에 맞는 항목이 없어요`(13px `#8A837D`, padding 40). 보드의 빈 열은 점선 박스 `비어 있어요`.
- 다크 모드: 모든 값은 `globals.css` 토큰으로 쓴다(아래 표의 토큰 이름 사용). 하드코딩하지 않는다.

## State Management
페이지별로 기존 state를 유지하고 다음만 더한다.
- `selectedId: string | null`. 기존 `editingFacility`/`editingLandmark` 모달 state를 대체한다. URL `?id=`에 동기화하면 새로고침해도 유지된다.
- `chip`: 기존 select 필터 값과 연결한다(`installationFilter`, `photoFilter`, 번역/동영상은 쿼리 조건 추가).
- 칩 개수: 별도 count 쿼리(`head: true`)로. 건물 탭의 summary 패턴과 같다.
- 경사도: `mode: 'view' | 'edit'`, 편집 버퍼(`name`, `vertices`, `slopes`, `unit`, `dirty`). `SlopeRouteEditor` 로직을 재사용한다.
- 제보함: `kind: 'all'|'requests'|'feedback'`, `openId`. 보드는 상태별로 3번 조회하거나, 한 번 조회한 뒤 클라이언트에서 그룹으로 나눈다. 변경 뒤 `inboxCountsChanged` 이벤트는 지금처럼 보낸다.

## Design Tokens
`globals.css`의 라이트 값. 다크는 기존 토큰을 따른다.

| 용도 | 토큰 | 값 |
|---|---|---|
| 배경 | --ku-bg | #F7F5F3 |
| 표면 | --ku-surface | #FFFFFF |
| 구분선 | --ku-divider | #F0EDEA |
| 테두리 | --ku-border | #E8E4E0 |
| 입력 테두리 | --ku-border-input | #D6D1CC |
| 텍스트 1/2/3 | --ku-text-1/2/3 | #1C1917 / #5C5652 / #8A837D |
| **주 액션** | --ku-crimson-700 | #8C0000 (hover #6E0000 = crimson-800) |
| 강조 텍스트·링크 | --ku-crimson-600 | #A31C12 |
| 선택 행 배경 | --ku-crimson-50 | #FAF0EF |
| 포커스 링 | --ku-crimson-100 | #F3DDDA |
| 위험 | --ku-danger | #DC2626 |
| 설치/성공 | --ku-success-bg/fg | #EAF3ED / #2F7A4F |
| 미설치/거절 | --ku-status-missing-bg/fg | #FCEBEB / #A32D2D |
| 경고/신규 | --ku-status-warn-bg/fg | #FEF3C7 / #92400E |
| 확인 중 (신규 토큰) | --ku-status-review-bg/fg | #E9E5F5 / #4F3F86 |
| 지도 위 패널 바탕 | — | #FBFAF9 (범례·표 헤더) |
| 보드 열 배경 | — | #EFEBE7 |
| 세그먼트 바탕 | — | #F0EDEA (모바일 #EBE7E2) |

경사 판정 색(신규): ok `#3E7A46` (≤4.76°) · over `#C27A12` (>4.76°, 1/12 완화 한도) · extreme `#A31C12` (≥16.7°, 30%). 기준값은 `src/lib/slopeScale.ts`를 그대로 따른다.
시설 유형 색: `theme.ts`의 `facilityColor`(elevator #2D5FB0, restroom #2F7A4F, ramp #B25617, parking #6D4AB0, braille #8A6A00).

- 폰트: Pretendard Variable(기존). 제목 22/20/19/17px 700, 본문 14/13.5/13px, 메타 12/11.5px, 배지 11px/700. 좌표·URL은 `ui-monospace`.
- 반경: 배지 999 · 버튼·입력 8 · 카드/행 카드 10 · 패널·보드 열 12–14 · 모바일 시트 18.
- 간격: 패널 안쪽 18–20, 행 11–12 세로, 요소 사이 gap 6/8/10/12/14/16.
- 그림자: 패널 `0 4px 20px rgba(28,25,23,.14)`, 드로어 `-12px 0 32px rgba(28,25,23,.16)`, 지도 컨트롤 `--ku-shadow-floating`, 활성 세그먼트 `0 1px 3px rgba(28,25,23,.12)`.

## Assets
- `public/favicon.png`: 기존 저장소 파일(헤더 로고).
- 아이콘: 새로 추가하지 않는다. 시설은 기존 `FacilityTypeIcon`, 명소는 `LandmarkEmoji`를 쓴다. 프로토타입의 한 글자 약자(엘/화/경/주/점)는 자리 표시용이다.
- 지도/사진/동영상: 프로토타입은 줄무늬 플레이스홀더다. 실제로는 Leaflet 타일, Supabase Storage 이미지를 쓴다.

## Files
- `Admin B.dc.html`: 프로토타입(데스크톱/모바일 모두). `support.js`와 같은 폴더에 두고 브라우저로 연다. 모바일은 파일 안의 `device` prop으로 바꾼다(기본 desktop). 인라인 스타일에 위 값이 모두 들어 있다.
- 바꿀 원본 파일:
  - `src/app/admin/dashboard/{facilities,landmarks,slopes,inbox}/page.tsx`
  - `src/app/admin/slopes/[id]/page.tsx`, `src/app/admin/slopes/new/page.tsx` → 지도 화면의 편집 모드로 합친다(라우트는 리다이렉트로 유지 가능)
  - `src/components/admin/{FacilityFormModal,LandmarkFormModal}.tsx` → 패널 컴포넌트로
  - `src/components/admin/inbox/*` → 보드 + 드로어
  - `src/app/admin/admin-ui.css` → 새 `ku-map-workspace`, `ku-float-panel`, `ku-detail-panel`, `ku-chip`, `ku-board-*` 클래스 추가, `--ku-primary` 쓰던 곳을 크림슨으로
  - `src/app/admin/dashboard/layout.tsx` → nav 배지 색
- e2e: `e2e/admin-content.spec.ts`, `admin-inbox.spec.ts`, `admin-buildings-slopes.spec.ts`는 행 버튼(수정/삭제) 선택자를 쓴다. 행 클릭 → 패널 버튼으로 고쳐야 한다. `data-testid="admin-list-item-name"`은 유지할 것.
