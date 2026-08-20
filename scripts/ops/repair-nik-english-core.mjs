import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GREEK = /[\u0370-\u03ff]/u;

export function parseRepairArguments(argv) {
  const values = new Map();
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (!['--user-id', '--email', '--mapping', '--backup-dir'].includes(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    values.set(arg, value);
    index += 1;
  }

  const userId = values.get('--user-id');
  const email = values.get('--email');
  if ((!userId && !email) || (userId && email)) {
    throw new Error('Provide exactly one of --user-id or --email');
  }
  if (userId && !UUID.test(userId)) throw new Error('--user-id must be an exact UUID');
  if (email && (!email.includes('@') || email.trim() !== email)) {
    throw new Error('--email must be one exact normalized email address');
  }

  const mappingPath = values.get('--mapping');
  if (!mappingPath) throw new Error('--mapping is required');
  if (!isAbsolute(mappingPath)) throw new Error('--mapping must be an absolute path');

  return {
    selector: userId ? { userId } : { email },
    mappingPath,
    backupDirectory: values.get('--backup-dir'),
    apply,
  };
}

function validateMapping(mapping, profile, currentRows) {
  if (!mapping || typeof mapping !== 'object' || !Array.isArray(mapping.entries)) {
    throw new Error('Mapping must contain an entries array');
  }
  if (mapping.userId && mapping.userId !== profile.id) {
    throw new Error('Mapping userId does not match the selected profile');
  }

  const mappedIds = new Set();
  for (const entry of mapping.entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
      throw new Error('Every mapping entry requires an exact row id');
    }
    if (mappedIds.has(entry.id)) throw new Error(`Duplicate mapping row id: ${entry.id}`);
    mappedIds.add(entry.id);
    if (typeof entry.description !== 'string' || !entry.description.trim()) {
      throw new Error(`Mapping ${entry.id} requires an English description`);
    }
    if (GREEK.test(entry.description)) {
      throw new Error(`Mapping ${entry.id} still contains Greek characters`);
    }
  }

  const currentIds = new Set(currentRows.map((row) => row.id));
  const missing = [...currentIds].filter((id) => !mappedIds.has(id));
  const unknown = [...mappedIds].filter((id) => !currentIds.has(id));
  if (missing.length || unknown.length) {
    throw new Error(`Mapping row ids must exactly match current meal-plan rows; missing=${missing.join(',') || 'none'} unknown=${unknown.join(',') || 'none'}`);
  }
}

function verifyApplied(profile, rows, mapping) {
  if (!profile || profile.language !== 'en') throw new Error('Profile language verification failed');
  const expected = new Map(mapping.entries.map((entry) => [entry.id, entry.description.trim()]));
  if (rows.length !== expected.size) throw new Error('Meal-plan verification count mismatch');
  for (const row of rows) {
    if (expected.get(row.id) !== row.description) {
      throw new Error(`Meal-plan verification failed for ${row.id}`);
    }
  }
}

export async function runEnglishRepair({
  adapter,
  selector,
  mapping,
  apply = false,
  backupDirectory,
  now = () => new Date(),
}) {
  const profiles = await adapter.findProfiles(selector);
  if (!Array.isArray(profiles) || profiles.length !== 1) {
    throw new Error(`Expected exactly one profile, received ${profiles?.length ?? 0}`);
  }
  const profile = profiles[0];
  const currentRows = await adapter.listMealPlanEntries(profile.id);
  validateMapping(mapping, profile, currentRows);

  const proposedEntries = mapping.entries.map((entry) => ({
    id: entry.id,
    before: currentRows.find((row) => row.id === entry.id)?.description,
    after: entry.description.trim(),
  }));

  if (!apply) {
    return { mode: 'dry-run', profile, proposedLanguage: 'en', proposedEntries };
  }

  if (!backupDirectory) throw new Error('An explicit backup directory is required with --apply');
  await mkdir(backupDirectory, { recursive: true });
  const timestamp = now().toISOString().replaceAll(':', '-');
  const backupPath = join(backupDirectory, `nik-english-${profile.id}-${timestamp}.json`);
  await writeFile(backupPath, `${JSON.stringify({ profile, mealPlanEntries: currentRows }, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });

  const updatedProfileIds = await adapter.updateProfileLanguage(profile.id, 'en');
  if (!Array.isArray(updatedProfileIds) || updatedProfileIds.length !== 1 || updatedProfileIds[0] !== profile.id) {
    throw new Error(`Profile ${profile.id} must update exactly once`);
  }

  const updatedMealPlanIds = [];
  for (const entry of mapping.entries) {
    const ids = await adapter.updateMealPlanEntry({
      rowId: entry.id,
      userId: profile.id,
      description: entry.description.trim(),
    });
    if (!Array.isArray(ids) || ids.length !== 1 || ids[0] !== entry.id) {
      throw new Error(`Meal-plan row ${entry.id} must update exactly once`);
    }
    updatedMealPlanIds.push(entry.id);
  }

  const verifiedProfile = await adapter.verifyProfile(profile.id);
  const verifiedEntries = await adapter.verifyMealPlanEntries(profile.id);
  verifyApplied(verifiedProfile, verifiedEntries, mapping);

  return {
    mode: 'applied',
    backupPath,
    updatedProfileIds,
    updatedMealPlanIds,
    verifiedProfile,
    verifiedEntries,
  };
}
