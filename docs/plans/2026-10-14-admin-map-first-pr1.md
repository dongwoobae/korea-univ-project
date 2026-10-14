# 관리자 지도 우선 리디자인 ① 구현 계획 — 토큰·셸·공통 단위·독립 시설

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 주 액션 색을 크림슨으로 바꾸고, 독립 시설 탭을 지도가 화면을 채우고 그 위에 목록·상세 패널이 뜨는 작업 화면으로 다시 만든다. 명소·경사도 탭(PR ②·③)이 그대로 쓸 공통 단위를 함께 만든다.

**Architecture:** 순수 로직(URL ↔ 작업 화면 상태, 목록 거르기·정렬·페이지·칩 개수, 시설 칩 조건·초안 비교, 시설 저장)은 `src/lib/`에 두고 vitest로 고정한다. 화면은 `src/components/admin/workspace/`의 공통 단위(지도 자리·지도·목록 패널·상세 패널·선택 훅)와 `src/components/admin/facilities/`의 탭 단위로 나눈다. 지도는 탭마다 `next/dynamic(ssr:false)` 경계 하나(`FacilityWorkspaceMap`) 안에서 react-leaflet으로 그리고, 명령은 객체 하나로 등록한다. 저장 안 한 변경은 대시보드 레이아웃의 가드 하나가 받는다.

**Tech Stack:** Next.js 16.2.4 App Router, React 19.2.4(React Compiler), react-leaflet 5 + Leaflet 1.9, `@supabase/supabase-js` 2.105, Vitest 3(node 환경), Playwright 1.61(목 백엔드).

**Spec:** `docs/specs/2026-10-14-admin-map-first-redesign-design.md`(이하 "설계 N.N"). 화면 값(색·간격·문구·반경·그림자)의 원본은 `docs/specs/2026-10-14-admin-map-first-handoff/README.md`(이하 "핸드오버")다. 계획과 설계가 다르면 설계가 맞다 — 멈추고 보고한다. 아래 "계획이 정한 것"은 설계가 이 계획에 맡긴 것이거나, 측정으로 설계 문장을 고치는 것이다.

## 남은 일 (2026-10-14 밤 기준)

아래 태스크 본문의 체크박스는 갱신하지 않았다. 이 절이 기준이다. Task 0~11의 구현·문서는 커밋돼 있고, 남은 것은 이것뿐이다. 진행 기록(`.superpowers/`)은 gitignore라 다른 PC에는 없다 — 필요한 내용은 여기 옮겼다.

### 끝낸 것

- 가드의 다른 사이트에서 들어온 탭 `나가기`: `canGoBack()`을 지우고 뒤로 가 본 뒤 `BACK_SETTLE_MS` 안에 popstate나 `beforeunload`가 오는지로 판정한다. bfcache 복귀(`pageshow`)에서 떠나던 상태를 푼다. 설계 3.4를 고쳤다. 뒤로 갈 기록이 없는 탭의 시나리오를 더했다(README 218 시나리오).
- 태블릿 CSS 경계: `min-width: 768px`를 뺐다.
- 모바일 "상세 위쪽 지도 띠를 누르면 핀이 옮겨진다"가 첫 컴파일에서 지도가 붙기 전에 누르던 경합: 선택 마커가 뜬 뒤에 누른다.
- PR 본문에 계획과 달라진 것·역추적·확인 목록·알려진 것을 적었다.

### 검증 메모

- `npm run lint`가 `.claude/worktrees/agent-*`(지난 세션의 에이전트 worktree)까지 읽어 오류를 낸다. 그런 폴더가 있으면 `npx eslint --ignore-pattern ".claude/**" .`로 본다.
- 작업 사본이 CRLF(`core.autocrlf=true`)라 `npm run format:check`가 모든 파일을 걸린다. `npx prettier --check --end-of-line auto --ignore-path .prettierignore --ignore-path .gitignore . "!.claude/**"`로 본다.
- `public-map.spec.ts`의 "건물명 라벨은 가까이 확대하면…"이 전체 병렬 실행에서 한 번 실패한 적이 있다(단독 10/10 통과).
- 검증은 GitHub CI를 기다리지 않고 로컬에서 CI 잡을 그대로 돌린다. 작업 사본과 조건(CRLF·`.env.local`·`.claude/worktrees`)이 달라, `core.autocrlf=false`로 스크래치에 클론해 `CI=true`로 돌린다.
- 2026-10-14 마지막 결과(위 방식): migration-safety 변경 없음, lint 오류 0, format:check·typecheck 통과, vitest 68파일·494개, Playwright 218개 통과(`.next`를 비운 첫 컴파일, 재시도 없이).

### 프리뷰·기기 확인 (Task 2·7·8·9·10의 프리뷰 단계)

PR 본문의 "프리뷰·기기" 체크 목록대로 Vercel 프리뷰에서 본다. 모바일 safe area가 확인되면 Task 10 Step 5대로 설계 10장의 safe area 항목을 옮기고, 못 했으면 남기고 PR 본문에 적는다.

### 알려진 것

- 768~828px 폭에서 헤더 `로그아웃`이 잘린다. `main`에서도 같아 이 PR에서 고치지 않고 `docs/TODO_list/admin/header-logout-clipped-tablet.md`로 남겼다.
- 태블릿에서 목록이 숨을 때 눌렀던 행의 초점이 body로 떨어진다. 다음 Tab이 `상세 닫기`로 가서 쓰는 데는 문제없어 두었다.
- 저장 뒤 목록 다시 받기가 실패하면 저장한 값도 "저장 안 한 변경"으로 남아 한 번 더 묻는다(안전한 쪽이라 두었다).

### 마무리

`gh pr ready`(초안 해제)는 사용자 확인 뒤에 한다. 병합할 때 Task 11 Step 7대로 이 계획을 `git rm`한다.

## Global Constraints

- 범위는 설계 1장의 PR ①이다: 사양·핸드오버 원문(커밋 `6c10d8d`로 이미 들어 있다), 토큰(3.6), 셸(3.1), 지도 작업 화면 공통 단위(3.2~3.5), 독립 시설(4장). 명소·경사도·제보함 화면과 건물 탭 레이아웃은 바꾸지 않는다.
- 크림슨 채움은 라이트 `#8C0000`(hover `#6E0000`), 다크 `#CC2936`(hover `#B0202E`)이다(설계 2.4·3.6).
- 토스트는 컴포넌트 하나로 두고 `.ku-admin-shell` 범위에서만 모양을 바꾼다. 표시 시간은 3초 그대로다(설계 2.12).
- 목록은 `ADMIN_PAGE_SIZE`씩 나누고, 지도에는 거른 결과 전체를 그린다(설계 3.3). 정렬 select는 `최근 수정순 / 오래 수정순 / 이름순`.
- URL 파라미터는 `id`·`new`·`edit`만 쓰고 지운다. 모르는 파라미터는 남긴다. 바꿀 때는 `history.replaceState`를 쓰고 `useSearchParams`는 쓰지 않는다(설계 3.4).
- 확인 창 문구는 `저장하지 않은 변경사항이 있어요` / `지금 나가면 입력한 값이 사라져요` / `나가기`다(설계 3.4).
- 새 CSS 클래스는 핸드오버 "Files"의 `ku-map-workspace`·`ku-float-panel`·`ku-detail-panel`·`ku-chip`을 쓰고, 그 밖은 `ku-workspace-*`·`ku-detail-*`·`ku-bottom-sheet*`로 짓는다.
- 다크 대응이 필요한 값은 `globals.css` 토큰으로 쓴다. 토큰이 없는 핸드오버 값(`#FBFAF9` 등)은 `color-mix()`로 토큰에서 만든다.
- 검증은 로컬에서 lint·format:check·typecheck·vitest·Playwright를 돌려서 하고, PR CI는 PR ①을 마칠 때 한 번 푸시해 최종 확인한다. 화면은 Vercel 프리뷰로 본다(설계 8.4) — 아래 "검증 방법".
- Next 16 문서는 `node_modules/next/dist/docs/`에 있다(AGENTS.md).
- vitest는 `environment: "node"`라 컴포넌트를 렌더하지 못한다. 순수 함수만 단위 테스트하고 화면은 Playwright로 본다.
- React Compiler와 `eslint-config-next`가 켜져 있다. 렌더 중에 ref를 읽거나 쓰지 않는다. effect 안의 동기 `setState`는 경고(`react-hooks/set-state-in-effect`)라 새로 만들지 않는다.
- 주석은 이유·외부 제약·위험만 적는다. 다른 파일의 줄 번호·개수·상수 값을 적지 않고 심볼 이름으로 가리킨다.
- 커밋 메시지는 한국어 `type(scope): 내용`. `Co-Authored-By`를 붙이지 않고, 작업 과정(리뷰·점검)을 적지 않는다.
- 이 저장소는 `core.autocrlf=true`다.

## 검증 방법

2026-10-14 Task 9부터 로컬에서 확인한다(설계 8.4). 그 전 태스크(0~8)는 푸시한 뒤 PR CI 결과로 확인했다. 각 태스크의 "커밋·푸시하고 실패를 확인한다"·"커밋·푸시하고 통과를 확인한다" 단계는 커밋한 뒤 아래 명령을 돌리는 것으로 읽고, 푸시는 PR ①을 마칠 때(Task 11) 한 번 한다.

```bash
npm ci                                    # 처음 한 번
npm run lint
npm run format:check
npm run typecheck
npm run test                              # vitest
npx playwright test e2e/<바꾼 spec>.ts    # 고치는 동안
npm run test:e2e                          # 태스크를 마치기 전에 전체
```

- Playwright 설정은 로컬에서 이미 떠 있는 서버(포트 3100)를 다시 쓴다. 앞 실행에서 남은 `next dev`가 있으면 끄고 돌린다.
- 테스트만 커밋한 상태에서 새 시나리오를 돌려 **기대한 이유로** 실패하는지 본 뒤 구현한다. 모듈이 아직 없어서 typecheck와 vitest가 함께 실패하는 것은 기대한 실패다.
- 기대와 다른 이유로 실패하면 구현으로 넘어가지 말고 테스트를 고친다.
- 화면 확인은 PR의 Vercel 프리뷰에서 한다. 프리뷰는 푸시해야 갱신되므로 PR ①을 마칠 때 한꺼번에 본다. 모바일은 실제 휴대폰으로 연다(Task 10).

## 브랜치와 PR

| PR  | 브랜치                                         | 내용               |
| --- | ---------------------------------------------- | ------------------ |
| ①   | `feat/admin-map-first`(사양 커밋 `6c10d8d` 위) | 이 계획 전부(0~11) |

PR ①을 `main`에 병합할 때 이 계획 문서를 `git rm`한다(Task 11). ②의 계획은 ①이 병합된 뒤 ①이 실제로 만든 컴포넌트를 보고 쓴다(설계 1장).

## 계획이 정한 것

설계가 이 계획에 맡겼거나 정하지 않은 것, 측정으로 설계 문장을 고치는 것이다. 각 태스크가 이 결정을 따른다.

1. **칩 개수는 전체 행 기준이다.** 검색·유형 드롭다운과 상관없이 센다. 프로토타입(`Admin B.dc.html`의 `mkChips`)이 그렇고, 핸드오버가 칩을 "요약 카드 겸용"이라 한다. 결과 줄의 `{n}개 표시`가 거른 수를 맡는다.
2. **페이지를 바꿔도 선택을 푼다.** 설계 3.4 표가 페이지 변경을 확인 대상으로 둔다. 선택이 남는다면 확인할 이유가 없다.
3. **새로 만들기에서 설치 세그먼트는 초안 값이다.** 저장할 시설 id가 없으므로 즉시 저장하지 않고 insert에 싣는다. 기존 시설만 누르는 즉시 저장한다(설계 4.2).
4. **번역 알약 문구.** 핸드오버는 pending만 정한다(`영문·중문 번역 대기`). `failed`나 빈 번역 필드(`facilityNeedsTranslation`이 참인 나머지)는 `영문·중문 번역 필요`로 쓴다 — 실패한 번역을 "대기"라 부르면 틀린 말이다.
5. **`.ku-admin-content` 전역 덮어쓰기(설계 3.1·10장).** 2026-10-14에 따져 본 결과:
   - `.ku-admin-content > div { background … !important }`는 `.ku-admin-shell`이 같은 배경을 이미 줘서 라이트·다크 모두 바뀌는 것이 없다 → 지운다.
   - 입력·버튼 규칙은 실제로 덮어쓰는 곳이 있다: 명소 폼(`LandmarkFormModal`)·이모지 피커 입력의 색, 동영상 캡션 입력, 각 화면 버튼의 반경, 그리고 `globals.css`의 크림슨 포커스 테두리(특이도가 같아, `admin-ui.css`가 뒤에 불려 오면 이 규칙이 이긴다 — 불려 오는 순서로 추론한 것이고 화면에서 재 보지는 않았다).
   - 건물 화면이 기대는 것은 카드 버튼 반경(`button.ku-admin-overview-item` 10px → 8px, `.ku-admin-mobile-card` 12px → 8px)뿐이다.
   - 그래서 건물 카드 반경을 각 클래스로 옮기고, 입력·버튼 규칙은 지도 작업 화면(`.ku-map-workspace`)을 빼도록 좁힌다. 남는 의존은 아직 옮기지 않은 명소·경사도·제보함이고, 마지막 탭을 옮기는 PR ④가 규칙을 지운다. 설계 3.1 문장을 이 결과로 고친다(Task 2).
6. **하드코딩 파랑 분류(설계 3.6이 이 계획에 맡김).** `rg -n -i "2563eb" src e2e` 결과를 역할로 나눴다.

   | 바꾼다 → 토큰                                                                                                                                                                                                                                                                              | 그대로 둔다                                                                                                                                                                                                                                                                                                                                                                                                                                               |
   | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `AddFacilityButton` 채움, `FacilityFormModal` 선택 위치 문구, `LandmarkFormModal` 자동번역 버튼·선택 위치 문구·저장 채움, `FeedbackEmailModal` 참조 추가·저장 채움, `FacilityVideoModal` 업로드 진행 막대, `PolygonEditor` 폴리곤 저장 채움, `FacilityMap` 건물 강조(관리자 쪽만 prop으로) | 공개 지도 현재 위치(`map/Map.tsx`, `map-ui.css`의 `.ku-user-location-dot`), 경사도 편집 지도의 현재 위치 점(`SlopeRouteMap`, 현재 위치는 파랑이라는 관례. `admin-buildings-slopes.spec.ts`가 이 색을 본다), 편집 지도의 기존 선·폴리곤(`PolygonEditor`·`BuildingPolygonPreview`·`SlopeRouteMap`) — geoman이 새로 그리는 선은 Leaflet 기본 파랑이라 기존 선만 바꾸면 한 편집기 안에서 색이 갈린다. 경사도 편집 지도의 색은 설계 6.4가 PR ③에서 다시 정한다 |

   설계 3.6의 예시 "(…, 편집 지도의 선 등)"은 위 이유로 맞지 않아 그 문장을 이 결과로 고친다(Task 1).

7. **패널에 z-index를 두지 않는다.** 패널이 쌓임 맥락을 만들면 그 안에서 여는 고정 모달(`FacilityVideoModal`, 사진 삭제 `ConfirmModal`)이 헤더(z-index 100) 아래에 갇힌다. 지도 자리만 `z-index: 0`으로 가두고 패널은 문서 순서로 그 위에 그린다.
8. **모바일 터치 영역은 44px이다.** 핸드오버 8장은 설치 세그먼트 40px과 "모든 터치 영역 ≥44px"을 함께 적는다. 뒤의 규칙(지금 A11Y-P2-01)을 따라 모바일 세그먼트·칩·보조 버튼을 44px으로 둔다.
9. **설명 입력은 한 줄 그대로다.** 핸드오버는 textarea 2줄이지만 `FacilityFields`는 공개 등록 요청 모달·제보함 검토 모달과 같이 쓴다. 바꾸면 범위 밖 화면이 바뀐다.
10. **모바일 상세의 미디어 칸은 데스크톱과 같다.** 핸드오버 모바일의 `사진 n장 관리`/`동영상 연결` 두 버튼 대신 같은 칸을 한 열로 쌓는다. 사진 관리 화면을 하나 더 만들지 않는다.
11. **위치가 없는 시설은 지도에 그리지 않고 목록에는 남긴다.** 선택하면 패널에서 지도를 눌러 위치를 찍는다.
12. **지도는 선택이 바뀔 때만 옮긴다.** `focus`의 key가 선택 id라서, 초안 핀을 끌거나 찍어도 지도가 따라가지 않는다. 옮기는 대상은 저장된 좌표다.
13. **새 시설의 초안 마커는 크림슨 채움 + 폴백 아이콘이다.** 유형을 고르기 전에도 같은 모양이다.

## 기존 E2E 시나리오의 행방

설계 8.2를 spec 파일마다 대조한 결과다. Task 7이 독립 시설 화면을 바꾸는 순간 행 버튼에 기대던 시나리오가 깨지므로, Task 7에서 지우고 같은 동작을 다시 갖춘 태스크에서 새로 쓴다. 그 사이 커밋에서는 그 동작의 E2E가 비어 있다.

| 파일 · 시나리오                                                                      | 처리                                                                    | 태스크 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------ |
| `admin-content` · 독립 시설을 검색·필터·정렬하고 조건을 초기화한다                   | 지우고 작업 화면 spec의 칩·검색·유형·정렬(데스크톱), 바텀시트(모바일)로 | 7, 10  |
| `admin-content` · 독립 시설을 현재 위치에 생성하고 상태 변경 후 삭제한다             | 지우고 새로 만들기·설치 세그먼트·인라인 삭제 시나리오로                 | 7, 8   |
| `admin-content` · 시설 저장과 자동 번역 실패를 분리하고 재번역한다                   | 지우고 "저장과 자동 번역 실패를 나누어 알리고 재번역한다"로             | 7, 8   |
| `admin-content` · 동영상 업로드·캡션·삭제 / 변환 도구 중 나가기 / 포스터 업로드 실패 | 지우고 같은 본문을 패널의 `＋ 동영상 연결`로 열어 작업 화면 spec에      | 7, 8   |
| `accessibility-dialog-toast` · 시설 모달이 초점을 가두고…                            | 건물 상세의 `+ 시설 추가`로 옮긴다(`FacilityFormModal`은 거기 남는다)   | 7      |
| `accessibility-dialog-toast` · 중첩 확인 모달만 먼저 닫고… / 동영상 삭제 성공 시…    | 지우고 같은 파일에 패널의 `교체`로 여는 판을 다시 쓴다                  | 7, 8   |
| `accessibility-dialog-toast` · 오류와 성공 토스트를…                                 | 성공 토스트 부분을 건물 상세 시설 모달의 설치 토글로                    | 7      |
| `accessibility-dialog-toast` · 관리자 모달 폼 레이블이…                              | 시설 부분은 건물 상세 모달로, 설정 부분은 건물 목록에서                 | 7      |
| `accessibility-dialog-toast` · 모바일에서 관리자 행 동작 버튼이 44px…                | 지우고 같은 파일에 "모바일 독립 시설 상세의 버튼이 44px…"로             | 7, 10  |
| `admin-dark` · 시설 폼 모달에 하드코딩 밝은 색이…                                    | 건물 상세 모달로 옮기고, 패널 스캔을 더한다                             | 7, 8   |
| `admin-campus-boundaries` · 캠퍼스 밖 독립 시설에 경고하되 저장은 허용한다           | 파일을 지우고 작업 화면 spec의 "캠퍼스 밖 위치는 경고하되 저장한다"로   | 7, 8   |
| `admin-auth` · 비로그인 리다이렉트·피드백 이메일 변경(독립 시설 경로를 지난다)       | 그대로 통과해야 한다                                                    | —      |

## 파일 지도

| 파일                                                            | 책임                                                                                               | 태스크         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------- |
| `src/app/globals.css`                                           | `--ku-primary*`를 크림슨으로, `--ku-primary-hover`·`--ku-status-review-*` 추가, 공개 토스트 클래스 | 1, 2           |
| `src/components/FacilityMap.tsx`, `facility/FacilityFields.tsx` | 건물 강조색 prop(`highlightColor`), 위치 칸 끄기(`showLocation`)                                   | 1, 8           |
| `src/app/admin/admin-ui.css`                                    | 셸, 전역 덮어쓰기 범위, 작업 화면·목록·상세·모바일 클래스                                          | 1, 2, 7, 8, 10 |
| `src/lib/workspaceUrl.ts`                                       | URL ↔ 작업 화면 상태(닫힘·보기·새로 만들기·편집)                                                   | 3              |
| `src/lib/adminCollection.ts`                                    | 행과 정책으로 거르기·정렬·페이지·칩 개수, 항목이 있는 페이지                                       | 4              |
| `src/lib/facilityWorkspace.ts`                                  | 독립 시설 칩 조건·정책, 표시 이름, 폼 초기값, 초안 dirty 판정                                      | 5              |
| `src/lib/facilitySave.ts`                                       | 시설 직접 저장의 공통 경로(삽입·수정 → 번역 → revalidate)와 payload                                | 6              |
| `src/lib/useMediaQuery.ts`                                      | 미디어 쿼리 구독(서버에서는 데스크톱)                                                              | 7              |
| `src/components/admin/workspace/types.ts`                       | 작업 화면 타입, 기본 viewport, 패널을 피하는 여백(`workspaceInsets`)                               | 7              |
| `src/components/admin/workspace/useAdminCollection.ts`          | 검색·칩·정렬·페이지 상태 + `viewAdminCollection`                                                   | 7              |
| `src/components/admin/workspace/useWorkspaceSelection.ts`       | URL을 원본으로 한 선택 상태, `applyWorkspaceState`                                                 | 7, 9           |
| `src/components/admin/workspace/AdminWorkspaceMap.tsx`          | react-leaflet 지도: 타일(다크), 회색 건물, 줌 버튼, 패널을 피한 `focus`, 명령 등록                 | 7              |
| `src/components/admin/workspace/AdminMapWorkspace.tsx`          | 지도 자리 + 목록 + 상세 자리, viewport 보관, 선택이 바뀌면 `focus`                                 | 7              |
| `src/components/admin/workspace/WorkspaceListPanel.tsx`         | 목록 패널(데스크톱)·떠 있는 검색 + 바텀시트(모바일)                                                | 7              |
| `src/components/admin/workspace/DetailPanel.tsx`                | 상세 패널 틀: 헤더·본문·하단 바, 인라인 삭제 확인, 모바일 전체 화면                                | 8              |
| `src/components/admin/UnsavedChangesGuard.tsx`                  | dirty 등록, 이동 확인, `beforeunload`, 뒤로가기 확인                                               | 9              |
| `src/components/admin/facilities/FacilityListRow.tsx`           | 독립 시설 행                                                                                       | 7              |
| `src/components/admin/facilities/FacilityWorkspaceMap.tsx`      | 독립 시설 마커 레이어(지도 경계)                                                                   | 7              |
| `src/components/admin/facilities/FacilityDetailPanel.tsx`       | 독립 시설 상세: 설치·번역·폼·위치·미디어·삭제·저장                                                 | 8, 9           |
| `src/app/admin/dashboard/facilities/page.tsx`                   | 조회, 목록·선택·상세를 잇는다                                                                      | 7, 8           |
| `src/app/admin/dashboard/layout.tsx`                            | 가드 제공, 헤더 링크·버튼이 가드를 거친다                                                          | 9              |
| `src/components/admin/FacilityFormModal.tsx`                    | 저장을 `saveFacility`로, 건물 강조색 크림슨                                                        | 1, 6           |
| `src/components/Toast.tsx`                                      | 인라인 스타일을 `.ku-toast` 클래스로(모양은 CSS가, 동작은 그대로)                                  | 2              |
| `e2e/admin-shell.spec.ts`                                       | 헤더 높이·버튼, 건물 카드 반경, 관리자·공개 토스트 모양                                            | 2              |
| `e2e/admin-facilities-workspace.spec.ts`                        | 독립 시설 작업 화면 전부                                                                           | 7~10           |

---

### Task 0: 계획 커밋과 초안 PR

**Files:**

- Create: `docs/plans/2026-10-14-admin-map-first-pr1.md`(이 문서)
- Modify: `docs/specs/2026-10-14-admin-map-first-redesign-design.md`(계획을 쓰며 정한 2.4 다크 채움, 2.12 토스트, 3.1 배지 문장 — 커밋 `6c10d8d` 뒤 작업 트리에만 있다)

- [ ] **Step 1: 설계 수정과 계획을 따로 커밋한다**

```bash
git status --short   # 위 두 파일만 바뀌었는지 본다
git add docs/specs/2026-10-14-admin-map-first-redesign-design.md
git commit -m "docs(spec): 다크 크림슨 채움을 #CC2936으로 바꾸고 관리자 토스트·배지 토큰 결정을 적는다"
git add docs/plans/2026-10-14-admin-map-first-pr1.md
git commit -m "docs: 관리자 지도 우선 리디자인 ①의 구현 계획을 둔다"
```

- [ ] **Step 2: 첫 푸시와 초안 PR을 사용자에게 확인받는다**

브랜치를 원격에 올리고 PR을 여는 것은 바깥에 보이는 동작이다.

- [ ] **Step 3: 푸시하고 초안 PR을 연다**

```bash
git push -u origin feat/admin-map-first
gh pr create --draft --base main \
  --title "관리자 지도 우선 리디자인 ① — 토큰·셸·공통 단위·독립 시설" \
  --body "$(cat <<'EOF'
관리자 지도 우선 리디자인의 첫 PR이다. 설계 2026-10-14 1장의 PR ① 범위(토큰·셸·지도 작업 화면 공통 단위·독립 시설).

- 설계: docs/specs/2026-10-14-admin-map-first-redesign-design.md
- 핸드오버: docs/specs/2026-10-14-admin-map-first-handoff/README.md
- 계획: docs/plans/2026-10-14-admin-map-first-pr1.md (병합할 때 지운다)
EOF
)"
```

- [ ] **Step 4: 기준선이 초록인지 본다**

```bash
gh pr checks --watch
```

Expected: 모든 잡 통과. 사양·핸드오버·계획만 들어 있다. 실패하면 멈추고 보고한다 — 이후 태스크의 실패를 가를 수 없다.

---

### Task 1: 토큰과 관리자 화면의 파랑

**Files:**

- Modify: `src/app/globals.css`(`:root`와 다크 블록의 `--ku-primary*`)
- Modify: `src/app/admin/admin-ui.css`(`.ku-admin-button--primary` 위 주석)
- Modify: `src/components/admin/AddFacilityButton.tsx`, `src/components/admin/FacilityFormModal.tsx`, `src/components/admin/FacilityVideoModal.tsx`, `src/components/admin/FeedbackEmailModal.tsx`, `src/components/admin/LandmarkFormModal.tsx`, `src/components/PolygonEditor.tsx`
- Modify: `src/components/FacilityMap.tsx`, `src/components/facility/FacilityFields.tsx`, `src/components/admin/inbox/FacilityRequestReviewModal.tsx`
- Modify: `docs/specs/2026-10-14-admin-map-first-redesign-design.md`(3.6의 파랑 문장)
- Test: `e2e/admin-dark.spec.ts`

**Interfaces:**

- Produces: 토큰 `--ku-primary`(`#8c0000`, 다크 `#cc2936`), `--ku-primary-hover`(`#6e0000`, 다크 `#b0202e`), `--ku-primary-text`(= `--ku-crimson-600`), `--ku-primary-soft-bg`(= `--ku-crimson-50`), `--ku-primary-disabled`, `--ku-status-review-bg/-fg`. `FacilityMap`·`FacilityFields`의 `highlightColor?: string` prop. 이후 태스크의 CSS가 이 토큰을 쓴다.

- [ ] **Step 1: 다크 모드 크림슨 채움 테스트를 쓴다**

`e2e/admin-dark.spec.ts`의 `test.describe("관리자 다크 모드 대비 회귀 가드 (P0-03)", …)` 안, 마지막 `test` 뒤에 더한다.

<!-- prettier-ignore -->
```ts
  // 다크는 흰 글자와 다크 표면 대비를 함께 지키는 #CC2936, 라이트는 #8C0000(설계 2026-10-14 2.4)
  test("크림슨 채움은 모드마다 흰 글자 대비를 지키는 값이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    // 메뉴 배지는 신규 요청이 있을 때만 그려진다.
    state.facilityRequests.push({ id: "dark-badge-request", status: "new" });
    await page.goto("/admin/dashboard/buildings");
    const badge = page.locator(".ku-admin-nav-badge");
    await expect(badge).toHaveCSS("background-color", "rgb(204, 41, 54)");
    await expect(badge).toHaveCSS("color", "rgb(255, 255, 255)");

    await page.goto("/admin/buildings/1");
    const add = page.getByRole("button", { name: "+ 시설 추가" });
    await expect(add).toHaveCSS("background-color", "rgb(204, 41, 54)");
    await expect(add).toHaveCSS("color", "rgb(255, 255, 255)");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(add).toHaveCSS("background-color", "rgb(140, 0, 0)");
  });
```

- [ ] **Step 2: 테스트만 커밋·푸시하고 실패를 확인한다**

```bash
git add e2e/admin-dark.spec.ts
git commit -m "test(admin-dark): 크림슨 채움이 라이트 #8C0000, 다크 #CC2936인지 테스트로 먼저 적는다"
git push
```

Expected: `Test (Playwright)`의 새 시나리오가 `rgb(37, 99, 235)`를 받아 실패한다.

- [ ] **Step 3: 토큰을 바꾼다**

`src/app/globals.css` `:root`에서

<!-- prettier-ignore -->
```css
  --ku-primary: #2563eb;
  --ku-primary-text: #2563eb;
  --ku-primary-disabled: #93c5fd;
  --ku-primary-soft-bg: #eff6ff;
```

를 다음으로 바꾼다.

<!-- prettier-ignore -->
```css
  --ku-primary: #8c0000;
  --ku-primary-hover: #6e0000;
  --ku-primary-text: var(--ku-crimson-600);
  --ku-primary-disabled: #d8a39d;
  --ku-primary-soft-bg: var(--ku-crimson-50);
```

같은 블록의 `--ku-status-warn-fg: #92400e;` 바로 뒤에 더한다.

<!-- prettier-ignore -->
```css
  --ku-status-review-bg: #e9e5f5;
  --ku-status-review-fg: #4f3f86;
```

다크 블록에서

<!-- prettier-ignore -->
```css
    --ku-primary: #2563eb;
    --ku-primary-text: #6ba5ff;
    --ku-primary-disabled: #2f4368;
    --ku-primary-soft-bg: #1a2a44;
```

를 다음으로 바꾼다.

<!-- prettier-ignore -->
```css
    /* 채움은 흰 글자(4.5:1)와 다크 표면(3:1) 대비를 함께 지키는 값이다(설계 2026-10-14 2.4).
       -text·-soft-bg는 :root의 크림슨 참조가 이 블록의 크림슨 값을 따라간다. */
    --ku-primary: #cc2936;
    --ku-primary-hover: #b0202e;
    --ku-primary-disabled: #4d2926;
```

다크 블록의 `--ku-status-warn-fg: #f1cb77;` 바로 뒤에 더한다.

<!-- prettier-ignore -->
```css
    --ku-status-review-bg: #2a2540;
    --ku-status-review-fg: #c3b6f0;
```

- [ ] **Step 4: 낡은 주석을 지운다**

`src/app/admin/admin-ui.css`에서 `.ku-admin-button--primary` 바로 위 두 줄을 지운다(설계 3.6).

```css
/* 주 액션 색은 --ku-primary(파랑)다. 이 클래스는 오래 크림슨이었지만 쓰는 곳이
   없었고, 이름과 실제 primary 토큰이 어긋나 집는 사람마다 함정이 됐다. */
```

- [ ] **Step 5: 관리자 주 액션·강조의 파랑을 토큰으로 바꾼다**

각 파일에서 따옴표 안 문자열만 바꾼다. 같은 파일 안에서 문자열은 하나씩만 나온다.

| 파일                     | 바꾸기 전                            | 바꾼 뒤                                             |
| ------------------------ | ------------------------------------ | --------------------------------------------------- |
| `AddFacilityButton.tsx`  | `background: "#2563EB",`             | `background: "var(--ku-primary)",`                  |
| `FacilityFormModal.tsx`  | `<div style={{ color: "#2563EB" }}>` | `<div style={{ color: "var(--ku-primary-text)" }}>` |
| `FacilityVideoModal.tsx` | `background: "#2563EB",`             | `background: "var(--ku-primary)",`                  |
| `FeedbackEmailModal.tsx` | `color: "#2563EB",`                  | `color: "var(--ku-primary-text)",`                  |
| `FeedbackEmailModal.tsx` | `border: "1px dashed #2563EB",`      | `border: "1px dashed var(--ku-primary-text)",`      |
| `FeedbackEmailModal.tsx` | `background: "#2563EB",`             | `background: "var(--ku-primary)",`                  |
| `LandmarkFormModal.tsx`  | `border: "1px solid #2563EB",`       | `border: "1px solid var(--ku-primary-text)",`       |
| `LandmarkFormModal.tsx`  | `color: "#2563EB",`                  | `color: "var(--ku-primary-text)",`                  |
| `LandmarkFormModal.tsx`  | `<div style={{ color: "#2563EB" }}>` | `<div style={{ color: "var(--ku-primary-text)" }}>` |
| `LandmarkFormModal.tsx`  | `background: "#2563EB",`             | `background: "var(--ku-primary)",`                  |
| `PolygonEditor.tsx`      | `background: "#2563EB",`             | `background: "var(--ku-primary)",`                  |

`PolygonEditor.tsx`의 `style: { color: "#2563EB", weight: 2, fillOpacity: 0.3 }`는 바꾸지 않는다("계획이 정한 것" 6).

- [ ] **Step 6: 위치 선택 지도의 건물 강조색을 prop으로 받는다**

`src/components/FacilityMap.tsx`의 `markerIcon` 선언 위에 더한다.

```tsx
// 공개 등록 요청 모달의 색. 관리자 화면은 크림슨을 넘긴다(설계 2026-10-14 3.6)
const PUBLIC_HIGHLIGHT_COLOR = "#2563EB";
```

함수 시그니처를 바꾼다.

```tsx
export default function FacilityMap({
  center,
  markerPosition,
  onMapClick,
  highlightId,
  highlightColor = PUBLIC_HIGHLIGHT_COLOR,
}: {
  center: [number, number];
  markerPosition: [number, number] | null;
  onMapClick: (lat: number, lng: number) => void;
  highlightId?: number;
  highlightColor?: string;
}) {
```

GeoJSON `style`의 강조 분기를 바꾼다.

<!-- prettier-ignore -->
```tsx
                ? {
                    color: highlightColor,
                    weight: 2,
                    fillColor: highlightColor,
                    fillOpacity: 0.15,
                  }
```

`src/components/facility/FacilityFields.tsx`의 `FacilityFieldsProps`에 `highlightBuildingId?: number;` 다음 줄로 더한다.

<!-- prettier-ignore -->
```tsx
  /** 위치 지도의 건물 강조색. 비우면 FacilityMap의 기본값 */
  highlightColor?: string;
```

구조 분해에 `highlightColor,`를 `highlightBuildingId,` 다음에 더하고, `<FacilityMap`에 `highlightId={highlightBuildingId}` 다음 줄로 `highlightColor={highlightColor}`를 넘긴다.

`src/components/admin/FacilityFormModal.tsx`와 `src/components/admin/inbox/FacilityRequestReviewModal.tsx`에 `import { color } from "@/lib/theme";`를 더하고, 두 파일의 `<FacilityFields`에서 `highlightBuildingId=…` 다음 줄로 넘긴다.

<!-- prettier-ignore -->
```tsx
          highlightColor={color.crimson600}
```

- [ ] **Step 7: 남은 파랑을 대조한다**

```bash
rg -n -i "2563eb" src e2e
```

Expected — 이 목록과 같아야 한다.

- `src/components/FacilityMap.tsx` — `PUBLIC_HIGHLIGHT_COLOR`
- `src/components/BuildingPolygonPreview.tsx` — 폴리곤 style
- `src/components/PolygonEditor.tsx` — 폴리곤 style
- `src/components/slope/SlopeRouteMap.tsx` — 기존 경로 선, 현재 위치 점 `fillColor`
- `src/components/map/Map.tsx` — 현재 위치 정확도 원(`color`, `fillColor`)
- `src/components/map/map-ui.css` — `.ku-user-location-dot` 배경
- `e2e/admin-buildings-slopes.spec.ts`, `e2e/public-map-p1.spec.ts` — 위 두 현재 위치 색의 단언

목록 밖의 줄이 나오면 그 줄의 역할을 "계획이 정한 것" 6의 표로 나누고 멈춰서 보고한다.

- [ ] **Step 8: 설계 3.6의 파랑 문장을 확정 결과로 고친다**

`docs/specs/2026-10-14-admin-map-first-redesign-design.md` 3.6에서

```markdown
- 하드코딩된 파랑(`#2563EB`)은 **관리자 화면에서 주 액션·강조 역할**인 것만 바꾼다(시설 추가 버튼, 선택 위치 문구,
  편집 지도의 선 등). 공개 화면의 파랑(공개 지도 현재 위치)과 지도 데이터 색은 그대로 둔다. ① 계획에서
  `rg -i "2563eb"` 결과를 파일마다 역할로 나눠 확정한다.
```

를 다음으로 바꾼다.

```markdown
- 하드코딩된 파랑(`#2563EB`)은 **관리자 화면에서 주 액션·강조 역할**인 것만 바꾼다 — 시설 추가 버튼, 선택 위치
  문구, 명소 폼의 자동번역·저장, 피드백 이메일 설정의 참조 추가·저장, 동영상 업로드 진행 막대, 폴리곤 저장 버튼,
  관리자 쪽 위치 선택 지도의 건물 강조. 그대로 두는 것은 현재 위치(공개 지도, 경사도 편집 지도 — 현재 위치는 파랑이라는
  관례)와 편집 지도의 기존 선·폴리곤이다. geoman이 새로 그리는 선은 Leaflet 기본 파랑이라 기존 선만 바꾸면 한
  편집기 안에서 색이 갈린다. 경사도 편집 지도의 색은 6.4가 다시 정한다. 2026-10-14 `rg -i "2563eb"`로 나눴다.
```

- [ ] **Step 9: 커밋·푸시하고 통과를 확인한다**

```bash
git add src/app/globals.css src/app/admin/admin-ui.css src/components docs/specs/2026-10-14-admin-map-first-redesign-design.md
git commit -m "feat(admin-ui): 관리자 주 액션 색을 크림슨으로 바꾸고 다크에서는 흰 글자·표면 대비를 지키는 #CC2936으로 채운다"
git push
```

Expected: 전부 통과. `admin-dark.spec.ts`의 기존 다크 스캔도 그대로 통과해야 한다.

---

### Task 2: 셸 — 헤더·전역 덮어쓰기·토스트

**Files:**

- Modify: `src/app/admin/admin-ui.css`(`.ku-admin-shell`, `.ku-admin-header`, 헤더 버튼, `button.ku-admin-overview-item`, `.ku-admin-content` 규칙, 첫 모바일 블록의 헤더·nav, `.ku-admin-mobile-card`, 파일 끝의 관리자 토스트)
- Modify: `src/components/Toast.tsx`(인라인 스타일 → 클래스)
- Modify: `src/app/globals.css`(공개 토스트 모양 — 지금 인라인 값 그대로)
- Modify: `docs/specs/2026-10-14-admin-map-first-redesign-design.md`(3.1의 덮어쓰기 문장, 10장의 덮어쓰기 항목)
- Test: `e2e/admin-shell.spec.ts`(새 파일)

**Interfaces:**

- Produces: `.ku-admin-shell`의 CSS 변수 `--ku-admin-header-height`(데스크톱 60px, 모바일 54px)와 `--ku-admin-nav-height`(데스크톱 0px, 모바일 58px). Task 7·10의 작업 화면 높이가 이 둘을 뺀다.
- Produces: `.ku-toast`(종류는 `data-tone="success|warning|error"`), `.ku-toast-icon`·`.ku-toast-message`·`.ku-toast-close`. `Toast`의 props와 3초 타이머는 그대로다(설계 2.12).

- [ ] **Step 1: 셸 테스트를 쓴다**

`e2e/admin-shell.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("관리자 셸", () => {
  test("헤더는 데스크톱 60px, 모바일 54px이다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    const header = page.locator(".ku-admin-header");
    await expect(header).toHaveCSS("height", "60px");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(header).toHaveCSS("height", "54px");
  });

  test("헤더 오른쪽 버튼은 높이 34px이다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    for (const name of ["설정", "지도 보기", "로그아웃"]) {
      await expect(
        page.getByRole("button", { name, exact: true }),
        name,
      ).toHaveCSS("height", "34px");
    }
  });

  // .ku-admin-content 전역 덮어쓰기가 없어져도 건물 카드 모양이 그대로인지 지킨다.
  test("건물 화면 카드 버튼의 반경은 8px이다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    await expect(
      page.locator("button.ku-admin-overview-item").first(),
    ).toHaveCSS("border-radius", "8px");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".ku-admin-mobile-card").first()).toHaveCSS(
      "border-radius",
      "8px",
    );
  });
});

test.describe("토스트 모양", () => {
  test("관리자 토스트는 아래 가운데에 반전 색으로 뜨고 3초 뒤 사라진다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/new");
    await page.getByRole("button", { name: "건물 저장" }).click();

    const toast = page.locator(".ku-toast[role='alert']");
    await expect(toast).toContainText("건물 이름을 입력해주세요");
    await expect(toast).toHaveCSS("background-color", "rgb(28, 25, 23)");
    await expect(toast).toHaveCSS("color", "rgb(255, 255, 255)");
    // 종류는 색이 아니라 아이콘 모양으로 가른다(설계 2026-10-14 2.12)
    await expect(toast.locator("svg.lucide-circle-x")).toHaveCount(1);
    const box = (await toast.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.round(viewport.height - box.y - box.height)).toBe(28);
    expect(Math.round(box.x + box.width / 2)).toBe(viewport.width / 2);

    await expect(toast).toHaveCount(0, { timeout: 4000 });
  });

  test("공개 지도 토스트는 위 가운데의 지금 모양 그대로다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(
            _success: PositionCallback,
            error: PositionErrorCallback,
          ) {
            error({
              code: 1,
              PERMISSION_DENIED: 1,
            } as GeolocationPositionError);
          },
        },
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "현 위치" }).click();

    const toast = page.locator(".ku-toast[role='alert']");
    await expect(toast).toContainText("위치 권한이 거부되었어요");
    await expect(toast).toHaveCSS("background-color", "rgb(254, 242, 242)");
    const box = (await toast.boundingBox())!;
    expect(Math.round(box.y)).toBe(24);
  });
});
```

- [ ] **Step 2: 테스트만 커밋·푸시하고 실패를 확인한다**

```bash
git add e2e/admin-shell.spec.ts
git commit -m "test(admin-shell): 헤더 높이·버튼, 건물 카드 반경, 관리자·공개 토스트 모양을 테스트로 먼저 적는다"
git push
```

Expected: 헤더 높이(64px), 버튼 높이(38px), 관리자 토스트(위 24px·연한 빨강) 시나리오가 실패한다. 카드 반경과 공개 지도 토스트 시나리오는 지금 그대로 통과한다 — 바꾼 뒤를 지키는 회귀 가드다.

- [ ] **Step 3: 셸 높이를 변수로 둔다**

`src/app/admin/admin-ui.css`에서

```css
.ku-admin-shell {
  min-height: 100dvh;
```

를 다음으로 바꾼다.

```css
.ku-admin-shell {
  /* 지도 작업 화면이 창 높이에서 이 둘을 뺀다 */
  --ku-admin-header-height: 60px;
  --ku-admin-nav-height: 0px;
  min-height: 100dvh;
```

`.ku-admin-header`의 `height: 64px;`를 `height: var(--ku-admin-header-height);`로 바꾼다.

`.ku-admin-email { … }` 블록 바로 뒤에 더한다.

```css
.ku-admin-account .ku-admin-button {
  min-height: 34px;
  padding: 0 12px;
}
```

- [ ] **Step 4: 건물 카드 반경을 각 클래스로 옮긴다**

```css
button.ku-admin-overview-item {
  cursor: pointer;
}
```

를 다음으로 바꾼다.

```css
button.ku-admin-overview-item {
  border-radius: 8px;
  cursor: pointer;
}
```

첫 `@media (max-width: 767px)` 블록(헤더 규칙으로 시작하는 블록) 안의 `.ku-admin-mobile-card`에서 `border-radius: 12px;`를 `border-radius: 8px;`로 바꾼다.

- [ ] **Step 5: 전역 덮어쓰기를 좁힌다**

```css
/* Existing admin forms inherit the same surface system while their data behavior stays intact. */
.ku-admin-content > div {
  color: var(--ku-text-1);
  background: var(--ku-bg) !important;
}
.ku-admin-content input,
.ku-admin-content textarea,
.ku-admin-content select {
  color: var(--ku-text-1) !important;
  border-color: var(--ku-border-input) !important;
  background: var(--ku-surface) !important;
}
.ku-admin-content button {
  border-radius: 8px !important;
}
```

를 다음으로 바꾼다.

```css
/* 지도 작업 화면으로 아직 옮기지 않은 탭(명소·경사도·제보함)의 입력 색과 버튼 반경을 맞춘다.
   작업 화면은 자기 클래스가 값을 정하므로 뺀다. 마지막 탭을 옮기는 PR이 이 규칙을 지운다
   (설계 2026-10-14 3.1). */
.ku-admin-content > :not(.ku-map-workspace) input,
.ku-admin-content > :not(.ku-map-workspace) textarea,
.ku-admin-content > :not(.ku-map-workspace) select {
  color: var(--ku-text-1) !important;
  border-color: var(--ku-border-input) !important;
  background: var(--ku-surface) !important;
}
.ku-admin-content > :not(.ku-map-workspace) button {
  border-radius: 8px !important;
}
```

- [ ] **Step 6: 모바일 헤더·nav를 변수에 맞춘다**

바로 뒤 첫 `@media (max-width: 767px)` 블록의 시작

```css
@media (max-width: 767px) {
  .ku-admin-header {
    height: 58px;
    padding: 0 14px;
  }
```

을 다음으로 바꾼다.

```css
@media (max-width: 767px) {
  .ku-admin-shell {
    --ku-admin-header-height: 54px;
    --ku-admin-nav-height: 58px;
  }
  .ku-admin-header {
    padding: 0 14px;
  }
```

같은 블록에서 `.ku-admin-brand img`의 `width: 30px; height: 30px;`을 `28px`로 바꾸고, `.ku-admin-nav`의 `height: calc(58px + env(safe-area-inset-bottom));`를 `height: calc(var(--ku-admin-nav-height) + env(safe-area-inset-bottom));`로 바꾼다.

`.ku-admin-nav-badge`는 `background: var(--ku-primary)` 그대로 둔다 — Task 1로 크림슨 채움이 됐다(설계 3.1).

- [ ] **Step 7: 토스트 모양을 클래스로 옮기고 관리자 모양을 덮는다**

`src/components/Toast.tsx` 전체를 다음으로 바꾼다. props·역할(`alert`/`status`)·닫기·3초 타이머는 그대로이고 인라인 스타일만 클래스로 옮긴다.

```tsx
"use client";

import { CircleCheck, CircleX, TriangleAlert, X } from "lucide-react";
import { useEffect } from "react";

const ICONS = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
};

type ToastTone = keyof typeof ICONS;

// 호출부가 ICONS에 없는 값(예: "info")도 넘긴다. 좁은 유니온으로 조이면
// 그 호출부가 깨지므로 string으로 받고 여기서 success로 떨어뜨린다.
function toneOf(type: string): ToastTone {
  return Object.hasOwn(ICONS, type) ? (type as ToastTone) : "success";
}

/** 모양은 globals.css(공개)와 admin-ui.css의 .ku-admin-shell 범위(관리자)가 정한다(설계 2026-10-14 2.12) */
export default function Toast({
  message,
  type = "success",
  onClose,
}: {
  message: string;
  type?: string;
  onClose: () => void;
}) {
  const tone = toneOf(type);
  const Icon = ICONS[tone];

  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  return (
    <div
      className="ku-toast"
      data-tone={tone}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <Icon size={18} aria-hidden="true" className="ku-toast-icon" />
      <span className="ku-toast-message">{message}</span>
      <button
        type="button"
        className="ku-toast-close"
        onClick={onClose}
        aria-label="알림 닫기"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
```

`src/app/globals.css`의 `.bldg-label::before { … }` 블록 뒤에 공개 모양을 둔다. 값은 지금 `Toast`의 인라인 값 그대로다.

```css
/* Toast 기본(공개 지도) 모양. 관리자 화면은 admin-ui.css가 .ku-admin-shell 범위에서 덮는다. */
.ku-toast {
  position: fixed;
  z-index: 9999;
  top: 24px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 280px;
  max-width: 700px;
  padding: 14px 24px;
  border: 1px solid;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 15px;
  white-space: normal;
  word-break: keep-all;
  transform: translateX(-50%);
}
.ku-toast[data-tone="success"] {
  border-color: #86efac;
  color: #166534;
  background: #f0fdf4;
}
.ku-toast[data-tone="error"] {
  border-color: #fca5a5;
  color: #991b1b;
  background: #fef2f2;
}
.ku-toast[data-tone="warning"] {
  border-color: #fcd34d;
  color: #92400e;
  background: #fffbeb;
}
.ku-toast-icon {
  flex-shrink: 0;
}
.ku-toast-message {
  flex: 1;
}
.ku-toast-close {
  display: flex;
  align-items: center;
  padding: 0;
  border: none;
  color: inherit;
  background: none;
  cursor: pointer;
  opacity: 0.6;
}
```

`src/app/admin/admin-ui.css` 파일 끝에 관리자 모양을 붙인다.

```css
/* 관리자 토스트 — 아래 가운데, 토큰을 반전한 색. 종류는 아이콘 모양이 가른다(설계 2026-10-14 2.12).
   [data-tone]까지 붙여 globals.css의 종류별 색보다 특이도를 높인다 — 두 파일의 불러오는 순서에 기대지 않는다. */
.ku-admin-shell .ku-toast[data-tone] {
  top: auto;
  bottom: 28px;
  min-width: 0;
  max-width: min(560px, calc(100vw - 32px));
  padding: 11px 12px 11px 16px;
  border: 0;
  color: var(--ku-surface);
  background: var(--ku-text-1);
  box-shadow: var(--ku-shadow-floating);
  font-size: 13px;
  font-weight: 600;
}
@media (max-width: 767px) {
  .ku-admin-shell .ku-toast[data-tone] {
    bottom: calc(140px + env(safe-area-inset-bottom));
  }
}
```

- [ ] **Step 8: 설계 3.1과 10장을 측정 결과로 고친다**

설계 3.1에서

```markdown
- `.ku-admin-content > div { background … !important }`와 `.ku-admin-content` 아래 입력·버튼 전역 덮어쓰기는 지도
  위 패널의 배경·반경을 덮어쓴다. 이 규칙이 필요한 건물 화면 클래스로 범위를 좁힌다. ① 계획에서 건물 화면 중 이
  규칙에 기대는 곳을 먼저 찾는다.
```

를 다음으로 바꾼다.

```markdown
- `.ku-admin-content > div { background … !important }`는 셸(`.ku-admin-shell`)이 같은 배경을 이미 줘서 지운다.
  `.ku-admin-content` 아래 입력·버튼 전역 덮어쓰기는 지도 위 패널의 배경·반경·포커스 테두리를 덮어쓰므로 지도
  작업 화면(`.ku-map-workspace`)을 범위에서 뺀다. 2026-10-14에 따져 보니 건물 화면이 기대는 것은 카드 버튼의
  반경(`button.ku-admin-overview-item`, `.ku-admin-mobile-card`)뿐이라 그 값을 각 클래스로 옮겼다. 남는 의존은
  아직 옮기지 않은 명소·경사도·제보함 화면(명소 폼·이모지 피커 입력의 색, 각 화면 버튼의 반경)이고, 마지막 탭을
  옮기는 PR(④)이 규칙을 지운다.
```

10장에서 `- `.ku-admin-content` 전역 덮어쓰기에 기대는 건물 화면(3.1)` 줄을 지운다(결론이 3.1로 옮겨 갔다).

- [ ] **Step 9: 커밋·푸시하고 통과를 확인한다**

```bash
git add src/app/admin/admin-ui.css src/app/globals.css src/components/Toast.tsx docs/specs/2026-10-14-admin-map-first-redesign-design.md
git commit -m "feat(admin-shell): 헤더를 핸드오버 높이로, 관리자 토스트를 아래 가운데로 바꾸고 전역 덮어쓰기에서 지도 작업 화면을 뺀다"
git push
```

Expected: 전부 통과. 다크 스캔(`admin-dark.spec.ts`), 토스트의 `role`을 보는 `accessibility-dialog-toast.spec.ts`, 공개 지도의 토스트 시나리오(`public-map-p1.spec.ts` 등), 명소·경사도·제보함 시나리오도 그대로 통과해야 한다.

- [ ] **Step 10: 프리뷰에서 토스트를 본다**

라이트·다크 각각 관리자 화면(건물 신규 등록에서 이름 없이 저장)과 공개 지도(현 위치 거부)의 토스트를 띄워 본다. 관리자는 아래 가운데·반전 색, 공개 지도는 지금 모양이어야 한다. 모바일 폭에서는 관리자 토스트가 아래 nav 위에 뜨는지 본다.

---

### Task 3: URL ↔ 작업 화면 상태

**Files:**

- Create: `src/lib/workspaceUrl.ts`
- Test: `src/lib/workspaceUrl.test.ts`

**Interfaces:**

- Produces:
  - `type WorkspaceState = { mode: "closed" } | { mode: "view"; id: string } | { mode: "new" } | { mode: "edit"; id: string }`
  - `readWorkspaceState(search: string, options: { allowEdit: boolean }): WorkspaceState`
  - `writeWorkspaceState(search: string, state: WorkspaceState): string` — `"?…"` 또는 `""`

- [ ] **Step 1: 테스트를 쓴다**

`src/lib/workspaceUrl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  readWorkspaceState,
  writeWorkspaceState,
  type WorkspaceState,
} from "./workspaceUrl";

const facilities = { allowEdit: false };
const slopes = { allowEdit: true };

describe("readWorkspaceState", () => {
  it("자기 파라미터가 없으면 닫힘이다", () => {
    expect(readWorkspaceState("", facilities)).toEqual({ mode: "closed" });
    expect(readWorkspaceState("?building=3", facilities)).toEqual({
      mode: "closed",
    });
  });

  it("id가 있으면 보기다", () => {
    expect(readWorkspaceState("?id=a1", facilities)).toEqual({
      mode: "view",
      id: "a1",
    });
  });

  it("빈 id는 닫힘이다", () => {
    expect(readWorkspaceState("?id=", facilities)).toEqual({ mode: "closed" });
  });

  it("new=1이면 id·edit을 무시하고 새로 만들기다", () => {
    expect(readWorkspaceState("?new=1", slopes)).toEqual({ mode: "new" });
    expect(readWorkspaceState("?id=a1&edit=1&new=1", slopes)).toEqual({
      mode: "new",
    });
  });

  it("new는 1일 때만 뜻이 있다", () => {
    expect(readWorkspaceState("?new=0&id=a1", facilities)).toEqual({
      mode: "view",
      id: "a1",
    });
  });

  it("edit=1은 id와 함께, 편집을 허용한 탭에서만 편집이다", () => {
    expect(readWorkspaceState("?id=a1&edit=1", slopes)).toEqual({
      mode: "edit",
      id: "a1",
    });
    expect(readWorkspaceState("?id=a1&edit=1", facilities)).toEqual({
      mode: "view",
      id: "a1",
    });
    expect(readWorkspaceState("?edit=1", slopes)).toEqual({ mode: "closed" });
  });
});

describe("writeWorkspaceState", () => {
  it("네 상태를 쓴다", () => {
    expect(writeWorkspaceState("", { mode: "view", id: "a1" })).toBe("?id=a1");
    expect(writeWorkspaceState("", { mode: "new" })).toBe("?new=1");
    expect(writeWorkspaceState("", { mode: "edit", id: "a1" })).toBe(
      "?id=a1&edit=1",
    );
    expect(writeWorkspaceState("?id=a1", { mode: "closed" })).toBe("");
  });

  it("자기 파라미터만 지우고 모르는 파라미터는 남긴다", () => {
    expect(
      writeWorkspaceState("?building=3&id=a1&edit=1", { mode: "new" }),
    ).toBe("?building=3&new=1");
    expect(
      writeWorkspaceState("?redirected=missing&new=1", { mode: "closed" }),
    ).toBe("?redirected=missing");
  });

  it("쓴 상태를 다시 읽으면 같은 상태다", () => {
    const states: WorkspaceState[] = [
      { mode: "closed" },
      { mode: "view", id: "a 1" },
      { mode: "new" },
      { mode: "edit", id: "x" },
    ];
    for (const state of states) {
      expect(
        readWorkspaceState(writeWorkspaceState("?tab=1", state), slopes),
      ).toEqual(state);
    }
  });
});
```

- [ ] **Step 2: 테스트만 커밋·푸시하고 실패를 확인한다**

```bash
git add src/lib/workspaceUrl.test.ts
git commit -m "test(workspace-url): 작업 화면 상태와 URL의 대응을 테스트로 먼저 적는다"
git push
```

Expected: `Test (unit)`이 `./workspaceUrl`을 찾지 못해 실패한다(`Typecheck`도 같은 이유).

- [ ] **Step 3: 구현한다**

`src/lib/workspaceUrl.ts`:

```ts
/** 작업 화면 상태와 URL의 대응·우선순위는 docs/specs/2026-10-14-admin-map-first-redesign-design.md 3.4 */
export type WorkspaceState =
  | { mode: "closed" }
  | { mode: "view"; id: string }
  | { mode: "new" }
  | { mode: "edit"; id: string };

const OWN_KEYS = ["id", "new", "edit"] as const;

export function readWorkspaceState(
  search: string,
  options: { allowEdit: boolean },
): WorkspaceState {
  const params = new URLSearchParams(search);
  // 옛 경사도 라우트의 리다이렉트가 원래 쿼리를 붙여 겹친 조합이 들어올 수 있다(설계 2026-10-14 6.5)
  if (params.get("new") === "1") return { mode: "new" };
  const id = params.get("id");
  if (!id) return { mode: "closed" };
  if (options.allowEdit && params.get("edit") === "1") {
    return { mode: "edit", id };
  }
  return { mode: "view", id };
}

export function writeWorkspaceState(
  search: string,
  state: WorkspaceState,
): string {
  const params = new URLSearchParams(search);
  for (const key of OWN_KEYS) params.delete(key);
  if (state.mode === "new") params.set("new", "1");
  if (state.mode === "view" || state.mode === "edit") {
    params.set("id", state.id);
  }
  if (state.mode === "edit") params.set("edit", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}
```

- [ ] **Step 4: 커밋·푸시하고 통과를 확인한다**

```bash
git add src/lib/workspaceUrl.ts
git commit -m "feat(workspace-url): 작업 화면 상태를 URL에 읽고 쓰고 모르는 파라미터는 남긴다"
git push
```

Expected: `Test (unit)`의 `workspaceUrl.test.ts` 통과, 전 잡 통과.

---

### Task 4: 목록 거르기·정렬·페이지·칩 개수

**Files:**

- Create: `src/lib/adminCollection.ts`
- Test: `src/lib/adminCollection.test.ts`

**Interfaces:**

- Consumes: `src/lib/adminList.ts`의 `ADMIN_PAGE_SIZE`, `getAdminPageCount`, `matchesAdminSearch`, `sortAdminItems`, `AdminListSort`.
- Produces:
  - `type AdminChip<C extends string> = "all" | C`
  - `interface AdminCollectionPolicy<T, C extends string> { id(item): string; name(item): string; updatedAt(item): string | null | undefined; searchText(item): Array<string | null | undefined>; chips: Record<C, (item: T) => boolean> }`
  - `interface AdminCollectionQuery<T, C> { search; chip: AdminChip<C>; sort: AdminListSort; page: number; filter?: (item: T) => boolean; pageSize?: number }`
  - `interface AdminCollectionView<T, C> { total; matched: T[]; pageItems: T[]; page; pageCount; chipCounts: Record<AdminChip<C>, number> }`
  - `viewAdminCollection(items, policy, query): AdminCollectionView<T, C>`
  - `pageOfItem(matched, id, getId, pageSize = ADMIN_PAGE_SIZE): number | null`
  - `INITIAL_ADMIN_COLLECTION_QUERY` — `{ search: "", chip: "all", sort: "updated-desc", page: 1 }`

- [ ] **Step 1: 테스트를 쓴다**

`src/lib/adminCollection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  pageOfItem,
  viewAdminCollection,
  type AdminCollectionPolicy,
} from "./adminCollection";

interface Item {
  id: string;
  name: string;
  updated_at: string;
  tags: string[];
}

const policy: AdminCollectionPolicy<Item, "red" | "blue"> = {
  id: (item) => item.id,
  name: (item) => item.name,
  updatedAt: (item) => item.updated_at,
  searchText: (item) => [item.name],
  chips: {
    red: (item) => item.tags.includes("red"),
    blue: (item) => item.tags.includes("blue"),
  },
};

const items: Item[] = [
  {
    id: "a",
    name: "가 시설",
    updated_at: "2026-10-01T00:00:00Z",
    tags: ["red"],
  },
  {
    id: "b",
    name: "나 시설",
    updated_at: "2026-10-03T00:00:00Z",
    tags: ["red", "blue"],
  },
  { id: "c", name: "다 시설", updated_at: "2026-10-02T00:00:00Z", tags: [] },
];

const query = INITIAL_ADMIN_COLLECTION_QUERY;

describe("viewAdminCollection", () => {
  it("칩으로 거르고 정렬한다", () => {
    const view = viewAdminCollection(items, policy, { ...query, chip: "red" });
    expect(view.matched.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("검색은 정책의 searchText에서 찾는다", () => {
    const view = viewAdminCollection(items, policy, { ...query, search: "다" });
    expect(view.matched.map((item) => item.id)).toEqual(["c"]);
  });

  it("칩 개수는 검색·추가 조건과 상관없이 전체 행 기준이다", () => {
    const view = viewAdminCollection(items, policy, {
      ...query,
      search: "가",
      filter: (item) => item.id !== "b",
    });
    expect(view.chipCounts).toEqual({ all: 3, red: 2, blue: 1 });
    expect(view.total).toBe(3);
    expect(view.matched.map((item) => item.id)).toEqual(["a"]);
  });

  it("페이지를 나누고 범위를 넘으면 마지막 페이지로 둔다", () => {
    const view = viewAdminCollection(items, policy, {
      ...query,
      page: 5,
      pageSize: 2,
    });
    expect(view.pageCount).toBe(2);
    expect(view.page).toBe(2);
    expect(view.pageItems.map((item) => item.id)).toEqual(["a"]);
    // 지도는 페이지와 상관없이 거른 결과 전체를 그린다(설계 2026-10-14 3.3)
    expect(view.matched).toHaveLength(3);
  });

  it("결과가 없어도 페이지는 1이다", () => {
    const view = viewAdminCollection(items, policy, {
      ...query,
      search: "없는 이름",
    });
    expect(view.matched).toEqual([]);
    expect(view.page).toBe(1);
    expect(view.pageCount).toBe(1);
  });
});

describe("pageOfItem", () => {
  it("항목이 있는 페이지를 돌려주고 없으면 null이다", () => {
    const { matched } = viewAdminCollection(items, policy, query);
    expect(pageOfItem(matched, "b", policy.id, 2)).toBe(1);
    expect(pageOfItem(matched, "a", policy.id, 2)).toBe(2);
    expect(pageOfItem(matched, "zz", policy.id, 2)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트만 커밋·푸시하고 실패를 확인한다**

```bash
git add src/lib/adminCollection.test.ts
git commit -m "test(admin-collection): 목록 거르기·페이지·칩 개수를 테스트로 먼저 적는다"
git push
```

Expected: `./adminCollection`이 없어 `Test (unit)`·`Typecheck` 실패.

- [ ] **Step 3: 구현한다**

`src/lib/adminCollection.ts`:

```ts
import {
  ADMIN_PAGE_SIZE,
  getAdminPageCount,
  matchesAdminSearch,
  sortAdminItems,
  type AdminListSort,
} from "@/lib/adminList";

/** 조회는 하지 않는다. 테이블과 칩 의미는 탭이 정책으로 넘긴다(설계 2026-10-14 3.2) */
export type AdminChip<C extends string> = "all" | C;

export interface AdminCollectionPolicy<T, C extends string> {
  id: (item: T) => string;
  name: (item: T) => string;
  updatedAt: (item: T) => string | null | undefined;
  searchText: (item: T) => Array<string | null | undefined>;
  chips: Record<C, (item: T) => boolean>;
}

export interface AdminCollectionQuery<T, C extends string> {
  search: string;
  chip: AdminChip<C>;
  sort: AdminListSort;
  page: number;
  /** 칩과 별개로 좁히는 조건(시설 유형 드롭다운 등) */
  filter?: (item: T) => boolean;
  pageSize?: number;
}

export interface AdminCollectionView<T, C extends string> {
  total: number;
  matched: T[];
  pageItems: T[];
  page: number;
  pageCount: number;
  chipCounts: Record<AdminChip<C>, number>;
}

export const INITIAL_ADMIN_COLLECTION_QUERY = {
  search: "",
  chip: "all",
  sort: "updated-desc",
  page: 1,
} as const;

export function viewAdminCollection<T, C extends string>(
  items: T[],
  policy: AdminCollectionPolicy<T, C>,
  query: AdminCollectionQuery<T, C>,
): AdminCollectionView<T, C> {
  const pageSize = query.pageSize ?? ADMIN_PAGE_SIZE;
  const chipTest = query.chip === "all" ? null : policy.chips[query.chip];
  const matched = sortAdminItems(
    items.filter(
      (item) =>
        (!query.filter || query.filter(item)) &&
        (!chipTest || chipTest(item)) &&
        matchesAdminSearch(query.search, policy.searchText(item)),
    ),
    query.sort,
    policy.name,
    policy.updatedAt,
  );
  const pageCount = getAdminPageCount(matched.length, pageSize);
  const page = Math.min(Math.max(1, Math.floor(query.page)), pageCount);

  const chipCounts = { all: items.length } as Record<AdminChip<C>, number>;
  for (const key of Object.keys(policy.chips) as C[]) {
    chipCounts[key] = items.filter(policy.chips[key]).length;
  }

  return {
    total: items.length,
    matched,
    pageItems: matched.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageCount,
    chipCounts,
  };
}

export function pageOfItem<T>(
  matched: T[],
  id: string,
  getId: (item: T) => string,
  pageSize = ADMIN_PAGE_SIZE,
): number | null {
  const index = matched.findIndex((item) => getId(item) === id);
  return index < 0 ? null : Math.floor(index / pageSize) + 1;
}
```

- [ ] **Step 4: 커밋·푸시하고 통과를 확인한다**

```bash
git add src/lib/adminCollection.ts
git commit -m "feat(admin-collection): 행과 정책으로 목록을 거르고 칩 개수와 항목이 있는 페이지를 계산한다"
git push
```

Expected: 전 잡 통과.

---

### Task 5: 독립 시설 정책과 초안 비교

**Files:**

- Create: `src/lib/facilityWorkspace.ts`
- Test: `src/lib/facilityWorkspace.test.ts`

**Interfaces:**

- Consumes: `AdminCollectionPolicy`(Task 4), `facilityNeedsTranslation`(`src/lib/facilityTranslationState.ts`), `EMPTY_FACILITY_FIELDS`·`FacilityFieldValues`(`src/lib/facilityFields.ts`).
- Produces:
  - `type FacilityChip = "missing" | "translation" | "no-video"`
  - `FACILITY_CHIPS: { key: FacilityChip; label: string }[]`
  - `FACILITY_COLLECTION_POLICY: AdminCollectionPolicy<FacilityWithType, FacilityChip>`
  - `facilityDisplayName(facility: FacilityWithType): string`
  - `facilityFormFromRow(facility: Facility | null): FacilityFieldValues`
  - `facilityFormDirty(form: FacilityFieldValues, facility: Facility | null): boolean`

- [ ] **Step 1: 테스트를 쓴다**

`src/lib/facilityWorkspace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  viewAdminCollection,
} from "./adminCollection";
import { EMPTY_FACILITY_FIELDS } from "./facilityFields";
import {
  FACILITY_COLLECTION_POLICY,
  facilityDisplayName,
  facilityFormDirty,
  facilityFormFromRow,
} from "./facilityWorkspace";
import type { FacilityWithType } from "@/types/domain";

function facility(overrides: Partial<FacilityWithType> = {}): FacilityWithType {
  return {
    id: "f1",
    building_id: null,
    facility_code: "ramp",
    name: "중앙 경사로",
    name_en: "Central ramp",
    name_zh: "中央坡道",
    description: null,
    description_en: null,
    description_zh: null,
    floor_info: null,
    floor_info_en: null,
    floor_info_zh: null,
    is_installed: true,
    lat: 37.59,
    lng: 127.03,
    translation_status: "translated",
    video_url: null,
    video_caption: null,
    video_caption_en: null,
    video_caption_zh: null,
    video_poster_url: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    facility_types: { code: "ramp", label: "경사로" },
    ...overrides,
  };
}

const chips = FACILITY_COLLECTION_POLICY.chips;

describe("독립 시설 칩", () => {
  it("미설치는 is_installed가 false일 때만이다", () => {
    expect(chips.missing(facility({ is_installed: false }))).toBe(true);
    expect(chips.missing(facility({ is_installed: true }))).toBe(false);
    expect(chips.missing(facility({ is_installed: null }))).toBe(false);
  });

  it("번역 필요는 facilityNeedsTranslation과 같다", () => {
    expect(chips.translation(facility({ translation_status: "failed" }))).toBe(
      true,
    );
    expect(chips.translation(facility({ name_en: null }))).toBe(true);
    expect(chips.translation(facility())).toBe(false);
  });

  it("동영상 없음은 video_url이 비어 있을 때다", () => {
    expect(chips["no-video"](facility({ video_url: null }))).toBe(true);
    expect(chips["no-video"](facility({ video_url: "  " }))).toBe(true);
    expect(
      chips["no-video"](facility({ video_url: "https://cdn.test/v.mp4" })),
    ).toBe(false);
  });

  it("칩 개수를 센다", () => {
    const rows = [
      facility({ id: "a", is_installed: false }),
      facility({ id: "b", translation_status: "failed" }),
      facility({ id: "c", video_url: "https://cdn.test/v.mp4" }),
    ];
    const view = viewAdminCollection(
      rows,
      FACILITY_COLLECTION_POLICY,
      INITIAL_ADMIN_COLLECTION_QUERY,
    );
    expect(view.chipCounts).toEqual({
      all: 3,
      missing: 1,
      translation: 1,
      "no-video": 2,
    });
  });

  it("영문·중문 이름과 설명에서도 찾는다", () => {
    const view = viewAdminCollection(
      [facility({ id: "a" }), facility({ id: "b", name_en: "North gate" })],
      FACILITY_COLLECTION_POLICY,
      { ...INITIAL_ADMIN_COLLECTION_QUERY, search: "north" },
    );
    expect(view.matched.map((row) => row.id)).toEqual(["b"]);
  });
});

describe("facilityDisplayName", () => {
  it("이름, 유형 이름, 대체 문구 순이다", () => {
    expect(facilityDisplayName(facility())).toBe("중앙 경사로");
    expect(facilityDisplayName(facility({ name: null }))).toBe("경사로");
    expect(
      facilityDisplayName(facility({ name: null, facility_types: null })),
    ).toBe("이름 없는 시설");
  });
});

describe("facilityFormFromRow", () => {
  it("새로 만들기는 빈 값이다", () => {
    expect(facilityFormFromRow(null)).toEqual(EMPTY_FACILITY_FIELDS);
  });

  it("행을 폼 문자열로 옮긴다", () => {
    expect(facilityFormFromRow(facility({ description: "정문" }))).toEqual({
      facility_code: "ramp",
      name: "중앙 경사로",
      description: "정문",
      floor_info: "",
      is_installed: true,
      lat: "37.59",
      lng: "127.03",
    });
  });
});

describe("facilityFormDirty", () => {
  it("처음 값이면 dirty가 아니다", () => {
    const row = facility();
    expect(facilityFormDirty(facilityFormFromRow(row), row)).toBe(false);
  });

  it("좌표는 숫자로 비교한다 — 지도 클릭의 toFixed(7)과 저장값이 같으면 dirty가 아니다", () => {
    const row = facility({ lat: 37.59, lng: 127.03 });
    expect(
      facilityFormDirty(
        { ...facilityFormFromRow(row), lat: "37.5900000", lng: "127.0300000" },
        row,
      ),
    ).toBe(false);
    expect(
      facilityFormDirty({ ...facilityFormFromRow(row), lat: "37.5901" }, row),
    ).toBe(true);
  });

  it("이름·설명·유형을 고치면 dirty다", () => {
    const row = facility();
    const form = facilityFormFromRow(row);
    expect(facilityFormDirty({ ...form, name: "고친 이름" }, row)).toBe(true);
    expect(facilityFormDirty({ ...form, description: "설명" }, row)).toBe(true);
    expect(facilityFormDirty({ ...form, facility_code: "parking" }, row)).toBe(
      true,
    );
  });

  it("기존 시설의 설치 상태는 바로 저장하므로 초안 비교에서 뺀다", () => {
    const row = facility({ is_installed: false });
    expect(
      facilityFormDirty(
        { ...facilityFormFromRow(row), is_installed: true },
        row,
      ),
    ).toBe(false);
  });

  it("새로 만들기는 빈 값과 다르면 dirty다", () => {
    expect(facilityFormDirty(EMPTY_FACILITY_FIELDS, null)).toBe(false);
    expect(
      facilityFormDirty(
        { ...EMPTY_FACILITY_FIELDS, facility_code: "ramp" },
        null,
      ),
    ).toBe(true);
    expect(
      facilityFormDirty(
        { ...EMPTY_FACILITY_FIELDS, is_installed: false },
        null,
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트만 커밋·푸시하고 실패를 확인한다**

```bash
git add src/lib/facilityWorkspace.test.ts
git commit -m "test(facility-workspace): 독립 시설 칩 조건과 초안 비교를 테스트로 먼저 적는다"
git push
```

Expected: `./facilityWorkspace`가 없어 실패.

- [ ] **Step 3: 구현한다**

`src/lib/facilityWorkspace.ts`:

```ts
import type { AdminCollectionPolicy } from "@/lib/adminCollection";
import {
  EMPTY_FACILITY_FIELDS,
  type FacilityFieldValues,
} from "@/lib/facilityFields";
import { facilityNeedsTranslation } from "@/lib/facilityTranslationState";
import type { Facility, FacilityWithType } from "@/types/domain";

export type FacilityChip = "missing" | "translation" | "no-video";

export const FACILITY_CHIPS: { key: FacilityChip; label: string }[] = [
  { key: "missing", label: "미설치" },
  { key: "translation", label: "번역 필요" },
  { key: "no-video", label: "동영상 없음" },
];

export function facilityDisplayName(facility: FacilityWithType): string {
  return facility.name ?? facility.facility_types?.label ?? "이름 없는 시설";
}

export const FACILITY_COLLECTION_POLICY: AdminCollectionPolicy<
  FacilityWithType,
  FacilityChip
> = {
  id: (facility) => facility.id,
  name: facilityDisplayName,
  updatedAt: (facility) => facility.updated_at,
  searchText: (facility) => [
    facility.name,
    facility.name_en,
    facility.name_zh,
    facility.description,
  ],
  chips: {
    missing: (facility) => facility.is_installed === false,
    translation: (facility) => facilityNeedsTranslation(facility),
    "no-video": (facility) => !facility.video_url?.trim(),
  },
};

export function facilityFormFromRow(
  facility: Facility | null,
): FacilityFieldValues {
  if (!facility) return { ...EMPTY_FACILITY_FIELDS };
  return {
    facility_code: facility.facility_code ?? "",
    name: facility.name ?? "",
    description: facility.description ?? "",
    floor_info: facility.floor_info ?? "",
    is_installed: facility.is_installed ?? true,
    lat: facility.lat != null ? String(facility.lat) : "",
    lng: facility.lng != null ? String(facility.lng) : "",
  };
}

function coordinate(value: string): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 독립 시설 상세 패널의 초안 비교. 층 정보는 독립 시설에 없다.
 * 기존 시설의 설치 상태는 세그먼트가 바로 저장하므로 보지 않는다(설계 2026-10-14 4.2).
 */
export function facilityFormDirty(
  form: FacilityFieldValues,
  facility: Facility | null,
): boolean {
  const base = facilityFormFromRow(facility);
  return (
    form.facility_code !== base.facility_code ||
    form.name !== base.name ||
    form.description !== base.description ||
    coordinate(form.lat) !== coordinate(base.lat) ||
    coordinate(form.lng) !== coordinate(base.lng) ||
    (facility === null && form.is_installed !== base.is_installed)
  );
}
```

- [ ] **Step 4: 커밋·푸시하고 통과를 확인한다**

```bash
git add src/lib/facilityWorkspace.ts
git commit -m "feat(facility-workspace): 독립 시설 칩 정책과 상세 초안의 dirty 판정을 둔다"
git push
```

Expected: 전 잡 통과.

---

### Task 6: 시설 저장의 공통 경로

**Files:**

- Create: `src/lib/facilitySave.ts`
- Test: `src/lib/facilitySave.test.ts`
- Modify: `src/components/admin/FacilityFormModal.tsx`
- Test: `e2e/admin-building-facility-modal.spec.ts`(회귀 가드 추가)

**Interfaces:**

- Consumes: `facilityFormFromRow`(Task 5), `translateFacility`(`src/lib/facilityTranslation.ts`), `authedFetch`, `supabase`.
- Produces:
  - `type FacilityWritePayload` — `building_facilities` Insert의 `building_id`·`facility_code`·`name`·`description`·`floor_info`·`is_installed`·`lat`·`lng`·`translation_status`
  - `buildFacilityPayload(form: FacilityFieldValues, options: { buildingId: number | null; includeInstalled: boolean }): FacilityWritePayload`
  - `type FacilitySaveResult = { status: "failed" } | { status: "saved"; facilityId: string; translated: boolean; revalidated: boolean }`
  - `saveFacility(facilityId: string | null, payload: FacilityWritePayload): Promise<FacilitySaveResult>`

- [ ] **Step 1: 단위 테스트를 쓴다**

`src/lib/facilitySave.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FACILITY_FIELDS } from "./facilityFields";

const authedFetch = vi.fn();
const translateFacility = vi.fn();
const single = vi.fn();
const select = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select }));
const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ insert, update }));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));
vi.mock("@/lib/authedFetch", () => ({ authedFetch }));
vi.mock("@/lib/facilityTranslation", () => ({ translateFacility }));

const form = {
  ...EMPTY_FACILITY_FIELDS,
  facility_code: "ramp",
  name: "정문 경사로",
  floor_info: "1층",
  is_installed: false,
  lat: "37.5900000",
  lng: "127.0300000",
};

describe("buildFacilityPayload", () => {
  it("독립 시설은 층 정보를 비우고, 설치 상태는 실으라 할 때만 싣는다", async () => {
    const { buildFacilityPayload } = await import("./facilitySave");
    const payload = buildFacilityPayload(form, {
      buildingId: null,
      includeInstalled: false,
    });
    expect(payload).toEqual({
      building_id: null,
      facility_code: "ramp",
      name: "정문 경사로",
      description: null,
      floor_info: null,
      lat: 37.59,
      lng: 127.03,
      translation_status: "pending",
    });
    expect("is_installed" in payload).toBe(false);
  });

  it("건물 시설은 층 정보와 설치 상태를 싣는다", async () => {
    const { buildFacilityPayload } = await import("./facilitySave");
    expect(
      buildFacilityPayload(
        { ...form, lat: "", lng: "" },
        { buildingId: 3, includeInstalled: true },
      ),
    ).toMatchObject({
      building_id: 3,
      floor_info: "1층",
      is_installed: false,
      lat: null,
      lng: null,
    });
  });
});

describe("saveFacility", () => {
  const payload = {
    building_id: null,
    facility_code: "ramp",
    name: "정문 경사로",
    description: null,
    floor_info: null,
    lat: 37.59,
    lng: 127.03,
    translation_status: "pending",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    eq.mockResolvedValue({ error: null });
    single.mockResolvedValue({ data: { id: "f-new" }, error: null });
    translateFacility.mockResolvedValue(true);
    authedFetch.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  it("수정은 update 뒤 번역과 revalidate를 하고 결과를 돌려준다", async () => {
    const { saveFacility } = await import("./facilitySave");
    const result = await saveFacility("f1", payload);

    expect(from).toHaveBeenCalledWith("building_facilities");
    expect(update).toHaveBeenCalledWith(payload);
    expect(eq).toHaveBeenCalledWith("id", "f1");
    expect(translateFacility).toHaveBeenCalledWith("f1");
    expect(authedFetch).toHaveBeenCalledWith("/api/revalidate-facilities", {
      method: "POST",
    });
    expect(result).toEqual({
      status: "saved",
      facilityId: "f1",
      translated: true,
      revalidated: true,
    });
  });

  it("추가는 insert한 행의 id로 번역한다", async () => {
    const { saveFacility } = await import("./facilitySave");
    const result = await saveFacility(null, payload);

    expect(insert).toHaveBeenCalledWith(payload);
    expect(select).toHaveBeenCalledWith("id");
    expect(translateFacility).toHaveBeenCalledWith("f-new");
    expect(result).toMatchObject({ status: "saved", facilityId: "f-new" });
  });

  it("DB 저장이 실패하면 번역·revalidate 없이 실패를 돌려준다", async () => {
    eq.mockResolvedValue({ error: { message: "denied" } });
    const { saveFacility } = await import("./facilitySave");

    expect(await saveFacility("f1", payload)).toEqual({ status: "failed" });
    expect(translateFacility).not.toHaveBeenCalled();
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it("insert가 행을 돌려주지 않으면 실패다", async () => {
    single.mockResolvedValue({ data: null, error: null });
    const { saveFacility } = await import("./facilitySave");

    expect(await saveFacility(null, payload)).toEqual({ status: "failed" });
  });

  it("번역이 실패해도 저장됨이고 revalidate는 한다", async () => {
    translateFacility.mockResolvedValue(false);
    const { saveFacility } = await import("./facilitySave");

    expect(await saveFacility("f1", payload)).toEqual({
      status: "saved",
      facilityId: "f1",
      translated: false,
      revalidated: true,
    });
    expect(authedFetch).toHaveBeenCalledTimes(1);
  });

  it("revalidate가 실패하거나 거절돼도 저장됨이고 revalidated만 거짓이다", async () => {
    const { saveFacility } = await import("./facilitySave");

    authedFetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    expect(await saveFacility("f1", payload)).toMatchObject({
      status: "saved",
      revalidated: false,
    });

    authedFetch.mockRejectedValueOnce(new Error("network"));
    expect(await saveFacility("f1", payload)).toMatchObject({
      status: "saved",
      revalidated: false,
    });
  });
});
```

- [ ] **Step 2: 건물 상세 모달 저장의 회귀 가드를 쓴다**

`FacilityFormModal`의 저장 경로를 바꾸므로, 지금은 E2E가 없는 건물 상세의 시설 추가를 먼저 고정한다. 기존 `test.describe`의 `beforeEach`는 `state`를 돌려주지 않으므로, `e2e/admin-building-facility-modal.spec.ts` 파일 끝에 따로 둔다.

```ts
test.describe("건물 상세 시설 추가", () => {
  test("모달에서 시설을 추가하면 층 정보와 함께 목록에 오른다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");
    await page.getByRole("button", { name: "+ 시설 추가" }).click();
    const dialog = page.getByRole("dialog", { name: "시설 추가" });
    await dialog.getByLabel("시설 유형 *").selectOption("elevator");
    await dialog.getByLabel("시설 이름 (선택)").fill("서측 엘리베이터");
    await dialog.getByLabel("층 정보 (선택)").fill("B1~3층");
    await dialog.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("시설이 추가되었어요!")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /서측 엘리베이터/ }),
    ).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.name === "서측 엘리베이터"),
    ).toMatchObject({
      building_id: 1,
      floor_info: "B1~3층",
      is_installed: true,
      translation_status: "translated",
    });
  });
});
```

- [ ] **Step 3: 테스트만 커밋·푸시하고 기대한 결과를 확인한다**

```bash
git add src/lib/facilitySave.test.ts e2e/admin-building-facility-modal.spec.ts
git commit -m "test(facility-save): 시설 저장 공통 경로의 결과와 건물 상세 추가를 테스트로 먼저 적는다"
git push
```

Expected: `Test (unit)`이 `./facilitySave`가 없어 실패한다. Playwright의 새 시나리오는 지금 모달 그대로 **통과**해야 한다 — 바꾸기 전 동작을 고정하는 가드다. 실패하면 시나리오를 고친다.

- [ ] **Step 4: 구현한다**

`src/lib/facilitySave.ts`:

```ts
import type { Database } from "@supabase-types";
import { authedFetch } from "@/lib/authedFetch";
import type { FacilityFieldValues } from "@/lib/facilityFields";
import { translateFacility } from "@/lib/facilityTranslation";
import { supabase } from "@/lib/supabaseClient";

type FacilityInsert =
  Database["public"]["Tables"]["building_facilities"]["Insert"];

export type FacilityWritePayload = Pick<
  FacilityInsert,
  | "building_id"
  | "facility_code"
  | "name"
  | "description"
  | "floor_info"
  | "is_installed"
  | "lat"
  | "lng"
  | "translation_status"
>;

export function buildFacilityPayload(
  form: FacilityFieldValues,
  options: { buildingId: number | null; includeInstalled: boolean },
): FacilityWritePayload {
  return {
    building_id: options.buildingId,
    facility_code: form.facility_code,
    name: form.name || null,
    description: form.description || null,
    floor_info: options.buildingId === null ? null : form.floor_info || null,
    // 독립 시설 패널은 설치 상태를 세그먼트가 바로 저장한다. 폼 저장이 처음 읽은 값으로 되돌리지 않게 뺀다(설계 2026-10-14 4.2)
    ...(options.includeInstalled ? { is_installed: form.is_installed } : {}),
    lat: form.lat ? parseFloat(form.lat) : null,
    lng: form.lng ? parseFloat(form.lng) : null,
    translation_status: "pending",
  };
}

export type FacilitySaveResult =
  | { status: "failed" }
  | {
      status: "saved";
      facilityId: string;
      translated: boolean;
      revalidated: boolean;
    };

/**
 * 시설 직접 저장(건물 상세 모달·독립 시설 패널)의 한 경로. 등록 요청 승인은 자기 API가 한다.
 * 토스트 문구와 닫기는 화면이 이 결과로 정한다(설계 2026-10-14 4.2).
 */
export async function saveFacility(
  facilityId: string | null,
  payload: FacilityWritePayload,
): Promise<FacilitySaveResult> {
  let savedId: string;
  if (facilityId) {
    const { error } = await supabase
      .from("building_facilities")
      .update(payload)
      .eq("id", facilityId);
    if (error) return { status: "failed" };
    savedId = facilityId;
  } else {
    const { data, error } = await supabase
      .from("building_facilities")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) return { status: "failed" };
    savedId = data.id;
  }

  const translated = await translateFacility(savedId);
  const revalidated = await authedFetch("/api/revalidate-facilities", {
    method: "POST",
  }).then(
    (response) => response.ok,
    () => false,
  );
  return { status: "saved", facilityId: savedId, translated, revalidated };
}
```

- [ ] **Step 5: 모달이 공통 경로를 쓰게 한다**

`src/components/admin/FacilityFormModal.tsx`:

1. import에서 `supabase`, `authedFetch`, `translateFacility`를 지우고 다음을 더한다.

```tsx
import { buildFacilityPayload, saveFacility } from "@/lib/facilitySave";
import { facilityFormFromRow } from "@/lib/facilityWorkspace";
```

2. 폼 초기값을 바꾼다.

<!-- prettier-ignore -->
```tsx
  const [form, setForm] = useState<FacilityFieldValues>(() =>
    facilityFormFromRow(facility),
  );
```

3. `handleSave`를 다음으로 바꾼다(`// 주의: \`editing\` 불리언으로는…` 주석은 쓰던 코드와 함께 사라진다).

<!-- prettier-ignore -->
```tsx
  async function handleSave() {
    const invalid = validateFacilityForm(form, { standalone });
    if (invalid) {
      showToast(invalid, "warning");
      return;
    }
    setSaving(true);
    const result = await saveFacility(
      facility?.id ?? null,
      buildFacilityPayload(form, { buildingId, includeInstalled: true }),
    );
    setSaving(false);
    if (result.status === "failed") {
      showToast("저장에 실패했어요", "error");
      return;
    }
    onSaved();
    if (!result.translated) {
      showToast(
        "시설은 저장했지만 자동 번역에 실패했어요. 목록에서 재번역해 주세요.",
        "warning",
      );
      return;
    }
    showToast(editing ? "시설이 수정되었어요!" : "시설이 추가되었어요!");
  }
```

- [ ] **Step 6: 커밋·푸시하고 통과를 확인한다**

```bash
git add src/lib/facilitySave.ts src/components/admin/FacilityFormModal.tsx
git commit -m "refactor(facility-save): 시설 저장(삽입·수정 → 번역 → revalidate)을 공통 함수로 빼고 모달이 쓴다"
git push
```

Expected: 전 잡 통과. Step 2의 회귀 가드와 기존 `admin-content` 독립 시설 시나리오(아직 모달을 쓴다)가 그대로 통과한다.

---

### Task 7: 작업 화면 — 목록·지도·선택

독립 시설 화면을 지도 작업 화면으로 바꾼다. 이 태스크가 끝나면 목록 패널과 마커가 보이고, 행과 마커가 같은 선택이며 URL에 남는다. 상세 패널은 Task 8에서 붙는다.

**Files:**

- Create: `src/lib/useMediaQuery.ts`
- Create: `src/components/admin/workspace/types.ts`, `useAdminCollection.ts`, `useWorkspaceSelection.ts`, `AdminWorkspaceMap.tsx`, `AdminMapWorkspace.tsx`, `WorkspaceListPanel.tsx`
- Create: `src/components/admin/facilities/FacilityListRow.tsx`, `FacilityWorkspaceMap.tsx`
- Modify(전체 교체): `src/app/admin/dashboard/facilities/page.tsx`
- Modify: `src/app/admin/admin-ui.css`(파일 끝에 작업 화면 절)
- Create: `e2e/admin-facilities-workspace.spec.ts`
- Modify: `e2e/admin-content.spec.ts`, `e2e/accessibility-dialog-toast.spec.ts`, `e2e/admin-dark.spec.ts`
- Delete: `e2e/admin-campus-boundaries.spec.ts`

**Interfaces:**

- Consumes: `readWorkspaceState`·`writeWorkspaceState`·`WorkspaceState`(Task 3), `viewAdminCollection`·`pageOfItem`·`INITIAL_ADMIN_COLLECTION_QUERY`·`AdminChip`·`AdminCollectionPolicy`(Task 4), `FACILITY_COLLECTION_POLICY`·`FACILITY_CHIPS`·`FacilityChip`·`facilityDisplayName`(Task 5).
- Produces(Task 8·9·10과 PR ②·③이 쓴다):
  - `types.ts`: `LatLngTuple`, `WorkspaceViewport`, `WorkspaceInsets`, `WorkspaceFocusTarget`, `WorkspaceFocus { key; target }`, `WorkspaceMapCommands { focus(target, insets) }`, `WorkspaceMapSlotProps { initialViewport; onViewportChange; onCommandsReady }`, `DetailDraftPin { owner; position; setPosition; saving }`, `ADMIN_MOBILE_QUERY`, `DEFAULT_WORKSPACE_VIEWPORT`, `workspaceInsets({ mobile, detailOpen, height, mapStrip })`
  - `useMediaQuery(query: string): boolean`
  - `useAdminCollection(items, policy, filter?)` → `{ view, search, chip, sort, setSearch, setChip, setSort, setPage, pageOf }`
  - `useWorkspaceSelection({ allowEdit })` → `{ state, request(next, alsoApply?) }`, 모듈 함수 `applyWorkspaceState(next, alsoApply?)`
  - `<AdminWorkspaceMap {...WorkspaceMapSlotProps} onMapClick?>{레이어}</AdminWorkspaceMap>`
  - `<AdminMapWorkspace renderMap list detail focus mobileMapStrip? />`
  - `<WorkspaceListPanel …>` — props는 아래 코드
  - `<FacilityWorkspaceMap {...slot} facilities selected creating draft onSelect />`

- [ ] **Step 1: 작업 화면 E2E를 쓴다**

`e2e/admin-facilities-workspace.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

function listPanel(page: Page) {
  return page.getByRole("region", { name: "독립 시설", exact: true });
}

function listRow(page: Page, name: string) {
  return listPanel(page).getByRole("button", { name: new RegExp(name) });
}

function facilitiesRequest(url: URL) {
  return url.pathname.endsWith("/rest/v1/building_facilities");
}

/** 목 픽스처와 같은 모양의 독립 시설 행 */
function standaloneFacility(overrides: Record<string, unknown>) {
  return {
    building_id: null,
    facility_code: "ramp",
    name_en: "EN",
    name_zh: "ZH",
    translation_status: "translated",
    description: null,
    description_en: null,
    description_zh: null,
    floor_info: null,
    floor_info_en: null,
    floor_info_zh: null,
    is_installed: true,
    video_url: null,
    video_caption: null,
    facility_types: {
      code: "ramp",
      label: "경사로",
      label_en: "Ramp",
      label_zh: "坡道",
    },
    buildings: null,
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

test.describe("독립 시설 작업 화면 — 목록과 지도", () => {
  test("칩·검색·유형·정렬로 목록을 좁히고 칩 개수는 전체 기준이다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const list = listPanel(page);

    await expect(list.getByRole("status")).toHaveText("2개 표시");
    await expect(
      list.getByRole("button", { name: "전체 2개" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      list.getByRole("button", { name: "미설치 1개" }),
    ).toBeVisible();
    await expect(
      list.getByRole("button", { name: "번역 필요 0개" }),
    ).toBeVisible();
    await expect(
      list.getByRole("button", { name: "동영상 없음 2개" }),
    ).toBeVisible();
    // 유형별 클래스까지 봐야 모든 행이 폴백 아이콘으로 떨어지는 회귀를 잡는다.
    await expect(
      listRow(page, "중앙광장 경사로").locator("svg.lucide-trending-up"),
    ).toHaveCount(1);
    await expect(
      listRow(page, "공사 중 주차구역").locator("svg.lucide-square-parking"),
    ).toHaveCount(1);
    await expect(listRow(page, "공사 중 주차구역")).toContainText("미설치");

    await list.getByRole("button", { name: "미설치 1개" }).click();
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "공사 중 주차구역",
    ]);
    await expect(list.getByRole("status")).toHaveText("1개 표시");

    await list.getByRole("button", { name: "전체 2개" }).click();
    const search = list.getByRole("searchbox", { name: "독립 시설 검색" });
    await search.fill("공사");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "공사 중 주차구역",
    ]);
    await expect(
      list.getByRole("button", { name: "미설치 1개" }),
    ).toBeVisible();

    await search.fill("없는 시설");
    await expect(list.getByText("조건에 맞는 항목이 없어요")).toBeVisible();

    await search.fill("");
    await list.getByLabel("독립 시설 정렬").selectOption("name");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "공사 중 주차구역",
      "중앙광장 경사로",
    ]);

    await list.getByLabel("시설 유형 필터").selectOption("ramp");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "중앙광장 경사로",
    ]);
  });

  test("거른 결과를 지도 마커로 그리고 건물 소속 시설은 그리지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");

    await expect(
      page.getByTestId("admin-facility-marker-f-installed"),
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-facility-marker-f-uninstalled"),
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-facility-marker-f-building"),
    ).toHaveCount(0);

    await listPanel(page).getByRole("button", { name: "미설치 1개" }).click();
    await expect(
      page.getByTestId("admin-facility-marker-f-installed"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("admin-facility-marker-f-uninstalled"),
    ).toBeVisible();
  });

  test("목록을 받지 못하면 패널 안에 오류와 다시 시도를 보인다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let failNext = true;
    await page.route(facilitiesRequest, async (route) => {
      if (failNext && route.request().method() === "GET") {
        failNext = false;
        return route.fulfill({
          status: 500,
          headers: { "access-control-allow-origin": "*" },
          contentType: "application/json",
          body: "{}",
        });
      }
      return route.fallback();
    });
    await page.goto("/admin/dashboard/facilities");
    const list = listPanel(page);

    await expect(
      list.getByText("시설 목록을 불러오지 못했어요."),
    ).toBeVisible();
    await list.getByRole("button", { name: "다시 시도" }).click();
    await expect(list.getByTestId("admin-list-item-name")).toHaveCount(2);
  });

  test("행과 마커가 같은 선택이고 URL에 남는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const row = listRow(page, "공사 중 주차구역");

    await page.getByTestId("admin-facility-marker-f-uninstalled").click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\?id=f-uninstalled$/);
    await expect(
      page.locator(".ku-workspace-marker--selected"),
    ).toHaveAttribute("data-testid", "admin-facility-marker-f-uninstalled");

    // 데스크톱에서는 같은 항목을 다시 누르면 선택을 푼다
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "false");
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);

    await listRow(page, "중앙광장 경사로").click();
    await expect(page).toHaveURL(/\?id=f-installed$/);
    // 칩을 바꾸면 선택을 푼다
    await listPanel(page).getByRole("button", { name: "미설치 1개" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);
  });

  test("다른 페이지에 있는 마커를 누르면 목록이 그 페이지로 간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    for (let index = 0; index < 20; index += 1) {
      state.facilities.push(
        standaloneFacility({
          id: `f-filler-${index}`,
          name: `채움 시설 ${index}`,
          lat: 37.6,
          lng: 127.05,
          updated_at: `2026-07-30T00:00:${String(index).padStart(2, "0")}Z`,
        }),
      );
    }
    state.facilities.push(
      standaloneFacility({
        id: "f-second-page",
        name: "둘째 쪽 시설",
        lat: 37.5899,
        lng: 127.033,
        updated_at: "2026-07-01T00:00:00Z",
      }),
    );
    await page.goto("/admin/dashboard/facilities");

    await page.getByTestId("admin-facility-marker-f-second-page").click();
    await expect(
      listPanel(page).getByRole("button", { name: "2 페이지" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(listRow(page, "둘째 쪽 시설")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("목록 조회가 늦게 끝나도 ?id= 링크가 그 항목을 고른다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.route(facilitiesRequest, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });
    await page.goto("/admin/dashboard/facilities?id=f-uninstalled");

    await expect(listRow(page, "공사 중 주차구역")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page).toHaveURL(/\?id=f-uninstalled$/);
  });

  test("없는 ?id=는 선택을 풀고 알린다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities?id=f-missing");

    await expect(
      page.getByText("시설을 찾지 못했어요. 삭제됐거나 주소가 틀렸어요."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);
  });
});
```

- [ ] **Step 2: 깨지는 기존 시나리오를 지우거나 옮긴다**

"기존 E2E 시나리오의 행방" 표대로 한다.

1. `e2e/admin-content.spec.ts`에서 독립 시설 시나리오 여섯 개(`독립 시설을 검색·필터·정렬하고 조건을 초기화한다`, `독립 시설을 현재 위치에 생성하고 상태 변경 후 삭제한다`, `시설 저장과 자동 번역 실패를 분리하고 재번역한다`, `시설 동영상을 업로드하고 캡션 저장 후 삭제한다`, `변환 도구를 불러오는 중에 나가면 업로드 요청이 나가지 않는다`, `포스터 업로드가 실패하면 포스터 없이 저장한다`)를 지운다. 남은 명소 시나리오가 쓰지 않으므로 `import path from "node:path";`와 `PLAYABLE_VIDEO` 상수, 그 위 주석도 지운다. `test.describe` 제목을 `"명소 관리자 CRUD"`로 바꾼다.
2. `e2e/accessibility-dialog-toast.spec.ts`:
   - `시설 모달이 초점을 가두고 닫힌 뒤 실행 버튼으로 돌려보낸다`의 `await page.goto("/admin/dashboard/facilities");`를 `await page.goto("/admin/buildings/1");`로 바꾼다.
   - `중첩 확인 모달만 먼저 닫고 바깥 영상 모달의 초점을 복원한다`, `동영상 삭제 성공 시 실행 버튼이 사라져도 초점이 남은 모달 안으로 복귀한다`, `모바일에서 관리자 행 동작 버튼이 44px 터치 영역을 확보한다`를 지운다(Task 8·10이 다시 쓴다).
   - `오류와 성공 토스트를 각각 alert와 status로 전달한다`에서

     <!-- prettier-ignore -->
     ```ts
         await page.goto("/admin/dashboard/facilities");
         const row = page.getByText("중앙광장 경사로").locator("xpath=../..");
         await row.getByRole("button", { name: "미설치로 변경" }).click();
     ```

     를 다음으로 바꾼다(뒤의 `.ku-toast[role='status']` 단언은 그대로 둔다).

     <!-- prettier-ignore -->
     ```ts
         await page.goto("/admin/buildings/1");
         await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
         await page
           .getByRole("dialog", { name: "중앙 엘리베이터" })
           .getByRole("button", { name: "미설치로 변경" })
           .click();
     ```

   - `관리자 모달 폼 레이블이 입력과 프로그램적으로 연결된다`에서 첫 `await page.goto("/admin/dashboard/facilities");`를 `await page.goto("/admin/buildings/1");`로 바꾸고, 시설 모달을 닫는 `await page.keyboard.press("Escape");` 바로 뒤에 `await page.goto("/admin/dashboard/buildings");`를 넣는다 — `설정` 버튼은 대시보드 헤더에만 있다.
3. `e2e/admin-dark.spec.ts`의 `시설 폼 모달에 하드코딩 밝은 색이 남지 않는다`에서 `await page.goto("/admin/dashboard/facilities");`를 `await page.goto("/admin/buildings/1");`로 바꾼다.
4. `git rm e2e/admin-campus-boundaries.spec.ts` — 같은 시나리오를 Task 8이 작업 화면 spec에 쓴다.

- [ ] **Step 3: 테스트만 커밋·푸시하고 실패를 확인한다**

```bash
git add e2e
git commit -m "test(facilities-workspace): 독립 시설 작업 화면의 목록·지도·선택을 테스트로 먼저 적고 행 버튼 시나리오를 걷는다"
git push
```

Expected: 새 spec의 시나리오가 모두 실패한다(옛 화면에 region·칩·마커가 없다). 옮긴 시나리오(건물 상세)는 통과해야 한다.

- [ ] **Step 4: 미디어 쿼리 훅**

`src/lib/useMediaQuery.ts`:

```ts
"use client";

import { useCallback, useSyncExternalStore } from "react";

/** 서버 렌더와 하이드레이션은 false(데스크톱)로 그린다. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
```

- [ ] **Step 5: 작업 화면 타입**

`src/components/admin/workspace/types.ts`:

```ts
export type LatLngTuple = [number, number];

export interface WorkspaceViewport {
  center: LatLngTuple;
  zoom: number;
}

export interface WorkspaceInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type WorkspaceFocusTarget =
  { point: LatLngTuple } | { bounds: [LatLngTuple, LatLngTuple] };

/** key가 바뀔 때만 지도를 옮긴다. 같은 항목의 초안 핀을 옮기는 동안 지도가 따라가지 않게 한다 */
export interface WorkspaceFocus {
  key: string;
  target: WorkspaceFocusTarget;
}

export interface WorkspaceMapCommands {
  focus: (target: WorkspaceFocusTarget, insets: WorkspaceInsets) => void;
}

/**
 * next/dynamic(ssr:false)로 불러온 지도는 ref를 부모에 넘기지 않는다. 명령은 객체 하나로
 * onCommandsReady에 등록하고, 지도가 정리될 때 null로 거둔다(설계 2026-10-14 3.2).
 */
export interface WorkspaceMapSlotProps {
  initialViewport: WorkspaceViewport;
  onViewportChange: (viewport: WorkspaceViewport) => void;
  onCommandsReady: (commands: WorkspaceMapCommands | null) => void;
}

/**
 * 상세 패널이 지도에 맡기는 초안 핀. owner가 지금 열린 패널과 다르면 낡은 것이다 —
 * 패널이 바뀐 뒤 늦게 끝난 저장의 잠금이 남지 않게 한다(설계 2026-10-14 3.4).
 */
export interface DetailDraftPin {
  owner: string;
  position: LatLngTuple | null;
  setPosition: (position: LatLngTuple) => void;
  saving: boolean;
}

export const ADMIN_MOBILE_QUERY = "(max-width: 767px)";

export const DEFAULT_WORKSPACE_VIEWPORT: WorkspaceViewport = {
  center: [37.5893, 127.0327],
  zoom: 17,
};

// admin-ui.css의 .ku-float-panel·.ku-detail-panel 폭·여백과 모바일 .ku-detail-panel-bar 높이에 맞춘다.
const PANEL_GAP = 16;
const LIST_PANEL_WIDTH = 404;
const DETAIL_PANEL_WIDTH = 460;
const MOBILE_DETAIL_BAR = 52;

/** 선택한 항목을 패널 밑이 아닌 곳에 놓는 여백(핸드오버 "지도 가시 영역") */
export function workspaceInsets(options: {
  mobile: boolean;
  detailOpen: boolean;
  height: number;
  mapStrip: number;
}): WorkspaceInsets {
  if (options.mobile) {
    // 모바일에서 선택하면 상세가 위쪽 띠만 남기고 덮는다(설계 2026-10-14 2.5)
    return {
      top: MOBILE_DETAIL_BAR,
      right: 0,
      bottom: Math.max(
        0,
        options.height - MOBILE_DETAIL_BAR - options.mapStrip,
      ),
      left: 0,
    };
  }
  return {
    top: PANEL_GAP,
    right: options.detailOpen
      ? PANEL_GAP + DETAIL_PANEL_WIDTH + PANEL_GAP
      : PANEL_GAP,
    bottom: PANEL_GAP,
    left: PANEL_GAP + LIST_PANEL_WIDTH + PANEL_GAP,
  };
}
```

- [ ] **Step 6: 목록 상태 훅**

`src/components/admin/workspace/useAdminCollection.ts`:

```ts
"use client";

import { useState } from "react";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  pageOfItem,
  viewAdminCollection,
  type AdminChip,
  type AdminCollectionPolicy,
} from "@/lib/adminCollection";
import type { AdminListSort } from "@/lib/adminList";

/** 검색·칩·정렬을 바꾸면 페이지 1로 간다. 선택을 푸는 것은 호출하는 화면이 한다(설계 2026-10-14 3.3) */
export function useAdminCollection<T, C extends string>(
  items: T[],
  policy: AdminCollectionPolicy<T, C>,
  filter?: (item: T) => boolean,
) {
  const [search, setSearchState] = useState<string>(
    INITIAL_ADMIN_COLLECTION_QUERY.search,
  );
  const [chip, setChipState] = useState<AdminChip<C>>(
    INITIAL_ADMIN_COLLECTION_QUERY.chip,
  );
  const [sort, setSortState] = useState<AdminListSort>(
    INITIAL_ADMIN_COLLECTION_QUERY.sort,
  );
  const [page, setPage] = useState<number>(INITIAL_ADMIN_COLLECTION_QUERY.page);
  const view = viewAdminCollection(items, policy, {
    search,
    chip,
    sort,
    page,
    filter,
  });

  return {
    view,
    search,
    chip,
    sort,
    setSearch: (value: string) => {
      setSearchState(value);
      setPage(1);
    },
    setChip: (value: AdminChip<C>) => {
      setChipState(value);
      setPage(1);
    },
    setSort: (value: AdminListSort) => {
      setSortState(value);
      setPage(1);
    },
    setPage,
    pageOf: (id: string) => pageOfItem(view.matched, id, policy.id),
  };
}
```

- [ ] **Step 7: 선택 훅**

`src/components/admin/workspace/useWorkspaceSelection.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";
import {
  readWorkspaceState,
  writeWorkspaceState,
  type WorkspaceState,
} from "@/lib/workspaceUrl";

const URL_CHANGED = "ku:workspace-url";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(URL_CHANGED, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(URL_CHANGED, onChange);
  };
}

function readSearch() {
  return window.location.search;
}

function readServerSearch() {
  return "";
}

/**
 * 확인 없이 바로 적용한다. 저장·삭제가 끝난 뒤, 없는 ?id= 정리처럼 이미 정해진 이동에만 쓴다.
 * alsoApply(페이지·칩 변경 등)는 URL과 같은 틱에 적용돼 한 번에 그려진다.
 */
export function applyWorkspaceState(
  next: WorkspaceState,
  alsoApply?: () => void,
) {
  const search = writeWorkspaceState(window.location.search, next);
  if (search !== window.location.search) {
    // useSearchParams는 Suspense 경계를 요구한다. 제보함 페이지처럼 location을 직접 다룬다.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search}${window.location.hash}`,
    );
    window.dispatchEvent(new Event(URL_CHANGED));
  }
  alsoApply?.();
}

/** URL이 선택의 원본이다. 뒤로가기로 바뀐 URL도 popstate로 따라온다 */
export function useWorkspaceSelection(options: { allowEdit: boolean }) {
  const search = useSyncExternalStore(subscribe, readSearch, readServerSearch);
  const state = readWorkspaceState(search, options);

  function request(next: WorkspaceState, alsoApply?: () => void) {
    applyWorkspaceState(next, alsoApply);
  }

  return { state, request };
}
```

- [ ] **Step 8: 지도**

`src/components/admin/workspace/AdminWorkspaceMap.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import {
  NEIGHBOR_STYLE,
  fetchNeighborBuildings,
} from "@/lib/neighborBuildings";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";
import type { WorkspaceMapCommands, WorkspaceMapSlotProps } from "./types";

const MAX_ZOOM = 19;
/** 멀리서 고른 항목은 이만큼은 당겨서 보인다 */
const FOCUS_MIN_ZOOM = 17;

function NeighborBuildings() {
  const [features, setFeatures] = useState<Feature[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchNeighborBuildings()
      .then((loaded) => {
        if (!cancelled) setFeatures(loaded);
      })
      .catch(() => {
        // 배경 건물은 보조 정보다. 실패해도 작업 화면은 쓸 수 있다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!features) return null;
  return (
    <GeoJSON
      key={features.length}
      data={{ type: "FeatureCollection", features } as FeatureCollection}
      style={NEIGHBOR_STYLE}
      interactive={false}
      onEachFeature={(feature, layer) => {
        if (feature.properties?.name) {
          layer.bindTooltip(feature.properties.name, {
            permanent: true,
            direction: "center",
            className: "bldg-label",
          });
        }
      }}
    />
  );
}

function MapEvents({
  onViewportChange,
  onMapClick,
}: {
  onViewportChange: WorkspaceMapSlotProps["onViewportChange"];
  onMapClick?: (lat: number, lng: number) => void;
}) {
  const map = useMapEvents({
    moveend() {
      const center = map.getCenter();
      onViewportChange({
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      });
    },
    click(event) {
      onMapClick?.(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function CommandsBridge({
  onCommandsReady,
}: Pick<WorkspaceMapSlotProps, "onCommandsReady">) {
  const map = useMap();
  const onCommandsReadyRef = useRef(onCommandsReady);

  useEffect(() => {
    onCommandsReadyRef.current = onCommandsReady;
  }, [onCommandsReady]);

  useEffect(() => {
    // 정리된 지도에 명령이 가지 않게 한다. 정리 순서가 바뀌어도 막히도록 unload도 본다.
    let disposed = false;
    const markDisposed = () => {
      disposed = true;
    };
    map.on("unload", markDisposed);
    const commands: WorkspaceMapCommands = {
      focus(target, insets) {
        if (disposed) return;
        const isPoint = "point" in target;
        const bounds = isPoint
          ? L.latLngBounds(target.point, target.point)
          : L.latLngBounds(target.bounds);
        map.fitBounds(bounds, {
          paddingTopLeft: [insets.left, insets.top],
          paddingBottomRight: [insets.right, insets.bottom],
          maxZoom: isPoint ? Math.max(map.getZoom(), FOCUS_MIN_ZOOM) : MAX_ZOOM,
        });
      },
    };
    onCommandsReadyRef.current(commands);
    return () => {
      disposed = true;
      map.off("unload", markDisposed);
      onCommandsReadyRef.current(null);
    };
  }, [map]);

  return null;
}

interface AdminWorkspaceMapProps extends WorkspaceMapSlotProps {
  onMapClick?: (lat: number, lng: number) => void;
  /** 탭별 레이어(react-leaflet 컴포넌트) */
  children?: ReactNode;
}

export default function AdminWorkspaceMap({
  initialViewport,
  onViewportChange,
  onCommandsReady,
  onMapClick,
  children,
}: AdminWorkspaceMapProps) {
  const prefersDarkMode = usePrefersDarkMode();

  return (
    <MapContainer
      center={initialViewport.center}
      zoom={initialViewport.zoom}
      maxZoom={MAX_ZOOM}
      zoomControl={false}
      scrollWheelZoom
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        key={prefersDarkMode ? "dark" : "light"}
        url={getCartoTileUrl(prefersDarkMode)}
        attribution={CARTO_ATTRIBUTION}
        subdomains="abcd"
        maxZoom={MAX_ZOOM}
      />
      <NeighborBuildings />
      <ZoomControl position="topleft" zoomInTitle="확대" zoomOutTitle="축소" />
      <MapEvents onViewportChange={onViewportChange} onMapClick={onMapClick} />
      <CommandsBridge onCommandsReady={onCommandsReady} />
      {children}
    </MapContainer>
  );
}
```

- [ ] **Step 9: 작업 화면 틀**

`src/components/admin/workspace/AdminMapWorkspace.tsx`:

```tsx
"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  ADMIN_MOBILE_QUERY,
  DEFAULT_WORKSPACE_VIEWPORT,
  workspaceInsets,
  type WorkspaceFocus,
  type WorkspaceMapCommands,
  type WorkspaceMapSlotProps,
  type WorkspaceViewport,
} from "./types";

interface AdminMapWorkspaceProps {
  /** 지도는 탭이 만든다. 이 틀은 viewport와 명령 등록 콜백만 건넨다 */
  renderMap: (slot: WorkspaceMapSlotProps) => ReactNode;
  list: ReactNode;
  detail: ReactNode | null;
  focus: WorkspaceFocus | null;
  /** 모바일 상세가 위쪽에 비워 두는 지도 띠의 높이(설계 2026-10-14 2.5) */
  mobileMapStrip?: number;
}

export default function AdminMapWorkspace({
  renderMap,
  list,
  detail,
  focus,
  mobileMapStrip = 190,
}: AdminMapWorkspaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // 지도를 바꿔 끼울 때(경사도 편집, 설계 2026-10-14 2.6) 새 지도가 이어받을 마지막 화면
  const [viewport, setViewport] = useState<WorkspaceViewport>(
    DEFAULT_WORKSPACE_VIEWPORT,
  );
  const [commands, setCommands] = useState<WorkspaceMapCommands | null>(null);
  const focusedKeyRef = useRef<string | null>(null);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const detailOpen = detail !== null;

  useEffect(() => {
    if (!focus) {
      focusedKeyRef.current = null;
      return;
    }
    if (!commands || focusedKeyRef.current === focus.key) return;
    focusedKeyRef.current = focus.key;
    commands.focus(
      focus.target,
      workspaceInsets({
        mobile,
        detailOpen,
        height: rootRef.current?.clientHeight ?? 0,
        mapStrip: mobileMapStrip,
      }),
    );
  }, [commands, focus, mobile, detailOpen, mobileMapStrip]);

  return (
    <div
      ref={rootRef}
      className="ku-map-workspace"
      data-detail-open={detailOpen || undefined}
      style={{ "--ku-map-strip": `${mobileMapStrip}px` } as CSSProperties}
    >
      <div className="ku-map-workspace-map">
        {renderMap({
          initialViewport: viewport,
          onViewportChange: setViewport,
          onCommandsReady: setCommands,
        })}
      </div>
      {list}
      {detail}
    </div>
  );
}
```

- [ ] **Step 10: 목록 패널**

`src/components/admin/workspace/WorkspaceListPanel.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import AdminPagination from "@/components/admin/AdminPagination";
import type { AdminListSort } from "@/lib/adminList";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ADMIN_MOBILE_QUERY } from "./types";

export interface WorkspaceChip {
  key: string;
  label: string;
  count: number;
}

export interface WorkspaceLegendItem {
  label: string;
  color: string;
}

interface WorkspaceListPanelProps {
  title: string;
  caption: string;
  addLabel: string;
  onAdd: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  /** 검색 옆에 두는 추가 필터(유형 드롭다운 등) */
  filters?: ReactNode;
  chips: WorkspaceChip[];
  activeChip: string;
  onChipChange: (key: string) => void;
  sort: AdminListSort;
  onSortChange: (sort: AdminListSort) => void;
  sortLabel: string;
  status: "loading" | "error" | "ready";
  errorMessage: string;
  onRetry: () => void;
  matchedCount: number;
  page: number;
  onPageChange: (page: number) => void;
  legend: WorkspaceLegendItem[];
  children: ReactNode;
}

const SORT_OPTIONS: { value: AdminListSort; label: string }[] = [
  { value: "updated-desc", label: "최근 수정순" },
  { value: "updated-asc", label: "오래 수정순" },
  { value: "name", label: "이름순" },
];

export default function WorkspaceListPanel({
  title,
  caption,
  addLabel,
  onAdd,
  searchValue,
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  filters,
  chips,
  activeChip,
  onChipChange,
  sort,
  onSortChange,
  sortLabel,
  status,
  errorMessage,
  onRetry,
  matchedCount,
  page,
  onPageChange,
  legend,
  children,
}: WorkspaceListPanelProps) {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const [expanded, setExpanded] = useState(false);

  const body =
    status === "loading" ? (
      <p className="ku-float-panel-status">불러오는 중...</p>
    ) : status === "error" ? (
      <div className="ku-float-panel-status" role="alert">
        <p>{errorMessage}</p>
        <button type="button" className="ku-workspace-button" onClick={onRetry}>
          다시 시도
        </button>
      </div>
    ) : matchedCount === 0 ? (
      <p className="ku-float-panel-status">조건에 맞는 항목이 없어요</p>
    ) : (
      <>
        {children}
        <AdminPagination
          page={page}
          totalCount={matchedCount}
          onPageChange={onPageChange}
        />
      </>
    );

  const searchRow = (
    <div className="ku-workspace-search-row">
      <label className="ku-workspace-search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
        />
      </label>
      {filters}
    </div>
  );

  const chipRow = (
    <div className="ku-chip-row" role="group" aria-label="목록 필터">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="ku-chip"
          aria-pressed={chip.key === activeChip}
          aria-label={`${chip.label} ${chip.count}개`}
          onClick={() => onChipChange(chip.key)}
        >
          {chip.label}
          <span className="ku-chip-count" aria-hidden="true">
            {chip.count}
          </span>
        </button>
      ))}
    </div>
  );

  const sortSelect = (
    <select
      value={sort}
      onChange={(event) => onSortChange(event.target.value as AdminListSort)}
      aria-label={sortLabel}
    >
      {SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  if (mobile) {
    return (
      <>
        <div className="ku-workspace-mobile-bar">
          {searchRow}
          {chipRow}
        </div>
        <section
          className="ku-bottom-sheet"
          aria-label={title}
          data-expanded={expanded || undefined}
        >
          <button
            type="button"
            className="ku-bottom-sheet-handle"
            aria-expanded={expanded}
            aria-label={expanded ? "목록 접기" : "목록 펼치기"}
            onClick={() => setExpanded((value) => !value)}
          >
            <span aria-hidden="true" />
          </button>
          <div className="ku-bottom-sheet-head">
            <h1>{title}</h1>
            <span role="status">{matchedCount}개 표시</span>
            {sortSelect}
            <button
              type="button"
              className="ku-workspace-primary"
              onClick={onAdd}
            >
              ＋ 추가
            </button>
          </div>
          <div className="ku-bottom-sheet-list">{body}</div>
        </section>
      </>
    );
  }

  return (
    <section className="ku-float-panel" aria-label={title}>
      <div className="ku-float-panel-head">
        <div className="ku-float-panel-title-row">
          <div>
            <h1 className="ku-float-panel-title">{title}</h1>
            <p className="ku-float-panel-caption">{caption}</p>
          </div>
          <button
            type="button"
            className="ku-workspace-primary"
            onClick={onAdd}
          >
            {addLabel}
          </button>
        </div>
        {searchRow}
        {chipRow}
      </div>
      <div className="ku-float-panel-result">
        <span role="status">{matchedCount}개 표시</span>
        {sortSelect}
      </div>
      <div className="ku-float-panel-list">{body}</div>
      {legend.length > 0 && (
        <ul className="ku-float-panel-legend" aria-label="범례">
          {legend.map((item) => (
            <li key={item.label}>
              <span aria-hidden="true" style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

모바일 분기의 모양은 Task 10의 CSS가 맡는다. 이 태스크에서는 데스크톱만 확인한다.

- [ ] **Step 11: 독립 시설 행**

`src/components/admin/facilities/FacilityListRow.tsx`:

```tsx
import { getFacilityMarkerColor } from "@/components/map/facilityColors";
import { FacilityTypeIcon } from "@/components/map/iconography";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import { facilityNeedsTranslation } from "@/lib/facilityTranslationState";
import { facilityDisplayName } from "@/lib/facilityWorkspace";
import type { FacilityWithType } from "@/types/domain";

interface FacilityListRowProps {
  facility: FacilityWithType;
  selected: boolean;
  onSelect: () => void;
}

export default function FacilityListRow({
  facility,
  selected,
  onSelect,
}: FacilityListRowProps) {
  const code = facility.facility_types?.code ?? facility.facility_code;
  return (
    <button
      type="button"
      className="ku-workspace-row"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span
        className="ku-workspace-row-icon"
        style={{ background: getFacilityMarkerColor(code ?? "") }}
      >
        <FacilityTypeIcon code={code} size={16} />
      </span>
      <span className="ku-workspace-row-text">
        <span
          className="ku-workspace-row-name"
          data-testid="admin-list-item-name"
        >
          {facilityDisplayName(facility)}
        </span>
        <span className="ku-workspace-row-meta">
          {facility.facility_types?.label ?? "유형 없음"} ·{" "}
          {formatAdminUpdatedAt(facility.updated_at)}
        </span>
      </span>
      <span className="ku-workspace-row-badges">
        {facility.is_installed === false && (
          <span className="ku-row-badge" data-tone="missing">
            미설치
          </span>
        )}
        {facilityNeedsTranslation(facility) && (
          <span className="ku-row-badge" data-tone="warn">
            번역 필요
          </span>
        )}
      </span>
    </button>
  );
}
```

- [ ] **Step 12: 독립 시설 지도**

`src/components/admin/facilities/FacilityWorkspaceMap.tsx`:

```tsx
"use client";

import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import AdminWorkspaceMap from "@/components/admin/workspace/AdminWorkspaceMap";
import type {
  DetailDraftPin,
  LatLngTuple,
  WorkspaceMapSlotProps,
} from "@/components/admin/workspace/types";
import { getFacilityMarkerColor } from "@/components/map/facilityColors";
import { facilityDisplayName } from "@/lib/facilityWorkspace";
import { facilityIconSvg } from "@/lib/mapIcons";
import { color } from "@/lib/theme";
import type { FacilityWithType } from "@/types/domain";

// 렌더마다 새 아이콘을 만들면 react-leaflet이 마커 DOM을 매번 갈아 끼운다(FacilityMarkers와 같은 이유).
const iconCache = new Map<string, L.DivIcon>();

function markerIcon(
  id: string,
  code: string | null,
  fill: string,
  selected: boolean,
) {
  const key = `${id}|${code ?? ""}|${fill}|${selected}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const size = selected ? 30 : 24;
  const icon = L.divIcon({
    className: "",
    html: `<div class="ku-workspace-marker${selected ? " ku-workspace-marker--selected" : ""}" data-testid="admin-facility-marker-${id}" style="background:${fill}"><span aria-hidden="true">${facilityIconSvg(code, selected ? 15 : 12)}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

interface FacilityWorkspaceMapProps extends WorkspaceMapSlotProps {
  /** 거른 결과 전체(페이지와 상관없다) */
  facilities: FacilityWithType[];
  selected: FacilityWithType | null;
  creating: boolean;
  draft: DetailDraftPin | null;
  onSelect: (id: string) => void;
}

export default function FacilityWorkspaceMap({
  facilities,
  selected,
  creating,
  draft,
  onSelect,
  ...slot
}: FacilityWorkspaceMapProps) {
  // 저장 중에는 위치 편집을 잠근다(설계 2026-10-14 3.5)
  const editor = draft && !draft.saving ? draft : null;
  const savedPosition: LatLngTuple | null =
    selected && selected.lat != null && selected.lng != null
      ? [selected.lat, selected.lng]
      : null;
  const pinPosition = draft ? draft.position : savedPosition;
  const pinCode = selected?.facility_code ?? null;
  const pinLabel = selected ? facilityDisplayName(selected) : "새 시설";

  return (
    <AdminWorkspaceMap
      {...slot}
      onMapClick={
        editor ? (lat, lng) => editor.setPosition([lat, lng]) : undefined
      }
    >
      {facilities.map((facility) =>
        facility.id === selected?.id ||
        facility.lat == null ||
        facility.lng == null ? null : (
          <Marker
            key={facility.id}
            position={[facility.lat, facility.lng]}
            icon={markerIcon(
              facility.id,
              facility.facility_code,
              getFacilityMarkerColor(facility.facility_code ?? ""),
              false,
            )}
            title={facilityDisplayName(facility)}
            eventHandlers={{ click: () => onSelect(facility.id) }}
          />
        ),
      )}
      {pinPosition && (selected || creating) && (
        <Marker
          key={selected?.id ?? "new"}
          position={pinPosition}
          icon={
            selected
              ? markerIcon(
                  selected.id,
                  pinCode,
                  getFacilityMarkerColor(pinCode ?? ""),
                  true,
                )
              : markerIcon("new", null, color.crimson700, true)
          }
          draggable={editor !== null}
          zIndexOffset={1000}
          title={pinLabel}
          eventHandlers={{
            click: () => {
              if (selected) onSelect(selected.id);
            },
            dragend: (event) => {
              const { lat, lng } = (event.target as L.Marker).getLatLng();
              editor?.setPosition([lat, lng]);
            },
          }}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -18]}
            className="ku-workspace-marker-tooltip"
          >
            {pinLabel}
          </Tooltip>
        </Marker>
      )}
    </AdminWorkspaceMap>
  );
}
```

- [ ] **Step 13: 페이지를 교체한다**

`src/app/admin/dashboard/facilities/page.tsx` 전체를 다음으로 바꾼다.

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";
import FacilityListRow from "@/components/admin/facilities/FacilityListRow";
import AdminMapWorkspace from "@/components/admin/workspace/AdminMapWorkspace";
import WorkspaceListPanel from "@/components/admin/workspace/WorkspaceListPanel";
import {
  ADMIN_MOBILE_QUERY,
  type WorkspaceFocus,
} from "@/components/admin/workspace/types";
import { useAdminCollection } from "@/components/admin/workspace/useAdminCollection";
import {
  applyWorkspaceState,
  useWorkspaceSelection,
} from "@/components/admin/workspace/useWorkspaceSelection";
import { getFacilityMarkerColor } from "@/components/map/facilityColors";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  pageOfItem,
  viewAdminCollection,
  type AdminChip,
} from "@/lib/adminCollection";
import {
  FACILITY_CHIPS,
  FACILITY_COLLECTION_POLICY,
  type FacilityChip,
} from "@/lib/facilityWorkspace";
import { supabase } from "@/lib/supabaseClient";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { readWorkspaceState, type WorkspaceState } from "@/lib/workspaceUrl";
import type { FacilityType, FacilityWithType } from "@/types/domain";

const FacilityWorkspaceMap = dynamic(
  () => import("@/components/admin/facilities/FacilityWorkspaceMap"),
  { ssr: false },
);

// 상세 패널의 사진 칸이 쓴다. created_at은 업로드 순서 정렬에 필요하다.
const FACILITY_SELECT =
  "*, facility_types(code, label), facility_photos(id, storage_path, sort_order, created_at)";
const NOT_FOUND_MESSAGE = "시설을 찾지 못했어요. 삭제됐거나 주소가 틀렸어요.";

function currentSelection() {
  return readWorkspaceState(window.location.search, { allowEdit: false });
}

export default function StandaloneFacilitiesPage() {
  const [facilities, setFacilities] = useState<FacilityWithType[]>([]);
  const [facilityTypes, setFacilityTypes] = useState<FacilityType[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [typesFailed, setTypesFailed] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const loadRequestRef = useRef(0);
  const loadedRef = useRef(false);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const { state, request } = useWorkspaceSelection({ allowEdit: false });
  const collection = useAdminCollection(
    facilities,
    FACILITY_COLLECTION_POLICY,
    typeFilter === "all"
      ? undefined
      : (facility) => facility.facility_code === typeFilter,
  );
  const { view, setPage } = collection;
  const selected =
    state.mode === "view"
      ? (facilities.find((facility) => facility.id === state.id) ?? null)
      : null;

  const loadTypes = useCallback(async () => {
    const { data, error } = await supabase.from("facility_types").select("*");
    setTypesFailed(Boolean(error));
    if (!error) setFacilityTypes(data ?? []);
  }, []);

  const loadFacilities = useCallback(async () => {
    loadRequestRef.current += 1;
    const ticket = loadRequestRef.current;
    const { data, error } = await supabase
      .from("building_facilities")
      .select(FACILITY_SELECT)
      .is("building_id", null)
      .order("id", { ascending: true });
    // 저장·설치 변경 뒤의 다시 받기가 겹치면 마지막 요청만 그린다
    if (ticket !== loadRequestRef.current) return null;
    if (error) {
      if (loadedRef.current) {
        setToast({
          message: "시설 목록을 새로 불러오지 못했어요",
          type: "error",
        });
      } else {
        setStatus("error");
      }
      return null;
    }
    const rows: FacilityWithType[] = data ?? [];
    loadedRef.current = true;
    setFacilities(rows);
    setStatus("ready");
    // 존재 검사는 조회가 끝난 뒤에만 한다. 조회 전 빈 목록으로 판정하면 맞는 링크도 닫힌다(설계 2026-10-14 3.4)
    const selection = currentSelection();
    if (
      selection.mode === "view" &&
      !rows.some((row) => row.id === selection.id)
    ) {
      applyWorkspaceState({ mode: "closed" });
      setToast({ message: NOT_FOUND_MESSAGE, type: "warning" });
    }
    return rows;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      void loadTypes();
      const rows = await loadFacilities();
      const selection = currentSelection();
      if (!rows || selection.mode !== "view") return;
      // ?id=로 들어오면 그 항목이 있는 페이지를 연다
      const page = pageOfItem(
        viewAdminCollection(
          rows,
          FACILITY_COLLECTION_POLICY,
          INITIAL_ADMIN_COLLECTION_QUERY,
        ).matched,
        selection.id,
        FACILITY_COLLECTION_POLICY.id,
      );
      if (page !== null) setPage(page);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadFacilities, loadTypes, setPage]);

  function requestSelection(next: WorkspaceState, alsoApply?: () => void) {
    request(next, alsoApply);
  }

  // 칩·검색·정렬·유형·페이지를 바꾸면 선택을 푼다(설계 2026-10-14 3.3)
  function clearSelectionThen(change: () => void) {
    requestSelection({ mode: "closed" }, change);
  }

  function select(id: string) {
    if (!mobile && state.mode === "view" && state.id === id) {
      requestSelection({ mode: "closed" });
      return;
    }
    const page = collection.pageOf(id);
    requestSelection({ mode: "view", id }, () => {
      if (page !== null) setPage(page);
    });
  }

  function retry() {
    setStatus("loading");
    void loadTypes();
    void loadFacilities();
  }

  const focus: WorkspaceFocus | null =
    selected && selected.lat != null && selected.lng != null
      ? {
          key: selected.id,
          target: { point: [selected.lat, selected.lng] },
        }
      : null;

  const chips = [
    { key: "all", label: "전체", count: view.chipCounts.all },
    ...FACILITY_CHIPS.map((chip) => ({
      ...chip,
      count: view.chipCounts[chip.key],
    })),
  ];

  return (
    <>
      <AdminMapWorkspace
        focus={focus}
        renderMap={(slot) => (
          <FacilityWorkspaceMap
            {...slot}
            facilities={view.matched}
            selected={selected}
            creating={state.mode === "new"}
            draft={null}
            onSelect={select}
          />
        )}
        list={
          <WorkspaceListPanel
            title="독립 시설"
            caption={`건물에 속하지 않는 야외 경사로, 주차구역 등 · 총 ${view.total}개`}
            addLabel="＋ 시설 추가"
            onAdd={() => requestSelection({ mode: "new" })}
            searchValue={collection.search}
            onSearchChange={(value) =>
              clearSelectionThen(() => collection.setSearch(value))
            }
            searchLabel="독립 시설 검색"
            searchPlaceholder="시설명 또는 설명 검색"
            filters={
              <select
                value={typeFilter}
                onChange={(event) => {
                  const next = event.target.value;
                  clearSelectionThen(() => {
                    setTypeFilter(next);
                    setPage(1);
                  });
                }}
                aria-label="시설 유형 필터"
              >
                <option value="all">모든 유형</option>
                {facilityTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.label}
                  </option>
                ))}
              </select>
            }
            chips={chips}
            activeChip={collection.chip}
            onChipChange={(key) =>
              clearSelectionThen(() =>
                collection.setChip(key as AdminChip<FacilityChip>),
              )
            }
            sort={collection.sort}
            onSortChange={(sort) =>
              clearSelectionThen(() => collection.setSort(sort))
            }
            sortLabel="독립 시설 정렬"
            status={typesFailed ? "error" : status}
            errorMessage="시설 목록을 불러오지 못했어요."
            onRetry={retry}
            matchedCount={view.matched.length}
            page={view.page}
            onPageChange={(page) => clearSelectionThen(() => setPage(page))}
            legend={facilityTypes.map((type) => ({
              label: type.label ?? type.code,
              color: getFacilityMarkerColor(type.code),
            }))}
          >
            {view.pageItems.map((facility) => (
              <FacilityListRow
                key={facility.id}
                facility={facility}
                selected={facility.id === selected?.id}
                onSelect={() => select(facility.id)}
              />
            ))}
          </WorkspaceListPanel>
        }
        detail={null}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 14: 작업 화면 CSS를 더한다**

`src/app/admin/admin-ui.css` 파일 끝에 붙인다.

```css
/* ── 지도 작업 화면(독립 시설·명소·경사도) ───────────────────────────────
   값의 원본은 docs/specs/2026-10-14-admin-map-first-handoff/README.md다. 패널 폭·여백을
   바꾸면 src/components/admin/workspace/types.ts의 workspaceInsets도 같이 바꾼다.
   패널에는 z-index를 두지 않는다. 패널이 쌓임 맥락을 만들면 그 안에서 여는 고정 모달
   (동영상·사진 삭제 확인)이 헤더 아래에 갇힌다. 지도만 z-index: 0 맥락에 가두고, 패널은
   문서 순서로 그 위에 그려진다. */
.ku-map-workspace {
  position: relative;
  height: calc(100dvh - var(--ku-admin-header-height));
  overflow: hidden;
}
.ku-map-workspace-map {
  position: absolute;
  z-index: 0;
  inset: 0;
}
.ku-map-workspace-map .leaflet-container {
  width: 100%;
  height: 100%;
  background: var(--ku-bg);
  font-family: inherit;
}
.ku-map-workspace .leaflet-top.leaflet-left {
  top: 16px;
  left: 436px;
}
.ku-map-workspace .leaflet-control-zoom {
  margin: 0;
  overflow: hidden;
  border-radius: 8px;
}
.ku-map-workspace .leaflet-control-zoom a {
  width: 36px !important;
  height: 36px !important;
  line-height: 36px !important;
}
.ku-map-workspace[data-detail-open] .leaflet-bottom.leaflet-right {
  right: 476px;
}
.ku-workspace-primary {
  flex: none;
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  background: var(--ku-primary);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}
.ku-workspace-primary:hover:not(:disabled) {
  background: var(--ku-primary-hover);
}
.ku-workspace-primary:disabled {
  background: var(--ku-primary-disabled);
  cursor: not-allowed;
}
.ku-workspace-button {
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--ku-border-input);
  border-radius: 8px;
  color: var(--ku-text-1);
  background: var(--ku-surface);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.ku-workspace-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ku-float-panel {
  position: absolute;
  top: 16px;
  bottom: 16px;
  left: 16px;
  display: flex;
  flex-direction: column;
  width: 404px;
  overflow: hidden;
  border-radius: 14px;
  background: var(--ku-surface);
  box-shadow: 0 4px 20px rgba(28, 25, 23, 0.14);
}
.ku-float-panel-head {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 12px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid var(--ku-divider);
}
.ku-float-panel-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.ku-float-panel-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.ku-float-panel-caption {
  margin-top: 4px;
  color: var(--ku-text-3);
  font-size: 12px;
  line-height: 1.45;
}
.ku-workspace-search-row {
  display: flex;
  gap: 8px;
}
.ku-workspace-search {
  position: relative;
  flex: 1;
  min-width: 0;
}
.ku-workspace-search span {
  position: absolute;
  top: 50%;
  left: 11px;
  color: var(--ku-text-3);
  transform: translateY(-50%);
}
.ku-workspace-search input {
  width: 100%;
  height: 38px;
  padding: 0 12px 0 32px;
  border: 1px solid var(--ku-border-input);
  border-radius: 8px;
  color: var(--ku-text-1);
  background: var(--ku-surface);
  font-size: 13px;
}
.ku-workspace-search-row select {
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--ku-border-input);
  border-radius: 8px;
  color: var(--ku-text-1);
  background: var(--ku-surface);
  font-size: 12.5px;
}
.ku-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ku-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--ku-border-input);
  border-radius: 999px;
  color: var(--ku-text-2);
  background: var(--ku-surface);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.ku-chip[aria-pressed="true"] {
  border-color: var(--ku-primary);
  color: #fff;
  background: var(--ku-primary);
}
.ku-chip-count {
  opacity: 0.75;
}
.ku-float-panel-result {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  padding: 8px 18px;
  color: var(--ku-text-3);
  font-size: 11.5px;
  font-weight: 600;
}
.ku-float-panel-result select {
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.ku-float-panel-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.ku-float-panel-status {
  padding: 40px 20px;
  color: var(--ku-text-3);
  font-size: 13px;
  text-align: center;
}
.ku-float-panel-status .ku-workspace-button {
  margin-top: 12px;
}
.ku-float-panel-legend {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 18px;
  border-top: 1px solid var(--ku-divider);
  background: color-mix(in srgb, var(--ku-surface) 50%, var(--ku-bg));
  list-style: none;
}
.ku-float-panel-legend li {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--ku-text-2);
  font-size: 11px;
}
.ku-float-panel-legend li span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.ku-workspace-row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 11px 18px;
  border: 0;
  border-top: 1px solid var(--ku-divider);
  color: var(--ku-text-1);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.ku-workspace-row:hover {
  background: color-mix(in srgb, var(--ku-bg) 60%, var(--ku-surface));
}
.ku-workspace-row[aria-pressed="true"] {
  background: var(--ku-crimson-50);
}
.ku-workspace-row[aria-pressed="true"] .ku-workspace-row-name {
  color: var(--ku-crimson-700);
}
.ku-workspace-row-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #fff;
}
.ku-workspace-row-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.ku-workspace-row-name {
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ku-workspace-row-meta {
  margin-top: 2px;
  overflow: hidden;
  color: var(--ku-text-3);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ku-workspace-row-badges {
  display: flex;
  flex: none;
  gap: 4px;
}
.ku-row-badge {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.ku-row-badge[data-tone="missing"] {
  color: var(--ku-status-missing-fg);
  background: var(--ku-status-missing-bg);
}
.ku-row-badge[data-tone="warn"] {
  color: var(--ku-status-warn-fg);
  background: var(--ku-status-warn-bg);
}
.ku-workspace-marker {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border: 2px solid #fff;
  border-radius: 50%;
  color: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
.ku-workspace-marker--selected {
  box-shadow:
    0 0 0 4px rgba(140, 0, 0, 0.3),
    0 2px 6px rgba(0, 0, 0, 0.2);
}
.ku-workspace-marker span {
  display: flex;
}
.leaflet-tooltip.ku-workspace-marker-tooltip {
  padding: 5px 9px;
  border: 0;
  border-radius: 7px;
  color: #fff;
  background: #1c1917;
  box-shadow: none;
  font-size: 12px;
  font-weight: 600;
}
.leaflet-tooltip-top.ku-workspace-marker-tooltip::before {
  border-top-color: #1c1917;
}
```

- [ ] **Step 15: 커밋·푸시하고 통과를 확인한다**

```bash
git add src/lib/useMediaQuery.ts src/components/admin/workspace src/components/admin/facilities src/app/admin/dashboard/facilities/page.tsx src/app/admin/admin-ui.css
git commit -m "feat(facilities-workspace): 독립 시설을 지도 작업 화면으로 바꾸고 목록·마커 선택을 URL에 둔다"
git push
```

Expected: 전 잡 통과. 특히 `admin-dark.spec.ts`의 `시설 목록` 다크 스캔(작업 화면에 하드코딩 밝은 색이 없어야 한다)과 `admin-auth.spec.ts`.

- [ ] **Step 16: 프리뷰로 데스크톱 모양을 핸드오버와 대조한다**

PR의 Vercel 프리뷰에서 `/admin/dashboard/facilities`를 열고 `Admin B.dc.html`(같은 폴더의 `support.js`와 함께 브라우저로 연다)의 독립 시설 화면과 나란히 본다: 패널 위치·폭·반경·그림자, 칩 모양, 행 높이·배지, 마커 크기·선택 링·툴팁, 줌 버튼 위치, 범례. 다른 점은 고치고 같은 커밋 흐름으로 푸시한다. 다크 모드도 한 번 본다.

---

### Task 8: 상세 패널

**Files:**

- Create: `src/components/admin/workspace/DetailPanel.tsx`
- Create: `src/components/admin/facilities/FacilityDetailPanel.tsx`
- Modify: `src/components/facility/FacilityFields.tsx`(`showLocation`)
- Modify(전체 교체): `src/app/admin/dashboard/facilities/page.tsx`
- Modify: `src/app/admin/admin-ui.css`(작업 화면 절 뒤에 상세 패널 절)
- Test: `e2e/admin-facilities-workspace.spec.ts`, `e2e/accessibility-dialog-toast.spec.ts`, `e2e/admin-dark.spec.ts`

**Interfaces:**

- Consumes: Task 5(`facilityDisplayName`, `facilityFormFromRow`), Task 6(`buildFacilityPayload`, `saveFacility`), Task 7(`DetailDraftPin`, `ADMIN_MOBILE_QUERY`, `DEFAULT_WORKSPACE_VIEWPORT`, `applyWorkspaceState`, 페이지 구조).
- Produces:
  - `<DetailPanel label header onClose closeDisabled? remove? save children />` — `remove: { confirmMessage: string; disabled?: boolean; onConfirm: () => Promise<void> }`, `save: { pending: boolean; disabled?: boolean; onClick: () => void } | null`. PR ②·③의 상세 패널이 이 틀을 쓴다.
  - `<FacilityDetailPanel facility facilityTypes boundaries boundariesError onDraftChange onSaved onChanged onDeleted onClose showToast />`
  - `FacilityFields`의 `showLocation?: boolean`(기본 true). PR ④의 검토 드로어도 쓴다(설계 7.3).

- [ ] **Step 1: 상세 패널 E2E를 쓴다**

`e2e/admin-facilities-workspace.spec.ts` 맨 위 import에 다음을 더한다.

```ts
import path from "node:path";
```

`facilitiesRequest` 함수 뒤에 더한다.

```ts
function detailPanel(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

// 목업이 unpkg(ffmpeg 코어)를 끊어 변환은 항상 실패한다. 재생 가능한 원본으로
// 대체되는 경로를 타려면 더미 바이트가 아닌 실제 H.264 파일이 필요하다.
const PLAYABLE_VIDEO = path.join(__dirname, "fixtures/tiny-h264.mp4");

async function openNewFacility(page: Page) {
  await listPanel(page).getByRole("button", { name: "＋ 시설 추가" }).click();
  return detailPanel(page, "시설 추가");
}
```

파일 끝에 더한다.

```ts
test.describe("독립 시설 작업 화면 — 상세 패널", () => {
  test("행을 누르면 상세 패널이 열리고 ✕로 닫는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");

    await expect(
      detail.getByRole("heading", { name: "중앙광장 경사로" }),
    ).toBeVisible();
    await expect(detail.getByText(/^경사로 · 수정 /)).toBeVisible();
    await expect(detail.getByLabel("시설 이름 (선택)")).toHaveValue(
      "중앙광장 경사로",
    );
    await detail.getByRole("button", { name: "상세 닫기" }).click();
    await expect(detail).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);
  });

  test("?id= 링크는 그 시설의 상세 패널을 연다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities?id=f-uninstalled");
    await expect(detailPanel(page, "공사 중 주차구역")).toBeVisible();
  });

  test("설치 상태를 누르면 바로 저장하고 status 토스트로 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");
    const installed = detail.getByRole("button", { name: "설치", exact: true });
    const missing = detail.getByRole("button", { name: "미설치", exact: true });

    await expect(installed).toHaveAttribute("aria-pressed", "true");
    await missing.click();
    await expect(
      page
        .locator(".ku-toast[role='status']")
        .filter({ hasText: "미설치로 변경되었어요" }),
    ).toBeVisible();
    await expect(missing).toHaveAttribute("aria-pressed", "true");
    await expect(listRow(page, "중앙광장 경사로")).toContainText("미설치");
    expect(
      state.facilities.find((facility) => facility.id === "f-installed")
        ?.is_installed,
    ).toBe(false);
  });

  test("번역이 필요한 시설을 상세에서 재번역한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    const target = state.facilities.find(
      (facility) => facility.id === "f-installed",
    );
    if (target) target.translation_status = "failed";
    await page.goto("/admin/dashboard/facilities");
    await expect(listRow(page, "중앙광장 경사로")).toContainText("번역 필요");
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");

    await expect(detail.getByText("영문·중문 번역 필요")).toBeVisible();
    await detail.getByRole("button", { name: "재번역" }).click();
    await expect(page.getByText("시설 번역을 완료했어요")).toBeVisible();
    await expect(detail.getByText("✓ 영문·중문 번역 완료")).toBeVisible();
    expect(target?.translation_status).toBe("translated");
  });

  test("인라인 확인을 거쳐 시설을 삭제한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "공사 중 주차구역").click();
    const detail = detailPanel(page, "공사 중 주차구역");

    await detail.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(
      detail.getByText("삭제한 시설은 복구할 수 없어요."),
    ).toBeVisible();
    // ConfirmModal을 띄우지 않는다(설계 2026-10-14 4.2)
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await detail.getByRole("button", { name: "취소" }).click();
    await expect(
      detail.getByText("삭제한 시설은 복구할 수 없어요."),
    ).toHaveCount(0);

    await detail.getByRole("button", { name: "삭제", exact: true }).click();
    await detail
      .getByRole("group", { name: "삭제 확인" })
      .getByRole("button", { name: "삭제" })
      .click();
    await expect(page.getByText("시설이 삭제되었어요")).toBeVisible();
    await expect(detail).toHaveCount(0);
    await expect(listRow(page, "공사 중 주차구역")).toHaveCount(0);
    expect(
      state.facilities.some((facility) => facility.id === "f-uninstalled"),
    ).toBe(false);
  });

  test("시설 동영상을 업로드하고 캡션 저장 후 삭제한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    await detailPanel(page, "중앙광장 경사로")
      .getByRole("button", { name: "＋ 동영상 연결" })
      .click();
    await expect(page.getByText("동영상 관리")).toBeVisible();

    await expect(page.getByText("가로 영상을 추천드려요")).toBeVisible();
    await page
      .locator('input[type="file"][accept^="video/"]')
      .setInputFiles(PLAYABLE_VIDEO);
    await expect(
      page.getByText("용량을 줄이지 못해 원본을 올렸어요"),
    ).toBeVisible();
    await expect(page.locator("video")).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.id === "f-installed")
        ?.video_poster_url,
    ).toBe("https://cdn.test/video.jpg");

    const caption = page.getByPlaceholder("동영상 설명 추가...");
    await caption.fill("정문 방향 경사로 영상");
    await caption.blur();
    await expect
      .poll(
        () =>
          state.facilities.find((facility) => facility.id === "f-installed")
            ?.video_caption,
      )
      .toBe("정문 방향 경사로 영상");

    await page.getByRole("button", { name: "동영상 삭제" }).click();
    await page.getByText("동영상을 삭제할까요?").waitFor();
    await page
      .getByRole("button", { name: "삭제", exact: true })
      .last()
      .click();
    await expect(page.getByText(/동영상 추가/)).toBeVisible();
  });

  test("변환 도구를 불러오는 중에 나가면 업로드 요청이 나가지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let releaseCore = () => {};
    await page.route("https://unpkg.com/**", async (route) => {
      await new Promise<void>((resolve) => (releaseCore = resolve));
      await route.abort();
    });
    const uploadCalls: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/api/facility-video"))
        uploadCalls.push(pathname);
    });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    await detailPanel(page, "중앙광장 경사로")
      .getByRole("button", { name: "＋ 동영상 연결" })
      .click();

    await page
      .locator('input[type="file"][accept^="video/"]')
      .setInputFiles(PLAYABLE_VIDEO);
    // 진행 영역과 업로드 버튼 라벨에 같은 문구가 두 번 나온다.
    await expect(
      page.getByText("변환 도구 불러오는 중...").first(),
    ).toBeVisible();
    await page
      .getByRole("dialog", { name: "동영상 관리" })
      .getByRole("button", { name: "닫기" })
      .click();
    await page.getByRole("button", { name: "중단하고 나가기" }).click();
    await expect(page.getByText("동영상 관리")).toHaveCount(0);
    releaseCore();

    // 취소 플래그가 없으면 이 사이에 재생 검사를 거쳐 presign이 나간다.
    await page.waitForTimeout(1500);
    expect(uploadCalls).toEqual([]);
  });

  test("포스터 업로드가 실패하면 포스터 없이 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.route("https://upload.test/poster", (route) =>
      route.fulfill({
        status: 500,
        headers: { "access-control-allow-origin": "*" },
        body: "",
      }),
    );
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    await detailPanel(page, "중앙광장 경사로")
      .getByRole("button", { name: "＋ 동영상 연결" })
      .click();

    await page
      .locator('input[type="file"][accept^="video/"]')
      .setInputFiles(PLAYABLE_VIDEO);

    await expect(page.locator("video")).toBeVisible();
    const facility = state.facilities.find((item) => item.id === "f-installed");
    expect(facility?.video_url).toBe("https://cdn.test/video.mp4");
    expect(facility?.video_poster_url).toBeNull();
  });

  test("새 시설을 현 위치에 만들어 저장하면 그 시설의 상세로 바뀐다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const detail = await openNewFacility(page);
    await expect(page).toHaveURL(/\?new=1$/);

    // 저장 전에는 사진·동영상을 올릴 수 없다(설계 2026-10-14 4.2)
    await expect(
      detail.getByRole("button", { name: "＋ 동영상 연결" }),
    ).toBeDisabled();
    await detail.getByLabel("시설 유형 *").selectOption("ramp");
    await detail.getByLabel("시설 이름 (선택)").fill("E2E 경사로");
    await detail.getByRole("button", { name: "현 위치로 찍기" }).click();
    await expect(
      page.getByText("현재 위치를 지도에 표시했어요."),
    ).toBeVisible();
    await detail.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("시설이 추가되었어요!")).toBeVisible();
    await expect(detailPanel(page, "E2E 경사로")).toBeVisible();
    await expect(page).toHaveURL(/\?id=f-created$/);
    expect(
      state.facilities.find((facility) => facility.name === "E2E 경사로"),
    ).toMatchObject({
      building_id: null,
      facility_code: "ramp",
      is_installed: true,
      floor_info: null,
    });
  });

  test("저장과 자동 번역 실패를 나누어 알리고 재번역한다", async ({ page }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      failTranslations: 1,
    });
    await page.goto("/admin/dashboard/facilities");
    const draft = await openNewFacility(page);
    await draft.getByLabel("시설 유형 *").selectOption("ramp");
    await draft.getByLabel("시설 이름 (선택)").fill("번역 실패 경사로");
    await draft.getByRole("button", { name: "현 위치로 찍기" }).click();
    await draft.getByRole("button", { name: "저장" }).click();

    await expect(
      page.getByText(
        "시설은 저장했지만 자동 번역에 실패했어요. 상세에서 재번역해 주세요.",
      ),
    ).toBeVisible();
    const detail = detailPanel(page, "번역 실패 경사로");
    await expect(detail.getByText("영문·중문 번역 필요")).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.name === "번역 실패 경사로")
        ?.translation_status,
    ).toBe("failed");

    await detail.getByRole("button", { name: "재번역" }).click();
    await expect(page.getByText("시설 번역을 완료했어요")).toBeVisible();
    await expect(detail.getByText("✓ 영문·중문 번역 완료")).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.name === "번역 실패 경사로")
        ?.name_en,
    ).toBe("EN 번역 실패 경사로");
  });

  test("캠퍼스 밖 위치는 경고하되 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      currentLocation: { latitude: 37.61, longitude: 127.06 },
    });
    await page.goto("/admin/dashboard/facilities");
    const detail = await openNewFacility(page);
    await detail.getByLabel("시설 유형 *").selectOption("ramp");
    await detail.getByLabel("시설 이름 (선택)").fill("인접 지역 경사로");
    await detail.getByRole("button", { name: "현 위치로 찍기" }).click();
    await expect(
      detail.getByText(
        "캠퍼스 영역 밖입니다. 인접 지역 시설이라면 그대로 저장할 수 있습니다.",
      ),
    ).toBeVisible();

    const before = state.facilities.length;
    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("시설이 추가되었어요!")).toBeVisible();
    expect(state.facilities).toHaveLength(before + 1);
    expect(state.facilities.at(-1)).toMatchObject({
      name: "인접 지역 경사로",
      lat: 37.61,
      lng: 127.06,
    });
  });

  test("설치 상태를 바꾼 뒤 이름을 고쳐 저장해도 설치 상태가 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");

    await detail.getByRole("button", { name: "미설치", exact: true }).click();
    await expect(page.getByText("미설치로 변경되었어요")).toBeVisible();
    await detail.getByLabel("시설 이름 (선택)").fill("고친 경사로");
    await detail.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("시설이 수정되었어요!")).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.id === "f-installed"),
    ).toMatchObject({ name: "고친 경사로", is_installed: false });
  });

  test("지도를 눌러 위치를 옮기고 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");
    const coords = detail.locator(".ku-detail-coords");
    await expect(coords).toHaveText("37.5894, 127.0325");

    // 목록 패널(왼쪽)과 상세 패널(오른쪽) 사이의 빈 지도
    await page
      .locator(".ku-map-workspace-map .leaflet-container")
      .click({ position: { x: 600, y: 150 } });
    await expect(coords).not.toHaveText("37.5894, 127.0325");
    await detail.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("시설이 수정되었어요!")).toBeVisible();
    const saved = state.facilities.find(
      (facility) => facility.id === "f-installed",
    );
    expect(saved?.lat).not.toBe(37.5894);
    expect(saved?.lng).not.toBe(127.0325);
  });
});
```

`e2e/accessibility-dialog-toast.spec.ts`의 `test.describe` 안, `오류와 성공 토스트를 각각 alert와 status로 전달한다` 바로 앞에 Task 7에서 지운 두 시나리오를 패널 트리거로 다시 쓴다.

<!-- prettier-ignore -->
```ts
  test("중첩 확인 모달만 먼저 닫고 바깥 영상 모달의 초점을 복원한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    const facility = state.facilities.find((item) => item.id === "f-installed");
    if (facility) facility.video_url = "https://cdn.test/video.mp4";
    await page.goto("/admin/dashboard/facilities?id=f-installed");

    const trigger = page
      .getByRole("region", { name: "중앙광장 경사로", exact: true })
      .getByRole("button", { name: "교체" });
    await trigger.focus();
    await trigger.click();

    const videoDialog = page.getByRole("dialog", { name: "동영상 관리" });
    const deleteButton = videoDialog.getByRole("button", {
      name: "동영상 삭제",
    });
    await deleteButton.click();

    const confirmDialog = page.getByRole("dialog", {
      name: "동영상을 삭제할까요?",
    });
    await expect(
      confirmDialog.getByRole("button", { name: "취소" }),
    ).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(confirmDialog).toHaveCount(0);
    await expect(videoDialog).toBeVisible();
    await expect(deleteButton).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(videoDialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("동영상 삭제 성공 시 실행 버튼이 사라져도 초점이 남은 모달 안으로 복귀한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    const facility = state.facilities.find((item) => item.id === "f-installed");
    if (facility) facility.video_url = "https://cdn.test/video.mp4";
    await page.goto("/admin/dashboard/facilities?id=f-installed");

    await page
      .getByRole("region", { name: "중앙광장 경사로", exact: true })
      .getByRole("button", { name: "교체" })
      .click();

    const videoDialog = page.getByRole("dialog", { name: "동영상 관리" });
    const deleteButton = videoDialog.getByRole("button", {
      name: "동영상 삭제",
    });
    await deleteButton.click();

    const confirmDialog = page.getByRole("dialog", {
      name: "동영상을 삭제할까요?",
    });
    await confirmDialog.getByRole("button", { name: "삭제" }).click();

    await expect(confirmDialog).toHaveCount(0);
    await expect(deleteButton).toHaveCount(0);
    await expect(videoDialog).toBeVisible();
    await expect
      .poll(() =>
        videoDialog.evaluate((el) => el.contains(document.activeElement)),
      )
      .toBe(true);
  });
```

`e2e/admin-dark.spec.ts`의 `test.describe` 안 마지막에 더한다.

<!-- prettier-ignore -->
```ts
  test("독립 시설 상세 패널에 하드코딩 밝은 색이 남지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities?id=f-installed");
    await expect(
      page.getByRole("region", { name: "중앙광장 경사로", exact: true }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");

    for (const step of ["보기", "새로 만들기"]) {
      if (step === "새로 만들기") {
        await page.getByRole("button", { name: "＋ 시설 추가" }).click();
        await expect(
          page.getByRole("region", { name: "시설 추가", exact: true }),
        ).toBeVisible();
      }
      const result = await scanContrast(page);
      expect(
        result.nearWhiteBg,
        `${step} — 미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
      ).toHaveLength(0);
      expect(
        result.nearBlackText,
        `${step} — 미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
      ).toHaveLength(0);
    }
  });
```

- [ ] **Step 2: 테스트만 커밋·푸시하고 실패를 확인한다**

```bash
git add e2e
git commit -m "test(facilities-workspace): 독립 시설 상세 패널의 즉시 저장·폼 저장·위치·삭제·동영상을 테스트로 먼저 적는다"
git push
```

Expected: 상세 패널 region이 없어 새 시나리오가 모두 실패한다. Task 7의 시나리오는 통과한다.

- [ ] **Step 3: `FacilityFields`에 위치 칸 끄기를 더한다**

`src/components/facility/FacilityFields.tsx`의 `FacilityFieldsProps`에 `locationFooter?: ReactNode;` 앞에 더한다.

<!-- prettier-ignore -->
```tsx
  /** false면 위치 칸(라벨·지도·footer)을 그리지 않는다. 큰 지도에서 위치를 고르는 화면이 쓴다 */
  showLocation?: boolean;
```

구조 분해에 `showLocation = true,`를 `locationRequired = false,` 다음에 더한다. 위치 라벨 `<div className="ku-facility-location-label" …>`부터 `{locationFooter}`까지(Task 1에서 `highlightColor`를 넘긴 상태)를 다음으로 바꾼다.

<!-- prettier-ignore -->
```tsx
      {showLocation && (
        <>
          <div className="ku-facility-location-label" style={labelStyle}>
            {labels.location}
            {locationRequired ? " *" : ""}
          </div>
          <div
            className="ku-facility-map-frame"
            style={{
              marginTop: 4,
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid #ddd",
            }}
          >
            <FacilityMap
              center={mapCenter}
              highlightId={highlightBuildingId}
              highlightColor={highlightColor}
              markerPosition={
                value.lat && value.lng
                  ? [parseFloat(value.lat), parseFloat(value.lng)]
                  : null
              }
              onMapClick={(lat, lng) => {
                if (!disabled) set({ lat: lat.toFixed(7), lng: lng.toFixed(7) });
              }}
            />
          </div>
          {locationFooter}
        </>
      )}
```

- [ ] **Step 4: 상세 패널 틀**

`src/components/admin/workspace/DetailPanel.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ADMIN_MOBILE_QUERY } from "./types";

interface DetailPanelProps {
  /** region 이름이자 모바일 상단 바 제목 */
  label: string;
  /** 데스크톱 헤더(아이콘·이름·메타). ✕는 이 틀이 붙인다 */
  header: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  remove?: {
    confirmMessage: string;
    disabled?: boolean;
    onConfirm: () => Promise<void>;
  };
  save: { pending: boolean; disabled?: boolean; onClick: () => void } | null;
  children: ReactNode;
}

export default function DetailPanel({
  label,
  header,
  onClose,
  closeDisabled = false,
  remove,
  save,
  children,
}: DetailPanelProps) {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // 삭제 버튼이 확인으로 바뀌면 초점이 갈 곳을 잃는다
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  async function confirmRemove() {
    if (!remove) return;
    setRemoving(true);
    try {
      await remove.onConfirm();
    } finally {
      setRemoving(false);
      setConfirming(false);
    }
  }

  const removeControl =
    remove &&
    (confirming ? (
      <div
        className="ku-detail-remove-confirm"
        role="group"
        aria-label="삭제 확인"
      >
        <span>{remove.confirmMessage}</span>
        <button
          ref={cancelRef}
          type="button"
          className="ku-workspace-button"
          onClick={() => setConfirming(false)}
          disabled={removing}
        >
          취소
        </button>
        <button
          type="button"
          className="ku-workspace-button ku-workspace-button--danger"
          onClick={() => void confirmRemove()}
          disabled={removing}
        >
          {removing ? "삭제 중..." : "삭제"}
        </button>
      </div>
    ) : (
      <button
        type="button"
        className="ku-detail-remove"
        onClick={() => setConfirming(true)}
        disabled={remove.disabled}
      >
        삭제
      </button>
    ));

  return (
    <section className="ku-detail-panel" aria-label={label}>
      {mobile ? (
        <div className="ku-detail-panel-bar">
          <button
            type="button"
            className="ku-detail-panel-back"
            aria-label="목록으로"
            onClick={onClose}
            disabled={closeDisabled}
          >
            ‹
          </button>
          <h2>{label}</h2>
        </div>
      ) : (
        <div className="ku-detail-panel-head">
          {header}
          <button
            type="button"
            className="ku-detail-panel-close"
            aria-label="상세 닫기"
            onClick={onClose}
            disabled={closeDisabled}
          >
            ✕
          </button>
        </div>
      )}
      {/* 모바일 상세는 이 띠로 작업 화면의 지도를 보인다(설계 2026-10-14 2.5) */}
      {mobile && <div className="ku-detail-panel-strip" aria-hidden="true" />}
      <div className="ku-detail-panel-body">
        {children}
        {mobile && removeControl}
      </div>
      <div className="ku-detail-panel-foot">
        {!mobile && removeControl}
        <span className="ku-detail-panel-spacer" />
        <button
          type="button"
          className="ku-workspace-button"
          onClick={onClose}
          disabled={closeDisabled}
        >
          {mobile ? "취소" : "닫기"}
        </button>
        {save && (
          <button
            type="button"
            className="ku-workspace-primary"
            onClick={save.onClick}
            disabled={save.pending || save.disabled}
          >
            {save.pending ? "저장 중..." : "저장"}
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: 독립 시설 상세 패널**

`src/components/admin/facilities/FacilityDetailPanel.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import FacilityFields, {
  ADMIN_FACILITY_FIELD_LABELS,
} from "@/components/facility/FacilityFields";
import FacilityPhotoManager from "@/components/admin/FacilityPhotoManager";
import FacilityVideoModal from "@/components/admin/FacilityVideoModal";
import DetailPanel from "@/components/admin/workspace/DetailPanel";
import {
  DEFAULT_WORKSPACE_VIEWPORT,
  type DetailDraftPin,
} from "@/components/admin/workspace/types";
import { getFacilityMarkerColor } from "@/components/map/facilityColors";
import { FacilityTypeIcon } from "@/components/map/iconography";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import { authedFetch } from "@/lib/authedFetch";
import {
  inferCampusFromPoint,
  type CampusBoundaryCollection,
} from "@/lib/campusGeometry";
import { deleteFacility } from "@/lib/facilityDelete";
import { validateFacilityForm } from "@/lib/facilityForm";
import { buildFacilityPayload, saveFacility } from "@/lib/facilitySave";
import { translateFacility } from "@/lib/facilityTranslation";
import { facilityNeedsTranslation } from "@/lib/facilityTranslationState";
import {
  facilityDisplayName,
  facilityFormFromRow,
} from "@/lib/facilityWorkspace";
import { supabase } from "@/lib/supabaseClient";
import type { FacilityType, FacilityWithType } from "@/types/domain";

interface FacilityDetailPanelProps {
  /** null이면 새로 만들기 */
  facility: FacilityWithType | null;
  facilityTypes: FacilityType[];
  boundaries: CampusBoundaryCollection | null;
  boundariesError: boolean;
  onDraftChange: (draft: DetailDraftPin) => void;
  /** 다시 받기가 끝난 뒤 돌아온다 */
  onSaved: (facilityId: string, created: boolean) => Promise<void>;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onClose: () => void;
  showToast: (message: string, type?: string) => void;
}

export default function FacilityDetailPanel({
  facility,
  facilityTypes,
  boundaries,
  boundariesError,
  onDraftChange,
  onSaved,
  onChanged,
  onDeleted,
  onClose,
  showToast,
}: FacilityDetailPanelProps) {
  const owner = facility?.id ?? "new";
  const [form, setForm] = useState(() => facilityFormFromRow(facility));
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [retranslating, setRetranslating] = useState(false);
  const [locating, setLocating] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const locateRequestRef = useRef(0);
  const onDraftChangeRef = useRef(onDraftChange);
  const fieldId = useId();
  const busy = saving || installing;

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  // 지도(형제 컴포넌트)가 초안 핀을 그리고 옮기도록 맡긴다
  useEffect(() => {
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    onDraftChangeRef.current({
      owner,
      position:
        Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null,
      setPosition: ([nextLat, nextLng]) =>
        setForm((previous) => ({
          ...previous,
          lat: nextLat.toFixed(7),
          lng: nextLng.toFixed(7),
        })),
      saving,
    });
  }, [owner, form.lat, form.lng, saving]);

  // 패널이 바뀐 뒤 도착한 현재 위치는 버린다(설계 2026-10-14 3.5)
  useEffect(
    () => () => {
      locateRequestRef.current += 1;
    },
    [],
  );

  const lat = parseFloat(form.lat);
  const lng = parseFloat(form.lng);
  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  const campus = hasPosition
    ? inferCampusFromPoint([lng, lat], boundaries)
    : null;
  const campusText = !hasPosition
    ? "지도를 눌러 위치를 찍어 주세요"
    : !boundaries && !boundariesError
      ? "캠퍼스 영역 확인 중..."
      : campus
        ? `${campus} 영역 · 지도에서 핀 이동`
        : boundariesError
          ? "캠퍼스 영역을 확인하지 못했습니다. 저장은 가능합니다."
          : "캠퍼스 영역 밖입니다. 인접 지역 시설이라면 그대로 저장할 수 있습니다.";
  const installed = facility ? facility.is_installed : form.is_installed;
  const code =
    facility?.facility_types?.code ??
    facility?.facility_code ??
    form.facility_code;

  function locate() {
    if (!navigator.geolocation) {
      showToast("현재 위치를 사용할 수 없는 브라우저입니다.", "error");
      return;
    }
    locateRequestRef.current += 1;
    const request = locateRequestRef.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (request !== locateRequestRef.current) return;
        setLocating(false);
        setForm((previous) => ({
          ...previous,
          lat: coords.latitude.toFixed(7),
          lng: coords.longitude.toFixed(7),
        }));
        showToast("현재 위치를 지도에 표시했어요.");
      },
      () => {
        if (request !== locateRequestRef.current) return;
        setLocating(false);
        showToast("위치 권한을 확인해 주세요.", "error");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function saveInstalled(target: FacilityWithType, next: boolean) {
    if (target.is_installed === next) return;
    setInstalling(true);
    const { error } = await supabase
      .from("building_facilities")
      .update({ is_installed: next })
      .eq("id", target.id);
    if (error) {
      setInstalling(false);
      showToast("설치 상태 변경에 실패했어요", "error");
      return;
    }
    await authedFetch("/api/revalidate-facilities", { method: "POST" }).catch(
      () => {},
    );
    await onChanged();
    setInstalling(false);
    showToast(next ? "설치로 변경되었어요" : "미설치로 변경되었어요");
  }

  function chooseInstalled(next: boolean) {
    if (facility) {
      void saveInstalled(facility, next);
      return;
    }
    setForm((previous) => ({ ...previous, is_installed: next }));
  }

  async function retranslate(facilityId: string) {
    setRetranslating(true);
    const translated = await translateFacility(facilityId);
    if (translated) {
      await onChanged();
      showToast("시설 번역을 완료했어요");
    } else {
      showToast("자동 번역에 다시 실패했어요", "warning");
    }
    setRetranslating(false);
  }

  async function remove() {
    if (!facility) return;
    const error = await deleteFacility(facility);
    if (error) {
      showToast(error, "error");
      return;
    }
    await onDeleted();
    showToast("시설이 삭제되었어요");
  }

  async function handleSave() {
    const invalid = validateFacilityForm(form, { standalone: true });
    if (invalid) {
      showToast(invalid, "warning");
      return;
    }
    // 저장 요청에 실린 좌표와 화면의 핀이 갈라지지 않게 늦은 현재 위치를 버린다(설계 2026-10-14 3.5)
    locateRequestRef.current += 1;
    setLocating(false);
    setSaving(true);
    const created = facility === null;
    const result = await saveFacility(
      facility?.id ?? null,
      buildFacilityPayload(form, {
        buildingId: null,
        includeInstalled: created,
      }),
    );
    if (result.status === "failed") {
      setSaving(false);
      showToast("저장에 실패했어요", "error");
      return;
    }
    await onSaved(result.facilityId, created);
    setSaving(false);
    if (!result.translated) {
      showToast(
        "시설은 저장했지만 자동 번역에 실패했어요. 상세에서 재번역해 주세요.",
        "warning",
      );
      return;
    }
    showToast(created ? "시설이 추가되었어요!" : "시설이 수정되었어요!");
  }

  return (
    <DetailPanel
      label={facility ? facilityDisplayName(facility) : "시설 추가"}
      header={
        <div className="ku-detail-title">
          <span
            className="ku-detail-title-icon"
            style={{ background: getFacilityMarkerColor(code ?? "") }}
            aria-hidden="true"
          >
            <FacilityTypeIcon code={code} size={20} />
          </span>
          <div>
            <h2>{facility ? facilityDisplayName(facility) : "시설 추가"}</h2>
            <p>
              {facility
                ? `${facility.facility_types?.label ?? "유형 없음"} · ${formatAdminUpdatedAt(facility.updated_at)}`
                : "지도를 눌러 위치를 찍어요"}
            </p>
          </div>
        </div>
      }
      onClose={onClose}
      closeDisabled={saving}
      remove={
        facility
          ? {
              confirmMessage: "삭제한 시설은 복구할 수 없어요.",
              disabled: busy,
              onConfirm: remove,
            }
          : undefined
      }
      save={{
        pending: saving,
        disabled: installing,
        onClick: () => void handleSave(),
      }}
    >
      <div className="ku-detail-status-row">
        <div className="ku-segment" role="group" aria-label="설치 상태">
          <button
            type="button"
            data-tone="installed"
            aria-pressed={installed === true}
            disabled={busy}
            onClick={() => chooseInstalled(true)}
          >
            설치
          </button>
          <button
            type="button"
            data-tone="missing"
            aria-pressed={installed === false}
            disabled={busy}
            onClick={() => chooseInstalled(false)}
          >
            미설치
          </button>
        </div>
        {facility &&
          (facilityNeedsTranslation(facility) ? (
            <span className="ku-translation-pill">
              {facility.translation_status === "pending"
                ? "영문·중문 번역 대기"
                : "영문·중문 번역 필요"}
              <button
                type="button"
                onClick={() => void retranslate(facility.id)}
                disabled={retranslating || saving}
              >
                {retranslating ? "번역 중..." : "재번역"}
              </button>
            </span>
          ) : (
            <span className="ku-translation-done">✓ 영문·중문 번역 완료</span>
          ))}
      </div>

      <div className="ku-detail-form">
        <FacilityFields
          idPrefix={fieldId}
          value={form}
          onChange={setForm}
          facilityTypes={facilityTypes.map((type) => ({
            code: type.code,
            label: type.label ?? type.code,
          }))}
          labels={ADMIN_FACILITY_FIELD_LABELS}
          mapCenter={DEFAULT_WORKSPACE_VIEWPORT.center}
          showFloor={false}
          showInstalled={false}
          showLocation={false}
          disabled={saving}
        />
      </div>

      <div className="ku-detail-location">
        <span className="ku-detail-label">위치 *</span>
        {hasPosition && (
          <span className="ku-detail-coords">
            {form.lat}, {form.lng}
          </span>
        )}
        <span
          className="ku-detail-campus"
          data-tone={campus ? "ok" : "warn"}
          aria-live="polite"
        >
          {campusText}
        </span>
        <button
          type="button"
          className="ku-workspace-button"
          onClick={locate}
          disabled={saving || locating}
        >
          <span aria-hidden="true">📍</span>{" "}
          {locating ? "위치 찾는 중..." : "현 위치로 찍기"}
        </button>
      </div>

      <div className="ku-detail-media">
        <div>
          <span className="ku-detail-label">
            사진 {facility?.facility_photos?.length ?? 0}장
          </span>
          {facility ? (
            <FacilityPhotoManager
              facilityId={facility.id}
              photos={facility.facility_photos ?? []}
              onChanged={onChanged}
              showToast={showToast}
            />
          ) : (
            <button type="button" className="ku-detail-dashed" disabled>
              ＋ 사진 추가
            </button>
          )}
        </div>
        <div>
          <span className="ku-detail-label">동영상</span>
          {facility?.video_url ? (
            <div className="ku-detail-video">
              <span className="ku-detail-video-thumb" aria-hidden="true">
                ▶
              </span>
              <span>연결됨</span>
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                disabled={saving}
              >
                교체
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ku-detail-dashed"
              onClick={() => setVideoOpen(true)}
              disabled={!facility || saving}
            >
              ＋ 동영상 연결
            </button>
          )}
        </div>
      </div>
      {!facility && (
        <p className="ku-detail-hint">
          사진과 동영상은 저장한 뒤에 올릴 수 있어요
        </p>
      )}
      {videoOpen && facility && (
        <FacilityVideoModal
          facility={facility}
          onUpdate={onChanged}
          showToast={showToast}
          onClose={() => setVideoOpen(false)}
        />
      )}
    </DetailPanel>
  );
}
```

- [ ] **Step 6: 페이지에 상세 패널을 잇는다**

`src/app/admin/dashboard/facilities/page.tsx` 전체를 다음으로 바꾼다. Task 7 판과 다른 곳은 상세 패널(import, `draft`·`activeDraft`·`saving`, `requestSelection`의 잠금, `handleSaved`·`handleDeleted`, `detail`, 지도의 `draft`)이다.

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";
import FacilityDetailPanel from "@/components/admin/facilities/FacilityDetailPanel";
import FacilityListRow from "@/components/admin/facilities/FacilityListRow";
import AdminMapWorkspace from "@/components/admin/workspace/AdminMapWorkspace";
import WorkspaceListPanel from "@/components/admin/workspace/WorkspaceListPanel";
import {
  ADMIN_MOBILE_QUERY,
  type DetailDraftPin,
  type WorkspaceFocus,
} from "@/components/admin/workspace/types";
import { useAdminCollection } from "@/components/admin/workspace/useAdminCollection";
import {
  applyWorkspaceState,
  useWorkspaceSelection,
} from "@/components/admin/workspace/useWorkspaceSelection";
import { getFacilityMarkerColor } from "@/components/map/facilityColors";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  pageOfItem,
  viewAdminCollection,
  type AdminChip,
} from "@/lib/adminCollection";
import {
  FACILITY_CHIPS,
  FACILITY_COLLECTION_POLICY,
  type FacilityChip,
} from "@/lib/facilityWorkspace";
import { supabase } from "@/lib/supabaseClient";
import { useCampusBoundaries } from "@/lib/useCampusBoundaries";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { readWorkspaceState, type WorkspaceState } from "@/lib/workspaceUrl";
import type { FacilityType, FacilityWithType } from "@/types/domain";

const FacilityWorkspaceMap = dynamic(
  () => import("@/components/admin/facilities/FacilityWorkspaceMap"),
  { ssr: false },
);

// 상세 패널의 사진 칸이 쓴다. created_at은 업로드 순서 정렬에 필요하다.
const FACILITY_SELECT =
  "*, facility_types(code, label), facility_photos(id, storage_path, sort_order, created_at)";
const NOT_FOUND_MESSAGE = "시설을 찾지 못했어요. 삭제됐거나 주소가 틀렸어요.";

function currentSelection() {
  return readWorkspaceState(window.location.search, { allowEdit: false });
}

export default function StandaloneFacilitiesPage() {
  const [facilities, setFacilities] = useState<FacilityWithType[]>([]);
  const [facilityTypes, setFacilityTypes] = useState<FacilityType[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [typesFailed, setTypesFailed] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [draft, setDraft] = useState<DetailDraftPin | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const loadRequestRef = useRef(0);
  const loadedRef = useRef(false);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const { boundaries, error: boundariesError } = useCampusBoundaries();
  const { state, request } = useWorkspaceSelection({ allowEdit: false });
  const collection = useAdminCollection(
    facilities,
    FACILITY_COLLECTION_POLICY,
    typeFilter === "all"
      ? undefined
      : (facility) => facility.facility_code === typeFilter,
  );
  const { view, setPage } = collection;
  const selected =
    state.mode === "view"
      ? (facilities.find((facility) => facility.id === state.id) ?? null)
      : null;
  const panelKey =
    state.mode === "view" ? state.id : state.mode === "new" ? "new" : null;
  const activeDraft = draft && draft.owner === panelKey ? draft : null;
  const saving = activeDraft?.saving ?? false;

  function showToast(message: string, type = "success") {
    setToast({ message, type });
  }

  const loadTypes = useCallback(async () => {
    const { data, error } = await supabase.from("facility_types").select("*");
    setTypesFailed(Boolean(error));
    if (!error) setFacilityTypes(data ?? []);
  }, []);

  const loadFacilities = useCallback(async () => {
    loadRequestRef.current += 1;
    const ticket = loadRequestRef.current;
    const { data, error } = await supabase
      .from("building_facilities")
      .select(FACILITY_SELECT)
      .is("building_id", null)
      .order("id", { ascending: true });
    // 저장·설치 변경 뒤의 다시 받기가 겹치면 마지막 요청만 그린다
    if (ticket !== loadRequestRef.current) return null;
    if (error) {
      if (loadedRef.current) {
        setToast({
          message: "시설 목록을 새로 불러오지 못했어요",
          type: "error",
        });
      } else {
        setStatus("error");
      }
      return null;
    }
    const rows: FacilityWithType[] = data ?? [];
    loadedRef.current = true;
    setFacilities(rows);
    setStatus("ready");
    // 존재 검사는 조회가 끝난 뒤에만 한다. 조회 전 빈 목록으로 판정하면 맞는 링크도 닫힌다(설계 2026-10-14 3.4)
    const selection = currentSelection();
    if (
      selection.mode === "view" &&
      !rows.some((row) => row.id === selection.id)
    ) {
      applyWorkspaceState({ mode: "closed" });
      setToast({ message: NOT_FOUND_MESSAGE, type: "warning" });
    }
    return rows;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      void loadTypes();
      const rows = await loadFacilities();
      const selection = currentSelection();
      if (!rows || selection.mode !== "view") return;
      // ?id=로 들어오면 그 항목이 있는 페이지를 연다
      const page = pageOfItem(
        viewAdminCollection(
          rows,
          FACILITY_COLLECTION_POLICY,
          INITIAL_ADMIN_COLLECTION_QUERY,
        ).matched,
        selection.id,
        FACILITY_COLLECTION_POLICY.id,
      );
      if (page !== null) setPage(page);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadFacilities, loadTypes, setPage]);

  // 저장 중에는 선택을 바꾸지 않는다 — 행·마커·닫기·칩을 막는다(설계 2026-10-14 3.4)
  function requestSelection(next: WorkspaceState, alsoApply?: () => void) {
    if (saving) return;
    request(next, alsoApply);
  }

  // 칩·검색·정렬·유형·페이지를 바꾸면 선택을 푼다(설계 2026-10-14 3.3)
  function clearSelectionThen(change: () => void) {
    requestSelection({ mode: "closed" }, change);
  }

  function select(id: string) {
    if (!mobile && state.mode === "view" && state.id === id) {
      requestSelection({ mode: "closed" });
      return;
    }
    const page = collection.pageOf(id);
    requestSelection({ mode: "view", id }, () => {
      if (page !== null) setPage(page);
    });
  }

  async function handleChanged() {
    await loadFacilities();
  }

  async function handleSaved(facilityId: string, created: boolean) {
    await loadFacilities();
    // 늦게 끝난 저장이 그사이 바뀐 화면을 덮지 않게, 아직 그 새로 만들기 패널일 때만 바꾼다(설계 2026-10-14 3.4)
    if (created && currentSelection().mode === "new") {
      applyWorkspaceState({ mode: "view", id: facilityId });
    }
  }

  async function handleDeleted() {
    applyWorkspaceState({ mode: "closed" });
    await loadFacilities();
  }

  function retry() {
    setStatus("loading");
    void loadTypes();
    void loadFacilities();
  }

  const focus: WorkspaceFocus | null =
    selected && selected.lat != null && selected.lng != null
      ? {
          key: selected.id,
          target: { point: [selected.lat, selected.lng] },
        }
      : null;

  const chips = [
    { key: "all", label: "전체", count: view.chipCounts.all },
    ...FACILITY_CHIPS.map((chip) => ({
      ...chip,
      count: view.chipCounts[chip.key],
    })),
  ];

  const panelProps = {
    facilityTypes,
    boundaries,
    boundariesError,
    onDraftChange: setDraft,
    onSaved: handleSaved,
    onChanged: handleChanged,
    onDeleted: handleDeleted,
    onClose: () => requestSelection({ mode: "closed" }),
    showToast,
  };
  const detail =
    state.mode === "new" ? (
      <FacilityDetailPanel key="new" facility={null} {...panelProps} />
    ) : selected ? (
      <FacilityDetailPanel
        key={selected.id}
        facility={selected}
        {...panelProps}
      />
    ) : null;

  return (
    <>
      <AdminMapWorkspace
        focus={focus}
        renderMap={(slot) => (
          <FacilityWorkspaceMap
            {...slot}
            facilities={view.matched}
            selected={selected}
            creating={state.mode === "new"}
            draft={activeDraft}
            onSelect={select}
          />
        )}
        list={
          <WorkspaceListPanel
            title="독립 시설"
            caption={`건물에 속하지 않는 야외 경사로, 주차구역 등 · 총 ${view.total}개`}
            addLabel="＋ 시설 추가"
            onAdd={() => requestSelection({ mode: "new" })}
            searchValue={collection.search}
            onSearchChange={(value) =>
              clearSelectionThen(() => collection.setSearch(value))
            }
            searchLabel="독립 시설 검색"
            searchPlaceholder="시설명 또는 설명 검색"
            filters={
              <select
                value={typeFilter}
                onChange={(event) => {
                  const next = event.target.value;
                  clearSelectionThen(() => {
                    setTypeFilter(next);
                    setPage(1);
                  });
                }}
                aria-label="시설 유형 필터"
              >
                <option value="all">모든 유형</option>
                {facilityTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.label}
                  </option>
                ))}
              </select>
            }
            chips={chips}
            activeChip={collection.chip}
            onChipChange={(key) =>
              clearSelectionThen(() =>
                collection.setChip(key as AdminChip<FacilityChip>),
              )
            }
            sort={collection.sort}
            onSortChange={(sort) =>
              clearSelectionThen(() => collection.setSort(sort))
            }
            sortLabel="독립 시설 정렬"
            status={typesFailed ? "error" : status}
            errorMessage="시설 목록을 불러오지 못했어요."
            onRetry={retry}
            matchedCount={view.matched.length}
            page={view.page}
            onPageChange={(page) => clearSelectionThen(() => setPage(page))}
            legend={facilityTypes.map((type) => ({
              label: type.label ?? type.code,
              color: getFacilityMarkerColor(type.code),
            }))}
          >
            {view.pageItems.map((facility) => (
              <FacilityListRow
                key={facility.id}
                facility={facility}
                selected={facility.id === selected?.id}
                onSelect={() => select(facility.id)}
              />
            ))}
          </WorkspaceListPanel>
        }
        detail={detail}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 7: 상세 패널 CSS를 더한다**

`src/app/admin/admin-ui.css`의 Task 7 절 뒤(파일 끝)에 붙인다.

```css
.ku-detail-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  width: 460px;
  overflow: hidden;
  border-radius: 14px;
  background: var(--ku-surface);
  box-shadow: 0 4px 20px rgba(28, 25, 23, 0.14);
}
.ku-detail-panel-head {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 20px 0;
}
.ku-detail-panel-head > :first-child {
  flex: 1;
  min-width: 0;
}
.ku-detail-panel-close {
  flex: none;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  color: var(--ku-text-3);
  background: none;
  cursor: pointer;
  font-size: 18px;
}
.ku-detail-panel-close:hover:not(:disabled) {
  background: var(--ku-bg);
}
.ku-detail-panel-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  padding: 18px 20px;
  overflow: auto;
}
.ku-detail-panel-foot {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--ku-divider);
}
.ku-detail-panel-spacer {
  flex: 1;
}
.ku-detail-panel-foot .ku-workspace-primary {
  height: 36px;
  padding: 0 18px;
  font-size: 13px;
  font-weight: 700;
}
.ku-detail-remove {
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  color: var(--ku-danger);
  background: none;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 600;
}
.ku-detail-remove:hover:not(:disabled) {
  background: var(--ku-status-missing-bg);
}
.ku-detail-remove-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--ku-status-missing-fg);
  font-size: 12.5px;
  font-weight: 600;
}
/* 다크에서도 흰 글자 대비를 지키려고 토큰(--ku-danger)이 아닌 값으로 채운다(설계 2026-10-14 2.4와 같은 이유) */
.ku-workspace-button--danger {
  border-color: #dc2626;
  color: #fff;
  background: #dc2626;
}
.ku-detail-title {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.ku-detail-title-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  color: #fff;
}
.ku-detail-title h2 {
  font-size: 17px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.ku-detail-title p {
  margin-top: 3px;
  color: var(--ku-text-3);
  font-size: 12px;
}
.ku-detail-status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.ku-segment {
  display: inline-flex;
  padding: 3px;
  border-radius: 9px;
  background: var(--ku-divider);
}
.ku-segment button {
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 7px;
  color: var(--ku-text-3);
  background: transparent;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 700;
}
.ku-segment button[aria-pressed="true"] {
  background: var(--ku-surface);
  box-shadow: 0 1px 3px rgba(28, 25, 23, 0.12);
}
.ku-segment button[aria-pressed="true"][data-tone="installed"] {
  color: var(--ku-success-fg);
}
.ku-segment button[aria-pressed="true"][data-tone="missing"] {
  color: var(--ku-status-missing-fg);
}
.ku-segment button:disabled {
  cursor: wait;
  opacity: 0.65;
}
.ku-translation-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding: 4px 4px 4px 10px;
  border: 1px solid
    color-mix(in srgb, var(--ku-status-warn-fg) 35%, transparent);
  border-radius: 999px;
  color: var(--ku-status-warn-fg);
  background: var(--ku-status-warn-bg);
  font-size: 12px;
  font-weight: 600;
}
.ku-translation-pill button {
  height: 24px;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  color: var(--ku-surface);
  background: var(--ku-status-warn-fg);
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 700;
}
.ku-translation-pill button:disabled {
  cursor: wait;
  opacity: 0.65;
}
.ku-translation-done {
  margin-left: auto;
  color: var(--ku-success-fg);
  font-size: 12px;
  font-weight: 600;
}
/* FacilityFields는 공개 등록 요청 모달·검토 모달과 같이 쓰는 인라인 스타일이라 패널 값으로 덮는다.
   포커스 테두리는 덮기 규칙과 특이도가 같아 따로 되살린다. */
.ku-detail-form label {
  color: var(--ku-text-2) !important;
  font-weight: 600;
}
.ku-detail-form input,
.ku-detail-form select,
.ku-detail-form textarea {
  min-height: 40px;
  padding: 0 11px !important;
  border: 1px solid var(--ku-border-input) !important;
  border-radius: 8px !important;
  color: var(--ku-text-1);
  background: var(--ku-surface);
  font-size: 14px !important;
}
.ku-detail-form input:focus-visible,
.ku-detail-form select:focus-visible,
.ku-detail-form textarea:focus-visible {
  border-color: var(--ku-crimson-700) !important;
}
.ku-detail-label {
  display: block;
  margin-bottom: 6px;
  color: var(--ku-text-2);
  font-size: 12px;
  font-weight: 600;
}
.ku-detail-location {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.ku-detail-location .ku-detail-label {
  margin-bottom: 0;
}
.ku-detail-coords {
  color: var(--ku-text-2);
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12.5px;
}
.ku-detail-campus {
  font-size: 12.5px;
  font-weight: 600;
}
.ku-detail-campus[data-tone="ok"] {
  color: var(--ku-success-fg);
}
.ku-detail-campus[data-tone="warn"] {
  color: var(--ku-status-warn-fg);
}
.ku-detail-location .ku-workspace-button {
  margin-top: 6px;
}
.ku-detail-media {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}
.ku-detail-panel .ku-facility-photo-manager {
  justify-content: flex-start;
}
.ku-detail-panel .ku-facility-photo-manager-item img,
.ku-detail-panel .ku-facility-photo-manager-add {
  width: 58px;
  height: 58px;
  border-radius: 7px;
}
.ku-detail-dashed {
  width: 100%;
  height: 58px;
  border: 1.5px dashed var(--ku-border-input);
  border-radius: 8px;
  color: var(--ku-text-2);
  background: var(--ku-surface);
  cursor: pointer;
  font-size: 12.5px;
}
.ku-detail-dashed:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.ku-detail-video {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 58px;
  padding: 0 12px;
  border: 1px solid var(--ku-border);
  border-radius: 8px;
  color: var(--ku-text-1);
  font-size: 12.5px;
}
.ku-detail-video > span:nth-child(2) {
  flex: 1;
}
.ku-detail-video-thumb {
  display: grid;
  place-items: center;
  width: 38px;
  height: 28px;
  border-radius: 5px;
  color: #fff;
  background: #1c1917;
  font-size: 10px;
}
.ku-detail-video button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--ku-border-input);
  border-radius: 7px;
  color: var(--ku-text-1);
  background: var(--ku-surface);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.ku-detail-hint {
  color: var(--ku-text-3);
  font-size: 12px;
}
```

- [ ] **Step 8: 커밋·푸시하고 통과를 확인한다**

```bash
git add src/components src/app/admin/dashboard/facilities/page.tsx src/app/admin/admin-ui.css
git commit -m "feat(facilities-workspace): 독립 시설 상세 패널에서 설치·번역·폼·위치·미디어·삭제를 다룬다"
git push
```

Expected: 전 잡 통과. `admin-inbox.spec.ts`(검토 모달이 `FacilityFields`를 쓴다)와 `facility-request.spec.ts`(공개 요청 모달)도 그대로 통과해야 한다.

- [ ] **Step 9: 프리뷰로 상세 패널을 핸드오버와 대조한다**

Task 7 Step 16과 같은 방법으로 상세 패널(헤더·세그먼트·번역 알약·폼·위치·미디어·하단 바·인라인 삭제 확인)을 대조한다. 동영상·사진 삭제 확인 모달이 헤더 위로 덮이는지(패널 안에 갇히지 않는지) 본다.

---

### Task 9: 저장 안 한 변경 가드

**Files:**

- Create: `src/components/admin/UnsavedChangesGuard.tsx`
- Modify(전체 교체): `src/app/admin/dashboard/layout.tsx`
- Modify: `src/components/admin/workspace/useWorkspaceSelection.ts`
- Modify: `src/components/admin/facilities/FacilityDetailPanel.tsx`
- Modify: `docs/specs/2026-10-14-admin-map-first-redesign-design.md`(3.4, 10장)
- Test: `e2e/admin-facilities-workspace.spec.ts`

**Interfaces:**

- Consumes: `facilityFormDirty`(Task 5), `applyWorkspaceState`(Task 7), `ConfirmModal`.
- Produces(PR ②·③도 쓴다):
  - `<UnsavedChangesProvider>` — 대시보드 레이아웃에 하나
  - `useUnsavedChanges(dirty: boolean): void` — 초안 주인이 dirty를 등록한다
  - `useUnsavedChangesGuard(): { dirty: boolean; guard: (action: () => void) => void }` — 이동 전에 묻는다. 제공자 밖에서는 바로 실행한다

- [ ] **Step 1: 가드 E2E를 쓴다**

`e2e/admin-facilities-workspace.spec.ts` 파일 끝에 더한다.

```ts
test.describe("독립 시설 작업 화면 — 저장 안 한 변경", () => {
  const LEAVE_TITLE = "저장하지 않은 변경사항이 있어요";

  async function editName(page: Page) {
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");
    await detail.getByLabel("시설 이름 (선택)").fill("고치는 중");
    return detail;
  }

  test("다른 항목을 고르기 전에 묻고, 취소하면 입력이 남는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const detail = await editName(page);

    await listRow(page, "공사 중 주차구역").click();
    const confirm = page.getByRole("dialog", { name: LEAVE_TITLE });
    await expect(confirm).toContainText("지금 나가면 입력한 값이 사라져요");
    await confirm.getByRole("button", { name: "취소" }).click();
    await expect(detail.getByLabel("시설 이름 (선택)")).toHaveValue(
      "고치는 중",
    );
    await expect(page).toHaveURL(/\?id=f-installed$/);

    await listRow(page, "공사 중 주차구역").click();
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(detailPanel(page, "공사 중 주차구역")).toBeVisible();
    await expect(page).toHaveURL(/\?id=f-uninstalled$/);
  });

  test("칩을 바꾸기 전에도 묻는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await editName(page);
    const chip = listPanel(page).getByRole("button", { name: "미설치 1개" });

    await chip.click();
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);
  });

  test("헤더 메뉴로 나가기 전에 묻는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await editName(page);
    const landmarks = page
      .getByRole("navigation", { name: "관리자 메뉴" })
      .getByRole("link", { name: "명소" });

    await landmarks.click();
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "취소" })
      .click();
    await expect(page).toHaveURL(
      /\/admin\/dashboard\/facilities\?id=f-installed$/,
    );

    await landmarks.click();
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
  });

  test("브라우저 뒤로가기 전에 묻는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    await page
      .getByRole("navigation", { name: "관리자 메뉴" })
      .getByRole("link", { name: "독립 시설" })
      .click();
    const detail = await editName(page);

    await page.evaluate(() => window.history.back());
    const confirm = page.getByRole("dialog", { name: LEAVE_TITLE });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "취소" }).click();
    await expect(page).toHaveURL(
      /\/admin\/dashboard\/facilities\?id=f-installed$/,
    );
    await expect(detail.getByLabel("시설 이름 (선택)")).toHaveValue(
      "고치는 중",
    );

    await page.evaluate(() => window.history.back());
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/buildings$/);
  });
});
```

- [ ] **Step 2: 테스트만 커밋·푸시하고 실패를 확인한다**

```bash
git add e2e/admin-facilities-workspace.spec.ts
git commit -m "test(unsaved-changes): 저장 안 한 변경이 있을 때 이동·메뉴·뒤로가기 확인을 테스트로 먼저 적는다"
git push
```

Expected: 확인 창이 뜨지 않아 네 시나리오가 실패한다.

- [ ] **Step 3: 가드를 만든다**

`src/components/admin/UnsavedChangesGuard.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ConfirmModal from "@/components/ConfirmModal";

interface UnsavedChangesContextValue {
  dirty: boolean;
  setDirty: (key: symbol, dirty: boolean) => void;
  guard: (action: () => void) => void;
}

// 제공자 밖(건물 상세 등)에서는 묻지 않고 바로 실행한다
const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  dirty: false,
  setDirty: () => {},
  guard: (action) => action(),
});

type PendingLeave = { kind: "action"; action: () => void } | { kind: "back" };

/** 동작과 이유는 docs/specs/2026-10-14-admin-map-first-redesign-design.md 3.4 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlySet<symbol>>(
    () => new Set(),
  );
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const dirty = dirtyKeys.size > 0;
  const dirtyRef = useRef(dirty);
  const trapRef = useRef(false);
  const leavingRef = useRef(false);

  const setDirty = useCallback((key: symbol, next: boolean) => {
    setDirtyKeys((previous) => {
      if (previous.has(key) === next) return previous;
      const updated = new Set(previous);
      if (next) updated.add(key);
      else updated.delete(key);
      return updated;
    });
  }, []);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (!dirty) {
      // 쌓은 기록은 걷어내지 않는다. 다음에 dirty가 되면 새로 쌓는다.
      trapRef.current = false;
      leavingRef.current = false;
      return;
    }
    if (!trapRef.current) {
      // 뒤로가기를 이 기록만 빼는 것으로 바꿔, 화면을 그대로 둔 채 확인 창을 띄운다
      window.history.pushState(null, "", window.location.href);
      trapRef.current = true;
    }
    const warn = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    function handlePopState() {
      if (!trapRef.current || !dirtyRef.current) return;
      trapRef.current = false;
      setPending({ kind: "back" });
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const guard = useCallback((action: () => void) => {
    if (!dirtyRef.current) {
      action();
      return;
    }
    setPending({ kind: "action", action });
  }, []);

  function confirmLeave() {
    const current = pending;
    setPending(null);
    if (current?.kind === "back") {
      // 사이트 밖으로 나가는 뒤로가기라면 beforeunload가 한 번 더 묻지 않게 한다
      leavingRef.current = true;
      window.history.back();
      return;
    }
    current?.action();
  }

  function cancelLeave() {
    if (pending?.kind === "back") {
      window.history.pushState(null, "", window.location.href);
      trapRef.current = true;
    }
    setPending(null);
  }

  return (
    <UnsavedChangesContext.Provider value={{ dirty, setDirty, guard }}>
      {children}
      {pending && (
        <ConfirmModal
          message="저장하지 않은 변경사항이 있어요"
          description="지금 나가면 입력한 값이 사라져요"
          confirmLabel="나가기"
          onConfirm={confirmLeave}
          onCancel={cancelLeave}
        />
      )}
    </UnsavedChangesContext.Provider>
  );
}

/** 초안 상태의 주인(상세 패널)이 dirty를 등록한다. 언마운트하면 풀린다 */
export function useUnsavedChanges(dirty: boolean) {
  const { setDirty } = useContext(UnsavedChangesContext);
  const [key] = useState(() => Symbol("unsaved-changes"));

  useEffect(() => {
    setDirty(key, dirty);
  }, [dirty, key, setDirty]);

  useEffect(() => () => setDirty(key, false), [key, setDirty]);
}

export function useUnsavedChangesGuard() {
  const { dirty, guard } = useContext(UnsavedChangesContext);
  return { dirty, guard };
}
```

`guard`가 `dirtyRef`를 읽는다. React는 새 입력 이벤트를 처리하기 전에 남은 passive effect를 먼저 비우므로, 클릭 때 읽는 값은 직전 렌더의 dirty다.

- [ ] **Step 4: 레이아웃이 가드를 제공하고 헤더 이동이 거친다**

`src/app/admin/dashboard/layout.tsx` 전체를 다음으로 바꾼다. 상태·effect·JSX는 그대로이고, 바뀐 것은 제공자로 감싼 것, 링크의 `onNavigate`, `지도 보기`·로그아웃·메뉴 항목이 `guard`를 거치는 것이다.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import {
  FEEDBACK_EMAILS_FALLBACK,
  getSetting,
  normalizeFeedbackEmails,
} from "@/lib/settings";
import FeedbackEmailModal from "@/components/admin/FeedbackEmailModal";
import {
  UnsavedChangesProvider,
  useUnsavedChangesGuard,
} from "@/components/admin/UnsavedChangesGuard";
import "../admin-ui.css";

const INBOX_HREF = "/admin/dashboard/inbox";
const NAV = [
  { label: "건물", href: "/admin/dashboard/buildings" },
  { label: "독립 시설", href: "/admin/dashboard/facilities" },
  { label: "명소", href: "/admin/dashboard/landmarks" },
  { label: "경사도", href: "/admin/dashboard/slopes" },
  { label: "제보함", href: INBOX_HREF },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UnsavedChangesProvider>
      <DashboardShell>{children}</DashboardShell>
    </UnsavedChangesProvider>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [feedbackEmails, setFeedbackEmails] = useState(
    FEEDBACK_EMAILS_FALLBACK,
  );
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { dirty, guard } = useUnsavedChangesGuard();

  useEffect(() => {
    let cancelled = false;
    getSetting("feedback_emails", FEEDBACK_EMAILS_FALLBACK).then((value) => {
      if (!cancelled) setFeedbackEmails(normalizeFeedbackEmails(value));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCounts() {
      const response = await authedFetch("/api/inbox-counts").catch(() => null);
      if (!response?.ok || cancelled) return;
      const body = (await response.json().catch(() => null)) as {
        requests: number;
        feedback: number;
      } | null;
      if (!body || cancelled) return;
      setInboxCount(body.requests + body.feedback);
    }
    const timer = window.setTimeout(() => void loadCounts(), 0);
    const refresh = () => void loadCounts();
    window.addEventListener("inboxCountsChanged", refresh);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("inboxCountsChanged", refresh);
    };
  }, [pathname]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authenticatedUser } }) => {
      if (!authenticatedUser) {
        router.push("/admin");
        return;
      }
      setUser(authenticatedUser);
      setAuthChecked(true);
    });
  }, [router]);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setUser(null);
    setAuthChecked(false);
    await supabase.auth.signOut();
    router.push("/admin");
  }

  function navigate(href: string) {
    guard(() => router.push(href));
  }

  // Link의 onNavigate는 수정키 클릭(새 탭)·외부 링크에는 불리지 않아 브라우저 기본 동작이 그대로 간다
  function confirmBeforeLink(href: string) {
    return (event: { preventDefault: () => void }) => {
      if (!dirty) return;
      event.preventDefault();
      navigate(href);
    };
  }

  if (!authChecked)
    return <div className="ku-admin-loading">불러오는 중...</div>;

  return (
    <div className="ku-admin-shell">
      <header className="ku-admin-header">
        <Link
          className="ku-admin-brand"
          href="/admin/dashboard/buildings"
          onNavigate={confirmBeforeLink("/admin/dashboard/buildings")}
        >
          <Image src="/favicon.png" alt="고려대학교" width={32} height={32} />
          <span>관리자 콘솔</span>
        </Link>
        <nav className="ku-admin-nav" aria-label="관리자 메뉴">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active}
                onNavigate={confirmBeforeLink(item.href)}
              >
                {item.label}
                {item.href === INBOX_HREF && inboxCount > 0 && (
                  <span className="ku-admin-nav-badge">
                    <span aria-hidden="true">{inboxCount}</span>
                    <span className="ku-sr-only">신규 {inboxCount}건</span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ku-admin-account">
          <span className="ku-admin-email">{user?.email}</span>
          <button
            className="ku-admin-button ku-admin-settings"
            type="button"
            onClick={() => setShowFeedbackModal(true)}
          >
            설정
          </button>
          <button
            className="ku-admin-button ku-admin-map-link"
            type="button"
            onClick={() => navigate("/")}
          >
            지도 보기
          </button>
          <button
            className="ku-admin-button ku-admin-logout"
            type="button"
            onClick={() => guard(() => void handleLogout())}
          >
            로그아웃
          </button>
          <div className="ku-admin-menu" ref={menuRef}>
            <button
              className="ku-admin-button ku-admin-menu-trigger"
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="계정 메뉴"
              ref={menuTriggerRef}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {menuOpen && (
              <div
                className="ku-admin-menu-popover"
                role="menu"
                aria-label="계정 메뉴"
              >
                {user?.email && (
                  <span className="ku-admin-menu-email">{user.email}</span>
                )}
                <button
                  className="ku-admin-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowFeedbackModal(true);
                  }}
                >
                  피드백 이메일 설정
                </button>
                <button
                  className="ku-admin-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/");
                  }}
                >
                  공개 지도 보기
                </button>
                <button
                  className="ku-admin-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    guard(() => void handleLogout());
                  }}
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="ku-admin-content">{children}</main>
      {showFeedbackModal && (
        <FeedbackEmailModal
          initialEmails={feedbackEmails}
          onClose={() => setShowFeedbackModal(false)}
          onSaved={setFeedbackEmails}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: 선택 훅이 가드를 거친다**

`src/components/admin/workspace/useWorkspaceSelection.ts`에 import를 더한다.

```ts
import { useUnsavedChangesGuard } from "@/components/admin/UnsavedChangesGuard";
```

`useWorkspaceSelection`을 다음으로 바꾼다.

```ts
/** URL이 선택의 원본이다. 뒤로가기로 바뀐 URL도 popstate로 따라온다 */
export function useWorkspaceSelection(options: { allowEdit: boolean }) {
  const search = useSyncExternalStore(subscribe, readSearch, readServerSearch);
  const state = readWorkspaceState(search, options);
  const { guard } = useUnsavedChangesGuard();

  // 확인 전에는 선택·페이지·URL 어느 것도 바꾸지 않고, 승인되면 한 번에 적용한다(설계 2026-10-14 3.4)
  function request(next: WorkspaceState, alsoApply?: () => void) {
    guard(() => applyWorkspaceState(next, alsoApply));
  }

  return { state, request };
}
```

- [ ] **Step 6: 상세 패널이 dirty를 등록한다**

`src/components/admin/facilities/FacilityDetailPanel.tsx`에 import를 더한다.

```tsx
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesGuard";
```

`@/lib/facilityWorkspace` import에 `facilityFormDirty`를 더한다. `const busy = saving || installing;` 다음 줄에 더한다.

<!-- prettier-ignore -->
```tsx
  useUnsavedChanges(facilityFormDirty(form, facility));
```

- [ ] **Step 7: 설계 3.4와 10장에 확인 결과를 옮긴다**

설계 3.4 뒤로가기 문단의 마지막 문장

```markdown
Next 16 App Router가 `window.history.pushState`를 라우터와 맞추는지 구현 때 확인한다(10장).
```

을 다음으로 바꾼다.

```markdown
Next 16.2.4는 사용자가 부른 `pushState`·`replaceState`를 라우터와 맞춘다. 지금 기록의 라우터 상태를 새 기록에
복사하고, 그 기록에서 뒤로가기를 하면 같은 트리로 복원해 페이지를 다시 마운트하지도 다시 받지도 않는다(v16.2.4
`app-router.tsx`의 패치된 `pushState`와 `onPopState`, 2026-10-14 확인).
```

같은 절 이동 표 바로 뒤에 한 줄을 더한다.

```markdown
헤더 링크는 `Link`의 `onNavigate`에서 막는다(Next 15.3부터). 수정키 클릭(새 탭)·외부 링크에는 불리지 않아
브라우저 기본 동작이 그대로 간다.
```

10장에서 다음 두 항목을 지운다(결론이 3.4로 옮겨 갔다).

```markdown
- Next 16 App Router가 `window.history.pushState`로 쌓은 기록을 라우터 상태와 맞추는지, 그 기록에서 뒤로가기를 했을
  때 페이지가 다시 마운트되지 않는지(3.4 뒤로가기 확인의 전제). 안 되면 뒤로가기 확인은 빼고 사용자에게 알린다.
- 헤더 링크가 가드를 거치게 하는 방식 — `Link`의 `onClick`에서 막을지, 레이아웃이 가드 문맥을 읽어 이동할지.
```

- [ ] **Step 8: 커밋·푸시하고 통과를 확인한다**

```bash
git add src/components src/app/admin/dashboard/layout.tsx docs/specs/2026-10-14-admin-map-first-redesign-design.md
git commit -m "feat(unsaved-changes): 저장 안 한 변경이 있으면 선택·메뉴·뒤로가기 전에 묻고 새로고침은 브라우저가 경고한다"
git push
```

Expected: 전 잡 통과. `admin-auth.spec.ts`(로그아웃·메뉴)와 `admin-p0.spec.ts`(모바일 계정 메뉴)도 통과해야 한다 — dirty가 없으면 가드는 바로 실행한다.

- [ ] **Step 9: 프리뷰에서 새로고침 경고를 본다**

E2E는 `beforeunload`를 보지 않는다. 프리뷰에서 이름을 고친 채 새로고침·탭 닫기를 해 브라우저 기본 경고가 뜨는지, 저장한 뒤에는 뜨지 않는지 본다.

---

### Task 10: 모바일

**Files:**

- Modify: `src/app/admin/admin-ui.css`(파일 끝에 모바일 절)
- Test: `e2e/admin-facilities-workspace.spec.ts`, `e2e/accessibility-dialog-toast.spec.ts`
- Modify: `docs/specs/2026-10-14-admin-map-first-redesign-design.md`(10장의 safe area 항목, 프리뷰에서 확인한 뒤)

**Interfaces:**

- Consumes: Task 7·8의 모바일 분기(`WorkspaceListPanel`의 `.ku-workspace-mobile-bar`·`.ku-bottom-sheet`, `DetailPanel`의 `.ku-detail-panel-bar`·`.ku-detail-panel-strip`), `AdminMapWorkspace`의 `--ku-map-strip`, Task 2의 `--ku-admin-nav-height`.

- [ ] **Step 1: 모바일 E2E를 쓴다**

`e2e/admin-facilities-workspace.spec.ts` 파일 끝에 더한다.

```ts
test.describe("독립 시설 작업 화면 — 모바일", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("바텀시트에서 행을 누르면 지도 띠를 남긴 전체 화면 상세가 열린다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const sheet = listPanel(page);

    const handle = sheet.getByRole("button", { name: "목록 펼치기" });
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await handle.click();
    await expect(
      sheet.getByRole("button", { name: "목록 접기" }),
    ).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("searchbox", { name: "독립 시설 검색" }).fill("공사");
    await expect(sheet.getByTestId("admin-list-item-name")).toHaveText([
      "공사 중 주차구역",
    ]);
    const row = listRow(page, "공사 중 주차구역");
    const rowBox = await row.boundingBox();
    expect(rowBox!.height).toBeGreaterThanOrEqual(64);
    await row.click();

    const detail = detailPanel(page, "공사 중 주차구역");
    await expect(
      detail.getByRole("heading", { name: "공사 중 주차구역" }),
    ).toBeVisible();
    await expect(sheet).toBeHidden();
    // 상세 위쪽 띠로 작업 화면의 지도가 보인다(설계 2026-10-14 2.5)
    const strip = await detail.locator(".ku-detail-panel-strip").boundingBox();
    expect(strip?.height).toBe(190);

    await detail.getByRole("button", { name: "목록으로" }).click();
    await expect(detail).toHaveCount(0);
    await expect(sheet).toBeVisible();
  });
});
```

`e2e/accessibility-dialog-toast.spec.ts`의 `test.describe` 안 마지막에 Task 7에서 지운 시나리오를 다시 쓴다.

<!-- prettier-ignore -->
```ts
  test("모바일 독립 시설 상세의 버튼이 44px 터치 영역을 확보한다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/dashboard/facilities?id=f-installed");

    const detail = page.getByRole("region", {
      name: "중앙광장 경사로",
      exact: true,
    });
    for (const name of [
      "목록으로",
      "설치",
      "미설치",
      "현 위치로 찍기",
      "삭제",
      "취소",
      "저장",
    ]) {
      const button = detail.getByRole("button", { name, exact: true });
      await expect(button, name).toBeVisible();
      const box = await button.boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.width, name).toBeGreaterThanOrEqual(44);
      expect(box!.height, name).toBeGreaterThanOrEqual(44);
    }
  });
```

- [ ] **Step 2: 테스트만 커밋·푸시하고 실패를 확인한다**

```bash
git add e2e
git commit -m "test(facilities-workspace): 모바일 바텀시트·전체 화면 상세·터치 영역을 테스트로 먼저 적는다"
git push
```

Expected: 모바일 CSS가 없어 띠 높이·터치 영역·시트 숨김 단언이 실패한다.

- [ ] **Step 3: 모바일 CSS를 더한다**

`src/app/admin/admin-ui.css` 파일 끝에 붙인다.

```css
/* 지도 작업 화면 — 모바일(핸드오버 8장). 터치 영역은 44px을 지킨다. */
@media (max-width: 767px) {
  .ku-map-workspace {
    height: calc(
      100dvh - var(--ku-admin-header-height) - var(--ku-admin-nav-height) -
        env(safe-area-inset-bottom)
    );
  }
  .ku-map-workspace .leaflet-control-zoom {
    display: none;
  }
  .ku-map-workspace .leaflet-bottom.leaflet-right {
    bottom: 150px;
  }
  .ku-map-workspace[data-detail-open] .leaflet-bottom.leaflet-right {
    right: 0;
  }
  .ku-workspace-mobile-bar {
    position: absolute;
    top: 12px;
    right: 12px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ku-workspace-mobile-bar .ku-workspace-search input,
  .ku-workspace-mobile-bar .ku-workspace-search-row select {
    height: 46px;
    border-radius: 12px;
    box-shadow: var(--ku-shadow-floating);
    font-size: 16px;
  }
  .ku-workspace-mobile-bar .ku-chip-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .ku-workspace-mobile-bar .ku-chip {
    min-height: 44px;
    box-shadow: var(--ku-shadow-floating);
  }
  .ku-bottom-sheet {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    height: 150px;
    border-radius: 18px 18px 0 0;
    background: var(--ku-surface);
    box-shadow: 0 -6px 24px rgba(28, 25, 23, 0.14);
    transition: height 0.25s ease;
  }
  .ku-bottom-sheet[data-expanded] {
    height: 58%;
  }
  .ku-bottom-sheet-handle {
    display: grid;
    flex: none;
    place-items: center;
    width: 100%;
    min-height: 44px;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .ku-bottom-sheet-handle span {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--ku-border-input);
  }
  .ku-bottom-sheet-head {
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
    padding: 0 16px 10px;
  }
  .ku-bottom-sheet-head h1 {
    font-size: 18px;
    font-weight: 700;
  }
  .ku-bottom-sheet-head [role="status"] {
    flex: 1;
    color: var(--ku-text-3);
    font-size: 12px;
    font-weight: 600;
  }
  .ku-bottom-sheet-head select {
    min-height: 44px;
    border: 0;
    color: var(--ku-text-2);
    background: transparent;
    font-size: 13px;
  }
  .ku-bottom-sheet-head .ku-workspace-primary {
    min-height: 44px;
  }
  .ku-bottom-sheet-list {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .ku-bottom-sheet .ku-workspace-row {
    min-height: 64px;
  }
  .ku-map-workspace[data-detail-open] .ku-bottom-sheet,
  .ku-map-workspace[data-detail-open] .ku-workspace-mobile-bar {
    display: none;
  }

  .ku-detail-panel {
    inset: 0;
    width: auto;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    pointer-events: none;
  }
  .ku-detail-panel > * {
    background: var(--ku-surface);
    pointer-events: auto;
  }
  /* 투명한 띠로 아래 지도가 보이고, 띠를 누르면 지도가 받아 핀을 옮긴다(설계 2026-10-14 2.5) */
  .ku-detail-panel > .ku-detail-panel-strip {
    flex: none;
    height: var(--ku-map-strip);
    background: transparent;
    pointer-events: none;
  }
  .ku-detail-panel-bar {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
    height: 52px;
    padding: 0 6px;
    border-bottom: 1px solid var(--ku-divider);
  }
  .ku-detail-panel-back {
    width: 44px;
    height: 44px;
    border: 0;
    color: var(--ku-text-1);
    background: none;
    cursor: pointer;
    font-size: 26px;
    line-height: 1;
  }
  .ku-detail-panel-bar h2 {
    min-width: 0;
    overflow: hidden;
    font-size: 16px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ku-detail-panel-body {
    padding: 16px 14px;
  }
  .ku-detail-panel-foot {
    padding: 10px 14px;
  }
  .ku-detail-panel-foot .ku-detail-panel-spacer {
    display: none;
  }
  .ku-detail-panel-foot .ku-workspace-button {
    flex: 1;
    height: 50px;
  }
  .ku-detail-panel-foot .ku-workspace-primary {
    flex: 2;
    height: 50px;
  }
  .ku-detail-form input,
  .ku-detail-form select,
  .ku-detail-form textarea {
    min-height: 46px;
    font-size: 16px !important;
  }
  .ku-segment button {
    min-height: 44px;
    padding: 0 18px;
  }
  .ku-workspace-button {
    min-height: 44px;
  }
  .ku-detail-remove {
    align-self: flex-start;
    min-width: 44px;
    min-height: 44px;
  }
  .ku-detail-media {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 4: 커밋·푸시하고 통과를 확인한다**

```bash
git add src/app/admin/admin-ui.css
git commit -m "feat(facilities-workspace): 모바일에서 목록을 바텀시트로, 상세를 지도 띠를 남긴 전체 화면으로 그린다"
git push
```

Expected: 전 잡 통과.

- [ ] **Step 5: 실제 휴대폰으로 프리뷰를 본다**

iPhone(홈 인디케이터가 있는 기종)과 Android에서 프리뷰를 연다: 바텀시트 접힘·펼침, 아래 nav와 시트가 겹치지 않는지, 상세의 지도 띠를 눌러 핀이 옮겨지는지, 하단 `취소`/`저장`이 홈 인디케이터에 가리지 않는지. 겹치면 `--ku-admin-nav-height`·`env(safe-area-inset-bottom)` 계산을 고치고 다시 본다.

확인되면 설계 10장의 `- 바텀시트·상세 전체 화면에서 아래 nav와 safe area 높이` 항목을 지우고, 3.1의 "모바일은 아래 nav와 safe area까지 뺀다." 뒤에 확인한 기종과 날짜를 한 문장으로 붙인다. 커밋한다.

```bash
git add docs/specs/2026-10-14-admin-map-first-redesign-design.md
git commit -m "docs(spec): 모바일 작업 화면 높이가 아래 nav와 safe area를 피하는 것을 기기에서 확인한 결과를 적는다"
git push
```

확인하지 못했으면 10장 항목을 남기고 PR 본문에 적는다.

---

### Task 11: 문서와 마무리

**Files:**

- Modify: `docs/specs/2026-07-20-standalone-facilities-design.md`(머리 배너)
- Modify: `docs/specs/2026-10-14-admin-map-first-redesign-design.md`(10장 redirects 항목)
- Modify: `README.md`
- Delete(병합 때): `docs/plans/2026-10-14-admin-map-first-pr1.md`

- [ ] **Step 1: 독립 시설 설계서에 대체 표시를 단다**

`docs/specs/2026-07-20-standalone-facilities-design.md`의 첫 40줄을 먼저 읽는다(머리 배너가 이미 있으면 그 표에 행을 더한다). `상태: 사용자 승인 완료 (codex 1차 리뷰 반영본)` 줄 다음 빈 줄 뒤에 넣는다. 날짜는 커밋하는 날(`date +%F`)이다.

```markdown
> **<커밋하는 날> — 일부 대체.** "관리자 페이지" 절은 [`2026-10-14-admin-map-first-redesign-design.md`](./2026-10-14-admin-map-first-redesign-design.md)가 대체한다. 본문은 당시 기록으로 둔다.
>
> | 이 문서              | 당시                                                            | 현재                                                                              |
> | -------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
> | 관리자 페이지 — 화면 | 목록 행의 동영상·설치 토글·수정·삭제 버튼 + `AddFacilityButton` | 지도 작업 화면의 목록 패널 + 상세 패널. 행에는 이름·메타·배지만 — 새 문서 4장     |
> | 관리자 페이지 — 수정 | 행의 "수정"이 `FacilityFormModal` 편집 모드를 연다              | 상세 패널에서 고치고 `saveFacility`로 저장. 모달은 건물 상세만 쓴다 — 새 문서 4.2 |
> | 관리자 페이지 — 목록 | `building_id is null` 서버 조회                                 | 같은 조건으로 전체를 받아 검색·칩·정렬·페이지를 클라이언트에서 — 새 문서 2.2·4.1  |
```

`<커밋하는 날>`은 `date +%F`의 출력으로 바꿔 쓴다.

- [ ] **Step 2: 설계 10장에 redirects 확인 결과를 옮긴다**

10장의 `- Next 16의 `redirects()` 문법과 쿼리 문자열이 붙은 목적지 처리 — …` 항목을 지우고, 6.5의 `원래 쿼리가 목적지에 붙어 겹친 조합이 될 수 있다. 우선순위는 3.4가 정한다.` 뒤에 붙인다.

```markdown
Next 16.2.4는 요청 쿼리를 모두 목적지로 넘기고, 같은 키는 목적지 값(`id=:id`, `edit=1`)이 이긴다
(`prepare-destination.ts`의 `{ ...요청 쿼리, ...목적지 쿼리 }`, 2026-10-14 확인). `permanent: false`는 307이다.
```

- [ ] **Step 3: README를 고친다**

1. `## ✨ 주요 기능 … ### 관리자`의 `- 🧩 **독립 시설 관리** — 건물에 속하지 않는 시설 CRUD, 검색·유형·설치여부 필터·정렬`을 다음으로 바꾼다.

   <!-- prettier-ignore -->
   ```markdown
   - 🧩 **독립 시설 지도 작업 화면** — 지도가 화면을 채우고 목록·상세 패널이 떠 있다. 칩(미설치·번역 필요·동영상 없음)·검색·유형·정렬, 마커↔행 양방향 선택과 URL 유지, 지도 클릭·끌기로 위치 편집, 저장 안 한 변경 확인(다른 항목·메뉴·뒤로가기), 모바일 바텀시트
   ```

2. 폴더 구조에서 `facilities/page.tsx           # 독립(건물 미소속) 시설 관리`의 설명을 `# 독립 시설 지도 작업 화면(목록·상세 패널)`으로, `FacilityFormModal.tsx          # 시설 생성/수정`을 `# 건물 상세의 시설 생성/수정`으로 바꾼다. `components/admin/` 아래에 줄을 더한다.

   <!-- prettier-ignore -->
   ```text
      workspace/                     # 지도 작업 화면 공통 — 지도·목록 패널·상세 패널·선택·목록 상태
      facilities/                    # 독립 시설 작업 화면 — 행·마커 레이어·상세 패널
      UnsavedChangesGuard.tsx        # 저장 안 한 변경 확인(이동·메뉴·뒤로가기·새로고침)
   ```

   `lib/` 아래에 줄을 더한다.

   <!-- prettier-ignore -->
   ```text
      workspaceUrl.ts                  # 작업 화면 상태 ↔ URL (?id·?new·?edit)
      adminCollection.ts               # 목록 거르기·정렬·페이지·칩 개수 (순수 함수)
      facilityWorkspace.ts             # 독립 시설 칩 정책·초안 dirty 판정
      facilitySave.ts                  # 시설 직접 저장의 공통 경로
      useMediaQuery.ts                 # 미디어 쿼리 구독
   ```

3. `- 전 목록 서버 페이지네이션 + 검색·필터·정렬`을 `- 목록 페이지네이션 + 검색·필터·정렬 (독립 시설은 전체를 받아 클라이언트에서 거른다)`로, `- 시설 상세 모달 + 상태 배지, 독립 시설 관리, …`의 `독립 시설 관리`를 `독립 시설 지도 작업 화면`으로 바꾼다.
4. E2E 표: `admin-content.spec.ts` 행을 `명소 CRUD·필터·페이지네이션`으로, `admin-campus-boundaries.spec.ts` 행을 지우고, `admin-dark.spec.ts` 행에 `, 크림슨 채움 대비, 독립 시설 상세 패널`을 붙인다. 두 행을 더한다.

   <!-- prettier-ignore -->
   ```markdown
   | `admin-shell.spec.ts`                   | 헤더 높이·버튼, 전역 덮어쓰기 없이 지키는 건물 카드 반경, 관리자 토스트(아래 가운데·반전 색·3초)와 공개 토스트(지금 모양) |
   | `admin-facilities-workspace.spec.ts`    | 독립 시설 칩·검색·유형·정렬, 마커 ↔ 행 선택과 URL, 다른 페이지 마커, 늦은 조회의 `?id=`, 없는 `?id=`, 상세의 설치·재번역·인라인 삭제·동영상, 새로 만들기·번역 실패 분리·캠퍼스 밖 경고, 설치 변경 뒤 폼 저장, 지도 클릭 위치 저장, 저장 안 한 변경 확인(항목·칩·메뉴·뒤로가기), 모바일 바텀시트·전체 화면 상세 |
   ```

5. 개수 문장: 아래 값을 명령과 마지막 CI 로그에서 세어 바꾼다. 눈으로 세지 않는다.
   - E2E spec 수: `ls e2e/*.spec.ts | wc -l` → `e2e/ … (N spec)`, `**Playwright E2E (N개 spec, M개 시나리오)**`, `N개 spec·M개 시나리오`, `Playwright E2E N spec`
   - E2E 시나리오 수 M: 마지막 CI `Test (Playwright)` 로그의 `N passed`
   - 단위 테스트: 마지막 CI `Test (unit)` 로그의 `Test Files  N passed`·`Tests  M passed` → `**Vitest 단위 테스트 (N개 파일, M개 테스트)**`, `Vitest 단위 N파일`
   - 같은 문단의 단위 테스트 주제 나열에 `작업 화면 URL 상태(`workspaceUrl`), 목록 거르기·칩 개수·항목 페이지(`adminCollection`), 독립 시설 칩·초안 비교(`facilityWorkspace`), 시설 저장 공통 경로(`facilitySave`)`를 더한다.

- [ ] **Step 4: 바뀐 이름을 역추적한다**

```bash
rg -n "dashboard/facilities|FacilityFormModal|AddFacilityButton|FacilityInstallationControl|FacilityTranslationControl|AdminListControls|ku-admin-content|admin-campus-boundaries|--ku-primary|2563eb" docs src e2e README.md
```

모든 결과를 (a) 이 PR에서 고쳤다, (b) 날짜가 붙은 기록으로 그 날짜 기준 맞다(대체 배너 아래 본문 포함), (c) 상관없다 중 하나로 나눠 PR 본문에 명령과 함께 적는다. (a)도 (b)도 (c)도 아닌 줄은 고친다. 이 저장소의 이슈·PR 본문에 같은 화면을 서술한 것이 있으면(`gh issue list --search "독립 시설"`, `gh pr list --state all --search "독립 시설"`) 확인한 곳을 함께 적는다.

- [ ] **Step 5: 커밋·푸시하고 전 잡 통과를 확인한다**

```bash
git add README.md docs/specs
git commit -m "docs: 독립 시설 지도 작업 화면을 README와 설계서에 반영하고 옛 관리자 페이지 절에 대체 표시를 단다"
git push
gh pr checks --watch
```

- [ ] **Step 6: 초안을 해제한다**

설계 1장의 PR ① 범위와 이 계획의 태스크를 한 번 대조하고, Task 10 Step 5의 기기 확인 여부와 Task 11 Step 4의 역추적 결과를 PR 본문에 적은 뒤 `gh pr ready`.

- [ ] **Step 7: 병합할 때 계획을 지운다**

병합 직전에 이 문서를 지우는 커밋을 같은 브랜치에 올린다.

```bash
git rm docs/plans/2026-10-14-admin-map-first-pr1.md
git commit -m "docs: 완료된 관리자 지도 우선 리디자인 ① 구현 계획을 은퇴시킨다"
git push
```

PR ②의 계획은 ①이 `main`에 들어간 뒤, ①이 실제로 만든 공통 단위(`AdminMapWorkspace`·`WorkspaceListPanel`·`DetailPanel`·`useWorkspaceSelection`·`useAdminCollection`·`UnsavedChangesGuard`)를 읽고 쓴다.
