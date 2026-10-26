# 멘토링 피드백 PR ①-2 구현 계획 — 건물 사진 순서의 화면

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans(권장 — 아래 "푸시와 CI"가 태스크를 걸쳐 묶인다) 또는
> superpowers:subagent-driven-development로 태스크 순서대로 실행한다. 단계는 체크박스(`- [ ]`)로 추적한다. 테스트를 먼저 커밋하고,
> 기대한 이유로 실패하는 것을 CI에서 본 뒤 구현을 커밋한다. 진행은 `git log`로 본다(따로 원장을 두지 않는다).

**Goal:** 공개 상세와 관리자 사진 칸이 `sort_order` 순서로 사진을 읽고, 관리자 사진 칸의 ◀ ▶로 이웃한 두 사진의 자리를 바꿔 바로
저장한다.

**Architecture:** 순서 계산(맞바꿀 쌍, 화면 맞바꾸기, 실패 분류, 옮긴 뒤 초점)은 `src/lib/buildingPhotoOrder.ts`의 순수 함수로 두고
vitest로 시험한다. `BuildingPhotoManager.tsx`는 그 함수로 화면을 먼저 바꾸고(낙관적), ①-1에서 운영에 들어간
`swap_building_photo_order` RPC를 브라우저 Supabase 클라이언트로 부른다. E2E 목 백엔드가 `sort_order` 정렬과 RPC 판정을 흉내 내고,
새 E2E 파일 하나가 화면 동작을 시험한다.

**Tech Stack:** Next 16.2.4 · React 19.2.4(React Compiler) · `@supabase/supabase-js` 2.x · `lucide-react` · vitest 3 · Playwright.

**Spec:** `docs/specs/2026-10-25-mentoring-feedback-design.md`(이하 "설계 N.N") 3.2·3.4, 맨 위 "진행 상황"의 ①-2 계약. 계획과 설계가
다르면 설계가 맞다 — 멈추고 보고한다.

## Global Constraints

- **DB·업로드 라우트는 바꾸지 않는다.** `supabase/` 아래 파일, `src/app/api/upload-building-photo/route.ts`,
  `src/app/api/delete-building-photo/route.ts`는 무변경. 새 사진 번호는 DB 트리거가 매긴다(설계 진행 상황 ①-2 계약 2).
- RPC는 `swap_building_photo_order(p_first integer, p_second integer)`, 인자는 **화면 순서(앞 사진, 뒤 사진)**. ◀는 (왼쪽 사진, 누른
  사진), ▶는 (누른 사진, 오른쪽 사진).
- 오류 처리(설계 3.4):

  | SQLSTATE | 뜻                                                | 화면                                                          |
  | -------- | ------------------------------------------------- | ------------------------------------------------------------- |
  | `PT409`  | 앞 사진이 뒤 사진 바로 앞이 아님(사이·뒤집힘)     | 목록 다시 불러오기 + "순서가 바뀌어 다시 불러왔어요"(warning) |
  | `P0002`  | 사진 없음(다른 관리자가 지움)                     | 같음                                                          |
  | 그 밖    | `42501` 권한 없음, `22023` 다른 건물, 네트워크 등 | 화면 순서 되돌림 + "사진 순서를 바꾸지 못했어요"(error)       |

- 정렬은 `.order("sort_order").order("id")`(PostgREST `order=sort_order.asc,id.asc`).
- **로컬에서 `npm ci`·vitest·tsc·eslint·Playwright를 돌리지 않는다.** 이 PC의 C 드라이브 여유가 약 1.5GB이고 korea-univ의
  `node_modules`가 비어 있다. 검증은 PR CI로 한다. 서식만 `npx --yes prettier@3.9.4 --write <바꾼 파일>`로 미리 맞춘다.
- `gh workflow run`을 쓰지 않는다. 수동 실행이면 CI가 운영 `supabase db push` 잡까지 돈다.
- 관리자 화면 색은 CSS 변수(`--ku-*`)만 쓴다. `e2e/admin-dark.spec.ts`가 건물 상세에서 하드코딩 흰 배경·검정 글자를 잡는다.
- 주석은 이유·외부 제약·위험만 적는다. 다른 파일의 줄 번호·개수·상수 값을 적지 않고 심볼 이름이나 설계 절로 가리킨다.
- 커밋 메시지는 한국어 `type(scope): 내용`. `Co-Authored-By`를 붙이지 않고, 작업 과정(리뷰·점검)을 적지 않는다.
- `core.autocrlf=true`. 파일은 UTF-8로 쓴다. 커밋 전에 `rg -n "\x{FFFD}" <바꾼 파일>`로 깨진 글자가 없는지 본다.
- 모든 명령은 저장소 루트(`C:\Users\servi\projects\korea-univ-project`)에서 실행한다. 브랜치는 `feat/building-photo-order-ui`(이미
  `main`에서 땄다).

## 이 계획이 정한 것 — 사용자 승인 대상

설계가 비워 둔 자리를 아래로 채운다. 각 태스크가 설계 3.2·3.4에 **[판단]**으로 옮겨 적는다.

1. **화살표 이름은 "사진 N 앞으로 옮기기"·"사진 N 뒤로 옮기기"**(N은 지금 화면 순서, 1부터). 설계 예시 "사진 2를 앞으로"는 숫자마다
   조사(을/를)가 달라 조사 없는 꼴로 바꾼다.
2. **저장 중 잠금은 `aria-disabled`, 맨 앞·맨 끝은 `disabled`.** `disabled`로 잠그면 누른 버튼이 키보드 초점을 잃는다.
3. **옮긴 뒤 초점은 옮긴 사진의 같은 방향 화살표**, 끝에 닿아 꺼지면 같은 사진의 반대쪽. React가 자리를 바꾸며 버튼을 DOM에서
   뺐다 넣거나 끝 화살표가 꺼지면 초점이 사라지기 때문이다.
4. **업로드와 맞바꾸기는 서로를 잠근다.** 올리는 동안 화살표를, 맞바꾸기 저장 중에는 "사진 추가"와 "실패한 사진 다시 시도"를
   잠근다. 업로드가 끝나며 목록을 다시 읽어, 저장 중인 맞바꾸기 앞의 순서로 화면을 덮을 수 있다.
5. **성공 토스트는 없다.** 화면이 바로 바뀌고, 캡션 저장도 성공 토스트가 없다.
6. **되돌린 실패는 활동 기록에 실패로 보고한다**(`reportFailure`, 작업 키 `building_photos.update`, 대상은 누른 사진). 브라우저
   Supabase 쓰기 실패를 보고하는 관문(`reportingFetch`)은 `rpc/`를 건너뛰어(`docs/specs/2026-10-19-activity-log-design.md` 4.3)
   그대로 두면 이 실패만 기록에서 빠진다. `PT409`·`P0002`는 다른 관리자가 먼저 바꾼 경합이고 화면이 스스로 맞추므로 보고하지 않는다.
7. **아이콘은 lucide `ChevronLeft`·`ChevronRight`.** ◀▶ 글자는 일부 기기에서 이모지로 그려진다. lucide는 `Toast`·`PhotoCarousel`이
   이미 쓴다.
8. **목록 다시 읽기가 실패하면 지금 목록을 그대로 둔다.** 지금 `fetchPhotos`는 조회 오류를 무시하고 목록과 입력 중인 설명을 비운다.
   `PT409`·`P0002` 뒤 다시 읽기가 실패하면 서버 순서를 모르니 누르기 전 화면으로 되돌리고 오류 토스트를 띄운다("다시 불러왔어요"를
   띄우지 않는다). 업로드·삭제 뒤 다시 읽기도 같은 함수라 같이 바뀐다.

### 버린 대안

- **응답을 받은 뒤 화면 바꾸기** — 설계 3.2가 "실패하면 화면 순서를 되돌린다"고 해 낙관적 갱신을 전제한다. 눌러도 반응이 늦다.
- **실패 시 누르기 전 배열(스냅숏)로 되돌리기** — 저장 중에 캡션 저장이 끝나 `photos`를 고치면 스냅숏이 그 캡션을 지운다. 같은 두
  id를 한 번 더 맞바꾸면(`swapPhotos`는 두 번 부르면 제자리) 그사이 바뀐 다른 칸을 건드리지 않는다.
- **실패 시 다시 불러와 되돌리기** — 네트워크가 끊긴 실패면 다시 읽기도 실패하고, `fetchPhotos`는 실패를 빈 목록으로 그린다.
- **관문(`restWrite`)에 RPC 이름을 더해 보고하기** — 관문은 본문을 읽지 않아 대상 사진을 모르고, 경합(`PT409`·`P0002`)까지 실패로
  남긴다.

## Review Focus

E2E가 잡지 못하는 것. 리뷰어가 코드로 확인한다.

1. **초점 이동 시점**: `flushSync`로 화면 맞바꾸기를 먼저 그린 **뒤에** 버튼을 찾아 `focus()`하는지. 렌더 중에 ref를 읽거나 effect
   안에서 상태를 바꾸지 않는지(React Compiler 린트).
2. **되돌리기**: 그 밖의 실패에서 `swapPhotos(current, p_first, p_second)`를 함수형 갱신으로 한 번 더 부르는지(스냅숏 복원이 아닌지).
3. **잠금 범위**: `busy`(`reordering || uploading`)일 때 모든 화살표가 `aria-disabled`이고 `handleMove`가 일찍 돌아가는지, 같은
   `busy`가 파일 입력과 "실패한 사진 다시 시도"를 막는지. 끝 화살표의 `disabled`가 `swapArgsFor(...) === null` 하나로 정해지는지.
4. **목 정렬 변경**: `rows()`의 `order` 비교가 두 값이 다 숫자면 숫자로 비교하게 바뀐다. 다른 E2E가 문자열 순서(`"10" < "9"`)에 기대고
   있었다면 CI 전체 E2E에서 드러난다.
5. **받아들인 경합**: 맞바꾸기 저장 중에 사진을 지우면 지우기 뒤 다시 읽은 목록 위에서 되돌리기가 돌 수 있다(그 밖의 실패가 같이 날
   때만). 다음 클릭이 `PT409`로 다시 불러와 맞춘다. 잠금을 지우기까지 넓히지 않는다.

## 푸시와 CI

CI 한 번에 "앞 태스크 구현이 초록, 다음 태스크 테스트가 기대한 빨강"을 같이 본다. Playwright 잡의 실패 목록은
`gh run view <run id> --log-failed | grep -E "✘|Error:|Expected|Received" | head -60`으로 본다.

| 푸시 | 담는 커밋                                    | 기대                                                                      |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------- |
| A    | 계획 문서, Task 1 테스트·구현, Task 2 테스트 | 단위 테스트 초록. Playwright는 Task 2의 새 테스트 둘만 순서 단언으로 실패 |
| B    | Task 2 구현, Task 3 테스트(목 RPC 포함)      | Task 2 테스트 초록. Task 3의 새 테스트만 화살표 버튼을 못 찾아 실패       |
| C    | Task 3 구현, Task 4 테스트                   | Task 3 테스트 초록. Task 4의 새 테스트만 토스트·되돌림·잠금 단언으로 실패 |

테스트 커밋이 쓰는 목 상태·도우미는 **그 테스트 커밋에** 넣는다. `tsconfig.json`이 `e2e/`까지 포함해 CI `Typecheck`가 E2E 파일도
검사하므로, 테스트가 아직 없는 목 필드를 가리키면 Playwright 실패가 아니라 타입 검사 실패로 빨개진다.
| D | Task 4 구현, 문서 | 전부 초록 |

`DB test`가 `toomanyrequests`나 `port 54322 ... address already in use`로 테스트 전에 죽으면 인프라 문제다 →
`gh run rerun <run id> --failed`(설계 진행 상황 "알아야 할 상황").

---

### Task 1: 순서 계산 순수 함수

**Files:**

- Create: `src/lib/buildingPhotoOrder.ts`
- Test: `src/lib/buildingPhotoOrder.test.ts`

**Interfaces:**

- Consumes: 없음
- Produces:

  ```ts
  export type PhotoMoveDirection = "earlier" | "later";
  export function swapArgsFor(
    photos: readonly { id: number }[],
    index: number,
    direction: PhotoMoveDirection,
  ): { p_first: number; p_second: number } | null;
  export function swapPhotos<T extends { id: number; sort_order: number }>(
    photos: T[],
    firstId: number,
    secondId: number,
  ): T[];
  export function swapFailureAction(
    code: string | undefined,
  ): "reload" | "revert";
  export function focusDirectionAfterMove(
    newIndex: number,
    count: number,
    direction: PhotoMoveDirection,
  ): PhotoMoveDirection;
  ```

- [ ] **Step 0: 계획 문서를 커밋한다**

```bash
npx --yes prettier@3.9.4 --write docs/plans/2026-10-26-mentoring-pr1-2-photo-order-ui.md
git add docs/plans/2026-10-26-mentoring-pr1-2-photo-order-ui.md
git commit -m "docs: 멘토링 PR ①-2 건물 사진 순서 화면 계획을 적는다"
```

- [ ] **Step 1: 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";
import {
  focusDirectionAfterMove,
  swapArgsFor,
  swapFailureAction,
  swapPhotos,
} from "@/lib/buildingPhotoOrder";

const photos = [
  { id: 11, sort_order: 0, caption: "정문" },
  { id: 12, sort_order: 1, caption: "로비" },
  { id: 13, sort_order: 2, caption: "야간" },
];

describe("swapArgsFor", () => {
  it("앞으로는 (왼쪽 사진, 누른 사진)을 화면 순서대로 준다", () => {
    expect(swapArgsFor(photos, 2, "earlier")).toEqual({
      p_first: 12,
      p_second: 13,
    });
  });

  it("뒤로는 (누른 사진, 오른쪽 사진)을 화면 순서대로 준다", () => {
    expect(swapArgsFor(photos, 0, "later")).toEqual({
      p_first: 11,
      p_second: 12,
    });
  });

  it("맨 앞의 앞으로, 맨 끝의 뒤로는 null이다", () => {
    expect(swapArgsFor(photos, 0, "earlier")).toBeNull();
    expect(swapArgsFor(photos, 2, "later")).toBeNull();
  });

  it("사진이 한 장이면 두 방향 모두 null이다", () => {
    expect(swapArgsFor([photos[0]], 0, "earlier")).toBeNull();
    expect(swapArgsFor([photos[0]], 0, "later")).toBeNull();
  });
});

describe("swapPhotos", () => {
  it("두 사진의 자리와 번호를 맞바꾸고 나머지는 그대로 둔다", () => {
    expect(swapPhotos(photos, 12, 13)).toEqual([
      { id: 11, sort_order: 0, caption: "정문" },
      { id: 13, sort_order: 1, caption: "야간" },
      { id: 12, sort_order: 2, caption: "로비" },
    ]);
  });

  it("같은 두 id로 한 번 더 부르면 제자리로 돌아온다", () => {
    expect(swapPhotos(swapPhotos(photos, 12, 13), 12, 13)).toEqual(photos);
  });

  it("그사이 바뀐 다른 칸은 되돌리지 않는다", () => {
    const swapped = swapPhotos(photos, 12, 13).map((photo) =>
      photo.id === 13 ? { ...photo, caption: "야간 입구" } : photo,
    );
    expect(swapPhotos(swapped, 12, 13)[2]).toEqual({
      id: 13,
      sort_order: 2,
      caption: "야간 입구",
    });
  });

  it("없는 id가 있으면 받은 배열을 그대로 돌려준다", () => {
    expect(swapPhotos(photos, 12, 99)).toBe(photos);
  });
});

describe("swapFailureAction", () => {
  it("이웃이 아님·사진 없음은 다시 불러온다", () => {
    expect(swapFailureAction("PT409")).toBe("reload");
    expect(swapFailureAction("P0002")).toBe("reload");
  });

  it("그 밖은 화면을 되돌린다", () => {
    for (const code of ["42501", "22023", "", undefined])
      expect(swapFailureAction(code)).toBe("revert");
  });
});

describe("focusDirectionAfterMove", () => {
  it("끝에 닿지 않으면 같은 방향이다", () => {
    expect(focusDirectionAfterMove(1, 3, "earlier")).toBe("earlier");
    expect(focusDirectionAfterMove(1, 3, "later")).toBe("later");
  });

  it("맨 앞에 닿으면 뒤로, 맨 끝에 닿으면 앞으로 간다", () => {
    expect(focusDirectionAfterMove(0, 3, "earlier")).toBe("later");
    expect(focusDirectionAfterMove(2, 3, "later")).toBe("earlier");
  });
});
```

- [ ] **Step 2: 테스트를 커밋한다**

```bash
git add src/lib/buildingPhotoOrder.test.ts
git commit -m "test: 건물 사진 맞바꿀 쌍과 화면 맞바꾸기 규칙을 시험한다"
```

모듈이 없어 import에서 실패하는 것이 유일한 빨강이라 이 테스트만 따로 CI에 올리지 않는다.

- [ ] **Step 3: 구현한다**

```ts
/** 관리자 사진 칸의 순서 바꾸기. 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 3.2·3.4 */

export type PhotoMoveDirection = "earlier" | "later";

/** 맞바꾸기 RPC 인자. DB 함수가 방향까지 보므로 화면 순서(앞 사진, 뒤 사진)로 준다. 끝이라 옮길 수 없으면 null. */
export function swapArgsFor(
  photos: readonly { id: number }[],
  index: number,
  direction: PhotoMoveDirection,
): { p_first: number; p_second: number } | null {
  const front = direction === "earlier" ? index - 1 : index;
  const back = front + 1;
  if (front < 0 || back >= photos.length) return null;
  return { p_first: photos[front].id, p_second: photos[back].id };
}

/**
 * 두 사진의 자리와 번호를 맞바꾼다. 같은 두 id로 다시 부르면 제자리라 실패 때 이것으로 되돌린다 — 누르기 전 배열로
 * 돌리면 저장 중에 끝난 캡션 저장까지 지운다.
 */
export function swapPhotos<T extends { id: number; sort_order: number }>(
  photos: T[],
  firstId: number,
  secondId: number,
): T[] {
  const first = photos.findIndex((photo) => photo.id === firstId);
  const second = photos.findIndex((photo) => photo.id === secondId);
  if (first < 0 || second < 0) return photos;
  const next = [...photos];
  next[first] = { ...photos[second], sort_order: photos[first].sort_order };
  next[second] = { ...photos[first], sort_order: photos[second].sort_order };
  return next;
}

/** `PT409`·`P0002`는 다른 관리자가 그사이 순서를 바꾸거나 지운 것이라 화면을 서버 순서로 다시 맞춘다. */
export function swapFailureAction(
  code: string | undefined,
): "reload" | "revert" {
  return code === "PT409" || code === "P0002" ? "reload" : "revert";
}

/** 옮긴 사진에서 초점을 줄 화살표. 끝에 닿아 그 방향이 꺼지면 반대쪽이다. */
export function focusDirectionAfterMove(
  newIndex: number,
  count: number,
  direction: PhotoMoveDirection,
): PhotoMoveDirection {
  if (direction === "earlier" && newIndex === 0) return "later";
  if (direction === "later" && newIndex === count - 1) return "earlier";
  return direction;
}
```

- [ ] **Step 4: 서식과 커밋**

```bash
npx --yes prettier@3.9.4 --write src/lib/buildingPhotoOrder.ts src/lib/buildingPhotoOrder.test.ts
git add src/lib/buildingPhotoOrder.ts src/lib/buildingPhotoOrder.test.ts
git commit -m "feat: 건물 사진 맞바꿀 쌍과 화면 맞바꾸기를 계산하는 함수를 둔다"
```

---

### Task 2: `sort_order` 순서로 읽기

**Files:**

- Modify: `src/components/SidePanel.tsx`(`fetchData`의 `building_photos` 조회)
- Modify: `src/components/admin/BuildingPhotoManager.tsx`(`fetchPhotos`)
- Modify: `e2e/support/mockBackend.ts`(사진 픽스처, `/api/upload-building-photo`, `rows()`의 `order` 비교)
- Modify: `e2e/public-map.spec.ts`("건물 사진을 크게 보고 내려받는다"가 넣는 두 번째 사진)
- Create: `e2e/building-photo-order.spec.ts`

**Interfaces:**

- Consumes: 없음
- Produces: `e2e/building-photo-order.spec.ts`의 도우미 `seedThreePhotos(state)`·`photoRow(id, sortOrder, caption)`·
  `expectCaptionOrder(section, captions)`·`photoSection(page)`. Task 3·4가 같은 파일에 테스트를 더하며 쓴다.

`building_photos`를 순서대로 보여 주는 곳은 두 곳뿐이다(설계 3.4 "그 밖에 … 있으면"). 확인 명령:
`rg -n "building_photos" src e2e --glob "!supabase/**"` — `SidePanel.tsx`·`BuildingPhotoManager.tsx` 밖의 조회는 업로드·삭제 라우트,
WebP 변환 스크립트(순서 무관), 활동 기록 표시 이름뿐이다.

- [ ] **Step 1: E2E 테스트 파일을 만든다**

```ts
import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

// 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 3.2·3.4

function photoRow(id: number, sortOrder: number, caption: string) {
  return {
    id,
    building_id: 1,
    url: `https://cdn.test/building-1-${id}.webp`,
    caption,
    caption_en: null,
    caption_zh: null,
    sort_order: sortOrder,
    created_at: `2026-07-0${id}T00:00:00Z`,
  };
}

/** 건물 1의 사진 세 장. 화면 순서는 정문 → 로비 → 야간이고 올린 순서(id·created_at)와 같다 */
function seedThreePhotos(state: MockState) {
  state.photos.splice(
    0,
    state.photos.length,
    photoRow(1, 0, "정문"),
    photoRow(2, 1, "로비"),
    photoRow(3, 2, "야간"),
  );
}

function photoSection(page: Page) {
  return page.locator("#building-photos");
}

async function expectCaptionOrder(section: Locator, captions: string[]) {
  const inputs = section.getByLabel("사진 설명");
  await expect(inputs).toHaveCount(captions.length);
  for (const [index, caption] of captions.entries())
    await expect(inputs.nth(index)).toHaveValue(caption);
}

test.describe("건물 사진 순서 — 읽기", () => {
  test("관리자 사진 칸은 올린 순서가 아니라 sort_order 순서로 보여 준다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    // 밤에 찍은 사진을 맨 앞으로 옮겨 둔 상태
    state.photos[0].sort_order = 2;
    state.photos[2].sort_order = 0;

    await page.goto("/admin/buildings/1");

    await expectCaptionOrder(photoSection(page), ["야간", "로비", "정문"]);
  });

  test("공개 상세는 sort_order 순서의 첫 사진을 맨 앞에 보여 준다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    state.photos.splice(
      0,
      state.photos.length,
      photoRow(1, 1, "정문"),
      photoRow(2, 0, "열람실"),
    );
    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();

    await page.getByRole("button", { name: "사진 크게 보기" }).click();
    const dialog = page.getByRole("dialog", {
      name: "중앙도서관",
      exact: true,
    });
    await expect(dialog).toContainText("1 / 2");
    await expect(dialog).toContainText("열람실");
  });
});
```

- [ ] **Step 2: 기존 공개 E2E의 두 번째 사진에 번호를 준다**

`e2e/public-map.spec.ts` "건물 사진을 크게 보고 내려받는다"의 `state.photos.push({ id: 2, … })`에 `sort_order: 1,`을 더한다(목 기본
사진이 Task 2 Step 4에서 0번을 받는다). 단언은 그대로다.

- [ ] **Step 3: 테스트를 커밋하고 푸시 A를 한다**

```bash
npx --yes prettier@3.9.4 --write e2e/building-photo-order.spec.ts e2e/public-map.spec.ts
git add e2e/building-photo-order.spec.ts e2e/public-map.spec.ts
git commit -m "test(e2e): 공개 상세와 관리자 사진 칸이 sort_order 순서로 읽는지 시험한다"
git push -u origin feat/building-photo-order-ui
gh pr create --draft --title "feat: 관리자 건물 사진 순서를 화살표로 바꾼다" --body-file <PR 본문 파일>
```

PR 본문: 설계 1장의 ①-2 범위, "이 계획이 정한 것" 일곱 줄, DB·업로드 라우트 무변경, 병합 뒤 확인(아래). 끝에
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Expected(CI): `Test (unit)` 초록(Task 1). `Test (Playwright)`는 새 테스트 둘만 실패 — 관리자는 첫 칸이 `"정문"`(created_at 순),
공개는 `"열람실"`이 안 보임. 다른 실패가 있으면 멈추고 원인을 본다.

- [ ] **Step 4: 목 백엔드가 `sort_order`를 갖고 숫자로 정렬하게 한다**

`e2e/support/mockBackend.ts`:

1. `createState()`의 `photos` 기본 행에 `sort_order: 0,`을 더한다.
2. `/api/upload-building-photo` 흉내의 `photo` 객체에 DB 트리거처럼 그 건물의 마지막 번호 + 1을 준다.

   ```ts
   const sortOrder =
     Math.max(
       -1,
       ...state.photos
         .filter((photo) => photo.building_id === buildingId)
         .map((photo) => Number(photo.sort_order)),
     ) + 1;
   ```

   `photo`에 `sort_order: sortOrder,`(`caption_zh` 다음).

3. `rows()`의 `order` 비교를 두 값이 다 숫자면 숫자로 비교하게 바꾼다.

   ```ts
   const comparison =
     typeof a === "number" && typeof b === "number"
       ? a - b
       : String(a).localeCompare(String(b), "ko");
   ```

- [ ] **Step 5: 두 조회를 `sort_order` 순으로 바꾼다**

`src/components/SidePanel.tsx`의 `building_photos` 조회:

```ts
      supabase
        .from("building_photos")
        .select("id, url, caption, caption_en, caption_zh")
        .eq("building_id", buildingId)
        .order("sort_order")
        .order("id"),
```

`src/components/admin/BuildingPhotoManager.tsx`의 `fetchPhotos`:

```ts
const { data } = await supabase
  .from("building_photos")
  .select("*")
  .eq("building_id", buildingId)
  .order("sort_order")
  .order("id");
```

두 번째 기준 `id`의 이유(번호가 겹칠 수 없지만 순서를 늘 같게)는 설계 3.4에 있으니 주석을 달지 않는다.

- [ ] **Step 6: 서식과 커밋**

```bash
npx --yes prettier@3.9.4 --write e2e/support/mockBackend.ts src/components/SidePanel.tsx src/components/admin/BuildingPhotoManager.tsx
git add e2e/support/mockBackend.ts src/components/SidePanel.tsx src/components/admin/BuildingPhotoManager.tsx
git commit -m "feat: 공개 상세와 관리자 사진 칸이 sort_order 순서로 사진을 읽는다"
```

푸시는 Task 3 Step 2와 함께(푸시 B).

---

### Task 3: 화살표로 자리 바꾸기

**Files:**

- Modify: `src/components/admin/BuildingPhotoManager.tsx`
- Modify: `src/app/admin/admin-ui.css`(`.ku-photo-delete-button::after` 다음, 그리고 `A11Y-P2-01` 모바일 블록)
- Modify: `e2e/support/mockBackend.ts`(`MockState.photoSwapRequests`, `rpc/swap_building_photo_order` 흉내, 맨 위 구조 주석)
- Modify: `e2e/building-photo-order.spec.ts`
- Modify: `docs/specs/2026-10-25-mentoring-feedback-design.md` 3.2

**Interfaces:**

- Consumes: Task 1의 `swapArgsFor`·`swapPhotos`·`focusDirectionAfterMove`·`PhotoMoveDirection`, Task 2의 E2E 도우미
- Produces: 화살표 버튼(접근 가능한 이름 `사진 ${n} 앞으로 옮기기`·`사진 ${n} 뒤로 옮기기`, 클래스 `ku-photo-order-button`),
  `MockState.photoSwapRequests: { p_first: number; p_second: number }[]`. Task 4가 `handleMove`에 실패 분기를 더한다.

- [ ] **Step 1: E2E 테스트를 더한다**

`e2e/building-photo-order.spec.ts` 끝에 더한다.

```ts
function moveButton(
  section: Locator,
  position: number,
  direction: "앞으로" | "뒤로",
) {
  return section.getByRole("button", {
    name: `사진 ${position} ${direction} 옮기기`,
    exact: true,
  });
}

test.describe("건물 사진 순서 — 화살표", () => {
  test("이웃한 사진과 자리를 바꾸고 화면 순서대로 저장해 다시 열어도 그 순서다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
    await expect(moveButton(section, 1, "앞으로")).toBeDisabled();
    await expect(moveButton(section, 3, "뒤로")).toBeDisabled();

    await moveButton(section, 3, "앞으로").click();
    await expectCaptionOrder(section, ["정문", "야간", "로비"]);
    await expect
      .poll(() => state.photoSwapRequests)
      .toEqual([{ p_first: 2, p_second: 3 }]);

    await moveButton(section, 1, "뒤로").click();
    await expectCaptionOrder(section, ["야간", "정문", "로비"]);
    await expect
      .poll(() => state.photoSwapRequests.at(-1))
      .toEqual({ p_first: 1, p_second: 3 });

    await page.reload();
    await expectCaptionOrder(section, ["야간", "정문", "로비"]);
  });

  test("사진이 한 장이면 두 화살표가 모두 꺼져 있다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);

    await expect(moveButton(section, 1, "앞으로")).toBeDisabled();
    await expect(moveButton(section, 1, "뒤로")).toBeDisabled();
  });

  test("키보드로 옮기면 초점이 옮긴 사진의 화살표를 따라간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);

    await moveButton(section, 2, "뒤로").focus();
    await page.keyboard.press("Enter");
    await expectCaptionOrder(section, ["정문", "야간", "로비"]);
    // 로비가 맨 끝에 닿아 뒤로가 꺼지므로 같은 사진의 앞으로로 간다
    await expect(moveButton(section, 3, "앞으로")).toBeFocused();

    await expect(moveButton(section, 3, "앞으로")).toBeEnabled();
    await page.keyboard.press("Enter");
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
    await expect(moveButton(section, 2, "앞으로")).toBeFocused();
    await expect
      .poll(() => state.photoSwapRequests)
      .toEqual([
        { p_first: 2, p_second: 3 },
        { p_first: 3, p_second: 2 },
      ]);
  });

  test("저장 중에는 그 건물의 화살표를 모두 잠근다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let swapCalls = 0;
    await page.route(
      (url) => url.pathname.endsWith("/rest/v1/rpc/swap_building_photo_order"),
      async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        swapCalls += 1;
        await held;
        await route.fallback();
      },
    );
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);

    await moveButton(section, 3, "앞으로").click();
    // 저장이 끝나기 전에 화면이 먼저 바뀐다
    await expectCaptionOrder(section, ["정문", "야간", "로비"]);
    for (const [position, direction] of [
      [1, "뒤로"],
      [2, "앞으로"],
      [2, "뒤로"],
      [3, "앞으로"],
    ] as const)
      await expect(moveButton(section, position, direction)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    await moveButton(section, 1, "뒤로").click({ force: true });

    release();
    await expect(moveButton(section, 1, "뒤로")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(swapCalls).toBe(1);
    await expectCaptionOrder(section, ["정문", "야간", "로비"]);
  });

  test("모바일 폭에서 화살표가 44px 터치 영역을 갖고 사진 칸을 넘지 않는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);

    for (let position = 1; position <= 3; position += 1) {
      const caption = (await section
        .getByLabel("사진 설명")
        .nth(position - 1)
        .boundingBox())!;
      for (const direction of ["앞으로", "뒤로"] as const) {
        const box = (await moveButton(
          section,
          position,
          direction,
        ).boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(caption.x - 0.5);
        expect(box.x + box.width).toBeLessThanOrEqual(
          caption.x + caption.width + 0.5,
        );
      }
    }
  });
});
```

- [ ] **Step 2: 목 백엔드에 맞바꾸기 RPC를 흉내 낸다** (테스트가 `state.photoSwapRequests`를 쓰므로 테스트와 같은 커밋)

`e2e/support/mockBackend.ts`:

1. `MockState`에 `/** 브라우저가 보낸 맞바꾸기 RPC 인자(화면 순서) */ photoSwapRequests: { p_first: number; p_second: number }[];`,
   `createState()`에 `photoSwapRequests: [],`.
2. `nextId` 앞에 함수를 둔다.

   ```ts
   /**
    * `rpc/swap_building_photo_order` 흉내. 판정 순서와 SQLSTATE는 운영 함수(`20261025000000_add_building_photo_sort_order.sql`)를,
    * HTTP 상태는 PostgREST 규칙(`P0*` 500, `PTxyz` xyz, 그 밖 400)을 따른다. RLS 거부(`42501`)는 흉내 내지 않는다 — 그 경우는
    * 테스트가 응답을 덮어쓴다.
    */
   function swapBuildingPhotos(
     route: Route,
     state: MockState,
     firstId: number,
     secondId: number,
   ) {
     const fail = (status: number, code: string, message: string) =>
       json(route, { code, message, details: null, hint: null }, status);
     if (firstId === secondId)
       return fail(400, "22023", "cannot swap a photo with itself");
     const first = state.photos.find((photo) => Number(photo.id) === firstId);
     const second = state.photos.find((photo) => Number(photo.id) === secondId);
     if (!first || !second)
       return fail(500, "P0002", "building photo not found");
     if (first.building_id !== second.building_id)
       return fail(400, "22023", "photos belong to different buildings");
     const firstOrder = Number(first.sort_order);
     const secondOrder = Number(second.sort_order);
     const between = state.photos.some(
       (photo) =>
         photo.building_id === first.building_id &&
         Number(photo.sort_order) > firstOrder &&
         Number(photo.sort_order) < secondOrder,
     );
     if (firstOrder > secondOrder || between)
       return fail(409, "PT409", "photos are no longer adjacent in this order");
     first.sort_order = secondOrder;
     second.sort_order = firstOrder;
     return route.fulfill({
       status: 204,
       headers: { "access-control-allow-origin": "*" },
       body: "",
     });
   }
   ```

3. `handleRest()`의 `rpc/get_admin_building_summary` 처리 다음에:

   ```ts
   if (name === "rpc/swap_building_photo_order" && method === "POST") {
     const args = route.request().postDataJSON() as {
       p_first: number;
       p_second: number;
     };
     state.photoSwapRequests.push(args);
     return swapBuildingPhotos(route, state, args.p_first, args.p_second);
   }
   ```

4. 맨 위 구조 주석의 `admin_building_flags` 줄 다음에 한 줄: `` `rpc/swap_building_photo_order`는 `swapBuildingPhotos()`가 운영 함수의 판정을 흉내 낸다. ``

- [ ] **Step 3: 테스트와 목을 커밋하고 푸시 B를 한다**

```bash
npx --yes prettier@3.9.4 --write e2e/building-photo-order.spec.ts e2e/support/mockBackend.ts
git add e2e/building-photo-order.spec.ts e2e/support/mockBackend.ts
git commit -m "test(e2e): 건물 사진 화살표가 자리를 바꾸고 저장 중 잠기는지 시험한다"
git push
```

Expected(CI): `Typecheck` 초록. Task 2의 두 테스트 초록. 새 테스트 다섯은 화살표 버튼을 못 찾아 실패. 그 밖의 실패가 있으면(특히
Task 2 Step 4의 숫자 정렬 때문에) 멈추고 원인을 본다.

- [ ] **Step 4: 사진 칸에 화살표를 단다**

`src/components/admin/BuildingPhotoManager.tsx`:

import에 더한다.

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  focusDirectionAfterMove,
  swapArgsFor,
  swapPhotos,
  type PhotoMoveDirection,
} from "@/lib/buildingPhotoOrder";
```

모듈 수준(`photoUploadStatusLabel` 다음):

```ts
const MOVE_DIRECTIONS = ["earlier", "later"] as const;
const moveLabel: Record<PhotoMoveDirection, string> = {
  earlier: "앞으로",
  later: "뒤로",
};
const MoveIcon: Record<PhotoMoveDirection, typeof ChevronLeft> = {
  earlier: ChevronLeft,
  later: ChevronRight,
};

function orderButtonKey(photoId: number, direction: PhotoMoveDirection) {
  return `${photoId}:${direction}`;
}
```

컴포넌트 상태(`savingCaption` 다음):

```ts
const [reordering, setReordering] = useState(false);
const orderButtons = useRef(new Map<string, HTMLButtonElement>());
const busy = reordering;
```

`handleDelete` 다음에:

```ts
function orderButtonRef(photoId: number, direction: PhotoMoveDirection) {
  const key = orderButtonKey(photoId, direction);
  return (element: HTMLButtonElement | null) => {
    if (element) orderButtons.current.set(key, element);
    else orderButtons.current.delete(key);
  };
}

async function handleMove(index: number, direction: PhotoMoveDirection) {
  if (busy) return;
  const args = swapArgsFor(photos, index, direction);
  if (!args) return;
  const movedId = photos[index].id;
  const movedTo = direction === "earlier" ? index - 1 : index + 1;
  setReordering(true);
  // 자리를 바꾸면 React가 버튼을 DOM에서 뺐다 넣거나 끝 화살표가 꺼져 초점이 사라진다. 그린 뒤 옮긴 사진의 화살표로 돌려준다.
  flushSync(() =>
    setPhotos((current) => swapPhotos(current, args.p_first, args.p_second)),
  );
  orderButtons.current
    .get(
      orderButtonKey(
        movedId,
        focusDirectionAfterMove(movedTo, photos.length, direction),
      ),
    )
    ?.focus();

  await supabase.rpc("swap_building_photo_order", args);
  setReordering(false);
}
```

사진 하나를 그리는 `photos.map((photo) => (`를 `photos.map((photo, index) => (`로 바꾸고, 썸네일 `<div style={{ position: "relative", … }}>`과
캡션 `<input>` 사이에 넣는다.

```tsx
<div className="ku-photo-order-controls">
  {MOVE_DIRECTIONS.map((direction) => {
    const Icon = MoveIcon[direction];
    return (
      <button
        key={direction}
        type="button"
        ref={orderButtonRef(photo.id, direction)}
        className="ku-photo-order-button"
        disabled={swapArgsFor(photos, index, direction) === null}
        // 잠금을 disabled로 걸면 누른 버튼이 키보드 초점을 잃는다
        aria-disabled={busy || undefined}
        aria-label={`사진 ${index + 1} ${moveLabel[direction]} 옮기기`}
        onClick={() => void handleMove(index, direction)}
      >
        <Icon size={16} aria-hidden="true" />
      </button>
    );
  })}
</div>
```

이 단계의 `handleMove`는 실패를 다루지 않는다. 실패 분기는 Task 4가 더한다.

- [ ] **Step 5: 화살표 모양**

`src/app/admin/admin-ui.css`의 `.ku-photo-delete-button::after` 블록 다음:

```css
.ku-photo-order-controls {
  display: flex;
  justify-content: space-between;
}

.ku-photo-order-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--ku-border);
  border-radius: var(--ku-radius);
  color: var(--ku-text-1);
  background: var(--ku-surface);
  cursor: pointer;
}

/* 저장 중 잠금(aria-disabled)도 끝 화살표(disabled)와 같은 꺼진 모양이다 */
.ku-photo-order-button:disabled,
.ku-photo-order-button[aria-disabled="true"] {
  color: var(--ku-text-3);
  cursor: default;
}
```

같은 파일의 `A11Y-P2-01` 모바일 블록(`@media (max-width: 767px)`, `.ku-admin-row-action` 규칙이 있는 곳) 안에:

```css
.ku-photo-order-button {
  width: 44px;
  height: 44px;
}
```

- [ ] **Step 6: 설계 3.2에 정한 것을 옮겨 적는다**

먼저 설계 문서 첫 40줄을 읽어 3장 위에 대체 배너가 없는지 본다(지금은 없다). 3.2에서:

- "버튼에는 사진을 구분하는 접근 가능한 이름을 단다(예: "사진 2를 앞으로")." 줄을 다음으로 바꾼다:
  `- 버튼에는 사진을 구분하는 접근 가능한 이름을 단다: "사진 N 앞으로 옮기기"·"사진 N 뒤로 옮기기"(N은 지금 화면 순서, 1부터). **[판단]** 숫자마다 뒤 조사(을/를)가 달라 조사 없는 꼴로 둔다.`
- 그 아래에 더한다:
  - `- **[판단]** 저장 중 잠금은 `aria-disabled`로 건다. `disabled`로 잠그면 누른 버튼이 키보드 초점을 잃는다. 맨 앞·맨 끝이라 누를 수 없는 화살표만 `disabled`다.`
  - `- **[판단]** 옮긴 뒤 초점은 옮긴 사진의 같은 방향 화살표로 간다. 끝에 닿아 그 화살표가 꺼지면 같은 사진의 반대쪽으로 간다 — 키보드로 같은 사진을 이어서 옮길 수 있게.`
  - `- **[판단]** 성공 토스트는 띄우지 않는다. 화면 순서가 바로 바뀌고, 캡션 저장도 성공 토스트가 없다.`

- [ ] **Step 7: 서식과 커밋**

```bash
npx --yes prettier@3.9.4 --write src/components/admin/BuildingPhotoManager.tsx src/app/admin/admin-ui.css docs/specs/2026-10-25-mentoring-feedback-design.md
rg -n "\x{FFFD}" src/components/admin/BuildingPhotoManager.tsx src/app/admin/admin-ui.css docs/specs/2026-10-25-mentoring-feedback-design.md
git add src/components/admin/BuildingPhotoManager.tsx src/app/admin/admin-ui.css docs/specs/2026-10-25-mentoring-feedback-design.md
git commit -m "feat: 관리자 건물 사진 칸의 화살표로 이웃한 사진과 자리를 바꾼다"
```

푸시는 Task 4 Step 2와 함께(푸시 C).

---

### Task 4: 실패 처리와 업로드 중 잠금

**Files:**

- Modify: `src/components/admin/BuildingPhotoManager.tsx`(`busy`, `fetchPhotos`, `handleMove`, "사진 추가"·"실패한 사진 다시 시도")
- Modify: `e2e/building-photo-order.spec.ts`
- Modify: `docs/specs/2026-10-25-mentoring-feedback-design.md` 3.2·3.4
- Modify: `docs/specs/2026-10-19-activity-log-design.md` 4.3

**Interfaces:**

- Consumes: Task 1의 `swapFailureAction`·`swapPhotos`, Task 3의 `handleMove`·`moveButton`, 기존 `reportFailure`
  (`src/lib/activityReport.ts`, `source: { kind: "postgrest", status, error: { code, message } }`), `showToast(message, type)`,
  `serverError(route)`(`e2e/support/adminWorkspace.ts`)
- Produces: 없음(마지막 태스크)

- [ ] **Step 1: E2E 테스트를 더한다**

`e2e/building-photo-order.spec.ts` 맨 위 import에 `import { serverError } from "./support/adminWorkspace";`를 더하고, 끝에 더한다.

```ts
function photoById(state: MockState, id: number) {
  return state.photos.find((photo) => photo.id === id)!;
}

function swapRequest(url: URL) {
  return url.pathname.endsWith("/rest/v1/rpc/swap_building_photo_order");
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlAAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("건물 사진 순서 — 실패와 잠금", () => {
  test("다른 관리자가 그사이 순서를 바꿨으면 다시 불러오고 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
    // 다른 관리자가 정문과 로비를 바꿨다. 이 화면은 아직 모른다
    photoById(state, 1).sort_order = 1;
    photoById(state, 2).sort_order = 0;

    // (로비, 야간) — 지금 둘 사이에 정문이 있다
    await moveButton(section, 3, "앞으로").click();

    await expect(
      page
        .locator(".ku-toast[role='status']")
        .filter({ hasText: "순서가 바뀌어 다시 불러왔어요" }),
    ).toBeVisible();
    await expectCaptionOrder(section, ["로비", "정문", "야간"]);
    expect(state.activityReports).toHaveLength(0);
  });

  test("그사이 지워진 사진이면 다시 불러오고 알린다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
    state.photos.splice(
      state.photos.findIndex((photo) => photo.id === 3),
      1,
    );

    await moveButton(section, 3, "앞으로").click();

    await expect(
      page
        .locator(".ku-toast[role='status']")
        .filter({ hasText: "순서가 바뀌어 다시 불러왔어요" }),
    ).toBeVisible();
    await expectCaptionOrder(section, ["정문", "로비"]);
  });

  test("다시 불러오기마저 실패하면 누르기 전 순서로 두고 오류로 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    let failReads = false;
    await page.route(
      (url) => url.pathname.endsWith("/rest/v1/building_photos"),
      (route) =>
        failReads && route.request().method() === "GET"
          ? serverError(route)
          : route.fallback(),
    );
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
    photoById(state, 1).sort_order = 1;
    photoById(state, 2).sort_order = 0;
    failReads = true;

    await moveButton(section, 3, "앞으로").click();

    await expect(
      page
        .locator(".ku-toast[role='alert']")
        .filter({ hasText: "사진 순서를 바꾸지 못했어요" }),
    ).toBeVisible();
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
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
      seedThreePhotos(state);
      await page.route(swapRequest, (route) =>
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
      await page.goto("/admin/buildings/1");
      const section = photoSection(page);

      await moveButton(section, 3, "앞으로").click();

      await expect(
        page
          .locator(".ku-toast[role='alert']")
          .filter({ hasText: "사진 순서를 바꾸지 못했어요" }),
      ).toBeVisible();
      await expectCaptionOrder(section, ["정문", "로비", "야간"]);
      await expect.poll(() => state.activityReports.length).toBe(1);
      expect(state.activityReports[0]).toMatchObject({
        action: "building_photos.update",
        reason_code: failure.reason,
        target_table: "building_photos",
        target_id: "3",
      });
    });
  }

  test("맞바꾸기를 저장하는 동안에는 사진을 올릴 수 없다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(swapRequest, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await held;
      await route.fallback();
    });
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    const fileInput = section.locator('input[type="file"]');

    await moveButton(section, 3, "앞으로").click();
    await expect(fileInput).toBeDisabled();

    release();
    await expect(fileInput).toBeEnabled();
  });

  test("사진을 올리는 동안에도 화살표를 잠그고, 올린 사진은 맨 뒤에 붙는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/upload-building-photo", async (route) => {
      await held;
      await route.fallback();
    });
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);

    await section
      .locator('input[type="file"]')
      .setInputFiles([
        { name: "새 사진.png", mimeType: "image/png", buffer: PNG },
      ]);
    await expect(moveButton(section, 2, "앞으로")).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    release();
    await expectCaptionOrder(section, ["정문", "로비", "야간", ""]);
    await expect(moveButton(section, 4, "뒤로")).toBeDisabled();
    await expect(moveButton(section, 4, "앞으로")).toBeEnabled();
  });
});
```

- [ ] **Step 2: 테스트를 커밋하고 푸시 C를 한다**

```bash
npx --yes prettier@3.9.4 --write e2e/building-photo-order.spec.ts
git add e2e/building-photo-order.spec.ts
git commit -m "test(e2e): 건물 사진 맞바꾸기 실패와 업로드 중 잠금을 시험한다"
git push
```

Expected(CI): Task 3의 다섯 테스트 초록. 새 테스트 일곱만 실패 — 두 "다시 불러오기"와 "다시 불러오기마저 실패"는 토스트가 없음,
"그 밖의 실패" 둘은 토스트가 없고 순서가 `["정문", "야간", "로비"]`로 남음, "업로드 중 잠금"은 화살표에 `aria-disabled`가 없음,
"저장 중 업로드 막기"는 파일 입력이 켜져 있음.

- [ ] **Step 3: 실패 분기와 업로드 잠금을 넣는다**

`src/components/admin/BuildingPhotoManager.tsx`:

- import의 `@/lib/buildingPhotoOrder`에 `swapFailureAction`을 더한다(`reportFailure`는 이미 import돼 있다).
- `const busy = reordering;` → `const busy = reordering || uploading;`
- "사진 추가" `<label>`의 `data-disabled={uploading}`와 파일 `<input>`의 `disabled={uploading}`를 `busy`로 바꾼다(글자
  `uploading ? "업로드 중..." : "사진 추가"`는 그대로). "실패한 사진 다시 시도" 버튼에 `disabled={busy}`를 단다.
- `fetchPhotos`가 성공 여부를 돌려주고, 실패하면 목록과 설명 초안을 건드리지 않게 한다.

```ts
const fetchPhotos = useCallback(async () => {
  const { data, error } = await supabase
    .from("building_photos")
    .select("*")
    .eq("building_id", buildingId)
    .order("sort_order")
    .order("id");
  // 실패를 빈 목록으로 그리면 사진이 지워진 것처럼 보이고 입력 중인 설명도 사라진다
  if (error) return false;
  setPhotos(data ?? []);
  const initial: Record<string, string> = {};
  (data ?? []).forEach((p) => {
    initial[p.id] = p.caption ?? "";
  });
  setDraftCaptions(initial);
  return true;
}, [buildingId]);
```

- `handleMove`의 `await supabase.rpc(…)` 줄을 바꾼다.

```ts
const { error, status } = await supabase.rpc("swap_building_photo_order", args);
if (error) {
  const action = swapFailureAction(error.code);
  if (action === "reload" && (await fetchPhotos())) {
    showToast("순서가 바뀌어 다시 불러왔어요", "warning");
  } else {
    // 다시 읽기마저 실패하면 서버 순서를 모르니 누르기 전 화면으로 둔다
    setPhotos((current) => swapPhotos(current, args.p_first, args.p_second));
    showToast("사진 순서를 바꾸지 못했어요", "error");
  }
  if (action === "revert") {
    // 브라우저 쓰기 실패를 보고하는 관문(reportingFetch)이 rpc/를 건너뛴다
    void reportFailure({
      source: {
        kind: "postgrest",
        status,
        error: { code: error.code, message: error.message },
      },
      action: "building_photos.update",
      target: { table: "building_photos", id: String(movedId) },
    });
  }
}
setReordering(false);
```

`status`를 넘겨야 `classifyFailure`가 5xx를 `server_error`로 가른다(`failureReason.ts`의 `postgrest` 분기).

- [ ] **Step 4: 설계 두 곳에 옮겨 적는다**

1. `docs/specs/2026-10-25-mentoring-feedback-design.md`
   - 3.2의 "저장 중에는 그 건물의 화살표를 모두 잠가…" 줄 다음에:
     `- **[판단]** 업로드와 맞바꾸기는 서로를 잠근다. 올리는 동안 화살표를, 맞바꾸기 저장 중에는 "사진 추가"와 "실패한 사진 다시 시도"를 잠근다. 업로드가 끝나며 목록을 다시 읽어, 저장 중인 맞바꾸기 앞의 순서로 화면을 덮을 수 있다.`
   - 3.4의 "그 밖의 실패는 화면 순서를 되돌리고 오류 토스트." 줄 다음에:
     - `- **[판단]** 다시 불러오기가 실패하면 서버 순서를 모르니 누르기 전 화면으로 되돌리고 오류 토스트를 띄운다. 사진 칸의 목록 다시 읽기는 실패하면 지금 목록과 입력 중인 설명을 그대로 둔다(업로드·삭제 뒤 다시 읽기도 같다).`
     - `- **[판단]** 되돌린 실패는 활동 기록에 실패로 보고한다(작업 키 `building_photos.update`, 대상은 누른 사진, HTTP 상태 포함). 브라우저 Supabase 쓰기 실패를 보고하는 관문은 `rpc/`를 건너뛰기 때문이다(`docs/specs/2026-10-19-activity-log-design.md`4.3).`PT409`·`P0002`는 다른 관리자가 먼저 바꾼 경합이라 보고하지 않는다.`
2. `docs/specs/2026-10-19-activity-log-design.md` — **먼저 첫 40줄을 읽어** 4장 위에 대체 배너가 없는지 본다. 배너 아래 기록이면 본문을
   고치지 말고 멈추고 보고한다. 아니면 4.3의 "관문을 지나지 않는 실패만 그 자리에서 부른다:" 항목 끝에 덧붙인다:
   `, 건물 사진 맞바꾸기 RPC 실패(`BuildingPhotoManager`— 관문이`rpc/`를 보지 않는다. 경합 오류는 빼며 기준은 `docs/specs/2026-10-25-mentoring-feedback-design.md` 3.4)`

- [ ] **Step 5: 참조 역추적**

바꾼 심볼·문구가 다른 곳에서 옛 내용을 주장하는지 본다. 명령과 출력을 PR 본문 또는 보고에 남긴다.

```bash
rg -n 'order\("created_at"\)' src docs e2e
rg -n "사진 2를 앞으로|rpc/. 제외|rpc/\` 제외" docs src
rg -n "swap_building_photo_order" src e2e docs
```

각 결과가 (a) 이 PR에서 고침, (b) 날짜가 붙은 당시 기록(예: 설계 3.1 "지금"), (c) 무관 중 하나여야 한다.

- [ ] **Step 6: 서식, 커밋, 푸시 D**

```bash
npx --yes prettier@3.9.4 --write src/components/admin/BuildingPhotoManager.tsx docs/specs/2026-10-25-mentoring-feedback-design.md docs/specs/2026-10-19-activity-log-design.md
rg -n "\x{FFFD}" src/components/admin/BuildingPhotoManager.tsx docs/specs/2026-10-25-mentoring-feedback-design.md docs/specs/2026-10-19-activity-log-design.md
git add src/components/admin/BuildingPhotoManager.tsx docs/specs/2026-10-25-mentoring-feedback-design.md docs/specs/2026-10-19-activity-log-design.md
git commit -m "feat: 건물 사진 맞바꾸기가 실패하면 다시 불러오거나 되돌리고 업로드 중에는 잠근다"
git push
gh pr checks --watch
```

Expected: 모든 잡 초록(`Apply Supabase migrations`·`Verify migration history`는 PR에서 건너뜀). 초록이면 Vercel 미리보기 링크를 사용자에게
전하고, PR을 ready로 바꾼다. 병합 직전에 이 계획 문서를 `git rm`하는 커밋을 더한다
(`docs: 구현을 마친 멘토링 PR ①-2 계획 문서를 지운다`).

---

## 병합 뒤 확인

1. Vercel 운영 배포가 끝난 뒤 공개 지도에서 사진이 여러 장인 건물 상세를 연다. ①-1 채우기로 `sort_order` 순서가 올린 순서와 같으니
   사진 순서가 전과 같아야 한다.
2. 관리자 로그인이 필요한 확인은 사용자에게 부탁한다(방문자 키로는 할 수 없다).
   - 사진이 여러 장인 건물 하나에서 ▶ 한 번 → 새로 고침해도 그 순서인지 → ◀로 되돌린다.
   - 활동 기록에 그 건물 사진 "건물 사진 수정"이 맞바꾸기마다 두 줄, 바뀐 칸 "순서"로 남는지(설계 3.3).
   - ①-1에서 남은 확인: 2026-10-25 23:46 KST 근처에 "건물 사진 수정"이 무더기로 쌓이지 않았는지.
3. 설계 맨 위 "진행 상황"을 고치는 docs PR을 낸다(#56과 같은 방식): ①-2 완료(PR 번호·병합 커밋·CI 수치), 다음 할 일은 ②(4장) — 계획
   문서부터. "다음에 할 일 — ①-2" 절은 ② 기준으로 바꾼다.
4. 병합된 브랜치(`feat/building-photo-order-ui`)와 진행 상황에 적힌 정리 대기 원격 브랜치는 사용자 확인 뒤 지운다.
