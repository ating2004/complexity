import type z from "zod";

import type {
  ThreadMessageApiResponse,
  ThreadMessageAsset,
  ThreadMessageTextSchema,
} from "@/entrypoints/services/externals/pplx-api/pplx-api.types";

export type PplxWebResult = z.infer<
  typeof ThreadMessageTextSchema.shape.web_results
>[number];

export class PplxThreadParser {
  static extractQuery(message: ThreadMessageApiResponse) {
    return message.query_str;
  }

  static extractAnswer(message: ThreadMessageApiResponse) {
    // Assets go first, as Perplexity shows them above the answer.
    const assets = (message.text.assets ?? []).map((asset) =>
      asset.localPath != null
        ? `![${asset.name}](${asset.localPath})`
        : PplxThreadParser.formatMissingAsset(asset),
    );

    return [...assets, message.text.answer]
      .filter((part) => part !== "")
      .join("\n\n");
  }

  /**
   * Links to generated files don't work outside Perplexity (files are refused,
   * image signatures expire within the hour), so point to the conversation.
   */
  static formatMissingAsset({ kind, name }: ThreadMessageAsset): string {
    const label = kind === "image" ? "图片" : `文件「${name}」`;
    const conversation =
      typeof location === "undefined"
        ? "原会话"
        : `[原会话](${location.origin}${location.pathname})`;

    return `（此处有${label}，未能导出，请查看${conversation}）`;
  }

  static extractWebResults(message: ThreadMessageApiResponse): PplxWebResult[] {
    return message.text.web_results;
  }

  static formatWebResults(webResults: PplxWebResult[]) {
    return webResults
      .map(
        (webResult, index) =>
          `[${index + 1}] [${webResult.name}](${webResult.url})`,
      )
      .join("  \n");
  }

  /**
   * Follow-ups that quote part of an earlier answer are stored as
   * `<q>quoted text</q> question`. Use the question as the heading and keep the
   * quote underneath it, instead of emitting a `# <q>` heading.
   */
  static formatQueryHeading(query: string): string {
    const match = /^\s*<q>([\s\S]*?)<\/q>\s*([\s\S]*)$/.exec(query);
    if (match == null) return `# ${query}`;

    const quote = (match[1] ?? "")
      .trim()
      .split("\n")
      .map((line) => (line.startsWith(">") || line === "" ? line : `> ${line}`))
      .join("\n");
    const question = (match[2] ?? "").trim().replace(/\s*\n\s*/g, " ");

    return quote ? `# ${question}\n\n${quote}` : `# ${question}`;
  }

  static formatAnswerWithCitations(params: {
    query: string;
    answer: string;
    formattedWebResults: string;
    includeQuery: boolean;
  }): string {
    const { query, answer, formattedWebResults, includeQuery } = params;

    const parts = includeQuery
      ? [PplxThreadParser.formatQueryHeading(query), "", answer]
      : [answer];

    if (formattedWebResults)
      parts.push("", "# Citations:", formattedWebResults);

    return parts.join("  \n");
  }

  static trimReferences({
    answer,
    webResults,
  }: {
    answer: string;
    webResults: PplxWebResult[];
  }) {
    webResults.forEach((_, index) => {
      const findText = `\\[${index + 1}\\]`;
      answer = answer.replace(new RegExp(findText, "g"), "");
    });

    return answer;
  }

  static formatAnswerWithoutCitations(params: {
    query: string;
    answer: string;
    includeQuery: boolean;
  }): string {
    const { query, answer, includeQuery } = params;

    return (
      includeQuery
        ? [PplxThreadParser.formatQueryHeading(query), "", answer]
        : [answer]
    ).join("  \n");
  }

  static exportMessage({
    message,
    includeCitations,
    includeQuery,
  }: {
    message: ThreadMessageApiResponse;
    includeCitations: boolean;
    includeQuery?: boolean;
  }) {
    const query = PplxThreadParser.extractQuery(message);
    const rawAnswer = PplxThreadParser.extractAnswer(message);
    const webResults = PplxThreadParser.extractWebResults(message);
    const formattedWebResults = PplxThreadParser.formatWebResults(webResults);

    if (includeCitations) {
      return PplxThreadParser.formatAnswerWithCitations({
        query,
        answer: rawAnswer,
        formattedWebResults,
        includeQuery: includeQuery ?? true,
      });
    }

    const answerWithoutCitations = PplxThreadParser.trimReferences({
      answer: rawAnswer,
      webResults,
    });

    return PplxThreadParser.formatAnswerWithoutCitations({
      query,
      answer: answerWithoutCitations,
      includeQuery: includeQuery ?? true,
    });
  }

  static exportThread({
    threadJSON,
    includeCitations,
    messageIndex,
  }: {
    threadJSON: ThreadMessageApiResponse[];
    includeCitations: boolean;
    messageIndex?: number;
  }) {
    const removeFollowupLinks = (text: string): string => {
      return text.replace(/\[(.*?)\]\(pplx:\/\/action\/followup\)/g, "$1");
    };

    // Export a single message if messageIndex is provided
    if (messageIndex != null && threadJSON[messageIndex] != null) {
      const exportedMessage = PplxThreadParser.exportMessage({
        message: threadJSON[messageIndex],
        includeCitations,
        includeQuery: false,
      });

      return removeFollowupLinks(exportedMessage);
    }

    // Export the entire thread
    const exportedThread = threadJSON
      .map((message) =>
        PplxThreadParser.exportMessage({
          message,
          includeCitations,
        }),
      )
      // The blank line matters: `---` right under text makes it a heading.
      .join("\n\n---\n\n");

    return removeFollowupLinks(exportedThread);
  }
}
