/** Build a read-only atlas catalogue from versioned workout seeds. Never connects to a database. */
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const root = new URL('../../', import.meta.url);
const seed = readFileSync(new URL('scripts/seed-exercises.js', root), 'utf8');
const array = seed.match(/const EXERCISES = (\[[\s\S]*?\n\]);/)[1];
const rows = runInNewContext(`(${array})`, Object.create(null), { timeout: 1000 });
const cues = readFileSync(new URL('drizzle/0057_seed_exercise_cues.sql', root), 'utf8');
const quoted = "'((?:[^']|'')*)'";
const values = new RegExp(`\\(${quoted},\\s*${quoted},\\s*${quoted},\\s*${quoted}\\)`, 'g');
const instructions = new Map([...cues.matchAll(values)].map(match => {
  const [name, en, es, el] = match.slice(1).map(value => value.replaceAll("''", "'"));
  return [name.toLowerCase(), [en, es, el]];
}));
const catalogue = rows.map(row => {
  const [instructions_en, instructions_es, instructions_el] = instructions.get(row.name.toLowerCase()) ?? [];
  return { ...row, id: row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), instructions: instructions_en ?? null, instructions_es: instructions_es ?? null, instructions_el: instructions_el ?? null };
});
writeFileSync(new URL('lib/anatomy/exercise-catalogue.json', root), JSON.stringify(catalogue, null, 2) + '\n');
console.log(`${catalogue.length} versioned workout templates; ${catalogue.filter(x => x.instructions).length} instruction blocks`);
