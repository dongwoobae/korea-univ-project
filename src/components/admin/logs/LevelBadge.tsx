const TONES: Record<string, string> = {
  info: "neutral",
  warning: "warn",
  error: "missing",
};

/** 글자와 색을 함께 쓴다. 색만으로 구분하지 않는다(설계 5.2). */
export default function LevelBadge({ level }: { level: string }) {
  return (
    <span className="ku-row-badge" data-tone={TONES[level] ?? "neutral"}>
      {level}
    </span>
  );
}
