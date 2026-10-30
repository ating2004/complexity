/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Perplexity renders a thread as a flat list of steps (queries, tool calls,
 * answers) rather than one container per Q&A round, and unmounts rows that
 * scroll far out of view. Each query row is wrapped in a component whose props
 * carry `{ uuid, idx }`, and an ancestor holds the full step list, so:
 * - the list of entries comes from React (stable while scrolling),
 * - the DOM only supplies anchors for the rows that are currently mounted.
 *
 * Rows are found by scanning for those props instead of walking a fixed
 * nesting path, because the wrappers around them change often.
 */

export const THREAD_ROW_UUID_ATTR = "data-cplx-row-uuid";

const THREAD_ROOT_SELECTOR = String.raw`.group\/thread-content`;
const SCROLLER_SELECTOR = ".scrollable-container";

export type ThreadEntry = {
  uuid: string;
  title: string;
  backendUuid: string;
  webResults: { name: string; url: string; snippet: string }[];
};

function fiberOf(el: Element): any {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  return key ? (el as any)[key] : null;
}

function rowProps(el: Element): { uuid: string; idx: number } | null {
  const props = fiberOf(el)?.return?.memoizedProps;
  return props != null &&
    typeof props.uuid === "string" &&
    typeof props.idx === "number"
    ? props
    : null;
}

function isStepList(value: unknown): value is any[] {
  return (
    Array.isArray(value) &&
    value.some((it) => it != null && typeof it === "object" && "_entry" in it)
  );
}

/** The step list has moved between `items` and `data.steps` across redesigns. */
function findStepList(props: any): any[] | null {
  if (props == null || typeof props !== "object") return null;

  for (const candidate of [props.items, props.steps, props.data?.steps]) {
    if (isStepList(candidate)) return candidate;
  }

  for (const value of Object.values(props)) {
    if (value == null || typeof value !== "object" || Array.isArray(value))
      continue;
    for (const nested of Object.values(value)) {
      if (isStepList(nested)) return nested;
    }
  }

  return null;
}

/**
 * While Perplexity swaps threads in place, the outgoing thread can still be in
 * the DOM for a moment, so prefer the one that's actually rendered.
 */
function threadRoot(): Element | null {
  const isRendered = (el: Element) => el.getClientRects().length > 0;
  const roots = [...document.querySelectorAll(THREAD_ROOT_SELECTOR)];

  return (
    roots.find(isRendered) ??
    roots[0] ??
    document.querySelector(SCROLLER_SELECTOR)
  );
}

/** Mounted query rows in document order, outermost element per uuid. */
function scanRows(root: Element): { uuid: string; el: HTMLElement }[] {
  const found: { uuid: string; el: HTMLElement }[] = [];
  const seen = new Set<string>();

  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    const props = rowProps(el);
    // Document order puts ancestors first, so the first hit for a uuid is
    // the outermost element.
    if (!props || seen.has(props.uuid)) continue;
    seen.add(props.uuid);
    found.push({ uuid: props.uuid, el });
  }

  return found;
}

/** Sources sit in `sources` steps, sometimes nested inside `group` steps. */
function collectSources(
  step: any,
  into: ThreadEntry["webResults"],
  depth: number,
): void {
  if (step == null || typeof step !== "object" || depth > 3) return;

  if (step.type === "sources" && Array.isArray(step.payload?.sources)) {
    for (const source of step.payload.sources) {
      if (typeof source?.url !== "string") continue;
      if (into.some((existing) => existing.url === source.url)) continue;
      into.push({
        name: String(source.name ?? ""),
        url: source.url,
        snippet: String(source.snippet ?? ""),
      });
    }
    return;
  }

  if (Array.isArray(step.payload?.items)) {
    for (const item of step.payload.items)
      collectSources(item, into, depth + 1);
  }
}

function entriesFromStepList(steps: any[]): ThreadEntry[] {
  const entries: ThreadEntry[] = [];
  const seen = new Set<string>();
  let current: ThreadEntry | null = null;

  for (const step of steps) {
    // A round's steps follow its query step, so sources belong to the most
    // recent query.
    if (step?.sender !== "user") {
      if (current != null) collectSources(step, current.webResults, 0);
      continue;
    }

    const entry = step?._entry;
    const uuid = entry?.entryUuid ?? entry?.uuid;
    const query = entry?.query ?? entry?.query_str;

    if (step?.sender !== "user" || typeof uuid !== "string") continue;
    if (seen.has(uuid) || typeof query !== "string" || !query.trim()) continue;

    seen.add(uuid);
    current = {
      uuid,
      title: query.trim().replace(/\s+/g, " "),
      backendUuid: entry.backendUuid ?? entry.backend_uuid ?? "",
      webResults: [],
    };
    entries.push(current);
  }

  return entries;
}

/**
 * Ancestors closer to the row also hold step lists — but only for their own
 * round — so every ancestor is checked and the longest list wins.
 *
 * React keeps two copies of each fiber and alternates between them. When
 * Perplexity switches threads in place, the copy reachable from a DOM node
 * can still hold the previous thread's steps, so both copies are checked and
 * only lists containing this row's own entry are accepted.
 */
function entriesFromSteps(rowEl: Element): ThreadEntry[] | null {
  const rowUuid = rowProps(rowEl)?.uuid;
  if (rowUuid == null) return null;

  let best: ThreadEntry[] | null = null;
  let fiber = fiberOf(rowEl);

  for (
    let depth = 0;
    fiber != null && depth < 60;
    depth++, fiber = fiber.return
  ) {
    for (const props of [fiber.memoizedProps, fiber.alternate?.memoizedProps]) {
      const steps = findStepList(props);
      if (!steps) continue;

      const entries = entriesFromStepList(steps);
      if (!entries.some((entry) => entry.uuid === rowUuid)) continue;
      if (best == null || entries.length > best.length) best = entries;
    }
  }

  return best;
}

/**
 * Tags every mounted query row with {@link THREAD_ROW_UUID_ATTR} (so the
 * isolated world can find it) and returns the full entry list, or `null` when
 * React's step list can't be located.
 */
export function getThreadEntries(): {
  entries: ThreadEntry[] | null;
  mountedUuids: string[];
} {
  const root = threadRoot();
  if (!root) return { entries: null, mountedUuids: [] };

  const rows = scanRows(root);

  for (const tagged of root.querySelectorAll(`[${THREAD_ROW_UUID_ATTR}]`)) {
    if (!rows.some((row) => row.el === tagged))
      tagged.removeAttribute(THREAD_ROW_UUID_ATTR);
  }
  for (const row of rows) row.el.setAttribute(THREAD_ROW_UUID_ATTR, row.uuid);

  const entries = rows[0] ? entriesFromSteps(rows[0].el) : null;
  const mountedUuids = rows.map((row) => row.uuid);

  // A list shorter than what's on screen means we read the wrong array.
  if (entries && entries.length < mountedUuids.length)
    return { entries: null, mountedUuids };

  return { entries, mountedUuids };
}

let activeSeek = 0;

/**
 * Scrolls a thread entry to the top of the scroller. Unmounted rows are reached
 * by paging toward them until React mounts them; once found, the row is
 * re-anchored every frame until the layout settles, since rows resize as they
 * render and would otherwise push the target away.
 */
export async function scrollToThreadEntry({
  uuid,
  offset = 0,
}: {
  uuid: string;
  offset?: number;
}): Promise<boolean> {
  const seekId = ++activeSeek;
  const root = threadRoot();
  const scroller =
    root?.closest<HTMLElement>(SCROLLER_SELECTOR) ??
    document.querySelector<HTMLElement>(SCROLLER_SELECTOR);
  if (!root || !scroller) return false;

  const order = entriesFromAnyRow(root);
  const targetIdx = order.indexOf(uuid);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // Instant, so a CSS `scroll-behavior: smooth` can't leave us measuring
  // mid-animation positions.
  const scrollTo = (top: number) =>
    scroller.scrollTo({ top, behavior: "instant" });

  // Right after a thread opens, Perplexity keeps it pinned to the bottom while
  // content loads, and would pull the scroller back down against us (the page
  // visibly jitters). Stick-to-bottom behaviours let go on an upward wheel, so
  // signal one before taking over.
  scroller.dispatchEvent(
    new WheelEvent("wheel", { deltaY: -1, bubbles: true, cancelable: true }),
  );

  for (let attempt = 0; attempt < 120; attempt++) {
    if (seekId !== activeSeek) return false;

    const rows = scanRows(root);
    const hit = rows.find((row) => row.uuid === uuid);

    if (hit) {
      await settleOn({ hit: hit.el, uuid, root, scroller, offset, seekId });
      return true;
    }

    const mounted = rows
      .map((row) => order.indexOf(row.uuid))
      .filter((i) => i >= 0);
    const goUp =
      targetIdx >= 0 && mounted.length > 0
        ? targetIdx < Math.min(...mounted)
        : false;

    const before = scroller.scrollTop;
    scrollTo(before + (goUp ? -1 : 1) * scroller.clientHeight * 0.8);
    if (scroller.scrollTop === before) return false;

    await sleep(60);
  }

  return false;
}

/**
 * Keeps the target row at the top while the layout around it settles (rows
 * resize as they render). Gives up instead of fighting when something else
 * keeps moving the scroller, or when the row can't go any higher (end of the
 * thread).
 */
async function settleOn({
  hit,
  uuid,
  root,
  scroller,
  offset,
  seekId,
}: {
  hit: HTMLElement;
  uuid: string;
  root: Element;
  scroller: HTMLElement;
  offset: number;
  seekId: number;
}): Promise<void> {
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

  let stableFrames = 0;
  let interferences = 0;
  let expectedTop: number | null = null;

  for (let frame = 0; frame < 90 && stableFrames < 6; frame++) {
    if (seekId !== activeSeek) return;

    // Someone else moved the scroller since our last adjustment.
    if (
      expectedTop != null &&
      Math.abs(scroller.scrollTop - expectedTop) > 4 &&
      ++interferences >= 3
    )
      return;

    const el = scanRows(root).find((row) => row.uuid === uuid)?.el ?? hit;
    const delta =
      el.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      offset;

    if (Math.abs(delta) <= 1) {
      stableFrames++;
      expectedTop = scroller.scrollTop;
    } else {
      stableFrames = 0;
      const before = scroller.scrollTop;
      scroller.scrollTo({ top: before + delta, behavior: "instant" });
      // Clamped at either end: the row can't get any closer.
      if (Math.abs(scroller.scrollTop - before) < 1) return;
      expectedTop = scroller.scrollTop;
    }

    await nextFrame();
  }
}

function entriesFromAnyRow(root: Element): string[] {
  const rows = scanRows(root);
  const entries = rows[0] ? entriesFromSteps(rows[0].el) : null;
  return (entries ?? []).map((entry) => entry.uuid);
}
