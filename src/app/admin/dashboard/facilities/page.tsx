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
  type WorkspaceFocus,
} from "@/components/admin/workspace/types";
import { useAdminCollection } from "@/components/admin/workspace/useAdminCollection";
import {
  applyWorkspaceState,
  useWorkspaceSelection,
} from "@/components/admin/workspace/useWorkspaceSelection";
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
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [typesFailed, setTypesFailed] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [draft, setDraft] = useState<DetailDraftPin | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const loadRequestRef = useRef(0);
  const loadedRef = useRef(false);
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
    const { data, error } = await supabase.from("facility_types").select("*");
    setTypesFailed(Boolean(error));
    if (!error) setFacilityTypes(data ?? []);
  }, []);

  const loadFacilities = useCallback(async () => {
    loadRequestRef.current += 1;
    const ticket = loadRequestRef.current;
    const { data, error } = await supabase
      .from("building_facilities")
      .select(FACILITY_SELECT)
      .is("building_id", null)
      .order("id", { ascending: true });
    // 저장·설치 변경 뒤의 다시 받기가 겹치면 마지막 요청만 그린다
    if (ticket !== loadRequestRef.current) return;
    if (error) {
      if (loadedRef.current) {
        setToast({
          message: "시설 목록을 새로 불러오지 못했어요",
          type: "error",
        });
      } else {
        setStatus("error");
      }
      return;
    }
    const rows: FacilityWithType[] = data ?? [];
    const firstLoad = !loadedRef.current;
    loadedRef.current = true;
    setFacilities(rows);
    setStatus("ready");
    // 존재 검사는 조회가 끝난 뒤에만 한다. 조회 전 빈 목록으로 판정하면 맞는 링크도 닫힌다(설계 2026-10-14 3.4)
    const selection = currentSelection();
    if (selection.mode !== "view") return;
    if (!rows.some((row) => row.id === selection.id)) {
      applyWorkspaceState({ mode: "closed" });
      setToast({ message: NOT_FOUND_MESSAGE, type: "warning" });
      return;
    }
    // 페이지는 첫 성공에서만 맞춘다. 저장 뒤 다시 받기는 보던 페이지를 두고, 첫 조회가 실패했으면 다시 시도가 첫 성공이다
    if (firstLoad) {
      const page = pageOfItem(
        viewAdminCollection(
          rows,
          FACILITY_COLLECTION_POLICY,
          INITIAL_ADMIN_COLLECTION_QUERY,
        ).matched,
        selection.id,
        FACILITY_COLLECTION_POLICY.id,
      );
      if (page !== null) setPage(page);
    }
  }, [setPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTypes();
      void loadFacilities();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      // 떠난 뒤에 끝난 조회가 그때의 주소(다른 화면)에서 ?id=를 지우지 않게 진행 중인 요청을 버린다
      loadRequestRef.current += 1;
    };
  }, [loadFacilities, loadTypes]);

  // 저장 중에는 선택을 바꾸지 않는다 — 행·마커·닫기·칩을 막는다(설계 2026-10-14 3.4)
  function requestSelection(next: WorkspaceState, alsoApply?: () => void) {
    if (saving) return;
    request(next, alsoApply);
  }

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

  async function handleSaved(facilityId: string, created: boolean) {
    await loadFacilities();
    // 늦게 끝난 저장이 그사이 바뀐 화면을 덮지 않게, 아직 그 새로 만들기 패널일 때만 바꾼다(설계 2026-10-14 3.4)
    if (created && currentSelection().mode === "new") {
      applyWorkspaceState({ mode: "view", id: facilityId });
    }
  }

  async function handleDeleted() {
    applyWorkspaceState({ mode: "closed" });
    await loadFacilities();
  }

  function retry() {
    // 목록을 받은 뒤에 "loading"으로 가면, 이번 조회가 실패할 때 loadFacilities가 토스트만 띄워 패널이 거기 멈춘다
    if (!loadedRef.current) setStatus("loading");
    setTypesFailed(false);
    void loadTypes();
    void loadFacilities();
  }

  const focus: WorkspaceFocus | null =
    selected && selected.lat != null && selected.lng != null
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
