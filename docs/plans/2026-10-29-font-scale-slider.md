# 글자 크기 슬라이더 구현 계획 (지도 버튼 피드백 PR 2)

> **For agentic workers:** superpowers:executing-plans로 태스크 순서대로 실행한다. 단계는 체크박스(`- [ ]`)로 추적한다. TDD로
> 간다 — 시험을 먼저 쓰고 기대한 이유로 실패하는지 본 뒤 구현한다.

**Goal:** 지도 버튼 열의 `가−`·`가＋` 두 버튼을 이름 붙은 버튼 하나로 바꾼다. 누르면 옆에 슬라이더 칸이 열리고, 90%~150%를 10%씩
일곱 칸으로 끄는 대로 바로 바뀐다. 이미 고른 값(`"small"`·`"large"`)은 이어진다.

**Architecture:** 배율을 거는 틀(`<html data-font-scale>` → `.ku-font-scope`의 `--ku-fs` → `calc(Npx * var(--ku-fs, 1))`)은 그대로
두고, 값만 세 단계 이름에서 백분율 숫자로 바꾼다. `FontScaleControl`은 버튼 + 펼침 칸(`<input type="range">`)이 된다.

**Tech Stack:** Next.js 16.2.4, React 19, Vitest 3, Playwright 1.61.1.

**Spec:** `docs/specs/2026-10-29-map-buttons-feedback-design.md`(이하 "설계 N.N") 4장, `docs/specs/2026-10-28-font-scale-design.md`
(이하 "글자 설계 N.N"). 버튼 모양·단계·저장 값은 설계 4장이 글자 설계(두 버튼·세 단계·`small|normal|large`)를 대신한다. 글자
설계는 4장이 건드리지 않은 것(커지는 글자와 그대로인 글자, `--ku-fs` 틀, 지도 위 이름 다시 재기)에서만 기준이다. 계획과 설계 4장이
다르면 설계가 맞다 — 멈추고 보고한다. 설계 4장은 Task 0에서 이 계획이 정한 것으로 먼저 고친다.

**이 계획의 근거(2026-10-29 측정):**

- 150%에서 넘치는 곳: 임시 시험으로 `--ku-fs`를 1.0·1.2·1.5로 바꿔 가며 검색·필터·즐겨찾기·목록 패널, 경사도 범례와 툴팁, 건물
  상세, 등록 요청·피드백 모달, 시설 팝업의 넘침을 쟀다. 크기는 360×780·740×360·1280×800, 언어는 ko·en이다. 1.0에 없던 넘침이
  1.5에서 새로 생긴 곳은 **없었다**. 잡힌 것은 모두 1.0에도 있던 화면 읽기용 숨김 글(`.ku-visually-hidden`)·피드백 함정 칸·Leaflet
  타일이다. 360 영어 150%를 찍어 보니 필터 칩은 줄을 바꿔 들어가고, 상세의 "Suggest a facility" 버튼은 두 줄로 접히지만 잘리지
  않는다.
  - 모의 데이터와 Windows 글꼴로 잰 값이다. CI 글꼴(DejaVu Sans)에서는 Task 4의 넘침 시험이 다시 본다.
- 버튼 이름 폭(굵게 10px): "Text size"는 Segoe UI 38px, Verdana 50px, DejaVu Sans 41px다. "글자 크기"는 43px, "字号"는 21px다.
  모두 모바일 버튼 56px 안이다.
- Playwright `fill()`은 range에 값을 직접 넣는다. React가 이 값 바꿈을 놓칠 수 있다. 시험은 키보드(Home·End·화살표)와
  마우스·터치 누르기로 움직인다.

## 진행 상황

| 태스크 | 상태 | 커밋       |
| ------ | ---- | ---------- |
| 0      | 완료 | a7bd4d1    |
| 1      | 완료 | 1d98e48    |
| 2      | 완료 | 1d98e48    |
| 3      | 완료 | 1d98e48    |
| 4      | 완료 | 3fd9c0b    |
| 5      | 완료 | 8a77a37    |
| 6      | 완료 | 2ce0606 외 |

## Global Constraints

- 공개 지도에만 건다. 관리자 화면 글자는 어떤 저장 값에서도 바뀌지 않는다(글자 설계 3.3).
- 버튼·슬라이더 칸의 글자는 배율을 따르지 않는다. 끄는 사이에 칸이 커지면 손가락 밑에서 슬라이더가 움직인다(글자 설계 2.2와 같은
  이유).
- 주석은 이유만 쓴다. 커밋은 한국어 `type(scope): 내용`이고 `Co-Authored-By`는 쓰지 않는다. 과정 이야기는 쓰지 않는다. 한글이
  깨졌는지 `rg -n "\x{FFFD}"`로 확인한다.
- 작업 사본에서 `npm run format:check`를 돌리지 않는다. 바꾼 파일만 `npx prettier --check --end-of-line auto <파일>`로 본다.

## 검증 방법

```bash
npm run typecheck
npm run test
npx eslint --ignore-pattern ".claude/**" .
npx prettier --check --end-of-line auto <바꾼 파일>
npx playwright test e2e/font-scale.spec.ts e2e/map-button-labels.spec.ts   # 고치는 동안
```

PR을 열기 전에는 CI와 같은 조건으로 돌린다. 짧은 경로에 LF로 새로 클론한 뒤 `CI=true`로 lint·format:check·typecheck·vitest·전체
Playwright를 돌린다. 넓은 글꼴 확인은 임시 시험으로 한다. `* { font-family: Verdana !important }`를 건 채
`font-scale`·`map-button-labels`를 돌리고, 그 시험 파일은 커밋하지 않는다.

## 브랜치와 PR

`feat/font-scale-slider`(PR 1 #67이 병합된 `main` f0121fb에서). 병합할 때 이 계획 문서를 `git rm`한다.

## 계획이 정한 것

1. **값.** `FONT_SCALES = [90, 100, 110, 120, 130, 140, 150] as const`, `type FontScale = (typeof FONT_SCALES)[number]`(백분율
   정수). 처음은 100이다.
2. **저장 값.** 같은 키 `ku_font_scale`에 숫자 문자열을 쓴다(`"90"`~`"150"`). 100으로 돌아와도 지우지 않고 `"100"`을 쓴다(글자
   설계 3.1과 같다).
   - 읽기: 일곱 숫자 문자열 중 하나와 정확히 같으면 그 값이다. 옛 값 `"small"`은 90, `"large"`는 120, `"normal"`은 100이다(설계
     4.1 **[사용자]**). 그 밖(`null`·`""`·`"95"`·`"160"`·`"1.2"`·`" 120"`·`"LARGE"`)은 100이다.
   - 옛 값을 새 꼴로 고쳐 쓰지 않는다. 사용자가 슬라이더를 움직이면 새 꼴로 바뀐다. 읽기가 옛 값을 계속 받으므로 다시 쓸 까닭이 없다.
3. **배율 거는 방법.** `<html data-font-scale>`에 100이 아닐 때 그 숫자를 건다(`"150"`). 100이면 속성을 지운다. CSS는 여섯 규칙
   `:root[data-font-scale="150"] .ku-font-scope { --ku-fs: 1.5; }`을 쓴다(90·110·120·130·140·150). 나머지 틀은 글자 설계 3.3
   그대로다.
   - 버리는 방법: `<html>`에 `--ku-fs`를 인라인으로 걸기. 변수가 관리자 화면까지 닿아, 함께 쓰는 `FacilityFields`·`.ku-toast`·
     `.bldg-label`이 관리자에서도 커진다. 다른 이름의 변수를 걸고 `.ku-font-scope`에서 옮겨 받는 길도 있지만, 속성 하나가 기준인 지금
     틀(첫 그리기 스크립트·`useSyncExternalStore`·시험)을 바꿀 만큼의 이득이 없다.
4. **첫 그리기 스크립트.** ES5, 감싼 함수. 옛 값을 먼저 숫자로 바꾸고, 100이 아닌 여섯 값과 정확히 맞을 때만 속성을 건다. 정규식은
   `FONT_SCALES`에서 만든다. 단위 시험이 같은 입력 목록으로 스크립트와 `parseStoredFontScale`의 답이 같은지 본다.
5. **버튼.** 1장의 이름 붙은 버튼과 같은 꼴(`ku-map-action ku-map-action--labeled ku-font-scale-trigger`)이다. 아이콘 자리에
   언어별 글자(`가`·`A`·`字`, 새 키 `fontScaleGlyph`, 아이콘과 같은 19px 줄 높이), 아래에 이름(`fontScale`: 글자 크기·Text
   size·字号)을 둔다. 접근 이름은 `fontScale`, `title`은 "글자 크기 120%"다(8). `aria-expanded`가 있고, 열렸을 때만 `aria-controls`가 칸을 가리킨다. 열린
   동안은 눌린 버튼(`aria-pressed="true"`)과 같은 색이다.
   - 자리는 지금과 같다. 웹은 피드백 바로 위, 모바일은 열 맨 위다. 모바일 열 맨 위 줄이 102px에서 56px로 줄어 다른 버튼과 폭이 같아진다.
6. **슬라이더 칸.** `div.ku-font-scale-popover`(`role` 없음, 버튼이 여닫는 칸) 안에 `작은 가` · `<input type="range" min=90
max=150 step=10>` · `큰 가` · `120%`를 놓는다. 양 끝 글자와 값 글은 `aria-hidden`이다. 슬라이더 접근 이름은 `fontScale`,
   `aria-valuetext`는 `"120%"`다.
   - 끄는 대로(`input` 이벤트, React `onChange`) `setFontScale`을 부른다. 지도에 열린 툴팁·팝업은 지금처럼 값이 바뀔 때마다 다시
     잰다(글자 설계 4장). 일곱 칸이라 한 번 끌 때 많아야 여섯 번이다.
   - 열리면 초점이 슬라이더로 간다(언어 목록과 같다). 보장하는 키는 화살표·Home·End다(range 기본 동작, 시험한다). PageUp·PageDown은
     브라우저마다 움직이는 칸 수가 달라 보장하지 않는다.
   - 자리: 세로 열(웹·세로 좁은 화면)에서는 버튼 왼쪽 8px이고, 아래 끝을 버튼에 맞춘다. 폭 240px다. 360px 화면에서 왼쪽 끝은 40px다.
   - 가로 좁은 화면에서는 범례까지 담은 `.ku-map-corner`의 위 8px, 왼쪽 끝에 맞춘다. 이 화면에서 `.ku-map-corner`가
     `position: absolute`이고 `.ku-map-actions`가 `static`이라, `.ku-font-scale`도 `static`으로 두면 칸의 기준 상자가 코너가 된다.
     그러면 경사도를 켜도 범례 위에 열려 범례를 덮지 않는다. 568×320에서 범례가 있어도 칸 위 끝은 어림으로 화면 위에서 75px쯤
     아래다. 칸은 줄 왼쪽에 붙고 언어 버튼은 오른쪽 끝이라 가로로 떨어진다. 시험은 740×360에서 잰다.
   - 웹에서 경사도를 켜도 칸은 범례 바로 위(2.6px 틈)에 열려 덮지 않는다. 구현 뒤 headless 화면으로 확인했다. 높이가 모두 px라
     글꼴과 배율에 상관없다. 시험은 펼침 자리에서 경사도를 켜고 본다.
7. **닫기.** 버튼을 다시 누름, 바깥 `pointerdown`, Esc, 초점이 칸 밖 요소로 감(`focusin`이 바깥에서 남). Esc는 `preventDefault`로
   열린 지도 메뉴 패널이 같은 Esc에 닫히지 않게 하고(`useMapMenu`가 `defaultPrevented`를 본다), 초점을 버튼으로 돌려준다.
   - `focusout` 대신 바깥 `focusin`을 쓴다. 칸 안 글자(값·양 끝 글자)를 누르면 초점이 `body`로 가 `focusout`의 `relatedTarget`이
     비고, 그러면 칸이 닫혀 버린다.
   - 모바일에서 상세 시트·메뉴 패널이 열리면 열이 숨는다. 여는 손짓이 모두 칸 바깥 `pointerdown`이거나 초점 이동이라 칸은 그 전에
     닫힌다. 시험이 확인한다(Task 3).
8. **읽어 주는 글.** 숨김 상태 글(`aria-live`)과 버튼의 `aria-describedby`를 없앤다. 슬라이더가 값을 스스로 읽어 준다. 버튼에
   초점만 두었을 때는 `title`("글자 크기 120%")이 설명으로 읽힌다. 칸을 열면 초점이 간 슬라이더가 "글자 크기, 120%"를 읽는다.
9. **번역 키.** 지우는 키: `fontScaleDown`·`fontScaleUp`·`fontScaleDownGlyph`·`fontScaleUpGlyph`·`fontScaleStatusSmall`·
   `fontScaleStatusNormal`·`fontScaleStatusLarge`. 더하는 키: `fontScaleGlyph`(가·A·字).

---

## Task 0: 설계 4장을 먼저 고친다

- [ ] `docs/specs/2026-10-29-map-buttons-feedback-design.md` 4장을 고친다.
  - 4.2의 "제안"을 이 계획이 정한 것(1~9)으로 바꾸고 **[판단]**으로 표시한다.
  - "계획에서 정할 것" 문단을 지운다.
  - 첫머리에 "버튼 모양·단계·저장 값은 이 장이 `2026-10-28-font-scale-design.md`를 대신한다"를 적는다.
- [ ] 커밋: `docs: 글자 크기 슬라이더의 모양·값·닫기를 설계에 정한다`

## Task 1: 값·저장·첫 그리기 (`src/lib/fontScale.ts`, `src/lib/useFontScale.ts`)

**Files:** `src/lib/fontScale.ts`, `src/lib/useFontScale.ts`, `src/lib/fontScale.test.ts`

- [ ] **RED** `fontScale.test.ts`를 새 값으로 고친다.
  - `FONT_SCALES`가 `[90, 100, 110, 120, 130, 140, 150]`이다.
  - `parseStoredFontScale`: 일곱 숫자 문자열 → 그 수. `"small"` → 90, `"large"` → 120, `"normal"` → 100. `null`·`""`·`"95"`·
    `"160"`·`"80"`·`"1.2"`·`" 120"`·`"120.0"`·`"LARGE"`·`"__proto__"` → 100.
  - `FONT_SCALE_INIT_SCRIPT`: 위 입력 전부에 대해 걸린 속성이 `parse(value) === 100 ? null : String(parse(value))`와 같다.
    `getItem` 예외는 `null`이고 밖으로 나오지 않는다.
  - `setFontScale(150)`: 속성 `"150"`, 저장 `"150"`, 구독자 한 번. `setFontScale(100)`: 속성 없음, 저장 `"100"`. `setItem` 예외에도
    속성은 바뀐다.
  - `scaledFontSize`는 그대로다.
  - `npx vitest run src/lib/fontScale.test.ts` — 새 단언이 실패하는지 본다.
- [ ] **GREEN** 구현한다.

  ```ts
  export const FONT_SCALES = [90, 100, 110, 120, 130, 140, 150] as const;
  export type FontScale = (typeof FONT_SCALES)[number];
  export const DEFAULT_FONT_SCALE: FontScale = 100;
  /** 세 단계였을 때 저장한 값(설계 4.1) */
  const LEGACY_FONT_SCALES: Record<string, FontScale> = {
    small: 90,
    normal: 100,
    large: 120,
  };

  export function parseStoredFontScale(value: string | null): FontScale {
    if (value === null) return DEFAULT_FONT_SCALE;
    if (Object.hasOwn(LEGACY_FONT_SCALES, value))
      return LEGACY_FONT_SCALES[value];
    return (
      FONT_SCALES.find((scale) => String(scale) === value) ?? DEFAULT_FONT_SCALE
    );
  }
  ```

  - 스크립트는 `if(s==="small")s="90";else if(s==="large")s="120";if(/^(90|110|120|130|140|150)$/.test(s))…setAttribute("data-font-scale",s)`
    꼴이다. 정규식의 숫자 목록은 `FONT_SCALES.filter((scale) => scale !== DEFAULT_FONT_SCALE).join("|")`로 만든다.
  - `useFontScale.ts`: `setFontScale(scale)`는 100이면 속성을 지우고 아니면 `String(scale)`을 건다. 저장은 `String(scale)`이다.
    `useFontScale()`의 서버 값은 `DEFAULT_FONT_SCALE`이다.

- [ ] 이 태스크의 성공 기준은 `npx vitest run src/lib/fontScale.test.ts` 통과뿐이다. `npm run typecheck`는 아직 돌리지 않는다.
      `FontScaleControl`이 옛 타입을 써서 깨지고, 그것은 Task 3에서 고친다. 커밋은 Task 3과 합친다. 중간 커밋이 타입 검사를 깨지 않게
      하려는 것이다.

## Task 2: 배율 규칙 (`map-ui.css`)

- [ ] `:root[data-font-scale="small"|"large"]` 두 규칙을 여섯 규칙(90·110·120·130·140·150)으로 바꾼다. 주석은 "값은 공개 화면
      뿌리에만 건다"를 남긴다.
- [ ] 이 규칙의 시험은 Task 4의 배율 시험이다. 저장 값 `"150"`·`"90"`으로 열어 대표 글자가 1.5배·0.9배인지 본다.

## Task 3: 버튼과 슬라이더 칸 (`FontScaleControl.tsx`, 번역, CSS)

**Files:** `src/components/map/FontScaleControl.tsx`, `src/lib/translations.ts`, `src/components/map/map-ui.css`,
`e2e/font-scale.spec.ts`(버튼 묶음)

- [ ] **RED** `e2e/font-scale.spec.ts`의 "글자 크기 — 버튼" 묶음을 새로 쓴다. 도우미는 다음과 같다.
  - `trigger(page, name = "글자 크기")`: `.ku-map-actions`의 `getByRole("button", { name, exact: true })`
  - `slider(page, name = "글자 크기")`: `getByRole("slider", { name, exact: true })`
  - `setScale(page, percent)`: 칸을 열고, 슬라이더에 초점을 두고, Home을 누른 뒤 `(percent - 90) / 10`번 ArrowRight를 누르고, Esc로
    닫는다.
  - 시험:
    - 처음: `<html>`에 속성이 없다. 버튼 `aria-expanded="false"`, 글자 `가`, 이름 `글자 크기`이고 칸이 없다.
    - 세 자리(접힌 줄·펼침·모바일 390×844)에서 열 버튼 이름 차례가 맞다.
      - 웹: `… · 글자 크기 · 피드백 보내기`
      - 모바일: `글자 크기 · 현 위치 · 위성 지도로 전환 · 경사도 · 피드백 보내기`
    - 세 자리 모두에서 키보드로 버튼을 누르면 칸이 열리고 슬라이더에 초점이 간다(값 `100`, `aria-valuetext` `100%`). 이어서 아래를 본다.
      - ArrowRight → 속성 `"110"`, 저장 `"110"`, 보이는 값 `110%`
      - End → `"150"`
      - Home → `"90"`
      - 90에서 ArrowLeft → 그대로
      - Esc → 칸이 닫히고 초점이 버튼에 있다. 접힌 줄에서 열어 둔 필터 패널은 그대로 열려 있다.
    - 칸 자리: 세 곳 모두 화면 안이고 지도 버튼을 덮지 않는다.
      - 웹·모바일 390: 칸의 오른쪽 끝이 버튼 왼쪽 끝 이하다.
      - 가로 740×360: 경사도를 켠 채 열면 칸 아래 끝이 범례 위 끝 이하다. 범례와 겹치지 않는다.
    - 닫기: 버튼을 다시 누름, 지도를 누름, Tab으로 칸 밖으로 나감. 칸 안 값 글자를 눌러도 닫히지 않는다.
    - 마우스로 슬라이더 오른쪽 끝을 누르면 150이다.
    - 터치(`test.use({ hasTouch: true })`, 390×844): 버튼을 `tap()`하면 열리고, 슬라이더 오른쪽 끝을 `tap()`하면 150이다. 지도를
      `tap()`하면 닫힌다. 끄는 손짓은 Playwright에 터치 끌기가 없어 시험하지 않고, 사람이 실제 휴대폰에서 본다(Task 6).
    - 모바일 390: 칸을 연 채 아래 줄 "검색"을 누르면 칸이 닫히고, 패널을 닫은 뒤에도 닫혀 있다.
    - 옛 저장 값: `"small"` → 속성 `"90"`·슬라이더 90, `"large"` → `"120"`, `"normal"` → 속성 없음·100.
    - en·zh: 버튼 이름 `Text size`·`字号`, 글자 `A`·`字`, 슬라이더 이름이 같다.
    - 첫 그리기 전(앱 JS를 막고 연다): 저장 `"130"` → 속성 `"130"`. 옛 값 `"large"` → `"120"`. 다크도 함께 걸린다.
    - 저장소 예외: 100으로 열린다. 슬라이더를 움직이면 속성이 바뀌고 `pageerror`가 없다.
  - `npx playwright test e2e/font-scale.spec.ts -g "버튼"` — 새 시험이 실패하는지 본다(옛 두 버튼이라 이름 붙은 버튼·슬라이더가
    없다).
- [ ] **GREEN** 구현한다.
  - 번역: 계획이 정한 것 9.
  - `FontScaleControl`: `open` 상태, 바깥 `pointerdown`·`focusin`과 `keydown`(Esc) 문서 수신기는 열린 동안만 둔다. 꼴은
    `LanguageSwitcher`와 같다. 열릴 때 슬라이더에 초점을 준다. 감싸는 요소는 지금 클래스 `.ku-font-scale`을 그대로 쓴다. 다른 시험의
    `openMap`이 이 클래스를 기다린다. `role="group"`은 없앤다.
  - CSS: `.ku-font-scale { position: relative; }`.
    - `.ku-font-scale-glyph`는 `font-size: 18px; font-weight: 700; line-height: 19px`이고 배율을 따르지 않는다.
    - `.ku-font-scale-trigger[aria-expanded="true"]`는 눌린 버튼과 같은 색이다.
    - `.ku-font-scale-popover`는 다음과 같다.
      - `position: absolute; right: calc(100% + 8px); bottom: 0; z-index: 1`
      - `display: flex; align-items: center; gap: 8px; width: 240px; padding: 6px 12px`
      - `background: var(--ku-map-control)`, 테두리·그림자는 열 버튼과 같은 토큰
    - 슬라이더는 `flex: 1; min-width: 0; height: 32px; margin: 0; accent-color: var(--ku-crimson-700)`이다.
    - 값 글은 `min-width: 4ch; text-align: right; font-variant-numeric: tabular-nums`다.
    - 가로 좁은 화면(모바일 블록의 가로 규칙)에서는 `.ku-font-scale { position: static; }`이다. 칸은
      `right: auto; left: 0; bottom: calc(100% + 8px)`이고, 기준 상자는 `.ku-map-corner`다(계획이 정한 것 6).
  - 옛 `.ku-font-scale-button*` 규칙을 지운다.
- [ ] `npx playwright test e2e/font-scale.spec.ts -g "버튼"`, `npx vitest run`, `npm run typecheck`.
- [ ] 커밋(Task 1~3): `feat: 글자 크기를 버튼 하나와 90~150% 슬라이더로 바꾼다`

## Task 4: 배율이 닿는 곳·넘침 시험을 150%로

**Files:** `e2e/font-scale.spec.ts`(나머지 묶음)

- [ ] 상수 `LARGE = 1.2`를 `MAX = 1.5`로 바꾼다. `larger(page).click()`·`smaller(page).click()`은 `setScale(page, 150)`·
      `setScale(page, 100)`으로 바꾼다.
  - `expectScaled`·`expectScaledAcrossReopen`이 쓰는 restore(검색 결과 다시 열기, 범례 툴팁 다시 열기)는 그대로 둔다.
  - `setScale`은 Esc로 칸을 닫는다. 그 Esc가 다른 곳을 닫지 않는지는 이렇게 본다.
    - 검색 결과 목록과 범례 툴팁은 칸을 열려고 버튼을 누르는 순간 이미 닫힌다. 검색 결과는 검색창 blur로, 툴팁은 바깥
      `pointerdown`으로 닫힌다. 지금처럼 restore가 다시 연다.
    - 지도 메뉴 패널은 Esc `preventDefault`로 남는다(Task 3 시험).
    - 상세 패널에는 Esc 수신기가 없다.
- [ ] 강조 시험 단언 `13.2px` → `16.5px`(11 × 1.5), 팝업 폭 시험 `13 * LARGE` → `13 * MAX`.
- [ ] 저장 값 `"90"`으로 열면 건물 상세 제목이 0.9배인 시험 하나를 더한다(작은 끝 규칙).
- [ ] "그대로인 글자"에 버튼 글자(`.ku-font-scale-glyph`)·버튼 이름을 넣는다. 150%에서 칸을 연 채 칸 글자(양 끝 글자·값)가 100%에서
      연 칸과 같은 크기인지도 본다.
- [ ] 넘침 묶음을 넓힌다. 지금은 360×780 한국어 120%이고 가로 넘침(`scrollWidth ≤ clientWidth`)과 문서 폭만 본다.
  - 저장 값은 `"150"`, 언어는 ko·en, 크기는 360×780·740×360이다.
  - 대상은 검색·필터(칸을 다 연 뒤)·즐겨찾기·목록 패널, 건물 상세, 등록 요청·피드백 모달, 경사도 범례다.
  - 지금 단언(가로 넘침·문서 폭·칩 잘림)에 잘린 글 찾기(`clippedText(region)`)를 더한다. 대상 안 요소 가운데 아래 조건을 모두
    갖춘 것을 모은다. 빈 목록이어야 한다. 측정 때 쓴 셈과 같다.
    - 스크롤 상자가 아니다(`overflow`가 `auto`·`scroll`이 아니다).
    - 세로로 자른다(`overflow-y`가 `visible`이 아니다)면서 `scrollHeight > clientHeight + 1`이거나, `scrollWidth > clientWidth + 1`이다.
  - `clippedText`가 빼는 것: 일부러 자르는 글(`-webkit-line-clamp`가 걸린 것, `text-overflow: ellipsis`인 것), 숨김 글
    (`.ku-visually-hidden`), 피드백 함정 칸(`.ku-feedback-honeypot`), 모달 안 위치 지도(`.leaflet-container`와 그 안).
  - 형제끼리 겹치는지는 보지 않는다. 넘침 없이 겹치려면 절대 위치 글이 있어야 하는데, 대상 안에서 절대 위치로 놓인 글은 범례
    눈금뿐이다. 눈금은 기존 시험이 이미 본다.
- [ ] 범례가 버튼을 덮지 않는 단언, 667×375에서 버튼이 언어 버튼과 겹치지 않는 단언은 `scaleGroup` 대신 글자 크기 버튼을 기준으로
      쓴다. 360 150%에서 칸이 화면 안이고 버튼을 덮지 않는 단언도 더한다.
- [ ] `e2e/mobile-fixes.spec.ts` MOB-16(영어 긴 이름 두 줄)의 저장 값을 `"large"`에서 `"150"`으로 바꾼다. 이름은
      `-webkit-line-clamp: 2`(`map-ui.css` `.ku-map-browse-copy strong`)라 150%에서도 두 줄이어야 한다.
- [ ] 관리자 시험은 저장 값 `"150"`으로 바꾸고, 옛 `"large"`도 한 번 본다.
- [ ] `npx playwright test e2e/font-scale.spec.ts`. 넘침이 나오면 그 자리를 고치고 고친 곳을 설계 4장에 적는다. 측정으로는 없을
      것으로 본다.
- [ ] 커밋: `test: 글자 크기 시험을 150%까지 넓힌다`

## Task 5: 다른 시험·모의 백엔드

**Files:** `e2e/support/mockBackend.ts`, `e2e/map-button-labels.spec.ts`, `e2e/theme.spec.ts`, `e2e/public-map.spec.ts`

- [ ] `mockBackend` 옵션 `fontScale`의 타입을 `"small" | "normal" | "large" | \`${FontScale}\``로 넓힌다. 저장 값이 없을 때만 넣는
      것은 그대로다.
- [ ] `map-button-labels.spec.ts`의 `LABELED` 맨 앞에 글자 크기 버튼 이름(글자 크기·Text size·字号)을 더한다. 모바일 열 맨 위라 DOM
      차례로도 처음이다. 이 시험이 새 버튼도 56px 칸 안·같은 폭인지 보게 된다.
- [ ] `theme.spec.ts` 펼침 토글 시험의 끝 이름을 `위성 지도로 전환 · 경사도 · 다크모드 · 글자 크기 · 피드백 보내기`(끝 다섯)로 바꾼다.
- [ ] `public-map.spec.ts` 모바일 범례 시험 주석에서 "글자 크기 줄이 열 상자를 넓힌다"를 지운다. 버튼별 비교는 그대로 맞다.
- [ ] `npx playwright test e2e/map-button-labels.spec.ts e2e/theme.spec.ts e2e/public-map.spec.ts e2e/mobile-fixes.spec.ts`
- [ ] 커밋: `test: 글자 크기 버튼 하나에 맞춰 지도 버튼 시험을 고친다`

## Task 6: 문서·검증·PR

- [ ] `docs/specs/2026-10-29-map-buttons-feedback-design.md` 4장 4.3에 시험을 적는다. Task 4에서 고친 넘침이 있으면 그것도 적는다.
- [ ] 날짜를 단 메모(`2026-10-29 …`, 지금 값과 설계 4장을 가리킨다)를 단다.
  - `docs/specs/2026-10-28-font-scale-design.md`: 결정 요약 표의 버튼·배율·상태, 1.1, 1.2의 "두 버튼을 가로로 붙인 줄", 2.3, 3.1의 타입·저장
    값, 3.2 스크립트 꼴, 5.2
  - `docs/specs/2026-10-25-mentoring-feedback-design.md` 8.1: 세 단계, 두 버튼, 비율
- [ ] 메모리 `korea-univ-map-buttons-feedback.md`를 갱신한다.
- [ ] 검증 방법대로 LF 클론 `CI=true` 전체와 Verdana 임시 확인을 돌린다.
- [ ] Codex 코드 리뷰(read-only, background, `-Out`) → 지적을 확인해 반영한다.
- [ ] 커밋: `docs: 글자 크기 슬라이더 시험을 설계에 적고 옛 설계에 메모를 단다`. push하고 PR을 연다. 본문에는 요약, 바뀐 것, 결정,
      시험 증거, 사람이 볼 것을 쓴다.
  - 사람이 볼 것: 실제 휴대폰(특히 iPhone Safari)에서 끌기 감, 끄는 동안 지도·페이지가 움직이지 않는지, 칸 위치, 150%에서 실제
    데이터의 긴 이름.
  - 시험 범위 밖이라고 밝힌다: 이 저장소의 Playwright는 Desktop Chrome 한 프로젝트다(`playwright.config.ts`). WebKit·Firefox
    프로젝트를 더하는 것은 CI 설치·시간이 드는 별도 결정이라 이 PR에서 하지 않는다.
