"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyWorkspaceState } from "@/components/admin/workspace/useWorkspaceSelection";
import { readWorkspaceState, type WorkspaceState } from "@/lib/workspaceUrl";

type LoadStatus = "loading" | "error" | "ready";

interface WorkspaceLoadOptions<T> {
  /** 탭의 조회와 행 만들기. 실패하면 null */
  fetchRows: () => Promise<T[] | null>;
  /** 행 상태는 페이지가 가진다(useAdminCollection이 setPage를 주므로 훅이 행을 들면 서로 물린다) */
  onRows: (rows: T[]) => void;
  rowId: (row: T) => string;
  /** 주소에서 존재를 검사할 id. 검사할 것이 없으면 null */
  selectedId: (state: WorkspaceState) => string | null;
  initialPageOf: (rows: T[], id: string) => number | null;
  setPage: (page: number) => void;
  allowEdit: boolean;
  messages: { refreshFailed: string; notFound: string };
  showToast: (message: string, type: string) => void;
  /** 존재가 확인된 뒤, 페이지를 맞추기 전에 탭이 주소를 더 손볼 자리 */
  afterCheck?: (rows: T[], state: WorkspaceState, row: T) => void;
}

/**
 * 작업 화면 세 탭이 같이 쓰는 목록 조회의 수명 주기. 조회 함수와 행 만들기는 탭이 넘기고,
 * 요청 번호·떠난 뒤 버리기·실패 표시·`?id=` 존재 검사·첫 성공 페이지 맞추기·다시 시도는 여기서 한다.
 */
export function useWorkspaceLoad<T>(options: WorkspaceLoadOptions<T>) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const optionsRef = useRef(options);
  const loadRequestRef = useRef(0);
  const disposedRef = useRef(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    optionsRef.current = options;
  });

  const reload = useCallback(async () => {
    if (disposedRef.current) return;
    // 한 요청은 시작할 때의 옵션 하나로 끝까지 간다. 렌더가 다른 콜백이 한 요청에 섞이지 않게 한다
    const opts = optionsRef.current;
    loadRequestRef.current += 1;
    const ticket = loadRequestRef.current;
    const rows = await opts.fetchRows();
    // 다시 받기가 겹치면 마지막 요청만 그린다
    if (ticket !== loadRequestRef.current) return;
    if (rows === null) {
      if (loadedRef.current) {
        opts.showToast(opts.messages.refreshFailed, "error");
      } else {
        setStatus("error");
      }
      return;
    }
    // 성공 순서: 첫 성공 판정 → 행·상태 반영 → 주소 존재 검사 → 탭 후처리 → 첫 성공이면 페이지 맞추기.
    // 존재 검사는 조회가 끝난 뒤에만 한다. 조회 전 빈 목록으로 판정하면 맞는 링크도 닫힌다(설계 2026-10-14 3.4)
    const firstLoad = !loadedRef.current;
    loadedRef.current = true;
    opts.onRows(rows);
    setStatus("ready");
    const selection = readWorkspaceState(window.location.search, {
      allowEdit: opts.allowEdit,
    });
    const id = opts.selectedId(selection);
    if (id === null) return;
    const row = rows.find((item) => opts.rowId(item) === id);
    if (row === undefined) {
      applyWorkspaceState({ mode: "closed" });
      opts.showToast(opts.messages.notFound, "warning");
      return;
    }
    opts.afterCheck?.(rows, selection, row);
    // 페이지는 첫 성공에서만 맞춘다. 다시 받기는 보던 페이지를 두고, 첫 조회가 실패했으면 다시 시도가 첫 성공이다
    if (firstLoad) {
      const page = opts.initialPageOf(rows, id);
      if (page !== null) opts.setPage(page);
    }
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    const timer = window.setTimeout(() => void reload(), 0);
    return () => {
      window.clearTimeout(timer);
      // 떠난 뒤에 끝난 조회가 그때의 주소(다른 화면)에서 ?id=를 지우지 않게 진행 중인 요청을 버린다.
      // 떠난 뒤 끝난 저장·삭제가 새로 시작하는 다시 받기와 그 뒤의 주소 갱신도 disposedRef가 막는다
      disposedRef.current = true;
      loadRequestRef.current += 1;
    };
  }, [reload]);

  function retry() {
    // 목록을 받은 뒤에 "loading"으로 가면, 이번 조회가 실패할 때 토스트만 뜨고 패널이 거기 멈춘다
    if (!loadedRef.current) setStatus("loading");
    void reload();
  }

  const isDisposed = useCallback(() => disposedRef.current, []);

  return { status, reload, retry, isDisposed };
}
