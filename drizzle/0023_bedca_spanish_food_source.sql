-- Add 'bedca' to food_source enum for Spanish BEDCA food composition data.
ALTER TYPE food_source ADD VALUE IF NOT EXISTS 'bedca';
