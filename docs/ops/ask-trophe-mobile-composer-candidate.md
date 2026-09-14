# Ask Trophē mobile composer candidate — 2026-09-12

This is a QA preview slice, not a production or physical-device approval.

## Behavior

The mobile conversation fills the visual viewport and holds the page beneath it in place. Closing restores its scroll position. One composer accepts text and reviewed dictation, with a compact photo thumbnail that moves into the sent message. Follow-ups can reuse the conversation photo; the history menu can remove photo/screen context. Voice retains its original review proof and explicit Send; missing reviewed transport fails closed.

Photo review displays protein when supplied by the validated observation. Its existing grams → proposal → confirmation → writer → receipt path is preserved. Identity/preparation/macros editing and per-item omission are not complete in this slice.

## Food reference admission

`food.reference` intentionally uses the existing pilot capability admission: conversational non-synthetic requests, `COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED=1`, an available message service, and authenticated self scope. Despite its name, this existing flag gates the capability registry in this candidate. Food reference is NOT independently enabled when messaging capabilities are off. No flag or production environment value is changed here.

The capability consults the existing food catalogue for at most two food queries, without embeddings, internet search or a writer. Validated catalogue values are rendered deterministically; a single explicit gram quantity with one option can be scaled. These are references, not logged consumption. Provider prose remains subject to existing numeric validation.

## Verification and limits

- 118 selected component, Photo, Voice, catalogue and conversation tests passed before the final missing-review-transport regression was added; that regression is run separately.
- Typecheck passed after icon V02/V03 integration.
- Local actual-component fixture checked at 390×844 and 1280×900; mobile light/dark, viewport bounds, background lock and composer voice status inspected.
- One authenticated reload of the existing QA Food screen reached a visible Analyze recipe button in 1263 ms. This is a single warm-session observation of the prior deployment, not first-load or new-candidate evidence. Browser performance waterfall was unavailable in the read-only tool scope.
- No physical iPhone keyboard, 60 fps, 45-second root-cause fix, real recording or new paid Photo chain is certified. Historical Photo PASS remains separate evidence.
- AG4 candidate review and exact CI/deployment results must be attached before integration. No production/canary release is authorized by this note.
