import { atlasWorkoutContext } from "@/lib/anatomy/workout-navigation";
import { notFound } from "next/navigation";
import AnatomyExplorer from "@/components/anatomy/AnatomyExplorer";
import { activeAtlasRelease } from "@/lib/anatomy/release";
import { mappingForMuscle } from "@/lib/anatomy/mapping";
/** Inherits the existing authenticated /dashboard proxy boundary; no DB dependency. */
export default async function AnatomyPage({
  searchParams,
}: {
  searchParams: Promise<{ muscle?: string; group?: string; from?: string; replace?: string; return?: string }>;
}) {
  const release = activeAtlasRelease(
    process.env.NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED,
  );
  if (!release) notFound();
  const params = await searchParams;
  const { muscle, group } = params;
  return (
    <AnatomyExplorer
      workout
      exerciseLibraryContext={atlasWorkoutContext({ get: name => params[name as keyof typeof params] ?? null })}
      initialGroup={group}
      manifestUrl={`/anatomy/${release}/manifest.json`}
      initialMuscle={muscle && mappingForMuscle(muscle) ? muscle : undefined}
    />
  );
}
