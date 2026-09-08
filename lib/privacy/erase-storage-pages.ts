/** Delete from offset zero: removal shifts the remaining objects forward. */
export async function eraseStoragePages(port: {
  list(offset: number, limit: number): Promise<{ names: string[] | null; error?: string }>;
  remove(names: string[]): Promise<{ error?: string }>;
}, dryRun: boolean): Promise<{ count: number; error?: string }> {
  let count = 0;
  for (;;) {
    const page = await port.list(dryRun ? count : 0, 1000);
    if (page.error) return { count, error: `list: ${page.error}` };
    if (!Array.isArray(page.names)) return { count, error: 'list: no data returned' };
    if (!page.names.length) return { count };
    if (!dryRun) {
      const result = await port.remove(page.names);
      if (result.error) return { count, error: `remove: ${result.error}` };
    }
    count += page.names.length;
    if (page.names.length < 1000) return { count };
  }
}
