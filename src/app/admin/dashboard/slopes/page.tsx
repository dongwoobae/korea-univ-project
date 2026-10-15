"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";
import SlopeListRow from "@/components/admin/slopes/SlopeListRow";
import SlopeViewPanel from "@/components/admin/slopes/SlopeViewPanel";
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
import { SLOPE_GRADE_COLORS } from "@/lib/slopeScale";
import {
  SLOPE_CHIPS,
  SLOPE_COLLECTION_POLICY,
  summarizeSlopeRoute,
  type SlopeChip,
  type SlopeListItem,
} from "@/lib/slopeWorkspace";
import { supabase } from "@/lib/supabaseClient";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { readWorkspaceState, type WorkspaceState } from "@/lib/workspaceUrl";

const SlopeWorkspaceMap = dynamic(
  () => import("@/components/admin/slopes/SlopeWorkspaceMap"),
  { ssr: false },
);

const NOT_FOUND_MESSAGE = "경로를 찾지 못했어요. 삭제됐거나 주소가 틀렸어요.";

const LEGEND = [
  { label: "1/12 이내", color: SLOPE_GRADE_COLORS.ok },
  { label: "1/12 초과", color: SLOPE_GRADE_COLORS.over },
  { label: "30%(16.7°) 초과", color: SLOPE_GRADE_COLORS.extreme },
];

function currentSelection() {
  return readWorkspaceState(window.location.search, { allowEdit: true });
}

function selectedRouteId(state: WorkspaceState) {
  return state.mode === "view" || state.mode === "edit" ? state.id : null;
}

export default function SlopesPage() {
  const [routes, setRoutes] = useState<SlopeListItem[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const loadRequestRef = useRef(0);
  const disposedRef = useRef(false);
  const loadedRef = useRef(false);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const { state, request: requestSelection } = useWorkspaceSelection({
    allowEdit: true,
  });
  const collection = useAdminCollection(routes, SLOPE_COLLECTION_POLICY);
  const { view, setPage } = collection;
  const selectedId = selectedRouteId(state);
  const selected =
    selectedId === null
      ? null
      : (routes.find(
          (item) => SLOPE_COLLECTION_POLICY.id(item) === selectedId,
        ) ?? null);

  function showToast(message: string, type = "success") {
    setToast({ message, type });
  }

  const loadRoutes = useCallback(async () => {
    if (disposedRef.current) return;
    loadRequestRef.current += 1;
    const ticket = loadRequestRef.current;
    const { data, error } = await supabase
      .from("slope_segments")
      .select("*")
      .order("id", { ascending: true });
    // 삭제 뒤의 다시 받기가 겹치면 마지막 요청만 그린다
    if (ticket !== loadRequestRef.current) return;
    if (error) {
      if (loadedRef.current) {
        setToast({
          message: "경사도 경로 목록을 새로 불러오지 못했어요",
          type: "error",
        });
      } else {
        setStatus("error");
      }
      return;
    }
    const rows: SlopeListItem[] = (data ?? []).map((route) => ({
      route,
      summary: summarizeSlopeRoute(route.segments),
    }));
    const firstLoad = !loadedRef.current;
    loadedRef.current = true;
    setRoutes(rows);
    setStatus("ready");
    // 존재 검사는 조회가 끝난 뒤에만 한다. 조회 전 빈 목록으로 판정하면 맞는 링크도 닫힌다(설계 2026-10-14 3.4)
    const selection = currentSelection();
    const id = selectedRouteId(selection);
    if (id === null) return;
    const row = rows.find((item) => SLOPE_COLLECTION_POLICY.id(item) === id);
    if (!row) {
      applyWorkspaceState({ mode: "closed" });
      setToast({ message: NOT_FOUND_MESSAGE, type: "warning" });
      return;
    }
    // 형식 오류 경로는 편집기가 읽지 못한다. 편집 주소로 들어와도 보기로 연다(설계 2026-10-14 6.2)
    if (selection.mode === "edit" && !row.summary) {
      applyWorkspaceState({ mode: "view", id });
    }
    // 페이지는 첫 성공에서만 맞춘다. 다시 받기는 보던 페이지를 둔다
    if (firstLoad) {
      const page = pageOfItem(
        viewAdminCollection(
          rows,
          SLOPE_COLLECTION_POLICY,
          INITIAL_ADMIN_COLLECTION_QUERY,
        ).matched,
        id,
        SLOPE_COLLECTION_POLICY.id,
      );
      if (page !== null) setPage(page);
    }
  }, [setPage]);

  useEffect(() => {
    disposedRef.current = false;
    const timer = window.setTimeout(() => void loadRoutes(), 0);
    return () => {
      window.clearTimeout(timer);
      // 떠난 뒤에 끝난 조회가 그때의 주소(다른 화면)에서 ?id=를 지우지 않게 진행 중인 요청을 버린다.
      // 떠난 뒤 끝난 삭제가 새로 시작하는 다시 받기와 그 뒤의 주소 갱신도 disposedRef가 막는다
      disposedRef.current = true;
      loadRequestRef.current += 1;
    };
  }, [loadRoutes]);

  useWorkspaceCloseRequest(state.mode !== "closed", () =>
    requestSelection({ mode: "closed" }),
  );

  // 칩·검색·정렬은 설계 2026-10-14 3.3대로 선택을 푼다
  function clearSelectionThen(change: () => void) {
    requestSelection({ mode: "closed" }, change);
  }

  function select(id: string) {
    if (!mobile && selectedId === id) {
      requestSelection({ mode: "closed" });
      return;
    }
    const page = collection.pageOf(id);
    requestSelection({ mode: "view", id }, () => {
      if (page !== null) setPage(page);
    });
  }

  async function handleDeleted(routeId: string) {
    if (disposedRef.current) return;
    // 삭제는 선택을 잠그지 않는다. 기다리는 사이 다른 항목이나 새로 만들기로 옮겼으면 그 패널을 닫지 않는다(설계 2026-10-14 3.4)
    if (selectedRouteId(currentSelection()) === routeId) {
      applyWorkspaceState({ mode: "closed" });
    }
    await loadRoutes();
  }

  function retry() {
    // 목록을 받은 뒤에 "loading"으로 가면, 이번 조회가 실패할 때 토스트만 뜨고 패널이 거기 멈춘다
    if (!loadedRef.current) setStatus("loading");
    void loadRoutes();
  }

  const focus: WorkspaceFocus | null = selected?.summary
    ? {
        key: `route:${SLOPE_COLLECTION_POLICY.id(selected)}`,
        target: { bounds: selected.summary.bounds },
      }
    : null;

  const chips = [
    { key: "all", label: "전체", count: view.chipCounts.all },
    ...SLOPE_CHIPS.map((chip) => ({
      ...chip,
      count: view.chipCounts[chip.key],
    })),
  ];

  // 편집 패널은 아직 없다. 편집 주소도 보기 패널로 연다
  const detail = selected ? (
    <SlopeViewPanel
      key={SLOPE_COLLECTION_POLICY.id(selected)}
      item={selected}
      onEdit={() =>
        requestSelection({
          mode: "edit",
          id: SLOPE_COLLECTION_POLICY.id(selected),
        })
      }
      onClose={() => requestSelection({ mode: "closed" })}
      onDeleted={handleDeleted}
      showToast={showToast}
    />
  ) : null;

  return (
    <>
      <AdminMapWorkspace
        focus={focus}
        mobileMapStrip={230}
        renderMap={(slot) => (
          <SlopeWorkspaceMap
            {...slot}
            routes={view.matched}
            selectedId={selected ? SLOPE_COLLECTION_POLICY.id(selected) : null}
            onSelect={select}
          />
        )}
        list={
          <WorkspaceListPanel
            title="경사도 경로"
            caption={`구간별 경사를 기록한 보행 경로 · 총 ${view.total}개`}
            addLabel="＋ 경로 그리기"
            onAdd={() => requestSelection({ mode: "new" })}
            searchValue={collection.search}
            onSearchChange={(value) =>
              clearSelectionThen(() => collection.setSearch(value))
            }
            searchLabel="경사도 경로 검색"
            searchPlaceholder="경로명 검색"
            chips={chips}
            activeChip={collection.chip}
            onChipChange={(key) =>
              clearSelectionThen(() =>
                collection.setChip(key as AdminChip<SlopeChip>),
              )
            }
            sort={collection.sort}
            onSortChange={(sort) =>
              clearSelectionThen(() => collection.setSort(sort))
            }
            sortLabel="경사도 경로 정렬"
            status={status}
            errorMessage="경사도 경로를 불러오지 못했어요."
            onRetry={retry}
            matchedCount={view.matched.length}
            page={view.page}
            onPageChange={(page) => clearSelectionThen(() => setPage(page))}
            legend={LEGEND}
          >
            {view.pageItems.map((item) => {
              const id = SLOPE_COLLECTION_POLICY.id(item);
              return (
                <SlopeListRow
                  key={id}
                  item={item}
                  selected={id === selectedId}
                  onSelect={() => select(id)}
                />
              );
            })}
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
