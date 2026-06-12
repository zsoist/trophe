-- Add 'cofid' to food_source enum for UK CoFID (McCance & Widdowson) data.
ALTER TYPE food_source ADD VALUE IF NOT EXISTS 'cofid';
