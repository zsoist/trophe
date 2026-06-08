import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { ingestKnowledge, chunkKnowledge } from '../../agents/rag/ingest';
import { db } from '../../db/client';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=') || '1'];
}));

const file = args.file && resolve(args.file);
const createdBy = args['created-by'];
const organizationId = args['organization-id'];
const userId = args['user-id'];
const classification = args.classification ?? 'internal';
const source = args.source ?? 'approved_document';
const dryRun = args['dry-run'] === '1';
const allowedClassifications = ['public', 'internal', 'confidential', 'restricted'] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!file) fail('Usage: npm run rag:ingest -- --file=PATH --created-by=UUID [--organization-id=UUID|--user-id=UUID] [--dry-run]');
if (!createdBy || !uuidPattern.test(createdBy)) fail('--created-by must be a UUID');
if (organizationId && userId) fail('Specify only one private scope: --organization-id or --user-id');
if (organizationId && !uuidPattern.test(organizationId)) fail('--organization-id must be a UUID');
if (userId && !uuidPattern.test(userId)) fail('--user-id must be a UUID');
if (!allowedClassifications.includes(classification as typeof allowedClassifications[number])) fail('Invalid --classification');
if (!/\.(md|txt)$/i.test(file)) fail('Only reviewed .md and .txt documents may be ingested');
if (statSync(file).size > 2 * 1024 * 1024) fail('Document exceeds the 2MB ingestion limit');

const content = readFileSync(file, 'utf8').trim();
if (content.length < 50) fail('Document is too short to ingest');
const checksum = createHash('sha256').update(content).digest('hex');
const chunks = chunkKnowledge(content);

async function main() {
  const existing = await db.execute(sql`
    SELECT id, status FROM knowledge_documents
    WHERE checksum = ${checksum}
      AND organization_id IS NOT DISTINCT FROM ${organizationId ?? null}::uuid
      AND user_id IS NOT DISTINCT FROM ${userId ?? null}::uuid
      AND status <> 'tombstoned'
    LIMIT 1
  `);
  if (existing.rows.length) fail(`Document already exists in this scope (${existing.rows[0].id}, ${existing.rows[0].status})`);

  if (dryRun) {
    console.log(JSON.stringify({
      dryRun: true, file, title: args.title ?? basename(file), source, classification,
      organizationId: organizationId ?? null, userId: userId ?? null, checksum, chunks: chunks.length,
    }, null, 2));
    return;
  }

  const result = await ingestKnowledge({
    title: args.title ?? basename(file),
    source,
    content,
    createdBy,
    organizationId,
    userId,
    sourceUri: args['source-uri'],
    version: args.version,
    classification: classification as typeof allowedClassifications[number],
    consentBasis: args['consent-basis'],
  });
  console.log(JSON.stringify({ ...result, checksum }, null, 2));
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
