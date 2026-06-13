import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const component = readFileSync(join(process.cwd(), 'components/admin/PrivacyRequests.tsx'), 'utf8');
const profile = readFileSync(join(process.cwd(), 'app/dashboard/profile/page.tsx'), 'utf8');

describe('privacy requests UI contract', () => {
  it('supports authenticated export and deletion requests', () => {
    expect(component).toContain("fetch('/api/privacy/requests'");
    expect(component).toContain("submit('export')");
    expect(component).toContain("submit('deletion')");
    expect(component).toContain('Authorization: `Bearer ${data.session.access_token}`');
  });

  it('states deletion is reviewed rather than immediate', () => {
    expect(component).toContain('Deletion is verified before processing and is not immediate.');
  });

  it('is integrated into the user profile', () => {
    expect(profile).toContain("import PrivacyRequests from '@/components/admin/PrivacyRequests'");
    expect(profile).toContain('<PrivacyRequests />');
  });
});
