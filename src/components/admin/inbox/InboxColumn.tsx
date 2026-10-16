import {
  columnCards,
  columnCount,
  hasMorePages,
  inboxCardKey,
  type InboxBoardState,
  type InboxCard,
  type InboxKind,
} from "@/lib/inboxBoard";
import type { InboxFilter } from "@/lib/inboxStatus";
import InboxCardButton from "./InboxCardButton";

const KIND_FAILURE_MESSAGES: Record<InboxKind, string> = {
  requests: "등록 요청을 불러오지 못했어요",
  feedback: "피드백을 불러오지 못했어요",
};

interface InboxColumnProps {
  column: InboxBoardState["columns"][number];
  kinds: InboxKind[];
  name: string;
  typeLabels: Map<string, string>;
  onOpen: (card: InboxCard, origin: InboxFilter) => void;
  onLoadMore: (filter: InboxFilter, kinds: InboxKind[]) => void;
  onRetryFirstPage: (filter: InboxFilter, kind: InboxKind) => void;
}

export default function InboxColumn({
  column,
  kinds,
  name,
  typeLabels,
  onOpen,
  onLoadMore,
  onRetryFirstPage,
}: InboxColumnProps) {
  const sources = kinds.flatMap((kind) => {
    const source = column.sources[kind];
    return source ? [{ kind, source }] : [];
  });
  const cards = columnCards(column, kinds);
  const count = columnCount(column, kinds);
  const failed = sources.filter(({ source }) => source.status === "error");
  const loading = sources.some(({ source }) => source.status === "loading");
  const allReady = sources.every(({ source }) => source.status === "ready");
  const moreLoading = sources.some(({ source }) => source.more === "loading");
  const moreFailed = sources.some(({ source }) => source.more === "error");
  const moreAvailable = sources.some(
    ({ source }) => source.status === "ready" && hasMorePages(source),
  );

  return (
    <section
      className="ku-inbox-column"
      aria-label={name}
      data-filter={column.filter}
    >
      <header className="ku-inbox-column-head">
        <span className="ku-inbox-column-dot" aria-hidden="true" />
        <h2 className="ku-inbox-column-name">{name}</h2>
        {count !== null && (
          <span
            className="ku-inbox-column-count"
            data-testid="inbox-column-count"
          >
            {count}
          </span>
        )}
      </header>
      <div className="ku-inbox-column-body">
        {failed.map(({ kind }) => (
          <div key={kind} className="ku-inbox-column-notice" role="alert">
            <span>{KIND_FAILURE_MESSAGES[kind]}</span>
            <button
              type="button"
              className="ku-inbox-retry"
              onClick={() => onRetryFirstPage(column.filter, kind)}
            >
              다시 시도
            </button>
          </div>
        ))}
        {cards.length > 0 && (
          <ul className="ku-inbox-card-list" aria-label={`${name} 카드`}>
            {cards.map((card) => (
              <li key={inboxCardKey(card)}>
                <InboxCardButton
                  card={card}
                  typeLabels={typeLabels}
                  onOpen={(opened) => onOpen(opened, column.filter)}
                />
              </li>
            ))}
          </ul>
        )}
        {loading && <p className="ku-inbox-column-hint">불러오는 중...</p>}
        {allReady && cards.length === 0 && (
          <div className="ku-inbox-column-empty">비어 있어요</div>
        )}
        {moreFailed ? (
          <div className="ku-inbox-column-notice" role="alert">
            <span>더 불러오지 못했어요</span>
            <button
              type="button"
              className="ku-inbox-retry"
              onClick={() => onLoadMore(column.filter, kinds)}
            >
              다시 시도
            </button>
          </div>
        ) : (
          moreAvailable && (
            <button
              type="button"
              className="ku-inbox-more"
              disabled={moreLoading}
              onClick={() => onLoadMore(column.filter, kinds)}
            >
              더 보기
            </button>
          )
        )}
      </div>
    </section>
  );
}
