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
  setDirty: (key: symbol, dirty: boolean) => void;
  guard: (action: () => void) => void;
}

// 제공자 밖(건물 상세 등)에서는 묻지 않고 바로 실행한다
const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  dirty: false,
  setDirty: () => {},
  guard: (action) => action(),
});

type PendingLeave = { kind: "action"; action: () => void } | { kind: "back" };

const TRAP_STATE_KEY = "kuUnsavedTrap";

function onTrapEntry() {
  const state = window.history.state as Record<string, unknown> | null;
  return state?.[TRAP_STATE_KEY] === true;
}

function canGoBack() {
  const { navigation } = window as Window & {
    navigation?: { canGoBack: boolean };
  };
  return navigation?.canGoBack ?? true;
}

/** 동작과 이유는 docs/specs/2026-10-14-admin-map-first-redesign-design.md 3.4 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlySet<symbol>>(
    () => new Set(),
  );
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const dirty = dirtyKeys.size > 0;
  if (pending !== null && !dirty) setPending(null);
  const dirtyRef = useRef(dirty);
  // 쌓은 기록과 그 바로 아래 기록의 주소
  const trapHrefRef = useRef<string | null>(null);
  const stillOnTrapRef = useRef(false);
  const armedRef = useRef(false);
  const leavingRef = useRef(false);

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

  const setDirty = useCallback((key: symbol, next: boolean) => {
    setDirtyKeys((previous) => {
      if (previous.has(key) === next) return previous;
      const updated = new Set(previous);
      if (next) updated.add(key);
      else updated.delete(key);
      return updated;
    });
  }, []);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (!dirty) {
      armedRef.current = false;
      leavingRef.current = false;
      return;
    }
    arm();
    const warn = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, arm]);

  useEffect(() => {
    function handlePopState() {
      const armed = armedRef.current;
      const sameScreen = window.location.href === trapHrefRef.current;
      stillOnTrapRef.current = false;
      armedRef.current = false;
      if (leavingRef.current) {
        if (!sameScreen || !dirtyRef.current) {
          leavingRef.current = false;
          return;
        }
        if (canGoBack()) {
          window.history.back();
          return;
        }
        leavingRef.current = false;
        arm();
        return;
      }
      if (!sameScreen) {
        setPending(null);
        return;
      }
      if (armed && dirtyRef.current) setPending({ kind: "back" });
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [arm]);

  const guard = useCallback((action: () => void) => {
    if (!dirtyRef.current) {
      action();
      return;
    }
    setPending({ kind: "action", action });
  }, []);

  function confirmLeave() {
    const current = pending;
    setPending(null);
    if (current?.kind === "back") {
      if (!canGoBack()) {
        arm();
        return;
      }
      // 사이트 밖으로 나가는 뒤로가기라면 beforeunload가 한 번 더 묻지 않게 한다
      leavingRef.current = true;
      window.history.back();
      return;
    }
    current?.action();
  }

  function cancelLeave() {
    if (pending?.kind === "back") arm();
    setPending(null);
  }

  return (
    <UnsavedChangesContext.Provider value={{ dirty, setDirty, guard }}>
      {children}
      {pending && (
        <ConfirmModal
          message="저장하지 않은 변경사항이 있어요"
          description="지금 나가면 입력한 값이 사라져요"
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

export function useUnsavedChangesGuard() {
  const { dirty, guard } = useContext(UnsavedChangesContext);
  return { dirty, guard };
}
