# Photo Food UI integration

`NEXT_PUBLIC_COACH_PHOTO_FOOD_ACTIONS_ENABLED=1` exposes private upload without
requiring a preceding chat turn, then exposes review only for an available
attachment reference returned for the current conversation. The browser does
not analyze an image. It reads an already authorized server observation,
labels offline fixtures, asks the user to choose an item and enter explicit
grams/date/meal, then renders the canonical proposal before confirmation.

`COACH_ASSISTANT_PHOTO_FOOD_ACTIONS_ENABLED=1` enables the HTTP broker only when
an injected `createPhotoFoodService` exists. The production route intentionally
does not bind one in this milestone. This keeps the public and provider paths
dark while isolated integration tests can exercise the complete contract.

An uncertain apply retains its original action id and checks the receipt. A
confirmed receipt triggers the existing Food quantity controller to refetch the
created entry, so the UI does not claim success from optimistic local data.
