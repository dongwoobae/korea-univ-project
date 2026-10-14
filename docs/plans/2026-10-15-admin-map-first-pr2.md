# 관리자 지도 우선 리디자인 ② 구현 계획 — 명소

> **For agentic workers:** 태스크 순서대로 TDD(RED → GREEN → REFACTOR)로 구현한다. 태스크마다 테스트를 먼저 커밋하고, 기대한
> 이유로 실패하는지 본 뒤 구현을 커밋한다. 이 계획은 태스크의 범위·결정·시나리오를 정한다. 코드는 PR ①이 만든 같은
> 자리의 코드(아래 "참고 구현")를 본떠 쓴다.

**Goal:** 명소 탭을 독립 시설 탭과 같은 지도 작업 화면으로 바꾼다. 지도가 화면을 채우고 왼쪽에 목록, 오른쪽에 상세 패널이
뜬다. `LandmarkFormModal`을 상세 패널로 대체하고 지운다.

**Architecture:** 순수 로직(칩 조건·번역 판정·초안 비교·저장 payload)은 `src/lib/landmarkWorkspace.ts`, 저장·사진·번역 채우기
호출은 `src/lib/landmarkSave.ts`에 두고 vitest로 고정한다. 화면은 PR ①의 공통 단위(`src/components/admin/workspace/*`)를
그대로 쓰고, 명소 고유 단위는 `src/components/admin/landmarks/`에 둔다. 공통 단위는 모바일 지도 띠를 끄는 옵션 하나만 더한다.

**Tech Stack:** Next.js 16.2.4 App Router, React 19.2.4(React Compiler), react-leaflet 5 + Leaflet 1.9, `@supabase/supabase-js`
2.105, Vitest 3(node 환경), Playwright 1.61(목 백엔드).

**Spec:** `docs/specs/2026-10-14-admin-map-first-redesign-design.md`(이하 "설계 N.N") 5장·2.2·2.3·2.5·3장. 화면 값의 원본은
`docs/specs/2026-10-14-admin-map-first-handoff/README.md`(이하 "핸드오버") 1·3·8장과 Interactions다. 계획과 설계가 다르면
설계가 맞다 — 멈추고 보고한다.

**참고 구현(PR ①, main `8bc13fb`):** `src/app/admin/dashboard/facilities/page.tsx`, `src/components/admin/facilities/*`,
`src/lib/facilityWorkspace.ts`·`facilitySave.ts`와 그 테스트, `e2e/admin-facilities-workspace.spec.ts`.

## Global Constraints

- 범위는 설계 1장의 PR ②(설계 5장)다. 경사도·제보함·건물 화면은 바꾸지 않는다. 독립 시설 화면의 동작도 바뀌면 안 된다 —
  공통 단위를 고치면 `admin-facilities-workspace.spec.ts`가 그대로 통과해야 한다.
- 명소의 지금 동작을 지킨다(아래 "계획이 정한 것" 2·3·4). 저장할 때 번역을 부르지 않는다. 기존 명소의 사진은 고르는 즉시
  올리고 지운다.
- URL 파라미터는 `id`·`new`만 쓴다(`edit`은 경사도 전용). `history.replaceState`로 바꾸고 `useSearchParams`를 쓰지 않는다.
- 저장 안 한 변경은 PR ①의 `UnsavedChangesGuard`(`useUnsavedChanges`·`useUnsavedChangesGuard`)로 받는다. 새 가드를 만들지
  않는다.
- 새 CSS 클래스는 `ku-landmark-*` 또는 공통 `ku-detail-*`·`ku-workspace-*`로 짓는다. 색은 `globals.css` 토큰으로 쓰고, 토큰이
  없는 핸드오버 값은 `color-mix()`로 토큰에서 만든다. 다크 대응을 빠뜨리지 않는다.
- 패널에 z-index를 두지 않는다(PR ① 계획 결정 7 — 패널이 쌓임 맥락을 만들면 안에서 여는 모달이 헤더 밑에 갇힌다).
- 모바일 터치 영역은 44px이다.
- React Compiler와 `eslint-config-next`가 켜져 있다. 렌더 중에 ref를 읽거나 쓰지 않는다. effect 안의 동기 `setState`를
  새로 만들지 않는다.
- vitest는 `environment: "node"`라 컴포넌트를 렌더하지 못한다. 순수 함수와 fetch·supabase 호출 함수만 단위 테스트하고
  (`src/test/queryStub.ts`의 쿼리 체인 대역), 화면은 Playwright로 본다.
- 주석은 이유·외부 제약·위험만 적는다. 다른 파일의 줄 번호·개수·상수 값을 적지 않고 심볼 이름으로 가리킨다.
- 커밋 메시지는 한국어 `type(scope): 내용`. `Co-Authored-By`를 붙이지 않고, 작업 과정(리뷰·점검)을 적지 않는다.
- 이 저장소는 `core.autocrlf=true`다. 파일은 UTF-8로 쓴다. 한글이 깨져 저장되지 않았는지 커밋 전에 확인한다
  (U+FFFD나 `뚯`·`먮`·`꾨`처럼 어색한 음절).
- Next 16 문서는 `node_modules/next/dist/docs/`에 있다(AGENTS.md).

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
- PR을 열기 전 마지막 확인은 CI와 같은 조건으로 한다: `core.autocrlf=false`로 스크래치 디렉터리에 클론해 `npm ci` 뒤 `CI=true`로
  lint·format:check·typecheck·test·`test:e2e -- --retries=0`. 작업 사본은 CRLF·`.env.local`·`.claude/worktrees` 때문에 CI와
  다르게 걸린다.

## 브랜치와 PR

`feat/admin-map-first-landmarks`(main `8bc13fb`에서). 계획 커밋부터 마지막 태스크까지 이 브랜치에 쌓고, 로컬 검증을 마친 뒤
한 번 푸시해 PR을 연다. 병합할 때 이 계획 문서를 `git rm`한다. ③(경사도)의 계획은 ②가 병합된 뒤 쓴다.

## 계획이 정한 것

1. **칩 개수는 전체 행 기준이다**(PR ①과 같다). 결과 줄의 `{n}개 표시`가 거른 수를 맡는다.
2. **`번역 없음`은 이름·설명 두 필드를 본다.** 원문(`name`, `description`)이 공백이 아니면 그 필드의 `_en`·`_zh` 중 하나라도
   비면(공백 포함) 해당한다. 원문이 빈 설명은 보지 않는다. 명소에는 `translation_status` 컬럼이 없다 — 값만 본다.
3. **번역은 저장과 분리된 초안 채우기다(지금 동작).** `자동번역 채우기`는 `/api/translate`로 받아 **비어 있는 칸만** 채운다
   (직접 고친 값을 덮지 않는다). 실패하면 `자동번역에 실패했어요` 경고 토스트. 저장은 번역을 부르지 않는다. README가 "명소도
   저장 시 자동 번역하고 `translation_status`로 노출"이라 적은 것은 틀렸다 — Task 9에서 고친다.
4. **사진(지금 동작).**
   - 기존 명소: 고르는 즉시 `/api/upload-landmark-photo`로 올린다. 이 API가 DB의 `photo_url`을 바꾸고 옛 R2 객체를 지운다.
     `사진 삭제`는 즉시 `/api/delete-landmark-photo`(URL 조건부 갱신, 실패하면 되돌림)를 부른다. 확인 창은 지금처럼 두지 않는다.
     성공하면 토스트(`사진이 업로드되었어요` / `사진이 삭제되었어요`) 뒤 목록을 다시 받는다.
   - 그래서 **사진은 초안이 아니다.** dirty 판정에 넣지 않고, 기존 명소의 폼 `저장` payload에 `photo_url`을 싣지 않는다 —
     싣으면 즉시 바꾼 사진을 폼이 처음 읽은 값으로 되돌린다(PR ①의 설치 세그먼트와 같은 이유, 설계 4.2).
   - 새 명소: 고른 파일은 `pendingPhoto`로 들고 있다가 삽입 뒤 올린다. 삽입은 됐는데 업로드가 실패하면
     `명소는 저장됐지만 사진 업로드에 실패했어요` 경고(지금 문구). 패널은 미리보기를 object URL로 그리고 닫힐 때 해제한다.
     `pendingPhoto`는 새 명소의 dirty에 넣는다.
   - 사진 작업 중에는 저장·삭제·다른 항목 선택을 잠근다(저장 중 잠금과 같은 경로).
5. **저장 결과 타입.** `landmarkSave`는 `{ ok: true, landmarkId, created, photoFailed, revalidated }` 또는
   `{ ok: false, reason }`를 돌려준다. 토스트 문구와 닫기·선택 이동은 화면이 정한다. revalidate는 `/api/revalidate-landmarks`
   이고 실패해도 조용히 넘긴다(지금 동작).
6. **필수값(지금 `validate`).** 이름, 이모지, 위치. 없으면 경고 토스트(`명소 이름을 입력해주세요` / `이모지를 골라주세요` /
   `지도에서 위치를 선택해주세요`)를 띄우고 저장하지 않는다.
7. **위치.** 지도 클릭으로 초안 핀을 옮기고, 선택한 명소의 초안 핀은 끌어서도 옮긴다. 저장 중·사진 작업 중에는 클릭과
   드래그를 잠근다. 계약은 `FacilityWorkspaceMap`의 `editor`·`draft.owner`와 같다. 새로 만들기는 지도 첫 클릭이 위치다.
   캠퍼스는 `inferCampusFromPoint`로 판정해 `{캠퍼스} 영역`을 보이고, 캠퍼스 밖이면 경고 색 문구를 보이되 저장은 막지 않는다
   (지금 모달 동작). `현 위치로 찍기`는 명소에 없다 — 핸드오버 3장이 두지 않는다.
8. **모바일 상세는 지도 띠가 없다(설계 2.5).** 명소의 미리보기는 사진이라 상세 안 맨 위에 190px로 그린다. 공통 단위에
   띠를 끄는 옵션(`AdminMapWorkspace`의 `mobileMapStrip={0}`이 `DetailPanel`의 띠도 그리지 않게)을 더한다. 시설은 기본값 그대로다.
   모바일에서 위치를 바꾸려면 상세를 닫지 않고는 지도를 못 누르므로, 상세의 위치 칸에 `지도에서 위치 고르기` 버튼을 둔다 —
   누르면 상세를 접어 지도와 하단 확인 바(`이 위치로` / `취소`)를 보인다. 이 동작은 Task 8에서 정하고 설계 2.5에 한 줄 더한다.
9. **번역 카드(설계 2.3, 핸드오버 3장).** 기본은 값 보기다: English / 中文 이름, 설명은 접어 둔다(펼침). 빈 값은 `번역 없음`을
   경고 색으로. `직접 고치기`를 펼치면 4칸 입력(`영문 이름`·`중문 이름`·`영문 설명`·`중문 설명` 레이블 유지 — 접근성 테스트가
   레이블로 찾는다). 번역 칸이 dirty면 펼친 채 둔다.
10. **마커.** 30px 흰 원 + 이모지(`LandmarkEmoji`, 15px). 선택 38px, 크림슨 테두리(토큰). 새 명소의 초안 마커는 크림슨 테두리 +
    고른 이모지(고르기 전에는 폴백 `📍`). `data-testid="admin-landmark-marker-{id}"`.
11. **행.** 이모지 원(32px) · 이름 · `{캠퍼스} · {수정일}` · 배지(`사진 없음`, `번역 없음`). 캠퍼스를 못 정하면 `캠퍼스 밖`.
    행 전체가 `<button>`이고 이름에 `data-testid="admin-list-item-name"`을 유지한다.
12. **정렬과 조회.** 정렬은 `최근 수정순 / 오래 수정순 / 이름순`(`updated_at`, `name`). 조회는 `landmarks` 전체를 한 번 받는다
    (설계 2.2 — 운영 4행). 서버 페이지(`range`, `count: "exact"`)는 지운다.
13. **이모지 피커.** 헤더의 44px 이모지 버튼이 `EmojiPicker`를 연다. 피커가 열린 채 Escape는 피커만 닫고 초점을 이모지 버튼으로
    돌린다. 피커가 닫힌 뒤 Escape는 패널을 닫지 않는다(패널은 모달이 아니다).

## 기존 E2E 시나리오의 행방

| 파일 · 시나리오                                                                                | 처리                                                                             | 태스크 |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| `admin-content` · 사진을 선택한 신규 명소를 한 번에 저장하고 삭제한다                          | 지우고 작업 화면 spec의 "새 명소를 사진과 함께 저장하고 인라인 확인 뒤 지운다"로 | 4, 6   |
| `admin-content` · 명소를 검색하고 사진 유무로 필터링한다                                       | 지우고 칩·검색·정렬 시나리오로                                                   | 4      |
| `admin-content` · 명소를 서버 페이지 단위로 조회하고 모바일에서 이동한다                       | 지우고 전체 조회 + 클라이언트 페이지(다른 페이지 마커 포함), 모바일은 바텀시트로 | 4, 8   |
| `accessibility-dialog-toast` · 이모지 피커가 열린 상태의 Escape는 피커만 닫고 폼 입력을 남긴다 | 같은 파일에서 패널판으로 다시 쓴다(결정 13)                                      | 5      |
| `accessibility-dialog-toast` · 관리자 설정과 명소 모달도 Escape 후 실행 버튼으로 복귀한다      | 명소 부분을 지운다(모달이 없다). 설정 부분은 그대로                              | 5      |
| `accessibility-dialog-toast` · 관리자 모달 폼 레이블이 입력과 프로그램적으로 연결된다          | 명소 부분을 패널의 레이블 연결로 바꾼다                                          | 5      |
| `admin-dark` · 명소 목록 화면에 하드코딩 밝은 색이 남지 않는다                                 | 그대로 두고, 상세 패널을 연 상태의 스캔을 더한다                                 | 5      |
| `admin-facilities-workspace` · 헤더 메뉴로 나가기 전에 묻는다(명소로 이동)                     | 그대로 통과해야 한다                                                             | —      |
| `public-map*` · 공개 지도 명소                                                                 | 그대로 통과해야 한다(목 데이터 모양을 바꾸지 않는다)                             | —      |

목 백엔드의 명소는 1행이다. 칩·페이지·다른 페이지 마커 시나리오는 테스트 안에서 `installMockBackend`가 돌려준 state에 행을
더해 만든다(PR ①의 시설 시나리오와 같은 방식). 공용 픽스처는 공개 지도 spec이 기대므로 바꾸지 않는다.

## 파일 지도

| 파일                                                                      | 책임                                                                                      | 태스크  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------- |
| `src/lib/landmarkWorkspace.ts`(+ test)                                    | 칩 조건·정책, 번역 없음 판정, 캠퍼스 이름, 표시 이름, 폼 초기값, 초안 dirty, 저장 payload | 1       |
| `src/lib/landmarkSave.ts`(+ test)                                         | 삽입·수정, 새 명소 사진 업로드, 기존 명소 사진 올리기·지우기, 번역 채우기, revalidate     | 2       |
| `src/lib/landmarkDelete.ts`                                               | 그대로 쓴다(사진 먼저 지우고 행 삭제)                                                     | —       |
| `src/components/admin/workspace/AdminMapWorkspace.tsx`, `DetailPanel.tsx` | 모바일 지도 띠 끄기 옵션                                                                  | 3       |
| `src/components/admin/landmarks/LandmarkListRow.tsx`                      | 명소 행                                                                                   | 4       |
| `src/components/admin/landmarks/LandmarkWorkspaceMap.tsx`                 | 명소 마커 레이어, 초안 핀(클릭·드래그·잠금)                                               | 4, 5    |
| `src/components/admin/landmarks/LandmarkDetailPanel.tsx`                  | 헤더(이모지 버튼)·이름·설명·사진 칸·번역 카드·위치·삭제·저장                              | 5, 6    |
| `src/components/admin/landmarks/LandmarkTranslationCard.tsx`              | 번역 값 보기·`자동번역 채우기`·`직접 고치기`                                              | 5       |
| `src/app/admin/dashboard/landmarks/page.tsx`                              | 조회, 목록·선택·상세를 잇는다(시설 페이지의 `requestSelection`·`panelKey` 패턴)           | 4, 5, 6 |
| `src/app/admin/admin-ui.css`                                              | 명소 행·마커·패널·번역 카드·사진 칸·모바일                                                | 4~8     |
| `src/components/admin/LandmarkFormModal.tsx`                              | 지운다                                                                                    | 5       |
| `e2e/admin-landmarks-workspace.spec.ts`                                   | 명소 작업 화면 전부                                                                       | 4~8     |

## Tasks

### Task 0: 계획 커밋

이 문서를 `docs: 관리자 지도 우선 리디자인 ②의 구현 계획을 둔다`로 커밋한다.

### Task 1: 명소 정책과 초안 비교 — `src/lib/landmarkWorkspace.ts`

`facilityWorkspace.ts`를 본뜬다. RED(vitest)에 적을 것:

- `landmarkNeedsTranslation`: 이름만 있고 영문·중문이 차 있으면 false / 중문 이름이 공백이면 true / 설명 원문이 비면 설명
  번역은 보지 않음 / 설명 원문이 있고 영문 설명이 비면 true.
- `LANDMARK_CHIPS`(또는 정책 객체)와 `adminCollection`으로 센 칩 개수: 전체·사진 없음(`photo_url` null·빈 문자열)·번역 없음.
  검색은 이름·영문·중문 이름, 정렬 셋.
- `landmarkCampusLabel(landmark, boundaries)`: 캠퍼스 안이면 이름, 밖이면 `캠퍼스 밖`, 경계를 아직 못 받았으면 빈 값.
- `landmarkFormFromRow` / `emptyLandmarkForm`, `landmarkDraftDirty(form, row, pendingPhoto)`: 공백만 바뀐 것은 dirty가 아니다,
  위치가 바뀌면 dirty, 기존 명소는 `photo_url`을 비교하지 않는다, 새 명소는 무엇이든 넣으면 dirty.
- `buildLandmarkPayload(form, { includePhoto })`: 트림·빈 값 null·좌표 숫자. 수정에는 `photo_url`을 싣지 않는다.

커밋: `test(landmark-workspace): …` → `feat(landmark-workspace): …`.

### Task 2: 저장·사진·번역 채우기 — `src/lib/landmarkSave.ts`

`facilitySave.ts`와 그 테스트를 본뜬다(쿼리 체인 대역, `authedFetch` 대역). RED에 적을 것:

- 수정: `update(payload)`에 `photo_url`이 없다, 실패하면 `{ ok: false }`, revalidate 실패는 `revalidated: false`로만.
- 삽입: `insert … select("id").single()` 뒤 `pendingPhoto`가 있으면 업로드. 업로드 실패는 `{ ok: true, photoFailed: true }`.
  삽입 실패면 업로드를 부르지 않는다.
- `uploadLandmarkPhoto` / `deleteLandmarkPhoto`: 요청 모양(FormData `file`·`landmarkId`, JSON `landmarkId`·`photoUrl`)과 실패
  메시지(`data.error ?? "사진 업로드 실패"`).
- `fillLandmarkTranslations(form)`: 원문이 다 비면 요청하지 않는다, 응답으로 **빈 칸만** 채운다(이미 있는 `name_en`을 덮지
  않는다), 실패는 예외 대신 실패 결과.

커밋: `test(landmark-save): …` → `feat(landmark-save): …`.

### Task 3: 공통 단위의 모바일 지도 띠 끄기

- `AdminMapWorkspace`에 `mobileMapStrip={0}`을 주면 `--ku-map-strip`이 0이고 `DetailPanel`이 `.ku-detail-panel-strip`을 그리지
  않는다. 기본값(190)은 그대로다.
- 이 태스크만으로는 화면이 없으므로 E2E는 Task 8에서 명소로 확인하고, 여기서는 `admin-facilities-workspace.spec.ts`의
  모바일 시나리오가 그대로 통과하는지 본다.

커밋: `feat(admin-workspace): 모바일 상세의 지도 띠를 끌 수 있게 한다`.

### Task 4: 작업 화면 — 목록·지도·선택

`landmarks/page.tsx`를 시설 페이지처럼 다시 쓴다. 목록 헤더는 `명소` / `지도에 표시하는 캠퍼스 명소 · 총 {n}개` /
`＋ 명소 추가`. 범례는 없다(핸드오버가 명소 범례를 정하지 않는다) — 빈 자리를 남기지 않는다.

RED(새 `e2e/admin-landmarks-workspace.spec.ts`):

- 칩 개수와 거르기(전체·사진 없음·번역 없음), 검색, 정렬, `{n}개 표시`, 조건에 맞는 항목이 없을 때 문구.
- 행을 누르면 상세가 열리고 URL이 `?id=`가 된다. 같은 행을 다시 누르면 닫힌다(데스크톱).
- 마커를 누르면 그 행이 선택되고, 다른 페이지에 있는 항목의 마커면 목록이 그 페이지로 간다.
- 조회가 늦게 끝나도 `?id=` 링크가 그 명소를 연다. 없는 `?id=`는 열지 않고 URL에서 지운다.
- 조회 실패 → `다시 시도`.
- 행 메타에 캠퍼스와 수정일, 배지.
- `admin-content`의 명소 시나리오 셋 중 검색·필터·서버 페이지 둘을 지운다(표).

GREEN: `LandmarkListRow`, `LandmarkWorkspaceMap`(마커·선택 툴팁은 시설과 같은 방식), 페이지. 상세는 이 태스크에서는 제목과
닫기만 있는 패널로 두고 Task 5가 채운다.

커밋: `test(landmarks-workspace): …` → `feat(landmarks-workspace): 명소를 지도 작업 화면으로 바꾸고 목록·마커 선택을 URL에 둔다`.

### Task 5: 상세 패널 — 폼·번역 카드·위치·저장·삭제

RED:

- 헤더: 이모지 버튼(44px) · 이름 · `{캠퍼스} · {수정일} 수정` · `✕`.
- 이름을 고쳐 저장하면 `명소가 수정되었어요` 토스트, 목록과 패널이 새 값. 필수값이 비면 경고 토스트와 저장 안 함.
- 번역 카드: 값이 보이고 빈 값은 `번역 없음`. `자동번역 채우기`가 빈 칸만 채운다 — 미리 직접 고친 `영문 이름`이 남는다.
  번역 실패면 경고 토스트.
- 지도를 눌러 위치를 옮기면 좌표와 캠퍼스 문구가 바뀌고, 저장하면 목 백엔드 행이 새 좌표다. 선택 핀을 끌어도 같다.
  캠퍼스 밖 위치는 경고 문구를 보이되 저장된다.
- 인라인 삭제: `삭제` → `명소와 사진은 복구할 수 없어요.` → `삭제`면 행이 사라지고 패널이 닫힌다. 늦게 끝난 삭제가 그사이 연
  다른 상세를 닫지 않는다.
- 저장 중에는 다른 항목 선택·지도 클릭·드래그·삭제가 잠긴다. 늦게 끝난 저장이 그사이 연 다른 상세를 닫지 않는다.
- 접근성: 이모지 피커 Escape(결정 13), 패널 입력의 레이블 연결(`이름 *`, `영문 이름` 등), 명소 모달 시나리오 정리(표).
- 다크: 상세 패널을 연 상태의 하드코딩 밝은 색 스캔(`admin-dark`).

GREEN: `LandmarkDetailPanel`, `LandmarkTranslationCard`, 페이지의 `requestSelection`·`panelKey`·늦은 완료 방어를 시설 페이지에서
옮긴다. `LandmarkFormModal`과 그 import를 지운다.

커밋: 테스트 → `feat(landmarks-workspace): 명소 상세 패널에서 이모지·폼·번역·위치·삭제를 다룬다`.

### Task 6: 사진과 새로 만들기

RED:

- 기존 명소: `사진 변경`으로 고르면 바로 올라가고 토스트, 행의 `사진 없음` 배지가 바뀐다. `사진 삭제`는 바로 지운다. 업로드
  실패면 오류 토스트. 사진을 바꾼 뒤 이름을 고쳐 저장해도 사진이 남는다(결정 4).
- `＋ 명소 추가`: 빈 패널, 지도 첫 클릭이 위치, 이모지·이름을 넣고 사진을 고르면 미리보기(`저장 시 업로드` 안내), 저장하면
  `명소가 추가되었어요`와 함께 새 행이 선택된 상세로 바뀐다(URL `?id=`). 업로드 실패면 `명소는 저장됐지만 사진 업로드에
실패했어요`.
- 사진 작업 중 저장·삭제·선택 잠금.
- `admin-content`의 남은 명소 시나리오를 지운다(표).

커밋: 테스트 → `feat(landmarks-workspace): 명소 사진을 패널에서 올리고 지우며 새 명소를 지도 첫 클릭으로 만든다`.

### Task 7: 저장 안 한 변경

PR ①의 가드를 명소 패널이 쓴다(`useUnsavedChanges(dirty)`). RED는 시설 spec의 가드 시나리오 중 화면별로 다른 것만:

- 이름을 고친 채 다른 행·마커·칩을 누르면 묻고, 취소하면 입력이 남는다.
- 헤더 메뉴(`독립 시설`)로 나가기 전에 묻는다. 같은 화면 메뉴(`명소`)는 선택을 푼다.
- 브라우저 뒤로가기 전에 묻는다. 저장한 뒤에는 새로고침 경고가 풀린다.
- 새 명소에 사진만 고른 것도 dirty다.

커밋: 테스트 → 필요하면 `fix(landmarks-workspace): …`.

### Task 8: 모바일

RED(390×844):

- 바텀시트 접힘·펼침, 검색·칩, 행 최소 높이 64px.
- 행을 누르면 전체 화면 상세. 지도 띠가 없고(`.ku-detail-panel-strip` 없음) 맨 위에 사진 미리보기 190px(사진이 없으면 점선
  `＋ 사진 선택`).
- `지도에서 위치 고르기` → 지도에서 누른 위치가 `이 위치로` 뒤 초안 좌표가 된다(결정 8).
- 하단 고정 `취소` / `저장` 50px, 이모지 버튼·사진 버튼·`직접 고치기` 등 터치 영역 44px.
- `accessibility-dialog-toast`에 "모바일 명소 상세의 버튼이 44px 터치 영역을 확보한다".

커밋: 테스트 → `feat(landmarks-workspace): 모바일에서 목록을 바텀시트로, 상세를 사진 미리보기가 있는 전체 화면으로 그린다`.

### Task 9: 문서와 마무리

- `docs/specs/2026-07-20-landmarks-design.md` 관리자 절에 대체 배너(설계 머리의 "대체하는 기존 문서" 표).
- 설계 5장·2.5에 이 계획이 정한 것(결정 4·8 등)을 옮기고, 맞지 않는 문장을 고친다.
- README: 650행 근처의 명소 번역 서술(결정 3), 기능 소개의 명소 관리 문장, 파일 트리(`landmarks/`, `LandmarkFormModal` 삭제),
  vitest·Playwright 개수(명령으로 다시 센다), E2E 표에 `admin-landmarks-workspace.spec.ts`.
- 역추적: `rg -n "LandmarkFormModal|dashboard/landmarks|명소 추가|landmarks.*range" docs src e2e README.md`의 모든 줄을
  (a) 고침 (b) 날짜가 붙은 당시 기록 (c) 상관없음으로 나눠 PR 본문에 적는다.
- 검증 방법 절의 CI 조건 재현을 돌리고 결과를 PR 본문에 적는다. 푸시하고 PR을 연다. 병합할 때 이 계획을 `git rm`한다.

커밋: `docs: …`.
