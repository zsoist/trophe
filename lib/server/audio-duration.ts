const WEBM_IDS = {
  ebml: 0x1a45dfa3,
  segment: 0x18538067,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  duration: 0x4489,
  cluster: 0x1f43b675,
  clusterTimestamp: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
  blockDuration: 0x9b,
} as const;

const MP4_CONTAINER_TYPES = new Set(['moov', 'trak', 'mdia']);

interface Vint {
  length: number;
  value: number;
  unknown: boolean;
}

function readVint(bytes: Uint8Array, offset: number, preserveMarker: boolean): Vint | null {
  const first = bytes[offset];
  if (first == null || first === 0) return null;
  let marker = 0x80;
  let length = 1;
  while (length <= 8 && (first & marker) === 0) {
    marker >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > bytes.length) return null;
  const unknown = !preserveMarker
    && (first & (marker - 1)) === marker - 1
    && Array.from(bytes.subarray(offset + 1, offset + length)).every(value => value === 0xff);
  if (unknown) return { length, value: 0, unknown: true };
  let value = preserveMarker ? first : first & (marker - 1);
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + bytes[offset + index];
    if (!Number.isSafeInteger(value)) return null;
  }
  return { length, value, unknown: false };
}

function readUnsigned(bytes: Uint8Array, start: number, end: number): number | null {
  if (end <= start || end - start > 6) return null;
  let value = 0;
  for (let offset = start; offset < end; offset += 1) value = value * 256 + bytes[offset];
  return Number.isSafeInteger(value) ? value : null;
}

function readFloat(bytes: Uint8Array, start: number, end: number): number | null {
  const length = end - start;
  if (length !== 4 && length !== 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, length);
  return length === 4 ? view.getFloat32(0) : view.getFloat64(0);
}

function readBlockTimestamp(bytes: Uint8Array, start: number, end: number): number | null {
  const track = readVint(bytes, start, false);
  if (!track || start + track.length + 2 > end) return null;
  const offset = start + track.length;
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getInt16(0);
}

function readWebmDurationMs(bytes: Uint8Array): number {
  const state = {
    timecodeScaleNs: 1_000_000,
    declaredDurationTicks: 0,
    maxBlockTicks: Number.NEGATIVE_INFINITY,
    elements: 0,
  };
  const masterIds = new Set<number>([
    WEBM_IDS.ebml,
    WEBM_IDS.segment,
    WEBM_IDS.info,
    WEBM_IDS.cluster,
    WEBM_IDS.blockGroup,
  ]);

  const scan = (
    start: number,
    end: number,
    depth: number,
    clusterState?: { timestampTicks: number; blockTicks?: number },
  ) => {
    if (depth > 8) throw new Error('WebM nesting is invalid');
    let offset = start;
    while (offset < end) {
      state.elements += 1;
      if (state.elements > 100_000) throw new Error('WebM contains too many elements');
      const id = readVint(bytes, offset, true);
      if (!id) break;
      const size = readVint(bytes, offset + id.length, false);
      if (!size) break;
      const dataStart = offset + id.length + size.length;
      const dataEnd = size.unknown ? end : dataStart + size.value;
      if (dataStart > end || dataEnd > end || dataEnd < dataStart) {
        throw new Error(
          `WebM element exceeds upload bounds (offset=${offset}, id=${id.value.toString(16)}, size=${size.value})`,
        );
      }

      if (id.value === WEBM_IDS.timecodeScale) {
        const value = readUnsigned(bytes, dataStart, dataEnd);
        if (value && value > 0) state.timecodeScaleNs = value;
      } else if (id.value === WEBM_IDS.duration) {
        const value = readFloat(bytes, dataStart, dataEnd);
        if (value && Number.isFinite(value) && value > 0) state.declaredDurationTicks = value;
      } else if (id.value === WEBM_IDS.clusterTimestamp && clusterState) {
        const value = readUnsigned(bytes, dataStart, dataEnd);
        if (value != null) clusterState.timestampTicks = value;
      } else if (
        (id.value === WEBM_IDS.simpleBlock || id.value === WEBM_IDS.block)
        && clusterState
      ) {
        const relativeTicks = readBlockTimestamp(bytes, dataStart, dataEnd);
        if (relativeTicks != null) {
          clusterState.blockTicks = clusterState.timestampTicks + relativeTicks;
          state.maxBlockTicks = Math.max(state.maxBlockTicks, clusterState.blockTicks);
        }
      } else if (id.value === WEBM_IDS.blockDuration && clusterState?.blockTicks != null) {
        const value = readUnsigned(bytes, dataStart, dataEnd);
        if (value != null) state.maxBlockTicks = Math.max(state.maxBlockTicks, clusterState.blockTicks + value);
      }

      if (masterIds.has(id.value)) {
        const nestedCluster = id.value === WEBM_IDS.cluster
          ? { timestampTicks: 0 }
          : clusterState;
        scan(dataStart, dataEnd, depth + 1, nestedCluster);
      }
      offset = dataEnd;
      if (size.unknown) break;
    }
  };

  scan(0, bytes.length, 0);
  const hasDeclaredDuration = state.declaredDurationTicks > 0;
  const durationTicks = hasDeclaredDuration ? state.declaredDurationTicks : state.maxBlockTicks;
  if (!Number.isFinite(durationTicks) || durationTicks <= 0) {
    throw new Error('WebM duration is unavailable');
  }
  // MediaRecorder emits Opus frames without BlockDuration. Add one standard
  // 20 ms frame so the final block start is not treated as the recording end.
  return Math.ceil(
    durationTicks * state.timecodeScaleNs / 1_000_000 + (hasDeclaredDuration ? 0 : 20),
  );
}

function readMp4DurationMs(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('ascii');
  let bestDurationMs = 0;
  let atoms = 0;

  const readUint64 = (offset: number): number => {
    const value = view.getBigUint64(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('MP4 duration exceeds safe bounds');
    return Number(value);
  };

  const scan = (start: number, end: number, depth: number) => {
    if (depth > 8) throw new Error('MP4 nesting is invalid');
    let offset = start;
    while (offset + 8 <= end) {
      atoms += 1;
      if (atoms > 100_000) throw new Error('MP4 contains too many atoms');
      let size = view.getUint32(offset);
      const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
      let headerSize = 8;
      if (size === 1) {
        if (offset + 16 > end) throw new Error('MP4 extended atom is truncated');
        size = readUint64(offset + 8);
        headerSize = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < headerSize || offset + size > end) throw new Error('MP4 atom exceeds upload bounds');
      const dataStart = offset + headerSize;
      const dataEnd = offset + size;

      if (type === 'mvhd' || type === 'mdhd') {
        if (dataStart + 4 > dataEnd) throw new Error('MP4 duration atom is truncated');
        const version = bytes[dataStart];
        const timescaleOffset = dataStart + (version === 1 ? 20 : 12);
        const durationOffset = dataStart + (version === 1 ? 24 : 16);
        const durationLength = version === 1 ? 8 : 4;
        if (durationOffset + durationLength > dataEnd) throw new Error('MP4 duration atom is truncated');
        const timescale = view.getUint32(timescaleOffset);
        const duration = version === 1
          ? readUint64(durationOffset)
          : view.getUint32(durationOffset);
        if (timescale > 0 && duration > 0) {
          bestDurationMs = Math.max(bestDurationMs, Math.ceil(duration / timescale * 1000));
        }
      } else if (MP4_CONTAINER_TYPES.has(type)) {
        scan(dataStart, dataEnd, depth + 1);
      }
      offset = dataEnd;
    }
  };

  scan(0, bytes.length, 0);
  if (bestDurationMs <= 0) throw new Error('MP4 duration is unavailable');
  return bestDurationMs;
}

export function normalizeAudioMediaType(value: string): string {
  return value.split(';', 1)[0].trim().toLowerCase();
}

/**
 * Read duration from the uploaded media container instead of trusting client
 * metadata. `duration: true` makes the parser scan streaming WebM recordings
 * whose headers may not contain a finalized duration.
 */
export async function readAudioDurationMs(file: File): Promise<number> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = normalizeAudioMediaType(file.type);
  if (mediaType === 'audio/webm') return readWebmDurationMs(bytes);
  if (mediaType === 'audio/mp4' || mediaType === 'video/mp4') return readMp4DurationMs(bytes);
  throw new Error('Audio container is unsupported');
}
