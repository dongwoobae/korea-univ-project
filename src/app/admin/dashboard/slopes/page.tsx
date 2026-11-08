"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";
import SlopeBandsModal from "@/components/admin/slopes/SlopeBandsModal";
import SlopeEditPanel from "@/components/admin/slopes/SlopeEditPanel";
import { MOBILE_TOOLBAR_BOTTOM } from "@/components/admin/slopes/SlopeEditToolbar";
import SlopeListRow from "@/components/admin/slopes/SlopeListRow";
import SlopeViewPanel from "@/components/admin/slopes/SlopeViewPanel";
import StairsEditPanel from "@/components/admin/slopes/StairsEditPanel";
import StairsViewPanel from "@/components/admin/slopes/StairsViewPanel";
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
import { useWorkspaceLoad } from "@/components/admin/workspace/useWorkspaceLoad";
import type { EditDraft, SlopeEditorHandle } from "@/components/slope/types";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  pageOfItem,
  viewAdminCollection,
  type AdminChip,
} from "@/lib/adminCollection";
import { useSlopeBands } from "@/lib/slopeBandsStore";
import { deleteSlopeRoute } from "@/lib/slopeSave";
import {
  confirmedOsmWayIds,
  SLOPE_CHIPS,
  SLOPE_COLLECTION_POLICY,
  slopeDisplayName,
  slopeListItem,
  slopeRouteEndpoints,
  verticesBounds,
  type SlopeChip,
  type SlopeListItem,
} from "@/lib/slopeWorkspace";
import {
  availableCandidates,
  OSM_STAIRS_SNAPSHOT_URL,
  readStairsSnapshot,
  STAIRS_LINE_COLOR,
  type StairsCandidate,
} from "@/lib/stairs";
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
const CANDIDATE_NOT_FOUND =
  "OSM 계단 후보를 찾지 못했어요. 이미 확정됐거나 주소가 틀렸어요.";
const SNAPSHOT_FAILED = "OSM 계단 후보를 불러오지 못했어요";

const DELETE_CONFIRM_MESSAGE = "삭제한 경사도 경로는 복구할 수 없어요.";
const LEGEND_READ_FAILED =
  "범례 설정을 읽지 못해 편집할 수 없어요. 새로 고친 뒤 다시 시도해 주세요";

function currentSelection() {
  return readWorkspaceState(window.location.search, {
    allowEdit: true,
    stairs: true,
  });
}

function selectedRouteId(state: WorkspaceState) {
  return state.mode === "view" || state.mode === "edit" ? state.id : null;
}

/** 편집 패널과 편집 지도의 key이자 둘이 주고받는 초안·손잡이의 owner. 여기서만 만들고 둘에는 props로 넘긴다 */
function editOwner(state: WorkspaceState) {
  if (state.mode === "edit") return `edit:${state.id}`;
  if (state.mode === "new") return "edit:new";
  if (state.mode === "new-stairs") return "edit:new-stairs";
  if (state.mode === "candidate") return `edit:osm:${state.osmWayId}`;
  return null;
}

export default function SlopesPage() {
  const [routes, setRoutes] = useState<SlopeListItem[]>([]);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [editor, setEditor] = useState<SlopeEditorHandle | null>(null);
  // 모바일에서 상세를 접고 전체 지도에서 경로를 고치는 편집 패널(owner)과, 그때 초안 경계로 옮길 지도 초점
  const [fullMapOwner, setFullMapOwner] = useState<string | null>(null);
  const [fullMapFocus, setFullMapFocus] = useState<{
    owner: string;
    focus: WorkspaceFocus;
  } | null>(null);
  const fullMapSeqRef = useRef(0);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const slopeBands = useSlopeBands();
  const [bandsModalOpen, setBandsModalOpen] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [snapshot, setSnapshot] = useState<StairsCandidate[] | null>(null);
  const [snapshotError, setSnapshotError] = useState(false);
  const legendBlockedId = useId();
  const legendReadFailed = slopeBands.status === "error";
  // ready가 아닐 때 열면 초안이 기본값에서 시작해, 저장하는 순간 DB의 실제 설정을 덮어쓴다(설계 3장)
  const legendAction = (
    <>
      <button
        type="button"
        className="ku-workspace-button"
        disabled={slopeBands.status !== "ready"}
        title={legendReadFailed ? LEGEND_READ_FAILED : undefined}
        aria-describedby={legendReadFailed ? legendBlockedId : undefined}
        onClick={() => setBandsModalOpen(true)}
      >
        범례 편집
      </button>
      {legendReadFailed && (
        <span id={legendBlockedId} className="ku-sr-only">
          {LEGEND_READ_FAILED}
        </span>
      )}
    </>
  );
  const { state, request } = useWorkspaceSelection({
    allowEdit: true,
    stairs: true,
  });
  const collection = useAdminCollection(routes, SLOPE_COLLECTION_POLICY);
  const { view, setPage } = collection;
  const chips = [
    { key: "all", label: "전체", count: view.chipCounts.all },
    ...SLOPE_CHIPS.map((chip) => ({
      ...chip,
      count: view.chipCounts[chip.key],
    })),
  ];
  function showToast(message: string, type = "success") {
    setToast({ message, type });
  }

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("slope_segments")
      .select("*")
      .order("id", { ascending: true });
    if (error) return null;
    return (data ?? []).map(slopeListItem);
  }, []);

  const {
    status,
    reload: loadRoutes,
    retry,
    isDisposed,
  } = useWorkspaceLoad<SlopeListItem>({
    fetchRows,
    onRows: setRoutes,
    rowId: SLOPE_COLLECTION_POLICY.id,
    selectedId: selectedRouteId,
    // 형식 오류 경로는 편집기가 읽지 못한다. 편집 주소로 들어와도 보기로 연다(설계 2026-10-14 6.2)
    afterCheck: (_rows, selection, row) => {
      if (selection.mode === "edit" && !row.summary) {
        applyWorkspaceState({
          mode: "view",
          id: SLOPE_COLLECTION_POLICY.id(row),
        });
      }
    },
    initialPageOf: (rows, id) =>
      pageOfItem(
        viewAdminCollection(
          rows,
          SLOPE_COLLECTION_POLICY,
          INITIAL_ADMIN_COLLECTION_QUERY,
        ).matched,
        id,
        SLOPE_COLLECTION_POLICY.id,
      ),
    setPage,
    allowEdit: true,
    messages: {
      refreshFailed: "경사도 경로 목록을 새로 불러오지 못했어요",
      notFound: NOT_FOUND_MESSAGE,
    },
    showToast,
  });

  const selectedId = selectedRouteId(state);
  const selected =
    selectedId === null
      ? null
      : (routes.find(
          (item) => SLOPE_COLLECTION_POLICY.id(item) === selectedId,
        ) ?? null);
  // 편집 상태라도 목록을 받기 전이거나 형식 오류 경로면 편집 패널과 편집 지도를 그리지 않는다(owner가 null)
  const endpoints = useMemo(() => slopeRouteEndpoints(routes), [routes]);
  const confirmedIds = useMemo(() => confirmedOsmWayIds(routes), [routes]);
  const available = useMemo(
    () => (snapshot ? availableCandidates(snapshot, confirmedIds) : null),
    [snapshot, confirmedIds],
  );
  // 확정 패널의 후보는 거르기 전 스냅숏에서 찾는다. 걸러진 목록에서 찾으면, 확정 직후 목록을 다시 받는 순간 후보가
  // 빠져 저장 중인 패널이 사라지고 없는 후보 안내가 뜬다
  const candidate =
    state.mode === "candidate"
      ? (snapshot?.find((item) => item.osmWayId === state.osmWayId) ?? null)
      : null;
  const candidateConfirmed =
    candidate !== null && confirmedIds.has(candidate.osmWayId);
  const owner =
    state.mode === "new" ||
    state.mode === "new-stairs" ||
    // 후보는 목록을 받은 뒤에 연다 — 끝 잇기 대상(경사로 끝점)이 목록에서 온다
    (state.mode === "candidate" && candidate !== null && status === "ready") ||
    (state.mode === "edit" && Boolean(selected?.summary))
      ? editOwner(state)
      : null;
  const editingKind: "slope" | "stairs" =
    state.mode === "new"
      ? "slope"
      : state.mode === "edit"
        ? (selected?.kind ?? "slope")
        : "stairs";
  // 패널이 바뀐 뒤 늦게 끝난 저장의 잠금이 남지 않게 owner로 거른다(명소의 activeDraft와 같다)
  const activeDraft = draft && draft.owner === owner ? draft : null;
  const activeEditor = editor && editor.owner === owner ? editor : null;
  const saving = activeDraft?.locked ?? false;
  const fullMap = mobile && fullMapOwner !== null && fullMapOwner === owner;

  // 저장 중에는 선택을 바꾸지 않는다 — 행·선·닫기를 막는다(설계 2026-10-14 3.4)
  function requestSelection(next: WorkspaceState, alsoApply?: () => void) {
    if (saving) return;
    request(next, alsoApply);
  }

  useWorkspaceCloseRequest(state.mode !== "closed", () =>
    requestSelection({ mode: "closed" }),
  );

  // 후보 주소로 바로 들어와도 받는다. 한 번 받으면 다시 받지 않는다(설계 2026-11-06 5.3·6.1)
  const needSnapshot = showCandidates || state.mode === "candidate";
  useEffect(() => {
    if (!needSnapshot || snapshot !== null || snapshotError) return;
    let cancelled = false;
    fetch(OSM_STAIRS_SNAPSHOT_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((raw: unknown) => {
        if (cancelled) return;
        const candidates = readStairsSnapshot(raw);
        if (candidates) {
          setSnapshot(candidates);
          return;
        }
        setSnapshotError(true);
        setShowCandidates(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshotError(true);
        setShowCandidates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needSnapshot, snapshot, snapshotError]);

  const closeMissingCandidate = useEffectEvent((message: string) => {
    applyWorkspaceState({ mode: "closed" });
    showToast(message, snapshotError ? "error" : "warning");
  });
  // 저장 중에는 보지 않는다 — 확정이 끝나 목록을 다시 받으면 그 후보는 확정된 번호가 되고, 뒤이어 handleSaved가 보기로 옮긴다.
  // 닫기는 한 틱 미룬다. 그사이 조건이 바뀌면 정리 함수가 거둔다
  useEffect(() => {
    if (state.mode !== "candidate" || saving) return;
    const message = snapshotError
      ? SNAPSHOT_FAILED
      : status === "ready" &&
          snapshot !== null &&
          (candidate === null || candidateConfirmed)
        ? CANDIDATE_NOT_FOUND
        : null;
    if (message === null) return;
    const timer = window.setTimeout(() => closeMissingCandidate(message), 0);
    return () => window.clearTimeout(timer);
  }, [
    state.mode,
    saving,
    snapshotError,
    status,
    snapshot,
    candidate,
    candidateConfirmed,
  ]);

  // 검색·정렬은 설계 2026-10-14 3.3대로 선택을 푼다
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
    // 성공 토스트를 먼저 띄운다. 뒤따르는 목록 다시 받기가 실패하면 그 오류 토스트가 마지막에 남아야 한다
    showToast(`"${slopeDisplayName(item.route)}" 경로를 삭제했어요`);
    await handleDeleted(routeId);
  }

  // 편집을 마치거나 그만둔 뒤의 자리. 모바일은 행이 보기를 거치지 않아 목록으로 간다(설계 2026-10-14 6.4·6.6)
  function afterEdit(routeId: string | null): WorkspaceState {
    return mobile || routeId === null
      ? { mode: "closed" }
      : { mode: "view", id: routeId };
  }

  async function handleSaved(routeId: string, created: boolean) {
    await loadRoutes();
    if (isDisposed()) return;
    // 늦게 끝난 저장이 그사이 바뀐 화면을 덮지 않게, 아직 그 편집 상태일 때만 바꾼다(설계 2026-10-14 3.4)
    const selection = currentSelection();
    const stillEditing = created
      ? selection.mode === "new" ||
        selection.mode === "new-stairs" ||
        selection.mode === "candidate"
      : selection.mode === "edit" && selection.id === routeId;
    if (stillEditing) applyWorkspaceState(afterEdit(routeId));
  }

  async function handleDeleted(routeId: string) {
    if (isDisposed()) return;
    // 삭제는 선택을 잠그지 않는다. 기다리는 사이 다른 항목이나 새로 만들기로 옮겼으면 그 패널을 닫지 않는다(설계 2026-10-14 3.4)
    if (selectedRouteId(currentSelection()) === routeId) {
      applyWorkspaceState({ mode: "closed" });
    }
    await loadRoutes();
  }
  // 패널을 먼저 닫는다 — 다시 받은 목록에서 후보가 빠지면 없는 후보 안내가 같은 일을 두 번 알린다(설계 2026-11-06 6.7)
  async function handleDuplicate() {
    if (currentSelection().mode === "candidate")
      applyWorkspaceState({ mode: "closed" });
    await loadRoutes();
  }

  const candidateBounds = candidate ? verticesBounds(candidate.vertices) : null;
  const focus: WorkspaceFocus | null =
    fullMapFocus && fullMapFocus.owner === owner
      ? fullMapFocus.focus
      : selected?.summary
        ? {
            key: `route:${SLOPE_COLLECTION_POLICY.id(selected)}`,
            target: { bounds: selected.summary.bounds },
          }
        : candidate && candidateBounds
          ? {
              key: `osm:${candidate.osmWayId}`,
              target: { bounds: candidateBounds },
            }
          : null;

  const remove = selected
    ? {
        confirmMessage: DELETE_CONFIRM_MESSAGE,
        onConfirm: () => deleteRoute(selected),
      }
    : undefined;

  const editingStairs = selected?.kind === "stairs" ? selected : null;
  const editingSlope = selected?.kind === "slope" ? selected : null;
  const detail =
    owner !== null ? (
      editingKind === "stairs" ? (
        <StairsEditPanel
          key={owner}
          owner={owner}
          route={
            state.mode === "edit" && editingStairs ? editingStairs.route : null
          }
          initialVertices={
            state.mode === "edit"
              ? (editingStairs?.summary?.vertices ?? null)
              : (candidate?.vertices ?? null)
          }
          candidate={
            candidate
              ? { osmWayId: candidate.osmWayId, name: candidate.name }
              : null
          }
          endpoints={endpoints}
          editor={activeEditor}
          onDraftChange={setDraft}
          onSaved={handleSaved}
          onDuplicate={handleDuplicate}
          onCancel={() =>
            requestSelection(afterEdit(state.mode === "edit" ? state.id : null))
          }
          remove={remove}
          onFullMapChange={handleFullMapChange}
          showToast={showToast}
        />
      ) : (
        <SlopeEditPanel
          key={owner}
          owner={owner}
          route={
            editingSlope && state.mode === "edit" ? editingSlope.route : null
          }
          summary={
            editingSlope && state.mode === "edit" ? editingSlope.summary : null
          }
          editor={activeEditor}
          onDraftChange={setDraft}
          onSaved={handleSaved}
          onCancel={() =>
            requestSelection(afterEdit(state.mode === "edit" ? state.id : null))
          }
          remove={remove}
          onFullMapChange={handleFullMapChange}
          showToast={showToast}
        />
      )
    ) : selected ? (
      selected.kind === "stairs" ? (
        <StairsViewPanel
          key={SLOPE_COLLECTION_POLICY.id(selected)}
          item={selected}
          onEdit={() =>
            requestSelection({
              mode: "edit",
              id: SLOPE_COLLECTION_POLICY.id(selected),
            })
          }
          onClose={() => requestSelection({ mode: "closed" })}
          remove={remove}
        />
      ) : (
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
          remove={remove}
        />
      )
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
          owner !== null ? (
            <SlopeRouteMap
              key={owner}
              owner={owner}
              {...slot}
              initialVertices={
                state.mode === "edit"
                  ? (selected?.summary?.vertices ?? null)
                  : state.mode === "candidate"
                    ? (candidate?.vertices ?? null)
                    : null
              }
              editingRouteId={state.mode === "edit" ? state.id : null}
              kind={editingKind}
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
              candidates={showCandidates ? available : null}
              onSelectCandidate={(osmWayId) =>
                requestSelection({ mode: "candidate", osmWayId })
              }
            />
          )
        }
        list={
          <WorkspaceListPanel
            title="경사도 경로"
            caption={`경사로와 계단 · 총 ${view.total}개`}
            chips={chips}
            activeChip={collection.chip}
            onChipChange={(key) =>
              clearSelectionThen(() =>
                collection.setChip(key as AdminChip<SlopeChip>),
              )
            }
            addLabel="＋ 경로 그리기"
            onAdd={() => requestSelection({ mode: "new" })}
            secondaryAdd={{
              label: "＋ 계단 그리기",
              mobileLabel: "＋ 계단",
              onClick: () => requestSelection({ mode: "new-stairs" }),
            }}
            searchValue={collection.search}
            onSearchChange={(value) =>
              clearSelectionThen(() => collection.setSearch(value))
            }
            searchLabel="경사도 경로 검색"
            searchPlaceholder="경로명 검색"
            filters={
              <>
                <button
                  type="button"
                  className="ku-workspace-button"
                  aria-pressed={showCandidates}
                  onClick={() => {
                    setSnapshotError(false);
                    setShowCandidates((value) => !value);
                  }}
                >
                  OSM 계단 후보
                </button>
                {snapshotError && (
                  <span role="alert" className="ku-stairs-snapshot-error">
                    {SNAPSHOT_FAILED}
                  </span>
                )}
              </>
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
            legend={[
              ...slopeBands.bands.map((band) => ({
                label: band.name,
                color: band.color,
              })),
              { label: "계단", color: STAIRS_LINE_COLOR, dotted: true },
            ]}
            legendAction={legendAction}
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
      {bandsModalOpen && (
        <SlopeBandsModal
          initialBands={slopeBands.bands}
          onClose={() => setBandsModalOpen(false)}
          onSaved={() => {
            setBandsModalOpen(false);
            showToast("범례를 저장했어요");
          }}
        />
      )}
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
