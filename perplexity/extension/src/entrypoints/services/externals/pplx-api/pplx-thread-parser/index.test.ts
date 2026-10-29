import { describe, expect, it } from "vitest";

import type { ThreadMessageApiResponse } from "@/entrypoints/services/externals/pplx-api/pplx-api.types";
import { PplxThreadParser } from "@/entrypoints/services/externals/pplx-api/pplx-thread-parser";
import {
  exportedMessageWithCitations,
  exportedMessageWithoutCitations,
  exportedThreadWithCitations,
  exportedThreadWithoutCitations,
  normalThreadApiResponse,
} from "~/tests/data/thread";

describe("ThreadExport", () => {
  describe("exportThread method", () => {
    it("should return a thread with citations", () => {
      expect(
        PplxThreadParser.exportThread({
          threadJSON:
            normalThreadApiResponse as unknown as ThreadMessageApiResponse[],
          includeCitations: true,
        }),
      ).toBe(exportedThreadWithCitations);
    });

    it("should return a thread without citations", () => {
      expect(
        PplxThreadParser.exportThread({
          threadJSON:
            normalThreadApiResponse as unknown as ThreadMessageApiResponse[],
          includeCitations: false,
        }),
      ).toBe(exportedThreadWithoutCitations);
    });

    it("should return a message with citations", () => {
      expect(
        PplxThreadParser.exportThread({
          threadJSON:
            normalThreadApiResponse as unknown as ThreadMessageApiResponse[],
          includeCitations: true,
          messageIndex: 0,
        }),
      ).toBe(exportedMessageWithCitations);
    });

    it("should return a message without citations", () => {
      expect(
        PplxThreadParser.exportThread({
          threadJSON:
            normalThreadApiResponse as unknown as ThreadMessageApiResponse[],
          includeCitations: false,
          messageIndex: 0,
        }),
      ).toBe(exportedMessageWithoutCitations);
    });
  });

  describe("formatQueryHeading", () => {
    it("uses the question as the heading for quoted follow-ups", () => {
      expect(
        PplxThreadParser.formatQueryHeading(
          "<q>\n\n> 引用的回答\n\n</q> 这个方向能实现吗？",
        ),
      ).toBe("# 这个方向能实现吗？\n\n> 引用的回答");
    });

    it("leaves plain queries unchanged", () => {
      expect(PplxThreadParser.formatQueryHeading("plain query")).toBe(
        "# plain query",
      );
    });
  });

  describe("formatAnswerWithCitations", () => {
    it("omits the citations heading when there are no sources", () => {
      expect(
        PplxThreadParser.formatAnswerWithCitations({
          query: "q",
          answer: "a",
          formattedWebResults: "",
          includeQuery: true,
        }),
      ).toBe("# q  \n  \na");
    });
  });
});
