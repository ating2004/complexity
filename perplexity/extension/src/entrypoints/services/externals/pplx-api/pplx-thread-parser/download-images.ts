import type {
  ThreadMessageApiResponse,
  ThreadMessageAsset,
} from "@/entrypoints/services/externals/pplx-api/pplx-api.types";

const JPEG_QUALITY = 0.8;

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Generated PNGs run to megabytes; JPEG keeps exports small and portable. */
async function compressImage(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) return blob;

  // JPEG has no transparency, which would otherwise turn black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const compressed = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: JPEG_QUALITY,
  });

  return compressed.size < blob.size ? compressed : blob;
}

export type DownloadedImage = { path: string; data: Uint8Array<ArrayBuffer> };

/**
 * Downloads generated images so exported documents don't depend on links that
 * expire. Images that can't be downloaded stay without a `localPath`.
 */
export async function downloadThreadImages(
  messages: ThreadMessageApiResponse[],
): Promise<{
  messages: ThreadMessageApiResponse[];
  images: DownloadedImage[];
}> {
  const images: DownloadedImage[] = [];
  let count = 0;

  const downloadImage = async (
    asset: ThreadMessageAsset,
    message: ThreadMessageApiResponse,
  ): Promise<ThreadMessageAsset> => {
    if (asset.kind !== "image") return asset;

    const id = ++count;

    // The link stored with the asset can be long expired; the matching media
    // item is signed afresh on every request.
    const url =
      message.media_items?.find(
        (item) => pathOf(item.url) === pathOf(asset.url),
      )?.url ?? asset.url;

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      if (!response.ok || !blob.type.startsWith("image/")) return asset;

      const compressed = await compressImage(blob).catch(() => blob);
      const extension = compressed.type === "image/jpeg" ? "jpg" : "png";
      const path = `images/image-${id}.${extension}`;

      images.push({
        path,
        data: new Uint8Array(await compressed.arrayBuffer()),
      });

      return { ...asset, localPath: path };
    } catch (error) {
      console.warn("Failed to download image:", error);
      return asset;
    }
  };

  const updated = await Promise.all(
    messages.map(async (message) => ({
      ...message,
      text: {
        ...message.text,
        assets:
          message.text.assets &&
          (await Promise.all(
            message.text.assets.map((asset) => downloadImage(asset, message)),
          )),
      },
    })),
  );

  return { messages: updated, images };
}
