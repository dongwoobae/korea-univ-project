"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ConfirmModal from "@/components/ConfirmModal";

interface UnsavedChangesContextValue {
  dirty: boolean;
  /** 저장 안 한 변경이나 진행 중인 작업이 있어 떠나기 전에 물어야 한다 */
  blocked: boolean;
  setDirty: (key: symbol, dirty: boolean) => void;
  setBusy: (key: symbol, busy: boolean) => void;
  guard: (action: () => void) => void;
}

// 제공자 밖(건물 상세 등)에서는 묻지 않고 바로 실행한다
const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  dirty: false,
  blocked: false,
  setDirty: () => {},
  setBusy: () => {},
  guard: (action) => action(),
});

type PendingLeave = (
  { kind: "action"; action: () => void } | { kind: "back" }
) & {
  // 창이 열린 순간의 이유를 고정한다. 열린 채로 문구가 바뀌지 않게 한다
  busy: boolean;
};

const UNSAVED_WORDING = {
  message: "저장하지 않은 변경사항이 있어요",
  description: "지금 나가면 입력한 값이 사라져요",
};
const BUSY_WORDING = {
  message: "처리 중인 작업이 있어요",
  description: "지금 나가면 진행 중인 작업이 끝나지 않을 수 있어요",
};

function toggleKey(
  keys: ReadonlySet<symbol>,
  key: symbol,
  present: boolean,
): ReadonlySet<symbol> {
  if (keys.has(key) === present) return keys;
  const updated = new Set(keys);
  if (present) updated.add(key);
  else updated.delete(key);
  return updated;
}

const TRAP_STATE_KEY = "kuUnsavedTrap";

function onTrapEntry() {
  const state = window.history.state as Record<string, unknown> | null;
  return state?.[TRAP_STATE_KEY] === true;
}

// 뒤로 간 뒤 이 안에 popstate도 beforeunload도 없으면 뒤로 갈 기록이 없던 것으로 본다
const BACK_SETTLE_MS = 1000;

/** 동작과 이유는 docs/specs/2026-10-14-admin-map-first-redesign-design.md 3.4 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlySet<symbol>>(
    () => new Set(),
  );
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<symbol>>(
    () => new Set(),
  );
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const dirty = dirtyKeys.size > 0;
  const busy = busyKeys.size > 0;
  const blocked = dirty || busy;
  if (pending !== null && !blocked) setPending(null);
  const blockedRef = useRef(blocked);
  const busyRef = useRef(busy);
  // 쌓은 기록과 그 바로 아래 기록의 주소
  const trapHrefRef = useRef<string | null>(null);
  const stillOnTrapRef = useRef(false);
  const armedRef = useRef(false);
  const leavingRef = useRef(false);
  const unloadingRef = useRef(false);
  const backTimerRef = useRef<number | null>(null);

  const arm = useCallback(() => {
    if (!stillOnTrapRef.current || !onTrapEntry()) {
      window.history.pushState(
        { [TRAP_STATE_KEY]: true },
        "",
        window.location.href,
      );
      trapHrefRef.current = window.location.href;
      stillOnTrapRef.current = true;
    }
    armedRef.current = true;
  }, []);

  const stopBackWait = useCallback(() => {
    if (backTimerRef.current === null) return;
    window.clearTimeout(backTimerRef.current);
    backTimerRef.current = null;
  }, []);

  // Navigation API canGoBack은 같은 출처 기록만 세서, 다른 사이트에서 들어온 탭에서도 false다.
  // 그래서 뒤로 가 보고 움직였는지로 판정한다
  const leaveBack = useCallback(() => {
    stopBackWait();
    // 사이트 밖으로 나가는 뒤로가기라면 beforeunload가 한 번 더 묻지 않게 한다
    leavingRef.current = true;
    unloadingRef.current = false;
    window.history.back();
    backTimerRef.current = window.setTimeout(() => {
      backTimerRef.current = null;
      if (unloadingRef.current) return;
      leavingRef.current = false;
      if (blockedRef.current) arm();
    }, BACK_SETTLE_MS);
  }, [arm, stopBackWait]);

  const setDirty = useCallback((key: symbol, next: boolean) => {
    setDirtyKeys((previous) => toggleKey(previous, key, next));
  }, []);

  const setBusy = useCallback((key: symbol, next: boolean) => {
    setBusyKeys((previous) => toggleKey(previous, key, next));
  }, []);

  useEffect(() => {
    blockedRef.current = blocked;
    busyRef.current = busy;
    if (!blocked) {
      armedRef.current = false;
      leavingRef.current = false;
      return;
    }
    arm();
    const warn = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) {
        unloadingRef.current = true;
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [blocked, busy, arm]);

  useEffect(() => {
    function handlePopState() {
      const armed = armedRef.current;
      const sameScreen = window.location.href === trapHrefRef.current;
      stillOnTrapRef.current = false;
      armedRef.current = false;
      if (leavingRef.current) {
        stopBackWait();
        if (!sameScreen || !blockedRef.current) {
          leavingRef.current = false;
          return;
        }
        leaveBack();
        return;
      }
      if (!sameScreen) {
        setPending(null);
        return;
      }
      if (armed && blockedRef.current) {
        setPending({ kind: "back", busy: busyRef.current });
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [leaveBack, stopBackWait]);

  // bfcache로 돌아오면 떠나던 상태가 남아 경고와 기록이 꺼져 있다
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      stopBackWait();
      leavingRef.current = false;
      unloadingRef.current = false;
      stillOnTrapRef.current = false;
      if (blockedRef.current) arm();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      stopBackWait();
    };
  }, [arm, stopBackWait]);

  const guard = useCallback((action: () => void) => {
    if (!blockedRef.current) {
      action();
      return;
    }
    setPending({ kind: "action", action, busy: busyRef.current });
  }, []);

  function confirmLeave() {
    const current = pending;
    setPending(null);
    if (current?.kind === "back") {
      leaveBack();
      return;
    }
    current?.action();
  }

  function cancelLeave() {
    if (pending?.kind === "back") arm();
    setPending(null);
  }

  const wording = pending?.busy ? BUSY_WORDING : UNSAVED_WORDING;

  return (
    <UnsavedChangesContext.Provider
      value={{ dirty, blocked, setDirty, setBusy, guard }}
    >
      {children}
      {pending && (
        <ConfirmModal
          message={wording.message}
          description={wording.description}
          confirmLabel="나가기"
          onConfirm={confirmLeave}
          onCancel={cancelLeave}
        />
      )}
    </UnsavedChangesContext.Provider>
  );
}

/** 초안 상태의 주인(상세 패널)이 dirty를 등록한다. 언마운트하면 풀린다 */
export function useUnsavedChanges(dirty: boolean) {
  const { setDirty } = useContext(UnsavedChangesContext);
  const [key] = useState(() => Symbol("unsaved-changes"));

  useEffect(() => {
    setDirty(key, dirty);
  }, [dirty, key, setDirty]);

  useEffect(() => () => setDirty(key, false), [key, setDirty]);
}

/**
 * 화면이 끝내야 할 클라이언트 일(승인 뒤 번역 호출 등)을 하는 동안 busy를 등록한다.
 * 떠나면 그 일이 빠질 수 있어 저장 안 한 변경과 다른 문구로 묻는다. 언마운트하면 풀린다
 */
export function useBusyNavigation(busy: boolean) {
  const { setBusy } = useContext(UnsavedChangesContext);
  const [key] = useState(() => Symbol("busy-navigation"));

  useEffect(() => {
    setBusy(key, busy);
  }, [busy, key, setBusy]);

  useEffect(() => () => setBusy(key, false), [key, setBusy]);
}

export function useUnsavedChangesGuard() {
  const { dirty, blocked, guard } = useContext(UnsavedChangesContext);
  return { dirty, blocked, guard };
}
