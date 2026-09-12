# Photo Food UI integration

`NEXT_PUBLIC_COACH_PHOTO_FOOD_ACTIONS_ENABLED=1` exposes private upload without
requiring a preceding chat turn. Confirming the upload first creates the saved
conversation required by the private Photo authorization boundary, without a
model call, and uses that durable conversation id for prepare, upload and
review. This thread preparation is independent of whether saved-chat history is
shown in the UI. Review appears only for an available attachment reference returned for
that conversation. The browser does not analyze an image. It reads an already authorized server observation,
labels offline fixtures, asks the user to choose an item and enter explicit
grams/date/meal, then renders the canonical proposal before confirmation.

`COACH_ASSISTANT_PHOTO_FOOD_ACTIONS_ENABLED=1` enables the HTTP broker only when
an injected `createPhotoFoodService` exists. The protected Preview composes the
private attachment, durable observation, shared budget and provider ports. The
production environment remains blocked by the route gate.

An uncertain apply retains its original action id and checks the receipt. A
confirmed receipt triggers the existing Food quantity controller to refetch the
created entry, so the UI does not claim success from optimistic local data.
