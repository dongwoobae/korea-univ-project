# 공개 지도의 `MapViewportObserver`가 가끔 `Maximum update depth exceeded`를 낸다

공개 지도(`src/components/map/Map.tsx`)는 `MapViewportObserver`(`src/components/map/MapViewportObserver.tsx`)가
`moveend`·`zoomend`와 마운트 effect에서 `publish`로 지도 범위를 `onChange`(`setViewport`)에 올린다. 2026-10-15 CI 조건
재현(Windows, Node 24, `CI=true`, `--retries=0`)의 개발 서버 로그에 브라우저 콘솔 오류가 한 번 찍혔다.

```text
Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, ...
    at MapViewportObserver[publish]
```

`e2e/admin-slopes-workspace.spec.ts`의 `편집기에서 저장한 경로가 공개 지도에 그대로 그려진다` 직후다. 그 시나리오만
`--repeat-each=8`로 돌리면 브랜치 `feat/admin-map-first-slopes`에서 8번 중 1번, main `9594602`의 같은 시나리오
(`admin-buildings-slopes.spec.ts`)에서 8번 중 0번 났다. 테스트는 모두 통과했다.

## 막힌 이유

**원인을 가르지 못했다.** 브랜치는 `src/components/map/`을 바꾸지 않았다. 두 시나리오는 새 경로를 그리는 화면 좌표가
달라(옛 편집기 → 작업 화면의 편집 패널) 공개 지도에 놓이는 경로 자리가 다르다. 데이터 차이로 드러난 기존 결함인지,
브랜치가 만든 것인지 모른다. 재현이 드물어(8번 중 1번) 한 번 돌려서는 고쳤는지도 알 수 없다.

## 트리거

- 공개 지도에서 같은 오류가 다시 찍히거나, 사용자에게 지도가 멈추는 증상이 보고된다
- 공개 지도의 범위 관찰(`MapViewportObserver`·`setViewport`를 쓰는 쪽)을 손볼 때

## 착수 시 정할 것

- **재현 조건.** 그 시나리오가 그리는 경로 자리를 main의 좌표로 바꿔 브랜치에서 돌려 보고, 반대로도 돌려 본다.
  데이터 차이로 갈리면 기존 결함이다.
- **고리의 정체.** `publish`가 부르는 `setViewport`가 다시 지도를 옮기는 무언가(맞춤·패널 여백)를 부르는지,
  `onChange`가 렌더마다 바뀌어 마운트 effect가 다시 도는지. 앞이면 범위가 같을 때 올리지 않는 비교를, 뒤면 콜백을
  고정하는 쪽을 고른다.
- **확인 방법.** 드물게 나므로 고친 뒤 `--repeat-each`를 넉넉히 주고 개발 서버 로그의 `[browser]` 줄을 센다.

## 출처

2026-10-15 — 관리자 지도 우선 리디자인 ③(경사도) 브랜치 e2e의 개발 서버 로그.
