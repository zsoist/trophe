import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'components/coach/CoachInsightPanel.tsx'), 'utf8');
const clientPage = readFileSync(join(process.cwd(), 'app/coach/client/[id]/page.tsx'), 'utf8');

describe('CoachInsightPanel UI contract', () => {
  it('calls the protected coach insight endpoint with a bearer session', () => {
    expect(source).toContain("fetch('/api/ai/coach-insight'");
    expect(source).toContain('Authorization: `Bearer ${token}`');
    expect(source).toContain('JSON.stringify({ clientId, question: prompt })');
  });

  it('renders citations, generation provenance, and accessible errors', () => {
    expect(source).toContain('insight.citations');
    expect(source).toContain('insight.generationId');
    expect(source).toContain("insight.groundingStatus === 'uncited'");
    expect(source).toContain('role="alert"');
    expect(source).toContain('aria-live="polite"');
  });

  it('is integrated into the coach client detail surface', () => {
    expect(clientPage).toContain("import CoachInsightPanel from '@/components/coach/CoachInsightPanel'");
    expect(clientPage).toContain('<CoachInsightPanel clientId={clientId} />');
  });
});
