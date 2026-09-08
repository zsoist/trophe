# Workout design prototype

This private export runs the product's `WorkoutHome`, `WorkoutWorkspaceProvider`,
builder, review, exercise browser/detail, live logger, retrospective logger,
history and analytics surfaces inside the actual `AppHeader` and `ClientShell`.
It includes the dedicated Muscle Atlas route inside the persistent Workout layout.
Product CSS is compiled through Tailwind, and the same font families and sprite
are served locally. The anatomy source and authored supplement remain pinned.

Only the export's bundle aliases Next navigation and the persistence boundary.
Navigation retains product paths in the URL hash. The workout reducer, validation,
timers, set logger, finish confirmation, and UI components are the product code.
Example catalogue rows use reserved fixture UUIDs and never database identities.
Session storage is scoped to this tab and separate from product workspace storage.
The visible preview controls identify example data and can reset the plan or show
an empty Home. Editing, saving a routine, logging, finishing, and reopening history
operate on those same local records. No account queries, RPCs, or writes are made.

The other client navigation destinations show an explicit scope message. This
prototype does not reproduce account authentication, coach assignment services,
camera-based Form Check, network recovery, or database authorization; those remain
covered by product integration tests. Do not treat local persistence as a backend
implementation or use it from product routes.

Export only with `tools/anatomy/preview.mjs --export-review` from a clean commit.
Deployment stays a private SSO-protected preview; the product atlas activation
contract and anatomical/media approval gates are unchanged.
