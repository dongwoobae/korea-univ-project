"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FacilityRequestReviewModal from "@/components/admin/inbox/FacilityRequestReviewModal";
import InboxBoard, {
  DESKTOP_BOARD_COLUMNS,
} from "@/components/admin/inbox/InboxBoard";
import { useInboxBoard } from "@/components/admin/inbox/useInboxBoard";
import Toast from "@/components/Toast";
import {
  columnCards,
  inboxCardKey,
  type InboxCard,
  type InboxKind,
  type InboxKindFilter,
} from "@/lib/inboxBoard";
import type { InboxFilter } from "@/lib/inboxStatus";
import {
  readInboxUrl,
  writeInboxUrl,
  type InboxUrlState,
} from "@/lib/inboxUrl";
import { supabase } from "@/lib/supabaseClient";

/** 열려 있는 항목. 드로어가 생기면 이 모양 그대로 쓴다: 연 순간 그 열의 카드를 스냅샷으로 들고 있다. */
interface OpenedItem {
  key: string;
  kind: InboxKind;
  id: string;
  origin: InboxFilter;
  navigation: InboxCard[];
}

function replaceUrl(next: InboxUrlState) {
  const search = writeInboxUrl(window.location.search, next);
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${search}${window.location.hash}`,
  );
}

function InboxScreen({ initialUrl }: { initialUrl: InboxUrlState }) {
  const [url, setUrl] = useState(initialUrl);
  const [types, setTypes] = useState<{ code: string; label: string | null }[]>(
    [],
  );
  const [opened, setOpened] = useState<OpenedItem | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );

  const kinds = useMemo<InboxKind[]>(
    () => (url.kind === "all" ? ["requests", "feedback"] : [url.kind]),
    [url.kind],
  );
  const options = useMemo(
    () => ({
      columns: DESKTOP_BOARD_COLUMNS,
      kinds,
      building: url.building,
    }),
    [kinds, url.building],
  );
  const { state, reload, loadMore, retryFirstPage } = useInboxBoard(options);

  // 검토 모달의 상세 조회 effect가 이 둘에 의존한다. 고정하지 않으면 상세를 반복해 불러온다.
  const showToast = useCallback(
    (message: string, type = "success") => setToast({ message, type }),
    [],
  );
  const closeModal = useCallback(() => setOpened(null), []);
  const onChanged = useCallback(() => {
    reload();
    window.dispatchEvent(new Event("inboxCountsChanged"));
  }, [reload]);

  useEffect(() => {
    void supabase
      .from("facility_types")
      .select("code, label")
      .then(({ data }) => setTypes(data ?? []));
  }, []);

  const typeLabels = useMemo(
    () => new Map(types.map((type) => [type.code, type.label ?? type.code])),
    [types],
  );

  function changeKind(kind: InboxKindFilter) {
    const next = { kind, building: url.building };
    setUrl(next);
    replaceUrl(next);
  }

  function clearBuilding() {
    const next = { kind: url.kind, building: null };
    setUrl(next);
    replaceUrl(next);
  }

  function open(card: InboxCard, origin: InboxFilter) {
    // 피드백은 드로어를 잇는 뒤 작업에서 연다.
    if (card.kind !== "requests") return;
    const column = state.columns.find((entry) => entry.filter === origin);
    setOpened({
      key: inboxCardKey(card),
      kind: card.kind,
      id: card.item.id,
      origin,
      navigation: column ? columnCards(column, kinds) : [],
    });
  }

  return (
    <>
      <InboxBoard
        state={state}
        kindFilter={url.kind}
        kinds={kinds}
        building={url.building}
        typeLabels={typeLabels}
        onKindChange={changeKind}
        onClearBuilding={clearBuilding}
        onOpen={open}
        onLoadMore={loadMore}
        onRetryFirstPage={retryFirstPage}
      />
      {opened?.kind === "requests" && (
        <FacilityRequestReviewModal
          key={opened.key}
          requestId={opened.id}
          facilityTypes={types.map((type) => ({
            code: type.code,
            label: type.label ?? type.code,
          }))}
          onClose={closeModal}
          onChanged={onChanged}
          showToast={showToast}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}

export default function InboxPage() {
  const [initialUrl, setInitialUrl] = useState<InboxUrlState | null>(null);

  useEffect(() => {
    // useSearchParams는 Suspense 경계를 요구한다. 다른 관리자 화면처럼 location에서 읽는다.
    // 읽기 전에는 보드를 그리지 않아 기본 값으로 한 번 받았다가 다시 받는 일을 막는다.
    const timer = window.setTimeout(
      () => setInitialUrl(readInboxUrl(window.location.search)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  return initialUrl ? (
    <InboxScreen initialUrl={initialUrl} />
  ) : (
    <div className="ku-inbox-page" />
  );
}
