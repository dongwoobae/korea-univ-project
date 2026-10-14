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
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const loadRequestRef = useRef(0);
  const loadedRef = useRef(false);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const { boundaries } = useCampusBoundaries();
  const { state, request } = useWorkspaceSelection({ allowEdit: false });
  const collection = useAdminCollection(landmarks, LANDMARK_COLLECTION_POLICY);
  const { view, setPage } = collection;
  const selected =
    state.mode === "view"
      ? (landmarks.find((landmark) => landmark.id === state.id) ?? null)
      : null;

  const loadLandmarks = useCallback(async () => {
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
    const timer = window.setTimeout(() => void loadLandmarks(), 0);
    return () => {
      window.clearTimeout(timer);
      // 떠난 뒤에 끝난 조회가 그때의 주소(다른 화면)에서 ?id=를 지우지 않게 진행 중인 요청을 버린다
      loadRequestRef.current += 1;
    };
  }, [loadLandmarks]);

  function requestSelection(next: WorkspaceState, alsoApply?: () => void) {
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
    if (!mobile && state.mode === "view" && state.id === id) {
      requestSelection({ mode: "closed" });
      return;
    }
    const page = collection.pageOf(id);
    requestSelection({ mode: "view", id }, () => {
      if (page !== null) setPage(page);
    });
  }

  function retry() {
    // 목록을 받은 뒤에 "loading"으로 가면, 이번 조회가 실패할 때 토스트만 뜨고 패널이 거기 멈춘다
    if (!loadedRef.current) setStatus("loading");
    void loadLandmarks();
  }

  const focus: WorkspaceFocus | null = selected
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

  const closePanel = () => requestSelection({ mode: "closed" });
  const detail =
    state.mode === "new" ? (
      <LandmarkDetailPanel
        key="new"
        landmark={null}
        boundaries={boundaries}
        onClose={closePanel}
      />
    ) : selected ? (
      <LandmarkDetailPanel
        key={selected.id}
        landmark={selected}
        boundaries={boundaries}
        onClose={closePanel}
      />
    ) : null;

  return (
    <>
      <AdminMapWorkspace
        focus={focus}
        mobileMapStrip={0}
        renderMap={(slot) => (
          <LandmarkWorkspaceMap
            {...slot}
            landmarks={view.matched}
            selected={selected}
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
