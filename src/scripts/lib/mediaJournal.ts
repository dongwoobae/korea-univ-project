import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/** 규칙: docs/specs/2026-10-07-sidepanel-media-loading-design.md 6.2 */
export type JournalStatus = "uploaded" | "updated" | "discarded" | "purged";

export interface JournalEntry {
  id: string;
  status: JournalStatus;
  oldKeys: string[];
  newKeys: string[];
  at: string;
}

function entryKey(entry: Pick<JournalEntry, "id" | "newKeys">): string {
  return `${entry.id}:${entry.newKeys.join(",")}`;
}

export function parseJournal(text: string): Map<string, JournalEntry> {
  const latest = new Map<string, JournalEntry>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as JournalEntry;
    latest.set(entryKey(entry), entry);
  }
  return latest;
}

export function readJournal(path: string): Map<string, JournalEntry> {
  return existsSync(path)
    ? parseJournal(readFileSync(path, "utf8"))
    : new Map();
}

export function appendJournal(
  path: string,
  entry: Omit<JournalEntry, "at">,
): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(
    path,
    JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n",
  );
}

export function pendingUploads(
  entries: Iterable<JournalEntry>,
): JournalEntry[] {
  return [...entries].filter((entry) => entry.status === "uploaded");
}

export function resolvePending(
  entry: JournalEntry,
  referenced: Set<string>,
): "updated" | "discarded" {
  return entry.newKeys.every((key) => referenced.has(key))
    ? "updated"
    : "discarded";
}

export function purgeCandidates(
  entries: Iterable<JournalEntry>,
  referenced: Set<string>,
): JournalEntry[] {
  return [...entries].filter(
    (entry) =>
      entry.status === "updated" &&
      entry.oldKeys.length > 0 &&
      entry.oldKeys.every((key) => !referenced.has(key)),
  );
}
