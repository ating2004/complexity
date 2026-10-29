import { PositionObserver } from "position-observer";

import { threadMessageBlocksDomObserverStore } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/thread/message-blocks/store";
import { threadDomObserverStore } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/thread/store";
import { threadTocStore } from "@/plugins/_thread/toc/store";
import {
  CONTEXT_PANE_SELECTOR,
  utils,
} from "@/plugins/_thread/toc/store/utils";
import { getTaskScheduler } from "@/utils/misc/utils";
import { deepEqual } from "@/utils/wrappers/deep-equal";

export default function () {
  threadMessageBlocksDomObserverStore.subscribe(
    ({ messageBlocks }) => messageBlocks,
    (messageBlocks) => {
      utils.setCurrentMessageBlocks(messageBlocks);

      if (
        !utils.getPendingUpdate() &&
        !deepEqual(messageBlocks, utils.getLastMessageBlocks())
      ) {
        utils.setLastMessageBlocks(messageBlocks);
        utils.setPendingUpdate(true);

        getTaskScheduler()(() => {
          utils.updateItems(messageBlocks, utils.getCurrentTocItems());
          utils.setPendingUpdate(false);
        });
      }
    },
    { equalityFn: deepEqual },
  );

  threadTocStore.subscribe(
    (store) => store.tocItems,
    (tocItems) => {
      utils.setCurrentTocItems(tocItems);
      utils.calculatePanelPosition();
    },
    { equalityFn: deepEqual },
  );

  const observer = new PositionObserver((_entries) => {
    utils.calculatePanelPosition();
  });

  // The scroller narrows when Perplexity opens a side pane (e.g. Computer
  // mode's report), which moves the gutter without moving the scroller.
  const resizeObserver = new ResizeObserver(() => {
    utils.calculatePanelPosition();
  });

  threadDomObserverStore.subscribe(
    (store) => store.$wrapper,
    ($wrapper) => {
      utils.setCurrentThreadWrapper($wrapper?.[0] ?? null);
      utils.calculatePanelPosition();

      observer.disconnect();
      resizeObserver.disconnect();

      if ($wrapper == null) {
        return;
      }

      observer.observe($wrapper[0] as Element);
      resizeObserver.observe($wrapper[0] as Element);
    },
    { equalityFn: deepEqual },
  );

  window.addEventListener("resize", () => {
    utils.calculatePanelPosition();
  });

  // The sources card in the right-hand pane expands and collapses; the panel
  // docks below it, so follow its size.
  let observedPane: Element | null = null;
  const paneObserver = new ResizeObserver(() => {
    utils.calculatePanelPosition();
  });
  const paneMutationObserver = new MutationObserver(() => {
    utils.calculatePanelPosition();
  });

  threadTocStore.subscribe(
    (store) => store.tocItems,
    () => {
      const pane = document.querySelector(CONTEXT_PANE_SELECTOR);
      if (pane === observedPane) return;

      paneObserver.disconnect();
      paneMutationObserver.disconnect();
      observedPane = pane;
      if (!pane) return;

      paneObserver.observe(pane);
      paneMutationObserver.observe(pane, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    },
  );
}
