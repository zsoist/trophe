/**
 * Public Trust & GDPR page — the artifact every EU clinic buyer asks for
 * before anything else (P6, mirrors the Nutrium playbook). Static, public,
 * doubles as sales collateral.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trust & Data Protection — trophē',
  description: 'How trophē handles nutrition data under GDPR: hosting location, transfer safeguards, encryption, sub-processors, retention, and your rights.',
};

const GOLD = '#D4A853';

const SUB_PROCESSORS = [
  ['Supabase', 'Database, authentication, file storage', 'United States (AWS us-east-2) — EU migration planned; under SCCs', 'supabase.com/privacy'],
  ['Vercel', 'Application hosting & delivery', 'United States (functions in cle1) + global edge — under SCCs', 'vercel.com/legal/privacy-policy'],
  ['DeepSeek', 'AI text inference (food parsing, coaching insights)', 'China — DeepSeek may use inputs to improve its services; transfer/data-use basis unresolved', 'platform.deepseek.com'],
  ['Anthropic', 'AI vision inference (meal photos only)', 'US — no training on API inputs', 'anthropic.com/privacy'],
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
    <div style={{ background: '#0a0a0a', minHeight: '100vh', color: '#e7e5e4' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 80px' }}>
        <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.12em', color: GOLD, textTransform: 'uppercase', marginBottom: 12 }}>
          Trust & Data Protection
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.2, marginBottom: 16 }}>
          Your clients trust you.<br />You can verify us.
        </h1>
        <p style={{ color: '#a8a29e', fontSize: 15, lineHeight: 1.7, marginBottom: 40 }}>
          trophē processes nutrition and lifestyle data — special-category data under
          GDPR Article 9. We treat that as an engineering requirement, not a legal
          footnote. This page describes exactly how, in plain language.
        </p>

        {[
          ['Roles, plainly', `Your nutrition practice (or clinic) is the data controller for client data; trophē is the processor acting on your documented instructions. A draft Article 28 Data Processing Agreement is available on request and is being finalised with counsel — email dpo@trophe.app.`],
          ['Where data lives', `Primary data is stored in Supabase (PostgreSQL), currently hosted on AWS in the United States (us-east-2); migration to an EU region is planned. Because this is a transfer outside the EEA, we rely on the EU Standard Contractual Clauses offered in our processors' data-processing agreements (Supabase, AWS); our own transfer-impact assessment and executed DPAs are in progress. Row-level security is enabled on every database table, so tenant access is enforced at the database layer, not only in application code — comprehensive cross-tenant policy tests are on our hardening roadmap. Automated backups and point-in-time recovery are being provisioned as part of our in-progress move to Supabase Pro, and are not yet enabled.`],
          ['Encryption', `TLS 1.2+ in transit everywhere; AES-256 encryption at rest (provided by our hosting platforms). Sessions are kept in cookies rather than browser localStorage; service credentials are never present in client code.`],
          ['What our AI sees', `Our text AI runs on DeepSeek, which processes inputs on infrastructure in China. For coaching features we send client-provided and coach-visible text — food logs, intake answers, coach notes, conversations and a profile snapshot — which can include names, contact details and health-adjacent information. DeepSeek's terms permit it to use inputs to improve its services, so the transfer and data-use basis is unresolved. Search and memory features also generate embeddings via Voyage (US) over that same text. Meal-photo vision runs on Anthropic (US), whose API terms do not train on submitted inputs. We are actively minimising what each provider receives and building automated egress controls; we never send uploaded medical documents, because we don't accept them.`],
          ['Medical documents', `We deliberately do NOT accept uploads of blood panels or medical documents yet. Until our counsel finalises retention obligations for health records, the intake collects lifestyle answers only — the most privacy-preserving default.`],
          ['Retention', `Active account data is retained while the account exists. You can request deletion of your account and data via dpo@trophe.app; a fully-automated, audited erasure workflow (including backup handling) is in active development, and until it ships we process deletion requests manually and confirm scope and timing with you. AI run telemetry is pseudonymous; an automated retention/pruning policy for it is in development.`],
          ['Breach notification', `As processor, trophē notifies affected controllers of confirmed personal-data breaches without undue delay and provides the information they need to meet their own regulatory obligations (such as the 72-hour deadline a controller faces under GDPR Article 33). We maintain a documented incident runbook.`],
        ].map(([h, body]) => (
          <section key={h as string} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, color: '#f5f5f4' }}>{h}</h2>
            <p style={{ color: '#a8a29e', fontSize: 14, lineHeight: 1.7 }}>{body}</p>
          </section>
        ))}

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12, color: '#f5f5f4' }}>Sub-processors</h2>
          <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, overflow: 'hidden' }}>
            {SUB_PROCESSORS.map(([name, purpose, region], i) => (
              <div key={name} style={{
                display: 'flex', gap: 12, padding: '12px 16px', fontSize: 13,
                background: i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
                borderTop: i > 0 ? '1px solid rgba(255,255,255,.05)' : 'none',
              }}>
                <span style={{ width: 90, flexShrink: 0, fontWeight: 600 }}>{name}</span>
                <span style={{ flex: 1, color: '#a8a29e' }}>{purpose}</span>
                <span style={{ width: 200, flexShrink: 0, color: '#78716c', fontSize: 12 }}>{region}</span>
              </div>
            ))}
          </div>
          <p style={{ color: '#78716c', fontSize: 12, marginTop: 8 }}>
            Our current draft DPA proposes notifying controllers of sub-processor changes in advance, with the right to object.
          </p>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12, color: '#f5f5f4' }}>Your rights (and your clients&rsquo;)</h2>
          {RIGHTS.map(([r, d]) => (
            <div key={r as string} style={{ marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{r}</span>
              <span style={{ color: '#a8a29e', fontSize: 14 }}> — {d}</span>
            </div>
          ))}
          <p style={{ color: '#a8a29e', fontSize: 14, marginTop: 12 }}>
            Exercise any right by emailing{' '}
            <a href="mailto:dpo@trophe.app" style={{ color: GOLD }}>dpo@trophe.app</a>.
            Automated rights-fulfilment with SLA tracking is in development; for now requests are handled manually.
          </p>
        </section>

        <div style={{
          marginTop: 40, padding: '18px 20px', borderRadius: 14,
          border: `1px solid ${GOLD}40`, background: `${GOLD}0d`, fontSize: 13.5, lineHeight: 1.65, color: '#d6d3d1',
        }}>
          Running a clinic or multi-coach practice? We&rsquo;ll walk your DPO through
          this page, share our current draft DPA and discuss your requirements, and answer your security questionnaire —{' '}
          <a href="mailto:dpo@trophe.app" style={{ color: GOLD }}>dpo@trophe.app</a>.
        </div>

        <section style={{ marginTop: 32 }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', color: GOLD, marginBottom: 8, fontFamily: 'monospace' }}>
            Data sources &amp; licensing
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: '#a8a29e' }}>
            Nutrition values are compiled from public food-composition databases:{' '}
            <a href="https://world.openfoodfacts.org" style={{ color: GOLD }}>Open Food Facts</a>{' '}
            (© its contributors, used under the{' '}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" style={{ color: GOLD }}>Open Database License (ODbL)</a>),
            USDA FoodData Central, CIQUAL (France), CoFID (UK), BEDCA (Spain) and CREA (Italy).
            Open Food Facts product data remains © its contributors; crowdsourced entries are treated as estimates,
            not lab-verified values.
          </p>
        </section>

        <p style={{ color: '#57534e', fontSize: 11, marginTop: 40, fontFamily: 'monospace' }}>
          Last updated 2026-06-14 · trophē — Precision Nutrition Coaching
        </p>
      </div>
    </div>
  );
}
