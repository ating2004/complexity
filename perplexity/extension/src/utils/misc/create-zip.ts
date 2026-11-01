const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function header(fields: [size: 2 | 4, value: number][]) {
  const bytes = new Uint8Array(fields.reduce((sum, [size]) => sum + size, 0));
  const view = new DataView(bytes.buffer);

  let offset = 0;
  for (const [size, value] of fields) {
    if (size === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
    offset += size;
  }

  return bytes;
}

/**
 * Builds an uncompressed ZIP archive. The contents are Markdown and already
 * compressed images, so storing them keeps this small and dependency-free.
 */
export function createZip(
  files: { path: string; data: Uint8Array<ArrayBuffer> }[],
): Blob {
  const UTF8_FLAG = 0x0800;
  const local: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const { path, data } of files) {
    const name = new TextEncoder().encode(path);
    const crc = crc32(data);
    const shared: [2 | 4, number][] = [
      [2, 20], // version needed
      [2, UTF8_FLAG],
      [2, 0], // stored
      [2, 0], // time
      [2, 0x21], // date: 1980-01-01
      [4, crc],
      [4, data.length],
      [4, data.length],
      [2, name.length],
      [2, 0], // extra length
    ];

    const localHeader = header([[4, 0x04034b50], ...shared]);
    local.push(localHeader, name, data);

    const centralHeader = header([
      [4, 0x02014b50],
      [2, 20], // version made by
      ...shared,
      [2, 0], // comment length
      [2, 0], // disk
      [2, 0], // internal attributes
      [4, 0], // external attributes
      [4, offset],
    ]);
    central.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
    centralSize += centralHeader.length + name.length;
  }

  const end = header([
    [4, 0x06054b50],
    [2, 0],
    [2, 0],
    [2, files.length],
    [2, files.length],
    [4, centralSize],
    [4, offset],
    [2, 0],
  ]);

  return new Blob([...local, ...central, end], { type: "application/zip" });
}
