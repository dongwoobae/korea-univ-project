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

/** 동작과 이유는 docs/specs/2026-10-14-admin-map-first-redesign-design.md 3.4 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlySet<symbol>>(
    () => new Set(),
  );
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const dirty = dirtyKeys.size > 0;
  const dirtyRef = useRef(dirty);
  const trapRef = useRef(false);
  const leavingRef = useRef(false);

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
      // 쌓은 기록은 걷어내지 않는다. 다음에 dirty가 되면 새로 쌓는다.
      trapRef.current = false;
      leavingRef.current = false;
      return;
    }
    if (!trapRef.current) {
      // 뒤로가기를 이 기록만 빼는 것으로 바꿔, 화면을 그대로 둔 채 확인 창을 띄운다
      window.history.pushState(null, "", window.location.href);
      trapRef.current = true;
    }
    const warn = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    function handlePopState() {
      if (!trapRef.current || !dirtyRef.current) return;
      trapRef.current = false;
      setPending({ kind: "back" });
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
      // 사이트 밖으로 나가는 뒤로가기라면 beforeunload가 한 번 더 묻지 않게 한다
      leavingRef.current = true;
      window.history.back();
      return;
    }
    current?.action();
  }

  function cancelLeave() {
    if (pending?.kind === "back") {
      window.history.pushState(null, "", window.location.href);
      trapRef.current = true;
    }
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
