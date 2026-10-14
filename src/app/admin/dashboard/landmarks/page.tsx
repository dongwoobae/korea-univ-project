"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";
import LandmarkDetailPanel from "@/components/admin/landmarks/LandmarkDetailPanel";
import LandmarkListRow from "@/components/admin/landmarks/LandmarkListRow";
import AdminMapWorkspace from "@/components/admin/workspace/AdminMapWorkspace";
import WorkspaceListPanel from "@/components/admin/workspace/WorkspaceListPanel";
import {
  ADMIN_MOBILE_QUERY,
  type DetailDraftPin,
  type WorkspaceFocus,
} from "@/components/admin/workspace/types";
import { useAdminCollection } from "@/components/admin/workspace/useAdminCollection";
import {
  applyWorkspaceState,
  useWorkspaceCloseRequest,
  useWorkspaceSelection,
} from "@/components/admin/workspace/useWorkspaceSelection";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  pageOfItem,
  viewAdminCollection,
  type AdminChip,
} from "@/lib/adminCollection";
import {
  LANDMARK_CHIPS,
  LANDMARK_COLLECTION_POLICY,
  landmarkCampusLabel,
  type LandmarkChip,
} from "@/lib/landmarkWorkspace";
import { supabase } from "@/lib/supabaseClient";
import { useCampusBoundaries } from "@/lib/useCampusBoundaries";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { readWorkspaceState, type WorkspaceState } from "@/lib/workspaceUrl";
import type { Landmark } from "@/types/domain";

const LandmarkWorkspaceMap = dynamic(
  () => import("@/components/admin/landmarks/LandmarkWorkspaceMap"),
  { ssr: false },
);

const NOT_FOUND_MESSAGE = "명소를 찾지 못했어요. 삭제됐거나 주소가 틀렸어요.";

function currentSelection() {
  return readWorkspaceState(window.location.search, { allowEdit: false });
}

export default function LandmarksPage() {
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [draft, setDraft] = useState<DetailDraftPin | null>(null);
  // 모바일에서 상세를 접고 지도에서 위치를 고르는 패널(owner)과, 그때 핀으로 옮길 지도 초점
  const [pickOwner, setPickOwner] = useState<string | null>(null);
  const [pickFocus, setPickFocus] = useState<{
    owner: string;
    focus: WorkspaceFocus;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const loadRequestRef = useRef(0);
  const disposedRef = useRef(false);
  const loadedRef = useRef(false);
  const pickSeqRef = useRef(0);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const { boundaries, error: boundariesError } = useCampusBoundaries();
  const { state, request } = useWorkspaceSelection({ allowEdit: false });
  const collection = useAdminCollection(landmarks, LANDMARK_COLLECTION_POLICY);
  const { view, setPage } = collection;
  const selected =
    state.mode === "view"
      ? (landmarks.find((landmark) => landmark.id === state.id) ?? null)
      : null;
  const panelKey =
    state.mode === "view" ? state.id : state.mode === "new" ? "new" : null;
  const activeDraft = draft && draft.owner === panelKey ? draft : null;
  const saving = activeDraft?.saving ?? false;
  const picking = mobile && pickOwner !== null && pickOwner === panelKey;

  function showToast(message: string, type = "success") {
    setToast({ message, type });
  }

  const loadLandmarks = useCallback(async () => {
    if (disposedRef.current) return;
    loadRequestRef.current += 1;
    const ticket = loadRequestRef.current;
    const { data, error } = await supabase
      .from("landmarks")
      .select("*")
      .order("id", { ascending: true });
    // 저장·사진 변경 뒤의 다시 받기가 겹치면 마지막 요청만 그린다
    if (ticket !== loadRequestRef.current) return;
    if (error) {
      if (loadedRef.current) {
        setToast({
          message: "명소 목록을 새로 불러오지 못했어요",
          type: "error",
        });
      } else {
        setStatus("error");
      }
      return;
    }
    const rows: Landmark[] = data ?? [];
    const firstLoad = !loadedRef.current;
    loadedRef.current = true;
    setLandmarks(rows);
    setStatus("ready");
    // 존재 검사는 조회가 끝난 뒤에만 한다. 조회 전 빈 목록으로 판정하면 맞는 링크도 닫힌다(설계 2026-10-14 3.4)
    const selection = currentSelection();
    if (selection.mode !== "view") return;
    if (!rows.some((row) => row.id === selection.id)) {
      applyWorkspaceState({ mode: "closed" });
      setToast({ message: NOT_FOUND_MESSAGE, type: "warning" });
      return;
    }
    // 페이지는 첫 성공에서만 맞춘다. 다시 받기는 보던 페이지를 둔다
    if (firstLoad) {
      const page = pageOfItem(
        viewAdminCollection(
          rows,
          LANDMARK_COLLECTION_POLICY,
          INITIAL_ADMIN_COLLECTION_QUERY,
        ).matched,
        selection.id,
        LANDMARK_COLLECTION_POLICY.id,
      );
      if (page !== null) setPage(page);
    }
  }, [setPage]);

  useEffect(() => {
    disposedRef.current = false;
    const timer = window.setTimeout(() => void loadLandmarks(), 0);
    return () => {
      window.clearTimeout(timer);
      // 떠난 뒤에 끝난 조회가 그때의 주소(다른 화면)에서 ?id=를 지우지 않게 진행 중인 요청을 버린다.
      // 떠난 뒤 끝난 저장·삭제가 새로 시작하는 다시 받기와 그 뒤의 주소 갱신도 disposedRef가 막는다
      disposedRef.current = true;
      loadRequestRef.current += 1;
    };
  }, [loadLandmarks]);

  // 저장 중에는 선택을 바꾸지 않는다 — 행·마커·닫기·칩을 막는다(설계 2026-10-14 3.4)
  function requestSelection(next: WorkspaceState, alsoApply?: () => void) {
    if (saving) return;
    request(next, alsoApply);
  }

  useWorkspaceCloseRequest(state.mode !== "closed", () =>
    requestSelection({ mode: "closed" }),
  );

  // 칩·검색·정렬은 설계 2026-10-14 3.3대로 선택을 푼다
  function clearSelectionThen(change: () => void) {
    requestSelection({ mode: "closed" }, change);
  }

  function select(id: string) {
    // 고르는 동안 지도를 누르는 것은 위치를 찍는 일이다. 다른 마커를 눌러도 선택을 옮기지 않는다
    if (picking) return;
    if (!mobile && state.mode === "view" && state.id === id) {
      requestSelection({ mode: "closed" });
      return;
    }
    const page = collection.pageOf(id);
    requestSelection({ mode: "view", id }, () => {
      if (page !== null) setPage(page);
    });
  }

  // 지도는 선택이 바뀔 때만 옮기지만 위치 고르기는 예외다. 상세에 덮였던 핀이 확인 바 위 지도에 보이게,
  // 고르기를 시작할 때마다 새 key로 옮긴다(독립 시설의 현 위치로 찍기와 같은 방식).
  // 고르기를 마쳐도 초점은 남긴다. 거두면 key가 선택 id로 돌아가 지도가 고르기 전 저장 위치로 되돌아간다.
  // 패널이 닫힐 때(closed) 거둔다. 새로 만들기는 모두 owner가 "new"라 남겨 두면 다음 새 명소가 지난 위치로 옮겨진다
  function handlePickingChange(next: boolean, closed = false) {
    if (!next || panelKey === null) {
      setPickOwner(null);
      if (closed) setPickFocus(null);
      return;
    }
    setPickOwner(panelKey);
    const position = activeDraft?.position;
    if (!position) return;
    pickSeqRef.current += 1;
    setPickFocus({
      owner: panelKey,
      focus: {
        key: `pick:${pickSeqRef.current}`,
        target: { point: position },
      },
    });
  }

  async function handleSaved(landmarkId: string, created: boolean) {
    await loadLandmarks();
    if (disposedRef.current) return;
    // 늦게 끝난 저장이 그사이 바뀐 화면을 덮지 않게, 아직 그 새로 만들기 패널일 때만 바꾼다(설계 2026-10-14 3.4)
    if (created && currentSelection().mode === "new") {
      applyWorkspaceState({ mode: "view", id: landmarkId });
    }
  }

  async function handleDeleted(landmarkId: string) {
    if (disposedRef.current) return;
    // 삭제는 선택을 잠그지 않는다. 기다리는 사이 다른 항목이나 새로 만들기로 옮겼으면 그 패널을 닫지 않는다(설계 2026-10-14 3.4)
    const selection = currentSelection();
    if (selection.mode === "view" && selection.id === landmarkId) {
      applyWorkspaceState({ mode: "closed" });
    }
    await loadLandmarks();
  }

  function retry() {
    // 목록을 받은 뒤에 "loading"으로 가면, 이번 조회가 실패할 때 토스트만 뜨고 패널이 거기 멈춘다
    if (!loadedRef.current) setStatus("loading");
    void loadLandmarks();
  }

  const focus: WorkspaceFocus | null =
    pickFocus && pickFocus.owner === panelKey
      ? pickFocus.focus
      : selected
        ? {
            key: selected.id,
            target: { point: [selected.lat, selected.lng] },
          }
        : null;

  const chips = [
    { key: "all", label: "전체", count: view.chipCounts.all },
    ...LANDMARK_CHIPS.map((chip) => ({
      ...chip,
      count: view.chipCounts[chip.key],
    })),
  ];

  const panelProps = {
    boundaries,
    boundariesError,
    onDraftChange: setDraft,
    onSaved: handleSaved,
    onDeleted: handleDeleted,
    onClose: () => requestSelection({ mode: "closed" }),
    showToast,
    onPickingChange: handlePickingChange,
  };
  const detail =
    state.mode === "new" ? (
      <LandmarkDetailPanel key="new" landmark={null} {...panelProps} />
    ) : selected ? (
      <LandmarkDetailPanel
        key={selected.id}
        landmark={selected}
        {...panelProps}
      />
    ) : null;

  return (
    <>
      <AdminMapWorkspace
        focus={focus}
        mobileMapStrip={0}
        mobilePicking={picking}
        renderMap={(slot) => (
          <LandmarkWorkspaceMap
            {...slot}
            landmarks={view.matched}
            selected={selected}
            creating={state.mode === "new"}
            draft={activeDraft}
            onSelect={select}
          />
        )}
        list={
          <WorkspaceListPanel
            title="명소"
            caption={`지도에 표시하는 캠퍼스 명소 · 총 ${view.total}개`}
            addLabel="＋ 명소 추가"
            onAdd={() => requestSelection({ mode: "new" })}
            searchValue={collection.search}
            onSearchChange={(value) =>
              clearSelectionThen(() => collection.setSearch(value))
            }
            searchLabel="명소 검색"
            searchPlaceholder="명소명 또는 설명 검색"
            chips={chips}
            activeChip={collection.chip}
            onChipChange={(key) =>
              clearSelectionThen(() =>
                collection.setChip(key as AdminChip<LandmarkChip>),
              )
            }
            sort={collection.sort}
            onSortChange={(sort) =>
              clearSelectionThen(() => collection.setSort(sort))
            }
            sortLabel="명소 정렬"
            status={status}
            errorMessage="명소 목록을 불러오지 못했어요."
            onRetry={retry}
            matchedCount={view.matched.length}
            page={view.page}
            onPageChange={(page) => clearSelectionThen(() => setPage(page))}
            legend={[]}
          >
            {view.pageItems.map((landmark) => (
              <LandmarkListRow
                key={landmark.id}
                landmark={landmark}
                campus={landmarkCampusLabel(landmark, boundaries)}
                selected={landmark.id === selected?.id}
                onSelect={() => select(landmark.id)}
              />
            ))}
          </WorkspaceListPanel>
        }
        detail={detail}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
