import { INBOX_FILTERS, type InboxFilter } from "@/lib/inboxStatus";

export default function InboxFilterSelect({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (next: InboxFilter) => void;
}) {
  return (
    <select
      aria-label="상태 필터"
      value={value}
      onChange={(event) => onChange(event.target.value as InboxFilter)}
    >
      {INBOX_FILTERS.map((filter) => (
        <option key={filter.value} value={filter.value}>
          {filter.label}
        </option>
      ))}
    </select>
  );
}
