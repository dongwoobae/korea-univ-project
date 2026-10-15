import type { RefObject } from "react";
import {
  columnCards,
  hasMorePages,
  inboxCardKey,
  type InboxBoardState,
  type InboxCard,
  type InboxKind,
} from "@/lib/inboxBoard";
import { INBOX_FILTERS, type InboxFilter } from "@/lib/inboxStatus";
import InboxCardButton from "./InboxCardButton";

const KIND_SEGMENTS: { value: InboxKind; label: string }[] = [
  { value: "requests", label: "등록 요청" },
  { value: "feedback", label: "피드백" },
];

const KIND_FAILURE_MESSAGES: Record<InboxKind, string> = {
  requests: "등록 요청을 불러오지 못했어요",
  feedback: "피드백을 불러오지 못했어요",
};

// 모바일 칩에는 짧은 이름을 쓴다. 값은 INBOX_FILTERS 다섯 개 그대로다.
const CHIP_LABELS: Partial<Record<InboxFilter, string>> = { open: "처리 전" };

interface InboxMobileListProps {
  /** 고른 상태 칩 하나가 열 하나다 */
  state: InboxBoardState;
  kind: InboxKind;
  filter: InboxFilter;
  building: number | null;
  typeLabels: Map<string, string>;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onKindChange: (kind: InboxKind) => void;
  onFilterChange: (filter: InboxFilter) => void;
  onClearBuilding: () => void;
  onOpen: (card: InboxCard, origin: InboxFilter) => void;
  onLoadMore: (filter: InboxFilter, kinds: InboxKind[]) => void;
  onRetryFirstPage: (filter: InboxFilter, kind: InboxKind) => void;
}

export default function InboxMobileList({
  state,
  kind,
  filter,
  building,
  typeLabels,
  titleRef,
  onKindChange,
  onFilterChange,
  onClearBuilding,
  onOpen,
  onLoadMore,
  onRetryFirstPage,
}: InboxMobileListProps) {
  const column = state.columns.find((entry) => entry.filter === filter);
  const source = column?.sources[kind];
  const cards = column ? columnCards(column, [kind]) : [];

  return (
    <div className="ku-inbox-page ku-inbox-mobile">
      <h1 ref={titleRef} tabIndex={-1} className="ku-admin-title">
        제보함
      </h1>
      <div
        className="ku-detail-segment ku-inbox-mobile-segment"
        role="group"
        aria-label="제보 종류"
      >
        {KIND_SEGMENTS.map((segment) => {
          const counted = column?.sources[segment.value];
          return (
            <button
              key={segment.value}
              type="button"
              aria-pressed={kind === segment.value}
              disabled={building !== null && segment.value !== "requests"}
              onClick={() => onKindChange(segment.value)}
            >
              {segment.label}
              {counted?.status === "ready" && <span> {counted.total}</span>}
            </button>
          );
        })}
      </div>
      <div className="ku-chip-row ku-inbox-mobile-chips">
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
        {INBOX_FILTERS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className="ku-chip"
            aria-pressed={filter === entry.value}
            onClick={() => onFilterChange(entry.value)}
          >
            {CHIP_LABELS[entry.value] ?? entry.label}
          </button>
        ))}
      </div>
      {source?.status === "error" && (
        <div className="ku-inbox-column-notice" role="alert">
          <span>{KIND_FAILURE_MESSAGES[kind]}</span>
          <button
            type="button"
            className="ku-inbox-retry"
            onClick={() => onRetryFirstPage(filter, kind)}
          >
            다시 시도
          </button>
        </div>
      )}
      {cards.length > 0 && (
        <ul
          className="ku-inbox-card-list ku-inbox-mobile-cards"
          aria-label="제보 목록"
        >
          {cards.map((card) => (
            <li key={inboxCardKey(card)}>
              <InboxCardButton
                card={card}
                typeLabels={typeLabels}
                onOpen={(opened) => onOpen(opened, filter)}
              />
            </li>
          ))}
        </ul>
      )}
      {source?.status === "loading" && (
        <p className="ku-inbox-column-hint">불러오는 중...</p>
      )}
      {source?.status === "ready" && cards.length === 0 && (
        <div className="ku-inbox-column-empty">조건에 맞는 항목이 없어요</div>
      )}
      {source?.more === "error" ? (
        <div className="ku-inbox-column-notice" role="alert">
          <span>더 불러오지 못했어요</span>
          <button
            type="button"
            className="ku-inbox-retry"
            onClick={() => onLoadMore(filter, [kind])}
          >
            다시 시도
          </button>
        </div>
      ) : (
        source?.status === "ready" &&
        hasMorePages(source) && (
          <button
            type="button"
            className="ku-inbox-more"
            disabled={source.more === "loading"}
            onClick={() => onLoadMore(filter, [kind])}
          >
            더 보기
          </button>
        )
      )}
    </div>
  );
}
