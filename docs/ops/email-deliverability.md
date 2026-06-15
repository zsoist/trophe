# Trophē transactional email — deliverability & activation UX

Covers the signup **confirmation** email (Supabase Auth → Resend SMTP). Status as of the WP1 + P1 work.

## Configuration (verified)
- Sender: `"Trophē" <auth@trophe.app>`, Resend region **us-east-1**, domain **Verified**.
- DNS on `trophe.app` (Cloudflare), confirmed resolving publicly via `1.1.1.1`:
  - DKIM `resend._domainkey` (RSA `p=MIG…`), SPF `send` TXT (`v=spf1 include:amazonses.com ~all`),
    feedback MX `send` (`10 feedback-smtp.us-east-1.amazonses.com`), DMARC `_dmarc` (`v=DMARC1; p=none;`).
- A real send to a Gmail inbox **passed** SPF + DKIM (`d=trophe.app`) + DMARC and the link confirmed the account.

## Known issue: inbox placement
A brand-new sending domain has **no reputation**, so confirmation emails initially land in **Gmail spam/junk** and can arrive a few minutes late. This was worsened by **hard bounces** during canary testing (sending to non-existent addresses like `hgdg@hotmail.com`, `daniel@reyes.com` — Resend auto-suppressed one). Bounces directly hurt sender reputation.

**Do NOT test with fake/non-deliverable addresses.** Use one real inbox.

## Remediation
**Done (P1):**
- Branded HTML confirmation template (subject **"Confirm your Trophē account"**, dark/gold brand, bulletproof button + plaintext fallback URL, security + support lines, `{{ .ConfirmationURL }}` preserved). Paste target: Supabase Dashboard → Authentication → Emails → Templates → "Confirm signup". *(Dashboard-managed; not in the repo.)*
- Login `?confirmed=1` success state: "Account confirmed — sign in to continue."
- Ordinary completed-signup 409 copy: "This email is already registered — please log in."

**Ongoing / operational:**
- Domain warmup: reputation improves with steady, low-bounce real sends over days.
- Consider strengthening DMARC (`p=quarantine` → `p=reject`) once aligned + monitored.
- Zero tolerance for bounces in testing.

## Email-client test matrix (fill after a real-inbox canary)
| Client | Inbox vs spam | Renders (button, brand) | Link confirms | Notes |
|---|---|---|---|---|
| Gmail web | | | | |
| Gmail mobile | | | | |
| Outlook / O365 | | | | |
| Apple Mail (iOS) | | | | |
| Expired/used link | n/a | n/a | shows graceful state | |
