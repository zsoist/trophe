# Reviewed dietary preference

`NEXT_PUBLIC_COACH_DIET_ACTIONS_ENABLED=1` exposes the dietary preference section
for the signed-in subject only. The server independently requires
`COACH_ASSISTANT_DIET_ACTIONS_ENABLED=1`. Both remain off by default. Example
conversations require an explicit injected diet transport.

Opening the section reads the canonical profile. Null remains Not specified;
there is no implied omnivore preference. The four existing contract choices
are omnivore, vegetarian, vegan and pescatarian. Choosing an option does not
write. Review shows the exact before and after values; confirmation applies the
bound proposal. Lost responses retain their action ID and recover by receipt
before refetching. A failed refetch does not present stale profile data as fresh.

The dietary preference belongs to the account profile, while its review and
receipt are conversation-scoped. No allergy, calorie target or medical advice
is inferred from this selector. The productive column/migration remains absent;
only the disposable SQL fixture provisions it for tests. Unavailable storage
therefore cannot silently become a default profile or an in-memory write.

Five injected component/controller checks cover review/confirm, null, lost ACK,
scope/choice mismatch and GlobalCoach identity binding. The separately prepared
`e2e/coach-diet.spec.ts` uses real Auth/HTTP while isolated DDL exists, then the
wrapper restores the profile and checks all previous ledger rows. Runtime and
build evidence must be recorded against the committed candidate before release.
