export interface TerminalSession { id: string; session_date: string; completed_at: string | null; }

/** Fetches every terminal session page; consumers own RLS-scoped query construction. */
export async function fetchAllTerminalSessionPages<T extends TerminalSession>(fetchPage: (from: number, to: number) => Promise<T[]>, pageSize = 500): Promise<T[]> {
  const seen = new Set<string>(); const result: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    for (const row of page) if (row.completed_at !== null && !seen.has(row.id)) { seen.add(row.id); result.push(row); }
    if (page.length < pageSize) return result;
  }
}

export function chunkIds(ids: string[], size = 500): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}
