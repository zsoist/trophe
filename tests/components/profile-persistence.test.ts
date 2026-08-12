import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'app/dashboard/profile/page.tsx'),
  'utf8',
);

describe('client profile persistence', () => {
  it('validates body inputs before preview and save', () => {
    expect(source).toContain('nutritionProfileInputIssue');
    expect(source).toContain('const bodyInputIssue =');
    expect(source).toContain('if (bodyInputIssue)');
    expect(source).toContain('const preview = !bodyInputIssue');
  });

  it('requires returned rows for nutrition and language writes', () => {
    const block = source.slice(
      source.indexOf('const handleSave = async'),
      source.indexOf('const handleLogout = async'),
    );

    expect(block).not.toContain('Promise.all([');
    expect(block.match(/\.select\('id'\)/g)).toHaveLength(2);
    expect(block.match(/\.maybeSingle\(\)/g)).toHaveLength(2);
    expect(block).toContain('if (nutritionResult.error || !nutritionResult.data)');
    expect(block).toContain('nutritionSaved = true;');
    expect(block).toContain('if (languageResult.error || !languageResult.data)');
    expect(block.indexOf('if (nutritionResult.error')).toBeLessThan(
      block.indexOf('setClientProfile((prev) =>'),
    );
    expect(block.indexOf('if (languageResult.error')).toBeLessThan(
      block.indexOf('setSaved(true)'),
    );
  });

  it('renders translated save failures and adjusted-macro guidance', () => {
    expect(source).toContain('const [saveError, setSaveError]');
    expect(source).toContain("t('profile.save_failed')");
    expect(source).toContain("t('profile.language_save_failed')");
    expect(source).toContain("t('profile.invalid_body')");
    expect(source).toContain("t('profile.macros_adjusted')");
    expect(source).toContain('{saveError && (');
  });
});
