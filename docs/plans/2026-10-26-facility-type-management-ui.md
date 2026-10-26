# 시설 종류 PR ②-2b 구현 계획 — 관리 화면

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans(권장 — 푸시 두 번이 태스크를 걸쳐 묶인다) 또는
> superpowers:subagent-driven-development로 태스크 순서대로 실행한다. 단계는 체크박스(`- [ ]`)로 추적한다. 모든 태스크의 **A 단계**
> (문서·테스트·목)를 먼저 커밋해 푸시 A로 기대한 이유의 실패를 CI에서 보고, 그다음 **B 단계**(구현)를 커밋해 푸시 B로 초록을 본다.
> 진행은 `git log`로 본다.

**Goal:** 관리자가 독립 시설 탭의 "종류 관리" 모달에서 시설 종류를 추가·수정·삭제하고 ▲▼로 순서를 바꾼다.

**Architecture:** DB에 맞바꾸기 RPC `swap_facility_type_order`(advisory 잠금 → `for update` 읽기 → 판정)와 `sort_order` 유일 제약
(deferrable)·시퀀스 맞춤을 더한다. 사용 현황은 새 관리자 라우트 `GET /api/facility-types/usage`가 서비스 키로 종류마다 센다. 화면은
규칙·쓰기 함수(`src/lib/facilityTypeAdmin.ts`), 목록 모달(`FacilityTypesModal.tsx`), 추가·수정 폼(`FacilityTypeForm.tsx`)으로 나누고,
목록은 ②-2a의 종류 저장소(`facilityTypesStore.ts`)를 그대로 읽어 쓰기 뒤 `reloadFacilityTypes()`로 맞춘다.

**Tech Stack:** Postgres·pgTAP, Next 16.2.4 · React 19.2.4(React Compiler), `@supabase/supabase-js` 2.x, `lucide-react` 1.31.0, vitest 3,
Playwright 1.61.

**Spec:** `docs/specs/2026-10-26-facility-type-management-design.md`(이하 "설계 N.N") 3·4.2장. 아이콘·색 목록과 저장소는 같은 문서
1.3·2.1장. 계획과 설계가 다르면 설계가 맞다 — 멈추고 보고한다(아래 "이 계획이 정한 것"은 Task 1이 설계에 먼저 반영한다).

## Global Constraints

- 새 종류 `code`: `type_` + 무작위 소문자·숫자 8자. 만든 뒤 바꾸지 않는다. 겹치면(`23505`) 새 값으로 한 번 더 시도한다(설계 1.5).
- 한국어 이름: 필수, 30자, 앞뒤 공백을 떼어 저장. 같은 이름이 이미 있으면 저장 전에 막는다. 영어·중국어 이름: 각 60자. **빈 칸(공백만
  있어도)은 `NULL`로 저장한다**(설계 3.3).
- "자동번역 채우기"는 `/api/translate`로 한국어를 번역해 **비어 있는 칸만** 채운다. 실패하면 칸을 비운 채 경고 토스트, 저장은 막지 않는다.
- 아이콘은 `FACILITY_ICON_CHOICES` 30개, 색은 `FACILITY_COLOR_CHOICES` 10개에서만 고른다(`src/lib/facilityStyleCatalog.ts`).
- 삭제: 쓰는 시설 1곳 이상이거나 검토 대기 요청(`new`·`reviewing`) 1건 이상이면 끄고 이유를 보인다. 끝난 요청은 막지 않는다. 외래 키
  거부(`23503`)는 현황을 다시 받아 알린다(설계 3.4).
- 맞바꾸기 RPC: `swap_facility_type_order(p_first text, p_second text)`, 인자는 화면 순서(앞, 뒤). 이웃 아님·뒤집힘 `PT409`, 없음 `P0002`,
  같은 종류 `22023`, 권한 없음 `42501`. `security invoker`, 실행 권한은 `authenticated`만(`public`·`anon`·`service_role` 회수).
- `facility_types`에 `unique (sort_order) deferrable initially immediate`, identity 시퀀스를 가장 큰 번호 다음으로 `setval`.
- ▲▼: 화면을 먼저 바꾸고 바로 저장, 저장 중 모든 화살표 `aria-disabled`, 맨 앞·맨 끝만 `disabled`. 초점은 옮긴 줄의 같은 방향 화살표,
  끝에 닿으면 반대쪽. `PT409`·`P0002` → 다시 불러오고 "순서가 바뀌어 다시 불러왔어요", 그 밖 → 되돌리고 오류 토스트 + 실패 보고
  (`facility_types.update`, 대상 = 누른 종류의 `code`, HTTP 상태 포함).
- 쓰기 성공 뒤 `reloadFacilityTypes()`. 수정·삭제 성공 뒤 `POST /api/revalidate-facilities`. 모달을 닫을 때 그런 변경이 있었으면 시설 탭이
  시설 목록을 다시 읽는다(설계 3.3).
- 브라우저 쓰기 관문 `restWrite`는 `facility_types`의 대상 키를 `?code=eq.`에서 읽는다.
- 마이그레이션 파일 `supabase/migrations/20261026020000_add_facility_type_order_swap.sql`(`20261026010000`보다 늦게).
- **로컬에서 `npm ci`·vitest·tsc·eslint·Playwright·Supabase를 돌리지 않는다**(C 드라이브 여유 부족). 검증은 PR CI. 서식만
  `npx --yes prettier@3.9.4 --write <바꾼 파일>`.
- `gh workflow run` 금지(수동 실행이면 운영 마이그레이션 잡이 돈다). 주석은 이유·외부 제약·위험만. 커밋 메시지 한국어
  `type(scope): 내용`, `Co-Authored-By` 없음, 작업 과정(리뷰·점검)을 적지 않는다. `core.autocrlf=true`, 커밋 전
  `rg -n "\x{FFFD}" <바꾼 파일>`.
- 모든 명령은 저장소 루트(`C:\Users\servi\projects\korea-univ-project`)에서. 브랜치 `feat/facility-type-management`(계획을 쓸 때 main
  `ed7feb5`에서 만들었다).

## 이 계획이 정한 것

1. **"종류 관리" 버튼은 목록 패널 아래 범례 줄에 둔다**(`WorkspaceListPanel`의 `legendAction`, 모바일은 목록 시트를 펼친 아랫줄). 설계
   3.1은 "＋ 시설 추가" 옆이었지만, 모바일 시트 머리 줄에는 이름·개수·정렬·추가가 이미 한 줄로 있어 좁은 폭에서 넘칠 수 있다. 경사도 탭
   "범례 편집"과 같은 자리이고 범례가 종류별 색이라 뜻도 맞다. Task 1이 설계 3.1을 고친다.
2. **종류를 한 번도 받지 못했으면 버튼을 끈다**(`loaded === false`). 이름 겹침 검사가 받은 목록에 기댄다.
3. **사용 현황은 종류마다 개수만 묻는다**(`count: "exact", head: true`). 행을 받아 세면 PostgREST 최대 행 수에서 잘려 덜 센다. 종류 수만큼
   요청이 늘지만 모달을 열 때 한 번이다. Task 1이 설계 3.2에 한 줄 더한다.
4. **`reloadFacilityTypes()`는 받기가 끝나면 성공 여부로 풀리는 `Promise<boolean>`을 돌려준다.** 관리 화면이 다시 받은 뒤에 화면을 맞춘다.
   그사이 더 늦게 시작한 받기에 밀려난 받기는 **최신 받기의 결과**로 풀린다 — 자기 응답이 버려졌는데 `true`로 풀리면 기다리던 쪽이
   아직 맞춰지지 않은 목록을 맞춰졌다고 본다. 기존 호출부(시설 탭 `retry`, 공개 지도 `MapDataRetry`의 `() => void`)는 그대로
   컴파일된다. Task 1이 설계 2.1에 한 줄 더한다.
5. **순서 화면은 목록을 복사하지 않는다.** 저장소 목록 위에 저장 중인 맞바꾸기 하나(`pendingSwap`)를 겹쳐 그리고(`withPendingSwap`),
   다시 받기가 끝난 뒤 걷는다 — 먼저 걷으면 옛 순서로 잠깐 돌아간다. 겹치기는 앞 종류가 받은 목록에서 아직 뒤 종류보다 앞일 때만
   한다. 다시 받은 목록에 이미 반영됐으면 그대로 바꿔 다시 뒤집지 않게. 다시 받기가 실패하면 저장소에 누르기 전 목록이 남아 "누르기 전
   화면"이 된다.
6. **새 종류의 처음 아이콘·색은 DB 기본값(휠체어 `accessibility`, 회색 `#666666`)이다.**
7. **쓰기(추가·수정·삭제)가 성공하면 사용 현황도 다시 받는다.** 받은 현황에 없는 종류는 지울 수 있는지 모르므로 삭제를 끈다.
8. **화살표 이름은 종류 이름으로 단다**("경사로 위로 옮기기"·"경사로 아래로 옮기기"). 이름은 겹치지 않는다(3.3). 모양은 사진 순서 버튼
   클래스(`ku-photo-order-button`)를 그대로 써 같은 모양·같은 모바일 44px 규칙을 받는다. Task 1이 설계 3.2에 이름을 적는다.
9. **추가·수정을 저장하는 동안에는 Esc·바깥 누르기로 닫히지 않는다.** 닫히면 고친 이름을 시설 탭이 다시 읽지 못한다.
10. **순서 바꾸기는 시설 탭 목록을 다시 읽게 하지도, 공개 캐시를 비우지도 않는다.** 시설에 붙는 종류 임베드와 공개 `/api/facilities`에
    순서가 없다. 공개 필터는 종류 표를 직접 읽는다.
11. **관리자 다크 모드 대비 검사(`e2e/admin-dark.spec.ts`)에 이 모달을 더한다.** 설계 4.2에는 없지만 관리자 모달마다 있는 검사다.
12. **E2E 목 백엔드의 시설 임베드는 상태에 그 코드의 종류가 있을 때만 다시 만든다.** 상태에 없는 코드(테스트가 직접 넣은 종류)는 행이 든
    값을 둔다.
13. **수정·삭제가 0행이면 실패다.** RLS가 거르거나 그사이 지워진 행은 오류 없이 0행으로 끝난다. `.select("code")`로 바뀐 행을 받아
    0행이면 `not_found`로 돌려주고, 화면은 "그사이 지워졌거나 권한이 없어 바꾸지 못했어요"를 띄운 뒤 목록·현황을 다시 받는다.
14. **종류 목록 받기가 실패한 동안 추가·수정·삭제·순서 바꾸기를 잠근다**(모달 맨 위 알림 + 다시 시도). 낡은 목록으로 이름 겹침을 검사하거나
    순서를 판정하지 않게. 화살표는 `aria-disabled`, 나머지는 `disabled`.
15. **시설 탭의 유형 필터가 받은 목록에 없는 코드를 가리키면 "모든 유형"으로 본다**(파생 값, 상태를 고치지 않는다). 지운 종류를 필터로 고르고
    있었으면 빈 목록이 남지 않게.
16. **자동번역을 기다리는 동안 한국어 이름 칸을 잠근다**(`readOnly`). 요청한 뒤 이름을 바꾸면 옛 이름의 번역이 빈 칸에 들어간다.
17. **삭제 확인창은 성공한 뒤 목록·현황을 다시 받을 때까지 열어 둔다.** 먼저 닫으면 초점이 아직 남은 삭제 버튼으로 돌아갔다가 그 줄이 사라져
    초점을 잃는다. 닫힐 때 그 버튼이 없으면 `useModalFocus`가 남은 모달(종류 관리)로 초점을 옮긴다.
18. **이 PR의 마이그레이션은 유일 제약을 먼저 더하고 시퀀스를 맞춘다.** 같은 트랜잭션 안이면 `ALTER`가 잡은 표 잠금이 시퀀스 맞추기까지 다른
    삽입을 막는다. 명시적 `LOCK`은 트랜잭션 밖에서 오류라 쓰지 않는다.

## Review Focus

1. **잠금 순서**: 마이그레이션 함수가 `pg_advisory_xact_lock` 전에 `facility_types`를 읽지 않는지, 두 행을 `for update`로 읽은 뒤에만
   이웃을 판정하는지.
2. **`setval`**: 세 번째 인자가 `false`라 다음 값이 `max + 1`인지, 빈 표에서 1인지.
3. **겹친 맞바꾸기**: `setPendingSwap(null)`이 `reloadFacilityTypes()`를 기다린 뒤에 오는지, 실패 보고가 `revert`일 때만 나가는지.
4. **`restWrite`**: `KEY_COLUMNS`가 `facility_types`만 바꾸고 다른 표는 `?id=eq.` 그대로인지.
5. **목 임베드**: `facility_types: null`에 아는 코드(`ramp`)를 둔 기존 테스트 행(`admin-buildings.spec.ts`, `admin-buildings-flag-filter.spec.ts`)이
   이제 임베드를 받는다. 그 테스트가 임베드 `null`에 기대지 않는지.
6. **삭제 버튼**: 현황을 받기 전·받기 실패·현황에 없는 코드에서 모두 꺼지는지.
7. **사용 현황 라우트**: 행이 아니라 개수(`head: true`)를 묻는지, 하나라도 실패하면 0이 아니라 500인지.
8. **받기 결과의 계약**: 밀려난 `load()`가 `latestLoadPromise`(자기보다 늦은 받기)를 돌려주는지, 자기 자신을 기다리는 고리가 없는지.
9. **쓰기 잠금**: `status === "error"` 동안 "＋ 종류 추가"·수정·삭제·저장이 꺼지고 화살표가 `aria-disabled`이며 `handleMove`가 일찍 돌아가는지.

## 푸시와 CI

| 푸시 | 담는 커밋                                                       | 기대                                                                                                                                                                                                                      |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | Task 1, Task 2~5의 A 단계(테스트), Task 6(목), Task 7(E2E)      | `Typecheck`: 새 라우트·모듈·RPC 타입이 없어 실패. `Test (unit)`: 새 테스트만 실패. `DB test`: `facility_type_order.test.sql`만 실패. Playwright: 새 spec과 다크 새 테스트만 실패 — 기존 테스트는 바뀐 목 위에서 모두 통과 |
| B    | Task 2~5의 B 단계(구현), Task 8(화면), Task 9(역추적·문서 정리) | 전부 초록                                                                                                                                                                                                                 |

푸시 A 뒤 draft PR을 연다(`gh pr create --draft`). 실패 목록:
`gh run view <run id> --log-failed | grep -E "✘|Error:|Expected|Received|not ok|FAIL|error TS" | head -80`. `DB test`가
`toomanyrequests`·`port 54322 ... address already in use`로 죽으면 `gh run rerun <run id> --failed`.

---

### Task 1: 계획 문서·설계 문구·진행 상황

**Files:**

- Create: `docs/plans/2026-10-26-facility-type-management-ui.md`(이 문서, 이미 있다)
- Modify: `docs/specs/2026-10-26-facility-type-management-design.md` 2.1·3.1·3.2
- Modify: `docs/specs/2026-10-25-mentoring-feedback-design.md` "진행 상황"

- [ ] **Step 1: 설계 문서 머리를 읽는다**

두 설계 문서의 첫 40줄을 읽어 고칠 절이 대체 배너 아래가 아님을 확인한다.

- [ ] **Step 2: 시설 종류 관리 설계를 고친다**

2.1의 `reloadFacilityTypes()` 항목 끝("…먼저 시작한 받기가 나중에 끝나면 그 결과는 버린다.") 뒤에 붙인다:

```markdown
받기가 끝나면 성공 여부(`true`·`false`)로 풀리는 약속을 돌려준다 — 관리 화면(3.2)이 다시 받은 뒤에 화면을 맞춘다.
```

3.1 본문 전체를 바꾼다:

```markdown
독립 시설 탭(`/admin/dashboard/facilities`) 목록 패널 아래 범례 줄에 "종류 관리" 버튼(모바일은 목록 시트를 펼친 아랫줄). 누르면 모달이
열린다. 종류를 한 번도 받지 못했으면 버튼이 꺼진다 — 이름 겹침 검사(3.3)가 받은 목록에 기댄다. 탭은 늘리지 않는다 — 탭 여섯 개가 태블릿
폭에서 넘치던 문제를 #53에서 막았다.

**[판단]** 2026-10-26 처음 적은 자리는 "＋ 시설 추가" 옆이었다. 모바일 시트 머리 줄에는 이름·개수·정렬·추가가 이미 한 줄로 있어 좁은
폭에서 넘칠 수 있다. 경사도 탭의 "범례 편집"과 같은 자리이고, 범례가 종류별 색이라 뜻도 맞다.
```

3.2 사용 현황 항목("…다시 시도 버튼을 보여 준다.") 뒤에 붙인다:

```markdown
서버는 종류마다 개수만 묻는다(`count: exact, head`). 행을 받아 세면 PostgREST 최대 행 수에서 잘려 덜 센다.
```

3.2 ▲▼ 항목의 "…같은 줄의 반대쪽 화살표로 간다." 뒤에 붙인다:

```markdown
버튼 이름은 "<종류 이름> 위로 옮기기"·"<종류 이름> 아래로 옮기기"다(이름은 겹치지 않는다, 3.3).
```

2.1의 `reloadFacilityTypes()` 항목(위에서 붙인 문장 뒤)에 더 붙인다:

```markdown
그사이 더 늦게 시작한 받기에 밀려난 받기는 그 최신 받기의 결과로 풀린다.
```

3.2 목록 항목들 끝(맞바꾸기 RPC 항목 앞)에 항목을 더한다:

```markdown
- 종류 목록 다시 받기가 실패하면 모달 맨 위에 "종류 목록을 새로 불러오지 못했어요"와 다시 시도를 두고, 다시 받을 때까지 추가·수정·삭제·
  순서 바꾸기를 잠근다 — 낡은 목록으로 이름 겹침을 검사하거나 순서를 판정하지 않게.
```

3.3 "저장:" 항목 뒤에 항목 둘을 더한다:

```markdown
- 수정·삭제가 0행으로 끝나면(그사이 지워졌거나 권한이 없다 — RLS는 오류 없이 거른다) 실패로 알리고 목록과 사용 현황을 다시 받는다.
- 자동번역을 기다리는 동안 한국어 이름 칸을 잠근다. 요청한 뒤 이름을 바꾸면 옛 이름의 번역이 빈 칸에 들어간다.
```

3.4 "지울 수 있으면 확인 창…" 항목 뒤에 항목을 더한다:

```markdown
- 시설 탭의 유형 필터가 지운 종류를 고르고 있었으면 "모든 유형"으로 돌아간다.
```

- [ ] **Step 3: 멘토링 설계의 진행 상황을 고친다**

표의 ②-2a·②-2b 두 줄을 바꾼다:

```markdown
| ②-2a 종류 아이콘·색 DB | **완료** — #59 병합(`ed7feb5`), 운영 적용 완료 | pgTAP 6개 파일 104개 단언 통과, vitest 761/761, Playwright 412/412. 운영 확인은 아래 |
| ②-2b 종류 관리 화면 | **진행 중** — 계획 `docs/plans/2026-10-26-facility-type-management-ui.md` | |
```

"② 운영 확인" 절 다음에 절을 더한다:

```markdown
**②-2a 운영 확인 (2026-10-26)**

- `Apply Supabase migrations`가 `20261026010000_add_facility_type_icon_color.sql`을 적용했고 `Verify migration history`가 통과했다(run
  40286655202).
- 방문자 키로 읽은 종류의 `icon`·`color`가 설계(`2026-10-26-facility-type-management-design.md`) 1.2 표와 같다.
- **아직 안 본 것:** 공개 지도 아이콘·색이 전과 같은지(자동문 칩만 회색), 활동 기록 "시설 종류 수정"(바뀐 칸 "아이콘"·"색") — 사용자 눈과
  관리자 로그인이 필요하다.
```

"**다음에 할 일 — ②-2a 시설 종류 아이콘·색을 DB로**" 절(제목과 번호 목록 두 줄)을 바꾼다:

```markdown
**다음에 할 일 — ②-2b 시설 종류 관리 화면**

1. 계획 `docs/plans/2026-10-26-facility-type-management-ui.md`(설계 `2026-10-26-facility-type-management-design.md` 3·4.2장).
2. ②-2b가 병합되면 ③ 건물 이름 강조(5장).
```

"알아야 할 상황"의 "**정리 대기 원격 브랜치:**" 항목을 지운다. 먼저 남은 브랜치가 없음을 확인한다:

```bash
git ls-remote --heads origin feat/building-photo-order-db feat/building-photo-order-ui feat/guard-busy-navigation feat/facility-type-style-db
```

Expected: 출력 없음. 출력이 있으면 항목을 지우지 말고 남은 브랜치만 적어 둔다.

- [ ] **Step 4: 서식과 커밋**

```bash
npx --yes prettier@3.9.4 --write docs/plans/2026-10-26-facility-type-management-ui.md docs/specs/2026-10-26-facility-type-management-design.md docs/specs/2026-10-25-mentoring-feedback-design.md
rg -n "\x{FFFD}" docs/plans/2026-10-26-facility-type-management-ui.md docs/specs/2026-10-26-facility-type-management-design.md docs/specs/2026-10-25-mentoring-feedback-design.md
git add docs/plans/2026-10-26-facility-type-management-ui.md docs/specs/2026-10-26-facility-type-management-design.md docs/specs/2026-10-25-mentoring-feedback-design.md
git commit -m "docs: 시설 종류 관리 화면 계획을 두고 ②-2a 완료를 진행 상황에 적는다"
```

---

### Task 2: DB — 맞바꾸기 RPC와 순서 유일 제약

**Files:**

- Create(A): `supabase/tests/facility_type_order.test.sql`
- Create(B): `supabase/migrations/20261026020000_add_facility_type_order_swap.sql`
- Modify(B): `supabase/database.types.ts`(`Functions`)

**Interfaces:**

- Produces: `public.swap_facility_type_order(p_first text, p_second text) returns void`, 제약 `facility_types_sort_order_key`. 타입:
  `Database["public"]["Functions"]["swap_facility_type_order"]` — `Args: { p_first: string; p_second: string }`, `Returns: undefined`.

- [ ] **Step A1: pgTAP 테스트를 쓴다** — `supabase/tests/facility_type_order.test.sql`

```sql
-- 설계: docs/specs/2026-10-26-facility-type-management-design.md 3.2·4.2
-- 동시 맞바꾸기는 한 세션인 pgTAP으로 볼 수 없다. 잠금 순서(잠금 → for update 읽기 → 판정)는 함수 본문으로 본다.
begin;
select plan(18);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'stranger@example.com');
insert into public.admin_users (user_id, display_name)
values ('00000000-0000-4000-8000-000000000001', '관리자');

create function pg_temp.act_as(person uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', person, 'role', 'authenticated')::text, true);
end;
$$;

-- 번호를 직접 준 행(아래 9xx)을 넣기 전에 본다. 화면은 번호를 주지 않는다.
insert into public.facility_types (code, label) values ('zz_next', '다음 번호');
select ok(
  (select sort_order from public.facility_types where code = 'zz_next')
    > (select max(sort_order) from public.facility_types where code <> 'zz_next'),
  '번호 없이 넣은 종류는 가장 큰 번호보다 뒤다');

select throws_ok(
  format($$insert into public.facility_types (code, label, sort_order) values ('zz_dup', '겹침', %s)$$,
    (select sort_order from public.facility_types where code = 'zz_next')),
  '23505', null, '같은 번호를 두 종류에 둘 수 없다');

select has_function('public', 'swap_facility_type_order', array['text', 'text'], '맞바꾸기 함수가 있다');
select is(
  (select prosecdef from pg_proc where oid = 'public.swap_facility_type_order(text, text)'::regprocedure),
  false, '맞바꾸기 함수는 호출자 권한으로 돈다');

-- 순서: zz_a(901) zz_b(902) zz_c(904). 903은 비어 있다
insert into public.facility_types (code, label, sort_order) values
  ('zz_a', '가', 901), ('zz_b', '나', 902), ('zz_c', '다', 904);

set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select lives_ok($$select public.swap_facility_type_order('zz_a', 'zz_b')$$, '관리자는 이웃한 두 종류의 자리를 바꾼다');
select results_eq(
  $$select code from public.facility_types where code in ('zz_a', 'zz_b', 'zz_c') order by sort_order$$,
  $$values ('zz_b'::text), ('zz_a'), ('zz_c')$$,
  '맞바꾼 두 종류만 자리가 바뀐다');
reset role;
select is(
  (select count(*)::int from public.activity_logs
   where target_table = 'facility_types' and action = 'update' and changes ? 'sort_order'),
  2, '맞바꾸기 한 번에 순서 변경 기록이 두 줄 남는다');

-- 순서: zz_b(901) zz_a(902) zz_c(904)
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select lives_ok($$select public.swap_facility_type_order('zz_a', 'zz_c')$$, '번호 사이가 비어도 사이에 종류가 없으면 이웃이다');
-- 순서: zz_b(901) zz_c(902) zz_a(904)
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_a')$$,
  'PT409', null, '사이에 다른 종류가 있으면 바꾸지 않는다');
-- 오래된 화면에서 같은 쌍을 다시 누르면 앞뒤가 뒤집혀 들어온다. 그대로 바꾸면 앞서 바꾼 것을 몰래 되돌린다.
select throws_ok($$select public.swap_facility_type_order('zz_c', 'zz_b')$$,
  'PT409', null, '앞 종류가 지금 뒤에 있으면 바꾸지 않는다');
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_b')$$,
  '22023', null, '같은 종류끼리는 바꾸지 않는다');
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_missing')$$,
  'P0002', null, '없는 종류와는 바꾸지 않는다');
select throws_ok($$select public.swap_facility_type_order('zz_missing', 'zz_b')$$,
  'P0002', null, '앞 종류가 없어도 바꾸지 않는다');

select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_c')$$,
  '42501', null, '목록에 없는 계정은 자리를 바꾸지 못한다');
select results_eq(
  $$select code from public.facility_types where code in ('zz_a', 'zz_b', 'zz_c') order by sort_order$$,
  $$values ('zz_b'::text), ('zz_c'), ('zz_a')$$,
  '거부된 맞바꾸기는 순서를 바꾸지 않는다');

-- authenticated에서 anon으로 바로 바꿀 수 없어 먼저 되돌린다
reset role;
set local role anon;
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_c')$$,
  '42501', null, '방문자는 맞바꾸기 함수를 부를 수 없다');

-- Supabase 기본 권한이 새 함수에 준 실행 권한을 회수했다
reset role;
set local role service_role;
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_c')$$,
  '42501', null, '서비스 키로도 맞바꾸기 함수를 부르지 않는다');

reset role;
select ok(
  (select condeferrable from pg_constraint where conname = 'facility_types_sort_order_key'),
  '순서 유일 제약은 맞바꾸기 한 문장이 끝날 때 검사한다');

select * from finish();
rollback;
```

단언 수: `ok` 2 · `throws_ok` 9 · `has_function` 1 · `is` 2 · `lives_ok` 2 · `results_eq` 2 = 18.

- [ ] **Step A2: 커밋**

```bash
npx --yes prettier@3.9.4 --check supabase/tests/facility_type_order.test.sql || true
rg -n "\x{FFFD}" supabase/tests/facility_type_order.test.sql
git add supabase/tests/facility_type_order.test.sql
git commit -m "test(db): 시설 종류 맞바꾸기 함수와 순서 유일 제약을 시험한다"
```

(prettier는 `.sql`을 다루지 않는다. `--check`가 "No parser" 오류를 내도 넘어간다.)

- [ ] **Step B1: 마이그레이션을 쓴다** — `supabase/migrations/20261026020000_add_facility_type_order_swap.sql`

```sql
-- 설계: docs/specs/2026-10-26-facility-type-management-design.md 3.2

-- 맞바꾸기는 한 문장으로 두 행을 바꾼다. 행마다가 아니라 문장 끝에 검사하도록 deferrable로 둔다.
-- 시퀀스보다 먼저 더한다: 같은 트랜잭션 안이면 여기서 잡은 표 잠금이 아래 시퀀스 맞추기까지 다른 삽입을 막는다.
alter table public.facility_types
  add constraint facility_types_sort_order_key unique (sort_order) deferrable initially immediate;

-- 멘토링 ② 마이그레이션(20261026000000)이 identity가 채운 번호를 손으로 덮어써, 시퀀스의 다음 값이 이미 쓰인 번호일 수 있다.
select setval(
  pg_get_serial_sequence('public.facility_types', 'sort_order'),
  coalesce((select max(sort_order) from public.facility_types), 0) + 1,
  false
);

create function public.swap_facility_type_order(p_first text, p_second text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_first record;
  v_second record;
  v_updated integer;
begin
  if p_first = p_second then
    raise exception 'cannot swap a facility type with itself' using errcode = '22023';
  end if;

  -- 잠근 뒤에 읽는다. 잠금 없이 읽으면 겹치는 두 쌍(A·B와 B·C)을 동시에 바꿀 때 둘 다 옛 번호로 판정하고 써서 번호가 겹친다.
  perform pg_advisory_xact_lock(hashtext('facility_types.sort_order'));

  -- 삭제는 위 잠금을 잡지 않으므로 행 잠금으로 끝날 때까지 두 행이 지워지지 않게 한다. RLS는 고칠 권한이 없는 행을 for update에서 거른다.
  select code, sort_order into v_first from public.facility_types where code = p_first for update;
  select code, sort_order into v_second from public.facility_types where code = p_second for update;
  if v_first.code is null or v_second.code is null then
    if (select count(*) from public.facility_types where code in (p_first, p_second)) = 2 then
      raise exception 'not allowed to reorder facility types' using errcode = '42501';
    end if;
    raise exception 'facility type not found' using errcode = 'P0002';
  end if;

  -- 화면은 p_first를 바로 앞 종류로 넘긴다. 지금 그렇지 않으면 다른 관리자가 그사이 순서를 바꾼 것이다 — 방향까지 봐야
  -- 오래된 화면이 같은 쌍을 다시 눌러 앞서 바꾼 것을 몰래 되돌리는 것도 잡는다. 화면은 이 코드를 받으면 다시 불러온다.
  if v_first.sort_order > v_second.sort_order or exists (
    select 1
    from public.facility_types
    where sort_order > v_first.sort_order
      and sort_order < v_second.sort_order
  ) then
    raise exception 'facility types are no longer adjacent in this order' using errcode = 'PT409';
  end if;

  update public.facility_types
  set sort_order = case code when p_first then v_second.sort_order else v_first.sort_order end
  where code in (p_first, p_second);
  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'not allowed to reorder facility types' using errcode = '42501';
  end if;
end;
$$;

-- Supabase 기본 권한이 새 함수를 service_role에도 준다. 관리자 화면의 브라우저 클라이언트만 부른다.
revoke all on function public.swap_facility_type_order(text, text) from public, anon, service_role;
grant execute on function public.swap_facility_type_order(text, text) to authenticated;
```

- [ ] **Step B2: 타입을 더한다** — `supabase/database.types.ts`의 `swap_building_photo_order` 항목 바로 뒤

```ts
swap_facility_type_order: {
  Args: {
    p_first: string;
    p_second: string;
  }
  Returns: undefined;
}
```

- [ ] **Step B3: 커밋**

```bash
npx --yes prettier@3.9.4 --write supabase/database.types.ts
rg -n "\x{FFFD}" supabase/migrations/20261026020000_add_facility_type_order_swap.sql supabase/database.types.ts
git add supabase/migrations/20261026020000_add_facility_type_order_swap.sql supabase/database.types.ts
git commit -m "feat(db): 시설 종류 순서를 맞바꾸는 함수와 순서 유일 제약을 둔다"
```

---

### Task 3: 사용 현황 라우트

**Files:**

- Modify(A): `src/test/queryStub.ts`
- Create(A): `src/app/api/facility-types/usage/route.test.ts`
- Create(B): `src/app/api/facility-types/usage/route.ts`

**Interfaces:**

- Produces: `GET /api/facility-types/usage` → 200 `{ [code: string]: { facilities: number; pendingRequests: number } }`, 실패 500
  `{ error: "사용 현황을 불러오지 못했어요" }`, 관리자 아님은 `requireAdmin`의 응답(401·403·500) 그대로.
- Produces: `queryStub<T>(result: T | ((calls: QueryCall[]) => T))` — 함수면 기록한 체인으로 결과를 정한다.

- [ ] **Step A1: `queryStub`이 체인에 따라 결과를 정할 수 있게 한다** — `src/test/queryStub.ts`

주석과 함수 머리, `then` 분기를 바꾼다:

```ts
/** supabase-js 쿼리 빌더 대역. 체인 메서드를 기록하고 await하면 result를 준다. result가 함수면 기록한 체인으로 결과를 정한다. */
export function queryStub<T>(
  result: T | ((calls: QueryCall[]) => T),
): QueryStub<T> {
  const calls: QueryCall[] = [];
  const proxy: QueryStub<T> = new Proxy({} as QueryStub<T>, {
    get(_target, property) {
      if (property === "then") {
        return (
          resolve: (value: T) => unknown,
          reject: (reason: unknown) => unknown,
        ) =>
          Promise.resolve(
            typeof result === "function"
              ? (result as (calls: QueryCall[]) => T)(calls)
              : result,
          ).then(resolve, reject);
      }
      if (property === "calls") return calls;
      return (...args: unknown[]) => {
        calls.push({ method: String(property), args });
        return proxy;
      };
    },
  });
  return proxy;
}
```

- [ ] **Step A2: 라우트 테스트를 쓴다** — `src/app/api/facility-types/usage/route.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub, type QueryCall } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const from = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const call = () =>
  new Request("https://local.test/api/facility-types/usage") as Request;

const COUNTS: Record<string, Record<string, number>> = {
  building_facilities: { ramp: 3, type_lounge01: 0 },
  facility_requests: { ramp: 0, type_lounge01: 2 },
};

function codeOf(calls: QueryCall[]) {
  return String(
    calls.find(
      (item) => item.method === "eq" && item.args[0] === "facility_code",
    )?.args[1],
  );
}

function stubTables(failing?: string) {
  from.mockImplementation((table: string) =>
    table === "facility_types"
      ? queryStub({
          data: [{ code: "ramp" }, { code: "type_lounge01" }],
          error: null,
        })
      : queryStub((calls) =>
          table === failing
            ? { count: null, error: { code: "XX000", message: "boom" } }
            : { count: COUNTS[table][codeOf(calls)], error: null },
        ),
  );
}

function queriesOn(table: string) {
  return from.mock.calls
    .map(([name], index) => ({
      name,
      query: from.mock.results[index].value as { calls: QueryCall[] },
    }))
    .filter((item) => item.name === table)
    .map((item) => item.query);
}

describe("GET /api/facility-types/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    stubTables();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자가 아니면 그 응답을 그대로 돌려주고 세지 않는다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "권한 없음" }, { status: 403 }),
    });
    const { GET } = await import("./route");
    expect((await GET(call())).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("종류마다 쓰는 시설 수와 검토 대기 요청 수를 준다", async () => {
    const { GET } = await import("./route");
    const response = await GET(call());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ramp: { facilities: 3, pendingRequests: 0 },
      type_lounge01: { facilities: 0, pendingRequests: 2 },
    });
  });

  it("행이 아니라 개수만 묻고, 요청은 검토 대기(new·reviewing)만 센다", async () => {
    const { GET } = await import("./route");
    await GET(call());
    const counted = [
      ...queriesOn("building_facilities"),
      ...queriesOn("facility_requests"),
    ];
    expect(counted).toHaveLength(4);
    for (const query of counted)
      expect(query.calls).toContainEqual({
        method: "select",
        args: ["id", { count: "exact", head: true }],
      });
    for (const query of queriesOn("facility_requests"))
      expect(query.calls).toContainEqual({
        method: "in",
        args: ["status", ["new", "reviewing"]],
      });
  });

  it("세기가 하나라도 실패하면 0이 아니라 500이다", async () => {
    stubTables("facility_requests");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("./route");
    const response = await GET(call());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "사용 현황을 불러오지 못했어요",
    });
    expect(spy).toHaveBeenCalled();
  });

  it("종류를 읽지 못하면 500이다", async () => {
    from.mockImplementation(() =>
      queryStub({ data: null, error: { code: "XX000", message: "boom" } }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("./route");
    expect((await GET(call())).status).toBe(500);
  });
});
```

- [ ] **Step A3: 커밋**

```bash
npx --yes prettier@3.9.4 --write src/test/queryStub.ts src/app/api/facility-types/usage/route.test.ts
rg -n "\x{FFFD}" src/test/queryStub.ts src/app/api/facility-types/usage/route.test.ts
git add src/test/queryStub.ts src/app/api/facility-types/usage/route.test.ts
git commit -m "test: 시설 종류 사용 현황 라우트를 시험한다"
```

- [ ] **Step B1: 라우트를 쓴다** — `src/app/api/facility-types/usage/route.ts`

```ts
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

// 끝난 요청(승인·거절)은 기록이라 삭제를 막지 않는다. 설계: docs/specs/2026-10-26-facility-type-management-design.md 3.4
const PENDING_REQUEST_STATUSES = ["new", "reviewing"];

function failed() {
  return Response.json(
    { error: "사용 현황을 불러오지 못했어요" },
    { status: 500 },
  );
}

/**
 * 관리 화면이 쓰이는 종류의 삭제를 막는 데 쓴다. 등록 요청은 로그인 계정도 읽지 못해(20261008000000) 서비스 키로 센다.
 * 행을 받아 세면 PostgREST 최대 행 수에서 잘려 덜 센다 — 종류마다 개수만 묻는다(설계 3.2).
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const db = supabaseAdmin();
  const types = await db.from("facility_types").select("code");
  if (types.error) {
    console.error("[facility-types-usage] type read failed", {
      code: types.error.code,
    });
    return failed();
  }
  const counts = await Promise.all(
    (types.data ?? []).map(async ({ code }) => {
      const [facilities, requests] = await Promise.all([
        db
          .from("building_facilities")
          .select("id", { count: "exact", head: true })
          .eq("facility_code", code),
        db
          .from("facility_requests")
          .select("id", { count: "exact", head: true })
          .eq("facility_code", code)
          .in("status", PENDING_REQUEST_STATUSES),
      ]);
      return { code, facilities, requests };
    }),
  );
  const broken = counts.find(
    ({ facilities, requests }) => facilities.error || requests.error,
  );
  if (broken) {
    console.error("[facility-types-usage] count failed", {
      type: broken.code,
      facilities: broken.facilities.error?.code,
      requests: broken.requests.error?.code,
    });
    return failed();
  }
  return Response.json(
    Object.fromEntries(
      counts.map(({ code, facilities, requests }) => [
        code,
        {
          facilities: facilities.count ?? 0,
          pendingRequests: requests.count ?? 0,
        },
      ]),
    ),
  );
}
```

- [ ] **Step B2: 커밋**

```bash
npx --yes prettier@3.9.4 --write src/app/api/facility-types/usage/route.ts
rg -n "\x{FFFD}" src/app/api/facility-types/usage/route.ts
git add src/app/api/facility-types/usage/route.ts
git commit -m "feat: 시설 종류마다 쓰는 시설과 검토 대기 요청을 세는 관리자 라우트를 둔다"
```

---

### Task 4: 종류 저장소와 실패 보고 관문

**Files:**

- Modify(A): `src/lib/facilityTypesStore.test.ts`, `src/lib/supabaseWriteReporting.test.ts`
- Modify(B): `src/lib/facilityTypesStore.ts`, `src/lib/supabaseWriteReporting.ts`

**Interfaces:**

- Produces: `reloadFacilityTypes(): Promise<boolean>` — 저장소에 반영된 받기(밀려났으면 최신 받기)가 성공했으면 `true`.
- Produces: `restWrite(url, method)`가 `facility_types`면 `?code=eq.<code>`를 `id`로 돌려준다.

- [ ] **Step A1: 저장소 테스트를 더한다** — `src/lib/facilityTypesStore.test.ts`의 `"조회가 예외를 던져도 error다"` 앞

```ts
it("다시 받기는 끝나면 성공 여부로 풀린다", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  from.mockReturnValueOnce(queryStub({ data: [RAMP], error: null }));
  const store = await loadStore();
  store.subscribeFacilityTypes(() => {});
  await vi.waitFor(() =>
    expect(store.getFacilityTypesSnapshot().status).toBe("ready"),
  );

  from.mockReturnValueOnce(queryStub({ data: [RAMP, LOUNGE], error: null }));
  await expect(store.reloadFacilityTypes()).resolves.toBe(true);
  expect(store.getFacilityTypesSnapshot().types).toEqual([RAMP, LOUNGE]);

  from.mockReturnValueOnce(
    queryStub({ data: null, error: { code: "XX000", message: "boom" } }),
  );
  await expect(store.reloadFacilityTypes()).resolves.toBe(false);
  expect(store.getFacilityTypesSnapshot().types).toEqual([RAMP, LOUNGE]);
});

it("더 늦게 시작한 받기에 밀려난 받기는 그 최신 받기의 결과로 풀린다", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  from.mockReturnValueOnce(queryStub({ data: [RAMP], error: null }));
  const store = await loadStore();
  store.subscribeFacilityTypes(() => {});
  await vi.waitFor(() =>
    expect(store.getFacilityTypesSnapshot().status).toBe("ready"),
  );

  const older = deferred();
  const newer = deferred();
  from
    .mockReturnValueOnce(queryStub(older.pending))
    .mockReturnValueOnce(queryStub(newer.pending));
  const olderReload = store.reloadFacilityTypes();
  const newerReload = store.reloadFacilityTypes();
  // 먼저 시작한 받기는 성공했지만 버려진다. 최신 받기는 실패한다
  older.respond({ data: [RAMP, LOUNGE], error: null });
  newer.respond({ data: null, error: { code: "XX000", message: "boom" } });

  await expect(olderReload).resolves.toBe(false);
  await expect(newerReload).resolves.toBe(false);
  expect(store.getFacilityTypesSnapshot()).toEqual({
    types: [RAMP],
    status: "error",
    loaded: true,
  });
});
```

- [ ] **Step A2: 관문 테스트를 더한다** — `src/lib/supabaseWriteReporting.test.ts`의 `describe("restWrite")` 안, 기존 `it` 뒤

```ts
it("기본 키가 code인 시설 종류는 code 필터에서 대상 키를 읽는다", () => {
  expect(
    restWrite(
      new URL(`${REST}/facility_types?code=eq.type_ab12cd34`),
      "DELETE",
    ),
  ).toEqual({
    action: "facility_types.delete",
    table: "facility_types",
    id: "type_ab12cd34",
  });
  expect(
    restWrite(new URL(`${REST}/facility_types?code=eq.ramp`), "PATCH")?.id,
  ).toBe("ramp");
  expect(restWrite(new URL(`${REST}/facility_types`), "POST")?.id).toBeNull();
});
```

- [ ] **Step A3: 커밋**

```bash
npx --yes prettier@3.9.4 --write src/lib/facilityTypesStore.test.ts src/lib/supabaseWriteReporting.test.ts
rg -n "\x{FFFD}" src/lib/facilityTypesStore.test.ts src/lib/supabaseWriteReporting.test.ts
git add src/lib/facilityTypesStore.test.ts src/lib/supabaseWriteReporting.test.ts
git commit -m "test: 종류 다시 받기의 결과와 종류 쓰기 실패 보고의 대상 키를 시험한다"
```

- [ ] **Step B1: 저장소** — `src/lib/facilityTypesStore.ts`

`let latestLoad = 0;` 다음 줄에 더한다:

```ts
let latestLoadPromise: Promise<boolean> = Promise.resolve(false);
```

`async function load() {` → `async function load(): Promise<boolean> {`. 끝부분

```ts
  // 고친 뒤 다시 받기보다 먼저 시작한 응답이 나중에 오면 낡은 목록이다
  if (thisLoad !== latestLoad) return;
  publish(next);
}
```

을 바꾸고, 바로 뒤에 `startLoad`를 더한다:

```ts
  // 고친 뒤 다시 받기보다 먼저 시작한 응답이 나중에 오면 낡은 목록이다. 기다리던 쪽에는 최신 받기의 결과를 준다 —
  // 버려진 응답의 성공을 돌려주면 아직 맞춰지지 않은 목록을 맞춰졌다고 본다
  if (thisLoad !== latestLoad) return latestLoadPromise;
  publish(next);
  return next.status === "ready";
}

function startLoad(): Promise<boolean> {
  latestLoadPromise = load();
  return latestLoadPromise;
}
```

(`load()`는 첫 `await` 전에 `latestLoad`를 올리므로, 밀려난 받기가 `latestLoadPromise`를 읽을 때는 이미 더 늦은 받기의 약속이다.)

`subscribeFacilityTypes` 안의 `void load();`를 `void startLoad();`로 바꾸고, `reloadFacilityTypes`를 바꾼다:

```ts
/**
 * 받는 동안에도 직전 목록을 둔다 — 비우면 열린 화면의 아이콘이 모두 대체 아이콘으로 번쩍인다.
 * 저장소에 반영된 받기가 성공했는지로 풀린다. 관리 화면이 다시 받은 뒤에 화면을 맞춘다(설계 2.1·3.2).
 */
export function reloadFacilityTypes(): Promise<boolean> {
  loadStarted = true;
  publish({ ...snapshot, status: "loading" });
  return startLoad();
}
```

- [ ] **Step B2: 관문** — `src/lib/supabaseWriteReporting.ts`

`type RestWrite` 정의 앞에 더한다:

```ts
// 기본 키가 id가 아닌 기록 대상 테이블. 실패 보고의 대상 키를 이 칸의 `eq.` 필터에서 읽는다.
const KEY_COLUMNS: Partial<Record<AuditTable, string>> = {
  facility_types: "code",
};
```

`restWrite` 안의 `const filter = url.searchParams.get("id");`를 바꾼다:

```ts
const filter = url.searchParams.get(KEY_COLUMNS[table] ?? "id");
```

- [ ] **Step B3: 커밋**

```bash
npx --yes prettier@3.9.4 --write src/lib/facilityTypesStore.ts src/lib/supabaseWriteReporting.ts
rg -n "\x{FFFD}" src/lib/facilityTypesStore.ts src/lib/supabaseWriteReporting.ts
git add src/lib/facilityTypesStore.ts src/lib/supabaseWriteReporting.ts
git commit -m "feat: 종류 다시 받기가 결과로 풀리고 종류 쓰기 실패를 code로 보고한다"
```

---

### Task 5: 관리 규칙과 쓰기 함수

**Files:**

- Create(A): `src/lib/facilityTypeAdmin.test.ts`
- Create(B): `src/lib/facilityTypeAdmin.ts`

**Interfaces:**

- Consumes: `PhotoMoveDirection`(`@/lib/buildingPhotoOrder`), `FALLBACK_FACILITY_STYLE`·`facilityStyleOf`·`FacilityIconKey`
  (`@/lib/facilityStyleCatalog`), `supabase`, `authedFetch`, `FacilityType`(`@/types/domain`).
- Produces:

  ```ts
  export const TYPE_LABEL_MAX = 30;
  export const TYPE_TRANSLATION_MAX = 60;
  export interface FacilityTypeFormValues {
    label: string;
    label_en: string;
    label_zh: string;
    icon: FacilityIconKey;
    color: string;
  }
  export function typeFormFrom(
    type: FacilityType | null,
  ): FacilityTypeFormValues;
  export function typePayload(form: FacilityTypeFormValues): {
    label: string;
    label_en: string | null;
    label_zh: string | null;
    icon: FacilityIconKey;
    color: string;
  };
  export type FacilityTypePayload = ReturnType<typeof typePayload>;
  export function typeFormError(
    form: FacilityTypeFormValues,
    types: readonly Pick<FacilityType, "code" | "label">[],
    editingCode: string | null,
  ): string | null;
  export function newFacilityTypeCode(random?: () => number): string;
  export function typeSwapArgs(
    types: readonly { code: string }[],
    index: number,
    direction: PhotoMoveDirection,
  ): { p_first: string; p_second: string } | null;
  export function swapTypeOrder<T extends { code: string; sort_order: number }>(
    types: readonly T[],
    firstCode: string,
    secondCode: string,
  ): T[];
  export function withPendingSwap<
    T extends { code: string; sort_order: number },
  >(
    types: readonly T[],
    swap: { p_first: string; p_second: string } | null,
  ): readonly T[];
  export const TYPE_WRITE_MISSED = "not_found";
  export interface FacilityTypeUsageCount {
    facilities: number;
    pendingRequests: number;
  }
  export type FacilityTypeUsage = Record<string, FacilityTypeUsageCount>;
  export function deleteBlockReason(
    usage: FacilityTypeUsage,
    code: string,
  ): string | null;
  export function fetchFacilityTypeUsage(): Promise<FacilityTypeUsage | null>;
  export function translateTypeLabel(
    label: string,
  ): Promise<{ en?: string; zh?: string } | null>;
  export function fillEmptyTranslations(
    form: FacilityTypeFormValues,
    translated: { en?: string; zh?: string },
  ): FacilityTypeFormValues;
  export type TypeWriteResult = { ok: true } | { ok: false; code?: string };
  export function insertFacilityType(
    payload: FacilityTypePayload,
    makeCode?: () => string,
  ): Promise<TypeWriteResult>;
  export function updateFacilityType(
    code: string,
    payload: FacilityTypePayload,
  ): Promise<TypeWriteResult>; // 0행이면 { ok: false, code: TYPE_WRITE_MISSED }
  export function deleteFacilityType(code: string): Promise<TypeWriteResult>; // 0행이면 { ok: false, code: TYPE_WRITE_MISSED }
  ```

- [ ] **Step A1: 테스트를 쓴다** — `src/lib/facilityTypeAdmin.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub, type QueryCall } from "@/test/queryStub";

const mocks = vi.hoisted(() => ({ from: vi.fn(), authedFetch: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/authedFetch", () => ({ authedFetch: mocks.authedFetch }));

const {
  TYPE_WRITE_MISSED,
  deleteBlockReason,
  deleteFacilityType,
  fetchFacilityTypeUsage,
  fillEmptyTranslations,
  insertFacilityType,
  newFacilityTypeCode,
  swapTypeOrder,
  translateTypeLabel,
  typeFormError,
  typeFormFrom,
  typePayload,
  typeSwapArgs,
  updateFacilityType,
  withPendingSwap,
} = await import("./facilityTypeAdmin");

const RAMP = {
  code: "ramp",
  label: "경사로",
  label_en: "Ramp",
  label_zh: "坡道",
  icon: "trending-up",
  color: "#B25617",
  sort_order: 2,
};
const PARKING = {
  code: "parking",
  label: "장애인 주차",
  label_en: null,
  label_zh: null,
  icon: "square-parking",
  color: "#6D4AB0",
  sort_order: 3,
};
const LOUNGE = {
  code: "student_lounge",
  label: "장애학생 휴게실",
  label_en: null,
  label_zh: null,
  icon: "sofa",
  color: "#0F766E",
  sort_order: 7,
};

beforeEach(() => {
  mocks.from.mockReset();
  mocks.authedFetch.mockReset();
});

describe("폼 값", () => {
  it("새 종류는 DB 기본값(휠체어·회색)에서, 고칠 종류는 그 값에서 시작한다", () => {
    expect(typeFormFrom(null)).toEqual({
      label: "",
      label_en: "",
      label_zh: "",
      icon: "accessibility",
      color: "#666666",
    });
    expect(typeFormFrom(RAMP)).toEqual({
      label: "경사로",
      label_en: "Ramp",
      label_zh: "坡道",
      icon: "trending-up",
      color: "#B25617",
    });
  });

  it("앞뒤 공백을 떼고 빈 번역 칸(공백만 있어도)은 null로 보낸다", () => {
    expect(
      typePayload({
        label: " 수유실 ",
        label_en: "   ",
        label_zh: "",
        icon: "baby",
        color: "#BE185D",
      }),
    ).toEqual({
      label: "수유실",
      label_en: null,
      label_zh: null,
      icon: "baby",
      color: "#BE185D",
    });
  });

  it("한국어 이름이 비거나 다른 종류와 같거나 번역 이름이 길면 막는다", () => {
    const form = typeFormFrom(null);
    expect(typeFormError(form, [RAMP], null)).toBe("한국어 이름을 적어 주세요");
    expect(typeFormError({ ...form, label: " 경사로 " }, [RAMP], null)).toBe(
      "같은 이름의 종류가 있어요",
    );
    expect(
      typeFormError({ ...form, label: "경사로" }, [RAMP], "ramp"),
    ).toBeNull();
    expect(
      typeFormError(
        { ...form, label: "수유실", label_en: "a".repeat(61) },
        [RAMP],
        null,
      ),
    ).toBe("영어 이름은 60자까지예요");
    expect(
      typeFormError(
        { ...form, label: "수유실", label_zh: "a".repeat(61) },
        [RAMP],
        null,
      ),
    ).toBe("중국어 이름은 60자까지예요");
    expect(
      typeFormError(
        { ...form, label: "수유실", label_en: "a".repeat(60) },
        [RAMP],
        null,
      ),
    ).toBeNull();
  });

  it("자동번역은 빈 칸만 채운다", () => {
    const form = {
      ...typeFormFrom(null),
      label: "수유실",
      label_en: "Nursing room",
    };
    expect(
      fillEmptyTranslations(form, { en: "Lactation room", zh: "哺乳室" }),
    ).toMatchObject({ label_en: "Nursing room", label_zh: "哺乳室" });
  });
});

describe("새 종류 코드", () => {
  it("type_ 뒤에 소문자·숫자 8자다", () => {
    expect(newFacilityTypeCode(() => 0)).toBe("type_aaaaaaaa");
    expect(newFacilityTypeCode(() => 0.9999)).toBe("type_99999999");
    expect(newFacilityTypeCode()).toMatch(/^type_[a-z0-9]{8}$/);
  });
});

describe("순서", () => {
  const types = [RAMP, PARKING, LOUNGE];

  it("화면 순서(앞, 뒤)로 인자를 만들고 끝에서는 null이다", () => {
    expect(typeSwapArgs(types, 1, "earlier")).toEqual({
      p_first: "ramp",
      p_second: "parking",
    });
    expect(typeSwapArgs(types, 1, "later")).toEqual({
      p_first: "parking",
      p_second: "student_lounge",
    });
    expect(typeSwapArgs(types, 0, "earlier")).toBeNull();
    expect(typeSwapArgs(types, 2, "later")).toBeNull();
  });

  it("두 종류의 자리와 번호를 바꾸고, 같은 둘로 다시 부르면 제자리다", () => {
    const swapped = swapTypeOrder(types, "ramp", "parking");
    expect(swapped.map((type) => [type.code, type.sort_order])).toEqual([
      ["parking", 2],
      ["ramp", 3],
      ["student_lounge", 7],
    ]);
    expect(swapTypeOrder(swapped, "ramp", "parking")).toEqual(types);
  });

  it("저장 중인 맞바꾸기는 앞 종류가 아직 앞일 때만 겹친다", () => {
    const swap = { p_first: "ramp", p_second: "parking" };
    expect(withPendingSwap(types, null)).toBe(types);
    expect(withPendingSwap(types, swap).map((type) => type.code)).toEqual([
      "parking",
      "ramp",
      "student_lounge",
    ]);
    // 다시 받은 목록에 이미 반영됐다 — 겹치면 다시 뒤집는다
    const reloaded = [
      { ...PARKING, sort_order: 2 },
      { ...RAMP, sort_order: 3 },
      LOUNGE,
    ];
    expect(withPendingSwap(reloaded, swap)).toBe(reloaded);
  });
});

describe("삭제 막기", () => {
  it("쓰는 시설·검토 대기 요청이 있으면 이유를, 없으면 null을 준다", () => {
    const usage = {
      ramp: { facilities: 2, pendingRequests: 0 },
      parking: { facilities: 0, pendingRequests: 1 },
      both: { facilities: 1, pendingRequests: 3 },
      unused: { facilities: 0, pendingRequests: 0 },
    };
    expect(deleteBlockReason(usage, "ramp")).toBe("시설 2곳이 이 종류를 써요");
    expect(deleteBlockReason(usage, "parking")).toBe(
      "검토 대기 요청 1건이 이 종류로 들어왔어요",
    );
    expect(deleteBlockReason(usage, "both")).toBe(
      "시설 1곳이 이 종류를 써요 · 검토 대기 요청 3건이 이 종류로 들어왔어요",
    );
    expect(deleteBlockReason(usage, "unused")).toBeNull();
  });

  it("받은 현황에 없는 종류는 지울 수 있는지 모르니 막는다", () => {
    expect(deleteBlockReason({}, "type_new00001")).toBe(
      "사용 현황을 불러오지 못했어요",
    );
    expect(deleteBlockReason({}, "constructor")).toBe(
      "사용 현황을 불러오지 못했어요",
    );
  });
});

describe("서버 호출", () => {
  const payload = () => typePayload({ ...typeFormFrom(null), label: "수유실" });
  function counter() {
    let issued = 0;
    return () => `type_${String((issued += 1)).padStart(8, "0")}`;
  }
  function insertedCodes() {
    return mocks.from.mock.results.map(
      (result) =>
        (
          (result.value as { calls: QueryCall[] }).calls[0].args[0] as {
            code: string;
          }
        ).code,
    );
  }

  it("사용 현황을 받고, 실패하면 null이다", async () => {
    mocks.authedFetch.mockResolvedValueOnce(
      Response.json({ ramp: { facilities: 2, pendingRequests: 0 } }),
    );
    expect(await fetchFacilityTypeUsage()).toEqual({
      ramp: { facilities: 2, pendingRequests: 0 },
    });
    expect(mocks.authedFetch).toHaveBeenCalledWith("/api/facility-types/usage");
    mocks.authedFetch.mockResolvedValueOnce(
      Response.json({ error: "x" }, { status: 500 }),
    );
    expect(await fetchFacilityTypeUsage()).toBeNull();
    mocks.authedFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await fetchFacilityTypeUsage()).toBeNull();
  });

  it("한국어 이름을 label 키로 번역하고, 실패하면 null이다", async () => {
    mocks.authedFetch.mockResolvedValueOnce(
      Response.json({ en: { label: "Nursing room" }, zh: { label: "哺乳室" } }),
    );
    expect(await translateTypeLabel("수유실")).toEqual({
      en: "Nursing room",
      zh: "哺乳室",
    });
    expect(JSON.parse(mocks.authedFetch.mock.calls[0][1].body)).toEqual({
      texts: { label: "수유실" },
    });
    mocks.authedFetch.mockResolvedValueOnce(
      Response.json({ error: "x" }, { status: 502 }),
    );
    expect(await translateTypeLabel("수유실")).toBeNull();
  });

  it("코드가 겹치면 새 코드로 한 번만 더 넣는다", async () => {
    mocks.from
      .mockReturnValueOnce(
        queryStub({ error: { code: "23505", message: "dup" } }),
      )
      .mockReturnValueOnce(queryStub({ error: null }));
    expect(await insertFacilityType(payload(), counter())).toEqual({
      ok: true,
    });
    expect(insertedCodes()).toEqual(["type_00000001", "type_00000002"]);
  });

  it("두 번 겹치면 그만두고 23505를 돌려준다", async () => {
    mocks.from.mockReturnValue(
      queryStub({ error: { code: "23505", message: "dup" } }),
    );
    expect(await insertFacilityType(payload(), counter())).toEqual({
      ok: false,
      code: "23505",
    });
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it("다른 오류는 다시 넣지 않는다", async () => {
    mocks.from.mockReturnValue(
      queryStub({ error: { code: "42501", message: "rls" } }),
    );
    expect(await insertFacilityType(payload(), counter())).toEqual({
      ok: false,
      code: "42501",
    });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("지우기는 code로 고르고 외래 키 오류 코드를 돌려준다", async () => {
    const stub = queryStub({
      data: null,
      error: { code: "23503", message: "fk" },
    });
    mocks.from.mockReturnValue(stub);
    expect(await deleteFacilityType("ramp")).toEqual({
      ok: false,
      code: "23503",
    });
    expect(stub.calls).toEqual([
      { method: "delete", args: [] },
      { method: "eq", args: ["code", "ramp"] },
      { method: "select", args: ["code"] },
    ]);
  });

  it("고치기·지우기가 0행이면(RLS가 걸렀거나 그사이 지워졌다) 실패다", async () => {
    mocks.from.mockReturnValue(queryStub({ data: [], error: null }));
    expect(await updateFacilityType("ramp", payload())).toEqual({
      ok: false,
      code: TYPE_WRITE_MISSED,
    });
    expect(await deleteFacilityType("ramp")).toEqual({
      ok: false,
      code: TYPE_WRITE_MISSED,
    });
    mocks.from.mockReturnValue(
      queryStub({ data: [{ code: "ramp" }], error: null }),
    );
    expect(await updateFacilityType("ramp", payload())).toEqual({ ok: true });
    expect(await deleteFacilityType("ramp")).toEqual({ ok: true });
  });
});
```

- [ ] **Step A2: 커밋**

```bash
npx --yes prettier@3.9.4 --write src/lib/facilityTypeAdmin.test.ts
rg -n "\x{FFFD}" src/lib/facilityTypeAdmin.test.ts
git add src/lib/facilityTypeAdmin.test.ts
git commit -m "test: 시설 종류 관리 규칙과 쓰기 함수를 시험한다"
```

- [ ] **Step B1: 구현한다** — `src/lib/facilityTypeAdmin.ts`

```ts
import { authedFetch } from "@/lib/authedFetch";
import type { PhotoMoveDirection } from "@/lib/buildingPhotoOrder";
import {
  FALLBACK_FACILITY_STYLE,
  facilityStyleOf,
  type FacilityIconKey,
} from "@/lib/facilityStyleCatalog";
import { supabase } from "@/lib/supabaseClient";
import type { FacilityType } from "@/types/domain";

/** 관리자 시설 종류 관리의 규칙과 쓰기. 설계: docs/specs/2026-10-26-facility-type-management-design.md 3장 */

export const TYPE_LABEL_MAX = 30;
export const TYPE_TRANSLATION_MAX = 60;

export interface FacilityTypeFormValues {
  label: string;
  label_en: string;
  label_zh: string;
  icon: FacilityIconKey;
  color: string;
}

export function typeFormFrom(
  type: FacilityType | null,
): FacilityTypeFormValues {
  const style = type
    ? facilityStyleOf([type], type.code)
    : FALLBACK_FACILITY_STYLE;
  return {
    label: type?.label ?? "",
    label_en: type?.label_en ?? "",
    label_zh: type?.label_zh ?? "",
    icon: style.icon,
    color: style.color,
  };
}

/** 빈 번역은 NULL이다. 화면들이 `label_en ?? label`처럼 NULL일 때만 한국어로 떨어뜨린다(설계 3.3) */
export function typePayload(form: FacilityTypeFormValues) {
  const optional = (value: string) => value.trim() || null;
  return {
    label: form.label.trim(),
    label_en: optional(form.label_en),
    label_zh: optional(form.label_zh),
    icon: form.icon,
    color: form.color,
  };
}

export type FacilityTypePayload = ReturnType<typeof typePayload>;

/** 자동번역은 입력 칸의 maxLength를 거치지 않고 칸을 채워 번역 이름 길이는 여기서 본다 */
export function typeFormError(
  form: FacilityTypeFormValues,
  types: readonly Pick<FacilityType, "code" | "label">[],
  editingCode: string | null,
): string | null {
  const label = form.label.trim();
  if (!label) return "한국어 이름을 적어 주세요";
  if (form.label_en.trim().length > TYPE_TRANSLATION_MAX)
    return `영어 이름은 ${TYPE_TRANSLATION_MAX}자까지예요`;
  if (form.label_zh.trim().length > TYPE_TRANSLATION_MAX)
    return `중국어 이름은 ${TYPE_TRANSLATION_MAX}자까지예요`;
  if (
    types.some(
      (type) =>
        type.code !== editingCode && (type.label ?? "").trim() === label,
    )
  )
    return "같은 이름의 종류가 있어요";
  return null;
}

const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** 관리자가 정하지 않고 만든 뒤 바꾸지 않는다 — 시설·등록 요청이 이 값으로 종류를 가리킨다(설계 1.5) */
export function newFacilityTypeCode(
  random: () => number = Math.random,
): string {
  let suffix = "";
  for (let index = 0; index < 8; index += 1)
    suffix += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return `type_${suffix}`;
}

/** 맞바꾸기 RPC 인자. DB 함수가 방향까지 보므로 화면 순서(앞 종류, 뒤 종류)로 준다. 끝이라 옮길 수 없으면 null */
export function typeSwapArgs(
  types: readonly { code: string }[],
  index: number,
  direction: PhotoMoveDirection,
): { p_first: string; p_second: string } | null {
  const front = direction === "earlier" ? index - 1 : index;
  const back = front + 1;
  if (front < 0 || back >= types.length) return null;
  return { p_first: types[front].code, p_second: types[back].code };
}

/** 두 종류의 자리와 번호를 맞바꾼다. 저장 중인 맞바꾸기를 받은 목록 위에 겹쳐 그리는 데 쓴다 */
export function swapTypeOrder<T extends { code: string; sort_order: number }>(
  types: readonly T[],
  firstCode: string,
  secondCode: string,
): T[] {
  const first = types.findIndex((type) => type.code === firstCode);
  const second = types.findIndex((type) => type.code === secondCode);
  const next = [...types];
  if (first < 0 || second < 0) return next;
  next[first] = { ...types[second], sort_order: types[first].sort_order };
  next[second] = { ...types[first], sort_order: types[second].sort_order };
  return next;
}

/**
 * 저장 중인 맞바꾸기를 받은 목록 위에 겹친다. 앞 종류가 이미 뒤에 있으면(다시 받은 목록에 반영됐거나 그사이 바뀌었다) 겹치지
 * 않는다 — 그대로 바꾸면 반영된 순서를 다시 뒤집는다.
 */
export function withPendingSwap<T extends { code: string; sort_order: number }>(
  types: readonly T[],
  swap: { p_first: string; p_second: string } | null,
): readonly T[] {
  if (!swap) return types;
  const first = types.findIndex((type) => type.code === swap.p_first);
  const second = types.findIndex((type) => type.code === swap.p_second);
  return first >= 0 && first < second
    ? swapTypeOrder(types, swap.p_first, swap.p_second)
    : types;
}

export interface FacilityTypeUsageCount {
  facilities: number;
  pendingRequests: number;
}

export type FacilityTypeUsage = Record<string, FacilityTypeUsageCount>;

/** 끝난 요청(승인·거절)은 기록이라 막지 않는다(설계 3.4). 받은 현황에 없는 종류는 지울 수 있는지 모른다 */
export function deleteBlockReason(
  usage: FacilityTypeUsage,
  code: string,
): string | null {
  const count = Object.hasOwn(usage, code) ? usage[code] : undefined;
  if (!count) return "사용 현황을 불러오지 못했어요";
  const reasons: string[] = [];
  if (count.facilities > 0)
    reasons.push(`시설 ${count.facilities}곳이 이 종류를 써요`);
  if (count.pendingRequests > 0)
    reasons.push(
      `검토 대기 요청 ${count.pendingRequests}건이 이 종류로 들어왔어요`,
    );
  return reasons.length > 0 ? reasons.join(" · ") : null;
}

export async function fetchFacilityTypeUsage(): Promise<FacilityTypeUsage | null> {
  try {
    const response = await authedFetch("/api/facility-types/usage");
    if (!response.ok) return null;
    return (await response.json()) as FacilityTypeUsage;
  } catch {
    return null;
  }
}

export async function translateTypeLabel(
  label: string,
): Promise<{ en?: string; zh?: string } | null> {
  try {
    const response = await authedFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: { label } }),
    });
    if (!response.ok) return null;
    const { en, zh } = (await response.json()) as {
      en?: { label?: string };
      zh?: { label?: string };
    };
    return { en: en?.label, zh: zh?.label };
  } catch {
    return null;
  }
}

/** 빈 칸만 채운다. 요청이 도는 사이 직접 적은 값을 덮지 않는다(명소 `applyLandmarkTranslations`와 같은 규칙) */
export function fillEmptyTranslations(
  form: FacilityTypeFormValues,
  translated: { en?: string; zh?: string },
): FacilityTypeFormValues {
  return {
    ...form,
    label_en: form.label_en.trim()
      ? form.label_en
      : (translated.en ?? form.label_en),
    label_zh: form.label_zh.trim()
      ? form.label_zh
      : (translated.zh ?? form.label_zh),
  };
}

export type TypeWriteResult = { ok: true } | { ok: false; code?: string };

/** 코드는 기본 키라 겹치면 DB가 거부한다(`23505`). 새 값으로 한 번 더 시도한다(설계 1.5) */
export async function insertFacilityType(
  payload: FacilityTypePayload,
  makeCode: () => string = newFacilityTypeCode,
): Promise<TypeWriteResult> {
  let failure: string | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await supabase
      .from("facility_types")
      .insert({ code: makeCode(), ...payload });
    if (!error) return { ok: true };
    failure = error.code;
    if (failure !== "23505") break;
  }
  return { ok: false, code: failure };
}

/** 고치기·지우기가 0행으로 끝났다. RLS가 걸렀거나 그사이 지워진 행은 오류 없이 0행이다 */
export const TYPE_WRITE_MISSED = "not_found";

function writeResult(
  data: unknown[] | null,
  error: { code: string } | null,
): TypeWriteResult {
  if (error) return { ok: false, code: error.code };
  return data && data.length > 0
    ? { ok: true }
    : { ok: false, code: TYPE_WRITE_MISSED };
}

export async function updateFacilityType(
  code: string,
  payload: FacilityTypePayload,
): Promise<TypeWriteResult> {
  const { data, error } = await supabase
    .from("facility_types")
    .update(payload)
    .eq("code", code)
    .select("code");
  return writeResult(data, error);
}

export async function deleteFacilityType(
  code: string,
): Promise<TypeWriteResult> {
  const { data, error } = await supabase
    .from("facility_types")
    .delete()
    .eq("code", code)
    .select("code");
  return writeResult(data, error);
}
```

- [ ] **Step B2: 커밋**

```bash
npx --yes prettier@3.9.4 --write src/lib/facilityTypeAdmin.ts
rg -n "\x{FFFD}" src/lib/facilityTypeAdmin.ts
git add src/lib/facilityTypeAdmin.ts
git commit -m "feat: 시설 종류 관리의 입력 규칙·순서·삭제 막기와 쓰기 함수를 둔다"
```

---

### Task 6: E2E 목 백엔드 — 종류를 상태로

**Files:**

- Modify(A): `e2e/support/mockBackend.ts`, `e2e/facility-types-order.spec.ts`(주석)

**Interfaces:**

- Produces: `MockState.facilityTypes: Row[]`(픽스처 `types` 복사, `sort_order` 1·2·3), `MockState.facilityTypeSwapRequests: { p_first: string; p_second: string }[]`.
  `GET /rest/v1/facility_types`는 상태를 `order`대로, `POST`·`PATCH`·`DELETE /rest/v1/facility_types`(`?code=eq.`)와
  `POST /rest/v1/rpc/swap_facility_type_order`는 상태를 바꾼다. `GET /api/facility-types/usage`는 상태로 센다.

- [ ] **Step A1: 머리 주석** — 맨 위 블록 주석의 두 곳을 고친다.

` * 1) 픽스처(고정 데이터): \`types\`(시설 유형) · \`colleges\` · \`polygon\`(건물 형상).` →

```ts
 * 1) 픽스처(고정 데이터): `types`(시설 유형 — 테스트마다 `state.facilityTypes`로 복사한다) · `colleges` · `polygon`(건물 형상).
```

` *          \`rpc/swap_building_photo_order\`는 \`swapBuildingPhotos()\`가 운영 함수의 판정을 흉내 낸다.` 줄 뒤에 더한다:

```ts
 *          `facility_types` 쓰기는 `?code=eq.`로 고르고(`writeFacilityType()`), `rpc/swap_facility_type_order`는
 *          `swapFacilityTypes()`가 흉내 낸다. 시설 행의 `facility_types` 임베드는 읽을 때 상태의 종류에서 만든다.
```

- [ ] **Step A2: 상태와 픽스처**

`MockState`의 `photoSwapRequests` 뒤에 더한다:

```ts
  /** 시설 종류. 픽스처 `types`의 복사본이라 관리 화면의 쓰기가 반영된다 */
  facilityTypes: Row[];
  /** 브라우저가 보낸 종류 맞바꾸기 RPC 인자(화면 순서) */
  facilityTypeSwapRequests: { p_first: string; p_second: string }[];
```

`// facility_types / colleges 조회에 그대로 반환되고, 시설 POST 시 code로 매칭된다.` 주석을 바꾼다:

```ts
// `types`는 테스트마다 `state.facilityTypes`로 복사해 쓰기를 반영하고, `colleges`는 조회에 그대로 돌려준다.
```

`types`의 세 행에 `sort_order`를 더한다: `elevator` 1, `ramp` 2, `parking` 3(각 객체의 `color` 다음 줄에 `sort_order: N,`).

`createState()`의 `photoSwapRequests: [],` 뒤에 더한다:

```ts
    facilityTypes: types.map((type) => ({ ...type })),
    facilityTypeSwapRequests: [],
```

- [ ] **Step A3: 읽기**

`table()`에 `building_photos` 줄 뒤로 더한다:

```ts
if (name === "facility_types") return state.facilityTypes;
```

`table()` 함수 바로 뒤에 더한다:

```ts
/** 시설 행의 종류 임베드를 상태의 종류에서 만든다 — 종류 이름을 고치면 시설 목록에도 보여야 한다. 상태에 없는 코드는 행이 든 값을 둔다 */
function withTypeEmbed(state: MockState, row: Row): Row {
  const type = state.facilityTypes.find(
    (item) => item.code === row.facility_code,
  );
  return type ? { ...row, facility_types: { ...type } } : row;
}
```

`rows()` 위 주석 `// 테이블 조회: 정적 테이블(facility_types/colleges)은 즉시, …`의 `정적 테이블(facility_types/colleges)`을
`정적 테이블(colleges)`로 고치고, `rows()` 안의 `if (name === "facility_types") return types;` 줄을 지운다(종류는 아래 공통 처리로
`order`를 따른다).

`rows()`의 `if (name === "building_facilities") { const parent = url.searchParams.get("building_id"); … }` 블록 끝(닫는 `}` 바로 앞)에
더한다:

```ts
result = result.map((row) => withTypeEmbed(state, row));
```

`handleApi()`의 `/api/facilities` 응답을 바꾼다:

```ts
if (path === "/api/facilities")
  return json(
    route,
    state.facilities
      .filter(
        (row) =>
          row.is_installed &&
          !state.buildings.find((building) => building.id === row.building_id)
            ?.is_deleted,
      )
      .map((row) => withTypeEmbed(state, row)),
  );
```

`handleRest()`의 시설 POST(`created.facility_types = types.find(…) ?? null;`)와 `handleApi()`의 등록 요청 승인
(`facility_types: types.find((type) => type.code === fields.facility_code) ?? null,`)에서 `types.find`를 `state.facilityTypes.find`로 바꾼다.

- [ ] **Step A4: 쓰기와 RPC**

`swapBuildingPhotos()` 함수 바로 뒤에 더한다:

```ts
/**
 * `rpc/swap_facility_type_order` 흉내. 판정 순서와 SQLSTATE는 운영 함수(`20261026020000_add_facility_type_order_swap.sql`)를,
 * HTTP 상태는 `swapBuildingPhotos()`와 같은 규칙을 따른다. RLS 거부(`42501`)는 흉내 내지 않는다 — 그 경우는 테스트가 응답을 덮어쓴다.
 */
function swapFacilityTypes(
  route: Route,
  state: MockState,
  firstCode: string,
  secondCode: string,
) {
  const fail = (status: number, code: string, message: string) =>
    json(route, { code, message, details: null, hint: null }, status);
  if (firstCode === secondCode)
    return fail(400, "22023", "cannot swap a facility type with itself");
  const first = state.facilityTypes.find((type) => type.code === firstCode);
  const second = state.facilityTypes.find((type) => type.code === secondCode);
  if (!first || !second) return fail(500, "P0002", "facility type not found");
  const firstOrder = Number(first.sort_order);
  const secondOrder = Number(second.sort_order);
  const between = state.facilityTypes.some(
    (type) =>
      Number(type.sort_order) > firstOrder &&
      Number(type.sort_order) < secondOrder,
  );
  if (firstOrder > secondOrder || between)
    return fail(
      409,
      "PT409",
      "facility types are no longer adjacent in this order",
    );
  first.sort_order = secondOrder;
  second.sort_order = firstOrder;
  return route.fulfill({
    status: 204,
    headers: { "access-control-allow-origin": "*" },
    body: "",
  });
}

/**
 * `facility_types` 쓰기 흉내. 기본 키가 `code`라 `?code=eq.`로 고른다. 코드가 겹치면 `23505`, 시설이 쓰는 종류를 지우면 외래 키
 * `23503`(둘 다 PostgREST 409)이다. 번호 없이 들어온 종류는 운영 identity처럼 맨 뒤 번호를 받는다.
 */
function writeFacilityType(
  route: Route,
  state: MockState,
  url: URL,
  method: string,
) {
  const fail = (code: string, message: string) =>
    json(route, { code, message, details: null, hint: null }, 409);
  if (method === "POST") {
    const body = route.request().postDataJSON() as Row | Row[];
    const input = Array.isArray(body) ? body[0] : body;
    if (state.facilityTypes.some((type) => type.code === input.code))
      return fail(
        "23505",
        'duplicate key value violates unique constraint "facility_types_pkey"',
      );
    const created: Row = {
      label_en: null,
      label_zh: null,
      icon: "accessibility",
      color: "#666666",
      sort_order:
        Math.max(
          0,
          ...state.facilityTypes.map((type) => Number(type.sort_order)),
        ) + 1,
      ...input,
    };
    state.facilityTypes.push(created);
    return json(route, [created], 201);
  }
  const filter = url.searchParams.get("code");
  const code = filter?.startsWith("eq.") ? filter.slice(3) : null;
  const index = state.facilityTypes.findIndex((type) => type.code === code);
  if (index < 0) return json(route, []);
  if (method === "PATCH") {
    Object.assign(state.facilityTypes[index], route.request().postDataJSON());
    return json(route, [state.facilityTypes[index]]);
  }
  if (state.facilities.some((facility) => facility.facility_code === code))
    return fail(
      "23503",
      'update or delete on table "facility_types" violates foreign key constraint',
    );
  return json(route, state.facilityTypes.splice(index, 1));
}
```

`handleRest()`의 `rpc/swap_building_photo_order` 분기 바로 뒤에 더한다:

```ts
if (name === "rpc/swap_facility_type_order" && method === "POST") {
  const args = route.request().postDataJSON() as {
    p_first: string;
    p_second: string;
  };
  state.facilityTypeSwapRequests.push(args);
  return swapFacilityTypes(route, state, args.p_first, args.p_second);
}
if (name === "facility_types" && method !== "GET" && method !== "HEAD")
  return writeFacilityType(route, state, url, method);
```

`handleApi()`의 `/api/inbox-counts` 분기 바로 뒤에 더한다:

```ts
if (path === "/api/facility-types/usage") {
  // 운영 라우트와 같은 기준: 시설은 모두, 등록 요청은 검토 대기(new·reviewing)만 센다
  return json(
    route,
    Object.fromEntries(
      state.facilityTypes.map((type) => [
        type.code,
        {
          facilities: state.facilities.filter(
            (facility) => facility.facility_code === type.code,
          ).length,
          pendingRequests: state.facilityRequests.filter(
            (request) =>
              request.facility_code === type.code &&
              ["new", "reviewing"].includes(String(request.status)),
          ).length,
        },
      ]),
    ),
  );
}
```

- [ ] **Step A5: 낡은 주석** — `e2e/facility-types-order.spec.ts`의 둘째 주석 줄
      `// 목 백엔드는 종류를 고정 목록으로 돌려줘 정렬 결과는 흉내 내지 않는다. 요청이 정렬을 묻는지만 본다.`를 바꾼다:

```ts
// 목 백엔드도 `order`대로 돌려주지만 픽스처가 이미 그 순서라, 결과만 보면 요청에서 정렬이 빠져도 통과한다. 요청이 정렬을 묻는지 본다.
```

- [ ] **Step A6: 커밋**

```bash
npx --yes prettier@3.9.4 --write e2e/support/mockBackend.ts e2e/facility-types-order.spec.ts
rg -n "\x{FFFD}" e2e/support/mockBackend.ts e2e/facility-types-order.spec.ts
rg -n "types\.find|return types;" e2e/support/mockBackend.ts
git add e2e/support/mockBackend.ts e2e/facility-types-order.spec.ts
git commit -m "test(e2e): 목 백엔드가 시설 종류를 상태로 들고 쓰기·맞바꾸기·사용 현황을 흉내 낸다"
```

Expected(두 번째 `rg`): 출력 없음.

---

### Task 7: E2E — 종류 관리 화면

**Files:**

- Create(A): `e2e/facility-type-management.spec.ts`
- Modify(A): `e2e/admin-dark.spec.ts`

- [ ] **Step A1: spec을 쓴다** — `e2e/facility-type-management.spec.ts`

```ts
import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";
import { serverError } from "./support/adminWorkspace";
import { installMockBackend, type MockState } from "./support/mockBackend";

// 설계: docs/specs/2026-10-26-facility-type-management-design.md 3장·4.2

const FACILITIES_PATH = "/admin/dashboard/facilities";
const UNUSED = {
  code: "type_unused01",
  label: "안 쓰는 종류",
  label_en: null,
  label_zh: null,
  icon: "info",
  color: "#475569",
  sort_order: 4,
};

function listPanel(page: Page) {
  return page.getByRole("region", { name: "독립 시설", exact: true });
}

async function openTypesModal(page: Page) {
  await listPanel(page).getByRole("button", { name: "종류 관리" }).click();
  const dialog = page.getByRole("dialog", { name: "시설 종류 관리" });
  await expect(dialog).toBeVisible();
  return dialog;
}

function typeRow(dialog: Locator, label: string) {
  return dialog.locator(".ku-types-modal-row").filter({
    has: dialog
      .page()
      .locator(".ku-types-modal-label")
      .getByText(label, { exact: true }),
  });
}

async function expectLabels(dialog: Locator, labels: string[]) {
  await expect(dialog.locator(".ku-types-modal-label")).toHaveText(labels);
}

function moveButton(
  dialog: Locator,
  label: string,
  direction: "위로" | "아래로",
) {
  return dialog.getByRole("button", {
    name: `${label} ${direction} 옮기기`,
    exact: true,
  });
}

function toast(page: Page, role: "status" | "alert", text: string) {
  return page.locator(`.ku-toast[role='${role}']`).filter({ hasText: text });
}

function isRequest(method: string, path: string) {
  return (request: Request) =>
    request.method() === method &&
    new URL(request.url()).pathname.endsWith(path);
}

function typeByCode(state: MockState, code: string) {
  return state.facilityTypes.find((type) => type.code === code)!;
}

async function expectTouchTarget(
  control: Locator,
  frame?: { x: number; width: number },
) {
  const box = (await control.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  if (frame) {
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
  }
}

test.describe("시설 종류 관리 — 목록", () => {
  test("순서대로 종류와 번역 이름, 쓰는 시설 수를 보여 주고 닫으면 버튼으로 돌아간다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);

    await expectLabels(dialog, ["엘리베이터", "경사로", "장애인 주차"]);
    const ramp = typeRow(dialog, "경사로");
    await expect(ramp).toContainText("Ramp · 坡道");
    await expect(ramp).toContainText("시설 2곳이 이 종류를 써요");
    await expect(
      ramp.getByRole("button", { name: "경사로 삭제" }),
    ).toBeDisabled();

    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      listPanel(page).getByRole("button", { name: "종류 관리" }),
    ).toBeFocused();
  });

  test("사용 현황을 받지 못하면 삭제를 모두 끄고 다시 시도할 수 있다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let failUsage = true;
    await page.route("**/api/facility-types/usage", (route) =>
      failUsage ? serverError(route) : route.fallback(),
    );
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);

    const alert = dialog
      .getByRole("alert")
      .filter({ hasText: "사용 현황을 불러오지 못했어요" });
    await expect(alert).toBeVisible();
    for (const label of ["엘리베이터", "경사로", "장애인 주차"])
      await expect(
        dialog.getByRole("button", { name: `${label} 삭제` }),
      ).toBeDisabled();

    failUsage = false;
    await alert.getByRole("button", { name: "다시 시도" }).click();
    await expect(alert).toBeHidden();
    await expect(typeRow(dialog, "경사로")).toContainText(
      "시설 2곳이 이 종류를 써요",
    );
  });
});

test.describe("시설 종류 관리 — 추가·수정", () => {
  test("자동번역·아이콘·색으로 새 종류를 추가하면 맨 뒤에 붙고 공개 필터에도 나온다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();
    await expect(
      dialog.getByRole("heading", { name: "종류 추가" }),
    ).toBeVisible();
    await expect(dialog.getByLabel("한국어 이름")).toBeFocused();

    await dialog.getByLabel("한국어 이름").fill("수유실");
    await dialog.getByRole("button", { name: "자동번역 채우기" }).click();
    await expect(dialog.getByLabel("영어 이름")).toHaveValue("EN 수유실");
    await expect(dialog.getByLabel("중국어 이름")).toHaveValue("ZH 수유실");
    await dialog.getByTitle("수유·기저귀", { exact: true }).click();
    await expect(
      dialog.getByRole("radio", { name: "수유·기저귀" }),
    ).toBeChecked();
    await dialog.getByTitle("분홍", { exact: true }).click();
    await expect(dialog.getByRole("radio", { name: "분홍" })).toBeChecked();

    const preview = dialog.getByRole("group", { name: "미리보기" });
    await expect(preview.locator(".ku-types-form-preview-marker")).toHaveCSS(
      "background-color",
      "rgb(190, 24, 93)",
    );
    await expect(preview.locator(".ku-types-form-preview-chip")).toContainText(
      "수유실",
    );
    await expect(preview.locator("svg.lucide-baby")).toHaveCount(2);

    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "status", "종류를 추가했어요")).toBeVisible();
    await expectLabels(dialog, [
      "엘리베이터",
      "경사로",
      "장애인 주차",
      "수유실",
    ]);
    await expect(typeRow(dialog, "수유실")).toContainText("쓰는 시설 없음");
    const created = state.facilityTypes.at(-1)!;
    expect(created).toMatchObject({
      label: "수유실",
      label_en: "EN 수유실",
      label_zh: "ZH 수유실",
      icon: "baby",
      color: "#BE185D",
      sort_order: 4,
    });
    expect(String(created.code)).toMatch(/^type_[a-z0-9]{8}$/);

    await page.goto("/");
    await page.getByRole("button", { name: "시설", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /수유실/ }).locator("svg.lucide-baby"),
    ).toHaveCount(1);
  });

  test("빈 영어·중국어 칸은 NULL로 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();
    await dialog.getByLabel("한국어 이름").fill("휴게실");
    await dialog.getByLabel("영어 이름").fill("   ");
    const insert = page.waitForRequest(
      isRequest("POST", "/rest/v1/facility_types"),
    );
    await dialog.getByRole("button", { name: "저장" }).click();

    expect((await insert).postDataJSON()).toMatchObject({
      label: "휴게실",
      label_en: null,
      label_zh: null,
      icon: "accessibility",
      color: "#666666",
    });
    await expect(toast(page, "status", "종류를 추가했어요")).toBeVisible();
    expect(state.facilityTypes.at(-1)).toMatchObject({
      label_en: null,
      label_zh: null,
    });
  });

  test("이름이 비었거나 다른 종류와 같으면 보내지 않고 알린다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    const inserts: string[] = [];
    page.on("request", (request) => {
      if (isRequest("POST", "/rest/v1/facility_types")(request))
        inserts.push(request.url());
    });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();

    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "한국어 이름을 적어 주세요",
    );
    await dialog.getByLabel("한국어 이름").fill(" 경사로 ");
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "같은 이름의 종류가 있어요",
    );
    expect(inserts).toHaveLength(0);
  });

  test("자동번역이 실패하면 칸을 비운 채 알리고 저장은 막지 않는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      failTranslations: 1,
    });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();
    await dialog.getByLabel("한국어 이름").fill("샤워실");
    await dialog.getByRole("button", { name: "자동번역 채우기" }).click();

    await expect(toast(page, "status", "자동번역에 실패했어요")).toBeVisible();
    await expect(dialog.getByLabel("영어 이름")).toHaveValue("");
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "status", "종류를 추가했어요")).toBeVisible();
    expect(state.facilityTypes.at(-1)).toMatchObject({
      label: "샤워실",
      label_en: null,
    });
  });

  test("이름을 고치면 공개 지도 캐시를 비우고, 닫은 뒤 시설 목록의 종류 이름이 바뀐다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await typeRow(dialog, "경사로")
      .getByRole("button", { name: "경사로 수정" })
      .click();
    await expect(
      dialog.getByRole("heading", { name: "종류 수정 — 경사로" }),
    ).toBeVisible();
    await expect(dialog.getByRole("radio", { name: "주황" })).toBeChecked();

    await dialog.getByLabel("한국어 이름").fill("완만한 경사로");
    const revalidate = page.waitForRequest(
      isRequest("POST", "/api/revalidate-facilities"),
    );
    await dialog.getByRole("button", { name: "저장" }).click();
    await revalidate;
    await expect(toast(page, "status", "종류를 고쳤어요")).toBeVisible();
    expect(typeByCode(state, "ramp")).toMatchObject({ label: "완만한 경사로" });
    await expectLabels(dialog, ["엘리베이터", "완만한 경사로", "장애인 주차"]);

    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(
      listPanel(page).getByRole("button", { name: /중앙광장 경사로/ }),
    ).toContainText("완만한 경사로 ·");
    await expect(
      page
        .getByLabel("시설 유형 필터")
        .locator("option", { hasText: "완만한 경사로" }),
    ).toHaveCount(1);
  });
});

test.describe("시설 종류 관리 — 삭제", () => {
  test("쓰는 시설이나 검토 대기 요청이 있으면 삭제를 끄고 이유를 보여 준다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.facilityTypes.push({ ...UNUSED });
    state.facilityRequests.push(
      {
        id: "00000000-0000-4000-8000-000000000101",
        building_id: 1,
        facility_code: UNUSED.code,
        status: "reviewing",
        created_at: "2026-10-20T00:00:00Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000102",
        building_id: 1,
        facility_code: UNUSED.code,
        status: "approved",
        created_at: "2026-10-19T00:00:00Z",
      },
    );
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);

    const unused = typeRow(dialog, UNUSED.label);
    await expect(unused).toContainText(
      "검토 대기 요청 1건이 이 종류로 들어왔어요",
    );
    await expect(
      unused.getByRole("button", { name: `${UNUSED.label} 삭제` }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "장애인 주차 삭제" }),
    ).toBeDisabled();
  });

  test("아무도 쓰지 않는 종류를 지우면 목록에서 빠지고 공개 지도 캐시를 비운다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.facilityTypes.push({ ...UNUSED });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    const unused = typeRow(dialog, UNUSED.label);
    await expect(unused).toContainText("쓰는 시설 없음");

    await unused.getByRole("button", { name: `${UNUSED.label} 삭제` }).click();
    const revalidate = page.waitForRequest(
      isRequest("POST", "/api/revalidate-facilities"),
    );
    await page
      .getByRole("dialog", { name: "종류를 삭제할까요?" })
      .getByRole("button", { name: "삭제", exact: true })
      .click();
    await revalidate;

    await expect(toast(page, "status", "종류를 삭제했어요")).toBeVisible();
    await expectLabels(dialog, ["엘리베이터", "경사로", "장애인 주차"]);
    expect(state.facilityTypes.map((type) => type.code)).not.toContain(
      UNUSED.code,
    );
    // 지운 줄의 버튼이 사라져도 초점은 종류 관리 모달 안에 남는다
    await expect(dialog.locator(":focus")).toHaveCount(1);
  });

  test("유형 필터로 고른 종류를 지우면 필터가 모든 유형으로 돌아간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.facilityTypes.push({ ...UNUSED });
    await page.goto(FACILITIES_PATH);
    const filter = page.getByLabel("시설 유형 필터");
    await filter.selectOption(UNUSED.code);
    await expect(listPanel(page).getByRole("status")).toHaveText("0개 표시");

    const dialog = await openTypesModal(page);
    await typeRow(dialog, UNUSED.label)
      .getByRole("button", { name: `${UNUSED.label} 삭제` })
      .click();
    await page
      .getByRole("dialog", { name: "종류를 삭제할까요?" })
      .getByRole("button", { name: "삭제", exact: true })
      .click();
    await expect(toast(page, "status", "종류를 삭제했어요")).toBeVisible();
    await dialog.getByRole("button", { name: "닫기" }).click();

    await expect(filter).toHaveValue("all");
    await expect(listPanel(page).getByRole("status")).toHaveText("2개 표시");
  });

  test("센 뒤에 그 종류로 시설이 생기면 지우지 않고 알린 뒤 수를 다시 보여 준다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.facilityTypes.push({ ...UNUSED });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    const unused = typeRow(dialog, UNUSED.label);
    await expect(unused).toContainText("쓰는 시설 없음");
    // 다른 관리자가 그사이 이 종류로 시설을 등록했다
    state.facilities.push({
      ...state.facilities[0],
      id: "f-race",
      facility_code: UNUSED.code,
    });

    await unused.getByRole("button", { name: `${UNUSED.label} 삭제` }).click();
    await page
      .getByRole("dialog", { name: "종류를 삭제할까요?" })
      .getByRole("button", { name: "삭제", exact: true })
      .click();

    await expect(
      toast(
        page,
        "status",
        "그사이 이 종류를 쓰는 시설이 생겨 지우지 못했어요",
      ),
    ).toBeVisible();
    await expect(unused).toContainText("시설 1곳이 이 종류를 써요");
    await expect(
      unused.getByRole("button", { name: `${UNUSED.label} 삭제` }),
    ).toBeDisabled();
    expect(state.facilityTypes.map((type) => type.code)).toContain(UNUSED.code);
    await expect.poll(() => state.activityReports.length).toBe(1);
    expect(state.activityReports[0]).toMatchObject({
      action: "facility_types.delete",
      target_table: "facility_types",
      target_id: UNUSED.code,
    });
  });
});

test.describe("시설 종류 관리 — 순서", () => {
  test("▲▼로 이웃 종류와 자리를 바꾸고 화면 순서대로 저장해 다시 열어도 그 순서다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    let dialog = await openTypesModal(page);
    await expect(moveButton(dialog, "엘리베이터", "위로")).toBeDisabled();
    await expect(moveButton(dialog, "장애인 주차", "아래로")).toBeDisabled();

    await moveButton(dialog, "장애인 주차", "위로").click();
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
    await expect
      .poll(() => state.facilityTypeSwapRequests)
      .toEqual([{ p_first: "ramp", p_second: "parking" }]);

    await page.reload();
    dialog = await openTypesModal(page);
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
  });

  test("키보드로 옮기면 초점이 옮긴 종류의 화살표를 따라간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);

    await moveButton(dialog, "경사로", "아래로").focus();
    await page.keyboard.press("Enter");
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
    // 경사로가 맨 끝에 닿아 아래로가 꺼지므로 같은 종류의 위로로 간다
    await expect(moveButton(dialog, "경사로", "위로")).toBeFocused();

    await expect(moveButton(dialog, "경사로", "위로")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.keyboard.press("Enter");
    await expectLabels(dialog, ["엘리베이터", "경사로", "장애인 주차"]);
    await expect(moveButton(dialog, "경사로", "위로")).toBeFocused();
    await expect
      .poll(() => state.facilityTypeSwapRequests)
      .toEqual([
        { p_first: "ramp", p_second: "parking" },
        { p_first: "parking", p_second: "ramp" },
      ]);
  });

  test("저장 중에는 화살표를 모두 잠근다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let swapCalls = 0;
    await page.route(
      (url) => url.pathname.endsWith("/rest/v1/rpc/swap_facility_type_order"),
      async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        swapCalls += 1;
        await held;
        await route.fallback();
      },
    );
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);

    await moveButton(dialog, "장애인 주차", "위로").click();
    // 저장이 끝나기 전에 화면이 먼저 바뀐다
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
    for (const [label, direction] of [
      ["엘리베이터", "아래로"],
      ["장애인 주차", "위로"],
      ["장애인 주차", "아래로"],
      ["경사로", "위로"],
    ] as const)
      await expect(moveButton(dialog, label, direction)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    await moveButton(dialog, "엘리베이터", "아래로").click({ force: true });

    release();
    await expect(
      moveButton(dialog, "엘리베이터", "아래로"),
    ).not.toHaveAttribute("aria-disabled", "true");
    expect(swapCalls).toBe(1);
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
  });

  test("순서를 바꾼 뒤 목록을 다시 받지 못하면 알리고 다시 받을 때까지 고치지 못하게 한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    let failTypeReads = false;
    await page.route(
      (url) => url.pathname.endsWith("/rest/v1/facility_types"),
      (route) =>
        failTypeReads && route.request().method() === "GET"
          ? serverError(route)
          : route.fallback(),
    );
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    failTypeReads = true;

    await moveButton(dialog, "장애인 주차", "위로").click();
    const alert = dialog
      .getByRole("alert")
      .filter({ hasText: "종류 목록을 새로 불러오지 못했어요" });
    await expect(alert).toBeVisible();
    expect(typeByCode(state, "parking").sort_order).toBe(2);
    await expect(
      dialog.getByRole("button", { name: "＋ 종류 추가" }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "경사로 수정" }),
    ).toBeDisabled();
    await expect(moveButton(dialog, "경사로", "위로")).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    failTypeReads = false;
    await alert.getByRole("button", { name: "다시 시도" }).click();
    await expect(alert).toBeHidden();
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
    await expect(
      dialog.getByRole("button", { name: "＋ 종류 추가" }),
    ).toBeEnabled();
  });

  test("다른 관리자가 그사이 순서를 바꿨으면 다시 불러오고 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await expectLabels(dialog, ["엘리베이터", "경사로", "장애인 주차"]);
    // 다른 관리자가 엘리베이터와 경사로를 바꿨다. 이 화면은 아직 모른다
    typeByCode(state, "elevator").sort_order = 2;
    typeByCode(state, "ramp").sort_order = 1;

    // (경사로, 장애인 주차) — 지금 둘 사이에 엘리베이터가 있다
    await moveButton(dialog, "장애인 주차", "위로").click();

    await expect(
      toast(page, "status", "순서가 바뀌어 다시 불러왔어요"),
    ).toBeVisible();
    await expectLabels(dialog, ["경사로", "엘리베이터", "장애인 주차"]);
    expect(state.activityReports).toHaveLength(0);
  });

  for (const failure of [
    { status: 403, code: "42501", reason: "forbidden" },
    { status: 500, code: "XX000", reason: "server_error" },
  ]) {
    test(`그 밖의 실패(${failure.code})는 순서를 되돌리고 오류로 알리며 실패를 보고한다`, async ({
      page,
    }) => {
      const state = await installMockBackend(page, { authenticated: true });
      await page.route(
        (url) => url.pathname.endsWith("/rest/v1/rpc/swap_facility_type_order"),
        (route) =>
          route.request().method() !== "POST"
            ? route.fallback()
            : route.fulfill({
                status: failure.status,
                headers: { "access-control-allow-origin": "*" },
                contentType: "application/json",
                body: JSON.stringify({
                  code: failure.code,
                  message: "swap failed",
                  details: null,
                  hint: null,
                }),
              }),
      );
      await page.goto(FACILITIES_PATH);
      const dialog = await openTypesModal(page);

      await moveButton(dialog, "장애인 주차", "위로").click();

      await expect(
        toast(page, "alert", "종류 순서를 바꾸지 못했어요"),
      ).toBeVisible();
      await expectLabels(dialog, ["엘리베이터", "경사로", "장애인 주차"]);
      await expect.poll(() => state.activityReports.length).toBe(1);
      expect(state.activityReports[0]).toMatchObject({
        action: "facility_types.update",
        reason_code: failure.reason,
        target_table: "facility_types",
        target_id: "parking",
      });
    });
  }
});

test("모바일 폭에서 종류 관리 조작이 44px 터치 영역을 갖고 모달 안에 든다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(FACILITIES_PATH);
  await listPanel(page).getByRole("button", { name: "목록 펼치기" }).click();
  const open = listPanel(page).getByRole("button", { name: "종류 관리" });
  await expectTouchTarget(open);
  await open.click();
  const dialog = page.getByRole("dialog", { name: "시설 종류 관리" });
  await expect(typeRow(dialog, "경사로")).toContainText(
    "시설 2곳이 이 종류를 써요",
  );
  const frame = (await dialog.boundingBox())!;

  const row = typeRow(dialog, "경사로");
  for (const control of [
    moveButton(dialog, "경사로", "위로"),
    moveButton(dialog, "경사로", "아래로"),
    row.getByRole("button", { name: "경사로 수정" }),
    row.getByRole("button", { name: "경사로 삭제" }),
    dialog.getByRole("button", { name: "＋ 종류 추가" }),
    dialog.getByRole("button", { name: "닫기" }),
  ])
    await expectTouchTarget(control, frame);

  await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();
  for (const control of [
    dialog.getByTitle("휠체어", { exact: true }),
    dialog.getByTitle("회색", { exact: true }),
    dialog.getByRole("button", { name: "자동번역 채우기" }),
    dialog.getByRole("button", { name: "뒤로" }),
    dialog.getByRole("button", { name: "저장" }),
  ])
    await expectTouchTarget(control, frame);
});
```

- [ ] **Step A2: 다크 모드 검사** — `e2e/admin-dark.spec.ts`의 `"범례 편집 모달에 하드코딩 밝은 색이 남지 않는다"` 테스트 바로 뒤

```ts
test("시설 종류 관리 모달에 하드코딩 밝은 색이 남지 않는다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/facilities");
  await page
    .getByRole("region", { name: "독립 시설", exact: true })
    .getByRole("button", { name: "종류 관리" })
    .click();
  const dialog = page.getByRole("dialog", { name: "시설 종류 관리" });
  await expect(
    dialog.getByText("시설 2곳이 이 종류를 써요").first(),
  ).toBeVisible();

  for (const view of ["목록", "폼"] as const) {
    if (view === "폼")
      await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();
    const result = await scanContrast(page);
    expect(
      result.nearWhiteBg,
      `${view} 미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
    ).toHaveLength(0);
    expect(
      result.nearBlackText,
      `${view} 미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
    ).toHaveLength(0);
  }
});
```

- [ ] **Step A3: 커밋하고 푸시 A**

```bash
npx --yes prettier@3.9.4 --write e2e/facility-type-management.spec.ts e2e/admin-dark.spec.ts
rg -n "\x{FFFD}" e2e/facility-type-management.spec.ts e2e/admin-dark.spec.ts
git add e2e/facility-type-management.spec.ts e2e/admin-dark.spec.ts
git commit -m "test(e2e): 시설 종류 관리 모달의 추가·수정·삭제·순서와 모바일·다크 모드를 시험한다"
git push -u origin feat/facility-type-management
gh pr create --draft --base main --title "feat: 관리자 시설 종류 관리 화면(멘토링 ②-2b)" --body-file <초안 본문 파일>
gh pr checks --watch
```

초안 본문 파일(스크래치패드)은 두 줄이다: "테스트를 먼저 올린 초안이다. 구현과 본문은 다음 푸시에서 채운다." 와 설계·계획 경로. 끝에
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Expected: "푸시와 CI" 표의 A 줄. 기존 Playwright 테스트가 하나라도 깨지면 목 변경(Task 6)이 원인이다 — B로 넘어가기 전에 고친다.

---

### Task 8: 관리 화면

**Files:**

- Create(B): `src/components/admin/facilities/FacilityTypesModal.tsx`, `src/components/admin/facilities/FacilityTypeForm.tsx`
- Modify(B): `src/app/admin/dashboard/facilities/page.tsx`, `src/components/admin/workspace/WorkspaceListPanel.tsx`(주석),
  `src/app/admin/admin-ui.css`

**Interfaces:**

- Consumes: Task 4 `reloadFacilityTypes(): Promise<boolean>`, `useFacilityTypes()`; Task 5의 함수 전부; `FACILITY_ICON`
  (`@/components/map/iconography`); `FACILITY_ICON_CHOICES`·`FACILITY_COLOR_CHOICES`·`facilityStyleOf`(`@/lib/facilityStyleCatalog`);
  `focusDirectionAfterMove`·`swapFailureAction`·`PhotoMoveDirection`(`@/lib/buildingPhotoOrder`); `reportFailure`(`@/lib/activityReport`);
  `ConfirmModal`; `useModalFocus`.
- Produces: `FacilityTypesModal({ onClose(changed: boolean), showToast })`,
  `FacilityTypeForm({ editing, types, saving, locked, onBack, onSubmit(payload), showToast })`.

- [ ] **Step B1: 폼** — `src/components/admin/facilities/FacilityTypeForm.tsx`

```tsx
"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FACILITY_ICON } from "@/components/map/iconography";
import {
  FACILITY_COLOR_CHOICES,
  FACILITY_ICON_CHOICES,
} from "@/lib/facilityStyleCatalog";
import {
  TYPE_LABEL_MAX,
  TYPE_TRANSLATION_MAX,
  fillEmptyTranslations,
  translateTypeLabel,
  typeFormError,
  typeFormFrom,
  typePayload,
  type FacilityTypeFormValues,
  type FacilityTypePayload,
} from "@/lib/facilityTypeAdmin";
import type { FacilityType } from "@/types/domain";

interface FacilityTypeFormProps {
  editing: FacilityType | null;
  types: readonly FacilityType[];
  saving: boolean;
  /** 종류 목록 받기가 실패해 낡은 목록으로 이름 겹침을 검사하게 될 때 저장을 막는다(설계 3.2) */
  locked: boolean;
  onBack: () => void;
  onSubmit: (payload: FacilityTypePayload) => void;
  showToast: (message: string, type?: string) => void;
}

/** 설계: docs/specs/2026-10-26-facility-type-management-design.md 3.3 */
export default function FacilityTypeForm({
  editing,
  types,
  saving,
  locked,
  onBack,
  onSubmit,
  showToast,
}: FacilityTypeFormProps) {
  const [form, setForm] = useState<FacilityTypeFormValues>(() =>
    typeFormFrom(editing),
  );
  const [error, setError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const id = useId();
  const labelRef = useRef<HTMLInputElement>(null);
  const PreviewIcon = FACILITY_ICON[form.icon];
  const iconName = FACILITY_ICON_CHOICES.find(
    (choice) => choice.key === form.icon,
  )?.label;
  const colorName =
    FACILITY_COLOR_CHOICES.find((choice) => choice.hex === form.color)?.label ??
    form.color;

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  function update(change: Partial<FacilityTypeFormValues>) {
    setForm((current) => ({ ...current, ...change }));
  }

  async function handleTranslate() {
    const label = form.label.trim();
    if (!label) return;
    setTranslating(true);
    const translated = await translateTypeLabel(label);
    setTranslating(false);
    if (!translated) {
      showToast(
        "자동번역에 실패했어요. 영어·중국어 이름을 직접 적어 주세요",
        "warning",
      );
      return;
    }
    setForm((current) => fillEmptyTranslations(current, translated));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || locked) return;
    const problem = typeFormError(form, types, editing?.code ?? null);
    setError(problem);
    if (problem) return;
    onSubmit(typePayload(form));
  }

  return (
    <form className="ku-types-form" onSubmit={handleSubmit} noValidate>
      <h3>
        {editing ? `종류 수정 — ${editing.label ?? editing.code}` : "종류 추가"}
      </h3>
      <div className="ku-types-form-names">
        <label htmlFor={`${id}-label`}>한국어 이름(필수)</label>
        <input
          id={`${id}-label`}
          ref={labelRef}
          type="text"
          value={form.label}
          maxLength={TYPE_LABEL_MAX}
          // 번역을 기다리는 사이 이름을 바꾸면 옛 이름의 번역이 빈 칸에 들어간다
          readOnly={translating}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => update({ label: event.target.value })}
        />
        <label htmlFor={`${id}-en`}>영어 이름</label>
        <input
          id={`${id}-en`}
          type="text"
          value={form.label_en}
          maxLength={TYPE_TRANSLATION_MAX}
          onChange={(event) => update({ label_en: event.target.value })}
        />
        <label htmlFor={`${id}-zh`}>중국어 이름</label>
        <input
          id={`${id}-zh`}
          type="text"
          value={form.label_zh}
          maxLength={TYPE_TRANSLATION_MAX}
          onChange={(event) => update({ label_zh: event.target.value })}
        />
        <div className="ku-types-form-translate">
          <button
            type="button"
            className="ku-workspace-button"
            disabled={translating || saving || !form.label.trim()}
            onClick={() => void handleTranslate()}
          >
            {translating ? "번역 중..." : "자동번역 채우기"}
          </button>
          <span>비어 있는 칸만 채워요. 비워 두면 한국어 이름이 보여요.</span>
        </div>
      </div>

      <fieldset>
        <legend>아이콘</legend>
        <div className="ku-types-form-icon-grid">
          {FACILITY_ICON_CHOICES.map((choice) => {
            const Icon = FACILITY_ICON[choice.key];
            return (
              <label
                key={choice.key}
                className="ku-types-form-icon"
                title={choice.label}
              >
                <input
                  type="radio"
                  name={`${id}-icon`}
                  className="ku-sr-only"
                  checked={form.icon === choice.key}
                  onChange={() => update({ icon: choice.key })}
                />
                <Icon size={20} aria-hidden="true" />
                <span className="ku-sr-only">{choice.label}</span>
              </label>
            );
          })}
        </div>
        <p className="ku-types-form-picked">고른 아이콘: {iconName}</p>
      </fieldset>

      <fieldset>
        <legend>색</legend>
        <div className="ku-types-form-colors">
          {FACILITY_COLOR_CHOICES.map((choice) => (
            <label
              key={choice.hex}
              className="ku-types-form-color"
              title={choice.label}
            >
              <input
                type="radio"
                name={`${id}-color`}
                className="ku-sr-only"
                checked={form.color === choice.hex}
                onChange={() => update({ color: choice.hex })}
              />
              <span aria-hidden="true" style={{ background: choice.hex }} />
              <span className="ku-sr-only">{choice.label}</span>
            </label>
          ))}
        </div>
        <p className="ku-types-form-picked">고른 색: {colorName}</p>
      </fieldset>

      <div className="ku-types-form-preview" role="group" aria-label="미리보기">
        <span
          className="ku-types-form-preview-marker"
          style={{ background: form.color }}
        >
          <span>
            <PreviewIcon size={17} aria-hidden="true" />
          </span>
        </span>
        <span
          className="ku-types-form-preview-chip"
          style={{ background: form.color, borderColor: form.color }}
        >
          <PreviewIcon size={15} aria-hidden="true" />
          {form.label.trim() || "이름"}
        </span>
      </div>

      {error && (
        <p id={`${id}-error`} className="ku-types-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="ku-types-form-actions">
        <button
          type="button"
          className="ku-workspace-button"
          disabled={saving}
          onClick={onBack}
        >
          뒤로
        </button>
        <button
          type="submit"
          className="ku-workspace-primary"
          disabled={saving || locked}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}
```

`.ku-types-form-color`의 첫 `<span aria-hidden>`이 견본이다(CSS `span[aria-hidden]`).

- [ ] **Step B2: 모달** — `src/components/admin/facilities/FacilityTypesModal.tsx`

```tsx
"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import FacilityTypeForm from "@/components/admin/facilities/FacilityTypeForm";
import { FACILITY_ICON } from "@/components/map/iconography";
import { reportFailure } from "@/lib/activityReport";
import { authedFetch } from "@/lib/authedFetch";
import {
  focusDirectionAfterMove,
  swapFailureAction,
  type PhotoMoveDirection,
} from "@/lib/buildingPhotoOrder";
import { facilityStyleOf } from "@/lib/facilityStyleCatalog";
import {
  TYPE_WRITE_MISSED,
  deleteBlockReason,
  deleteFacilityType,
  fetchFacilityTypeUsage,
  insertFacilityType,
  typeSwapArgs,
  updateFacilityType,
  withPendingSwap,
  type FacilityTypePayload,
  type FacilityTypeUsage,
} from "@/lib/facilityTypeAdmin";
import {
  reloadFacilityTypes,
  useFacilityTypes,
} from "@/lib/facilityTypesStore";
import { supabase } from "@/lib/supabaseClient";
import { useModalFocus } from "@/lib/useModalFocus";
import type { FacilityType } from "@/types/domain";

const MOVE_DIRECTIONS = ["earlier", "later"] as const;
const moveLabel: Record<PhotoMoveDirection, string> = {
  earlier: "위로",
  later: "아래로",
};
const MoveIcon: Record<PhotoMoveDirection, typeof ChevronUp> = {
  earlier: ChevronUp,
  later: ChevronDown,
};

type UsageState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; usage: FacilityTypeUsage };
type View = { mode: "list" } | { mode: "form"; editing: FacilityType | null };

function orderButtonKey(code: string, direction: PhotoMoveDirection) {
  return `${code}:${direction}`;
}

// 공개 /api/facilities는 시설에 붙인 종류 이름을 캐시한다(설계 3.3)
async function revalidatePublicFacilities() {
  await authedFetch("/api/revalidate-facilities", { method: "POST" }).catch(
    () => {},
  );
}

interface FacilityTypesModalProps {
  /** changed: 종류를 고치거나 지웠다 — 시설 탭이 시설에 붙은 종류 이름을 다시 읽는다(설계 3.3) */
  onClose: (changed: boolean) => void;
  showToast: (message: string, type?: string) => void;
}

/** 설계: docs/specs/2026-10-26-facility-type-management-design.md 3장 */
export default function FacilityTypesModal({
  onClose,
  showToast,
}: FacilityTypesModalProps) {
  const { types, status } = useFacilityTypes();
  const [view, setView] = useState<View>({ mode: "list" });
  const [usage, setUsage] = useState<UsageState>({ status: "loading" });
  const [pendingSwap, setPendingSwap] = useState<{
    p_first: string;
    p_second: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FacilityType | null>(null);
  const [saving, setSaving] = useState(false);
  const changedRef = useRef(false);
  const orderButtons = useRef(new Map<string, HTMLButtonElement>());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const baseId = useId();
  const close = () => onClose(changedRef.current);
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose: close,
    initialFocusRef: titleRef,
    // 저장 중에 닫히면 고친 이름을 시설 탭이 다시 읽지 못한다
    closeOnEscape: !saving,
  });
  // 저장 중인 맞바꾸기를 받은 목록 위에 겹쳐 그린다. 다시 받기가 끝난 뒤 걷는다 — 먼저 걷으면 옛 순서로 잠깐 돌아간다
  const shown = withPendingSwap(types, pendingSwap);
  const editing = view.mode === "form" ? view.editing : null;
  // 받기에 실패한 목록은 낡았을 수 있다. 그것으로 이름 겹침을 검사하거나 순서를 판정하지 않는다(설계 3.2)
  const writable = status !== "error";

  const refreshUsage = useCallback(async () => {
    const result = await fetchFacilityTypeUsage();
    setUsage(result ? { status: "ready", usage: result } : { status: "error" });
  }, []);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  function retryUsage() {
    setUsage({ status: "loading" });
    void refreshUsage();
  }

  function showList() {
    flushSync(() => setView({ mode: "list" }));
    titleRef.current?.focus();
  }

  function orderButtonRef(code: string, direction: PhotoMoveDirection) {
    const key = orderButtonKey(code, direction);
    return (element: HTMLButtonElement | null) => {
      if (element) orderButtons.current.set(key, element);
      else orderButtons.current.delete(key);
    };
  }

  async function handleMove(index: number, direction: PhotoMoveDirection) {
    if (pendingSwap || !writable) return;
    const args = typeSwapArgs(shown, index, direction);
    if (!args) return;
    const movedCode = shown[index].code;
    const movedTo = direction === "earlier" ? index - 1 : index + 1;
    // 자리를 바꾸면 버튼이 DOM에서 빠졌다 들어오거나 끝 화살표가 꺼져 초점이 사라진다. 그린 뒤 옮긴 종류의 화살표로 돌려준다
    flushSync(() => setPendingSwap(args));
    orderButtons.current
      .get(
        orderButtonKey(
          movedCode,
          focusDirectionAfterMove(movedTo, shown.length, direction),
        ),
      )
      ?.focus();

    const { error, status: httpStatus } = await supabase.rpc(
      "swap_facility_type_order",
      args,
    );
    if (!error) {
      await reloadFacilityTypes();
    } else {
      const action = swapFailureAction(error.code);
      // 다시 받기마저 실패하면 저장소에 누르기 전 목록이 남아, 겹친 맞바꾸기를 걷으면 그 순서로 돌아간다
      if (action === "reload" && (await reloadFacilityTypes())) {
        showToast("순서가 바뀌어 다시 불러왔어요", "warning");
      } else {
        showToast("종류 순서를 바꾸지 못했어요", "error");
      }
      if (action === "revert") {
        // 브라우저 쓰기 실패를 보고하는 관문(reportingFetch)이 rpc/를 건너뛴다
        void reportFailure({
          source: {
            kind: "postgrest",
            status: httpStatus,
            error: { code: error.code, message: error.message },
          },
          action: "facility_types.update",
          target: { table: "facility_types", id: movedCode },
        });
      }
    }
    setPendingSwap(null);
  }

  // 그사이 다른 관리자가 지웠거나 권한이 사라졌다 — 목록과 현황을 서버에 맞춘다(설계 3.3)
  async function handleMissed() {
    await Promise.all([reloadFacilityTypes(), refreshUsage()]);
    showToast("그사이 지워졌거나 권한이 없어 바꾸지 못했어요", "error");
  }

  async function handleSave(
    target: FacilityType | null,
    payload: FacilityTypePayload,
  ) {
    setSaving(true);
    const result = target
      ? await updateFacilityType(target.code, payload)
      : await insertFacilityType(payload);
    if (!result.ok) {
      const missed = result.code === TYPE_WRITE_MISSED;
      if (missed) await handleMissed();
      else showToast("종류를 저장하지 못했어요", "error");
      setSaving(false);
      if (missed) showList();
      return;
    }
    if (target) {
      changedRef.current = true;
      await revalidatePublicFacilities();
    }
    await Promise.all([reloadFacilityTypes(), refreshUsage()]);
    setSaving(false);
    showList();
    showToast(target ? "종류를 고쳤어요" : "종류를 추가했어요");
  }

  async function handleDelete(type: FacilityType) {
    const result = await deleteFacilityType(type.code);
    if (!result.ok) {
      setConfirmDelete(null);
      if (result.code === "23503") {
        // 센 뒤 지우기 전 사이에 누가 이 종류로 시설을 붙였다(설계 3.4)
        await refreshUsage();
        showToast(
          "그사이 이 종류를 쓰는 시설이 생겨 지우지 못했어요",
          "warning",
        );
      } else if (result.code === TYPE_WRITE_MISSED) {
        await handleMissed();
      } else {
        showToast("종류를 삭제하지 못했어요", "error");
      }
      return;
    }
    changedRef.current = true;
    await revalidatePublicFacilities();
    await Promise.all([reloadFacilityTypes(), refreshUsage()]);
    // 목록을 다시 받은 뒤 닫는다. 먼저 닫으면 초점이 곧 사라질 삭제 버튼으로 돌아간다
    setConfirmDelete(null);
    showToast("종류를 삭제했어요");
  }

  return (
    <>
      <div
        className="ku-types-modal-backdrop"
        role="presentation"
        // click으로 받으면 안에서 끌다 밖에서 놓아도 닫힌다
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) close();
        }}
      >
        <div
          ref={dialogRef}
          className="ku-types-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${baseId}-title`}
        >
          <h2 id={`${baseId}-title`} ref={titleRef} tabIndex={-1}>
            시설 종류 관리
          </h2>
          {status === "error" && (
            <div className="ku-types-modal-alert" role="alert">
              <span>종류 목록을 새로 불러오지 못했어요</span>
              <button
                type="button"
                className="ku-workspace-button"
                onClick={() => void reloadFacilityTypes()}
              >
                다시 시도
              </button>
            </div>
          )}
          {view.mode === "form" ? (
            <FacilityTypeForm
              key={editing?.code ?? "new"}
              editing={editing}
              types={types}
              saving={saving}
              locked={!writable}
              onBack={showList}
              onSubmit={(payload) => void handleSave(editing, payload)}
              showToast={showToast}
            />
          ) : (
            <>
              {usage.status === "error" && (
                <div className="ku-types-modal-alert" role="alert">
                  <span>사용 현황을 불러오지 못했어요</span>
                  <button
                    type="button"
                    className="ku-workspace-button"
                    onClick={retryUsage}
                  >
                    다시 시도
                  </button>
                </div>
              )}
              <div className="ku-types-modal-toolbar">
                <button
                  type="button"
                  className="ku-workspace-primary"
                  disabled={!writable}
                  onClick={() => setView({ mode: "form", editing: null })}
                >
                  ＋ 종류 추가
                </button>
              </div>
              <ul className="ku-types-modal-list">
                {shown.map((type, index) => {
                  const label = type.label ?? type.code;
                  const style = facilityStyleOf(types, type.code);
                  const Icon = FACILITY_ICON[style.icon];
                  const reason =
                    usage.status === "ready"
                      ? deleteBlockReason(usage.usage, type.code)
                      : null;
                  const usageText =
                    usage.status === "loading"
                      ? "사용 현황 확인 중"
                      : usage.status === "error"
                        ? "사용 현황 모름"
                        : (reason ?? "쓰는 시설 없음");
                  const usageId = `${baseId}-usage-${type.code}`;
                  return (
                    <li key={type.code} className="ku-types-modal-row">
                      <span
                        className="ku-types-modal-swatch"
                        style={{ background: style.color }}
                      >
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="ku-types-modal-names">
                        <span className="ku-types-modal-label">{label}</span>
                        <span className="ku-types-modal-translations">
                          {type.label_en ?? "영어 이름 없음"} ·{" "}
                          {type.label_zh ?? "중국어 이름 없음"}
                        </span>
                        <span id={usageId} className="ku-types-modal-usage">
                          {usageText}
                        </span>
                      </span>
                      <span className="ku-types-modal-controls">
                        {MOVE_DIRECTIONS.map((direction) => {
                          const Arrow = MoveIcon[direction];
                          return (
                            <button
                              key={direction}
                              type="button"
                              ref={orderButtonRef(type.code, direction)}
                              className="ku-photo-order-button"
                              disabled={
                                typeSwapArgs(shown, index, direction) === null
                              }
                              // 잠금을 disabled로 걸면 누른 버튼이 키보드 초점을 잃는다
                              aria-disabled={
                                pendingSwap !== null || !writable || undefined
                              }
                              aria-label={`${label} ${moveLabel[direction]} 옮기기`}
                              onClick={() => void handleMove(index, direction)}
                            >
                              <Arrow size={16} aria-hidden="true" />
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          className="ku-workspace-button"
                          aria-label={`${label} 수정`}
                          disabled={!writable}
                          onClick={() =>
                            setView({ mode: "form", editing: type })
                          }
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="ku-workspace-button"
                          aria-label={`${label} 삭제`}
                          aria-describedby={usageId}
                          disabled={
                            !writable ||
                            usage.status !== "ready" ||
                            reason !== null
                          }
                          onClick={() => setConfirmDelete(type)}
                        >
                          삭제
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="ku-types-modal-actions">
                <button
                  type="button"
                  className="ku-workspace-button"
                  onClick={close}
                >
                  닫기
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {confirmDelete && (
        <ConfirmModal
          message="종류를 삭제할까요?"
          description={`${confirmDelete.label ?? confirmDelete.code} 종류를 지워요. 되돌릴 수 없어요.`}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step B3: 시설 탭에 버튼과 모달** — `src/app/admin/dashboard/facilities/page.tsx`

import 블록에 더한다(`FacilityListRow` import 다음):

```tsx
import FacilityTypesModal from "@/components/admin/facilities/FacilityTypesModal";
```

`const [toast, setToast] = …` 앞에 더한다:

```tsx
const [typesModalOpen, setTypesModalOpen] = useState(false);
```

`const [typeFilter, setTypeFilter] = useState("all");` 바로 뒤에 더한다:

```tsx
// 지운 종류를 고르고 있었으면 빈 목록이 남지 않게 모든 유형으로 본다(설계 3.4)
const activeTypeFilter =
  typeFilter !== "all" &&
  facilityTypesSnapshot.loaded &&
  !facilityTypes.some((type) => type.code === typeFilter)
    ? "all"
    : typeFilter;
```

`useAdminCollection(…)`의 세 번째 인자와 유형 `<select>`의 `value`에서 `typeFilter`를 `activeTypeFilter`로 바꾼다
(`setTypeFilter(next)`는 그대로).

`<WorkspaceListPanel …>`의 `legend={…}` prop 뒤에 더한다:

```tsx
            legendAction={
              <button
                type="button"
                className="ku-workspace-button"
                // 받기 전에 열면 빈 목록과 비교해 이미 있는 이름을 막지 못한다
                disabled={!facilityTypesSnapshot.loaded}
                onClick={() => setTypesModalOpen(true)}
              >
                종류 관리
              </button>
            }
```

`{toast && (` 앞에 더한다:

```tsx
{
  typesModalOpen && (
    <FacilityTypesModal
      onClose={(changed) => {
        setTypesModalOpen(false);
        if (changed) void loadFacilities();
      }}
      showToast={showToast}
    />
  );
}
```

- [ ] **Step B4: 목록 패널 주석** — `src/components/admin/workspace/WorkspaceListPanel.tsx`

`/** 범례 옆(모바일은 바텀시트 맨 아래)에 두는 동작. 경사도 탭만 넘긴다 */`를 바꾼다:

```tsx
/** 범례 옆(모바일은 펼친 바텀시트 맨 아래)에 두는 동작. 경사도 탭의 "범례 편집", 독립 시설 탭의 "종류 관리" */
```

- [ ] **Step B5: CSS** — `src/app/admin/admin-ui.css`의 `/* 로그 탭. 설계: docs/specs/2026-10-19-activity-log-design.md 5장 */` 바로 앞

```css
/* 시설 종류 관리 모달. 설계: docs/specs/2026-10-26-facility-type-management-design.md 3장 */
.ku-types-modal h2:focus {
  outline: none;
}
.ku-types-modal-backdrop {
  position: fixed;
  z-index: 2000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ku-backdrop);
}
.ku-types-modal {
  box-sizing: border-box;
  width: 90%;
  max-width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 20px;
  border: 1px solid var(--ku-border);
  border-radius: var(--ku-radius);
  color: var(--ku-text-1);
  background: var(--ku-surface);
  box-shadow: var(--ku-shadow-overlay);
}
.ku-types-modal h2 {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 700;
}
.ku-types-modal-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--ku-danger);
  font-size: 12.5px;
}
.ku-types-modal-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.ku-types-modal-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.ku-types-modal-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--ku-divider);
}
.ku-types-modal-swatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #fff;
}
.ku-types-modal-names {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.ku-types-modal-label {
  font-size: 14px;
  font-weight: 600;
}
.ku-types-modal-translations {
  overflow: hidden;
  color: var(--ku-text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ku-types-modal-usage {
  color: var(--ku-text-2);
  font-size: 12px;
}
.ku-types-modal-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ku-types-modal-actions,
.ku-types-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.ku-types-form h3 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 700;
}
.ku-types-form-names {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px 10px;
}
.ku-types-form-names label,
.ku-types-form legend {
  color: var(--ku-text-2);
  font-size: 12.5px;
  font-weight: 600;
}
.ku-types-form input[type="text"] {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--ku-border-input);
  border-radius: var(--ku-radius);
  color: var(--ku-text-1);
  background: var(--ku-surface);
  font-size: 13px;
}
.ku-types-form-translate {
  display: flex;
  flex-wrap: wrap;
  grid-column: 2;
  align-items: center;
  gap: 8px;
  color: var(--ku-text-3);
  font-size: 12px;
}
.ku-types-form fieldset {
  margin: 14px 0 0;
  padding: 0;
  border: 0;
}
.ku-types-form legend {
  margin-bottom: 6px;
  padding: 0;
}
.ku-types-form-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  gap: 6px;
}
.ku-types-form-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  border: 1px solid var(--ku-border-input);
  border-radius: var(--ku-radius);
  color: var(--ku-text-1);
  background: var(--ku-surface);
  cursor: pointer;
}
.ku-types-form-icon:has(input:checked) {
  border-color: var(--ku-primary);
  box-shadow: inset 0 0 0 1px var(--ku-primary);
  color: var(--ku-primary-text);
}
.ku-types-form-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ku-types-form-color {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}
.ku-types-form-color:has(input:checked) {
  border-color: var(--ku-text-1);
}
.ku-types-form-color span[aria-hidden] {
  width: 26px;
  height: 26px;
  border-radius: 50%;
}
/* 고르는 칸은 화면에 보이지 않는 radio라 Tab 초점이 오면 둘러싼 칸에 고리를 건다 */
.ku-types-form-icon:has(input:focus-visible),
.ku-types-form-color:has(input:focus-visible) {
  outline: 2px solid var(--ku-primary-text);
  outline-offset: 2px;
}
.ku-types-form-picked {
  margin: 6px 0 0;
  color: var(--ku-text-3);
  font-size: 12px;
}
.ku-types-form-preview {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--ku-divider);
  border-radius: var(--ku-radius);
  background: var(--ku-bg);
}
/* 공개 지도 마커(FacilityMarkers.tsx의 facilityMarkerIcon)와 켜진 필터 칩(map-ui.css의 .ku-chip[data-active])을 본뜬다 */
.ku-types-form-preview-marker {
  display: inline-flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 2px solid #fff;
  border-radius: 50% 50% 50% 4px;
  color: #fff;
  box-shadow: 0 2px 7px rgba(28, 25, 23, 0.28);
  transform: rotate(-45deg);
}
.ku-types-form-preview-marker > span {
  display: flex;
  transform: rotate(45deg);
}
.ku-types-form-preview-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 12px;
  border: 1.5px solid;
  border-radius: var(--ku-radius);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.ku-types-form-error {
  margin: 12px 0 0;
  color: var(--ku-danger);
  font-size: 12.5px;
}
@media (max-width: 767px) {
  .ku-types-modal {
    width: calc(100% - 24px);
    padding: 16px;
  }
  .ku-types-modal-row {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .ku-types-modal-controls {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
  .ku-types-modal .ku-workspace-button,
  .ku-types-modal .ku-workspace-primary {
    min-width: 44px;
    min-height: 44px;
  }
  .ku-types-form-names {
    grid-template-columns: minmax(0, 1fr);
  }
  .ku-types-form-translate {
    grid-column: auto;
  }
  .ku-types-form input[type="text"] {
    height: 44px;
  }
  .ku-types-form-icon-grid {
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  }
  .ku-types-form-icon {
    height: 44px;
  }
  .ku-types-form-color {
    width: 44px;
    height: 44px;
  }
}
```

(▲▼는 `.ku-photo-order-button`의 기존 모바일 규칙으로 44px이 된다.)

- [ ] **Step B6: 커밋**

```bash
npx --yes prettier@3.9.4 --write src/components/admin/facilities/FacilityTypesModal.tsx src/components/admin/facilities/FacilityTypeForm.tsx src/app/admin/dashboard/facilities/page.tsx src/components/admin/workspace/WorkspaceListPanel.tsx src/app/admin/admin-ui.css
rg -n "\x{FFFD}" src/components/admin/facilities/FacilityTypesModal.tsx src/components/admin/facilities/FacilityTypeForm.tsx src/app/admin/dashboard/facilities/page.tsx src/components/admin/workspace/WorkspaceListPanel.tsx src/app/admin/admin-ui.css
git add src/components/admin/facilities/FacilityTypesModal.tsx src/components/admin/facilities/FacilityTypeForm.tsx src/app/admin/dashboard/facilities/page.tsx src/components/admin/workspace/WorkspaceListPanel.tsx src/app/admin/admin-ui.css
git commit -m "feat: 독립 시설 탭에서 시설 종류를 추가·수정·삭제하고 순서를 바꾸는 모달을 둔다"
```

---

### Task 9: 참조 역추적·푸시 B·병합 뒤

**Files:**

- Modify: 역추적이 찾은 문서·주석(아래 Step 1의 결과에 따라)

- [ ] **Step 1: 참조 역추적** — 바꾼 이름·경로·주장을 찾는다

```bash
rg -n "경사도 탭만|시설 추가\" 옆|시설 추가 옆|정적 테이블\(facility_types|고정 목록으로 돌려줘|return types;" docs/ src/ e2e/ supabase/
rg -n "reloadFacilityTypes|invalidateFacilityTypes" docs/ src/ e2e/
rg -n "id=eq\." docs/specs/ src/lib/
rg -n "swap_facility_type_order|facility-types/usage|종류 관리" docs/ src/ e2e/ supabase/
```

각 결과가 (a) 이 PR에서 고쳤거나 (b) 날짜가 붙은 기록으로 그 날짜에 맞거나 (c) 무관한지 나눠 PR 본문과 보고에 명령과 출력을 함께 적는다.
계획을 쓸 때(2026-10-26) `docs/specs/`의 `id=eq.` 언급은 설계 3.3 한 곳이었고, 고치기 전 상태와 고치는 이유를 적은 문장이라 그대로 둔다.
이슈·PR 본문은 `rg`가 닿지 않는다 — #59 본문의 "②-2b" 언급을 `gh pr view 59 --json body -q .body | rg -n "2b|관리 화면"`으로 보고 낡은
약속이 있으면 이 PR 본문에 적는다.

- [ ] **Step 2: 커밋하고 푸시 B**

```bash
git add <Step 1에서 고친 파일>
git commit -m "docs: <역추적이 고친 내용>"   # 고친 것이 있을 때만
git push
gh pr checks --watch
```

Expected: 전부 초록. 깨지면 `superpowers:systematic-debugging`으로 원인을 찾고 고친다. 계획과 다르게 고친 것은 이 문서에 적지 않고 PR 본문에
적는다.

- [ ] **Step 3: PR 본문** — 스크래치패드에 파일로 쓰고 `gh pr edit --body-file <파일>`, 그다음 `gh pr ready`

```markdown
## 요약

관리자가 독립 시설 탭의 "종류 관리"(목록 아래 범례 줄)에서 시설 종류를 추가·수정·삭제하고 ▲▼로 순서를 바꾼다. 멘토링 피드백 ②-2b.

- 설계: `docs/specs/2026-10-26-facility-type-management-design.md` 3·4.2장
- 계획: `docs/plans/2026-10-26-facility-type-management-ui.md`(병합 직전에 지운다)

## 바뀐 것

- DB: `swap_facility_type_order(text, text)`(advisory 잠금 → `for update` → 판정), `facility_types.sort_order` 유일 제약(deferrable),
  identity 시퀀스 맞춤. 마이그레이션 `20261026020000`.
- API: `GET /api/facility-types/usage` — 종류마다 쓰는 시설·검토 대기 요청 수(서비스 키, 개수만).
- 화면: 종류 관리 모달(목록·▲▼·삭제 막기)과 추가·수정 폼(자동번역·아이콘 30·색 10·미리보기).
- 실패 보고: `facility_types` 쓰기 실패의 대상 키를 `?code=eq.`에서 읽는다.
- `reloadFacilityTypes()`가 성공 여부로 풀린다.

## 시험

<CI 결과: pgTAP 파일·단언 수, vitest N/N, Playwright N/N — `gh run view --log`에서 센 값>

## 배포 순서

코드가 마이그레이션보다 먼저 뜨면 몇 분 동안 ▲▼가 함수를 찾지 못해 되돌리고 오류로 알린다(실패 보고 남음). 추가·수정·삭제는 그대로
된다. 상용 배포 전이라 받아들인다.

## 병합 뒤 확인

1. `Apply Supabase migrations`·`Verify migration history` 통과.
2. 방문자 키로 `rpc/swap_facility_type_order`를 부르면 401(`42501`), 종류 순서가 그대로.
3. 사용자: 운영에서 시험 종류 하나를 만들었다가 지운다 — 활동 기록에 "시설 종류 등록"·"시설 종류 삭제"가 남는지.

## 참조 역추적

<Step 1의 명령과 출력, 분류>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 4: 병합 직전 — 계획 문서를 지운다**

사용자가 병합을 정하면(또는 병합을 맡기면) 그 전에:

```bash
git rm docs/plans/2026-10-26-facility-type-management-ui.md
git commit -m "docs: 구현을 마친 시설 종류 PR ②-2b 계획 문서를 지운다"
git push
gh pr checks --watch
```

- [ ] **Step 5: 병합 뒤**

```bash
gh run list --branch main --limit 1
gh run view <run id> --json jobs -q '.jobs[] | "\(.name) \(.conclusion)"'
```

Expected: `Apply Supabase migrations success`, `Verify migration history success`. 방문자 키(`.env.local`의
`NEXT_PUBLIC_SUPABASE_ANON_KEY`)로 `POST <SUPABASE_URL>/rest/v1/rpc/swap_facility_type_order`(본문 `{"p_first":"ramp","p_second":"parking"}`)가
401이고, `GET <SUPABASE_URL>/rest/v1/facility_types?select=code,sort_order&order=sort_order`가 병합 전과 같은 순서인지 본다. 결과는 다음 PR
첫 커밋에서 멘토링 설계 "진행 상황"에 적는다. 원격 브랜치는 사용자 확인 뒤 지운다.
