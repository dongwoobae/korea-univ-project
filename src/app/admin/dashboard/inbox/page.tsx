"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUnsavedChangesGuard } from "@/components/admin/UnsavedChangesGuard";
import FacilityRequestDrawer from "@/components/admin/inbox/FacilityRequestDrawer";
import FeedbackDrawer from "@/components/admin/inbox/FeedbackDrawer";
import InboxBoard, {
  DESKTOP_BOARD_COLUMNS,
} from "@/components/admin/inbox/InboxBoard";
import InboxMobileList from "@/components/admin/inbox/InboxMobileList";
import { useInboxBoard } from "@/components/admin/inbox/useInboxBoard";
import { ADMIN_MOBILE_QUERY } from "@/components/admin/workspace/types";
import Toast from "@/components/Toast";
import {
  columnCards,
  inboxCardKey,
  nextInboxCard,
  type InboxCard,
  type InboxKind,
  type InboxKindFilter,
} from "@/lib/inboxBoard";
import type {
  FeedbackItem,
  FeedbackStatus,
  InboxFilter,
} from "@/lib/inboxStatus";
import {
  readInboxUrl,
  writeInboxUrl,
  type InboxUrlState,
} from "@/lib/inboxUrl";
import { useFacilityTypes } from "@/lib/facilityTypesStore";
import { useMediaQuery } from "@/lib/useMediaQuery";

/** 열려 있는 항목. 연 순간 그 열의 카드를 스냅샷으로 들고 있다. */
interface OpenedItem {
  key: string;
  kind: InboxKind;
  id: string;
  origin: InboxFilter;
  navigation: InboxCard[];
  /** 피드백은 상세 API가 없어 연 카드의 항목을 든다. 보드가 다시 받아져도 이 값을 보인다 */
  feedback?: FeedbackItem;
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
  const { types } = useFacilityTypes();
  const [opened, setOpened] = useState<OpenedItem | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { guard } = useUnsavedChangesGuard();
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );

  // 모바일 상태 칩은 URL 밖에 둔다. 칩 하나가 열 하나라 칩을 바꾸면 보드를 새로 받는다.
  const [mobileFilter, setMobileFilter] = useState<InboxFilter>("open");
  // 모바일에는 전체가 없어 URL이 전체면 등록 요청을 보인다.
  const mobileKind: InboxKind =
    url.kind === "feedback" ? "feedback" : "requests";
  // 모바일 세그먼트에 두 종류의 개수가 보여야 해서 둘 다 받고, 보이는 것은 고른 종류 하나다.
  const kinds = useMemo<InboxKind[]>(
    () =>
      mobile
        ? url.building
          ? ["requests"]
          : ["requests", "feedback"]
        : url.kind === "all"
          ? ["requests", "feedback"]
          : [url.kind],
    [mobile, url.kind, url.building],
  );
  const visibleKinds = useMemo<InboxKind[]>(
    () => (mobile ? [mobileKind] : kinds),
    [mobile, mobileKind, kinds],
  );
  const options = useMemo(
    () => ({
      columns: mobile ? [mobileFilter] : DESKTOP_BOARD_COLUMNS,
      kinds,
      building: url.building,
    }),
    [mobile, mobileFilter, kinds, url.building],
  );
  const { state, reload, loadMore, retryFirstPage } = useInboxBoard(options);

  // 검토 드로어의 상세 조회 effect가 이 둘에 의존한다. 고정하지 않으면 상세를 반복해 불러온다.
  const showToast = useCallback(
    (message: string, type = "success") => setToast({ message, type }),
    [],
  );
  const closeDrawer = useCallback(() => setOpened(null), []);
  const onChanged = useCallback(() => {
    reload();
    window.dispatchEvent(new Event("inboxCountsChanged"));
  }, [reload]);

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
    // 건물 필터가 강제한 등록 요청은 주소의 tab이 아니다. building만 빼고 주소를 다시 읽어 원래 종류로 돌아간다.
    const params = new URLSearchParams(window.location.search);
    params.delete("building");
    const next = readInboxUrl(params.toString());
    setUrl(next);
    replaceUrl(next);
  }

  function openCard(
    card: InboxCard,
    origin: InboxFilter,
    navigation: InboxCard[],
  ) {
    const next: OpenedItem = {
      key: inboxCardKey(card),
      kind: card.kind,
      id: card.item.id,
      origin,
      navigation,
      feedback: card.kind === "feedback" ? card.item : undefined,
    };
    // 데스크톱은 배경이 보드를 막아 열린 채 다른 카드를 누를 수 없지만, 열기는 가드를 거치게 둔다.
    guard(() => setOpened(next));
  }

  function open(card: InboxCard, origin: InboxFilter) {
    const column = state.columns.find((entry) => entry.filter === origin);
    openCard(card, origin, column ? columnCards(column, visibleKinds) : []);
  }

  function savedFeedbackStatus(key: string, status: FeedbackStatus) {
    setOpened((previous) =>
      previous?.key === key && previous.feedback
        ? { ...previous, feedback: { ...previous.feedback, status } }
        : previous,
    );
  }

  // 다음 카드는 연 순간의 스냅샷과 그 열의 지금 카드로 찾는다. 모바일에는 다음 항목이 없다.
  const openedColumn = opened
    ? state.columns.find((entry) => entry.filter === opened.origin)
    : undefined;
  const nextCard =
    opened?.feedback && openedColumn && !mobile
      ? nextInboxCard(
          opened.navigation,
          columnCards(openedColumn, visibleKinds),
          {
            kind: "feedback",
            item: opened.feedback,
          },
        )
      : null;

  return (
    <>
      {mobile ? (
        <InboxMobileList
          state={state}
          kind={mobileKind}
          filter={mobileFilter}
          building={url.building}
          typeLabels={typeLabels}
          titleRef={titleRef}
          onKindChange={changeKind}
          onFilterChange={setMobileFilter}
          onClearBuilding={clearBuilding}
          onOpen={open}
          onLoadMore={loadMore}
          onRetryFirstPage={retryFirstPage}
        />
      ) : (
        <InboxBoard
          state={state}
          kindFilter={url.kind}
          kinds={kinds}
          building={url.building}
          typeLabels={typeLabels}
          onKindChange={changeKind}
          onClearBuilding={clearBuilding}
          titleRef={titleRef}
          onOpen={open}
          onLoadMore={loadMore}
          onRetryFirstPage={retryFirstPage}
        />
      )}
      {opened?.kind === "requests" && (
        <FacilityRequestDrawer
          key={opened.key}
          requestId={opened.id}
          facilityTypes={types.map((type) => ({
            code: type.code,
            label: type.label ?? type.code,
          }))}
          onClose={closeDrawer}
          onChanged={onChanged}
          showToast={showToast}
          restoreFallbackRef={titleRef}
        />
      )}
      {opened?.kind === "feedback" && opened.feedback && (
        <FeedbackDrawer
          key={opened.key}
          item={opened.feedback}
          onClose={closeDrawer}
          onStatusSaved={(status) => savedFeedbackStatus(opened.key, status)}
          onChanged={onChanged}
          showToast={showToast}
          restoreFallbackRef={titleRef}
          onNext={
            nextCard
              ? () => openCard(nextCard, opened.origin, opened.navigation)
              : undefined
          }
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
