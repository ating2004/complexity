import { APP_CONFIG } from "@/app.config";

const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  "application/json": ".json",
  "text/markdown": ".md",
  "text/plain": ".txt",
};

const EXTENSION_TO_MIME_TYPE: Record<string, string> = Object.entries(
  MIME_TYPE_TO_EXTENSION,
).reduce(
  (acc, [mimeType, ext]) => {
    acc[ext] = mimeType;
    return acc;
  },
  {} as Record<string, string>,
);

/**
 * Resolves to `false` only when the browser refused to open the save dialog
 * (e.g. too long since the user's click); a cancelled dialog still counts as
 * shown.
 */
export default async function downloadFile({
  data,
  filename,
  mimeType,
}: {
  data: string;
  filename: string;
  mimeType?: string;
}): Promise<boolean> {
  const resolvedMimeType =
    mimeType || inferMimeTypeFromFilename(filename) || "application/json";

  if (APP_CONFIG.BROWSER === "chrome" && "showSaveFilePicker" in window) {
    return downloadFileChrome(data, filename, resolvedMimeType);
  }

  downloadFileGeneric(data, filename, resolvedMimeType);
  return true;
}

function inferMimeTypeFromFilename(filename: string): string | null {
  const ext = filename.substring(filename.lastIndexOf("."));
  return EXTENSION_TO_MIME_TYPE[ext] || null;
}

async function downloadFileChrome(
  data: string,
  filename: string,
  mimeType: string,
): Promise<boolean> {
  const extension = MIME_TYPE_TO_EXTENSION[mimeType] || ".bin";

  let handle;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handle = await (window as any).showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "File",
          accept: {
            [mimeType]: [extension],
          },
        },
      ],
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") return true;
    console.error("Failed to open the save dialog:", error);
    return false;
  }

  try {
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  } catch (error: unknown) {
    console.error("Failed to save file:", error);
  }

  return true;
}

function downloadFileGeneric(data: string, filename: string, mimeType: string) {
  try {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Failed to save file:", error);
    }
  }
}
