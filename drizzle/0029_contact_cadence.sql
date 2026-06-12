-- P4 coach module: per-client contact cadence (Michael: "some clients come
-- weekly, some every two weeks, some monthly, some every three months").
-- Drives the contact-due notifications on the coach dashboard.
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS contact_cadence_days int NOT NULL DEFAULT 14
  CHECK (contact_cadence_days BETWEEN 1 AND 365);
