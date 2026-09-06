# Third-party notices

## body-muscles

Trophe's interactive muscle atlas uses SVG path data from
[`body-muscles` 1.0.0](https://www.npmjs.com/package/body-muscles), retrieved
from `https://registry.npmjs.org/body-muscles/-/body-muscles-1.0.0.tgz` with
the package-lock integrity
`sha512-vaYkR9gyaVbqncbA4sGfFuZKwvWiAE6JZYpHR4Stt/jfzYfLPymCE63bba7LEAUi1X8h2wsguP5qYOxmZ2f1ZA==`.

Licensed under [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
The installed copy is available at `node_modules/body-muscles/LICENSE`.

Copyright 2024 Ivan Vulović

This product includes software developed by Ivan Vulović.
https://github.com/vulovix/body-muscles

Trophe imports only the published `FRONT_MUSCLES` and `BACK_MUSCLES` SVG data.
It owns the React rendering, semantic role styling, hit targets, localization,
and explicit Trophe-to-path mapping; it does not use `BodyChart`, its
imperative event handling, its filters/glow styling, or its intensity colors.
The three regions without a published surface path are labeled deep-location
guides rather than surface contours.

## Anatomy wording and guide rationale

The atlas's non-diagnostic wording and deep-location-guide rationale refer to
[OpenStax Anatomy & Physiology, 11.2 Naming Skeletal Muscles](https://openstax.org/books/anatomy-and-physiology/pages/11-2-naming-skeletal-muscles)
and the [OpenStax-derived front/back illustration provenance on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Muscles_front_and_back.svg).
The 2D location diagrams use the licensed paths described above, not generated body images. Muscle Atlas also uses an original generated brand symbol. Private 3D review builds may include separately attributed, original illustrated meshes; these are labeled and do not replace BodyParts3D source identities.
