/** 작업 화면 상태와 URL의 대응·우선순위는 docs/specs/2026-10-14-admin-map-first-redesign-design.md 3.4 */
export type WorkspaceState =
  | { mode: "closed" }
  | { mode: "view"; id: string }
  | { mode: "new" }
  | { mode: "edit"; id: string };

const OWN_KEYS = ["id", "new", "edit"] as const;

export function readWorkspaceState(
  search: string,
  options: { allowEdit: boolean },
): WorkspaceState {
  const params = new URLSearchParams(search);
  // 옛 경사도 라우트의 리다이렉트가 원래 쿼리를 붙여 겹친 조합이 들어올 수 있다(설계 2026-10-14 6.5)
  if (params.get("new") === "1") return { mode: "new" };
  const id = params.get("id");
  if (!id) return { mode: "closed" };
  if (options.allowEdit && params.get("edit") === "1") {
    return { mode: "edit", id };
  }
  return { mode: "view", id };
}

export function writeWorkspaceState(
  search: string,
  state: WorkspaceState,
): string {
  const params = new URLSearchParams(search);
  for (const key of OWN_KEYS) params.delete(key);
  if (state.mode === "new") params.set("new", "1");
  if (state.mode === "view" || state.mode === "edit") {
    params.set("id", state.id);
  }
  if (state.mode === "edit") params.set("edit", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}
