import { describe, expect, it } from "vitest";

import {
  ThreadMessageApiResponseSchema,
  ThreadMessageTextSchema,
} from "@/entrypoints/services/externals/pplx-api/pplx-api.types";
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

  describe("ThreadMessageTextSchema", () => {
    it("treats a missing web_results as no sources", () => {
      expect(ThreadMessageTextSchema.parse({ answer: "a" })).toEqual({
        answer: "a",
        web_results: [],
      });
    });
  });

  describe("assets", () => {
    const parse = (steps: unknown[]) =>
      ThreadMessageApiResponseSchema.parse({
        query_str: "q",
        backend_uuid: "b",
        text: JSON.stringify(steps),
      });

    const toolStep = (assets: unknown[]) => ({
      content: {
        workflow_items: [{ payload: { sources_payload: { assets } } }],
      },
    });

    it("links downloaded images when the answer has no text", () => {
      const message = parse([
        toolStep([{ generated_image: { url: "https://x/a.png?sig=1" } }]),
        { content: { answer: JSON.stringify({ answer: "" }) } },
      ]);
      message.text.assets![0]!.localPath = "images/image-1.jpg";

      expect(PplxThreadParser.extractAnswer(message)).toBe(
        "![image](images/image-1.jpg)",
      );
    });

    it("notes assets that couldn't be exported instead of dead links", () => {
      const message = parse([
        toolStep([
          { code: { script: "https://ignored" } },
          { pdf_file: { url: "https://x/a.pdf", filename: "a.pdf" } },
        ]),
        { content: { answer: JSON.stringify({ answer: "done" }) } },
      ]);

      const answer = PplxThreadParser.extractAnswer(message);
      expect(answer).toContain("文件「a.pdf」");
      expect(answer).not.toContain("https://x/a.pdf");
      expect(answer.endsWith("\n\ndone")).toBe(true);
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
