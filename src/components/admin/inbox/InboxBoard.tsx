import type { RefObject } from "react";
import {
  columnCount,
  type InboxBoardState,
  type InboxCard,
  type InboxKind,
  type InboxKindFilter,
} from "@/lib/inboxBoard";
import type { InboxFilter } from "@/lib/inboxStatus";
import InboxColumn from "./InboxColumn";

const BOARD_COLUMNS: { filter: InboxFilter; name: string }[] = [
  { filter: "new", name: "신규" },
  { filter: "reviewing", name: "확인 중" },
  { filter: "done", name: "처리 완료" },
];

/** 데스크톱 보드의 열 구성. useInboxBoard 옵션과 같은 순서다. */
export const DESKTOP_BOARD_COLUMNS: InboxFilter[] = BOARD_COLUMNS.map(
  ({ filter }) => filter,
);

const KIND_SEGMENTS: { value: InboxKindFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "requests", label: "등록 요청" },
  { value: "feedback", label: "피드백" },
];

interface InboxBoardProps {
  state: InboxBoardState;
  kindFilter: InboxKindFilter;
  kinds: InboxKind[];
  building: number | null;
  typeLabels: Map<string, string>;
  /** 드로어가 닫힐 때 돌아갈 카드가 사라졌으면 초점을 받는 제목 */
  titleRef: RefObject<HTMLHeadingElement | null>;
  onKindChange: (kind: InboxKindFilter) => void;
  onClearBuilding: () => void;
  onOpen: (card: InboxCard, origin: InboxFilter) => void;
  onLoadMore: (filter: InboxFilter, kinds: InboxKind[]) => void;
  onRetryFirstPage: (filter: InboxFilter, kind: InboxKind) => void;
}

export default function InboxBoard({
  state,
  kindFilter,
  kinds,
  building,
  typeLabels,
  titleRef,
  onKindChange,
  onClearBuilding,
  onOpen,
  onLoadMore,
  onRetryFirstPage,
}: InboxBoardProps) {
  // 처리 전 개수는 신규·확인 중 두 열의 합이다. 한 열이라도 아직 모르면 숫자를 빼서 절반만 받은 합을 보이지 않는다.
  const pendingCounts = state.columns
    .filter(
      (column) => column.filter === "new" || column.filter === "reviewing",
    )
    .map((column) => columnCount(column, kinds));
  const pending = pendingCounts.every((count) => count !== null)
    ? pendingCounts.reduce<number>((sum, count) => sum + (count ?? 0), 0)
    : null;

  return (
    <div className="ku-inbox-page">
      <div className="ku-inbox-board-head">
        <div>
          <h1 ref={titleRef} tabIndex={-1} className="ku-admin-title">
            제보함
          </h1>
          <p className="ku-inbox-caption">
            {pending === null
              ? "카드를 눌러 검토해요"
              : `처리 전 ${pending}건 · 카드를 눌러 검토해요`}
          </p>
        </div>
        <div className="ku-inbox-board-tools">
          {building !== null && (
            <span className="ku-inbox-building-chip">
              건물로 거름
              <button
                type="button"
                aria-label="건물 필터 해제"
                onClick={onClearBuilding}
              >
                ✕
              </button>
            </span>
          )}
          <div
            className="ku-detail-segment ku-inbox-kind-segment"
            role="group"
            aria-label="제보 종류"
          >
            {KIND_SEGMENTS.map((segment) => (
              <button
                key={segment.value}
                type="button"
                aria-pressed={kindFilter === segment.value}
                disabled={building !== null && segment.value !== "requests"}
                onClick={() => onKindChange(segment.value)}
              >
                {segment.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="ku-inbox-columns">
        {BOARD_COLUMNS.map(({ filter, name }) => {
          const column = state.columns.find((entry) => entry.filter === filter);
          return column ? (
            <InboxColumn
              key={filter}
              column={column}
              kinds={kinds}
              name={name}
              typeLabels={typeLabels}
              onOpen={onOpen}
              onLoadMore={onLoadMore}
              onRetryFirstPage={onRetryFirstPage}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}
