# 작업 화면 e2e의 저장 안 한 변경 헬퍼가 spec마다 복제돼 있다

저장 안 한 변경 확인(`UnsavedChangesGuard`)을 보는 시나리오가 독립 시설·명소·경사도 spec에 각각 있고, 같은 헬퍼를
각 파일의 `저장 안 한 변경` describe 안에 따로 둔다(2026-10-15 `rg`로 센 자리).

| 헬퍼            | 있는 파일                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `LEAVE_TITLE`   | `e2e/admin-facilities-workspace.spec.ts`, `admin-landmarks-workspace.spec.ts`, `admin-slopes-workspace.spec.ts` |
| `leaveDialog`   | `admin-landmarks-workspace.spec.ts`, `admin-slopes-workspace.spec.ts`                                           |
| `unloadBlocked` | 세 파일 모두                                                                                                    |

확인 창 제목이나 `beforeunload` 판정 방식이 바뀌면 세 파일을 같이 고쳐야 하고, 하나를 빠뜨려도 그 파일의 시나리오가
실패할 때까지 드러나지 않는다.

## 막힌 이유

**차단 사유 없음.** 각 PR이 자기 탭의 spec만 다뤄, 공용 파일로 빼면 앞 PR의 spec까지 건드리게 돼 미뤘다.

## 트리거

- 제보함(PR ④)이 같은 가드 시나리오를 넷째로 더할 때
- 확인 창 문구나 가드의 판정 방식을 바꿀 때

## 착수 시 정할 것

- **둘 자리.** `e2e/support/`에 가드 헬퍼 파일을 둘지(`mockBackend.ts` 옆), 기존 `mockBackend.ts`에 더할지.
  가드는 목 백엔드와 상관없어 따로 두는 편이 맞다.
- **같이 옮길 것.** 가드 말고도 작업 화면 spec 둘 이상에 같은 이름으로 정의된 헬퍼가 있는지 같은 방식으로 센다.
- **확인 방법.** 옮긴 뒤 세 spec이 그대로 통과하는지 보고, 헬퍼 이름으로 `rg`해 남은 복제가 없는지 본다.

## 출처

2026-10-15 — 관리자 지도 우선 리디자인 ③(경사도), `e2e/admin-slopes-workspace.spec.ts`의 저장 안 한 변경 시나리오.
