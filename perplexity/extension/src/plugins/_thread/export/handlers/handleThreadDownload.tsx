import { toast } from "@/components/ui/use-toast";
import type { DownloadedImage } from "@/entrypoints/services/externals/pplx-api/pplx-thread-parser/download-images";
import { createZip } from "@/utils/misc/create-zip";
import downloadFile from "@/utils/misc/download-file";

import TablerFileDownload from "~icons/tabler/file-download";

type HandleDownloadParams = {
  getContent: (params: {
    withCitations: boolean;
  }) => Promise<{ markdown: string; images: DownloadedImage[] }>;
  withCitations: boolean;
};

export async function handleThreadDownload({
  getContent,
  withCitations,
}: HandleDownloadParams): Promise<void> {
  const basename = `${document.title.substring(0, 100).replace(/[\\/:*?"<>|]/g, " ")}${withCitations ? "" : " (no-citations)"}`;

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
    const { markdown, images } = await getContent({ withCitations });

    // Images sit next to the document, so a thread with images is one archive.
    const filename = `${basename}.${images.length > 0 ? "zip" : "md"}`;
    const content =
      images.length > 0
        ? createZip([
            {
              path: `${basename}.md`,
              data: new TextEncoder().encode(markdown),
            },
            ...images,
          ])
        : markdown;

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
