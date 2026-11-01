import { useThreadMessageBlocksDomObserverStore } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/thread/message-blocks/store";
import { DomSelectorsService } from "@/entrypoints/contexts/content-scripts/services/dom-selectors/service-init.loader";

const OBSERVER_ID = "thread-message-footer-extra-buttons-wrapper";

export function usePortalContainers(): (Element | null)[] {
  const messageBlocks = useThreadMessageBlocksDomObserverStore(
    (store) => store.messageBlocks,
    deepEqual,
  );

  if (!messageBlocks) return [];

  return messageBlocks.map((messageBlock) => {
    const $existingPortalContainer = messageBlock.nodes.$footer.find(
      DomSelectorsService.Root.cplxAttribute(OBSERVER_ID),
    );

    if ($existingPortalContainer[0]) return $existingPortalContainer[0];

    const $portalContainer = $("<div>").internalComponentAttr(OBSERVER_ID);

    // Perplexity's action bar no longer has the old two-group layout, so sit
    // next to its copy button (which the copy-button plugin hides) when it's
    // there.
    const $nativeCopyButton = messageBlock.nodes.$footer
      .find(
        DomSelectorsService.Root.cachedSync.THREAD.MESSAGE.FOOTER_CHILD
          .COPY_BUTTON,
      )
      .first();

    if ($nativeCopyButton.length) {
      $nativeCopyButton.after($portalContainer);
      return $portalContainer[0] ?? null;
    }

    const $anchor = messageBlock.nodes.$footer.find(
      DomSelectorsService.Root.cachedSync.THREAD.MESSAGE.FOOTER_GROUP.FIRST,
    );

    // Answers without a native copy button: lead the action bar instead.
    if (!$anchor.length) {
      messageBlock.nodes.$footer.prepend($portalContainer);
      return messageBlock.nodes.$footer[0] ? $portalContainer[0]! : null;
    }

    const hasSources = messageBlock.content.webResults.length > 0;

    if (hasSources) {
      $anchor.children().last().before($portalContainer);
    } else {
      $anchor.append($portalContainer);
    }

    return $portalContainer[0] ?? null;
  });
}
