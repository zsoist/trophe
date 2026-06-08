import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const pool = new pg.Pool({ connectionString, max: 2 });
const userA = 'fa000000-0000-0000-0000-000000000001';
const userB = 'fa000000-0000-0000-0000-000000000002';
const publicDoc = 'da000000-0000-0000-0000-000000000001';
const privateDocA = 'da000000-0000-0000-0000-000000000002';
const privateDocB = 'da000000-0000-0000-0000-000000000003';
let dbAvailable = false;

async function search(requester: string, subject: string, query: string) {
  const result = await pool.query<{ document_id: string; document_title: string; source: string; content: string }>(
    `select document_id, document_title, source, content
     from hybrid_search_knowledge($1::uuid, $2::uuid, null::uuid, $3, null::vector, 8)`,
    [requester, subject, query],
  );
  return result.rows;
}

beforeAll(async () => {
  try {
    await pool.query('select 1 from hybrid_search_knowledge($1::uuid,$1::uuid,null::uuid,$2,null::vector,1)', [userA, 'probe']);
    await pool.query(`insert into auth.users(id,email) values ($1,'rag-a@test.local'),($2,'rag-b@test.local') on conflict do nothing`, [userA, userB]);
    await pool.query(`insert into profiles(id,full_name,email,role) values ($1,'RAG User A','rag-a@test.local','client'),($2,'RAG User B','rag-b@test.local','client') on conflict do nothing`, [userA, userB]);
    await pool.query(`
      insert into knowledge_documents(id,user_id,title,source,checksum,classification,status,created_by)
      values
        ($1,null,'Public Hydration Protocol','protocol','rag-public','public','ready',$4),
        ($2,$4,'User A Allergy Plan','coach_note','rag-a','confidential','ready',$4),
        ($3,$5,'User B Private Goal','coach_note','rag-b','confidential','ready',$5)
      on conflict (id) do nothing
    `, [publicDoc, privateDocA, privateDocB, userA, userB]);
    await pool.query(`
      insert into knowledge_chunks(document_id,chunk_index,content,checksum,token_count)
      values
        ($1,0,'Hydration target is two liters daily.','rag-public-0',8),
        ($2,0,'User A must avoid shellfish due to allergy.','rag-a-0',10),
        ($3,0,'User B is training for a private marathon goal.','rag-b-0',11)
      on conflict (document_id,chunk_index) do nothing
    `, [publicDoc, privateDocA, privateDocB]);
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('delete from knowledge_documents where id in ($1,$2,$3)', [publicDoc, privateDocA, privateDocB]);
  }
  await pool.end();
});

describe('observed RAG retrieval evidence', () => {
  const requireDatabase = () => {
    if (!dbAvailable && process.env.CI) throw new Error('CI must execute observed RAG retrieval evidence');
    return dbAvailable;
  };

  it('retrieves relevant public and own-user knowledge with provenance', async () => {
    if (!requireDatabase()) return;
    const hydration = await search(userA, userA, 'hydration liters');
    expect(hydration[0]).toMatchObject({ document_id: publicDoc, source: 'protocol' });
    expect(hydration[0].content).toContain('two liters');

    const allergy = await search(userA, userA, 'shellfish allergy');
    expect(allergy[0]).toMatchObject({ document_id: privateDocA, source: 'coach_note' });
  });

  it('prevents cross-user retrieval and returns no answer for unknown topics', async () => {
    if (!requireDatabase()) return;
    const crossUser = await search(userA, userA, 'private marathon');
    expect(crossUser).toEqual([]);

    const unknown = await search(userA, userA, 'quantum chromodynamics');
    expect(unknown).toEqual([]);
  });
});
