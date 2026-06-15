# Trophē transactional email — deliverability & activation UX

Covers the signup **confirmation** email (Supabase Auth → Resend SMTP). Status as of the WP1 + P1 work.

## Configuration (verified)
- Sender: `"Trophē" <auth@trophe.app>`, Resend region **us-east-1**, domain **Verified**.
- DNS on `trophe.app` (Cloudflare), confirmed resolving publicly via `1.1.1.1`:
  - DKIM `resend._domainkey` (RSA `p=MIG…`), SPF `send` TXT (`v=spf1 include:amazonses.com ~all`),
    feedback MX `send` (`10 feedback-smtp.us-east-1.amazonses.com`), DMARC `_dmarc` (`v=DMARC1; p=none;`).
- A real send was **delivered** to a Gmail inbox and the confirmation link activated the account.
  Receiver-side **SPF/DKIM/DMARC pass is verification PENDING** — the DNS records resolve and are
  correctly formed, but `Authentication-Results` headers from a delivered message have not yet been
  captured. (DNS-side is verified; receiver-side pass is not.)

## Known issue: inbox placement
A brand-new sending domain has **no reputation**, so confirmation emails initially land in **Gmail spam/junk** and can arrive a few minutes late. This was worsened by **hard bounces** during canary testing (sending to non-existent addresses like `hgdg@hotmail.com`, `daniel@reyes.com` — Resend auto-suppressed one). Bounces directly hurt sender reputation.

**Do NOT test with fake/non-deliverable addresses.** Use one real inbox.

## Remediation
**Done in code (PR):**
- Login `?confirmed=1` success state: "Account confirmed — sign in to continue."
- Signup `conflict` copy kept **generic** ("A signup with these details is already in progress").
  Not changed to "already registered": `conflict` also covers a concurrent in-progress request /
  recovering reservation, and the genuine already-confirmed replay is `replayed_completed` → 202.
  A truthful "already registered" message needs a distinct, proven DB outcome (future).

**Installed + real-inbox canary PASSED (2026-06-15):**
- Branded HTML confirmation template (subject **"Confirm your Trophē account"**, dark/gold brand,
  styled button + plaintext fallback URL, `{{ .ConfirmationURL }}` preserved) —
  `docs/ops/email-templates/confirm-signup.html` — **installed** in Supabase Dashboard → Authentication →
  Emails → Templates → "Confirm signup". *(Dashboard-managed; not in the repo.)*
- Real-inbox canary on the **installed branded template** — **PASSED**:
  - branded template rendered correctly (dark/gold brand + styled button);
  - email **delivered to the operator's main inbox**;
  - confirmation link **activated the account**;
  - landing on `/login?confirmed=1` rendered the **"Account confirmed — sign in to continue."** notice
    (also live-verified on the deployed bundle);
  - **authenticated session worked** after sign-in;
  - **no duplicate account** was created.
- **Receiver-side SPF/DKIM/DMARC pass: still PENDING.** The `Authentication-Results` headers of the
  delivered message were **not inspected** during this canary, so receiver-side alignment remains
  unverified. (DNS records resolve and are correctly formed — see Configuration — but a delivered-message
  header showing `spf=pass; dkim=pass; dmarc=pass` has not yet been captured.)

**Ongoing / operational:**
- Domain warmup: reputation improves with steady, low-bounce real sends over days.
- Consider strengthening DMARC (`p=quarantine` → `p=reject`) once aligned + monitored.
- Zero tolerance for bounces in testing.

## Email-client test matrix (fill after a real-inbox canary)
The 2026-06-15 canary covered **one real inbox**. Cross-client rendering/placement and the
receiver-side `Authentication-Results` header remain to be filled.

| Client | Inbox vs spam | Renders (button, brand) | Link confirms | Notes |
|---|---|---|---|---|
| **Primary inbox (canary 2026-06-15)** | **Inbox** | **✓ button + brand** | **✓ activated** | Session OK after sign-in; no duplicate account. `Authentication-Results` header **not inspected** → SPF/DKIM/DMARC still pending. |
| Gmail web | | | | |
| Gmail mobile | | | | |
| Outlook / O365 | | | | |
| Apple Mail (iOS) | | | | |
| Expired/used link | n/a | n/a | shows graceful state | |
