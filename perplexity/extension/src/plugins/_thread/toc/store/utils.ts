import debounce from "lodash/debounce";

import type { MessageBlock } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/thread/message-blocks/types";
import { threadTocStore } from "@/plugins/_thread/toc/store";
import type { TocItem } from "@/plugins/_thread/toc/store/types";

const PANEL_PADDING = 32;
const PANEL_MARGIN = 32;
const DEFAULT_HEADER_HEIGHT = 53;
const MAX_PANEL_WIDTH = 300;
const MIN_PANEL_WIDTH = 200;
const PANE_PADDING = 8;

/** Perplexity's right-hand pane (sources card, etc.) */
export const CONTEXT_PANE_SELECTOR = '[class*="w-[var(--context-pane-width)]"]';
const CONTEXT_PANE_CONTENT_SELECTOR = ".pointer-events-auto";

let activeId: number | null = null;
let topMostId: number | null = null;
let topMostObserver: IntersectionObserver | null = null;
let lastMessageBlocks: MessageBlock[] | null = null;
let pendingUpdate = false;

let windowWidth = window.innerWidth;
let windowHeight = window.innerHeight;
let currentTocItems: TocItem[] = [];
let currentThreadWrapper: HTMLElement | null = null;
let currentMessageBlocks: MessageBlock[] | null = null;

const createObservers = (() => {
  let cachedTopMostObserver: IntersectionObserver | null = null;

  const getHeaderHeight = () => {
    return (
      parseInt(
        getComputedStyle(document.body).getPropertyValue("--header-height"),
      ) || DEFAULT_HEADER_HEIGHT
    );
  };

  const createIntersectionHandler = (
    callback: (id: number) => void,
  ): IntersectionObserverCallback => {
    return (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const elementId = entry.target.getAttribute("data-index");
          if (elementId) {
            callback(parseInt(elementId));
            break;
          }
        }
      }
    };
  };

  return (onTopMostIntersect: (id: number) => void) => {
    if (!cachedTopMostObserver) {
      const headerHeight = getHeaderHeight();
      cachedTopMostObserver = new IntersectionObserver(
        createIntersectionHandler(onTopMostIntersect),
        {
          threshold: 0,
          rootMargin: `-${headerHeight + PANEL_MARGIN}px 0px -90% 0px`,
        },
      );
    }

    return {
      topMostObserver: cachedTopMostObserver,
    };
  };
})();

const cleanupObserver = () => {
  if (topMostObserver) {
    topMostObserver.disconnect();
    topMostObserver = null;
  }
};

const updateActiveItem = (id: number) => {
  if (activeId === id) return;

  activeId = id;

  threadTocStore.setState((draft) => {
    for (const item of draft.tocItems) {
      if (item.id === id) {
        item.isActive = true;
      } else if (item.isActive) {
        item.isActive = false;
      }
    }
  });
};

/**
 * The active entry is the last query row above a reading line near the top of
 * the scroller. Rows are a single line tall and answers sit below them as
 * siblings, so watching rows cross the viewport's middle (as before) left the
 * highlight stuck while reading a long answer.
 */
const updateActiveItemFromScroll = () => {
  if (currentThreadWrapper == null || currentMessageBlocks == null) return;
  if (currentMessageBlocks.length === 0) return;

  const scroller = currentThreadWrapper;
  const lastIndex = currentMessageBlocks.length - 1;

  if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
    updateActiveItem(lastIndex);
    return;
  }

  const readingLine =
    scroller.getBoundingClientRect().top + scroller.clientHeight * 0.35;

  let active = -1;
  let firstMounted = -1;

  currentMessageBlocks.forEach((block, index) => {
    const element = block.nodes.$wrapper[0];
    if (!element?.isConnected) return;
    if (firstMounted === -1) firstMounted = index;
    if (element.getBoundingClientRect().top <= readingLine) active = index;
  });

  // Every mounted row is below the line: we're reading the answer of the
  // entry just before them, which has been unmounted.
  if (active === -1) active = Math.max(firstMounted - 1, 0);

  updateActiveItem(active);
};

let scrollFrame = 0;
const onScroll = () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    updateActiveItemFromScroll();
  });
};

const updateTopMostItem = (id: number) => {
  if (topMostId === id) return;

  topMostId = id;

  threadTocStore.setState((draft) => {
    for (const item of draft.tocItems) {
      if (item.id === id) {
        item.isActiveTopMost = true;
      } else if (item.isActiveTopMost) {
        item.isActiveTopMost = false;
      }
    }
  });
};

const updateItems = (
  messageBlocks: MessageBlock[] | null,
  previousTocItems: TocItem[],
) => {
  if (!messageBlocks) return;

  cleanupObserver();

  const observers = createObservers(updateTopMostItem);
  topMostObserver = observers.topMostObserver;

  const existingTitles = new Map(
    previousTocItems.map((item) => [item.id, item.title]),
  );

  const newItems = messageBlocks.map(
    ({ nodes: { $wrapper }, content: { title, entryUuid } }, idx: number) => {
      const element = $wrapper[0];
      if (element) {
        topMostObserver!.observe(element);
      }

      const itemTitle =
        title.length > 0 ? title : (existingTitles.get(idx) ?? "");

      return {
        id: idx,
        uuid: entryUuid,
        title: itemTitle,
        element: $wrapper,
        isActive: idx === activeId,
        isActiveTopMost: idx === topMostId,
      };
    },
  );

  threadTocStore.setState({ tocItems: newItems });
  updateActiveItemFromScroll();
};

/**
 * The column the answers are laid out in. Measured from a mounted block so the
 * panel sits in the gutter to its right.
 */
const getContentColumn = (): HTMLElement | null => {
  const mounted = currentMessageBlocks?.find(
    (block) => !block.states.isVirtualized,
  );
  const answer = mounted?.nodes.$answer[0];
  const column =
    answer?.closest<HTMLElement>(".max-w-threadContentWidth") ??
    currentThreadWrapper?.querySelector<HTMLElement>(
      ".max-w-threadContentWidth",
    ) ??
    answer ??
    mounted?.nodes.$wrapper[0] ??
    null;

  return column;
};

const getContextPane = (): HTMLElement | null => {
  const pane = document.querySelector<HTMLElement>(CONTEXT_PANE_SELECTOR);
  if (!pane) return null;
  const rect = pane.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? pane : null;
};

const getHeaderHeight = () =>
  parseInt(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--header-height",
    ),
  ) || DEFAULT_HEADER_HEIGHT;

const calculatePanelPosition = debounce(
  () => {
    if (currentThreadWrapper == null || currentTocItems.length < 2) {
      threadTocStore.setState({ panelPosition: null });
      return;
    }

    const column = getContentColumn();

    if (column == null) {
      threadTocStore.setState({ panelPosition: null });
      return;
    }

    // Measured against the scroller rather than the window: in Computer mode
    // the chat column is narrow and a report pane sits to its right.
    const scrollerRect = currentThreadWrapper.getBoundingClientRect();
    const columnRect = column.getBoundingClientRect();

    if (columnRect.width === 0 || scrollerRect.width === 0) {
      threadTocStore.setState({ panelPosition: null });
      return;
    }

    const top = Math.max(scrollerRect.top, getHeaderHeight()) + 20;
    const right = Math.max(window.innerWidth - scrollerRect.right, 0) + 16;

    // When Perplexity shows its right-hand pane, the gutter belongs to it:
    // dock inside the pane, below whatever it is currently showing.
    const pane = getContextPane();
    if (pane) {
      const paneRect = pane.getBoundingClientRect();
      let occupiedBottom = 0;
      for (const el of pane.querySelectorAll(CONTEXT_PANE_CONTENT_SELECTOR)) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0)
          occupiedBottom = Math.max(occupiedBottom, rect.bottom);
      }

      const left = paneRect.left + PANE_PADDING;
      const width = Math.min(
        paneRect.width - PANE_PADDING * 2,
        scrollerRect.right - left - PANE_PADDING,
      );

      if (width >= MIN_PANEL_WIDTH) {
        threadTocStore.setState({
          panelPosition: {
            position: { top: Math.max(top, occupiedBottom + 12), left, right },
            isOverflowing: false,
            width,
          },
        });
        return;
      }
    }

    const left = columnRect.right + PANEL_MARGIN;
    const availableSpace = scrollerRect.right - left - PANEL_PADDING;
    const isOverflowing = availableSpace < MIN_PANEL_WIDTH;
    const panelWidth = isOverflowing
      ? Math.min(MAX_PANEL_WIDTH, Math.max(scrollerRect.width - 32, 0))
      : Math.min(MAX_PANEL_WIDTH, availableSpace);

    threadTocStore.setState({
      panelPosition: {
        position: { top, left, right },
        isOverflowing,
        width: panelWidth,
      },
    });
  },
  150,
  { leading: true, trailing: true, maxWait: 1000 },
);

export const utils = {
  updateItems,
  calculatePanelPosition,
  setCurrentMessageBlocks: (blocks: MessageBlock[] | null) => {
    currentMessageBlocks = blocks;
  },
  setCurrentTocItems: (items: TocItem[]) => {
    currentTocItems = items;
  },
  setCurrentThreadWrapper: (wrapper: HTMLElement | null) => {
    currentThreadWrapper?.removeEventListener("scroll", onScroll);
    currentThreadWrapper = wrapper;
    currentThreadWrapper?.addEventListener("scroll", onScroll, {
      passive: true,
    });
    updateActiveItemFromScroll();
  },
  getCurrentTocItems: () => currentTocItems,
  getLastMessageBlocks: () => lastMessageBlocks,
  setLastMessageBlocks: (blocks: MessageBlock[] | null) => {
    lastMessageBlocks = blocks;
  },
  getPendingUpdate: () => pendingUpdate,
  setPendingUpdate: (value: boolean) => {
    pendingUpdate = value;
  },
  getWindowWidth: () => windowWidth,
  getWindowHeight: () => windowHeight,
  setWindowWidth: (width: number) => {
    windowWidth = width;
  },
  setWindowHeight: (height: number) => {
    windowHeight = height;
  },
};
