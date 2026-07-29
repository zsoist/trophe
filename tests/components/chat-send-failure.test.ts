import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('chat send failure recovery', () => {
  it('removes an unreferenced upload and restores retry state after insert failure', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/shared/ChatThread.tsx'),
      'utf8',
    );
    const failureBranch = source.slice(
      source.indexOf('if (error || !data) {'),
      source.indexOf('} else {', source.indexOf('if (error || !data) {')),
    );

    expect(failureBranch).toContain('if (attachment_path)');
    expect(failureBranch).toContain(".from('chat-attachments')");
    expect(failureBranch).toContain('.remove([attachment_path])');
    expect(failureBranch).toContain('setDraft(body);');
    expect(failureBranch).toContain('if (att) setPending(att);');
    expect(failureBranch).toContain("setUploadError(t('chat.send_failed'));");
  });

  it('defines send failure copy for every supported language', () => {
    const core = readFileSync(join(process.cwd(), 'lib/i18n.tsx'), 'utf8');
    expect(core).toMatch(
      /'chat\.send_failed': \{ en: '.+', es: '.+', el: '.+' \}/,
    );

    for (const locale of ['de', 'fr', 'it', 'nl', 'pt']) {
      const overlay = readFileSync(
        join(process.cwd(), `lib/locales/${locale}.ts`),
        'utf8',
      );
      expect(overlay).toContain("'chat.send_failed':");
    }
  });
});
