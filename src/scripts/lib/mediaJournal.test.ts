import { describe, expect, it } from "vitest";
import {
  type JournalEntry,
  parseJournal,
  pendingUploads,
  purgeCandidates,
  resolvePending,
} from "./mediaJournal";

const line = (entry: Omit<JournalEntry, "at">) =>
  JSON.stringify({ ...entry, at: "2026-10-07T00:00:00Z" });

describe("parseJournal", () => {
  it("같은 항목은 마지막 상태가 이긴다", () => {
    const text = [
      line({ id: "7", status: "uploaded", oldKeys: ["a"], newKeys: ["b"] }),
      line({ id: "7", status: "updated", oldKeys: ["a"], newKeys: ["b"] }),
      "",
    ].join("\n");

    const entries = [...parseJournal(text).values()];

    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("updated");
  });
});

describe("pendingUploads / resolvePending", () => {
  const pending: JournalEntry = {
    id: "7",
    status: "uploaded",
    oldKeys: ["a"],
    newKeys: ["b", "b.jpg"],
    at: "",
  };

  it("uploaded에 머문 항목만 고른다", () => {
    expect(
      pendingUploads([pending, { ...pending, id: "8", status: "updated" }]),
    ).toEqual([pending]);
  });

  it("DB가 새 키를 모두 가리키면 updated, 아니면 discarded", () => {
    expect(resolvePending(pending, new Set(["b", "b.jpg"]))).toBe("updated");
    expect(resolvePending(pending, new Set(["b"]))).toBe("discarded");
    expect(resolvePending(pending, new Set(["a"]))).toBe("discarded");
  });
});

describe("purgeCandidates", () => {
  const updated: JournalEntry = {
    id: "7",
    status: "updated",
    oldKeys: ["a", "a.jpg"],
    newKeys: ["b"],
    at: "",
  };

  it("DB가 더 이상 참조하지 않는 옛 키만 지운다", () => {
    expect(purgeCandidates([updated], new Set(["b"]))).toEqual([updated]);
    expect(purgeCandidates([updated], new Set(["a"]))).toEqual([]);
  });

  it("updated가 아니거나 지울 키가 없으면 고르지 않는다", () => {
    expect(
      purgeCandidates([{ ...updated, status: "purged" }], new Set()),
    ).toEqual([]);
    expect(purgeCandidates([{ ...updated, oldKeys: [] }], new Set())).toEqual(
      [],
    );
  });
});
