type RevokeObjectUrl = (url: string) => void;

export function releaseUnreferencedPreviewUrls(
  owned: Set<string>,
  referenced: ReadonlySet<string>,
  revoke: RevokeObjectUrl,
): void {
  for (const url of owned) {
    if (referenced.has(url)) continue;
    revoke(url);
    owned.delete(url);
  }
}

export function releaseAllPreviewUrls(
  owned: Set<string>,
  revoke: RevokeObjectUrl,
): void {
  for (const url of owned) revoke(url);
  owned.clear();
}
