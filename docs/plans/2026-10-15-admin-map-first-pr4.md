# 관리자 지도 우선 리디자인 ④ 구현 계획 — 제보함

> **For agentic workers:** 태스크 순서대로 TDD(RED → GREEN → REFACTOR)로 구현한다. 태스크마다 테스트를 먼저 커밋하고, 기대한
> 이유로 실패하는지 본 뒤 구현을 커밋한다. 이 계획은 태스크의 범위·결정·인터페이스·시나리오를 정한다. 옮기는 로직은 지금의
> 제보함 코드(`src/components/admin/inbox/*`)에 있고, 화면 짜임은 PR ①~③이 만든 같은 자리의 코드를 본뜬다.

**Goal:** 제보함 탭을 상태별 3열 보드(신규·확인 중·처리 완료)와 오른쪽 검토 드로어로 바꾼다. 종류 세그먼트(`전체 / 등록 요청 /
피드백`)로 두 목록을 섞거나 나눠 보고, 열마다 `더 보기`로 다음 페이지를 이어 붙인다. 등록 요청 드로어는 지금 검토 모달의 로직을
그대로 옮기고, 피드백 드로어는 상태 세그먼트를 누르면 바로 저장한다. 모바일은 종류 세그먼트 + 상태 칩 + 카드 목록 → 전체 화면
상세다.

**Architecture:** 순수 로직은 `src/lib/`에 둔다 — 보드 상태(세대 번호·이어 붙이기·합치기·중복 제거·다음 카드, `inboxBoard.ts`),
제보함 URL(`inboxUrl.ts`), 등록 요청 검토 초안(`facilityRequestReview.ts`), 피드백 주소의 같은 출처 판정(`inboxBoard.ts`). 조회는
보드 훅(`useInboxBoard`)이 리듀서 하나로 한다. 화면은 `src/components/admin/inbox/`에 새로 짜고 옛 목록·모달·`useInboxList`는
지운다. 제보함은 지도 작업 화면이 아니라 `AdminMapWorkspace`·`useAdminCollection`·`useWorkspaceSelection`을 쓰지 않는다(설계
3.2). 대신 `useUnsavedChanges`·`useWorkspaceCloseRequest`·`useModalFocus`·`Toast`·`FacilityFields`·`FacilityMap`을 쓴다.

**Tech Stack:** Next.js 16.2.4 App Router, React 19.2.4(React Compiler), react-leaflet 5 + Leaflet 1.9, `@supabase/supabase-js` 2.105,
Vitest 3(node 환경), Playwright 1.61(목 백엔드).

**Spec:** `docs/specs/2026-10-14-admin-map-first-redesign-design.md`(이하 "설계 N.N") 7장·2.9·2.11·2.12·3.1·8장. 화면 값의 원본은
`docs/specs/2026-10-14-admin-map-first-handoff/README.md`(이하 "핸드오버") 5·6·7절, 8절의 제보함 모바일, Interactions다. 계획과
설계가 다르면 설계가 맞다 — 멈추고 보고한다. 아래 "계획이 정한 것" 중 설계에 없던 것은 Task 7에서 설계에 옮겨 적는다.

**옮길 로직(지금 main `301f32d`):** `src/app/admin/dashboard/inbox/page.tsx`, `src/components/admin/inbox/FacilityRequestReviewModal.tsx`·
`FeedbackDetailModal.tsx`·`FeedbackList.tsx`·`FacilityRequestList.tsx`·`useInboxList.ts`, `src/lib/inboxStatus.ts`.

**참고 구현(PR ①~③):** 하단 바·인라인 확인·모바일 전체 화면은 `src/components/admin/workspace/DetailPanel.tsx`와 그 CSS, 세그먼트는
`.ku-detail-segment`(`FacilityDetailPanel`의 설치 세그먼트), 칩은 `.ku-chip`(`WorkspaceListPanel`), dirty 등록은
`LandmarkDetailPanel`의 `useUnsavedChanges`, 같은 화면 링크로 닫기는 `useWorkspaceCloseRequest`.

## Global Constraints

- 범위는 설계 1장의 PR ④(설계 7장)다. 독립 시설·명소·경사도·건물 화면의 동작이 바뀌면 안 된다 — 공통 CSS를 고치면
  `admin-facilities-workspace`·`admin-landmarks-workspace`·`admin-slopes-workspace`·`admin-buildings*` spec이 그대로 통과해야 한다.
- API 계약은 바꾸지 않는다. 더하는 것은 등록 요청 목록 항목의 `description` 하나다(결정 3). 상태 변경·승인·거절·정리 API와 그
  조건부 쓰기(설계 2.8)는 그대로 부른다.
- 등록 요청 검토의 지금 동작을 지킨다: 상세 조회 실패 시 안내, 첫 로드·끝 상태 재로드 때만 값 초기화, 볼 수 없는 사진은 선택
  불가, 승인 전 유형 검사, 승인 실패 시 고치던 값 유지(409와 그 밖 실패 모두 상세를 다시 읽음), 승인 뒤 `translateFacility`·
  `/api/revalidate-facilities`, 거절·승인의 `cleanupFailed` 경고, `남은 사진 정리`, 모달을 여는 것만으로 상태를 바꾸지 않음
  (2026-10-08 설계 4.3).
- `?building=`은 등록 요청 API에만 보낸다. 피드백 API는 `building`을 모른다.
- 새 CSS 클래스는 `ku-inbox-*`. 지금 쓰는 `.ku-inbox-status`(상태 알약)·`.ku-detail-segment`·`.ku-chip`은 다시 쓴다. 색은
  `globals.css` 토큰으로 쓴다. 다크 대응을 빠뜨리지 않는다. 드로어 안에 z-index를 새로 두지 않는다 — 드로어 자체의 층은 하나로
  잡고, 드로어 안의 확인은 인라인이라 겹치는 창이 없다.
- 모바일 기준은 `ADMIN_MOBILE_QUERY`(`(max-width: 767px)`)와 `useMediaQuery`다. 모바일 터치 영역은 44px이다.
- React Compiler와 `eslint-config-next`가 켜져 있다. 렌더 중에 ref를 읽거나 쓰지 않는다. effect 안의 동기 `setState`를 새로
  만들지 않는다(지금 `useInboxList`가 `setTimeout(0)`으로 미루는 방식을 따른다).
- vitest는 `environment: "node"`라 컴포넌트·훅을 렌더하지 못한다. 순수 함수·리듀서와 API 라우트만 단위 테스트하고, 화면은
  Playwright로 본다.
- 주석은 이유·외부 제약·위험만 적는다. 다른 파일의 줄 번호·개수·상수 값을 적지 않고 심볼 이름으로 가리킨다.
- 커밋 메시지는 한국어 `type(scope): 내용`. `Co-Authored-By`를 붙이지 않고, 작업 과정(리뷰·점검)을 적지 않는다.
- 이 저장소는 `core.autocrlf=true`다. 파일은 UTF-8로 쓴다. 한글이 깨져 저장되지 않았는지 커밋 전에 확인한다
  (U+FFFD나 `뚯`·`먮`·`꾨`처럼 어색한 음절). 테스트는 깨진 기대값과 깨진 실제값을 비교해 통과하므로 테스트로는 안 잡힌다.

## 검증 방법

로컬에서 한다. GitHub CI 결과를 기다리지 않는다.

```bash
npm run typecheck
npm run test                                       # vitest
npx playwright test e2e/<바꾼 spec>.ts             # 고치는 동안
npx eslint --ignore-pattern ".claude/**" .         # .claude/worktrees가 있으면 npm run lint 대신
npx prettier --check --end-of-line auto --ignore-path .prettierignore --ignore-path .gitignore . "!.claude/**"
npm run test:e2e                                   # 태스크를 마치기 전에 전체
```

- 테스트만 커밋한 상태에서 새 시나리오를 돌려 **기대한 이유로** 실패하는지 본 뒤 구현한다. 모듈이 아직 없어서 typecheck와
  vitest가 함께 실패하는 것은 기대한 실패다.
- Playwright는 포트 3100의 떠 있는 서버를 다시 쓴다. 앞 실행에서 남은 `next dev`가 있으면 끄고 돌린다.
- PR을 열기 전 마지막 확인은 CI와 같은 조건으로 한다: `core.autocrlf=false`로 **짧은 경로**(`C:\Users\dw581\AppData\Local\Temp\ku-ci`)에
  클론해 `npm ci` 뒤 `CI=true`로 lint·format:check·typecheck·test·`test:e2e -- --retries=0`. 깊은 경로는 Turbopack이 geoman CSS
  맵을 쓰다 Windows 경로 길이 제한에 걸린다.

## 브랜치와 PR

`feat/admin-map-first-inbox`(main `301f32d`에서). 계획 커밋부터 마지막 태스크까지 이 브랜치에 쌓고, 로컬 검증을 마친 뒤 한 번 푸시해
PR을 연다. 병합할 때 이 계획 문서를 `git rm`한다. 리디자인의 마지막 PR이다.

## 계획이 정한 것

1. **URL.** 상태는 `tab`(`requests` | `feedback`, 없으면 `전체`)과 `building`(양의 안전 정수) 둘이다. 파라미터 이름 `tab`을 그대로
   써서 옛 `?tab=feedback` 링크가 피드백을 연다. 바꿀 때는 `history.replaceState`, `useSearchParams`는 쓰지 않는다(설계 3.4와 같은
   이유). 자기가 모르는 파라미터는 보존한다 — 지금은 탭을 바꾸면 주소를 통째로 지운다. `building`이 있으면 종류는 `requests`로
   고정하고, 세그먼트의 `전체`·`피드백`은 누를 수 없다(`disabled`). 칩 `건물로 거름 ✕`의 ✕ 버튼 이름은 지금처럼
   `건물 필터 해제`이고, 누르면 `building`만 지운다. 드로어 열림·모바일 상태 칩은 URL에 두지 않는다(설계 7장에 없음, 지금도
   필터는 URL 밖).
2. **보드 상태는 리듀서 하나.** 보드 조회(`load`)마다 세대 번호를 올리고 모든 열·종류를 첫 페이지부터 받는다. 첫 페이지·`더 보기`·
   `다시 시도` 응답은 모두 세대를 싣고, 리듀서는 지금 세대가 아니면 버린다(설계 7.1). 열(`InboxFilter`)마다 종류(`InboxKind`)별
   소스 상태를 따로 둔다. 한 소스가 먼저 끝나도 다른 소스는 이어 받을 수 있고, 한 소스만 실패할 수 있기 때문이다.
   - **누가 요청을 시작하나.** 첫 페이지 요청은 커밋된 `state.generation`을 의존성으로 둔 effect 하나만 시작한다 — 같은 렌더에서
     `reload`가 두 번 불려도 요청은 마지막 세대로 한 벌만 나간다. 요청 함수는 그 effect가 읽은 세대를 클로저로 들고 간다. ref를
     쓰지 않는다. `더 보기`·`다시 시도`는 이벤트 핸들러가 그 렌더의 `state.generation`을 실어 바로 요청한다 — 그 사이 `load`가
     있었으면 응답이 낡은 세대라 버려진다.
   - **옵션이 바뀌면**(열·종류·`building`, 배열 내용 기준) `load`한다. 리듀서 state에 옵션 키를 두고, 키가 다르면 렌더 중에
     `dispatch({ type: "load" })`하는 React 문서의 "이전 렌더 값으로 state 조정" 방식을 쓴다. lint가 막으면 지금 `useInboxList`처럼
     effect 안 `setTimeout(0)`으로 미룬다. 처음 state는 옵션에서 바로 만든다(세대 1, 모든 소스 loading).
   - **같은 세대 안의 중복.** 리듀서는 세대에 더해 기대 페이지도 본다: 첫 페이지 응답은 그 소스가 `status: loading`일 때만,
     다음 페이지 응답은 `more: loading`이고 `page === source.page + 1`일 때만 받는다. `더 보기`를 빠르게 두 번 눌러 같은 페이지
     요청이 두 번 나가도 둘째 응답은 버려진다. `moreRequested`는 이미 `more: loading`이면 state를 바꾸지 않는다.
   - **`더 보기` 실패의 재시도는 `loadMore`가 한다** — `more: error`인 소스에 `loadMore`를 부르면 같은 다음 페이지를 다시 받는다.
     `retryFirstPage`는 첫 페이지가 실패한(`status: error`) 소스만 받는다.
3. **등록 요청 카드의 설명.** 핸드오버 카드 2줄은 설명을 보이는데 목록 항목(`FacilityRequestListItem`)에 `description`이 없다.
   `GET /api/facility-requests` 목록의 select에 `description`을 더하고 타입에 `description: string | null`을 더한다(라우트 테스트
   포함). `countOnly`는 그대로다.
4. **중복 제거의 키는 종류 + id.** 설계 7.1의 "같은 항목 id"는 같은 종류 안의 같은 행이다. 등록 요청과 피드백은 다른 테이블이라
   키를 `${kind}:${id}`로 잡는다. 같은 키가 두 번 오면 먼저 받은 것을 둔다(오프셋 페이지라 사이에 새 접수가 들어오면 다음
   페이지 첫 줄이 앞 페이지 끝 줄과 겹친다).
5. **합치는 순서.** 접수 시각(`created_at`) 내림차순, 같으면 종류(`requests` 먼저), 같으면 id 오름차순. 두 API가 각자
   `created_at DESC, id ASC`로 주므로 같은 종류 안에서는 서버 순서와 같다.
6. **열의 표시.** 열 헤더 개수는 보이는 종류의 `total` 합이고, 보이는 소스가 하나라도 `ready`가 아니면(받는 중·실패) 숫자를
   그리지 않는다(`columnCount`가 `null`) — 절반만 받은 합을 완전한 개수처럼 보이지 않는다(설계 7.1). `더 보기`는
   보이는 종류 중 다음 페이지가 남은 소스(`page * ADMIN_PAGE_SIZE < total`)가 하나라도 있으면 보이고, 누르면 그 소스들만 다음
   페이지를 받는다. 받는 동안 버튼은 `disabled`. `더 보기`가 실패하면 열 아래에 `더 불러오지 못했어요` + `다시 시도`. 첫 페이지가
   실패한 소스는 열 위에 `등록 요청을 불러오지 못했어요`(또는 `피드백을 불러오지 못했어요`) + `다시 시도`(설계 7.1). 보이는 모든
   소스가 실패했으면 빈 상자는 띄우지 않는다. 모두 받았는데 카드가 없으면 점선 `비어 있어요`. 첫 페이지를 받는 동안은
   `불러오는 중...`.
7. **캡션.** `처리 전 {n}건 · 카드를 눌러 검토해요`의 n은 신규·확인 중 두 열의 개수 합이다(결정 6과 같은 값). 헤더 배지는
   `신규`만 세므로(`/api/inbox-counts`) 다른 값이다. 두 열의 개수가 모두 `null`이 아닐 때만 숫자를 보이고, 아니면
   `카드를 눌러 검토해요`만 보인다. 모바일 세그먼트의 `등록 요청 n / 피드백 n`도 그 소스가 `ready`일 때만 n을 붙인다.
8. **종류 세그먼트와 조회.** 데스크톱은 세그먼트가 고른 종류만 부른다 — `전체`는 두 API, 나머지는 하나(설계 7.1). 세그먼트를 바꾸면
   보드를 새로 받는다. 모바일은 세그먼트에 두 종류의 개수(`등록 요청 n / 피드백 n`)를 보여야 해서 고른 상태 칩으로 두 API를 모두
   부르고 고른 종류만 보인다(`building`이 있으면 등록 요청만). 모바일에 `전체`는 없다 — URL이 `전체`면 등록 요청을 보인다.
   모바일 상태 칩은 `INBOX_FILTERS` 다섯 값, 기본은 `open`(처리 전)이다.
9. **상태를 바꾸면.** 등록 요청의 상태 표시·승인·거절·정리, 피드백의 상태 저장이 성공하면(또는 409처럼 서버 상태를 모르게 되면)
   보드 전체를 다시 받고(`load`, 이어 붙인 페이지를 버림) `inboxCountsChanged`를 보낸다. 피드백 상태 저장이 실패해도 다시 받는다
   — 지금과 같다. 드로어는 열린 채다(설계 7.2).
10. **승인·거절 뒤 드로어는 열린 채 처리 후 상태.** 2026-10-15 사용자 결정. 지금 모달은 승인·거절에 성공하면 닫히지만, 설계 7.2와
    핸드오버 6절의 처리 후 바(`승인되어 시설로 등록됐어요` + `만들어진 시설 보기 →` / `거절된 요청이에요`, 남은 사진이 있으면
    `남은 사진 정리`)를 따른다. 토스트 문구는 지금 그대로다. 순서:
    - 승인 응답(`{facilityId, cleanupFailed}`)을 받으면 **바로** 로컬 상세를 끝 상태로 바꾼다(`status: approved`, `facility_id`). 값은
      읽기 전용이 되고 dirty가 풀린다. 거절도 같다(`status: rejected`).
    - `busy`는 번역(`translateFacility`)·`/api/revalidate-facilities`·보드 다시 받기 요청·상세 다시 읽기가 모두 끝날 때까지 유지한다.
    - 뒤따르는 상세 다시 읽기가 실패해도 드로어를 닫지 않는다 — 로컬 끝 상태를 그대로 보이고 경고 토스트만 띄운다. 상세 조회
      실패로 닫는 것은 **처음** 여는 조회뿐이다(지금 모달과 같다).
11. **저장 안 한 변경.** 2026-10-15 사용자 결정. 등록 요청 드로어는 처리 전 요청에서 값·사진 선택이 처음 읽은 값과 다르면
    `useUnsavedChanges(true)`를 등록한다. 상태 표시 버튼(`확인 중으로 표시`)은 입력을 저장하지 않고 드로어도 닫지 않으므로 가드를
    거치지 않는다 — 고치던 값은 남는다(지금 재로드 규칙). 승인·거절 성공(결정 10)과 끝 상태 재로드는 dirty를 푼다. 피드백
    드로어에는 고칠 값이 없다. 닫히는 길과 처리:

    | 길                                                | 처리                                                                         |
    | ------------------------------------------------- | ---------------------------------------------------------------------------- |
    | ✕ · 배경 · Esc · 모바일 `‹`                       | `requestDrawerClose`                                                         |
    | 지금 페이지를 가리키는 헤더 `제보함` 링크         | `useWorkspaceCloseRequest(open, requestDrawerClose)` — 훅은 가드를 안 거친다 |
    | 다른 카드 열기 · `다음 항목 →`                    | `busy`면 무시, 아니면 `guard(() => open(next))`                              |
    | 드로어 안 링크(건물 이름, `만들어진 시설 보기 →`) | `busy`면 무시, 아니면 `guard(() => router.push(href))`                       |
    | 다른 헤더 링크 · 뒤로가기 · 새로고침              | 레이아웃 가드(지금 그대로)                                                   |

    `requestDrawerClose = () => { if (!busy) guard(closeNow) }` 하나를 모든 닫기 길이 같이 쓴다.
    바쁜 동안 다른 헤더 링크·뒤로가기로 페이지를 떠나는 것은 막지 않는다 — 레이아웃 가드는 dirty만 보고, 지금 모달에도 있는
    틈이다. `docs/TODO_list/admin/inbox-busy-navigation.md`에 적는다(승인 뒤 클라이언트가 부르는 번역이 빠질 수 있다).

12. **드로어.** 한 컴포넌트(`InboxDrawer`)가 데스크톱은 배경 dim + 오른쪽 600px, 모바일은 전체 화면(위 `‹` + 제목, 아래 nav 위의 고정
    하단 바)을 그린다. `role="dialog"`·`aria-modal`·`aria-labelledby`, `useModalFocus`로 초점 가두기·Esc·초점 복귀.
    - **층.** 드로어는 제보함 페이지 영역(헤더 아래)을 덮는다 — 프로토타입처럼 헤더는 덮지 않고, 헤더 링크는 결정 11의 표대로
      간다. dim은 패널의 **형제** 요소라 패널 안 클릭이 dim으로 번지지 않는다. dim은 보드 위에서 포인터를 막는다.
    - **바쁜 동안**(`busy`: 승인·거절·상태 변경·정리 진행 중)은 닫히지 않는다(결정 11의 표).
    - **Esc.** `useModalFocus`는 Esc를 capture 단계에서 먼저 받으므로 `closeOnEscape: !busy && !confirmingReject`로 둔다. 인라인
      거절 확인 그룹은 `DetailPanel`의 삭제 확인처럼 자기 `onKeyDown`에서 Esc로 확인만 취소한다. Esc 한 번은 확인 취소, 두 번째가
      `requestDrawerClose`다.
    - **재마운트.** 페이지는 드로어를 `key={kind:id}`로 그린다 — 다른 요청으로 바뀌면 상세·기준값·첫 로드 여부가 통째로 새로 선다.
    - **초점 복귀.** 상태를 바꾸면 연 카드가 다른 열로 가거나 사라져 `useModalFocus`가 돌아갈 곳이 없다. `useModalFocus`에
      `restoreFallbackRef` 옵션을 더해, 돌아갈 요소가 DOM에 없으면 그것(보드 제목)에 초점을 둔다.
    - **움직임.** 열고 닫는 트랜지션은 두지 않는다(핸드오버 Interactions의 "트랜지션 없음"). 그래서 `prefers-reduced-motion` 분기도
      필요 없다.
13. **드로어의 소유.** 열린 드로어는 보드와 따로 페이지가 들고 있다:
    `opened = { key, kind, id, origin: InboxFilter, navigation: InboxCard[], feedback?: FeedbackItem }`. `navigation`은 연 순간 그
    열의 카드 목록(이어 붙인 페이지 포함) 스냅샷이다. 보드를 다시 받아 카드가 다른 열로 가거나 빠져도 드로어는 닫히지 않는다.
14. **등록 요청 드로어.** 헤더: 유형 아이콘 42px(`src/components/map/iconography.tsx`의 시설 아이콘) · `{유형} 등록 요청`(dialog 이름) ·
    상태 알약 + 건물 이름 링크(`/admin/buildings/{building_id}`) + `· {시각} 접수`. 사진: 132px 정사각 타일, 타일 전체가 `<label>`이고 안에
    시각적으로 숨긴 진짜 체크박스(이름 `사진 {n} 공개`)를 둔다 — 지금 E2E와 보조기기가 체크박스로 읽는다. 볼 수 없는 사진은 `볼 수
없음` + 체크박스 `disabled`. 사진이 없으면 `첨부된 사진이 없어요`. 본문 2열: 왼쪽 `FacilityFields`(`showLocation={false}`,
    `showFloor`·`showInstalled`는 지금처럼), 오른쪽 미니맵(`FacilityMap`, `highlightColor`에 크림슨 토큰 값, 지도 클릭이 위치를 바꾸고
    끝 상태·바쁠 때는 막힘) + 위치 판정 문구. 위치 판정은 셋이다 — 요청 위치 그대로 `제보자가 찍은 위치가 있어요`(성공색),
    관리자가 지도에서 옮김 `지도에서 고른 위치예요`(기본 글자색), 없음 `위치 없음 · 지도에서 찍어 주세요`(경고색). 하단 바는 핸드오버
    6절대로 — 처리 전: `거절`·`확인 중으로 표시`/`신규로 되돌리기`·(여백)·`사진 {k}/{n}장 공개`·`승인하고 등록`. 처리 후: 결정 10.
    인라인 거절 확인 문구는 `거절할까요? 요청 사진은 지워지고 거절됨으로 남아요.` + `취소` + `거절`이다(설계 7.3, `ConfirmModal`을
    겹치지 않는다).
    - **필드 모양.** `FacilityFields`는 인라인 하드코딩 색(테두리·라벨)을 갖고 지금은 `.ku-facility-modal` 규칙이 덮는다. 드로어는
      PR ①의 독립 시설 패널처럼 `FacilityFields`를 `.ku-detail-form`으로 감싸 그 덮어쓰기(토큰 색·모바일 46px/16px)를 그대로 받는다.
      `FacilityFields`는 고치지 않는다.
    - **미니맵.** `FacilityMap`은 높이를 인라인 250px로 박고 `현재 위치로 이동` 버튼 색을 인라인 `#fff`로 둔다. 선택 prop `height`를
      더하고(기본 250 — 공개 요청 모달은 그대로), 위치 버튼에 class(`ku-facility-map-locate`)를 붙여 관리자 CSS가 드로어 안에서 토큰
      색으로 덮게 한다. 끝 상태·바쁠 때의 클릭 막기는 드로어가 넘기는 `onMapClick`이 무시하는 것으로 한다(`FacilityMap`에
      `disabled`를 더하지 않는다).
15. **모바일 등록 요청 상세는 데스크톱과 같은 로직.** 2026-10-15 사용자 결정. 프로토타입 모바일은 읽기 전용(값 카드 + 사진 가로줄,
    지도·거절 확인 없음)이지만 설계 7.3("로직을 옮긴다")을 따른다. 같은 드로어가 전체 화면이 되고 본문은 한 열(사진 → 필드 → 지도
    190px → 위치 판정). 하단 바는 `거절`(1) / `승인하고 등록`(2)이고, 거절은 같은 인라인 확인으로 바뀐다. `확인 중으로 표시`/
    `신규로 되돌리기`와 `사진 {k}/{n}장 공개`는 본문 위쪽으로 옮긴다. 입력 46px·16px 글자, 버튼 50px(핸드오버 8절 상세).
16. **피드백 드로어.** 헤더: 유형 태그 + `{시각} 접수`, dialog 이름은 유형 라벨(지금처럼 `오류 제보` 등). 본문 16px·line-height 1.7·
    max-width 640·`pre-wrap`. `보낸 화면` + `page_url` 원문(mono 12px). 링크는 `feedbackPageHref(page_url, window.location.origin)`이
    주소를 돌려줄 때만 건다 — `http:`·`https:`이고 출처가 같을 때(설계 2.11). 같은 탭에서 연다(같은 사이트라 새 탭이 필요 없다).
    하단 바: `처리 상태` + 세그먼트 `신규 / 확인 중 / 처리 완료`(`aria-pressed`, 활성 글자색은 상태 색) · 오른쪽 `다음 항목 →`. 세그먼트는
    누르면 바로 `PATCH`하고 저장하는 동안 `disabled`. 성공 토스트는 `신규로 되돌렸어요` / `확인 중으로 바꿨어요` / `처리 완료로
바꿨어요`(핸드오버 7절 "PATCH + 토스트"), 실패는 지금 문구의 오류 토스트. 성공하면 드로어가 들고 있는 항목의 `status`를 바꾼다 —
    피드백은 상세 API가 없어 다시 받은 보드에서 그 항목이 빠져도 드로어는 들고 있는 값을 보인다(결정 13, 지금 `opened`와 같다).
    저장하는 동안은 `다음 항목 →`도 `disabled`다.
17. **`다음 항목 →`.** 드로어를 연 열에서, 지금 항목의 정렬 위치(결정 5) 바로 뒤에 오는 카드다. 찾는 목록은 `opened.navigation`
    (연 순간의 스냅샷, 결정 13)과 그 열의 지금 카드를 키로 합친 것이고 같은 키는 지금 카드가 이긴다. 상태를 바꾸면 보드가 첫
    페이지로 돌아가 이어 붙인 페이지의 카드가 지금 목록에서 사라지는데(결정 9), 스냅샷이 있어 2페이지에 있던 다음 카드로도 간다.
    `다음 항목`으로 옮겨 가도 스냅샷은 처음 연 것을 이어 쓴다. 지금 항목이 상태 변경으로 그 열을 떠났어도 정렬 위치로 찾으므로
    "다음"이 그대로다. 종류는 가리지 않는다 — `전체`에서 다음 카드가 등록 요청이면 등록 요청 드로어로
    바뀐다. 열에 받은 카드 중 다음이 없으면 버튼을 그리지 않는다(프로토타입). 데스크톱 피드백 드로어에만 있다(모바일 프로토타입에
    없음).
18. **같은 출처 판정의 테스트 가능성.** `feedbackPageHref(pageUrl, origin): string | null` — `new URL`이 실패하거나 프로토콜이
    `http:`·`https:`가 아니거나 `url.origin !== origin`이면 `null`. 대소문자·기본 포트는 `URL`이 정규화한다.
19. **옛 CSS와 전역 덮어쓰기.** 옛 제보함 CSS(탭·목록·검토 모달)는 지운다. `.ku-inbox-status`는 카드·드로어의 상태 알약으로 다시
    쓴다. `.ku-admin-content > :not(.ku-map-workspace)`의 입력·버튼 전역 덮어쓰기는 이 PR이 지운다(설계 3.1 "마지막 탭을 옮기는 PR이
    규칙을 지운다"). 지우기 전에 남은 의존(건물 화면·이모지 피커)을 다시 찾고, 의존이 있으면 그 클래스로 값을 옮긴다.
20. **목 백엔드.** 제보함 두 목록이 실제 API처럼 `created_at DESC, id ASC`로 정렬하고 `page`로 20개씩 자른다. 지금은 정렬·페이지를
    하지 않아 `더 보기`·합치기 시나리오가 거짓으로 통과한다. 목록 항목에 `description`을 싣는다(결정 3).

## 공유 인터페이스

### `src/lib/inboxBoard.ts`

```ts
export type InboxKind = "requests" | "feedback";
export type InboxKindFilter = "all" | InboxKind;

export type InboxCard =
  | { kind: "requests"; item: FacilityRequestListItem }
  | { kind: "feedback"; item: FeedbackItem };

export function inboxCardKey(card: InboxCard): string; // `${kind}:${id}`
export function compareInboxCards(a: InboxCard, b: InboxCard): number; // 결정 5

/** 소스(열 × 종류) 하나의 상태 */
export interface InboxSourceState {
  status: "loading" | "error" | "ready";
  items: InboxCard[]; // 받은 순서, 중복 없음
  total: number;
  page: number; // 마지막으로 받은 페이지. 0이면 아직 없음
  more: "idle" | "loading" | "error";
}

export interface InboxBoardOptions {
  columns: InboxFilter[]; // 데스크톱 ["new","reviewing","done"], 모바일 [고른 칩]
  kinds: InboxKind[];
  building: number | null;
}

export interface InboxBoardState {
  generation: number;
  optionsKey: string; // 옵션의 직렬화. 다르면 훅이 load한다(결정 2)
  columns: {
    filter: InboxFilter;
    sources: Partial<Record<InboxKind, InboxSourceState>>;
  }[];
}

export function inboxBoardOptionsKey(options: InboxBoardOptions): string;
export function initialInboxBoardState(
  options: InboxBoardOptions,
): InboxBoardState; // 세대 1, 모든 소스 loading

export type InboxBoardAction =
  | { type: "load"; options: InboxBoardOptions } // generation + 1, optionsKey 갱신, 모든 소스 loading·page 0
  | {
      type: "pageLoaded";
      generation: number;
      filter: InboxFilter;
      kind: InboxKind;
      page: number;
      cards: InboxCard[];
      total: number;
    }
  | {
      type: "pageFailed";
      generation: number;
      filter: InboxFilter;
      kind: InboxKind;
      page: number;
    }
  | { type: "moreRequested"; filter: InboxFilter; kind: InboxKind } // more: loading (이미 loading이면 그대로)
  | { type: "firstPageRetryRequested"; filter: InboxFilter; kind: InboxKind }; // status error인 소스만 loading

export function inboxBoardReducer(
  state: InboxBoardState,
  action: InboxBoardAction,
): InboxBoardState;
// pageLoaded/pageFailed는 generation이 다르면 같은 state 객체를 돌려준다.
// page === 1은 그 소스가 status loading일 때만, page > 1은 more loading이고 page === source.page + 1일 때만 받는다(결정 2).
// page === 1이면 items를 갈아 끼우고, page > 1이면 키 중복을 빼고 이어 붙인다.
// pageFailed: page === 1이면 status error, page > 1이면 more error(받은 카드는 남는다).

export function hasMorePages(source: InboxSourceState): boolean; // page * ADMIN_PAGE_SIZE < total
export function columnCards(
  column: InboxBoardState["columns"][number],
  kinds: InboxKind[],
): InboxCard[]; // 합치기·정렬·중복 제거
export function columnCount(
  column: InboxBoardState["columns"][number],
  kinds: InboxKind[],
): number | null; // 보이는 소스가 모두 ready일 때 total 합
export function nextInboxCard(
  snapshot: InboxCard[],
  current: InboxCard[],
  card: InboxCard,
): InboxCard | null; // 결정 17
export function feedbackPageHref(
  pageUrl: string,
  origin: string,
): string | null; // 결정 18
```

### `src/lib/inboxUrl.ts`

```ts
export interface InboxUrlState {
  kind: InboxKindFilter;
  building: number | null;
}
export function readInboxUrl(search: string): InboxUrlState; // building이 있으면 kind = "requests"
export function writeInboxUrl(search: string, next: InboxUrlState): string; // tab·building만 고치고 나머지 보존, "?…" 또는 ""
```

### `src/lib/facilityRequestReview.ts`

지금 `FacilityRequestReviewModal` 안의 함수들을 꺼낸다.

```ts
export function fieldsFromRequest(
  detail: FacilityRequestDetail,
): FacilityFieldValues;
export function initialPhotoSelection(
  detail: FacilityRequestDetail,
): Set<string>; // 서명 주소가 있는 사진 전부
export function isReviewDraftDirty(
  detail: FacilityRequestDetail,
  fields: FacilityFieldValues,
  selection: ReadonlySet<string>,
): boolean; // 끝 상태면 false
export type RequestLocationNote = "reporter" | "picked" | "none";
export function requestLocationNote(
  detail: FacilityRequestDetail,
  fields: FacilityFieldValues,
): RequestLocationNote;
```

### `src/components/admin/inbox/useInboxBoard.ts`

```ts
export function useInboxBoard(options: InboxBoardOptions): {
  state: InboxBoardState;
  reload: () => void; // load — 첫 페이지 요청은 generation effect가 시작한다
  loadMore: (filter: InboxFilter, kinds: InboxKind[]) => void; // 다음 페이지가 남았거나 more error인 소스만
  retryFirstPage: (filter: InboxFilter, kind: InboxKind) => void;
};
```

옵션이 바뀌면 새 세대로 다시 받는다(결정 2). 요청은 `authedFetch`로 `GET /api/facility-requests?status=&page=[&building=]`,
`GET /api/admin-feedback?status=&page=`. 응답 모양이 `{ items: [], total: number }`가 아니면 실패로 친다(지금 `useInboxList`와 같다).

### 컴포넌트(`src/components/admin/inbox/`)

| 파일                        | 하는 일                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| `InboxBoard.tsx`            | 데스크톱: 제목·캡션·종류 세그먼트·건물 칩 + 3열                           |
| `InboxColumn.tsx`           | 열 헤더(점·이름·개수)·실패 안내·카드 목록(따로 스크롤)·빈 상자·`더 보기`  |
| `InboxCardButton.tsx`       | 카드 하나(두 종류). 버튼 하나, 이름은 카드의 제목                         |
| `InboxMobileList.tsx`       | 모바일: 종류 세그먼트(개수)·상태 칩·카드 목록·`더 보기`                   |
| `InboxDrawer.tsx`           | 드로어 껍데기(결정 12): dim·패널·헤더 닫기·모바일 위 바·본문·하단 바 자리 |
| `FacilityRequestDrawer.tsx` | 등록 요청 검토(결정 10·11·13·14·15) — `FacilityRequestReviewModal`의 로직 |
| `FeedbackDrawer.tsx`        | 피드백(결정 13·16·17)                                                     |

지우는 파일: `FacilityRequestList.tsx`, `FeedbackList.tsx`, `InboxFilterSelect.tsx`, `useInboxList.ts`,
`FacilityRequestReviewModal.tsx`, `FeedbackDetailModal.tsx`. `src/lib/inboxStatus.ts`는 남긴다(필터 값·매핑·DTO).

## 기존 E2E 시나리오의 행방

`e2e/admin-inbox.spec.ts`의 시나리오를 하나씩 대조한다(설계 8.2). 새 파일을 만들지 않고 이 파일을 다시 쓴다.

| 지금 시나리오                                                         | 행방                                                                                                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 메뉴 배지는 신규 수, 기본 목록은 신규·확인 중이다                     | → B1 보드: 배지는 그대로, 신규·확인 중·처리 완료 열에 카드가 나뉜다                                                                                |
| 상태 필터로 처리 완료와 전체를 본다                                   | → B1(처리 완료 열의 `거절됨` 알약), 모바일 M1(상태 칩)                                                                                             |
| `?building`으로 열면 그 건물 요청만 보이고 해제할 수 있다             | → B3                                                                                                                                               |
| 층을 고치고 사진 하나를 빼고 승인하면 …목록에서 빠진다                | → R1: 드로어가 열린 채 처리 후 상태, 카드는 처리 완료 열로(결정 10). 만들어진 시설의 고친 층·공개 사진 1장 단언은 그대로 둔다                      |
| 확인 중으로 표시하고 되돌린다 — 모달은 열린 채다                      | → R2: 카드가 확인 중 열로 갔다가 돌아온다                                                                                                          |
| 거절은 확인을 거치고, 거절된 요청은 읽기 전용으로 열린다              | → R3: 인라인 확인(취소 → 그대로, 거절 → 끝 상태), 처리 완료 열에서 다시 열면 읽기 전용. 요청 사진 삭제 단언은 그대로 둔다. Esc 한 번은 확인만 취소 |
| 다른 관리자가 먼저 처리했으면(409) 안내하고 읽기 전용으로 다시 읽는다 | → R4 (선택자만 드로어로)                                                                                                                           |
| 승인이 거절돼도 고치던 값과 사진 선택은 남는다                        | → R5 (선택자만 드로어로)                                                                                                                           |
| 볼 수 없는 사진은 공개할 수 없고 승인에서 빠진다                      | → R6 (선택자만 드로어로). 볼 수 없는 사진이 시설로 복사되지 않는 단언은 그대로 둔다                                                                |
| 피드백 탭에서 상태를 바꾸면 기본 목록에서 빠지고 처리 완료에 보인다   | → F1: 세그먼트를 누르면 토스트, 카드가 처리 완료 열로, 드로어는 열린 채                                                                            |
| 본문 미리보기를 누르면 모달에 전체 본문과 제보 페이지가 보이고 …      | → F2: 전체 본문, `보낸 화면` 원문, 외부 주소는 링크가 아님 / 같은 출처 주소는 링크, Esc·배경 닫기                                                  |
| 목록을 불러오지 못하면 빈 목록이 아니라 오류로 보인다                 | → B4: `전체`에서 피드백 API만 실패 — 등록 요청 카드 + `피드백을 불러오지 못했어요` + `다시 시도`                                                   |

새 시나리오:

- B2 종류 세그먼트: `등록 요청`·`피드백`이 그 종류만 보이고 주소가 `?tab=…`이 된다. 모르는 파라미터는 남는다. `?tab=feedback`으로
  들어오면 피드백이 보인다.
- B5 `더 보기`: 신규 21건 → 20장 + `더 보기` → 21장, 헤더 개수 21. 상태를 바꿔 보드를 다시 받으면 첫 페이지로 돌아간다.
- B6 낡은 응답: 신규 21건에서 `더 보기`의 page=2 요청을 `page.route`로 붙잡는다. 붙잡을 때 **그 순간의 목 상태로 만든 응답 JSON을
  복사해 둔다**(나중에 `fallback()`하면 목이 풀린 시점의 최신 상태로 답해 낡은 응답이 아니게 된다). 그 사이 카드 하나의 상태를
  바꿔 보드를 다시 받은 뒤 복사본으로 `fulfill`한다. 카드가 중복되거나 늘지 않는다. B5와 함께 첫 응답의 items가 정확히 20개이고
  `total`이 자르기 전 값(21)인지도 본다.
- R7 저장 안 한 변경(대표 조합): 이름을 고친 뒤 — 배경(취소하면 드로어·값이 남음), ✕(확인하면 닫힘), Esc, 같은 화면 헤더 `제보함`
  링크, 다른 헤더 링크(`독립 시설`), 드로어 안 건물 링크, 브라우저 뒤로가기가 모두 확인 창을 띄운다. 고친 값이 없으면 배경·✕가
  확인 없이 닫힌다.
- R8 바쁜 동안 닫히지 않음: 승인 POST를 붙잡은 동안, POST는 끝났고 번역 요청을 붙잡은 동안 — 두 구간 모두에서 Esc·배경·✕를 눌러도
  드로어가 남고, 풀면 처리 후 상태가 된다.
- R9 옮긴 동작: 상세 첫 조회 실패면 안내 토스트 후 드로어가 닫힌다, 유형을 비우고 승인하면 경고 토스트(요청은 나가지 않음),
  승인·거절의 `cleanupFailed` 경고 토스트, 끝 상태 요청의 `남은 사진 정리` 성공·실패. 실패는 `page.route`로 만든다.
- F3 `다음 항목 →`: 같은 열의 다음 카드 드로어로 바뀐다. 상태를 바꾼 뒤에도 원래 열의 다음 카드로 간다 — 21건 열에서 `더 보기`로
  받은 21번째 카드의 앞 카드(20번째)를 열고 상태를 바꿔도 21번째로 간다(결정 17의 스냅샷). 마지막 카드에는 버튼이 없다. 저장하는
  동안은 `disabled`.
- M1 모바일(390×844): 세그먼트 `등록 요청 n / 피드백 n`, 상태 칩으로 목록이 바뀐다, 카드 → 전체 화면 상세, `‹`로 돌아온다.
- M2 모바일 등록 요청: 하단 `거절`/`승인하고 등록`, 거절이 인라인 확인으로 바뀐다, 터치 영역 44px 이상. 같은 로직(결정 15)인지 —
  층을 고치고 사진 하나를 빼고 지도를 눌러 위치를 옮긴 뒤 승인하면 만들어진 시설에 그 값이 들어간다, 승인 뒤 전체 화면이 처리 후
  상태로 남는다, 값을 고친 채 `‹`를 누르면 확인 창.
- M3 모바일 피드백: 하단 상태 세그먼트로 저장, `다음 항목`이 없다.
- 다크(`admin-dark.spec.ts`에 더함): 등록 요청 드로어를 연 상태(필드·미니맵 위치 버튼이 보이게)에서 하드코딩 밝은 색 검사,
  `승인하고 등록` 크림슨 채움 위 글자 대비.

다른 spec: `facility-photos.spec.ts`의 "건물 상세 … 제보함으로 간다"는 URL만 보므로 그대로 통과해야 한다. `admin-shell.spec.ts`의
관리자 토스트 시나리오도 그대로다.

## 파일 지도

| 파일                                                       | 변화                                                |
| ---------------------------------------------------------- | --------------------------------------------------- |
| `src/lib/inboxBoard.ts` (+ `.test.ts`)                     | 새로                                                |
| `src/lib/inboxUrl.ts` (+ `.test.ts`)                       | 새로                                                |
| `src/lib/facilityRequestReview.ts` (+ `.test.ts`)          | 새로(모달에서 꺼냄)                                 |
| `src/lib/inboxStatus.ts`                                   | `FacilityRequestListItem.description`               |
| `src/app/api/facility-requests/route.ts` (+ `.test.ts`)    | 목록 select에 `description`                         |
| `e2e/support/mockBackend.ts`                               | 제보함 목록 정렬·페이지·`description`               |
| `src/app/admin/dashboard/inbox/page.tsx`                   | 다시 씀                                             |
| `src/components/admin/inbox/*`                             | 새 컴포넌트 7개, 옛 파일 6개 삭제                   |
| `src/app/admin/admin-ui.css`                               | `ku-inbox-*` 새로, 옛 제보함 CSS·전역 덮어쓰기 삭제 |
| `src/components/FacilityMap.tsx`                           | 선택 prop `height`, 위치 버튼 class                 |
| `src/lib/useModalFocus.ts`                                 | 선택 옵션 `restoreFallbackRef`                      |
| `e2e/admin-inbox.spec.ts`                                  | 다시 씀                                             |
| `e2e/admin-dark.spec.ts`                                   | 드로어 다크 검사                                    |
| `docs/specs/2026-10-14-admin-map-first-redesign-design.md` | 7장에 결정 반영, 3.1 전역 규칙 삭제 기록            |
| `docs/specs/2026-10-08-facility-request-design.md`         | 4.1·4.2·4.3·6장 대체 표시                           |

## Tasks

### Task 0: 이 계획 커밋

`docs: 관리자 지도 우선 리디자인 ④의 구현 계획을 둔다`.

### Task 1: 순수 로직 — `inboxBoard.ts`, `inboxUrl.ts`, `facilityRequestReview.ts`

RED: 세 파일의 vitest.

- 합치기: 두 종류를 접수 시각 내림차순으로, 같은 시각이면 등록 요청 먼저, 같으면 id 오름차순. 같은 키는 하나만. 종류가 다르면
  id가 같아도 둘 다 남는다.
- 리듀서: `load`가 세대를 올리고 모든 소스를 loading으로. 지금 세대의 `pageLoaded`(page 1)는 갈아 끼우고, page 2는 중복을 빼고
  이어 붙인다. 낡은 세대의 `pageLoaded`·`pageFailed`는 state를 바꾸지 않는다(같은 객체). page 1 실패는 `status: error`, page 2 실패는
  `more: error`이고 이미 받은 카드는 남는다. `firstPageRetryRequested`는 status error인 그 소스만 loading. 같은 세대 안에서
  기대 페이지가 아닌 응답(같은 다음 페이지가 두 번 옴, loading이 아닌 소스의 첫 페이지)은 같은 객체를 돌려준다.
  `moreRequested`는 이미 loading이면 같은 객체. `load`는 옵션 키를 갈고 열·종류 구성을 새 옵션대로 만든다.
- `hasMorePages`·`columnCount`(보이는 소스 하나라도 loading·error면 `null`)·`columnCards`(보이는 종류만).
- `nextInboxCard`: 목록 안 항목의 다음, 목록에 없는 항목(열을 떠남)의 정렬 위치 다음, 스냅샷에만 있는 카드(2페이지에서 왔다가
  재조회로 지금 목록에서 빠짐)로도 간다, 같은 키는 지금 카드가 이긴다, 마지막이면 `null`.
- `feedbackPageHref`: 같은 출처 http(s)는 주소, 다른 출처·`javascript:`·`mailto:`·깨진 주소·출처는 같고 프로토콜만 다른 경우는
  `null`.
- `readInboxUrl`/`writeInboxUrl`: `tab` 세 값, 모르는 값은 `all`, `building` 검증(0·음수·소수·문자 거부), `building`이 있으면
  `requests`, 쓰기는 다른 파라미터 보존·`all`이면 `tab` 삭제.
- `facilityRequestReview`: 지금 모달의 필드 매핑·초기 사진 선택(볼 수 없는 사진 제외)과 같은 결과, dirty(필드 하나·사진 선택
  하나만 달라도 true, 끝 상태면 false), 위치 판정 셋.

GREEN: 구현. 지금 모달 안의 같은 로직은 Task 3에서 이 함수로 바꾼다.

### Task 2: 목록 설명과 목 백엔드

RED: `src/app/api/facility-requests/route.test.ts`에 목록 항목의 `description`. E2E는 이 태스크에서 새로 쓰지 않는다.
GREEN: 라우트 select·타입, 목 백엔드(결정 20). 지금 `admin-inbox.spec.ts`가 정렬·페이지가 생긴 목에서도 통과하는지 돌려 본다 —
깨지면 시나리오가 순서에 기대던 것이니 이유를 보고한다.

### Task 3: 데스크톱 보드와 등록 요청 드로어

같은 화면을 한 번에 바꾸는 태스크라 둘을 묶는다(보드만 바꾸면 옛 모달을 새 보드에 이어야 해 버릴 코드가 생긴다).

RED: `admin-inbox.spec.ts`를 다시 쓴다 — B1·B2·B3·B4·B5·B6, R1~R8. 옛 피드백 시나리오 둘(목록 상태 select, 미리보기 모달)은 이
태스크에서 지운다. 그 자리는 Task 4의 F1·F2가 채운다.
RED 목록에 R9를 더한다. GREEN: `useInboxBoard`, 페이지, `InboxBoard`·`InboxColumn`·`InboxCardButton`, `InboxDrawer`,
`FacilityRequestDrawer`, `useModalFocus`의 `restoreFallbackRef`, `FacilityMap`의 `height`·위치 버튼 class. 데스크톱 보드·드로어의
**구조 CSS**(배치·dim과 패널의 층·포인터 막기·열 스크롤)도 이 태스크에서 쓴다 — R7·R8이 배경 클릭에 기댄다. 피드백 카드는
보드에 보이지만 누르면 아무것도 하지 않아도 된다(Task 4에서 잇는다). 옛 `FacilityRequestList`·`FacilityRequestReviewModal`·
`InboxFilterSelect`·`useInboxList`를 지운다.

### Task 4: 피드백 드로어

RED: F1·F2·F3. GREEN: `FeedbackDrawer`, `다음 항목`. 옛 `FeedbackList`·`FeedbackDetailModal`을 지운다. 이 태스크 끝에서
`admin-inbox.spec.ts` 전체가 통과해야 한다.

### Task 5: 모바일

RED: M1·M2·M3. GREEN: `InboxMobileList`, 드로어의 모바일 전체 화면(결정 12·15)과 그 구조 CSS, 하단 바가 아래 nav와 safe area 위에
붙는다.
모바일에서 보드는 그리지 않는다(`useMediaQuery`가 SSR·첫 렌더에 false를 돌려주므로 데스크톱으로 그렸다가 바뀌는 것은 다른 탭과 같다).

### Task 6: CSS 정리와 다크

RED: `admin-dark.spec.ts` 드로어 시나리오.
GREEN: 옛 제보함 CSS 삭제, 전역 덮어쓰기 삭제(결정 19), 남은 하드코딩 색을 토큰으로(미니맵 위치 버튼 포함). 구조 CSS는 Task 3·5가
이미 썼고, 이 태스크는 지우기·토큰·다크만 맡는다. 전체 `npm run test:e2e`로 다른 탭이 그대로인지 본다.

### Task 7: 문서

- 설계 7장에 결정 1·3·4·8·10·11·12·13·15·17을 날짜(2026-10-15)와 함께 옮긴다. 3.1의 "남는 의존은 … 제보함 … 마지막 탭을 옮기는 PR(④)이
  규칙을 지운다"를 지운 사실로 고친다.
- `2026-10-08-facility-request-design.md` 4.1·4.2·4.3·6장 머리에 대체 표시(명소 설계의 대체 배너와 같은 모양): 상태별 보드와 검토
  드로어로 바뀌었고 `FacilityRequestReviewModal`·`FeedbackDetailModal`은 없다. 본문은 당시 기록으로 둔다.
- E2E 시나리오 수를 적어 둔 문서가 있으면 다시 센 값으로 고친다.
- `docs/TODO_list/admin/inbox-busy-navigation.md`(결정 11): 바쁜 동안 다른 헤더 링크·뒤로가기로 떠나면 승인 뒤 번역 호출이 빠질 수 있다.

### Task 8: 마무리

CI 조건 재현(검증 방법)으로 lint·format:check·typecheck·test·test:e2e 전부. 한글 깨짐 검사(`git diff main --stat` 대상 파일 grep).
PR 본문에 프리뷰·실기기 확인 목록(데스크톱 보드·드로어, 다크, 모바일 상세 하단 바·safe area).
