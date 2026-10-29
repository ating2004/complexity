import { useThreadMessageIndexContext } from "@/entrypoints/contexts/content-scripts/ui-groups/routes/Thread/message-index-context";
import CopyButton from "@/plugins/_thread/better-message-copy-buttons/CopyButton";

export function BetterMessageCopyButton() {
  const messageBlockIndex = useThreadMessageIndexContext();

  // Always offer both options: the copied content (and its sources) is read
  // from the REST API at copy time, while the page's own source list comes and
  // goes as Perplexity re-renders, which made the menu flicker in and out.
  return <CopyButton hasSources messageBlockIndex={messageBlockIndex} />;
}
