// Reads a ZIP archive front to back as it streams in, one entry at a time,
// without holding the archive or any entry whole: large inputs (FIS
// points-list ZIPs) stay well inside a Worker's 128 MB. Supports what plain
// ZIP writers produce: stored or deflated entries whose sizes are in the local
// header (no data descriptors, no ZIP64). Entries a caller does not read are
// skipped without being decompressed.

export type ZipEntry = {
  name: string;
  /** The entry's text, line by line (CRLF or LF), decompressed as it is read. */
  lines(): AsyncIterable<string>;
};

const LOCAL_FILE_HEADER = 0x04034b50;

export async function* zipEntries(body: ReadableStream<Uint8Array>): AsyncGenerator<ZipEntry> {
  const input = new ByteReader(body);
  try {
    while (true) {
      const header = await input.read(30);
      if (!header) return;
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
      if (view.getUint32(0, true) !== LOCAL_FILE_HEADER) return; // the central directory: no entries left
      const flags = view.getUint16(6, true);
      const method = view.getUint16(8, true);
      const compressedSize = view.getUint32(18, true);
      const name = new TextDecoder().decode(await input.readExactly(view.getUint16(26, true)));
      await input.skip(view.getUint16(28, true));
      if (flags & 0x08 || compressedSize === 0xffffffff) throw new Error(`ZIP entry ${name}: sizes not in its header`);
      if (method !== 0 && method !== 8) throw new Error(`ZIP entry ${name}: compression method ${method}`);

      let remaining = compressedSize;
      const data = new ReadableStream<BufferSource>({
        async pull(controller) {
          if (remaining === 0) return controller.close();
          const chunk = await input.readSome(remaining);
          remaining -= chunk.byteLength;
          controller.enqueue(chunk);
        },
      });
      yield {
        name,
        lines: () => lines(method === 8 ? data.pipeThrough(new DecompressionStream("deflate-raw")) : data),
      };
      await input.skip(remaining);
    }
  } finally {
    await input.cancel();
  }
}

async function* lines(bytes: ReadableStream<BufferSource>): AsyncGenerator<string> {
  const reader = bytes.pipeThrough(new TextDecoderStream()).getReader();
  let rest = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const parts = (rest + value).split("\n");
    rest = parts.pop()!;
    for (const line of parts) yield line.endsWith("\r") ? line.slice(0, -1) : line;
  }
  if (rest) yield rest.endsWith("\r") ? rest.slice(0, -1) : rest;
}

/** Exact-size reads over a byte stream, keeping only the unread part of one chunk. */
class ByteReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffered: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private ended = false;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  /** Up to `max` bytes (at least one), or throws at the end of the stream. */
  async readSome(max: number): Promise<Uint8Array<ArrayBuffer>> {
    if (this.buffered.byteLength === 0 && !(await this.fill())) throw new Error("ZIP ended mid-entry");
    const out = this.buffered.subarray(0, max);
    this.buffered = this.buffered.subarray(out.byteLength);
    return out;
  }

  /** Exactly `n` bytes, or null when the stream ends first. */
  async read(n: number): Promise<Uint8Array<ArrayBuffer> | null> {
    while (this.buffered.byteLength < n) {
      if (!(await this.fill())) return null;
    }
    const out = this.buffered.slice(0, n);
    this.buffered = this.buffered.subarray(n);
    return out;
  }

  async readExactly(n: number): Promise<Uint8Array<ArrayBuffer>> {
    const out = await this.read(n);
    if (!out) throw new Error("ZIP ended mid-header");
    return out;
  }

  async skip(n: number): Promise<void> {
    while (n > 0) n -= (await this.readSome(n)).byteLength;
  }

  async cancel(): Promise<void> {
    if (!this.ended) await this.reader.cancel();
  }

  private async fill(): Promise<boolean> {
    if (this.ended) return false;
    const { done, value } = await this.reader.read();
    if (done) {
      this.ended = true;
      return false;
    }
    const joined = new Uint8Array(this.buffered.byteLength + value.byteLength);
    joined.set(this.buffered);
    joined.set(value, this.buffered.byteLength);
    this.buffered = joined;
    return true;
  }
}
