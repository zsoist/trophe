/** Actual PostgREST filter grammar/matching in the dedicated AG1 local network.
 * No remote URL, API token, auth impersonation, or provider calls. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { hasPostgrestSearchText, sanitizePostgrestIlikeTerm, postgrestIlikeOrFilter, postgrestTokenTerms, mergePostgrestSearchRows } from '../../lib/food/postgrest-search';
const target = new URL(process.env.AG1_TEXT_FOOD_FULL_SCHEMA_URL ?? 'about:blank');
if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54329' || !/^\/trophe_text_food_ag1_full_[a-z0-9_]+$/.test(target.pathname) || target.search || target.hash) throw Error('dedicated_local_database_required');
const pool = new pg.Pool({ connectionString: target.toString() });
const ids = [randomUUID(), randomUUID()], columns = ['name_en','name_el','name_es'];
let requests = 0;
function read(terms: string[]) {
  const query = new URL('http://trophe-ag1-food-postgrest:3000/foods');
  query.searchParams.set('select','id,name_en'); query.searchParams.set('id',`in.(${ids.join(',')})`);
  query.searchParams.set('or',`(${postgrestIlikeOrFilter(terms,columns)})`); query.searchParams.set('limit','20');
  requests++;
  return JSON.parse(execFileSync('docker',['exec','trophe-ag1-text-food-b658','curl','--fail','--silent','--show-error',query.toString()],{encoding:'utf8'})) as Array<{id:string;name_en:string}>;
}
async function main() {
  try {
    for (const [index,name] of ['Milk whole','Milk, whole'].entries()) await pool.query("INSERT INTO public.foods(id,source,name_en,kcal_per_100g,protein_per_100g,carb_per_100g,fat_per_100g) VALUES($1,'custom',$2,60,3,5,3)",[ids[index],name]);
    const phrase=read([sanitizePostgrestIlikeTerm('milk, whole')]), tokens=read(postgrestTokenTerms('milk, whole'));
    assert.equal(phrase.length,1);assert.equal(tokens.length,2);
    const merged=mergePostgrestSearchRows(phrase,tokens,20);assert.equal(merged.length,2);assert.equal(merged[0].name_en,'Milk whole');
    assert.deepEqual(new Set(merged.map(row=>row.name_en)),new Set(['Milk whole','Milk, whole']));
    assert.equal(hasPostgrestSearchText(',()"'),false);assert.equal(requests,2);
    const report={outcome:'passed',checks:['real_PostgREST_phrase_returns_unpunctuated_name','real_PostgREST_token_supplement_returns_both_names','merge_preserves_phrase_priority_and_deduplicates','delimiter_only_input_is_rejected_without_HTTP'],httpRequests:requests,role:'existing authenticated lookup policy; no user JWT',network:'dedicated internal docker network only',productionQueryPlansVerified:false,paidCalls:0};
    await writeFile('/private/tmp/ds2-real-postgrest-report.json',JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify(report)+'\n');
  }finally { await pool.query('DELETE FROM public.foods WHERE id=ANY($1::uuid[])',[ids]);await pool.end(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
