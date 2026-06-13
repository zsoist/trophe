-- i18n expansion: FR/DE/IT/PT/NL app locales (Nutrafit market matrix).
-- Overlay dictionaries live in lib/locales/*; this widens the profile constraint.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_language_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_language_check
  CHECK (language = ANY (ARRAY['en', 'es', 'el', 'fr', 'de', 'it', 'pt', 'nl']));
