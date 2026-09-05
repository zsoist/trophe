import { expect, it } from 'vitest';
import { privateByteRange } from '../../scripts/media/private-byte-range.mjs';
it('serves bounded ranges needed by browser seeks without changing source bytes', () => {
  expect(privateByteRange(undefined, 100)).toBeNull();
  expect(privateByteRange('bytes=0-1', 100)).toEqual({ start: 0, end: 1 });
  expect(privateByteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
  expect(privateByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
  expect(privateByteRange('bytes=90-200', 100)).toEqual({ start: 90, end: 99 });
});
it.each(['bytes=100-', 'bytes=5-4', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'invalid'])('rejects range %s', header => expect(() => privateByteRange(header, 100)).toThrow());
