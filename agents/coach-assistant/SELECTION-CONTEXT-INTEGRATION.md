# Server-resolved selection context

Private integration only; no Atlas release, geometry activation, database migration, UI or route change. No paid provider call.

The browser may import `selection-contracts.ts` (types and a small group-ID list). It must not import `selection-context.ts` or `selection-schema.ts`: these load the server catalogue/resolver. The full request schema performs structural checks; the server resolver validates group/subgroup/leg-region membership before collecting records.

Send `context.includeScreen: true`, an existing surface, and either:
- `anatomy: {group, subgroup?, legRegion?: 'all'|'upper'|'lower', version?}`; subgroup IDs come from the existing workout-focus catalogue.
- `entity: {kind: 'exercise'|'plan', id: UUID, version?}`; the ID is a persisted database ID.

`version`, when provided, is the previously returned 64-character SHA256 content version. Stale versions fail; omit it for the first resolution. Removing the chip means `includeScreen: false`; the resolver ignores selection hints. Anatomy plus entity is rejected. The returned `snapshot.selection` is a copied server snapshot with provenance, relations and limitations, supplied separately to the model from record evidence.

Plan selection filters the existing bounded active-plan read to exactly the selected authorized subject-owned row. Missing, foreign, truncated or nonactive results fail; no alternate-plan fallback. This cannot select local drafts. Exercise selection reuses the existing exact curated-global-template database query and verifies its returned ID/curated status. Fresh authorization is checked before and after selected reads. No additional logical data reads are introduced.

Anatomy uses existing catalogue relationships. Catalogue exercise IDs are not database UUIDs. Portion-to-parent matches explicitly say `parent` and omit muscle role; they cannot establish exact portion activation. Curated roles are categorical, never percentages or personal physiology. Geometry availability is not checked. Related source concepts and catalogue exercises are bounded to eight each. Snapshot hashes are content versions, not mutation CAS revisions.

Prerequisite commit 5f15728 imports exact AG1 catalogue files into AG3 for development; AG1 already owns them and must NOT cherry-pick it. The feature delta depends on the existing conversation engine and server catalogue. Coordinate focal integration after the engine bundles; do not replace AG1's whole module or schema.

Validation: six selection tests (including browser/server group parity), plus 39 existing conversation/contract/candidate/context-budget tests pass (45 total across five files). Scoped TypeScript passes. Scoped lint passes with the existing missing-local-React autodetection warning. These are fixtures/unit checks; no real HTTP/Auth/SQL or public Atlas activation is claimed.

Exact prerequisite SHA256 values:

- `lib/anatomy/workout-focus.ts`: `bfc470f289d5e50967e44661188ff9260b0185b3e16c5050afe6bb419f9c2abe`
- `lib/anatomy/exercises.ts`: `4686cffb52e46f98b746f68bc0529f6fc5b5f685a3705c855b494d426a7fa94a`
- `lib/anatomy/exercise-catalogue.json`: `97e1df23b166c0e898e7657b2815546f152a8811303253cd37d499693be3d52a`
- `lib/anatomy/types.ts`: `8b2720545baa4887d3b723625d3109a249e002ba1ec8429f00bd304007700699`
