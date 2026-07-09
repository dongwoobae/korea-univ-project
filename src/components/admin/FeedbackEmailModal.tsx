"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function FeedbackEmailModal({ initialEmails, onClose, onSaved }) {
  const [to, setTo] = useState(initialEmails?.to ?? "");
  const [ccList, setCcList] = useState(() => {
    const raw = initialEmails?.cc;
    if (Array.isArray(raw)) return raw.length > 0 ? raw : [""];
    if (typeof raw === "string" && raw) return [raw];
    return [""];
  });
  const [subject, setSubject] = useState(initialEmails?.subject ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function updateCc(i, value) {
    setCcList((list) => list.map((v, idx) => (idx === i ? value : v)));
  }
  function addCc() { setCcList((list) => [...list, ""]); }
  function removeCc(i) {
    setCcList((list) => (list.length === 1 ? [""] : list.filter((_, idx) => idx !== i)));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("로그인 세션 없음");

      const cc = ccList.map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/settings/feedback-emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to: to.trim(), cc, subject: subject.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장 실패");
      onSaved?.(json.value);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    fontSize: 13,
    border: "1px solid #d1d5db",
    borderRadius: 6,
    boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 12, color: "#555", fontWeight: 600, marginBottom: 6, display: "block" };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, padding: 24,
          width: "90%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18 }}>피드백 이메일 변경</div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>수신</label>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>참조</label>
          {ccList.map((v, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input
                type="email"
                value={v}
                onChange={(e) => updateCc(i, e.target.value)}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => removeCc(i)}
                style={{
                  flexShrink: 0, width: 32, fontSize: 14, color: "#888",
                  background: "#f3f4f6", border: "1px solid #d1d5db",
                  borderRadius: 6, cursor: "pointer",
                }}
                aria-label="삭제"
              >
                −
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addCc}
            style={{
              fontSize: 12, color: "#2563EB", background: "none",
              border: "1px dashed #2563EB", borderRadius: 6,
              padding: "5px 10px", cursor: "pointer",
            }}
          >
            + 참조 추가
          </button>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>제목</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "#DC2626", marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              fontSize: 13, color: "#555", background: "#fff",
              border: "1px solid #d1d5db", borderRadius: 6,
              padding: "8px 14px", cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              fontSize: 13, color: "#fff", background: "#2563EB",
              border: "none", borderRadius: 6,
              padding: "8px 14px", cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
