"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";
import SlopeEditPanel from "@/components/admin/slopes/SlopeEditPanel";
import { MOBILE_TOOLBAR_BOTTOM } from "@/components/admin/slopes/SlopeEditToolbar";
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
import type {
  SlopeEditDraft,
  SlopeEditorHandle,
} from "@/components/slope/types";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  pageOfItem,
  viewAdminCollection,
  type AdminChip,
} from "@/lib/adminCollection";
import { SLOPE_GRADE_COLORS } from "@/lib/slopeScale";
import { deleteSlopeRoute } from "@/lib/slopeSave";
import {
  SLOPE_CHIPS,
  SLOPE_COLLECTION_POLICY,
  slopeDisplayName,
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

const SlopeRouteMap = dynamic(
  () => import("@/components/slope/SlopeRouteMap"),
  { ssr: false },
);

const NOT_FOUND_MESSAGE = "경로를 찾지 못했어요. 삭제됐거나 주소가 틀렸어요.";

const DELETE_CONFIRM_MESSAGE = "삭제한 경사도 경로는 복구할 수 없어요.";

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

/** 편집 패널과 편집 지도의 key이자 둘이 주고받는 초안·손잡이의 owner */
function editOwner(state: WorkspaceState) {
  if (state.mode === "edit") return `edit:${state.id}`;
  if (state.mode === "new") return "edit:new";
  return null;
}

export default function SlopesPage() {
  const [routes, setRoutes] = useState<SlopeListItem[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [draft, setDraft] = useState<SlopeEditDraft | null>(null);
  const [editor, setEditor] = useState<SlopeEditorHandle | null>(null);
  // 모바일에서 상세를 접고 전체 지도에서 경로를 고치는 편집 패널(owner)과, 그때 초안 경계로 옮길 지도 초점
  const [fullMapOwner, setFullMapOwner] = useState<string | null>(null);
  const [fullMapFocus, setFullMapFocus] = useState<{
    owner: string;
    focus: WorkspaceFocus;
  } | null>(null);
  const loadRequestRef = useRef(0);
  const disposedRef = useRef(false);
  const loadedRef = useRef(false);
  const fullMapSeqRef = useRef(0);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const { state, request } = useWorkspaceSelection({ allowEdit: true });
  const collection = useAdminCollection(routes, SLOPE_COLLECTION_POLICY);
  const { view, setPage } = collection;
  const selectedId = selectedRouteId(state);
  const selected =
    selectedId === null
      ? null
      : (routes.find(
          (item) => SLOPE_COLLECTION_POLICY.id(item) === selectedId,
        ) ?? null);
  // 편집 상태라도 목록을 받기 전이거나 형식 오류 경로면 편집 패널과 편집 지도를 그리지 않는다
  const editing =
    state.mode === "new" ||
    (state.mode === "edit" && Boolean(selected?.summary));
  const owner = editing ? editOwner(state) : null;
  // 패널이 바뀐 뒤 늦게 끝난 저장의 잠금이 남지 않게 owner로 거른다(명소의 activeDraft와 같다)
  const activeDraft = draft && draft.owner === owner ? draft : null;
  const activeEditor = editor && editor.owner === owner ? editor : null;
  const saving = activeDraft?.locked ?? false;
  const fullMap = mobile && fullMapOwner !== null && fullMapOwner === owner;

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

  // 저장 중에는 선택을 바꾸지 않는다 — 행·선·칩·닫기를 막는다(설계 2026-10-14 3.4)
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
    if (!mobile && selectedId === id) {
      requestSelection({ mode: "closed" });
      return;
    }
    const page = collection.pageOf(id);
    // 모바일 상세는 보기와 편집을 합친다(핸드오버 8장). 편집기가 읽지 못하는 형식 오류 경로만 보기로 연다
    const editable =
      mobile &&
      Boolean(
        routes.find((item) => SLOPE_COLLECTION_POLICY.id(item) === id)?.summary,
      );
    requestSelection({ mode: editable ? "edit" : "view", id }, () => {
      if (page !== null) setPage(page);
    });
  }

  // 지도는 선택이 바뀔 때만 옮기지만 전체 지도는 예외다. 들어갈 때는 확인 바 위 지도에, 완료로 나올 때는 띠에 지금 초안의
  // 경로가 보이게 그때마다 새 key로 옮긴다(명소의 위치 고르기와 같은 방식). 나온 뒤에도 초점은 남긴다 — 거두면 key가 선택
  // id로 돌아가 지도가 저장된 경로로 되돌아간다. 패널이 닫힐 때(closed) 거둔다
  function handleFullMapChange(open: boolean, closed = false) {
    if (closed || owner === null) {
      setFullMapOwner(null);
      setFullMapFocus(null);
      return;
    }
    setFullMapOwner(open ? owner : null);
    const bounds = activeDraft?.bounds;
    if (!bounds) return;
    fullMapSeqRef.current += 1;
    setFullMapFocus({
      owner,
      focus: { key: `full-map:${fullMapSeqRef.current}`, target: { bounds } },
    });
  }

  async function deleteRoute(item: SlopeListItem) {
    const routeId = SLOPE_COLLECTION_POLICY.id(item);
    const error = await deleteSlopeRoute(routeId);
    if (error) {
      showToast(error, "error");
      return;
    }
    await handleDeleted(routeId);
    showToast(`"${slopeDisplayName(item.route)}" 경로를 삭제했어요`);
  }

  // 편집을 마치거나 그만둔 뒤의 자리. 모바일은 행이 보기를 거치지 않아 목록으로 간다(설계 2026-10-14 6.4·6.6)
  function afterEdit(routeId: string | null): WorkspaceState {
    return mobile || routeId === null
      ? { mode: "closed" }
      : { mode: "view", id: routeId };
  }

  async function handleSaved(routeId: string, created: boolean) {
    await loadRoutes();
    if (disposedRef.current) return;
    // 늦게 끝난 저장이 그사이 바뀐 화면을 덮지 않게, 아직 그 편집 상태일 때만 바꾼다(설계 2026-10-14 3.4)
    const selection = currentSelection();
    const stillEditing = created
      ? selection.mode === "new"
      : selection.mode === "edit" && selection.id === routeId;
    if (stillEditing) applyWorkspaceState(afterEdit(routeId));
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

  const focus: WorkspaceFocus | null =
    fullMapFocus && fullMapFocus.owner === owner
      ? fullMapFocus.focus
      : selected?.summary
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

  const detail = editing ? (
    <SlopeEditPanel
      key={owner}
      route={selected && state.mode === "edit" ? selected.route : null}
      summary={selected && state.mode === "edit" ? selected.summary : null}
      editor={activeEditor}
      onDraftChange={setDraft}
      onSaved={handleSaved}
      onCancel={() =>
        requestSelection(afterEdit(state.mode === "edit" ? state.id : null))
      }
      remove={
        selected && state.mode === "edit"
          ? {
              confirmMessage: DELETE_CONFIRM_MESSAGE,
              onConfirm: () => deleteRoute(selected),
            }
          : undefined
      }
      onFullMapChange={handleFullMapChange}
      showToast={showToast}
    />
  ) : selected ? (
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
      remove={{
        confirmMessage: DELETE_CONFIRM_MESSAGE,
        onConfirm: () => deleteRoute(selected),
      }}
    />
  ) : null;

  return (
    <>
      <AdminMapWorkspace
        focus={focus}
        mobileMapStrip={230}
        mobilePicking={fullMap}
        mobilePickingTop={MOBILE_TOOLBAR_BOTTOM}
        renderMap={(slot) =>
          // 편집하면 지도 자리에 편집 지도를 바꿔 끼운다. 보기와 focus key가 같아 화면을 이어받는다(설계 2026-10-14 2.6·3.2)
          editing ? (
            <SlopeRouteMap
              key={owner}
              {...slot}
              initialVertices={
                state.mode === "edit"
                  ? (selected?.summary?.vertices ?? null)
                  : null
              }
              editingRouteId={state.mode === "edit" ? state.id : null}
              draft={activeDraft}
              onEditorChange={setEditor}
            />
          ) : (
            <SlopeWorkspaceMap
              {...slot}
              routes={view.matched}
              selectedId={
                selected ? SLOPE_COLLECTION_POLICY.id(selected) : null
              }
              onSelect={select}
            />
          )
        }
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
