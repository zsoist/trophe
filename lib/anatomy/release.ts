import releases from "../../contracts/anatomy/releases.json";
/** Rollback is flag-off or a reviewed prior release; never a remote manifest URL. */
export function activeAtlasRelease(
  flag: string | undefined,
  release: unknown = releases.active,
): string | null {
  return flag === "true" &&
    typeof release === "string" &&
    /^[a-f0-9]{64}$/.test(release)
    ? release
    : null;
}
