"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";
import FacilityDetailPanel from "@/components/admin/facilities/FacilityDetailPanel";
import FacilityListRow from "@/components/admin/facilities/FacilityListRow";
import AdminMapWorkspace from "@/components/admin/workspace/AdminMapWorkspace";
import WorkspaceListPanel from "@/components/admin/workspace/WorkspaceListPanel";
import {
  ADMIN_MOBILE_QUERY,
  type DetailDraftPin,
  type LatLngTuple,
  type WorkspaceFocus,
} from "@/components/admin/workspace/types";
import { useAdminCollection } from "@/components/admin/workspace/useAdminCollection";
import {
  applyWorkspaceState,
  useWorkspaceCloseRequest,
  useWorkspaceSelection,
} from "@/components/admin/workspace/useWorkspaceSelection";
import { useWorkspaceLoad } from "@/components/admin/workspace/useWorkspaceLoad";
import { getFacilityMarkerColor } from "@/components/map/facilityColors";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  pageOfItem,
  viewAdminCollection,
  type AdminChip,
} from "@/lib/adminCollection";
import {
  FACILITY_CHIPS,
  FACILITY_COLLECTION_POLICY,
  type FacilityChip,
} from "@/lib/facilityWorkspace";
import { supabase } from "@/lib/supabaseClient";
import { useCampusBoundaries } from "@/lib/useCampusBoundaries";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { readWorkspaceState, type WorkspaceState } from "@/lib/workspaceUrl";
import type { FacilityType, FacilityWithType } from "@/types/domain";

const FacilityWorkspaceMap = dynamic(
  () => import("@/components/admin/facilities/FacilityWorkspaceMap"),
  { ssr: false },
);

// 상세 패널의 사진 칸이 쓴다. created_at은 업로드 순서 정렬에 필요하다.
const FACILITY_SELECT =
  "*, facility_types(code, label), facility_photos(id, storage_path, sort_order, created_at)";
const NOT_FOUND_MESSAGE = "시설을 찾지 못했어요. 삭제됐거나 주소가 틀렸어요.";

function currentSelection() {
  return readWorkspaceState(window.location.search, { allowEdit: false });
}

export default function StandaloneFacilitiesPage() {
  const [facilities, setFacilities] = useState<FacilityWithType[]>([]);
  const [facilityTypes, setFacilityTypes] = useState<FacilityType[]>([]);
  const [typesFailed, setTypesFailed] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [draft, setDraft] = useState<DetailDraftPin | null>(null);
  const [locateFocus, setLocateFocus] = useState<{
    owner: string;
    focus: WorkspaceFocus;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const locateSeqRef = useRef(0);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const { boundaries, error: boundariesError } = useCampusBoundaries();
  const { state, request } = useWorkspaceSelection({ allowEdit: false });
  const collection = useAdminCollection(
    facilities,
    FACILITY_COLLECTION_POLICY,
    typeFilter === "all"
      ? undefined
      : (facility) => facility.facility_code === typeFilter,
  );
  const { view, setPage } = collection;
  const selected =
    state.mode === "view"
      ? (facilities.find((facility) => facility.id === state.id) ?? null)
      : null;
  const panelKey =
    state.mode === "view" ? state.id : state.mode === "new" ? "new" : null;
  const activeDraft = draft && draft.owner === panelKey ? draft : null;
  const saving = activeDraft?.saving ?? false;

  function showToast(message: string, type = "success") {
    setToast({ message, type });
  }

  const loadTypes = useCallback(async () => {
    const { data, error } = await supabase
      .from("facility_types")
      .select("*")
      .order("sort_order")
      .order("code");
    setTypesFailed(Boolean(error));
    if (!error) setFacilityTypes(data ?? []);
  }, []);

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("building_facilities")
      .select(FACILITY_SELECT)
      .is("building_id", null)
      .order("id", { ascending: true });
    if (error) return null;
    return (data ?? []) as FacilityWithType[];
  }, []);

  const load = useWorkspaceLoad<FacilityWithType>({
    fetchRows,
    onRows: setFacilities,
    rowId: (row) => row.id,
    selectedId: (selection) =>
      selection.mode === "view" ? selection.id : null,
    initialPageOf: (rows, id) =>
      pageOfItem(
        viewAdminCollection(
          rows,
          FACILITY_COLLECTION_POLICY,
          INITIAL_ADMIN_COLLECTION_QUERY,
        ).matched,
        id,
        FACILITY_COLLECTION_POLICY.id,
      ),
    setPage,
    allowEdit: false,
    messages: {
      refreshFailed: "시설 목록을 새로 불러오지 못했어요",
      notFound: NOT_FOUND_MESSAGE,
    },
    showToast,
  });
  const { status, reload: loadFacilities, isDisposed } = load;

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTypes(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTypes]);

  // 저장 중에는 선택을 바꾸지 않는다 — 행·마커·닫기·칩을 막는다(설계 2026-10-14 3.4)
  function requestSelection(next: WorkspaceState, alsoApply?: () => void) {
    if (saving) return;
    request(next, alsoApply);
  }

  useWorkspaceCloseRequest(state.mode !== "closed", () =>
    requestSelection({ mode: "closed" }),
  );

  // 칩·검색·정렬은 설계 2026-10-14 3.3대로 선택을 푼다. 페이지는 3.4 표가 이동 확인 대상으로 두어(선택이 남으면
  // 확인할 까닭이 없다), 유형 드롭다운은 칩과 같은 목록 조건이라 같이 푼다.
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

  async function handleChanged() {
    await loadFacilities();
  }

  // 지도는 선택이 바뀔 때만 옮기지만 현 위치로 찍은 점은 예외다. 화면 밖에 찍힌 핀을 "표시했어요"로 알리지 않게,
  // 요청마다 새 key로 옮긴다(설계 2026-10-14 3.5)
  function handleLocated(position: LatLngTuple | null) {
    if (!position || panelKey === null) {
      setLocateFocus(null);
      return;
    }
    locateSeqRef.current += 1;
    setLocateFocus({
      owner: panelKey,
      focus: {
        key: `locate:${locateSeqRef.current}`,
        target: { point: position },
      },
    });
  }

  async function handleSaved(facilityId: string, created: boolean) {
    await loadFacilities();
    if (isDisposed()) return;
    // 늦게 끝난 저장이 그사이 바뀐 화면을 덮지 않게, 아직 그 새로 만들기 패널일 때만 바꾼다(설계 2026-10-14 3.4)
    if (created && currentSelection().mode === "new") {
      applyWorkspaceState({ mode: "view", id: facilityId });
    }
  }

  async function handleDeleted(facilityId: string) {
    if (isDisposed()) return;
    // 삭제는 선택을 잠그지 않는다. 기다리는 사이 다른 항목이나 새로 만들기로 옮겼으면 그 패널을 닫지 않는다(설계 2026-10-14 3.4)
    const selection = currentSelection();
    if (selection.mode === "view" && selection.id === facilityId) {
      applyWorkspaceState({ mode: "closed" });
    }
    await loadFacilities();
  }

  function retry() {
    setTypesFailed(false);
    void loadTypes();
    load.retry();
  }

  const focus: WorkspaceFocus | null =
    locateFocus && locateFocus.owner === panelKey
      ? locateFocus.focus
      : selected && selected.lat != null && selected.lng != null
        ? {
            key: selected.id,
            target: { point: [selected.lat, selected.lng] },
          }
        : null;

  const chips = [
    { key: "all", label: "전체", count: view.chipCounts.all },
    ...FACILITY_CHIPS.map((chip) => ({
      ...chip,
      count: view.chipCounts[chip.key],
    })),
  ];

  const panelProps = {
    facilityTypes,
    boundaries,
    boundariesError,
    onDraftChange: setDraft,
    onLocated: handleLocated,
    onSaved: handleSaved,
    onChanged: handleChanged,
    onDeleted: handleDeleted,
    onClose: () => requestSelection({ mode: "closed" }),
    showToast,
  };
  const detail =
    state.mode === "new" ? (
      <FacilityDetailPanel key="new" facility={null} {...panelProps} />
    ) : selected ? (
      <FacilityDetailPanel
        key={selected.id}
        facility={selected}
        {...panelProps}
      />
    ) : null;

  return (
    <>
      <AdminMapWorkspace
        focus={focus}
        renderMap={(slot) => (
          <FacilityWorkspaceMap
            {...slot}
            facilities={view.matched}
            selected={selected}
            creating={state.mode === "new"}
            draft={activeDraft}
            onSelect={select}
          />
        )}
        list={
          <WorkspaceListPanel
            title="독립 시설"
            caption={`건물에 속하지 않는 야외 경사로, 주차구역 등 · 총 ${view.total}개`}
            addLabel="＋ 시설 추가"
            onAdd={() => requestSelection({ mode: "new" })}
            searchValue={collection.search}
            onSearchChange={(value) =>
              clearSelectionThen(() => collection.setSearch(value))
            }
            searchLabel="독립 시설 검색"
            searchPlaceholder="시설명 또는 설명 검색"
            filters={
              <select
                value={typeFilter}
                onChange={(event) => {
                  const next = event.target.value;
                  clearSelectionThen(() => {
                    setTypeFilter(next);
                    setPage(1);
                  });
                }}
                aria-label="시설 유형 필터"
              >
                <option value="all">모든 유형</option>
                {facilityTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.label}
                  </option>
                ))}
              </select>
            }
            chips={chips}
            activeChip={collection.chip}
            onChipChange={(key) =>
              clearSelectionThen(() =>
                collection.setChip(key as AdminChip<FacilityChip>),
              )
            }
            sort={collection.sort}
            onSortChange={(sort) =>
              clearSelectionThen(() => collection.setSort(sort))
            }
            sortLabel="독립 시설 정렬"
            status={typesFailed ? "error" : status}
            errorMessage="시설 목록을 불러오지 못했어요."
            onRetry={retry}
            matchedCount={view.matched.length}
            page={view.page}
            onPageChange={(page) => clearSelectionThen(() => setPage(page))}
            legend={facilityTypes.map((type) => ({
              label: type.label ?? type.code,
              color: getFacilityMarkerColor(type.code),
            }))}
          >
            {view.pageItems.map((facility) => (
              <FacilityListRow
                key={facility.id}
                facility={facility}
                selected={facility.id === selected?.id}
                onSelect={() => select(facility.id)}
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
