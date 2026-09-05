/** Single HTTP byte range for the immutable in-memory private video snapshot. */
export function privateByteRange(header, size) {
  if (header === undefined) return null;
  const match = /^bytes=(\d{0,12})-(\d{0,12})$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new Error('invalid range');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (start < 0 || start >= size || end < start) throw new Error('unsatisfiable range');
  return { start, end };
}
