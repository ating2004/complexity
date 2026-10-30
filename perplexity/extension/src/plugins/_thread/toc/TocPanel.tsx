import { Portal } from "@/components/ui/portal";
import { DomObserversMainWorldActions } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/_main-world";
import { DomSelectorsService } from "@/entrypoints/contexts/content-scripts/services/dom-selectors/service-init.loader";
import { persistentQueryClient } from "@/entrypoints/contexts/content-scripts/services/persistent-query-client";
import { getVersionedRemoteResource } from "@/entrypoints/services/externals/cplx-api/versioned-remote-resources/utils";
import { useInsertCss } from "@/hooks/useInsertCss";
import { threadTocCssResourceConfig } from "@/plugins/_thread/toc/index.remote-resources";
import { useThreadTocStore } from "@/plugins/_thread/toc/store";
import type { TocItem as TocItemType } from "@/plugins/_thread/toc/store/types";
import { utils } from "@/plugins/_thread/toc/store/utils";
import TocItem from "@/plugins/_thread/toc/TocItem";
import { useHandleTouch } from "@/plugins/_thread/toc/useHandleTouch";
import { scrollToElement } from "@/utils/dom-utils/generics";

import TablerAlignLeft from "~icons/tabler/align-left";
import TablerX from "~icons/tabler/x";

const threadTocCss = await getVersionedRemoteResource(
  threadTocCssResourceConfig,
  persistentQueryClient,
);

function findBlockElement(id: number) {
  return $(
    `${DomSelectorsService.Root.cplxAttribute(
      DomSelectorsService.Root.internalAttributes.THREAD.MESSAGE.BLOCK,
    )}[data-index="${id}"]`,
  );
}

function scrollToItem(item: TocItemType) {
  utils.pinActiveItem(item.id);

  // The main world can see React's row ids, so it can page toward rows that
  // Perplexity has unmounted and keep the target anchored while it renders.
  if (item.uuid) {
    void DomObserversMainWorldActions.Instance.scrollToThreadEntry({
      uuid: item.uuid,
    });
    return;
  }

  const $element = findBlockElement(item.id);
  if ($element.length) scrollToElement($element, 0, 300);
}

export function TocPanel() {
  const isOpen = useThreadTocStore((store) => store.isOpen);
  const setIsOpen = useThreadTocStore((store) => store.setIsOpen);
  const tocItems = useThreadTocStore((store) => store.tocItems);
  const panelPosition = useThreadTocStore((store) => store.panelPosition);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useInsertCss({
    id: "thread-toc",
    css: threadTocCss,
  });

  useHandleTouch({
    containerRef,
    isOpen,
    setIsOpen,
  });

  const shouldShowToc = tocItems.length > 1 && panelPosition != null;

  if (!shouldShowToc) return null;

  const isFloating = panelPosition.isOverflowing;
  const width = panelPosition.width;
  const { top, left, right } = panelPosition.position;

  if (isFloating && !isOpen) {
    return (
      <Portal>
        <div
          id="thread-toc-floating-toggle"
          title="Table of Contents"
          className="x:fixed x:z-0 x:flex x:size-9 x:cursor-pointer x:items-center x:justify-center x:rounded-full x:border x:border-border/50 x:bg-secondary x:text-muted-foreground x:shadow-lg x:transition-colors x:hover:text-foreground"
          style={{ top, right }}
          onClick={() => setIsOpen(true)}
        >
          <TablerAlignLeft className="x:size-4" />
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <div
        ref={containerRef}
        id="thread-toc-container"
        className={cn("x:fixed x:z-0", {
          "x:rounded-xl x:border x:border-border/50 x:bg-secondary x:shadow-lg":
            isFloating,
        })}
        style={{ width, top, ...(isFloating ? { right } : { left }) }}
      >
        <div
          className={cn(
            "custom-scrollbar",
            "x:flex x:h-full x:flex-col x:gap-2 x:overflow-y-auto",
            {
              "x:max-h-[60vh] x:p-4 x:pr-10": isFloating,
              "x:max-h-[80vh]": !isFloating,
            },
          )}
        >
          {isFloating && (
            <div
              className="x:absolute x:top-2 x:right-2 x:cursor-pointer x:rounded-full x:p-1 x:text-muted-foreground x:transition-colors x:hover:text-foreground"
              onClick={() => setIsOpen(false)}
            >
              <TablerX className="x:size-4" />
            </div>
          )}
          {tocItems.map((item, idx) => (
            <TocItem
              key={idx}
              item={item}
              onClick={() => scrollToItem(item)}
              onContextMenu={() => {
                const $element = findBlockElement(item.id);
                if ($element.length && $element.height() != null)
                  scrollToElement(
                    $element,
                    $element.height()! - window.innerHeight / 2,
                    300,
                  );
              }}
            />
          ))}
        </div>
      </div>
    </Portal>
  );
}
