# 경로 요약의 경계가 다른 파일의 "두 점 이상" 불변식에 기대 non-null 단언을 쓴다

`src/lib/slopeWorkspace.ts`의 `summarizeSlopeRoute`는 `bounds: verticesBounds(vertices)!`로 경계를 만든다.
`verticesBounds`는 꼭짓점이 없으면 `null`을 돌려준다(`slopeWorkspace.test.ts`가 단언한다). 요약이 그 `null`을 받지 않는
근거는 `readRoutePoints`(`src/lib/slopeRoute.ts`)가 점이 둘보다 적은 경로를 `null`(형식 오류)로 돌려준다는 다른 파일의
불변식이다. 그 조건이 바뀌어 빈 경로가 통과해도 타입 검사는 알리지 않고, 요약의 `bounds`가 `null`인 채 지도 focus까지
간다.

## 막힌 이유

**차단 사유 없음.** 지금 `readRoutePoints`는 그 불변식을 지키고, 고치는 방법(타입으로 드러낼지, 요약에서 막을지)을 고르는
일을 ③의 범위 밖으로 두어 뒤로 미뤘다.

## 트리거

- `readRoutePoints`나 저장 포맷 검증(`slopeRoute.ts`)을 바꿀 때

## 착수 시 정할 것

- **불변식을 어디에 둘지.** `readRoutePoints`가 점이 둘 이상인 것을 타입으로 돌려주게 할지(튜플 타입), `summarizeSlopeRoute`가
  `verticesBounds`의 `null`을 형식 오류(`null` 요약)로 바꿀지. 앞쪽은 단언이 사라지고, 뒤쪽은 그 경로를 `형식 오류` 배지로
  보인다(설계 2026-10-14 6.2).
- **확인 방법.** 점이 없거나 하나인 `segments`로 `summarizeSlopeRoute`를 부르는 단위 테스트가 형식 오류(`null`)를
  단언하게 한다.

## 출처

2026-10-15 — 관리자 지도 우선 리디자인 ③(경사도), `src/lib/slopeWorkspace.ts`.
