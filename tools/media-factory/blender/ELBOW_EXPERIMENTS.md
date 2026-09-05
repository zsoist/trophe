# V3 elbow diagnosis — experimental scripts

The temporal diagnostic uses the immutable refinement master. Fixed evaluated skin vertices near each handle are tracked in actual dumbbell coordinates; this is a geometric drift test, not friction, force or complete contact-area certification.

The elbow remains open. None of these trials is adopted:

- Local weight smoothing: about2% lower peak edge stretch, but8.8mm rest deformation.
- Pose-space corrective: isolated patch, zero rest effect and3mm displacement bound verified; comparative stretch/compression did not improve. Earlier private iterations exposed quaternion shortest-angle and `shape_key_add(from_mix=False)` requirements; final script contains isolation assertions.
- Proximal/distal forearm twist partition: hand contact retained and silhouette smoother, but the SAME169-vertex297-edge region has worse compression/stretch. Changing the selected region after weight edits gives an invalid comparison; `compare_twist_same_region.py` fixes vertex IDs from the source.

These are diagnostic measurements, not anatomical acceptance thresholds. Preserve V2 consumer package and V3 diagnostic master. Reassess local elbow topology and deformation frames before another correction; do not promote an experimental master or claim human review.
