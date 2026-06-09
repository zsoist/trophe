import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 1. All orange varieties
  console.log('=== ALL ORANGE RAW FOODS ===');
  const { data: oranges } = await sb.from('foods').select('id, name_en, default_serving_grams').filter('name_en', 'ilike', '%Orange%raw%').not('name_en', 'ilike', '%juice%').not('name_en', 'ilike', '%peel%').not('name_en', 'ilike', '%Fish%').not('name_en', 'ilike', '%Tomato%').limit(10);
  for (const o of (oranges || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', o.id);
    console.log(`  ${o.id.slice(0,8)} | ${(o.name_en||'').slice(0,55).padEnd(57)} | serv=${o.default_serving_grams} | conv=${JSON.stringify(conv?.map(c => c.unit+'='+c.grams_per_unit))}`);
  }

  // 2. All lamb foods
  console.log('\n=== ALL LAMB FOODS ===');
  const { data: lambs } = await sb.from('foods').select('id, name_en, kcal_per_100g, default_serving_grams').filter('name_en', 'ilike', '%Lamb%').not('name_en', 'ilike', '%baby%').not('name_en', 'ilike', '%quarters%').limit(15);
  for (const l of (lambs || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', l.id);
    console.log(`  ${l.id.slice(0,8)} | ${(l.name_en||'').slice(0,55).padEnd(57)} | cal=${l.kcal_per_100g} serv=${l.default_serving_grams}${conv?.length ? ' | conv=' + JSON.stringify(conv.map(c=>c.unit+'='+c.grams_per_unit)) : ''}`);
  }

  // 3. Tzatziki
  console.log('\n=== TZATZIKI ===');
  const { data: tz } = await sb.from('foods').select('id, name_en, kcal_per_100g, default_serving_grams, default_serving_unit').filter('name_en', 'ilike', '%tzatziki%').limit(3);
  for (const t of (tz || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', t.id);
    console.log(`  ${t.name_en?.slice(0,40)} | cal=${t.kcal_per_100g} serv=${t.default_serving_grams} unit=${t.default_serving_unit} | conv=${JSON.stringify(conv?.map(c=>c.unit+'='+c.grams_per_unit))}`);
  }

  // 4. Sweet potato
  console.log('\n=== SWEET POTATO ===');
  const { data: sp } = await sb.from('foods').select('id, name_en, kcal_per_100g, carb_per_100g, default_serving_grams').filter('name_en', 'ilike', '%sweet potato%').not('name_en', 'ilike', '%leaves%').not('name_en', 'ilike', '%frozen%').limit(10);
  for (const s of (sp || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', s.id);
    console.log(`  ${s.id.slice(0,8)} | ${(s.name_en||'').slice(0,55).padEnd(57)} | carb=${s.carb_per_100g} serv=${s.default_serving_grams}${conv?.length ? ' | conv=' + JSON.stringify(conv.map(c=>c.unit+'='+c.grams_per_unit)) : ''}`);
  }

  // 5. FAGE
  console.log('\n=== FAGE ===');
  const { data: fage } = await sb.from('foods').select('id, name_en, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, default_serving_grams').filter('name_en', 'ilike', '%FAGE%').limit(5);
  for (const f of (fage || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', f.id);
    console.log(`  ${f.name_en?.slice(0,55)} | cal=${f.kcal_per_100g} p=${f.protein_per_100g} c=${f.carb_per_100g} f=${f.fat_per_100g} serv=${f.default_serving_grams} | conv=${JSON.stringify(conv?.map(c=>c.unit+'='+c.grams_per_unit))}`);
  }

  // 6. Oatmeal variants
  console.log('\n=== OAT VARIANTS ===');
  const { data: oat1 } = await sb.from('foods').select('id, name_en, kcal_per_100g').filter('name_en', 'ilike', '%oat bran%cooked%').limit(2);
  oat1?.forEach(f => console.log(`  OatBran: ${f.name_en?.slice(0,55)} cal=${f.kcal_per_100g}`));
  const { data: oat2 } = await sb.from('foods').select('id, name_en, kcal_per_100g').filter('name_en', 'ilike', '%Cereals, oats%').limit(5);
  oat2?.forEach(f => console.log(`  Oatmeal: ${f.name_en?.slice(0,55)} cal=${f.kcal_per_100g}`));

  // 7. Greek Yogurt Plain
  console.log('\n=== GREEK YOGURT PLAIN ===');
  const { data: gyp } = await sb.from('foods').select('id, name_en, kcal_per_100g, protein_per_100g, fat_per_100g, default_serving_grams').filter('name_en', 'ilike', '%yogurt%Greek%plain%').limit(10);
  for (const g of (gyp || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', g.id);
    console.log(`  ${g.id.slice(0,8)} | ${(g.name_en||'').slice(0,55).padEnd(57)} | cal=${g.kcal_per_100g} p=${g.protein_per_100g} f=${g.fat_per_100g} serv=${g.default_serving_grams}${conv?.length ? ' | conv=' + JSON.stringify(conv.map(c=>c.unit+'='+c.grams_per_unit)) : ''}`);
  }

  // 8. Pasta cooked
  console.log('\n=== PASTA COOKED ===');
  const { data: pasta } = await sb.from('foods').select('id, name_en, kcal_per_100g, protein_per_100g, fat_per_100g, default_serving_grams').filter('name_en', 'ilike', '%pasta%cooked%').limit(5);
  for (const p of (pasta || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', p.id);
    console.log(`  ${p.id.slice(0,8)} | ${(p.name_en||'').slice(0,55).padEnd(57)} | cal=${p.kcal_per_100g} p=${p.protein_per_100g} f=${p.fat_per_100g} serv=${p.default_serving_grams}${conv?.length ? ' | conv=' + JSON.stringify(conv.map(c=>c.unit+'='+c.grams_per_unit)) : ''}`);
  }

  // 9. Ground beef
  console.log('\n=== GROUND BEEF ===');
  const { data: beef } = await sb.from('foods').select('id, name_en, kcal_per_100g, protein_per_100g, fat_per_100g, default_serving_grams').filter('name_en', 'ilike', '%beef, ground%cooked%').limit(5);
  for (const b of (beef || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', b.id);
    console.log(`  ${b.id.slice(0,8)} | ${(b.name_en||'').slice(0,55).padEnd(57)} | cal=${b.kcal_per_100g} p=${b.protein_per_100g} f=${b.fat_per_100g} serv=${b.default_serving_grams}${conv?.length ? ' | conv=' + JSON.stringify(conv.map(c=>c.unit+'='+c.grams_per_unit)) : ''}`);
  }

  // 10. Cottage cheese
  console.log('\n=== COTTAGE CHEESE ===');
  const { data: cc } = await sb.from('foods').select('id, name_en, kcal_per_100g, protein_per_100g, fat_per_100g, default_serving_grams').filter('name_en', 'ilike', '%cottage cheese%').limit(5);
  for (const c of (cc || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', c.id);
    console.log(`  ${c.id.slice(0,8)} | ${(c.name_en||'').slice(0,55).padEnd(57)} | cal=${c.kcal_per_100g} p=${c.protein_per_100g} f=${c.fat_per_100g} serv=${c.default_serving_grams}${conv?.length ? ' | conv=' + JSON.stringify(conv.map(c=>c.unit+'='+c.grams_per_unit)) : ''}`);
  }

  // 11. Chicken breast - pollo asado
  console.log('\n=== CHICKEN BREAST COOKED ===');
  const { data: chk } = await sb.from('foods').select('id, name_en, kcal_per_100g, protein_per_100g, fat_per_100g, default_serving_grams').filter('name_en', 'ilike', '%chicken%breast%cooked%').limit(5);
  for (const c of (chk || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', c.id);
    console.log(`  ${c.id.slice(0,8)} | ${(c.name_en||'').slice(0,55).padEnd(57)} | cal=${c.kcal_per_100g} p=${c.protein_per_100g} f=${c.fat_per_100g} serv=${c.default_serving_grams}${conv?.length ? ' | conv=' + JSON.stringify(conv.map(c=>c.unit+'='+c.grams_per_unit)) : ''}`);
  }

  // 12. Tuna
  console.log('\n=== TUNA ===');
  const { data: tuna } = await sb.from('foods').select('id, name_en, kcal_per_100g, protein_per_100g, fat_per_100g, default_serving_grams').filter('name_en', 'ilike', '%tuna%canned%').limit(5);
  for (const t of (tuna || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', t.id);
    console.log(`  ${t.id.slice(0,8)} | ${(t.name_en||'').slice(0,55).padEnd(57)} | cal=${t.kcal_per_100g} p=${t.protein_per_100g} f=${t.fat_per_100g} serv=${t.default_serving_grams}${conv?.length ? ' | conv=' + JSON.stringify(conv.map(c=>c.unit+'='+c.grams_per_unit)) : ''}`);
  }

  // 13. Monster Energy
  console.log('\n=== MONSTER ENERGY ===');
  const { data: monster } = await sb.from('foods').select('id, name_en, kcal_per_100g, carb_per_100g, default_serving_grams').filter('name_en', 'ilike', '%Monster%').limit(3);
  for (const m of (monster || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', m.id);
    console.log(`  ${m.name_en?.slice(0,55)} | cal=${m.kcal_per_100g} c=${m.carb_per_100g} serv=${m.default_serving_grams} | conv=${JSON.stringify(conv?.map(c=>c.unit+'='+c.grams_per_unit))}`);
  }

  // 14. Lentils (fakes)
  console.log('\n=== LENTILS COOKED ===');
  const { data: lentils } = await sb.from('foods').select('id, name_en, kcal_per_100g, protein_per_100g, fat_per_100g, default_serving_grams').filter('name_en', 'ilike', '%lentils%cooked%').limit(5);
  for (const l of (lentils || [])) {
    console.log(`  ${l.id.slice(0,8)} | ${(l.name_en||'').slice(0,45).padEnd(47)} | cal=${l.kcal_per_100g} p=${l.protein_per_100g} f=${l.fat_per_100g} serv=${l.default_serving_grams}`);
  }

  // 15. Check all recipes
  console.log('\n=== RECENT RECIPES (last 50) ===');
  const { data: recipes } = await sb.from('dish_recipes').select('dish_name, dish_name_localized, total_grams, total_kcal, total_protein, total_carbs, total_fat').order('created_at', { ascending: false }).limit(50);
  for (const r of (recipes || [])) {
    console.log(`  ${(r.dish_name||'').slice(0,30).padEnd(32)} | ${(r.dish_name_localized||'').slice(0,20).padEnd(22)} | g=${r.total_grams} cal=${r.total_kcal} p=${r.total_protein} c=${r.total_carbs} f=${r.total_fat}`);
  }

  // 16. Plantain
  console.log('\n=== PLANTAIN ===');
  const { data: plant } = await sb.from('foods').select('id, name_en, kcal_per_100g, default_serving_grams').filter('name_en', 'ilike', '%plantain%').limit(10);
  for (const p of (plant || [])) {
    const { data: conv } = await sb.from('food_unit_conversions').select('unit, grams_per_unit').eq('food_id', p.id);
    console.log(`  ${p.id.slice(0,8)} | ${(p.name_en||'').slice(0,55).padEnd(57)} | cal=${p.kcal_per_100g} serv=${p.default_serving_grams}${conv?.length ? ' | conv=' + JSON.stringify(conv.map(c=>c.unit+'='+c.grams_per_unit)) : ''}`);
  }
}

main();
