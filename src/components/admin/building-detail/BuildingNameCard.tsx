"use client";

import type { Dispatch, SetStateAction } from "react";

export interface BuildingNameForm {
  name: string;
  name_en: string;
}

export default function BuildingNameCard({
  form,
  setForm,
  hasUnsavedChanges,
  saving,
  onSave,
}: {
  form: BuildingNameForm;
  setForm: Dispatch<SetStateAction<BuildingNameForm>>;
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div
      id="building-name"
      className="ku-admin-detail-card ku-admin-detail-card--name"
      style={{
        background: "var(--ku-surface)",
        borderRadius: 10,
        padding: 20,
        border: "1px solid var(--ku-border)",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600 }}>건물명 수정</span>
        {hasUnsavedChanges && (
          <span className="ku-admin-detail-unsaved-label">저장 안 됨</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label
            htmlFor="building-edit-name"
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--ku-text-2)",
              marginBottom: 4,
            }}
          >
            한국어
          </label>
          <input
            id="building-edit-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid var(--ku-border)",
              borderRadius: 6,
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label
            htmlFor="building-edit-name-en"
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--ku-text-2)",
              marginBottom: 4,
            }}
          >
            영어
          </label>
          <input
            id="building-edit-name-en"
            type="text"
            value={form.name_en}
            onChange={(e) =>
              setForm((f) => ({ ...f, name_en: e.target.value }))
            }
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid var(--ku-border)",
              borderRadius: 6,
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            alignSelf: "flex-end",
            padding: "8px 20px",
            background: saving
              ? "var(--ku-primary-disabled)"
              : "var(--ku-primary)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
