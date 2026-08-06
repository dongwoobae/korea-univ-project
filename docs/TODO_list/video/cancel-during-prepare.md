# 업로드 취소가 준비 단계에서는 먹지 않는다

`FacilityVideoModal`의 강제 종료는 **그 순간 존재하는 XHR만** 중단한다
(`src/components/admin/FacilityVideoModal.tsx:52-56`).

```ts
async function handleForceClose() {
  if (xhrRef.current) xhrRef.current.abort();
  onUpdate();
  onClose();
}
```

`xhrRef.current`는 실제 R2 업로드가 시작될 때만 채워진다. 그전 단계 —
`isVideoPlayable()` 디코드 확인, `compressVideo()` 변환, presign 요청 —
에서는 비어 있다. 그래서 그 구간에 `중단하고 나가기`를 누르면 모달은 닫히지만
`handleUpload`의 비동기 흐름은 계속 살아서 **presign을 받고 XHR을 만들고 업로드를
끝낸 뒤 `facility-video-confirm`까지 호출한다.**

사용자가 보는 것: 취소했는데 잠시 뒤 동영상이 등록돼 있다. 교체였다면 **이전
동영상이 이미 사라진 뒤**다.

`compressVideo` 구간은 부분적으로 덮여 있다 — 모달 언마운트 시
`terminateFFmpeg`가 도는 `useEffect`가 있어 변환 자체는 죽는다
(`FacilityVideoModal.tsx:42`). 하지만 그 뒤 `catch`로 빠지지 않고 정상 흐름이
이어질 수 있는지는 확인하지 않았다. presign → 업로드 → confirm 구간은 덮여 있지 않다.

## 막힌 이유

**차단 사유 없음.** 범위 때문에 미뤘다 — `FacilityVideoModal.tsx`는
`facility-detail-modal` 브랜치가 건드리지 않은 선재 파일이고, 이번 작업은 진입점을
건물 동영상 섹션으로 옮긴 것이었다.

**재현은 아직 안 해봤다.** 위 서술은 코드를 읽고 세운 것이다. 착수하면 실제로
느린 네트워크에서 presign 직후 취소를 눌러 confirm이 나가는지부터 확인할 것.

## 트리거

없음. 다만 아래가 있으면 우선순위가 올라간다.

- 실제로 "취소했는데 올라갔다"는 사례가 나온다
- 동영상 교체가 잦아져 이전 파일 소실의 대가가 커진다

## 착수 시 정할 것

- **취소의 의미를 어디까지로 볼지.** 선택지:
  - **작업 단위 취소 플래그** — `handleUpload` 안의 각 `await` 뒤에 취소 여부를
    확인하고 조용히 빠진다. 구현이 단순하고 기존 구조를 안 건드린다. 대신 확인
    지점을 하나라도 빠뜨리면 그 구간이 그대로 구멍이다.
  - **`AbortController`를 fetch·XHR에 함께 물린다** — 준비 요청까지 실제로 끊긴다.
    `isVideoPlayable`·`compressVideo`가 signal을 받게 시그니처를 바꿔야 한다.
  - 둘 다 — signal로 네트워크를 끊고, 플래그로 그 사이 상태 갱신을 막는다.
- **이미 업로드된 객체를 어떻게 할지.** 취소가 XHR abort 후에 걸리면 R2에 부분
  객체가 남을 수 있다. 지울지, 남기고 별도 수거에 맡길지 정해야 한다.
  같은 스펙의 `동영상 교체 시 R2에 남는 옛 객체 정리`와 함께 보는 편이 낫다.
- **취소 후 화면 갱신.** 지금은 `handleForceClose`가 무조건 `onUpdate()`를 부른다.
  실제로 아무것도 안 바뀐 취소에서도 부모가 재조회를 하는데, 이대로 둘지 정한다.

## 출처

2026-08-06 codex 3-lane 리뷰. lane C(공격자)가 지적했고 lane B(아키텍트)도
독립적으로 같은 지점을 짚었다 — 두 관점이 겹친 항목이다.
