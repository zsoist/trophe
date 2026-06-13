-- Pre-appointment instructions (Daily Nutrafit — Michael: clients need the
-- location + "no eating/drinking 3h before" + 24h cancellation policy before a
-- session). One default message per coach, shown to clients on the booking page.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS appointment_instructions text;
