# Static atlas v1 (R2)

Independent from `trophe.media-package/1`. It never releases animated GLB or exercise candidates.

- BodyParts3D Release4.0 (geometry update2013), official Japanese archive; license updated2025 is not geometry release date.
- Attribution: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. https://creativecommons.org/licenses/by/4.0/
- Source catalogue facts preserve concept FMA, representation BP and ELEMENT file IDs. COMPOUND resolves to a set of ELEMENT IDs, not an expected OBJ. IS-A and PART-OF are separate many-to-many edges. An element is drawn once even when selected through multiple compounds.
- Canonical selection = concept ID; picking an element resolves through explicit concept associations. Shared/ambiguous associations remain selectable in text, never an invented anatomical identity.
- Original source coordinates remain immutable. One global coordinate transform is recorded with evidence; source units/orientation must be verified before publication.
- Manifest contains source identity, license, modifications, transform, concepts/names/laterality/availability, typed relations, elements/node IDs, system/region curation, chunks(URL/hash/bytes/bounds/counts), coverage and curated AnatomyMuscleId mapping. Missing, rejected and unmapped are explicit.
- Rendering: static GLB via one Three.js path, lazy route only. Chunk caps4MiB, initial target8MiB, bounded concurrency2, source/config/tool hash cache. No texture needed by default.
- Source male atlas is not patient-specific or the interior of MPFB. Names remain source English with explicit translation fallback. Geometry does not establish exercise roles or activation percentages.
- Enable only after provenance/coverage/mapping/security/device performance/cross-review. Rollback flag + prior manifest retained. DB-02 hold unaffected.

## Local pipeline and review

Use the pinned Node20 runtime and the exact package-lock.json. Downloads, expanded
OBJ, caches, GLB and screenshots live outside Git in the program media-vault/control
paths. Python uses the standard library. No source archive is executed.

1. `acquire.py` records official metadata; inspect the ZIP with `archive.py` before extraction.
2. `inventory.py METADATA MESHES INVENTORY` preserves both typed source memberships.
3. Verify a small actual assembly with `check-assembly.mjs ASSEMBLY INVENTORY REPORT`.
4. `convert.mjs INVENTORY SOURCE_RECORD OUTPUT ASSEMBLY_REPORT [POSTER_PNG]` requires
   same-source/same-geometry-code assembly evidence. One global transform. Reordering
   and triangle partition preserve coordinates/counts; partition boundaries may
   repeat vertices, never source identities or triangles. No texture/upscaling or
   simplification. The optional poster is a screenshot of the actual source geometry.
5. `check-release.mjs OUTPUT INVENTORY REPORT` verifies every compressed chunk,
   node/fragment association, source position set, triangle count and all mappings.
6. `preview.mjs OUTPUT [--light]` serves the actual component on loopback only,
   exact Host/Origin, GET/HEAD allowlist, bounded files and gzip. No deployment.

A concept's `memberships.isa` and `memberships.partof` preserve distinct representation
and element sets. The union in `elements` is explicit display curation. `fragments`
map one canonical source element to multiple GLB nodes/chunks when needed. Search
and picking use the same concept selection; overlapping source associations remain
in the catalogue. Spatial bands are transfer partitions, not anatomical region claims.

Release4.0 maps24 of26 product IDs at least partially; latissimus-dorsi and
rectus-abdominis have no verified named match in this pinned English catalogue.
Four broader groups are partial. This does not mean the human structure does not
exist or every corresponding source surface is absent. Roles/activation remain in
the pre-existing curated exercise model, never inferred from the atlas.

`releases.json.active` is null and `NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED` defaults off.
Both a reviewed pinned release and an explicit flag are required. Clear the flag to
roll back immediately; retain a reviewed `previous` manifest for a deliberate rollback.
No candidate, database migration, or atlas derivative is published by this PR.
