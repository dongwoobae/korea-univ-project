# strict 타입 복구와 서버 로깅 규칙

2026-08-14

## 배경

`tsconfig.json`이 `strict: true` 뒤에 `noImplicitAny: false`를 두어 strict의 절반이 꺼져 있었다. TS 전환(PR #3, 2026-07-09)의 과도기 잔재다. 이 상태에서 "명시적 `any` 0건"은 **암묵적 any가 검사를 그냥 통과했기 때문**이지 타입이 촘촘해서가 아니었다.

플래그 제거 시 162건이 드러났고(TS7006 102 · TS7031 54 · TS7053 4 · TS7008 2), 처리 과정에서 런타임 결함 둘을 잡았다.

## 확정한 규칙

### 1. `noImplicitAny`를 다시 끄지 않는다

`tsconfig.json`에서 `strict` 아래에 개별 strict 플래그를 끄는 항목을 두지 않는다. 특정 파일이 걸리면 그 파일에서 타입을 좁힌다.

### 2. 서버 로그는 실패만 남긴다

로그 싱크(집계·검색·보존)가 없어 stdout이 유일한 출력이다. 이 조건에서:

- **성공 로그를 두지 않는다.** 응답과 액세스 로그가 이미 말한다.
- **진입 로그를 두지 않는다.** 실패 경로의 `console.error`가 같은 태그로 식별자를 다시 남긴다.
- `console.error`는 태그(`[route-name]`)를 앞에 붙인다.

`eslint.config.mjs`의 `no-console`(error, `warn`·`error` 허용)이 이 규칙을 강제한다. `src/scripts/**`는 stdout이 UI라 예외다.

로깅 유틸을 만들지 않은 이유: 호출부가 소수이고 싱크가 없어 `console.error` 래퍼 한 겹에 그친다.

### 3. 폼 파일 필드는 `instanceof File`로 가른다

`request.formData().get(name)`은 `File | string | null`이다. 존재 여부(`!file`)만 보고 `arrayBuffer()`를 부르면 클라이언트가 문자열을 실었을 때 500이 난다. 400으로 돌려준다.

`upload-building-photo`, `upload-facility-video`에 적용.

### 4. 건물 피처 형상은 `types/domain.ts`의 `BuildingFeature` 하나만 본다

`/api/buildings`가 돌려주는 폴리곤 피처를 `Map`과 `SearchControl`이 각자 알고 있었다. 한쪽만 고치면 다른 쪽이 조용히 어긋난다.

## 유지한 느슨함과 그 이유

- **`Toast`의 `type`은 `string`.** 호출부가 `STYLES`에 없는 `"info"`를 넘긴다(위치 안내·즐겨찾기 저장 안내). `STYLES[type] ?? STYLES.success` 폴백이 load-bearing이라 좁은 유니온으로 조이면 그 호출부가 깨진다. 그 결과 `"info"` 토스트는 초록 success 스타일로 그려진다 — 의도 여부 미확인.
- **`LanguageContext.t`의 키는 `string`.** `LanguageContextValue.t: (key: string) => string`이 선언된 계약이다. 조회 지점에서 사전을 `Record<string, string | undefined>`로 본다.
- **`SlopePoint.ele`는 `number | null`.** DB 컬럼이 nullable이다. 계산 지점에서 `?? 0`으로 떨어뜨리며, 이는 기존 JS 동작(`null - 5 === -5`)과 같다.

## 관리자 건물 상세 페이지 분해

`src/app/admin/buildings/[id]/page.tsx` 1339 → 478줄. 경계는 **화면 카드**를 따랐다 — 파일 안 JSX 주석이 이미 그 경계를 표시하고 있었고 각 카드가 쓰는 상태가 겹치지 않았다.

- `components/admin/BuildingPhotoManager.tsx` — 같은 파일 안의 두 번째 컴포넌트였다.
- `lib/imageToWebP.ts` — canvas 리사이즈·WebP 변환. React 상태를 안 봐서 뗐다.
- `components/admin/building-detail/` — 헤더·건물명·단과대·폴리곤·시설목록 카드 5개.

폴리곤 카드의 저장(supabase 갱신 + 이웃 캐시 무효화)은 페이지의 `handleSavePolygon`에 남겼다. 카드에 넘기면 카드가 supabase를 알아야 한다.

**DOM 구조·`id`·클래스명을 바꾸지 않았다.** e2e 6개 스펙이 이 화면의 DOM에 걸려 있어 이것이 분해의 안전 조건이었다. 앞으로 이 카드들을 손볼 때도 같다.

공통 `DetailCard` 래퍼는 만들지 않았다. 카드 5개가 같은 인라인 스타일을 복제하지만 폴리곤 카드 헤더만 구조가 달라, 억지로 맞추면 DOM이 바뀔 위험이 이득보다 크다.
