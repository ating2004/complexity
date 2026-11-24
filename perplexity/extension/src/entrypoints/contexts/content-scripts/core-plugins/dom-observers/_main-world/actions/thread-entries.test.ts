import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { getThreadEntries } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/_main-world/actions/thread-entries";

function row(
  uuid: string,
  steps: string[],
  idx = uuid.charCodeAt(0),
  title = uuid,
) {
  return {
    __reactFiber$test: {
      return: {
        memoizedProps: { uuid, idx },
        return: {
          memoizedProps: {
            items: steps.map((id) => ({
              sender: "user",
              _entry: {
                entryUuid: id,
                query: id === uuid ? title : id,
              },
            })),
          },
        },
      },
    },
    textContent: title,
    setAttribute: vi.fn(),
  };
}

describe("virtualized thread entries", () => {
  let rows: ReturnType<typeof row>[];
  let root: object;
  let route: { pathname: string; search: string; hash: string };
  let getEntries: typeof getThreadEntries;
  const ids = () => getEntries().entries?.map((entry) => entry.uuid);
  beforeEach(async () => {
    vi.resetModules();
    rows = [];
    route = { pathname: "/session/one", search: "", hash: "" };
    root = {
      isConnected: true,
      getClientRects: () => [{}],
      querySelectorAll: (selector: string) => (selector === "*" ? rows : []),
    };
    vi.stubGlobal("location", route);
    vi.stubGlobal("document", {
      querySelectorAll: () => [root],
      querySelector: () => root,
    });
    getEntries = (await import("./thread-entries")).getThreadEntries;
  });
  afterEach(() => vi.unstubAllGlobals());

  test("keeps three questions when only the last two steps remain available", () => {
    rows = [row("a", ["a", "b", "c"])];
    expect(ids()).toEqual(["a", "b", "c"]);
    rows = [row("b", ["b", "c"]), row("c", ["b", "c"])];
    expect(ids()).toEqual(["a", "b", "c"]);
    rows = [];
    expect(ids()).toEqual(["a", "b", "c"]);
  });
  test("reads another mounted row when the first exposes only its own round", () => {
    rows = [row("a", ["a"]), row("b", ["a", "b", "c"])];
    expect(ids()).toEqual(["a", "b", "c"]);
  });
  test("prepends disjoint history discovered after loading at the bottom", () => {
    rows = [row("c", ["c", "d"]), row("d", ["c", "d"])];
    expect(ids()).toEqual(["c", "d"]);
    rows = [row("a", ["a", "b"]), row("b", ["a", "b"])];
    expect(ids()).toEqual(["a", "b", "c", "d"]);
  });
  test("updates titles and appends followups without duplication", () => {
    rows = [row("a", ["a", "b", "c"])];
    getEntries();
    rows = [row("c", ["b", "c", "d"], 99, "edited")];
    expect(ids()).toEqual(["a", "b", "c", "d"]);
    expect(getEntries().entries![2]!.title).toBe("edited");
  });
  test("retains DOM fallback question titles after unmounting", () => {
    rows = [
      row("a", [], 1, "first question"),
      row("b", [], 2, "second question"),
    ];
    expect(getEntries().entries?.map((entry) => entry.title)).toEqual([
      "first question",
      "second question",
    ]);
    rows = [row("b", [], 2, "second question")];
    expect(ids()).toEqual(["a", "b"]);
  });
  test("isolates session URLs while outgoing DOM remains, then permits shared history", () => {
    rows = [row("a", ["a", "b", "c"])];
    getEntries();
    route.pathname = "/session/two";
    expect(getEntries()).toEqual({ entries: null, mountedUuids: [] });
    rows = [row("x", ["a", "x"])];
    expect(ids()).toEqual(["a", "x"]);
    rows = [row("a", ["a", "x"])];
    expect(ids()).toEqual(["a", "x"]);
  });
  test("query/anchor changes preserve questions, root replacements isolate them", () => {
    rows = [row("a", ["a", "b"])];
    getEntries();
    route.hash = "#answer";
    route.search = "?utm_source=test";
    rows = [row("b", ["b"])];
    expect(ids()).toEqual(["a", "b"]);
    root = { ...root };
    rows = [row("x", ["x"])];
    expect(ids()).toEqual(["x"]);
  });
  test("click seeking pages up using retained UUID order", async () => {
    rows = [row("a", ["a", "b", "c"])];
    getEntries();
    rows = [row("b", ["b", "c"]), row("c", ["b", "c"])];
    const scroller = {
      scrollTop: 1000,
      clientHeight: 500,
      dispatchEvent: vi.fn(),
      scrollTo: vi.fn(({ top }: { top: number }) => {
        scroller.scrollTop = top;
        if (top < 1000) {
          const target = row("a", ["a", "b", "c"]);
          Object.assign(target, { getBoundingClientRect: () => ({ top: 0 }) });
          rows = [target];
        }
      }),
      getBoundingClientRect: () => ({ top: 0 }),
    };
    Object.assign(root, { closest: () => scroller });
    vi.stubGlobal("WheelEvent", class {});
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) =>
      callback(),
    );
    const { scrollToThreadEntry } = await import("./thread-entries");
    await expect(scrollToThreadEntry({ uuid: "a" })).resolves.toBe(true);
    expect(scroller.scrollTo.mock.calls[0]).toEqual([
      { top: 600, behavior: "instant" },
    ]);
  });
});
