# 경사도 보기 패널의 판정 → 배지 색 짝이 행 배지와 따로 적혀 있다

`src/components/admin/slopes/SlopeViewPanel.tsx`의 `GRADE_TONES`는 구간 표의 판정 배지 색(`data-tone`)을 판정마다 정한다.
같은 판정 → tone 짝을 행 배지의 `slopeRouteBadge`(`src/lib/slopeWorkspace.ts`)가 따로 분기로 적는다. 한쪽만
바꾸면 목록 행과 보기 패널의 같은 판정이 다른 색으로 보인다.

## 막힌 이유

**차단 사유 없음.** 두 곳 모두 같은 PR에서 써서 지금은 맞는다. 뒤로 미뤘다.

## 트리거

- 판정이나 배지 tone을 더하거나 바꿀 때

## 착수 시 정할 것

- **둘 자리.** `src/lib/slopeScale.ts`(판정과 판정 색)에 `SLOPE_GRADE_TONES`로 둘지, `slopeWorkspace.ts`에 두고
  `slopeRouteBadge`도 그것을 쓰게 할지. tone 이름은 관리자 배지 CSS(`.ku-row-badge[data-tone]`)의 값이라 관리자 화면 쪽인
  `slopeWorkspace.ts`가 맞다(공개 지도는 판정 tone을 쓰지 않는다).
- **확인 방법.** `slopeWorkspace.test.ts`의 `slopeRouteBadge` 단언이 그대로 통과한다. 구간 표 배지의 tone은 지금 e2e가
  보지 않으니(2026-10-15 `rg data-tone e2e/admin-slopes-workspace.spec.ts`는 토스트만 건다) 옮길 때 단언을 더할지 정한다.

## 출처

2026-10-15 — 관리자 지도 우선 리디자인 ③(경사도), `src/components/admin/slopes/SlopeViewPanel.tsx`.
