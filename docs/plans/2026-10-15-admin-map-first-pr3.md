# 관리자 지도 우선 리디자인 ③ 구현 계획 — 경사도

> **For agentic workers:** 태스크 순서대로 TDD(RED → GREEN → REFACTOR)로 구현한다. 태스크마다 테스트를 먼저 커밋하고, 기대한
> 이유로 실패하는지 본 뒤 구현을 커밋한다. 이 계획은 태스크의 범위·결정·인터페이스·시나리오를 정한다. 화면 코드는 PR ①·②가
> 만든 같은 자리의 코드(아래 "참고 구현")를 본떠 쓴다.

**Goal:** 경사도 탭을 독립 시설·명소와 같은 지도 작업 화면으로 바꾼다. 목록·지도·보기 패널에서 경로를 고르고, `경로 편집`을
누르면 같은 화면에서 지도가 편집 지도로 바뀌어 꼭짓점과 구간 값을 고친다. 옛 편집 라우트(`/admin/slopes/new`·`[id]`)는
리다이렉트로 바꾸고 지운다.

**Architecture:** 순수 로직은 `src/lib/`에 둔다 — 판정(`slopeScale.ts`), 경로 요약·칩·배지(`slopeWorkspace.ts`), 편집 초안
비교(`slopeDraft.ts`), 저장·삭제 호출(`slopeSave.ts`). 화면은 PR ①의 공통 단위(`src/components/admin/workspace/*`)를 쓰고, 경사도
고유 단위는 `src/components/admin/slopes/`에 둔다. 편집 지도는 지금의 `SlopeRouteMap`(Leaflet + geoman, 명령형)을 작업 화면의 지도
자리에 바꿔 끼운다(설계 2.6). 편집 패널과 편집 지도는 형제라 페이지를 거쳐 두 객체를 주고받는다 — 패널이 내놓는 초안
(`SlopeEditDraft`)과 지도가 내놓는 편집기 손잡이(`SlopeEditorHandle`). 명소의 `DetailDraftPin`과 같은 방식이다.

**Tech Stack:** Next.js 16.2.4 App Router, React 19.2.4(React Compiler), react-leaflet 5 + Leaflet 1.9, `@geoman-io/leaflet-geoman-free`
2.19.3, `@supabase/supabase-js` 2.105, Vitest 3(node 환경), Playwright 1.61(목 백엔드).

**Spec:** `docs/specs/2026-10-14-admin-map-first-redesign-design.md`(이하 "설계 N.N") 6장·2.1·2.5·2.6·2.7·3장. 화면 값의 원본은
`docs/specs/2026-10-14-admin-map-first-handoff/README.md`(이하 "핸드오버") 1장의 경사도 행·지도 마커, 4장, 8장의 경사도 모바일,
Interactions다. 계획과 설계가 다르면 설계가 맞다 — 멈추고 보고한다.

**참고 구현(PR ②, main `9594602`):** `src/app/admin/dashboard/landmarks/page.tsx`, `src/components/admin/landmarks/*`,
`src/lib/landmarkWorkspace.ts`·`landmarkSave.ts`와 그 테스트, `e2e/admin-landmarks-workspace.spec.ts`. 늦은 완료 방어·`panelKey`·
`requestSelection`·모바일 위치 고르기(`pickOwner`·`pickFocus`)가 여기 있다.

## 진행 상황 (2026-10-15)

| 태스크 | 상태                       | 커밋                                                                                       |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| 0      | 끝                         | `ab60503`(② 계획 은퇴), `a003bf7`(이 계획)                                                 |
| 1·2    | 끝                         | `a003bf7..15cd67f`                                                                         |
| 3      | 끝                         | `15cd67f..58976cf`                                                                         |
| 4      | 끝                         | `58976cf..ddc51ee`(test `adc6f24`, refactor `bb2022e`, feat `ddc51ee`)                     |
| 5      | 끝                         | `78cf381..571c899`                                                                         |
| 6      | 끝                         | `571c899..83ec4f8`                                                                         |
| 7      | 끝                         | `83ec4f8..c119876`                                                                         |
| 8      | 문서 끝, 푸시·PR 열기 남음 | `c119876..` — 건물 spec 이름 `0b6687c`, README·설계 `ba38ed9`, 테스트 `d900186`, 문서 고침 |

각 태스크의 brief·구현 보고서는 이 저장소의 `.superpowers/sdd/2026-10-15-admin-map-first-pr3/`(git 무시, 이 머신에만 있다)에
있다.

2026-10-15 — CI 조건(검증 방법 절) 재현에서 `꼭짓점만 끌어 옮겨도 저장 안 한 변경이다`가 `--repeat-each=6`에서 6번 중 5번
실패했다. 편집 주소로 들어온 뒤 지도가 경로로 옮기는 중에 꼭짓점을 잡아 끌기가 지도에 갔다. `d900186`이 꼭짓점이 멈출 때까지
기다리게 고쳤다(같은 조건에서 6번 모두 통과).

실행 중 내린 결정:

- Task 1·2를 한 태스크로 묶었다(둘 다 vitest만 쓰는 순수 lib).
- Task 3에서 목록 UI(행의 `수정` 버튼, `경로 직접 그리기` 버튼, `?redirected=` 안내)를 거치던 옛 편집기 시나리오 넷도 지웠다 — 목록이
  바뀌는 순간 깨진다. Task 4가 표대로 새 형태로 다시 썼다.
- 번호표 선택자를 `.ku-slope-segment-label`로 넓히면(Task 3) 특이도가 leaflet.css의 `.leaflet-marker-icon { display: block }`과 같아져
  뒤에 로드되는 leaflet.css가 이긴다. `.leaflet-marker-icon.ku-slope-segment-label`로 올렸다(`58976cf`).
- 계획과 다르게 간 것은 설계로 옮겼다 — `WorkspaceMapCommands.focus`가 옮겼는지를 돌려준다(설계 3.2, Task 4), 목록·상세 사이
  틈이 좁은 폭의 기호 전용 도구 바(설계 6.4, Task 5), 모바일 편집에서 나가면 목록으로·전체 지도 focus가 위쪽 도구 바도 비킴·
  띠로 돌아오면 꼭짓점 편집(설계 6.6, Task 7). 이 때문에 결정 8·12(모바일 나가기·저장 뒤), 13(도구 바 기호·배치),
  15(전체 지도 focus insets)와 다르게 갔고, 그 결정들의 본문은 계획 당시대로 둔다.

남은 사소한 것: `slopeWorkspace`의 `verticesBounds(...)!`가 다른 파일(`readRoutePoints`)의 2점 이상 불변식에 기댄다.
`SlopeViewPanel`의 `GRADE_TONES`가 `slopeRouteBadge`의 판정 → tone 짝을 다시 적는다. 명소 spec에 있는 삭제 실패·떠난 뒤 삭제·2페이지
`?id=` 첫 조회·다시 받기 실패 토스트 시나리오가 경사도 spec에 없다. 존재 검사·`disposedRef`·`retry` 주석이 명소 페이지와 글자 그대로 같다.

## Global Constraints

- 범위는 설계 1장의 PR ③(설계 6장)이다. 제보함·건물 화면은 바꾸지 않는다. 독립 시설·명소 화면의 동작도 바뀌면 안 된다 —
  공통 단위를 고치면 `admin-facilities-workspace.spec.ts`·`admin-landmarks-workspace.spec.ts`가 그대로 통과해야 한다.
- 공개 지도는 연속 색(`slopeColorFromDeg`)을 유지한다. 판정 3색은 관리자 화면에만 쓴다(설계 2.1).
- 경사도 편집의 지금 동작을 지킨다: 꼭짓점 수 고정(2026-08-30 설계 5.4.1), 반올림 없는 도 저장, 단위 기억(`ku_slope_input_unit`),
  새 경로의 현재 위치 열기(2026-10-06 설계 5.4), 건물 스냅 기본 꺼짐, 다른 경로 깔기, `updated_at` 조건 저장(설계 2.8).
- URL 파라미터는 `id`·`new`·`edit`(설계 3.4). `useWorkspaceSelection({ allowEdit: true })`. `useSearchParams`를 쓰지 않는다.
- 저장 안 한 변경은 PR ①의 `UnsavedChangesGuard`(`useUnsavedChanges`·`useUnsavedChangesGuard`)로 받는다. 편집기의 자체
  `beforeunload`·`confirmLeave`는 지운다 — 가드가 맡는다.
- 새 CSS 클래스는 `ku-slope-*` 또는 공통 `ku-detail-*`·`ku-workspace-*`. 색은 `globals.css` 토큰으로 쓴다. 판정 3색과 그 위
  글자색만 데이터 색이라 라이트·다크가 같다(설계 2.1). 다크 대응을 빠뜨리지 않는다.
- 패널·도구 바·확인 바에 z-index를 두지 않는다(PR ① 계획 결정 7). 지도 자리(`.ku-map-workspace-map`)는 z-index 0 맥락이라 그 안에
  그린 `ConfirmModal`은 패널 밑에 갇힌다 — 확인 창은 지도 컴포넌트 밖(패널 쪽)에서 그린다.
- 모바일 터치 영역은 44px이다.
- React Compiler와 `eslint-config-next`가 켜져 있다. 렌더 중에 ref를 읽거나 쓰지 않는다. effect 안의 동기 `setState`를 새로
  만들지 않는다.
- vitest는 `environment: "node"`라 컴포넌트·훅을 렌더하지 못한다. 순수 함수와 supabase 호출 함수만 단위 테스트하고
  (`src/test/queryStub.ts` 또는 `facilitySave.test.ts`의 `vi.mock` 방식), 화면은 Playwright로 본다.
- 주석은 이유·외부 제약·위험만 적는다. 다른 파일의 줄 번호·개수·상수 값을 적지 않고 심볼 이름으로 가리킨다.
- 커밋 메시지는 한국어 `type(scope): 내용`. `Co-Authored-By`를 붙이지 않고, 작업 과정(리뷰·점검)을 적지 않는다.
- 이 저장소는 `core.autocrlf=true`다. 파일은 UTF-8로 쓴다. 한글이 깨져 저장되지 않았는지 커밋 전에 확인한다
  (U+FFFD나 `뚯`·`먮`·`꾨`처럼 어색한 음절).
- Next 16 문서는 `node_modules/next/dist/docs/`에 있다(AGENTS.md). `redirects()`를 쓰기 전에 그 안의 `redirects.md`를 읽는다.

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
- Playwright는 포트 3100의 떠 있는 서버를 다시 쓴다. 앞 실행에서 남은 `next dev`가 있으면 끄고 돌린다. `next.config.mjs`를
  바꾼 뒤(Task 4)에는 반드시 서버를 새로 띄운다 — `redirects()`는 서버 시작 때 읽힌다.
- PR을 열기 전 마지막 확인은 CI와 같은 조건으로 한다: `core.autocrlf=false`로 스크래치 디렉터리에 클론해 `npm ci` 뒤 `CI=true`로
  lint·format:check·typecheck·test·`test:e2e -- --retries=0`. 작업 사본은 CRLF·`.env.local`·`.claude/worktrees` 때문에 CI와
  다르게 걸린다.

## 브랜치와 PR

`feat/admin-map-first-slopes`(main `9594602`에서). 계획 커밋부터 마지막 태스크까지 이 브랜치에 쌓고, 로컬 검증을 마친 뒤 한 번
푸시해 PR을 연다. 병합할 때 이 계획 문서를 `git rm`한다. ④(제보함)의 계획은 ③이 병합된 뒤 쓴다.

## 계획이 정한 것

1. **판정(설계 6.1).** `slopeGradeFromDeg(deg)`는 `slopeWarningFromDeg`를 옮긴다(`null` → ok, `relaxed-limit` → over,
   `extreme` → extreme). 색 `SLOPE_GRADE_COLORS = { ok: "#1B9E77", over: "#E6AB02", extreme: "#A50F15" }`, 번호 원 글자색
   `SLOPE_GRADE_ON_COLORS = { ok: "#1C1917", over: "#1C1917", extreme: "#FFFFFF" }`, 이름 `SLOPE_GRADE_LABELS = { ok: "기준 이내",
over: "1/12 초과", extreme: "확인 필요" }`. 구간 표의 판정 배지와 구간 카드가 이 이름을 쓴다.
2. **행 배지(핸드오버 우선순위).** extreme 구간이 있으면 `확인 필요 {extreme 수}구간`(tone `missing`), 아니고 over 구간이 있으면
   `1/12 초과 {over 수}구간`(tone `warn`), 아니면 `기준 이내`(tone `ok` — 새 tone, `--ku-success-bg/fg`). 저장 형식이 깨진 행은
   `형식 오류`(tone `missing`).
3. **칩(설계 6.2).** `over`(`1/12 초과 포함`) = over 또는 extreme 구간이 하나라도 있음, `extreme`(`확인 필요`) = extreme 구간이
   있음. 개수는 전체 행 기준(PR ①·②와 같다). 형식 오류 행은 두 칩 어디에도 들지 않는다. 검색은 이름만(지금과 같다).
4. **경로 요약.** 구간 수, 총 거리(저장된 구간 `distance`의 합을 0.1m로 반올림, `String(n)`으로 찍어 `12.4m`·`40m`), 최대 경사
   (`formatDeg`), 판정별 구간 수, 경계(`[[남, 서], [북, 동]]`). 행 메타는 `{구간 수}개 구간 · {총 거리}m · 최대 {x.x}° · {수정일}`,
   형식 오류 행은 `{수정일}`만. 프로파일 막대는 구간마다 `flex: distance`, 판정 색, `aria-hidden`(배지가 글자로 말한다).
5. **보기 지도.** 구간마다 react-leaflet `Polyline`, 판정 색, `lineCap: "round"`, 두께 5(선택 7). 하나를 고르면 나머지는 불투명도
   0.28. 선택 경로에만 구간 중점 번호표(`L.divIcon`, 클래스 `ku-slope-segment-label`, 22px, `interactive: false`). 선을 누르면
   그 경로를 고른다. 테스트가 잡도록 `className: "ku-slope-route ku-slope-route-{id}"`. 형식 오류 행은 그리지 않는다. 선택하면
   `focus = { key: "route:{id}", target: { bounds } }`.
6. **보기 패널(설계 6.3).** `DetailPanel` label = 경로 이름. 헤더 = 이름(h2) · `{n}개 구간 · 총 {m}m · {수정일} 수정` · 크림슨
   `경로 편집`. 본문 = 구간 표(`구간 | 거리 | 경사 | 판정`, 경사는 `{x.x}° · {y.y}%`). **삭제는 하단 바**(`DetailPanel`의 인라인
   확인, 문구 `삭제한 경사도 경로는 복구할 수 없어요.`) — 핸드오버는 헤더에 두지만, 인라인 확인은 `DetailPanel` 하단 바에 있고
   다른 두 탭과 자리를 맞춘다. 저장 버튼은 없다(`save={null}`). 삭제 성공 토스트는 지금 문구 `"{이름}" 경로를 삭제했어요`.
7. **형식 오류·없는 id(설계 6.2·3.4).** 형식 오류 행의 상세는 `저장 형식이 깨진 경로라 열 수 없어요. 지우고 다시 그려주세요` 문구와
   삭제만 둔다. `?id=X&edit=1`이 형식 오류 행이면 첫 조회 뒤 `?id=X`(보기)로 바꾼다. 없는 `?id=`는 열지 않고 URL에서 지우며
   `경로를 찾지 못했어요. 삭제됐거나 주소가 틀렸어요.` 경고 토스트(명소의 `NOT_FOUND_MESSAGE`와 같은 꼴). 목록의
   `?redirected=missing|invalid` 안내는 지운다.
8. **편집 진입과 나가기.** 보기의 `경로 편집` → `{ mode: "edit", id }`. `＋ 경로 그리기` → `{ mode: "new" }`. 편집 패널의 `✕`와
   `취소`는 같다 — 기존 경로면 `{ mode: "view", id }`, 새 경로면 `{ mode: "closed" }`. 모두 `request`(가드)를 거친다. 데스크톱에서
   편집 중 같은 행을 다시 누르면 닫힘으로 간다(보기와 같은 규칙).
9. **지도 바꿔 끼우기(설계 2.6·6.4).** 페이지는 `edit`·`new`면 `SlopeRouteMap`(key `edit:{id}`·`edit:new`), 아니면
   `SlopeWorkspaceMap`을 `renderMap`에 그린다. `SlopeRouteMap`은 `initialViewport`로 열고 `moveend`마다 `onViewportChange`를
   부른다. 기존 경로의 `fitBounds`는 지도가 하지 않는다 — 보기에서 들어오면 같은 focus key라 지도가 그대로고, `?id=&edit=1`로
   바로 들어오면 작업 화면의 focus가 `focus` 명령으로 맞춘다. 그래서 `SlopeRouteMap`도 `focus` 명령을 `onCommandsReady`로
   등록한다 — `AdminWorkspaceMap`의 `CommandsBridge` 구현을 `src/components/admin/workspace/focusMap.ts`의
   `focusWorkspaceMap(map, target, insets)`로 빼서 두 지도가 같이 쓴다. 새 경로의 현재 위치 이동은 지금대로 한다. 줌 버튼은
   `zoomControl: false` 뒤 `L.control.zoom({ position: "topleft", zoomInTitle: "확대", zoomOutTitle: "축소" })`.
10. **편집 패널(설계 6.4, 핸드오버 4장).**
    - `DetailPanel` label = `{이름} 편집`, 새 경로는 `새 경로`.
    - 헤더(데스크톱) = 저장 상태 알약(기존 경로: dirty면 `저장 안 됨` tone warn, 아니면 `저장됨` tone ok. 새 경로: `새 경로` tone
      neutral) · `{n}개 구간 · 총 {m}m` · 단위 세그먼트. 세그먼트는 `.ku-detail-segment`의 `aria-pressed` 버튼 둘, 보이는 글자
      `°`·`%`, `aria-label` `도(°)`·`퍼센트(%)`, 묶음 `role="group" aria-label="경사 단위"`.
    - 본문 = `경로 이름` 입력(레이블 연결 유지, 42px, 16px/700) · 구간 카드(`SlopeSegmentList`) · 검증 문구 목록
      (`validateRoute`, 꼭짓점이 있을 때만 — 지금 동작).
    - 하단 바 = 안내 `지도에서 꼭짓점을 끌어 경로를 고쳐요`(데스크톱만) · `취소` · `저장`(`canSave`가 아니면 비활성).
      `DetailPanel`에 `closeLabel`·`footNote` prop을 더한다.
    - 데스크톱 편집 패널에는 삭제가 없다(보기 패널에 있다). 모바일은 보기·편집을 합치므로(결정 15) 기존 경로의 편집 패널에 삭제를
      둔다 — `DetailPanel`이 모바일에서 본문 맨 아래에 그린다.
11. **구간 카드(핸드오버 4장, 설계 6.1).** `SlopeSegmentList`의 마크업을 카드로 바꾼다: 그리드 `28px 1fr auto` — 판정 색 번호 원
    26px(값이 없거나 범위 밖이면 테두리만 있는 중립 원, 글자색은 결정 1) · `구간 {n} · {d}m · = {환산값}` · 숫자 입력(72×36,
    오른쪽 정렬) + 단위. 경고 문구와 색은 지금 그대로(`WARNING_TEXT`). `label[for]`·`aria-label="구간 {n} 경사도"`를 유지한다.
12. **저장(설계 2.8).** `saveSlopeRoute`가 수정은 `updated_at` 조건(패널을 연 때의 행 값), 삽입은 `select("id").single()`로 새 id를
    받는다. 0행이면 `다른 곳에서 바뀌었거나 삭제된 경로예요. 새로고침해서 확인해주세요`(지금 문구), 오류면 `저장 실패: {message}`.
    둘 다 초안을 남긴다. 성공하면 다시 받고 `{ mode: "view", id }`로 바꾼 뒤 `경로가 수정되었어요` / `경로가 추가되었어요`. 저장
    중에는 선택(행·선·칩·닫기)과 지도 편집(그리기·끌기·도구 바)을 잠근다.
13. **도구 바(설계 2.7·6.4).** geoman `addControls`를 부르지 않는다 — 2.19.3의 `Toolbar.toggleButton`은 없는 버튼이면 false를
    돌려주고 넘어간다. 도구 바는 편집 패널이 지도 형제로 그린다(지도 자리 밖이라 확인 창이 갇히지 않는다). `role="toolbar"`
    `aria-label="경로 편집 도구"`, 기호는 `aria-hidden` 글자로 두고 이름은 글자로 읽는다.

    | 버튼(접근 이름)   | 동작                                                        | 상태                                              |
    | ----------------- | ----------------------------------------------------------- | ------------------------------------------------- |
    | `✎ 그리기`        | `map.pm.enableDraw("Line")`                                 | 선이 있으면 `disabled`                            |
    | `◇ 꼭짓점 편집`   | `disableGlobalDragMode()` 뒤 `line.pm.enable(EDIT_OPTIONS)` | `aria-pressed`, 선이 없으면 `disabled`. 기본 상태 |
    | `✥ 통째로 옮기기` | `line.pm.disable()` 뒤 `enableGlobalDragMode()`             | `aria-pressed`, 선이 없으면 `disabled`            |
    | `건물에 붙이기`   | `map.pm.setGlobalOptions({ snappable })`                    | `aria-pressed`, 기본 꺼짐                         |
    | `⌫ 지우기`        | `ConfirmModal`(지금 문구) 뒤 `resetLine`                    | 선이 없으면 `disabled`                            |

    그리는 동안(`pm:drawstart`~`pm:drawend`)은 위 버튼 대신 `끝내기`(`map.pm.Draw.Line._finishShape()`) · `마지막 꼭지점
제거`(`map.pm.Draw.Line._removeLastVertex()`) · `취소`(`map.pm.disableDraw()`)를 보인다. 앞의 둘은 geoman 자기 액션 버튼이
    부르는 비공개 메서드다(2.19.3 `dist/leaflet-geoman.js`) — 타입이 없어 `unknown`을 거쳐 좁은 타입으로 단언하고, 그 자리에 버전
    의존을 주석으로 남긴다. 저장 중에는 모든 버튼이 `disabled`다. 새 경로도 그리기를 자동으로 켜지 않는다 — 켜면
    `pm:drawstart`가 현재 위치 따라가기를 바로 끈다(2026-10-06 설계 5.4).

14. **편집 지도의 색(설계 6.4·3.6).** 미리보기 선은 판정 색, 두께 9(핸드오버 "편집 중 9"), 불투명도 0.85. 다른 경로는 판정 색,
    두께 4, 불투명도 0.55(2026-10-06 설계 12장의 두께·불투명도는 그대로). 편집선(기존 선과 geoman이 새로 그리는 선)은 클래스
    `ku-slope-edit-line`을 달고(`map.pm.setPathOptions({ className })`과 기존 선 옵션) CSS `stroke: var(--ku-text-1)`, 두께 3 —
    Leaflet 기본 파랑과 갈리지 않고 다크에서도 보인다. 꼭짓점 핸들은 핸드오버대로 14px 흰 원 + 3px `--ku-text-1` 테두리. 현재 위치
    점은 파랑 그대로(설계 3.6).
15. **모바일(핸드오버 8장, 2026-10-15 사용자 결정).** 띠 + 전체 지도 모드.
    - 행·선을 누르면 형식이 맞는 경로는 바로 `{ mode: "edit", id }`(보기·편집 합침). 형식 오류 행은 `{ mode: "view", id }`. `?id=`로
      바로 들어온 보기는 보기 패널을 그대로 보인다.
    - `AdminMapWorkspace mobileMapStrip={230}`. 상세 위쪽 230px 띠로 편집 지도가 보이고, 띠는 `pointer-events: none`이라 꼭짓점을
      띠에서 바로 끈다. 띠에서는 도구 바를 보이지 않는다.
    - 편집 패널의 `지도에서 경로 고치기`(선이 없으면 `지도에서 경로 그리기`)를 누르면 상세를 접고(`DetailPanel hidden`) 전체 지도 위에
      도구 바(위, 줄바꿈, 버튼 44px)와 아래 확인 바(`도구 바로 그리고 꼭짓점을 끌어 고쳐요` + `완료`)를 보인다. 되돌리기(취소)는
      두지 않는다 — 지도 편집은 바로 초안에 들고, 패널의 `취소`가 초안 전체를 버린다.
    - 전체 지도로 들어갈 때와 `완료`로 나올 때 각각 새 focus key로 지금 초안의 경계를 맞춘다(들어갈 때는 확인 바를 피하는 insets,
      나올 때는 띠 insets). 선이 없으면 옮기지 않는다. 명소의 `pickFocus`와 같은 방식이다.
    - 확인 바는 명소의 `.ku-landmark-pick-bar` 규칙을 같이 쓴다(선택자에 `.ku-slope-map-bar`를 더한다). 높이는
      `MOBILE_PICK_BAR`와 같다.
16. **목록 문구.** 제목 `경사도 경로`, 캡션 `구간별 경사를 기록한 보행 경로 · 총 {n}개`, 주 버튼 `＋ 경로 그리기`, 검색
    `경사도 경로 검색` / `경로명 검색`, 정렬 `경사도 경로 정렬`, 오류 `경사도 경로를 불러오지 못했어요.`, 다시 받기 실패
    `경사도 경로 목록을 새로 불러오지 못했어요`. 범례 `1/12 이내` · `1/12 초과` · `30%(16.7°) 초과`(판정 색).
17. **조회.** `slope_segments`를 `select("*").order("id")`로 한 번에 받는다(설계 2.2). 받은 행마다 `summarizeSlopeRoute`를 한 번
    돌려 `{ route, summary }`로 들고 있는다.

## 공유 인터페이스

태스크 사이에 오가는 이름과 타입이다. 여기와 다르게 짓지 않는다.

```ts
// src/lib/slopeScale.ts (Task 1)
export type SlopeGrade = "ok" | "over" | "extreme";
export const SLOPE_GRADES: readonly SlopeGrade[]; // ["ok", "over", "extreme"]
export function slopeGradeFromDeg(deg: number): SlopeGrade;
export const SLOPE_GRADE_COLORS: Record<SlopeGrade, string>;
export const SLOPE_GRADE_ON_COLORS: Record<SlopeGrade, string>;
export const SLOPE_GRADE_LABELS: Record<SlopeGrade, string>;

// src/lib/slopeWorkspace.ts (Task 1)
export interface SlopeSegmentSummary {
  index: number;
  distance: number; // 저장값 그대로(m)
  slope: number; // 도
  grade: SlopeGrade;
  from: [number, number];
  to: [number, number];
}
export interface SlopeRouteSummary {
  vertices: Vertex[];
  segments: SlopeSegmentSummary[];
  totalDistance: number; // 0.1m 반올림
  maxSlope: number;
  gradeCounts: Record<SlopeGrade, number>;
  bounds: [[number, number], [number, number]];
}
export function summarizeSlopeRoute(raw: unknown): SlopeRouteSummary | null; // readRoutePoints가 못 읽으면 null
export interface SlopeListItem {
  route: SlopeSegment;
  summary: SlopeRouteSummary | null;
}
export type SlopeChip = "over" | "extreme";
export const SLOPE_CHIPS: { key: SlopeChip; label: string }[];
export const SLOPE_COLLECTION_POLICY: AdminCollectionPolicy<
  SlopeListItem,
  SlopeChip
>; // id는 String(route.id)
export function slopeRouteBadge(summary: SlopeRouteSummary | null): {
  label: string;
  tone: "missing" | "warn" | "ok";
};
export function slopeDisplayName(route: Pick<SlopeSegment, "name">): string; // 빈 이름은 "이름 없는 경로"
export function formatMeters(value: number): string; // 12.4 → "12.4m"
export function formatSlopeRouteMeta(
  summary: SlopeRouteSummary | null,
  updatedAt: string | null,
): string;
export function verticesBounds(
  vertices: Vertex[],
): [[number, number], [number, number]] | null;

// src/lib/slopeDraft.ts (Task 2)
export interface SlopeDraftValues {
  name: string;
  vertices: Vertex[];
  slopes: (number | null)[];
}
export function slopeDraftDirty(
  current: SlopeDraftValues,
  initial: SlopeDraftValues,
): boolean;
export function resizeToSegments<T>(
  previous: T[],
  vertexCount: number,
  empty: T,
): T[];
export function draftsFromSlopes(
  slopes: (number | null)[],
  unit: SlopeUnit,
): string[];
export function redraftForUnit(
  slopes: (number | null)[],
  previous: string[],
  unit: SlopeUnit,
): string[];

// src/lib/slopeSave.ts (Task 2)
export type SlopeSaveResult =
  | { ok: true; routeId: string; created: boolean }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "error"; message: string };
export function saveSlopeRoute(input: {
  routeId: string | null;
  loadedAt: string | null;
  name: string;
  segments: SlopeRoutePoints;
}): Promise<SlopeSaveResult>;
export function deleteSlopeRoute(routeId: string): Promise<string | null>; // 실패 메시지, 성공이면 null

// src/components/slope/types.ts (Task 4)
export type SlopeEditMode = "vertex" | "drag";
export interface SlopeEditorState {
  hasLine: boolean;
  drawing: boolean;
  mode: SlopeEditMode;
  snap: boolean;
}
export interface SlopeEditorCommands {
  startDraw(): void;
  finishDraw(): void;
  removeLastVertex(): void;
  cancelDraw(): void;
  setMode(mode: SlopeEditMode): void;
  setSnap(on: boolean): void;
  reset(): void; // 지금 resetLine — 선과 미리보기를 지우고 그리기를 다시 켠다
}
/** 지도가 내놓는다. owner가 지금 편집 패널과 다르면 낡은 것이다 */
export interface SlopeEditorHandle {
  owner: string; // "edit:{id}" | "edit:new"
  state: SlopeEditorState;
  commands: SlopeEditorCommands;
}
/** 편집 패널이 내놓는다 */
export interface SlopeEditDraft {
  owner: string;
  slopes: (number | null)[];
  locked: boolean; // 저장 중
  bounds: [[number, number], [number, number]] | null; // 지금 초안의 경계(모바일 전체 지도 focus)
  onVerticesChange: (vertices: Vertex[]) => void;
}

// src/components/slope/useSlopeRouteDraft.ts (Task 4)
export function useSlopeRouteDraft(initial: {
  name: string;
  vertices: Vertex[] | null;
  slopes: (number | null)[];
}): {
  name: string;
  setName: (name: string) => void;
  vertices: Vertex[];
  slopes: (number | null)[];
  drafts: string[];
  unit: SlopeUnit;
  segments: RouteSegment[];
  errors: string[];
  dirty: boolean;
  handleVerticesChange: (vertices: Vertex[]) => void; // 참조가 바뀌지 않는다
  handleDraftChange: (index: number, raw: string) => void;
  handleUnitChange: (unit: SlopeUnit) => void;
};

// src/components/admin/workspace/focusMap.ts (Task 4)
export function focusWorkspaceMap(
  map: L.Map,
  target: WorkspaceFocusTarget,
  insets: WorkspaceInsets,
): void;
```

`SlopeRouteMap`의 props(Task 4):

```ts
interface SlopeRouteMapProps extends WorkspaceMapSlotProps {
  initialVertices: Vertex[] | null; // 마운트 때만 읽는다
  editingRouteId: string | null; // 다른 경로로 깔지 않을 경로. 새 경로면 null
  draft: SlopeEditDraft | null; // owner가 맞는 것만 페이지가 넘긴다
  onEditorChange: (editor: SlopeEditorHandle | null) => void; // 정리될 때 먼저 null
}
```

## 기존 E2E 시나리오의 행방

`admin-buildings-slopes.spec.ts`의 경사도 시나리오는 새 `e2e/admin-slopes-workspace.spec.ts`로 옮기고 원래 자리에서 지운다. 옮길 때
편집기 시나리오는 그리기 도우미(`drawRoute(page, points)`) 하나를 거치게 쓴다 — Task 4는 그 몸통이 geoman 아이콘을 누르고, Task 5가
도구 바로 바꾼다.

| `admin-buildings-slopes` 시나리오                                              | 처리                                                                                            | 태스크 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------ |
| 검색으로 목록을 좁히고 초기화한다                                              | 지우고 칩·검색·정렬 시나리오로(작업 화면에는 `초기화`가 없다)                                   | 3      |
| 경로를 삭제한다                                                                | 지우고 보기 패널의 인라인 삭제로                                                                | 3      |
| 목록에 GPX 안내·다운로드가 남지 않는다                                         | 옮긴다                                                                                          | 3      |
| 사유 없이 목록에 들어가면 리다이렉트 안내가 뜨지 않는다                        | 지운다 — `?redirected=` 안내가 없어진다(결정 7)                                                 | 3      |
| 저장 형식이 깨진 경로는 열지 않고 목록에서 알린다                              | `?id=2`로 `형식 오류` 배지와 상세 안내(3), 옛 주소를 거쳐 같은 표시(4)                          | 3, 4   |
| 없는 경로 id로 수정 화면에 가면 사유와 함께 목록으로 돌려보낸다                | 옛 주소 → 리다이렉트 → 없는 `?id=` 안내와 URL 정리                                              | 4      |
| 비로그인 상태로 수정 화면에 가면 로그인 화면으로 보낸다                        | 옮긴다. 리다이렉트 뒤 대시보드 레이아웃이 `/admin`으로 보낸다                                   | 4      |
| 비로그인 상태로 편집기에 가면 로그인 화면으로 보낸다                           | 같다                                                                                            | 4      |
| 수기 경로를 열어 값을 고쳐 저장한다                                            | 행 → `경로 편집` → 저장 → 보기(`?id=2`)와 토스트                                                | 4      |
| 수정 화면을 열면 불러온 경사값으로 미리보기 선이 그려진다                      | 기대 색을 판정 색으로(7.2° → `#E6AB02`)                                                         | 4      |
| 목록에서 경로 직접 그리기로 편집기에 들어간다                                  | `＋ 경로 그리기` → `?new=1`의 `새 경로` 패널                                                    | 4      |
| 열어둔 사이 행이 바뀌면 덮어쓰지 않고 알린다                                   | 패널판. URL은 `?id=2&edit=1`에 남는다                                                           | 4      |
| 구간 값을 넣어 저장하면 저장 포맷으로 들어간다                                 | 패널판. 저장 뒤 새 행의 보기(`?id=`)                                                            | 4      |
| 완화 한도와 급경사 경고를 표시하되 저장은 막지 않는다                          | 패널판(`저장`)                                                                                  | 4      |
| 입력한 경사도에 따라 미리보기 선 색이 바뀐다                                   | 판정 색: 1° → `#1B9E77`, 10° → `#E6AB02`, 20° → `#A50F15`                                       | 4      |
| 꼭짓점을 드래그하면 미리보기 선도 새 좌표를 따라간다                           | 패널판(구간 카드의 거리)                                                                        | 4      |
| 저장이 실패해도 그린 경로와 입력값이 남는다                                    | 패널판. URL `?new=1`에 남는다                                                                   | 4      |
| 수정 화면에서 값을 고친 채 벗어나려 하면 경고한다                              | 편집 `취소` → 가드 확인 창, 취소하면 값이 남는다                                                | 4      |
| 값을 입력한 채 벗어나려 하면 경고한다                                          | 새 경로판                                                                                       | 4      |
| 기존 수기 경로를 아무것도 고치지 않고 취소하면 경고 없이 나간다                | 편집 `취소` → 확인 없이 보기                                                                    | 4      |
| 편집기에서 저장한 경로가 공개 지도에 그대로 그려진다                           | 패널판. 공개 지도 쪽 기대 색 `#AD2936`(연속 색)은 그대로                                        | 4      |
| 편집기 지도는 19까지 확대된다                                                  | 편집 상태에서                                                                                   | 4      |
| 선을 끝내면 구간마다 번호표가 뜬다                                             | 편집 상태에서                                                                                   | 4      |
| 퍼센트로 입력하면 도로 바꿔 저장한다                                           | 단위 세그먼트(`퍼센트(%)` 버튼)                                                                 | 4      |
| 다른 단위 환산값을 보여주고 단위를 바꿔도 값이 유지된다                        | 같다                                                                                            | 4      |
| 고른 입력 단위를 기억한다                                                      | 같다(새로고침 뒤 `?new=1`)                                                                      | 4      |
| 새 경로는 받은 위치를 가운데 두고 파란 점을 찍는다                             | 편집 상태에서                                                                                   | 4      |
| 위치 권한이 없으면 점 없이 기본 위치로 연다                                    | 같다                                                                                            | 4      |
| 캠퍼스 밖 위치는 쓰지 않는다                                                   | 같다                                                                                            | 4      |
| 위치 응답 전에 지도를 끌면 화면을 옮기지 않는다                                | 같다. 끄는 자리는 패널 밖 지도                                                                  | 4      |
| 기존 경로 수정은 위치가 아니라 선에 맞춰 연다                                  | 보기 → `경로 편집`. 파란 점이 없고 미리보기 선이 보인다                                         | 4      |
| 새 경로 편집기에 다른 경로를 경사 색으로 깔고 클릭을 가로채지 않는다           | 판정 색(3° → `#1B9E77`, 7.2° → `#E6AB02`)                                                       | 4      |
| 범위 밖 각도는 미리보기에 그리지 않고 단위를 바꿔도 입력을 그대로 둔다         | 패널판                                                                                          | 4      |
| 편집기에 주변 건물을 깔고 스냅은 끈 채 시작한다                                | 4는 패널 체크박스 그대로, 5에서 `건물에 붙이기` `aria-pressed="false"`                          | 4, 5   |
| 수정 화면은 편집 중인 경로를 빼고 깔며 다른 경로는 드래그 모드에 잡히지 않는다 | 4는 geoman 아이콘, 5에서 `통째로 옮기기`                                                        | 4, 5   |
| 스냅이 켜/꺼져 있으면 건물 외곽선 근처에서 꼭짓점이 …                          | 4는 그대로, 5에서 도구 바. 패널에 가리지 않는 건물을 고른다                                     | 4, 5   |
| 폴리라인을 그리면 구간이 생기고 꼭짓점을 더 넣을 수 없다                       | 4는 geoman 아이콘, 5에서 `그리기`가 `disabled`                                                  | 4, 5   |
| 지우고 다시 그리기로 경로를 비운다                                             | 4는 패널 버튼, 5에서 도구 바 `지우기`                                                           | 4, 5   |
| 수정 화면에서 지우고 다시 그리기를 누르면 … 다시 그릴 수 있다                  | 같다                                                                                            | 4, 5   |
| 그리기 도구 문구가 한국어다                                                    | 5에서 도구 바의 `끝내기`·`마지막 꼭지점 제거`·`취소`, geoman 툴바(`.leaflet-pm-toolbar`)가 없다 | 5      |
| 모바일 폭에서도 지도가 화면 폭을 쓴다                                          | 지우고 모바일 시나리오(띠·전체 지도)로                                                          | 7      |

다른 spec:

| 파일 · 시나리오                                               | 처리                                                           | 태스크 |
| ------------------------------------------------------------- | -------------------------------------------------------------- | ------ |
| `admin-dark` · `경사도 목록` 화면                             | 그대로, `경사도 보기 패널`(`?id=2`)을 더한다                   | 3      |
| `admin-dark` · `경사도 경로 그리기`·`수정`(옛 주소)           | 경로를 `/admin/dashboard/slopes?new=1`·`?id=2&edit=1`로 바꾼다 | 4      |
| `accessibility-dialog-toast`                                  | 모바일 경사도 편집의 44px 터치 영역 시나리오를 더한다          | 7      |
| `admin-facilities-workspace`·`admin-landmarks-workspace` 전체 | 그대로 통과해야 한다(공통 단위·`DetailPanel` 변경)             | 3~7    |
| `public-map*` · 경사도 레이어·범례                            | 그대로 통과해야 한다(공개 지도 색은 연속 색)                   | —      |

E2E 좌표: 기본 viewport 1280×720에서 목록 패널(왼쪽 16~~420px)과 상세 패널(오른쪽 460px)이 지도를 덮는다. 지도를 누르거나 끄는 점은
`leaflet-container` 기준 x 520~~760, y 200~420 안에서 고른다(도구 바·줌 버튼을 피한다). 지금 spec의 `{x: 300, y: 120}` 같은 점은
목록 패널을 누른다.

## 파일 지도

| 파일                                                   | 책임                                                                                       | 태스크  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------- |
| `src/lib/slopeScale.ts`(+ test)                        | 판정·판정 색·글자색·이름                                                                   | 1       |
| `src/lib/slopeWorkspace.ts`(+ test)                    | 경로 요약, 칩 정책, 배지, 메타, 경계                                                       | 1       |
| `src/lib/slopeDraft.ts`(+ test)                        | 편집 초안 비교·구간 수 맞추기·단위 바꾸기 문자열                                           | 2       |
| `src/lib/slopeSave.ts`(+ test)                         | 삽입·조건부 수정·삭제                                                                      | 2       |
| `src/components/admin/slopes/SlopeListRow.tsx`         | 행(이름·배지·프로파일 막대·메타)                                                           | 3       |
| `src/components/admin/slopes/SlopeWorkspaceMap.tsx`    | 보기 지도(판정 색 선, 선택 강조, 번호표)                                                   | 3       |
| `src/components/admin/slopes/SlopeViewPanel.tsx`       | 보기 패널(구간 표·`경로 편집`·삭제), 형식 오류 상세                                        | 3       |
| `src/app/admin/dashboard/slopes/page.tsx`              | 조회·목록·선택·지도 바꿔 끼우기·상세를 잇는다                                              | 3~7     |
| `src/components/admin/workspace/focusMap.ts`           | `focusWorkspaceMap`(두 지도가 같이 쓴다)                                                   | 4       |
| `src/components/admin/workspace/AdminWorkspaceMap.tsx` | `focusWorkspaceMap`을 쓴다                                                                 | 4       |
| `src/components/admin/workspace/DetailPanel.tsx`       | `closeLabel`·`footNote`                                                                    | 4       |
| `src/components/slope/types.ts`                        | 지도 ↔ 패널 주고받는 타입                                                                  | 4       |
| `src/components/slope/useSlopeRouteDraft.ts`           | `SlopeRouteEditor`의 상태·검증·dirty·단위 기억                                             | 4       |
| `src/components/slope/SlopeRouteMap.tsx`               | 작업 화면 지도 자리용으로: viewport·focus·편집기 손잡이·잠금·판정 색                       | 4, 5    |
| `src/components/slope/SlopeSegmentList.tsx`            | 구간 카드                                                                                  | 4       |
| `src/components/admin/slopes/SlopeEditPanel.tsx`       | 편집 패널(알약·단위·이름·구간 카드·저장·취소), 도구 바·확인 창·모바일 확인 바를 형제로     | 4, 5, 7 |
| `src/components/admin/slopes/SlopeEditToolbar.tsx`     | 도구 바                                                                                    | 5       |
| `next.config.mjs`                                      | `redirects()`                                                                              | 4       |
| `src/app/admin/slopes/new/page.tsx`, `[id]/page.tsx`   | 지운다                                                                                     | 4       |
| `src/components/SlopeRouteEditor.tsx`                  | 지운다(훅과 패널로 옮긴다)                                                                 | 4       |
| `src/app/admin/admin-ui.css`                           | 경사도 행·표·패널·카드·도구 바·모바일, 번호표 선택자 일반화, 옛 geoman 액션 배치 규칙 삭제 | 3~7     |
| `e2e/admin-slopes-workspace.spec.ts`                   | 경사도 작업 화면 전부                                                                      | 3~7     |
| `e2e/admin-buildings-slopes.spec.ts`                   | 경사도 시나리오를 빼고 `admin-buildings.spec.ts`로 이름을 바꾼다                           | 3~8     |

## Tasks

### Task 0: PR ② 계획 은퇴와 이 계획 커밋

PR ②는 병합됐는데 계획 문서(`docs/plans/2026-10-15-admin-map-first-pr2.md`)가 남아 있다(계획 문서 생애 규칙 위반).

```bash
git rm docs/plans/2026-10-15-admin-map-first-pr2.md
git commit -m "docs: 병합된 관리자 지도 우선 리디자인 ②의 구현 계획을 은퇴시킨다"
git add docs/plans/2026-10-15-admin-map-first-pr3.md
git commit -m "docs: 관리자 지도 우선 리디자인 ③의 구현 계획을 둔다"
```

### Task 1: 판정과 경로 요약 — `slopeScale.ts`, `slopeWorkspace.ts`

**Files:** Modify `src/lib/slopeScale.ts`, `src/lib/slopeScale.test.ts`. Create `src/lib/slopeWorkspace.ts`, `src/lib/slopeWorkspace.test.ts`.

**Produces:** 공유 인터페이스의 `slopeScale.ts`·`slopeWorkspace.ts` 부분.

RED(vitest)에 적을 것:

- `slopeGradeFromDeg` — 경계값은 `slopeWarningFromDeg` 테스트와 같은 값으로:
  ```ts
  expect(slopeGradeFromDeg(0)).toBe("ok");
  expect(slopeGradeFromDeg(percentToDeg(100 / 12))).toBe("ok");
  expect(slopeGradeFromDeg(percentToDeg(8.34))).toBe("over");
  expect(slopeGradeFromDeg(percentToDeg(30))).toBe("over");
  expect(slopeGradeFromDeg(16.71)).toBe("extreme");
  expect(slopeGradeFromDeg(45)).toBe("extreme");
  ```
  `SLOPE_GRADE_COLORS`는 설계 2.1의 세 값, `SLOPE_GRADE_ON_COLORS`는 결정 1의 값을 그대로 단언한다.
- `summarizeSlopeRoute`:
  - 목 픽스처 경로 2(`[{lat:37.5861,lng:127.0268,ele:null},{lat:37.5862,lng:127.0269,ele:null,slope:7.2,distance:12.4}]`) →
    구간 1개, `totalDistance` 12.4, `maxSlope` 7.2, `gradeCounts` `{ ok: 0, over: 1, extreme: 0 }`, `vertices` 두 점,
    `segments[0]`의 `from`·`to`가 두 좌표.
  - 세 구간(3°·10°·20°, 거리 10.04·20.03·5.01) → `totalDistance` 35.1, `maxSlope` 20, `gradeCounts` `{ ok: 1, over: 1, extreme: 1 }`,
    `bounds`가 꼭짓점의 최소·최대.
  - 깨진 형식(`slope` 없는 점, 점 하나, 배열 아님) → `null`.
- `slopeRouteBadge`: `null` → `형식 오류`/missing, extreme 2개 + over 1개 → `확인 필요 2구간`/missing, over 3개 → `1/12 초과 3구간`/warn,
  모두 ok → `기준 이내`/ok.
- 칩과 개수 — `viewAdminCollection(items, SLOPE_COLLECTION_POLICY, …)`로: ok만인 경로·over 있는 경로·extreme 있는 경로·형식 오류 경로
  넷이면 `chipCounts` `{ all: 4, over: 2, extreme: 1 }`. 검색은 이름으로 거르고, 정렬 셋은 `adminCollection` 테스트가 이미 본다.
  `id`는 숫자 id도 문자열로(`String(2)`).
- `formatSlopeRouteMeta`: 요약이 있으면 `1개 구간 · 12.4m · 최대 7.2° · {formatAdminUpdatedAt(값)}`, `null`이면 날짜만.
- `formatMeters(40)` → `40m`, `formatMeters(12.4)` → `12.4m`. `verticesBounds([])` → `null`.

GREEN: `slopeGradeFromDeg`는 `slopeWarningFromDeg`를 부른다 — 경계와 허용오차를 다시 쓰지 않는다(설계 6.1). 요약은
`readRoutePoints` → `readStoredVertices`·`readStoredSlopes`로 만든다.

커밋: `test(slope-workspace): 경사 판정과 경로 요약·칩·배지를 적는다` → `feat(slope-workspace): 경사 판정 3색과 경로 요약·칩·배지를 둔다`.

### Task 2: 편집 초안과 저장 — `slopeDraft.ts`, `slopeSave.ts`

**Files:** Create `src/lib/slopeDraft.ts`(+ test), `src/lib/slopeSave.ts`(+ test).

**Consumes:** `slopeRoute.ts`의 `Vertex`, `slopeScale.ts`의 `formatSlopeInput`·`isSlopeDegInRange`·`SlopeUnit`.
**Produces:** 공유 인터페이스의 `slopeDraft.ts`·`slopeSave.ts` 부분.

`SlopeRouteEditor.tsx`의 `verticesEqual`·`slopesEqual`·dirty 식·`handleVerticesChange`의 길이 맞추기·`handleUnitChange`의 문자열
다시 쓰기를 옮긴다. RED에 적을 것:

- `slopeDraftDirty`: 이름 앞뒤 공백만 바뀐 것은 아니다 / 값이 같은 새 꼭짓점 배열은 아니다(지도가 마운트만 해도 배열을 새로
  만든다) / 꼭짓점 좌표 하나가 바뀌면 맞다 / 경사 하나가 바뀌면 맞다 / 새 경로(초기 꼭짓점 `[]`)에 이름만 넣어도 맞다.
- `resizeToSegments(prev, vertexCount, empty)`: 구간 수(`max(0, vertexCount - 1)`)가 같으면 **같은 참조**를 돌려준다, 다르면 `empty`로
  채운 새 배열.
- `draftsFromSlopes([7.2, null], "deg")` → `["7.2", ""]`, `"percent"` → `["12.63", ""]`.
- `redraftForUnit`: 범위 안 값은 새 단위 문자열, `null`·범위 밖(`181`)은 이전 문자열을 그대로(2026-10-06 설계 3.2).
- `saveSlopeRoute`(`facilitySave.test.ts`처럼 `vi.mock("@/lib/supabaseClient")`):
  - 새 경로: `insert({ name, gpx_file: null, segments })` → `select("id")` → `single()`. 성공이면
    `{ ok: true, routeId: "9", created: true }`(숫자 id도 문자열로), 오류면 `{ ok: false, reason: "error", message }`.
  - 기존 경로: `update({ name, segments })` → `eq("id", routeId)` → `eq("updated_at", loadedAt)` → `select("id")`. 행이 오면
    `{ ok: true, routeId, created: false }`, 빈 배열이면 `{ ok: false, reason: "conflict" }`, 오류면 error.
    `loadedAt`이 `null`이면 `eq("updated_at", "")`(지금 동작 — 어떤 행에도 맞지 않아 conflict가 된다).
- `deleteSlopeRoute`: `delete().eq("id", routeId)`, 오류면 `삭제 실패: {message}`, 성공이면 `null`.

커밋: `test(slope-draft): 편집 초안 비교와 단위 문자열 다시 쓰기를 적는다` → `feat(slope-draft): 경사도 편집 초안 비교를 순수 함수로
뺀다`, `test(slope-save): 경로 삽입·조건부 수정·삭제 호출을 적는다` → `feat(slope-save): 경로 저장과 삭제 호출을 둔다`.

### Task 3: 작업 화면 — 목록·보기 지도·보기 패널·삭제

**Files:** Rewrite `src/app/admin/dashboard/slopes/page.tsx`. Create `src/components/admin/slopes/SlopeListRow.tsx`,
`SlopeWorkspaceMap.tsx`, `SlopeViewPanel.tsx`. Modify `src/app/admin/admin-ui.css`, `e2e/admin-dark.spec.ts`,
`e2e/admin-buildings-slopes.spec.ts`. Create `e2e/admin-slopes-workspace.spec.ts`.

**Consumes:** Task 1 전부, Task 2의 `deleteSlopeRoute`, PR ①의 공통 단위.

페이지는 명소 페이지를 본뜬다(`loadRequestRef`·`disposedRef`·`loadedRef`, 첫 성공에서만 페이지 맞추기, 없는 `?id=` 정리,
`requestSelection`, `useWorkspaceCloseRequest`, `clearSelectionThen`, `handleDeleted`). 다른 점:

- `useWorkspaceSelection({ allowEdit: true })`, 조회 뒤 확인은 `readWorkspaceState(location.search, { allowEdit: true })`.
- 이 태스크에서 `edit`·`new` 상태는 아직 그릴 것이 없다. `state.mode === "edit"`이면 보기 패널을 그린다(Task 4가 바꾼다).
  `new`는 상세 없이 둔다. `＋ 경로 그리기`는 `request({ mode: "new" })`만 부른다.
- 형식 오류 `?id=X&edit=1`을 첫 조회 뒤 `?id=X`로 바꾸는 처리(결정 7)는 여기서 넣는다.
- `AdminMapWorkspace mobileMapStrip={230}`(모바일 시나리오는 Task 7).
- `.ku-slope-route-map .ku-slope-segment-label` 선택자를 `.ku-slope-segment-label`로 넓힌다(보기 지도도 쓴다). `.ku-row-badge[data-tone="ok"]`를
  `--ku-success-bg/fg`로 더한다.

RED(새 `e2e/admin-slopes-workspace.spec.ts`, 목 행을 테스트 안에서 더한다 — 공용 픽스처는 공개 지도 spec이 기대므로 바꾸지 않는다):

- 칩 개수와 거르기(`전체`·`1/12 초과 포함`·`확인 필요`), 검색, 정렬, `{n}개 표시`, 조건에 맞는 항목이 없을 때 문구. 검색 칸
  placeholder `경로명 검색`, GPX 문구·`다운로드` 버튼이 없다.
- 행: 이름 · 배지 문구(결정 2의 넷) · 메타(`1개 구간 · 12.4m · 최대 7.2° · …`) · 프로파일 막대 칸 수 = 구간 수.
- 행을 누르면 보기 패널이 열리고 URL `?id=`. 같은 행을 다시 누르면 닫힌다. 선(`path.ku-slope-route-1`)을 누르면 그 행이 선택된다.
  다른 페이지 항목의 선을 누르면 목록이 그 페이지로 간다.
- 선택하면 나머지 선의 `stroke-opacity`가 0.28, 선택 경로에만 번호표(`.ku-slope-segment-label`). 선 색은 판정 색
  (경로 1 3° → `#1B9E77`, 경로 2 7.2° → `#E6AB02`).
- 보기 패널: 제목·메타·`경로 편집`, 구간 표 한 줄(`1` · `12.4m` · `7.2° · 12.6%` · `1/12 초과`).
- 인라인 삭제: `삭제` → `삭제한 경사도 경로는 복구할 수 없어요.` → 취소면 남는다 → `삭제`면 행·선이 사라지고 패널이 닫히고
  토스트 `"정문-중앙광장" 경로를 삭제했어요`. 늦게 끝난 삭제가 그사이 연 다른 상세를 닫지 않는다.
- 형식 오류 행(`segments`에서 `slope`를 뺀다): 배지 `형식 오류`, 지도에 선이 없다, 상세는 안내 문구와 `삭제`만(`경로 편집` 없음).
- 조회가 늦게 끝나도 `?id=2`가 그 경로를 연다. 없는 `?id=999`는 열지 않고 URL에서 지우고 경고 토스트(결정 7).
- 조회 실패 → `다시 시도`.
- `admin-dark`의 `SCREENS`에 `{ name: "경사도 보기 패널", path: "/admin/dashboard/slopes?id=2" }`.
- `admin-buildings-slopes.spec.ts`에서 위 표의 Task 3 행을 지운다. 편집기 시나리오는 옛 라우트로 아직 통과해야 한다(옛 페이지는
  Task 4까지 남는다).

GREEN: `SlopeListRow`, `SlopeWorkspaceMap`(`AdminWorkspaceMap` + react-leaflet `Polyline`·`Marker`), `SlopeViewPanel`, 페이지, CSS.

커밋: `test(slopes-workspace): 경사도 목록·보기 지도·보기 패널·삭제 시나리오를 적는다` →
`feat(slopes-workspace): 경사도를 지도 작업 화면으로 바꾸고 판정 색 선과 보기 패널을 둔다`.

### Task 4: 편집 상태 — 편집 패널·지도 바꿔 끼우기·저장·옛 라우트

**Files:** Create `src/components/slope/types.ts`, `src/components/slope/useSlopeRouteDraft.ts`,
`src/components/admin/slopes/SlopeEditPanel.tsx`, `src/components/admin/workspace/focusMap.ts`. Modify
`src/components/slope/SlopeRouteMap.tsx`, `src/components/slope/SlopeSegmentList.tsx`,
`src/components/admin/workspace/AdminWorkspaceMap.tsx`, `src/components/admin/workspace/DetailPanel.tsx`,
`src/app/admin/dashboard/slopes/page.tsx`, `next.config.mjs`, `src/app/admin/admin-ui.css`, `e2e/admin-dark.spec.ts`. Delete
`src/app/admin/slopes/new/page.tsx`, `src/app/admin/slopes/[id]/page.tsx`, `src/components/SlopeRouteEditor.tsx`.

**Consumes:** Task 1·2 전부. **Produces:** 공유 인터페이스의 `types.ts`·`useSlopeRouteDraft`·`focusWorkspaceMap`, `SlopeRouteMap` props.

먼저 `node_modules/next/dist/docs/` 아래 `redirects.md`를 읽고 설계 6.5의 확인(쿼리 병합, `permanent: false`가 307)이 그대로인지 본다.

- `next.config.mjs`:
  ```js
  async redirects() {
    // 리디자인을 되돌릴 수 있는 동안 옛 주소를 호환 진입점으로 둔다(설계 2026-10-14 6.5). new가 :id에 먼저 잡히지 않게 위에 둔다
    return [
      { source: "/admin/slopes/new", destination: "/admin/dashboard/slopes?new=1", permanent: false },
      { source: "/admin/slopes/:id", destination: "/admin/dashboard/slopes?id=:id&edit=1", permanent: false },
    ];
  },
  ```
- `useSlopeRouteDraft`: `SlopeRouteEditor`의 상태와 `readUnitPreference`·`writeUnitPreference`를 옮기고 Task 2의 순수 함수로 계산한다.
  `localStorage`를 첫 렌더에 읽어도 되는 이유 주석은 새 조건으로 고친다 — 편집 패널은 조회가 끝난 뒤 클라이언트에서만 그려지고,
  `?new=1`도 서버 스냅숏(`""`)에서는 닫힘이라 서버 렌더링을 거치지 않는다.
- `SlopeRouteMap`: props는 공유 인터페이스대로. 바뀌는 것:
  - 컨테이너는 지도 자리를 채운다(`width: 100%; height: 100%`, 클래스 `ku-slope-route-map`). 테두리·반경을 지운다.
  - `setView(initialViewport.center, initialViewport.zoom)`로 연다. 기존 경로의 `fitBounds`를 지운다(결정 9). `moveend`에서
    `onViewportChange`. `focus` 명령을 `onCommandsReady`로 등록하고 정리 때 먼저 `null`(설계 3.2).
  - `onResetReady`를 지우고 `SlopeEditorHandle`을 `onEditorChange`로 내놓는다. 명령 객체는 마운트 effect에서 한 번 만들고, 상태
    (`hasLine`·`drawing`·`mode`·`snap`)가 바뀔 때마다 `{ owner, state, commands }`를 다시 내놓는다. `drawing`은 `pm:drawstart`·
    `pm:drawend`로 안다. 명령 일곱 개를 다 구현한다(결정 13의 표) — 이 태스크의 패널은 `reset`·`setSnap`만 쓰고, 나머지는 Task 5가
    E2E로 확인한다. `snapToBuildings` prop은 지운다(`setSnap`이 맡는다).
  - `draft`(owner가 맞는 것)에서 `slopes`·`onVerticesChange`·`locked`를 ref로 읽는다. `draft`가 없으면 미리보기 없이 두고 꼭짓점
    알림은 버린다(패널이 곧 내놓는다. 첫 알림은 패널의 초기값과 같은 꼭짓점이다).
  - `locked`가 켜지면 `disableDraw`·`disableGlobalDragMode`·`line.pm.disable()`, 꺼지면 지금 `mode`로 되돌린다.
  - 미리보기·다른 경로·편집선 색은 결정 14. 이 태스크에서는 geoman 툴바(`addControls`)를 그대로 둔다 — Task 5가 지운다.
- `focusMap.ts`: `CommandsBridge`의 `fitBounds` 식과 `MAX_ZOOM`·`FOCUS_MIN_ZOOM`을 옮기고 `AdminWorkspaceMap`이 그것을 부른다.
- `DetailPanel`: `closeLabel?: string`(주면 데스크톱·모바일 모두 그 글자), `footNote?: ReactNode`(데스크톱 하단 바 왼쪽).
  시설·명소는 넘기지 않으므로 그대로다.
- `SlopeSegmentList`: 결정 11의 카드.
- `SlopeEditPanel`(props: `route: SlopeSegment | null`, `summary: SlopeRouteSummary | null`, `editor: SlopeEditorHandle | null`,
  `onDraftChange(draft: SlopeEditDraft)`, `onSaved(routeId, created): Promise<void>`, `onCancel()`, `showToast`):
  결정 10·12. 패널을 연 때의 `route.updated_at`을 `useState` 초기값으로 잡아 저장 조건에 쓴다. `useUnsavedChanges(dirty)`.
  이 태스크에서만 쓰는 임시 조작 둘 — `건물 외곽선에 붙이기` 체크박스(`editor.commands.setSnap`)와 `경로 지우고 다시 그리기`
  버튼 + `ConfirmModal`(지금 문구, `editor.commands.reset`). Task 5가 도구 바로 옮기고 지운다.
- 페이지: `edit`·`new`면 `SlopeRouteMap`(next/dynamic `ssr: false`)과 `SlopeEditPanel`(key `edit:{id}`·`edit:new`)을 그린다.
  `draft`·`editor`를 owner로 걸러 넘긴다(명소의 `activeDraft`와 같다). `saving = activeDraft?.locked`면 `requestSelection`이 막는다.
  편집 상태의 focus도 보기와 같은 `route:{id}`다 — key가 같아 바꿔 끼울 때 지도를 옮기지 않는다.
  `handleSaved`는 다시 받은 뒤 아직 그 편집 상태일 때만(`new`면 `mode === "new"`, 기존이면 `mode === "edit" && id` 같음)
  `{ mode: "view", id }`로 바꾼다. 보기 패널의 `경로 편집`과 `＋ 경로 그리기`를 잇는다.
- 지운 파일의 import가 남지 않게 한다. `README`·설계 문서의 언급은 Task 8이 고친다.

RED(새 spec에 옮기고 원래 자리에서 지운다 — 위 표의 Task 4 행 전부, 그리고):

- 옛 주소: `page.request.get("/admin/slopes/new", { maxRedirects: 0 })`가 307이고 `location`이 `/admin/dashboard/slopes?new=1`.
  `/admin/slopes/2`는 `?id=2&edit=1`. 겹친 쿼리 `/admin/slopes/2?new=1`로 들어가면 `new`가 이긴다(설계 3.4) — `새 경로` 패널.
- 보기 → `경로 편집` → 지도가 편집 지도(`.ku-slope-route-map`)로 바뀌어도 화면이 그대로다 — 보기의 선
  `path.ku-slope-route-2`와 편집의 미리보기 선(`.slope-preview-pane path`)의 bounding box 중심이 2px 안에서 같다. `취소` → 보기
  지도로 돌아오고 같은 비교가 성립한다.
- `?id=2&edit=1`로 바로 들어오면 경로가 패널 밖 지도 영역에 들어온다(선의 bounding box가 목록·상세 패널과 겹치지 않는다).
- 저장 중에는 행 클릭·닫기가 막힌다(저장 응답을 `page.route`로 붙잡아 둔다). 늦은 저장 응답 뒤 보기로 간다.
- 알약: 기존 경로를 열면 `저장됨`, 값을 고치면 `저장 안 됨`. 새 경로는 `새 경로`.
- `admin-dark`의 옛 주소 두 줄을 결정된 새 주소로 바꾼다.

커밋: `test(slopes-workspace): 편집 패널·저장·옛 주소 리다이렉트 시나리오를 옮겨 적는다` →
`feat(slopes-workspace): 경로 편집을 작업 화면의 패널로 옮기고 옛 편집 주소를 리다이렉트한다`.

### Task 5: 도구 바

**Files:** Create `src/components/admin/slopes/SlopeEditToolbar.tsx`. Modify `SlopeEditPanel.tsx`, `SlopeRouteMap.tsx`,
`admin-ui.css`, `e2e/admin-slopes-workspace.spec.ts`.

**Consumes:** Task 4의 `SlopeEditorHandle`.

- `SlopeRouteMap`에서 `map.pm.addControls`와 `Toolbar.setButtonDisabled` 호출을 지운다. `lockDrawButton`은 `disableDraw("Line")`만
  남긴다.
- `SlopeEditToolbar`(props: `editor: SlopeEditorHandle | null`, `locked: boolean`, `onResetRequest()`): 결정 13. `editor`가 없으면
  그리지 않는다. 데스크톱은 목록 패널과 상세 패널 사이 지도의 가운데 위(`top: 16px`), 좁은 폭(`ADMIN_NARROW_QUERY` 경계의 CSS
  미디어 쿼리)에서는 목록이 숨으므로 그만큼 왼쪽으로. 모바일 배치는 Task 7.
- `SlopeEditPanel`: Task 4의 임시 체크박스·버튼을 지우고 도구 바를 `DetailPanel`의 형제로 그린다. `⌫ 지우기` → 패널의
  `ConfirmModal`(지금 문구) → `editor.commands.reset()`.
- CSS: `.ku-slope-toolbar`(흰 표면 토큰, radius 10, 그림자 `--ku-shadow-floating`, 버튼 38px, 활성 `--ku-primary-soft-bg`/
  `--ku-primary-text`), 옛 `.ku-slope-route-map .button-container …` 액션 세로 배치 규칙 삭제, 꼭짓점 핸들(결정 14).
- spec의 `drawRoute` 도우미를 도구 바로 바꾸고(`그리기` → 점 클릭 → `끝내기`), 위 표의 Task 5 행을 도구 바판으로 고친다. 더할 것:
  - 그리기 중에는 도구 바에 `끝내기`·`마지막 꼭지점 제거`·`취소`만 보이고, `마지막 꼭지점 제거`가 찍은 점을 하나 빼고, `취소`는
    선 없이 그리기를 끝낸다.
  - `꼭짓점 편집`과 `통째로 옮기기`는 서로 하나만 눌린다(`aria-pressed`). 통째로 옮긴 뒤 구간 값은 그대로, 거리는 그대로다.
  - 저장 중에는 도구 바 버튼이 모두 `disabled`다.
  - `.leaflet-pm-toolbar`가 없다.

커밋: `test(slopes-workspace): 편집 도구 바 시나리오를 적는다` → `feat(slopes-workspace): geoman 툴바 대신 지도 위 편집 도구 바를 둔다`.

### Task 6: 저장 안 한 변경

PR ①의 가드를 편집 패널이 쓴다(Task 4의 `useUnsavedChanges(dirty)`). RED는 시설·명소 spec의 가드 시나리오 중 화면별로 다른 것만:

- 구간 값을 고친 채 다른 행·칩·검색을 누르면 묻고, 취소하면 값이 남는다. `나가기`면 그 행의 보기다.
- 헤더 메뉴(`명소`)로 나가기 전에 묻는다. 같은 화면 메뉴(`경사도`)는 편집을 닫는다(가드를 거친다).
- 브라우저 뒤로가기 전에 묻는다. 저장한 뒤에는 새로고침 경고가 풀린다.
- 새 경로에 선만 그린 것도 dirty다(이름·값 없이).
- 꼭짓점만 끌어 옮긴 것도 dirty다.

커밋: `test(slopes-workspace): 경사도 편집의 저장 안 한 변경 확인을 적는다` → 고칠 것이 나오면 그 결함을 이름으로 적은
`fix(slopes-workspace): …`.

### Task 7: 모바일

결정 15를 구현한다.

- 페이지: 모바일에서 `select(id)`는 형식이 맞는 경로면 `{ mode: "edit", id }`. 전체 지도 상태(`fullMapOwner`)와 그 focus
  (`fullMapFocus`)를 명소의 `pickOwner`·`pickFocus`처럼 들고 `AdminMapWorkspace mobilePicking`에 넘긴다. 들어갈 때·나올 때의 경계는
  `activeDraft.bounds`.
- `SlopeEditPanel`: `onFullMapChange(open: boolean, closed?: boolean)` prop(명소의 `onPickingChange`와 같은 뜻), `지도에서 경로
고치기`/`그리기` 버튼, `DetailPanel hidden`, 확인 바(`.ku-slope-map-bar`, `완료`), 전체 지도일 때만 도구 바. 고르기 버튼과 확인
  바 사이 초점 옮기기는 명소와 같다. 기존 경로면 `remove`(결정 10)를 모바일에서 넘긴다.
- CSS: `.ku-landmark-pick-bar` 규칙 선택자에 `.ku-slope-map-bar`를 더하고, `types.ts`의 높이 주석에 같이 적는다. 모바일
  `.ku-slope-toolbar`는 `top: 12px; left: 12px; right: 12px`, 줄바꿈, 버튼 44px. 구간 카드 입력 44px, 단위 세그먼트 44px.

RED(390×844):

- 바텀시트·검색·칩, 행 최소 높이 64px(공통 단위가 이미 보장하므로 경사도 행 하나로 확인).
- 행을 누르면 바로 편집 패널(URL `?id=&edit=1`), 위쪽 230px 띠(`.ku-detail-panel-strip` 높이 230), 띠 안에 경로 선이 보인다.
- 띠에서 꼭짓점을 끌면 구간 카드 거리가 바뀐다.
- `지도에서 경로 고치기` → 상세가 숨고 도구 바와 `완료`가 보인다 → `통째로 옮기기` 뒤 끌기 → `완료` → 상세가 다시 보이고 값이 남는다.
- `＋ 추가` → `지도에서 경로 그리기` → 그리기·끝내기 → `완료` → 구간 카드가 생긴다.
- 기존 경로의 편집 패널 본문 맨 아래에 `삭제`.
- 하단 `취소`/`저장` 50px. `accessibility-dialog-toast`에 "모바일 경사도 편집의 버튼이 44px 터치 영역을 확보한다"(도구 바·세그먼트·
  카드 입력·`지도에서 경로 고치기`·`완료`).

커밋: `test(slopes-workspace): 모바일 경사도 편집 시나리오를 적는다` →
`feat(slopes-workspace): 모바일에서 보기·편집을 합치고 전체 지도에서 경로를 고친다`.

### Task 8: 문서와 마무리

- 대체 배너(설계 머리 "대체하는 기존 문서" 표의 ③ 두 줄). 각 문서의 머리 40줄을 먼저 읽고, 이미 있는 배너 아래에 날짜를 붙여 더한다:
  - `docs/specs/2026-08-30-manual-slope-route-design.md` — 5.4 편집기 동작(툴바 버튼 잠금·다시 그리기 버튼), 5.6 목록 페이지 변경
    (`/admin/slopes/new`·`[id]` 화면), 5.7 삭제 확인 모달.
  - `docs/specs/2026-10-06-slope-units-and-editor-design.md` — 5.1 배치, 5.6 geoman 액션 버튼 배치, 11.1 "편집기 미리보기도 같은
    `slopeColorFromDeg`", 12장 다른 경로 색.
- 설계(`2026-10-14-admin-map-first-redesign-design.md`)에 이 계획이 정한 것을 옮긴다: 6장에 결정 2·4·6(삭제 자리)·7(없는 id 문구)·
  10·13·14·15·16, 2.5에 경사도 모바일 한 줄. 3.1의 "남는 의존은 아직 옮기지 않은 경사도·제보함 화면" → 제보함만. 2.12 마지막 줄
  (옛 경사도 편집 라우트의 토스트 모양)은 리다이렉트로 바뀌었다고 날짜를 붙여 고친다. 맞지 않는 문장을 고친다.
- `admin-ui.css`의 `.ku-admin-content > :not(.ku-map-workspace)` 위 주석에서 경사도를 뺀다.
- `e2e/admin-buildings-slopes.spec.ts`를 `git mv`로 `e2e/admin-buildings.spec.ts`로 바꾸고 describe 제목을 `건물 관리자 흐름`으로.
- README: 기능 소개의 경사도 경로 관리 문장, 파일 트리(`dashboard/slopes`, `slopes/new`·`[id]` 삭제, `SlopeRouteEditor` 삭제,
  `components/admin/slopes/`, `slope/useSlopeRouteDraft.ts`·`types.ts`, `lib/slopeWorkspace.ts`·`slopeDraft.ts`·`slopeSave.ts`),
  vitest 파일·테스트 수와 목록, Playwright 시나리오 수(명령으로 다시 센다), E2E 표(`admin-slopes-workspace.spec.ts` 추가,
  `admin-buildings.spec.ts` 이름).
- 역추적: 아래의 모든 줄을 (a) 고침 (b) 날짜가 붙은 당시 기록 (c) 상관없음으로 나눠 PR 본문에 적는다.
  ```bash
  rg -n "SlopeRouteEditor|admin/slopes/|onResetReady|redirected=|경로 직접 그리기|경로 저장|admin-buildings-slopes|slopeColorFromDeg|건물 외곽선에 붙이기" docs src e2e README.md
  ```
  `docs/specs/2026-10-14-admin-map-first-handoff/`는 받은 그대로 두는 원문이라 (b)다.
- 검증 방법 절의 CI 조건 재현을 돌리고 결과를 PR 본문에 적는다. 푸시(`-u origin feat/admin-map-first-slopes`)하고 PR을 연다.
  병합할 때 이 계획을 `git rm`한다.

커밋: `docs: 경사도 작업 화면을 README와 설계서에 반영하고 옛 경사도 설계에 대체 표시를 단다`(spec 이름 바꾸기는
`test: 경사도 시나리오가 빠진 건물 spec의 이름을 바꾼다`로 따로).
