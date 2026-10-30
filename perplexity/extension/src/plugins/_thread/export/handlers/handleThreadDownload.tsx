import { toast } from "@/components/ui/use-toast";
import downloadFile from "@/utils/misc/download-file";

import TablerFileDownload from "~icons/tabler/file-download";

type HandleDownloadParams = {
  getContent: (params: { withCitations: boolean }) => Promise<string>;
  withCitations: boolean;
};

export async function handleThreadDownload({
  getContent,
  withCitations,
}: HandleDownloadParams): Promise<void> {
  const filename = `${document.title.substring(0, 100)} ${withCitations ? "" : " (no-citations)"}.md`;

  let toastTimeout: number | null = null;
  let toastRef: ReturnType<typeof toast> | null = null;

  const showWaitingToast = () => {
    toastTimeout = window.setTimeout(() => {
      toastRef = toast({
        title: t("plugin-thread-export.waiting.title"),
        description: t("plugin-thread-export.waiting.description"),
        duration: Infinity,
      });
    }, 1500);
  };

  const dismissWaitingToast = () => {
    if (toastTimeout != null) {
      clearTimeout(toastTimeout);
    }
    toastRef?.dismiss();
  };

  showWaitingToast();

  try {
    const content = await getContent({ withCitations });

    dismissWaitingToast();

    // Fetching the thread can take long enough that the browser no longer
    // counts the click as a user gesture and refuses to open the save dialog.
    // Only then ask for another click.
    const isDialogShown = await downloadFile({ data: content, filename });
    if (isDialogShown) return;

    const toastInstance = toast({
      title: (
        <div className="x:flex x:items-center x:gap-1">
          <TablerFileDownload className="x:size-4 x:text-primary" />
          <span>
            {t("plugin-thread-export.actions.largeFileDownloadPrompt.title")}
          </span>
        </div>
      ),
      description: t(
        "plugin-thread-export.actions.largeFileDownloadPrompt.description",
      ),
      className: "x:cursor-pointer",
      onClick: () => {
        toastInstance.dismiss();
        void downloadFile({
          data: content,
          filename,
        });
      },
      duration: Infinity,
    });
  } catch (error) {
    dismissWaitingToast();
    console.error("Failed to download:", error);
    toast({
      title: t("plugin-thread-export.errors.downloadFailed.title"),
      description:
        error instanceof Error
          ? error.message
          : t("plugin-thread-export.errors.downloadFailed.unknownError"),
    });
  }
}
