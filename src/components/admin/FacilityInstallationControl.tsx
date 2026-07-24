interface FacilityInstallationControlProps {
  installed: boolean | null;
  pending: boolean;
  onToggle: () => void;
}

export default function FacilityInstallationControl({
  installed,
  pending,
  onToggle,
}: FacilityInstallationControlProps) {
  const isInstalled = installed === true;
  const currentStatus = isInstalled ? "설치" : "미설치";
  const nextStatus = isInstalled ? "미설치" : "설치";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
      }}
    >
      <span
        role="status"
        aria-label={`현재 상태: ${currentStatus}`}
        style={{
          fontSize: 12,
          padding: "4px 10px",
          borderRadius: 20,
          fontWeight: 600,
          whiteSpace: "nowrap",
          background: isInstalled
            ? "var(--ku-status-installed-bg)"
            : "var(--ku-status-missing-bg)",
          color: isInstalled
            ? "var(--ku-status-installed-fg)"
            : "var(--ku-status-missing-fg)",
        }}
      >
        현재 상태: {currentStatus}
      </span>
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        className="ku-admin-row-action"
        aria-label={pending ? "시설 상태 변경 중" : `${nextStatus}로 변경`}
        style={{
          fontSize: 12,
          padding: "4px 8px",
          border: "1px solid var(--ku-border)",
          borderRadius: 6,
          background: "var(--ku-surface)",
          color: "var(--ku-text-2)",
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.65 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {pending ? "변경 중..." : `${nextStatus}로 변경`}
      </button>
    </div>
  );
}
