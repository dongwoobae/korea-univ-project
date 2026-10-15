import { formatAdminReceivedAt } from "@/lib/adminList";
import { FEEDBACK_TYPES } from "@/lib/feedback";
import type { InboxCard } from "@/lib/inboxBoard";
import {
  FEEDBACK_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
} from "@/lib/inboxStatus";

const FEEDBACK_TYPE_LABELS = new Map<string, string>(
  FEEDBACK_TYPES.map((type) => [type.value, type.label]),
);

interface InboxCardButtonProps {
  card: InboxCard;
  typeLabels: Map<string, string>;
  onOpen: (card: InboxCard) => void;
}

export default function InboxCardButton({
  card,
  typeLabels,
  onOpen,
}: InboxCardButtonProps) {
  const isRequest = card.kind === "requests";
  const item = card.item;
  const title =
    card.kind === "requests"
      ? `${typeLabels.get(card.item.facility_code) ?? card.item.facility_code} · ${
          card.item.building_name ?? `건물 ${card.item.building_id}`
        }${card.item.floor_info ? ` ${card.item.floor_info}` : ""}`
      : (FEEDBACK_TYPE_LABELS.get(card.item.feedback_type) ??
        card.item.feedback_type);
  const description =
    card.kind === "requests" ? card.item.description : card.item.content;
  const statusLabel =
    card.kind === "requests"
      ? REQUEST_STATUS_LABELS[card.item.status]
      : FEEDBACK_STATUS_LABELS[card.item.status];

  return (
    <button
      type="button"
      className="ku-inbox-card"
      aria-label={title}
      onClick={() => onOpen(card)}
    >
      <span className="ku-inbox-card-top">
        <span className="ku-inbox-kind-tag">
          {isRequest ? "등록 요청" : "피드백"}
        </span>
        {item.status === "new" && (
          <span className="ku-inbox-new-dot" aria-hidden="true" />
        )}
        <span className="ku-inbox-card-time">
          {formatAdminReceivedAt(item.created_at)}
        </span>
      </span>
      <span className="ku-inbox-card-body">
        {card.kind === "requests" &&
          (card.item.thumbnail_url ? (
            <img
              className="ku-inbox-thumb"
              src={card.item.thumbnail_url}
              alt=""
            />
          ) : (
            <span
              className="ku-inbox-thumb ku-inbox-thumb--empty"
              aria-hidden="true"
            />
          ))}
        <span className="ku-inbox-card-text">
          <span
            className="ku-inbox-card-title"
            data-unread={item.status === "new"}
          >
            {title}
          </span>
          {description && (
            <span className="ku-inbox-card-desc">{description}</span>
          )}
        </span>
      </span>
      <span className="ku-inbox-card-foot">
        <span className="ku-inbox-status" data-status={item.status}>
          {statusLabel}
        </span>
        {card.kind === "requests" && (
          <span className="ku-inbox-card-meta">
            사진 {card.item.photo_count} ·{" "}
            {card.item.has_location ? "위치 있음" : "위치 없음"}
          </span>
        )}
      </span>
    </button>
  );
}
