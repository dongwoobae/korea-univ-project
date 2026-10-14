"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";
import FacilityListRow from "@/components/admin/facilities/FacilityListRow";
import AdminMapWorkspace from "@/components/admin/workspace/AdminMapWorkspace";
import WorkspaceListPanel from "@/components/admin/workspace/WorkspaceListPanel";
import {
  ADMIN_MOBILE_QUERY,
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
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const loadRequestRef = useRef(0);
  const loadedRef = useRef(false);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
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
    if (ticket !== loadRequestRef.current) return null;
    if (error) {
      if (loadedRef.current) {
        setToast({
          message: "시설 목록을 새로 불러오지 못했어요",
          type: "error",
        });
      } else {
        setStatus("error");
      }
      return null;
    }
    const rows: FacilityWithType[] = data ?? [];
    loadedRef.current = true;
    setFacilities(rows);
    setStatus("ready");
    // 존재 검사는 조회가 끝난 뒤에만 한다. 조회 전 빈 목록으로 판정하면 맞는 링크도 닫힌다(설계 2026-10-14 3.4)
    const selection = currentSelection();
    if (
      selection.mode === "view" &&
      !rows.some((row) => row.id === selection.id)
    ) {
      applyWorkspaceState({ mode: "closed" });
      setToast({ message: NOT_FOUND_MESSAGE, type: "warning" });
    }
    return rows;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      void loadTypes();
      const rows = await loadFacilities();
      const selection = currentSelection();
      if (!rows || selection.mode !== "view") return;
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
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadFacilities, loadTypes, setPage]);

  function requestSelection(next: WorkspaceState, alsoApply?: () => void) {
    request(next, alsoApply);
  }

  // 칩·검색·정렬·유형·페이지를 바꾸면 선택을 푼다(설계 2026-10-14 3.3)
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
    setStatus("loading");
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
            draft={null}
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
        detail={null}
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
