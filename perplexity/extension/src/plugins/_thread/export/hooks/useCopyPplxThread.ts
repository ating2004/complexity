import { useQuery } from "@tanstack/react-query";

import { toast } from "@/components/ui/use-toast";
import { threadMessageBlocksDomObserverStore } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/thread/message-blocks/store";
import type { ThreadMessageApiResponse } from "@/entrypoints/services/externals/pplx-api/pplx-api.types";
import { PplxThreadParser } from "@/entrypoints/services/externals/pplx-api/pplx-thread-parser";
import { downloadThreadImages } from "@/entrypoints/services/externals/pplx-api/pplx-thread-parser/download-images";
import { pplxApiQueries } from "@/entrypoints/services/externals/pplx-api/query-keys";
import { parseUrl } from "@/utils/misc/utils";
import { dualClipboardPut } from "@/utils/wrappers/clipboard-utils";

type FetchFn = () => Promise<ThreadMessageApiResponse[] | undefined>;

type CopyMessageParams = {
  messageBlockIndex: number;
  withCitations: boolean;
};

type CopyThreadParams = {
  withCitations: boolean;
};

type GetContentParams = {
  withCitations: boolean;
  messageBlockIndex?: number;
};

export function useCopyPplxThread() {
  const threadSlug = parseUrl().pathname.split("/").pop() || "";

  const { isFetching, refetch } = useQuery({
    ...pplxApiQueries.thread.detail(threadSlug),
    retry: false,
    enabled: false,
  });

  // React's thread data only carries the queries now, so answers always come
  // from the REST API.
  const fetchFn: FetchFn = async () =>
    (await refetch({ throwOnError: true })).data;

  return {
    isFetching,
    copyMessage: async ({
      messageBlockIndex,
      withCitations,
    }: CopyMessageParams) => {
      return copyMessage({ fetchFn, messageBlockIndex, withCitations }).catch(
        (error) => {
          toast({
            title: "❌ Failed to copy message",
            description:
              error instanceof Error ? error.message : "Unknown error occurred",
          });
        },
      );
    },
    copyThread: async ({ withCitations }: CopyThreadParams) => {
      return (
        withCitations
          ? copyThreadWithCitations({ fetchFn })
          : copyThreadWithoutCitations({ fetchFn })
      ).catch((error) => {
        toast({
          title: "❌ Failed to copy thread",
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      });
    },
    getContent: async ({
      withCitations,
      messageBlockIndex,
    }: GetContentParams) => {
      const threadJson = await fetchFn();

      invariant(threadJson != null, "Failed to fetch thread info");

      const { messages, images } = await downloadThreadImages(threadJson);

      return {
        markdown: PplxThreadParser.exportThread({
          threadJSON: messages,
          includeCitations: withCitations,
          messageIndex: messageBlockIndex,
        }),
        images,
      };
    },
  };
}

async function findApiMessage({
  fetchFn,
  messageBlockIndex,
}: {
  fetchFn: FetchFn;
  messageBlockIndex: number;
}) {
  const entries = await fetchFn();

  invariant(entries != null, "Failed to fetch thread info");

  const content =
    threadMessageBlocksDomObserverStore.getState().messageBlocks?.[
      messageBlockIndex
    ]?.content;

  const ids = [content?.backendUuid, content?.entryUuid].filter(
    (id): id is string => id != null && id !== "",
  );

  const message =
    entries.find((entry) => ids.includes(entry.backend_uuid)) ??
    entries[messageBlockIndex];

  invariant(message != null, "Message not found");

  return message;
}

async function copyMessage({
  fetchFn,
  messageBlockIndex,
  withCitations,
}: {
  fetchFn: FetchFn;
  messageBlockIndex: number;
  withCitations: boolean;
}) {
  const message = await findApiMessage({ fetchFn, messageBlockIndex });
  const answer = PplxThreadParser.extractAnswer(message);
  const webResults = message.text.web_results;

  if (!withCitations) {
    await dualClipboardPut({
      markdown: PplxThreadParser.trimReferences({ answer, webResults }),
    });
    return;
  }

  const cleanAnswer = answer.replace(
    /\[(.*?)\]\(pplx:\/\/action\/followup\)/g,
    "$1",
  );

  await dualClipboardPut({
    markdown: webResults.length
      ? `${cleanAnswer}\n\nCitations:\n${PplxThreadParser.formatWebResults(webResults)}`
      : cleanAnswer,
  });
}

async function copyThreadWithCitations({ fetchFn }: { fetchFn: FetchFn }) {
  return copyContent({ fetchFn, withCitations: true });
}

async function copyThreadWithoutCitations({ fetchFn }: { fetchFn: FetchFn }) {
  return copyContent({ fetchFn, withCitations: false });
}

async function copyContent({
  withCitations,
  messageBlockIndex,
  fetchFn,
}: {
  withCitations: boolean;
  messageBlockIndex?: number;
  fetchFn: FetchFn;
}) {
  const threadJson = await fetchFn();

  invariant(threadJson != null, "Failed to fetch thread info");

  const message = PplxThreadParser.exportThread({
    threadJSON: threadJson,
    includeCitations: withCitations,
    messageIndex: messageBlockIndex,
  });

  await dualClipboardPut({ markdown: message });
}
