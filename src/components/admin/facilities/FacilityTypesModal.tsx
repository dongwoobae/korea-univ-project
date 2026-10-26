"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import FacilityTypeForm from "@/components/admin/facilities/FacilityTypeForm";
import { FACILITY_ICON } from "@/components/map/iconography";
import { reportFailure } from "@/lib/activityReport";
import { authedFetch } from "@/lib/authedFetch";
import {
  focusDirectionAfterMove,
  swapFailureAction,
  type PhotoMoveDirection,
} from "@/lib/buildingPhotoOrder";
import { facilityStyleOf } from "@/lib/facilityStyleCatalog";
import {
  TYPE_WRITE_MISSED,
  deleteBlockReason,
  deleteFacilityType,
  fetchFacilityTypeUsage,
  insertFacilityType,
  typeSwapArgs,
  updateFacilityType,
  withPendingSwap,
  type FacilityTypePayload,
  type FacilityTypeUsage,
} from "@/lib/facilityTypeAdmin";
import {
  reloadFacilityTypes,
  useFacilityTypes,
} from "@/lib/facilityTypesStore";
import { supabase } from "@/lib/supabaseClient";
import { useModalFocus } from "@/lib/useModalFocus";
import type { FacilityType } from "@/types/domain";

const MOVE_DIRECTIONS = ["earlier", "later"] as const;
const moveLabel: Record<PhotoMoveDirection, string> = {
  earlier: "위로",
  later: "아래로",
};
const MoveIcon: Record<PhotoMoveDirection, typeof ChevronUp> = {
  earlier: ChevronUp,
  later: ChevronDown,
};

type UsageState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; usage: FacilityTypeUsage };
type View = { mode: "list" } | { mode: "form"; editing: FacilityType | null };

function orderButtonKey(code: string, direction: PhotoMoveDirection) {
  return `${code}:${direction}`;
}

// 공개 /api/facilities는 시설에 붙인 종류 이름을 캐시한다(설계 3.3)
async function revalidatePublicFacilities() {
  await authedFetch("/api/revalidate-facilities", { method: "POST" }).catch(
    () => {},
  );
}

interface FacilityTypesModalProps {
  /** changed: 종류를 고치거나 지웠다 — 시설 탭이 시설에 붙은 종류 이름을 다시 읽는다(설계 3.3) */
  onClose: (changed: boolean) => void;
  showToast: (message: string, type?: string) => void;
}

/** 설계: docs/specs/2026-10-26-facility-type-management-design.md 3장 */
export default function FacilityTypesModal({
  onClose,
  showToast,
}: FacilityTypesModalProps) {
  const { types, status } = useFacilityTypes();
  const [view, setView] = useState<View>({ mode: "list" });
  const [usage, setUsage] = useState<UsageState>({ status: "loading" });
  const [pendingSwap, setPendingSwap] = useState<{
    p_first: string;
    p_second: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FacilityType | null>(null);
  const [saving, setSaving] = useState(false);
  const changedRef = useRef(false);
  const orderButtons = useRef(new Map<string, HTMLButtonElement>());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const baseId = useId();
  const close = () => onClose(changedRef.current);
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose: close,
    initialFocusRef: titleRef,
    // 저장 중에 닫히면 고친 이름을 시설 탭이 다시 읽지 못한다
    closeOnEscape: !saving,
  });
  // 저장 중인 맞바꾸기를 받은 목록 위에 겹쳐 그린다. 다시 받기가 끝난 뒤 걷는다 — 먼저 걷으면 옛 순서로 잠깐 돌아간다
  const shown = withPendingSwap(types, pendingSwap);
  const editing = view.mode === "form" ? view.editing : null;
  // 받기에 실패한 목록은 낡았을 수 있다. 그것으로 이름 겹침을 검사하거나 순서를 판정하지 않는다(설계 3.2)
  const writable = status !== "error";

  const refreshUsage = useCallback(async () => {
    const result = await fetchFacilityTypeUsage();
    setUsage(result ? { status: "ready", usage: result } : { status: "error" });
  }, []);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  function retryUsage() {
    setUsage({ status: "loading" });
    void refreshUsage();
  }

  function showList() {
    flushSync(() => setView({ mode: "list" }));
    titleRef.current?.focus();
  }

  function orderButtonRef(code: string, direction: PhotoMoveDirection) {
    const key = orderButtonKey(code, direction);
    return (element: HTMLButtonElement | null) => {
      if (element) orderButtons.current.set(key, element);
      else orderButtons.current.delete(key);
    };
  }

  async function handleMove(index: number, direction: PhotoMoveDirection) {
    if (pendingSwap || !writable) return;
    const args = typeSwapArgs(shown, index, direction);
    if (!args) return;
    const movedCode = shown[index].code;
    const movedTo = direction === "earlier" ? index - 1 : index + 1;
    // 자리를 바꾸면 버튼이 DOM에서 빠졌다 들어오거나 끝 화살표가 꺼져 초점이 사라진다. 그린 뒤 옮긴 종류의 화살표로 돌려준다
    flushSync(() => setPendingSwap(args));
    orderButtons.current
      .get(
        orderButtonKey(
          movedCode,
          focusDirectionAfterMove(movedTo, shown.length, direction),
        ),
      )
      ?.focus();

    const { error, status: httpStatus } = await supabase.rpc(
      "swap_facility_type_order",
      args,
    );
    if (!error) {
      await reloadFacilityTypes();
    } else {
      const action = swapFailureAction(error.code);
      // 다시 받기마저 실패하면 저장소에 누르기 전 목록이 남아, 겹친 맞바꾸기를 걷으면 그 순서로 돌아간다
      if (action === "reload" && (await reloadFacilityTypes())) {
        showToast("순서가 바뀌어 다시 불러왔어요", "warning");
      } else {
        showToast("종류 순서를 바꾸지 못했어요", "error");
      }
      if (action === "revert") {
        // 브라우저 쓰기 실패를 보고하는 관문(reportingFetch)이 rpc/를 건너뛴다
        void reportFailure({
          source: {
            kind: "postgrest",
            status: httpStatus,
            error: { code: error.code, message: error.message },
          },
          action: "facility_types.update",
          target: { table: "facility_types", id: movedCode },
        });
      }
    }
    setPendingSwap(null);
  }

  // 그사이 다른 관리자가 지웠거나 권한이 사라졌다 — 목록과 현황을 서버에 맞춘다(설계 3.3)
  async function handleMissed() {
    await Promise.all([reloadFacilityTypes(), refreshUsage()]);
    showToast("그사이 지워졌거나 권한이 없어 바꾸지 못했어요", "error");
  }

  async function handleSave(
    target: FacilityType | null,
    payload: FacilityTypePayload,
  ) {
    setSaving(true);
    const result = target
      ? await updateFacilityType(target.code, payload)
      : await insertFacilityType(payload);
    if (!result.ok) {
      const missed = result.code === TYPE_WRITE_MISSED;
      if (missed) await handleMissed();
      else showToast("종류를 저장하지 못했어요", "error");
      setSaving(false);
      if (missed) showList();
      return;
    }
    if (target) {
      changedRef.current = true;
      await revalidatePublicFacilities();
    }
    await Promise.all([reloadFacilityTypes(), refreshUsage()]);
    setSaving(false);
    showList();
    showToast(target ? "종류를 고쳤어요" : "종류를 추가했어요");
  }

  async function handleDelete(type: FacilityType) {
    const result = await deleteFacilityType(type.code);
    if (!result.ok) {
      setConfirmDelete(null);
      if (result.code === "23503") {
        // 센 뒤 지우기 전 사이에 누가 이 종류로 시설을 붙였다(설계 3.4)
        await refreshUsage();
        showToast(
          "그사이 이 종류를 쓰는 시설이 생겨 지우지 못했어요",
          "warning",
        );
      } else if (result.code === TYPE_WRITE_MISSED) {
        await handleMissed();
      } else {
        showToast("종류를 삭제하지 못했어요", "error");
      }
      return;
    }
    changedRef.current = true;
    await revalidatePublicFacilities();
    await Promise.all([reloadFacilityTypes(), refreshUsage()]);
    // 목록을 다시 받은 뒤 닫는다. 먼저 닫으면 초점이 곧 사라질 삭제 버튼으로 돌아간다
    setConfirmDelete(null);
    showToast("종류를 삭제했어요");
  }

  return (
    <>
      <div
        className="ku-types-modal-backdrop"
        role="presentation"
        // click으로 받으면 안에서 끌다 밖에서 놓아도 닫힌다
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) close();
        }}
      >
        <div
          ref={dialogRef}
          className="ku-types-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${baseId}-title`}
        >
          <h2 id={`${baseId}-title`} ref={titleRef} tabIndex={-1}>
            시설 종류 관리
          </h2>
          {status === "error" && (
            <div className="ku-types-modal-alert" role="alert">
              <span>종류 목록을 새로 불러오지 못했어요</span>
              <button
                type="button"
                className="ku-workspace-button"
                onClick={() => void reloadFacilityTypes()}
              >
                다시 시도
              </button>
            </div>
          )}
          {view.mode === "form" ? (
            <FacilityTypeForm
              key={editing?.code ?? "new"}
              editing={editing}
              types={types}
              saving={saving}
              locked={!writable}
              onBack={showList}
              onSubmit={(payload) => void handleSave(editing, payload)}
              showToast={showToast}
            />
          ) : (
            <>
              {usage.status === "error" && (
                <div className="ku-types-modal-alert" role="alert">
                  <span>사용 현황을 불러오지 못했어요</span>
                  <button
                    type="button"
                    className="ku-workspace-button"
                    onClick={retryUsage}
                  >
                    다시 시도
                  </button>
                </div>
              )}
              <div className="ku-types-modal-toolbar">
                <button
                  type="button"
                  className="ku-workspace-primary"
                  disabled={!writable}
                  onClick={() => setView({ mode: "form", editing: null })}
                >
                  ＋ 종류 추가
                </button>
              </div>
              <ul className="ku-types-modal-list">
                {shown.map((type, index) => {
                  const label = type.label ?? type.code;
                  const style = facilityStyleOf(types, type.code);
                  const Icon = FACILITY_ICON[style.icon];
                  const reason =
                    usage.status === "ready"
                      ? deleteBlockReason(usage.usage, type.code)
                      : null;
                  const usageText =
                    usage.status === "loading"
                      ? "사용 현황 확인 중"
                      : usage.status === "error"
                        ? "사용 현황 모름"
                        : (reason ?? "쓰는 시설 없음");
                  const usageId = `${baseId}-usage-${type.code}`;
                  return (
                    <li key={type.code} className="ku-types-modal-row">
                      <span
                        className="ku-types-modal-swatch"
                        style={{ background: style.color }}
                      >
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="ku-types-modal-names">
                        <span className="ku-types-modal-label">{label}</span>
                        <span className="ku-types-modal-translations">
                          {type.label_en ?? "영어 이름 없음"} ·{" "}
                          {type.label_zh ?? "중국어 이름 없음"}
                        </span>
                        <span id={usageId} className="ku-types-modal-usage">
                          {usageText}
                        </span>
                      </span>
                      <span className="ku-types-modal-controls">
                        {MOVE_DIRECTIONS.map((direction) => {
                          const Arrow = MoveIcon[direction];
                          return (
                            <button
                              key={direction}
                              type="button"
                              ref={orderButtonRef(type.code, direction)}
                              className="ku-photo-order-button"
                              disabled={
                                typeSwapArgs(shown, index, direction) === null
                              }
                              // 잠금을 disabled로 걸면 누른 버튼이 키보드 초점을 잃는다
                              aria-disabled={
                                pendingSwap !== null || !writable || undefined
                              }
                              aria-label={`${label} ${moveLabel[direction]} 옮기기`}
                              onClick={() => void handleMove(index, direction)}
                            >
                              <Arrow size={16} aria-hidden="true" />
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          className="ku-workspace-button"
                          aria-label={`${label} 수정`}
                          disabled={!writable}
                          onClick={() =>
                            setView({ mode: "form", editing: type })
                          }
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="ku-workspace-button"
                          aria-label={`${label} 삭제`}
                          aria-describedby={usageId}
                          disabled={
                            !writable ||
                            usage.status !== "ready" ||
                            reason !== null
                          }
                          onClick={() => setConfirmDelete(type)}
                        >
                          삭제
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="ku-types-modal-actions">
                <button
                  type="button"
                  className="ku-workspace-button"
                  onClick={close}
                >
                  닫기
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {confirmDelete && (
        <ConfirmModal
          message="종류를 삭제할까요?"
          description={`${confirmDelete.label ?? confirmDelete.code} 종류를 지워요. 되돌릴 수 없어요.`}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
