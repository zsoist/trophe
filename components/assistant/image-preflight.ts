import { COACH_IMAGE_LIMITS } from '@/agents/coach-assistant/contracts';

/** Header-only allocation gate, before object URLs or browser image decoding.
 * PNG: https://www.w3.org/TR/png-3/#11IHDR
 * WebP: https://developers.google.com/speed/webp/docs/riff_container
 * JPEG SOF layout: libjpeg-turbo/src/jdmarker.c. Full decode remains server-owned.
 */
export function inspectImageHeaders(buffer: ArrayBuffer, mime: string): void {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const invalid = () => { throw new Error('type'); };
  const has = (offset: number, length: number) => offset >= 0 && offset + length <= bytes.length;
  const ascii = (offset: number, word: string) => has(offset, word.length) && [...word].every((letter, index) => bytes[offset + index] === letter.charCodeAt(0));
  const size = (width: number, height: number) => { if (!width || !height || width * height > COACH_IMAGE_LIMITS.pixels) throw new Error('limit'); };
  if (mime === 'image/png') {
    if (!has(0, 33) || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte) || view.getUint32(8) !== 13 || !ascii(12, 'IHDR')) invalid();
    size(view.getUint32(16), view.getUint32(20));
    for (let offset = 8; has(offset, 12);) {
      const length = view.getUint32(offset);
      if (!has(offset, length + 12) || ascii(offset + 4, 'acTL')) invalid();
      if (ascii(offset + 4, 'IEND')) return;
      offset += length + 12;
    }
    invalid();
  }
  if (mime === 'image/jpeg') {
    if (!has(0, 4) || bytes[0] !== 255 || bytes[1] !== 216) invalid();
    let found = false, offset = 2;
    while (has(offset, 1)) {
      if (bytes[offset++] !== 255) invalid();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (!has(offset, 2)) invalid();
      const length = view.getUint16(offset);
      if (length < 2 || !has(offset, length)) invalid();
      if (marker === 218) { if (!found) invalid(); return; }
      if ([192, 193, 194].includes(marker)) {
        if (found || length < 8) invalid();
        size(view.getUint16(offset + 5), view.getUint16(offset + 3)); found = true;
      }
      offset += length;
    }
    invalid();
  }
  if (mime === 'image/webp') {
    if (!has(0, 20) || !ascii(0, 'RIFF') || !ascii(8, 'WEBP') || view.getUint32(4, true) + 8 !== bytes.length) invalid();
    let found = false;
    const u24 = (offset: number) => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
    for (let offset = 12; has(offset, 8);) {
      const length = view.getUint32(offset + 4, true), start = offset + 8;
      if (!has(start, length) || ascii(offset, 'ANIM') || ascii(offset, 'ANMF')) invalid();
      if (ascii(offset, 'VP8X')) {
        if (length !== 10 || (bytes[start] & 2)) invalid();
        size(u24(start + 4) + 1, u24(start + 7) + 1);
      } else if (ascii(offset, 'VP8 ')) {
        if (found || length < 10 || bytes[start] & 1 || bytes[start + 3] !== 157 || bytes[start + 4] !== 1 || bytes[start + 5] !== 42) invalid();
        size(view.getUint16(start + 6, true) & 16383, view.getUint16(start + 8, true) & 16383); found = true;
      } else if (ascii(offset, 'VP8L')) {
        if (found || length < 5 || bytes[start] !== 47) invalid();
        const dimensions = view.getUint32(start + 1, true);
        size((dimensions & 16383) + 1, ((dimensions >>> 14) & 16383) + 1); found = true;
      }
      offset = start + length + (length % 2);
    }
    if (found) return;
  }
  invalid();
}

export function preflightImage(file: File, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => { reader.abort(); reject(new Error('cancelled')); };
    if (signal.aborted) { reject(new Error('cancelled')); return; }
    signal.addEventListener('abort', abort, { once: true });
    reader.onerror = () => reject(new Error('type'));
    reader.onload = () => { try { inspectImageHeaders(reader.result as ArrayBuffer, file.type); resolve(); } catch (error) { reject(error); } };
    reader.onloadend = () => signal.removeEventListener('abort', abort);
    reader.readAsArrayBuffer(file);
  });
}
