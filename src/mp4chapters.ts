// Nero chapter lists are common in M4B; read metadata boxes without loading audio.
export async function readMP4Chapters(
  file: Blob,
): Promise<{ title: string; start: number }[]> {
  let offset = 0;
  while (offset + 8 <= file.size) {
    const header = new DataView(
      await file.slice(offset, offset + 16).arrayBuffer(),
    );
    const type = String.fromCharCode(...new Uint8Array(header.buffer, 4, 4));
    let size = header.getUint32(0);
    let headerSize = 8;
    if (size === 1) {
      if (header.byteLength < 16) return [];
      size = Number(header.getBigUint64(8));
      headerSize = 16;
    }
    if (size === 0) size = file.size - offset;
    if (size < headerSize || offset + size > file.size) return [];
    if (type === "moov" && size < 32 * 1024 * 1024) {
      return find(
        new Uint8Array(
          await file.slice(offset + headerSize, offset + size).arrayBuffer(),
        ),
      );
    }
    offset += size;
  }
  return [];
}
function find(bytes: Uint8Array): { title: string; start: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  while (p + 8 <= bytes.length) {
    const size = view.getUint32(p);
    if (size < 8 || p + size > bytes.length) return [];
    const type = new TextDecoder().decode(bytes.subarray(p + 4, p + 8));
    const body = bytes.subarray(p + 8, p + size);
    if (type === "chpl") {
      if (body.length < 9) return [];
      const v = new DataView(body.buffer, body.byteOffset, body.byteLength);
      const count = body[8];
      let cursor = 9;
      const result = [];
      for (let i = 0; i < count; i++) {
        if (cursor + 9 > body.length) return [];
        const start = Number(v.getBigUint64(cursor)) / 10000000;
        cursor += 8;
        const n = body[cursor++];
        if (cursor + n > body.length) return [];
        const title = new TextDecoder().decode(
          body.subarray(cursor, cursor + n),
        );
        cursor += n;
        result.push({ title, start });
      }
      return result;
    }
    if (type === "udta") {
      const nested = find(body);
      if (nested.length) return nested;
    }
    p += size;
  }
  return [];
}
