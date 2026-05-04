# Stripe Connect Readiness

Status: documented only. Live banking, payouts, and money movement are not enabled.

## What Exists In Code

- Organizations have billing readiness metadata:
  - `billing_email`
  - `stripe_customer_id`
  - `stripe_connect_account_id`
  - `subscription_status`
  - `plan_limits`
- Admins can review organizations from `/admin/orgs`.
- No live Stripe Connect onboarding route is enabled.
- No account-link creation, transfer, payout, or application-fee flow is enabled.

## Launch Gates Before Live Money Movement

1. Decide legal merchant-of-record model.
2. Decide clinic/gym tax and invoicing responsibility.
3. Create Stripe products/prices in test mode.
4. Add test-mode subscription status sync.
5. Add Connect onboarding only after legal/tax approval.
6. Run test-mode webhook replay and failed-payment drills.
7. Enable live mode only with an explicit operator checklist.

## Required Stripe Metadata

- `organization_id`
- `billing_owner_user_id`
- `plan`
- `subscription_status`
- `connected_account_id` only after Connect onboarding is legally approved

## Explicitly Not Enabled

- Live account onboarding
- Live card payments
- Live payouts
- Transfers
- Application fees
- Bank account collection
