import { DomObserversMainWorldActions } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/_main-world";
import {
  THREAD_ROW_UUID_ATTR,
  type ThreadEntry,
} from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/_main-world/actions/thread-entries";
import type { MessageBlock } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/thread/message-blocks/types";
import { DomSelectorsService } from "@/entrypoints/contexts/content-scripts/services/dom-selectors/service-init.loader";
import { viewportStore } from "@/hooks/useViewport";

/**
 * Perplexity's thread is a flat list: each query row is followed by its steps
 * and answer as siblings, and rows far out of view are unmounted. Blocks are
 * therefore built from the full entry list read from React (main world), and
 * the DOM nodes of each block are resolved only for rows currently mounted —
 * the rest are returned with empty nodes and `isVirtualized: true`.
 */
export async function findMessageBlocks(
  $threadMessagesContainer: JQuery<HTMLElement>,
): Promise<MessageBlock[] | null> {
  const container = $threadMessagesContainer[0];
  if (!container) return null;

  const { entries, mountedUuids } =
    await DomObserversMainWorldActions.Instance.getThreadEntries();

  const rowElements = new Map<string, HTMLElement>();
  for (const el of container.querySelectorAll<HTMLElement>(
    `[${THREAD_ROW_UUID_ATTR}]`,
  )) {
    const uuid = el.getAttribute(THREAD_ROW_UUID_ATTR);
    if (uuid) rowElements.set(uuid, el);
  }

  const list: ThreadEntry[] =
    entries ??
    mountedUuids.map((uuid) => ({
      uuid,
      title: domTitle(rowElements.get(uuid)),
      backendUuid: "",
      webResults: [],
    }));

  const blocks = list.map((entry, index) =>
    parseMessageBlock({
      entry,
      rowElement: rowElements.get(entry.uuid) ?? null,
      container,
      index,
      isLast: index === list.length - 1,
    }),
  );

  // "In flight" is inferred from the newest answer lacking its action bar. If
  // no answer has one, the action bar isn't being recognised at all, and
  // treating the thread as permanently in flight would disable features that
  // wait for it to finish (e.g. Export Thread).
  const isFooterRecognised = blocks.some((block) => block.nodes.$footer[0]);
  if (!isFooterRecognised) {
    for (const block of blocks) {
      block.states.isInFlight = false;
      block.nodes.$wrapper.attr("data-inflight", "false");
    }
  }

  return blocks;
}

function domTitle(rowElement: HTMLElement | undefined): string {
  if (!rowElement) return "";

  const SELECTORS = DomSelectorsService.Root.cachedSync.THREAD.MESSAGE;
  const textEl =
    rowElement.querySelector(SELECTORS.QUERY) ??
    rowElement.querySelector(SELECTORS.QUERY_WRAPPER) ??
    rowElement;

  return textEl.textContent
    .trim()
    .replace(/^\d{1,2}:\d{2}\s*/, "")
    .replace(/\s+/g, " ");
}

function parseMessageBlock({
  entry,
  rowElement,
  container,
  index,
  isLast,
}: {
  entry: ThreadEntry;
  rowElement: HTMLElement | null;
  container: HTMLElement;
  index: number;
  isLast: boolean;
}): MessageBlock {
  const nodes = rowElement
    ? findNodes({ rowElement, container })
    : emptyNodes();

  if (rowElement) {
    nodes.$wrapper
      .internalComponentAttr(
        DomSelectorsService.Root.internalAttributes.THREAD.MESSAGE.BLOCK,
      )
      .attr("data-index", index);
    setInternalAttributes(nodes);
  }

  const content: MessageBlock["content"] = {
    entryUuid: entry.uuid,
    title: entry.title || domTitle(rowElement ?? undefined),
    answer: "",
    webResults: entry.webResults,
    displayModel: "",
    backendUuid: entry.backendUuid,
    userSelectedModel: null,
    authorUuid: "",
  };

  const isVirtualized = rowElement == null;

  return {
    windowSize: viewportStore.getState().windowWidth,
    nodes,
    content,
    states: {
      ...getMessageBlockStates({
        nodes,
        isVirtualized,
        isLast,
        // Image-only answers never get an action bar.
        hasGeneratedImage:
          rowElement != null &&
          firstBetween(container, GENERATED_IMAGE, rowElement, null) != null,
      }),
      isVirtualized,
    },
  };
}

function emptyNodes(): MessageBlock["nodes"] {
  return {
    $wrapper: $(),
    $query: $(),
    $queryEditTextBox: $(),
    $queryEditButtonGroup: $(),
    $contentWrapper: $(),
    $answer: $(),
    $footer: $(),
  };
}

/** Whether `el` holds a query row other than `ownRow` (i.e. another round). */
function containsOtherRow(el: Element, ownRow: Element): boolean {
  if (el.hasAttribute(THREAD_ROW_UUID_ATTR) && el !== ownRow) return true;

  for (const row of el.querySelectorAll(`[${THREAD_ROW_UUID_ATTR}]`)) {
    if (row !== ownRow) return true;
  }

  return false;
}

const GENERATED_IMAGE = 'img[src*="user-gen-media-assets"]';

/** Whether `el` comes after `start` (outside it) and before `end`, if any. */
function isBetween(el: Element, start: Element, end: Element | null): boolean {
  return (
    !start.contains(el) &&
    (start.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !==
      0 &&
    (end == null ||
      (end.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !==
        0)
  );
}

function firstBetween(
  container: HTMLElement,
  selector: string,
  start: Element,
  end: Element | null,
): HTMLElement | null {
  for (const el of container.querySelectorAll<HTMLElement>(selector)) {
    if (isBetween(el, start, end)) return el;
  }

  return null;
}

/**
 * Best effort: the action bar of a round — the row spanning from its first
 * action button to its overflow ("…") button. It sits inside the answer, so it's
 * searched from the query row (whose own copy button is excluded). Feedback
 * buttons come first because code blocks in the answer have copy buttons too.
 */
function findFooter({
  rowElement,
  nextRow,
  container,
}: {
  rowElement: HTMLElement;
  nextRow: Element | null;
  container: HTMLElement;
}): JQuery<HTMLElement> {
  const FOOTER_CHILD =
    DomSelectorsService.Root.cachedSync.THREAD.MESSAGE.FOOTER_CHILD;

  const actionButton =
    firstBetween(
      container,
      `${FOOTER_CHILD.THUMBS_UP_BUTTON},${FOOTER_CHILD.THUMBS_DOWN_BUTTON}`,
      rowElement,
      nextRow,
    ) ?? firstBetween(container, FOOTER_CHILD.COPY_BUTTON, rowElement, nextRow);
  if (!actionButton) return $();

  const $actionParent = $(actionButton).parent();

  let $row = $actionParent;
  for (let depth = 0; depth < 4 && $row[0]; depth++) {
    if ($row[0] === container || containsOtherRow($row[0], rowElement)) break;
    if ($row.find(FOOTER_CHILD.MISC_BUTTON_WRAPPER).length) return $row;
    $row = $row.parent();
  }

  return $actionParent;
}

function findNodes({
  rowElement,
  container,
}: {
  rowElement: HTMLElement;
  container: HTMLElement;
}): MessageBlock["nodes"] {
  const SELECTORS = DomSelectorsService.Root.cachedSync.THREAD.MESSAGE;

  const $wrapper = $(rowElement);
  const $query = $wrapper.find(SELECTORS.QUERY_WRAPPER).first();
  const nextRow = firstBetween(
    container,
    `[${THREAD_ROW_UUID_ATTR}]`,
    rowElement,
    null,
  );
  const answer = firstBetween(container, SELECTORS.ANSWER, rowElement, nextRow);
  const $answer = answer ? $(answer) : $();

  return {
    $wrapper,
    $query,
    $queryEditTextBox: $wrapper.find(SELECTORS.QUERY_EDIT_TEXTBOX),
    $queryEditButtonGroup: $query.find(SELECTORS.QUERY_EDIT_BUTTON_GROUP),
    $contentWrapper: $answer.parent(),
    $answer,
    $footer: findFooter({ rowElement, nextRow, container }),
  };
}

function setInternalAttributes(nodes: MessageBlock["nodes"]) {
  const internalAttrs =
    DomSelectorsService.Root.internalAttributes.THREAD.MESSAGE;

  nodes.$query.internalComponentAttr(internalAttrs.QUERY);
  nodes.$queryEditTextBox.internalComponentAttr(
    internalAttrs.QUERY_EDIT_TEXTBOX,
  );
  nodes.$queryEditButtonGroup.internalComponentAttr(
    internalAttrs.QUERY_EDIT_BUTTON_GROUP,
  );
  nodes.$answer.internalComponentAttr(internalAttrs.ANSWER);
  nodes.$footer.internalComponentAttr(internalAttrs.FOOTER);
}

function getMessageBlockStates({
  nodes,
  isVirtualized,
  isLast,
  hasGeneratedImage,
}: {
  nodes: MessageBlock["nodes"];
  isVirtualized: boolean;
  isLast: boolean;
  hasGeneratedImage: boolean;
}): Omit<MessageBlock["states"], "isVirtualized"> {
  if (isVirtualized) {
    return { isInFlight: false, isReadOnly: true, isEditingQuery: false };
  }

  const { $wrapper, $query, $footer } = nodes;

  // Only the newest answer can still be streaming; its action buttons appear
  // once it completes.
  const isInFlight = isLast && $footer[0] == null && !hasGeneratedImage;

  $wrapper.attr("data-inflight", isInFlight ? "true" : "false");

  const isEditingQuery =
    $query.find(
      DomSelectorsService.Root.cachedSync.QUERY_BOX.TEXTBOX.EDIT_QUERY,
    ).length > 0;

  const isRewriteBtnPresent =
    $footer
      .parent()
      .find(
        DomSelectorsService.Root.cachedSync.THREAD.MESSAGE.FOOTER_CHILD
          .REWRITE_BUTTON_WRAPPER,
      ).length > 0;

  $wrapper.attr("data-read-only", isRewriteBtnPresent ? "false" : "true");

  return {
    isReadOnly: !isRewriteBtnPresent,
    isInFlight,
    isEditingQuery,
  };
}
