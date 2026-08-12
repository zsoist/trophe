/**
 * Public Trust & GDPR page — the artifact every EU clinic buyer asks for
 * before anything else (P6, mirrors the Nutrium playbook). Static, public,
 * doubles as sales collateral.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeModeProvider, ThemeModeToggle } from '@/components/shared/ThemeMode';

export const metadata: Metadata = {
  title: 'Trust & Data Protection — trophē',
  description: 'How trophē handles nutrition data under GDPR: hosting location, transfer safeguards, encryption, sub-processors, retention, and your rights.',
};

const GOLD = 'var(--action-primary)';

const SUB_PROCESSORS = [
  ['Supabase', 'Database, authentication, file storage', 'United States (AWS us-east-2) — EU migration planned; under SCCs', 'supabase.com/privacy'],
  ['Vercel', 'Application hosting & delivery', 'United States (functions in cle1) + global edge — under SCCs', 'vercel.com/legal/privacy-policy'],
  ['OpenAI', 'Consumer food/recipe text inference and short microphone transcription', 'US/global — API inputs are not used for training unless opted in; audio transcription documents no content retention; our TIA, executed DPA and regional configuration review remain in progress', 'openai.com/policies/services-agreement'],
  ['DeepSeek', 'Synthetic evaluation-data generation only; current routing prohibits consumer traffic', 'China — may use inputs to improve its services; synthetic data only under current policy', 'platform.deepseek.com'],
  ['Anthropic', 'Health-context text inference, consumer fallback, and meal-photo vision', 'US — no training on API inputs', 'anthropic.com/privacy'],
  ['Voyage AI', 'Text embeddings over food text and memory/conversation/knowledge content (may include personal data)', 'US — data-use/transfer basis under review', 'voyageai.com'],
  ['Langfuse', 'AI observability (pseudonymous run telemetry)', 'Self-hosted via Cloudflare Tunnel — hosting region not independently verified', 'langfuse.com/privacy'],
];

const RIGHTS = [
  ['Access & portability', 'Request a full export of your data in machine-readable format (Art. 15, 20).'],
  ['Rectification', 'Correct any inaccurate personal data (Art. 16).'],
  ['Erasure', 'Request deletion of your account and data (Art. 17) via dpo@trophe.app; automated erasure is in development, so requests are handled manually for now.'],
  ['Restriction & objection', 'Limit or object to specific processing (Art. 18, 21).'],
  ['Consent withdrawal', 'Withdraw any consent without affecting the lawfulness of prior processing (Art. 7) — contact dpo@trophe.app.'],
];

export default function TrustPage() {
  return (
    <ThemeModeProvider>
    <main style={{ background: 'var(--canvas)', minHeight: '100vh', color: 'var(--content-primary)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 80px' }}>
        <nav aria-label="Public" className="mb-10 flex items-center justify-between">
          <Link href="/" className="inline-flex min-h-11 items-center font-mono text-xs uppercase tracking-[.12em] text-[var(--content-muted)] no-underline">← trophē</Link>
          <ThemeModeToggle />
        </nav>
        <div style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: '.12em', color: GOLD, textTransform: 'uppercase', marginBottom: 12 }}>
          Trust & Data Protection
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.2, marginBottom: 16 }}>
          Your clients trust you.<br />You can verify us.
        </h1>
        <p style={{ color: 'var(--content-muted)', fontSize: 15, lineHeight: 1.7, marginBottom: 40 }}>
          trophē processes nutrition and lifestyle data — special-category data under
          GDPR Article 9. We treat that as an engineering requirement, not a legal
          footnote. This page describes exactly how, in plain language.
        </p>

        {[
          ['Roles, plainly', `Your nutrition practice (or clinic) is the data controller for client data; trophē is the processor acting on your documented instructions. A draft Article 28 Data Processing Agreement is available on request and is being finalised with counsel — email dpo@trophe.app.`],
          ['Where data lives', `Primary data is stored in Supabase (PostgreSQL), currently hosted on AWS in the United States (us-east-2); migration to an EU region is planned. Because this is a transfer outside the EEA, we rely on the EU Standard Contractual Clauses offered in our processors' data-processing agreements (Supabase, AWS); our own transfer-impact assessment and executed DPAs are in progress. Row-level security is enabled on every database table, so tenant access is enforced at the database layer, not only in application code — comprehensive cross-tenant policy tests are on our hardening roadmap. Automated backups and point-in-time recovery are being provisioned as part of our in-progress move to Supabase Pro, and are not yet enabled.`],
          ['Encryption', `TLS 1.2+ in transit everywhere; AES-256 encryption at rest (provided by our hosting platforms). Sessions are kept in cookies rather than browser localStorage; service credentials are never present in client code.`],
          ['What our AI sees', `AI is routed by task. Consumer food parsing, recipes, meal suggestions and shopping extraction use OpenAI's API; a short recorded microphone fallback can also send food or intake audio to OpenAI's Audio Transcriptions endpoint. OpenAI states that API inputs are not used to train models unless a customer opts in, and currently documents no abuse-monitoring or application-state retention for audio transcriptions. We have not yet independently verified regional routing or completed our own transfer-impact assessment and executed vendor DPA review. Health-context text and meal photos use Anthropic (US), whose API terms do not train on submitted inputs. DeepSeek (China) is restricted by code and tests to synthetic evaluation-data generation, not consumer traffic. Search and memory features generate embeddings via Voyage (US) over text that may include personal data. We are actively minimising what each provider receives and building automated egress controls; we never send uploaded medical documents, because we don't accept them.`],
          ['Medical documents', `We deliberately do NOT accept uploads of blood panels or medical documents yet. Until our counsel finalises retention obligations for health records, the intake collects lifestyle answers only — the most privacy-preserving default.`],
          ['Retention', `Active account data is retained while the account exists. You can request deletion of your account and data via dpo@trophe.app; a fully-automated, audited erasure workflow (including backup handling) is in active development, and until it ships we process deletion requests manually and confirm scope and timing with you. AI run telemetry is pseudonymous; an automated retention/pruning policy for it is in development.`],
          ['Breach notification', `As processor, trophē notifies affected controllers of confirmed personal-data breaches without undue delay and provides the information they need to meet their own regulatory obligations (such as the 72-hour deadline a controller faces under GDPR Article 33). We maintain a documented incident runbook.`],
        ].map(([h, body]) => (
          <section key={h as string} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, color: 'var(--content-primary)' }}>{h}</h2>
            <p style={{ color: 'var(--content-muted)', fontSize: 14, lineHeight: 1.7 }}>{body}</p>
          </section>
        ))}

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12, color: 'var(--content-primary)' }}>Sub-processors</h2>
          <div style={{ border: '1px solid var(--border-default)', borderRadius: 12, overflow: 'hidden' }}>
            {SUB_PROCESSORS.map(([name, purpose, region], i) => (
              <div key={name} className="grid gap-2 p-4 text-sm sm:grid-cols-[90px_minmax(0,1fr)_200px] sm:gap-3" style={{
                background: i % 2 ? 'var(--surface-2)' : 'var(--surface-1)',
                borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <span style={{ fontWeight: 600 }}>{name}</span>
                <span style={{ color: 'var(--content-muted)' }}>{purpose}</span>
                <span style={{ color: 'var(--content-muted)', fontSize: 12 }}>{region}</span>
              </div>
            ))}
          </div>
          <p style={{ color: 'var(--content-muted)', fontSize: 12, marginTop: 8 }}>
            Our current draft DPA proposes notifying controllers of sub-processor changes in advance, with the right to object.
          </p>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12, color: 'var(--content-primary)' }}>Your rights (and your clients&rsquo;)</h2>
          {RIGHTS.map(([r, d]) => (
            <div key={r as string} style={{ marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{r}</span>
              <span style={{ color: 'var(--content-muted)', fontSize: 14 }}> — {d}</span>
            </div>
          ))}
          <p style={{ color: 'var(--content-muted)', fontSize: 14, marginTop: 12 }}>
            Exercise any right by emailing{' '}
            <a href="mailto:dpo@trophe.app" style={{ color: GOLD, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>dpo@trophe.app</a>.
            Automated rights-fulfilment with SLA tracking is in development; for now requests are handled manually.
          </p>
        </section>

        <div style={{
          marginTop: 40, padding: '18px 20px', borderRadius: 14,
          border: '1px solid var(--border-focus)', background: 'var(--surface-2)', fontSize: 14, lineHeight: 1.65, color: 'var(--content-secondary)',
        }}>
          Running a clinic or multi-coach practice? We&rsquo;ll walk your DPO through
          this page, share our current draft DPA and discuss your requirements, and answer your security questionnaire —{' '}
          <a href="mailto:dpo@trophe.app" style={{ color: GOLD, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>dpo@trophe.app</a>.
        </div>

        <section style={{ marginTop: 32 }}>
          <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.1em', color: GOLD, marginBottom: 8, fontFamily: 'monospace' }}>
            Data sources &amp; licensing
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--content-muted)' }}>
            Nutrition values are compiled from public food-composition databases:{' '}
            <a href="https://world.openfoodfacts.org" style={{ color: GOLD, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Open Food Facts</a>{' '}
            (© its contributors, used under the{' '}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" style={{ color: GOLD, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Open Database License (ODbL)</a>),
            USDA FoodData Central, CIQUAL (France), CoFID (UK), BEDCA (Spain) and CREA (Italy).
            Open Food Facts product data remains © its contributors; crowdsourced entries are treated as estimates,
            not lab-verified values.
          </p>
        </section>

        <p style={{ color: 'var(--content-muted)', fontSize: 12, marginTop: 40, fontFamily: 'monospace' }}>
          Last updated 2026-08-12 · trophē — Precision Nutrition Coaching
        </p>
      </div>
    </main>
    </ThemeModeProvider>
  );
}
