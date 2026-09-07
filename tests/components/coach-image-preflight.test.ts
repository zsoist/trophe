import { expect, it } from 'vitest';
import sharp from 'sharp';
import { inspectImageHeaders } from '@/components/assistant/image-preflight';

it.each(['png', 'jpeg', 'webp'] as const)('accepts a real %s header and rejects its MIME mismatch', async format => {
  const bytes = Uint8Array.from(await sharp({ create: { width: 12, height: 8, channels: 3, background: '#647b86' } }).toFormat(format).toBuffer());
  expect(() => inspectImageHeaders(bytes.buffer, `image/${format}`)).not.toThrow();
  expect(() => inspectImageHeaders(bytes.buffer, format === 'png' ? 'image/jpeg' : 'image/png')).toThrow('type');
});

it('checks WebP extended canvas and compressed frame sizes separately', async () => {
  const bytes = Uint8Array.from(await sharp({ create: { width: 12, height: 8, channels: 3, background: '#647b86' } }).webp().toBuffer());
  const view = new DataView(bytes.buffer);
  expect(String.fromCharCode(...bytes.slice(12, 16))).toBe('VP8 ');
  view.setUint16(26, 16000, true); view.setUint16(28, 16000, true);
  expect(() => inspectImageHeaders(bytes.buffer, 'image/webp')).toThrow('limit');
});

it('rejects animated WebP before browser decoding', () => {
  const bytes = new Uint8Array(30), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF')); view.setUint32(4, 22, true); bytes.set(new TextEncoder().encode('WEBPVP8X'), 8); view.setUint32(16, 10, true); bytes[20] = 2;
  expect(() => inspectImageHeaders(bytes.buffer, 'image/webp')).toThrow('type');
});
