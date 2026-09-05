import { notFound } from "next/navigation";
import AnatomyExplorer from "@/components/anatomy/AnatomyExplorer";
import { activeAtlasRelease } from "@/lib/anatomy/release";
import { mappingForMuscle } from "@/lib/anatomy/mapping";
/** Inherits the existing authenticated /dashboard proxy boundary; no DB dependency. */
export default async function AnatomyPage({
  searchParams,
}: {
  searchParams: Promise<{ muscle?: string; group?: string }>;
}) {
  const release = activeAtlasRelease(
    process.env.NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED,
  );
  if (!release) notFound();
  const { muscle, group } = await searchParams;
  return (
    <AnatomyExplorer
      workout
      initialGroup={group}
      manifestUrl={`/anatomy/${release}/manifest.json`}
      initialMuscle={muscle && mappingForMuscle(muscle) ? muscle : undefined}
    />
  );
}
