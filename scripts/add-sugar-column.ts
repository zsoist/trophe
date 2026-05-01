import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iwbpzwmidzvpiofnqexd.supabase.co',
  'REDACTED_ROTATE_NOW'
);

async function main() {
  // Check if sugar_g exists
  const { error } = await supabase.from('food_log').select('sugar_g').limit(1);
  if (!error) {
    console.log('sugar_g column already exists in food_log');
  } else {
    console.log('sugar_g does NOT exist:', error.message);
    console.log('Run this SQL in Supabase dashboard:');
    console.log('ALTER TABLE food_log ADD COLUMN IF NOT EXISTS sugar_g REAL;');
    console.log('ALTER TABLE custom_foods ADD COLUMN IF NOT EXISTS sugar_g REAL;');
  }
}

main().catch(console.error);
