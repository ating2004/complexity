import { describe, expect, it } from "vitest";

import { crc32, createZip } from "@/utils/misc/create-zip";

describe("createZip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
  });

  it("starts with a local header and ends with the end record", async () => {
    const zip = createZip([
      { path: "文档.md", data: new TextEncoder().encode("hello") },
    ]);
    const view = new DataView(await zip.arrayBuffer());

    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(view.byteLength - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(view.byteLength - 12, true)).toBe(1);
  });
});
