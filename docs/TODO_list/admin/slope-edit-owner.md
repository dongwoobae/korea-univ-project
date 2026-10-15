# 경사도 편집 owner 문자열을 세 곳에서 따로 만들고, 같은 owner로 다시 열면 한 렌더 동안 낡은 초안을 쓴다

편집 패널과 편집 지도는 형제라 페이지를 거쳐 초안(`SlopeEditDraft`)과 편집기 손잡이(`SlopeEditorHandle`)를 주고받고,
owner가 지금 편집 상태와 다르면 낡은 것으로 버린다(설계 2026-10-14 6.4). 그 owner(`edit:{id}`·`edit:new`)를 세 곳이
각자 만든다(2026-10-15 `rg`로 센 자리).

- `src/app/admin/dashboard/slopes/page.tsx`의 `editOwner`
- `src/components/admin/slopes/SlopeEditPanel.tsx`의 `owner`
- `src/components/slope/SlopeRouteMap.tsx`의 `owner`

한 곳의 형식만 바뀌면 초안·손잡이가 늘 낡은 것으로 버려져 미리보기와 도구 바가 조용히 사라진다.

같은 owner로 다시 열 때(경로 2 편집 → 보기 → 다시 경로 2 편집) 페이지의 `draft` 상태에는 앞 패널이 마지막으로 내놓은
초안이 남아 있다. owner가 같아 `activeDraft`가 그것을 통과시키므로, 새 패널이 첫 effect에서 초안을 내놓기 전 한 렌더
동안 편집 지도가 앞 초안(구간 값·잠금)을 받는다.

## 막힌 이유

**차단 사유 없음.** 낡은 초안은 새 패널의 첫 effect가 바로 덮어 한 렌더에 그치고(화면에 드러나는지는 확인하지 않았다),
세 곳의 형식은 지금 같아 뒤로 미뤘다.

## 트리거

- owner 형식을 바꾸거나, 편집 상태를 하나 더(예: 복제해서 새로 만들기) 둘 때
- 다시 연 편집에서 앞 초안의 값이나 잠금이 잠깐이라도 보인다는 보고가 나올 때

## 착수 시 정할 것

- **owner를 만드는 곳.** 페이지가 만들어 패널과 지도에 props로 넘길지, `src/components/slope/types.ts`에 함수 하나를
  두고 셋이 부를지. 앞쪽은 지도와 패널이 owner를 스스로 알 필요가 없어진다.
- **낡은 초안 끊기.** 패널이 사라질 때(정리) 페이지의 `draft`를 거두게 할지, owner에 열 때마다 바뀌는 세대 값을 붙일지.
  세대를 붙이면 owner 비교만으로 막히지만, 같은 경로를 다시 연 것을 owner로 가르던 다른 자리(전체 지도의 owner)도
  같이 봐야 한다.

## 출처

2026-10-15 — 관리자 지도 우선 리디자인 ③(경사도), `src/app/admin/dashboard/slopes/page.tsx`.
