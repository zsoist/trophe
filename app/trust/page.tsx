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
  ['Vercel', 'Application hosting & delivery', 'United States (us-east-2) — under SCCs', 'vercel.com/legal/privacy-policy'],
  ['DeepSeek', 'AI text inference (food parsing, coaching insights)', 'Per DeepSeek platform terms — only minimal task context is sent, never full health records', 'platform.deepseek.com'],
  ['Anthropic', 'AI vision inference (meal photos only)', 'US, zero-retention API tier', 'anthropic.com/privacy'],
  ['Voyage AI', 'Text embeddings (food names only — no personal data)', 'US', 'voyageai.com'],
  ['Langfuse', 'AI observability (pseudonymous run telemetry)', 'EU', 'langfuse.com/privacy'],
];

const RIGHTS = [
  ['Access & portability', 'Request a full export of your data in machine-readable format (Art. 15, 20).'],
  ['Rectification', 'Correct any inaccurate personal data (Art. 16).'],
  ['Erasure', 'Request complete deletion of your account and data (Art. 17). Deletion cascades through all tables.'],
  ['Restriction & objection', 'Limit or object to specific processing (Art. 18, 21).'],
  ['Consent withdrawal', 'Withdraw any consent at any time without affecting prior lawfulness (Art. 7).'],
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
          ['Roles, plainly', `Your nutrition practice (or clinic) is the data controller for client data; trophē is the processor acting on your documented instructions. A signable Article 28 Data Processing Agreement is available for every paid plan — email dpo@trophe.app.`],
          ['Where data lives', `Primary data is stored in Supabase (PostgreSQL), currently hosted on AWS in the United States (us-east-2). Migration to an EU region is planned. Because this is a transfer outside the EEA, it is governed by the European Commission's Standard Contractual Clauses incorporated in our processors' data processing agreements (Supabase, AWS). Row-level security is enforced on every table — coaches can only ever read clients explicitly assigned to them, verified by database policy, not application code. Backups are automated with point-in-time recovery.`],
          ['Encryption', `TLS 1.2+ in transit everywhere; AES-256 encryption at rest. Authentication uses short-lived tokens in HTTP-only cookies; service credentials are never present in client code.`],
          ['What our AI sees', `Food parsing sends the food text being logged — not your identity. Coaching insights send a structured snapshot the coach already has access to. Meal photos go exclusively to a zero-retention vision API. No client data is ever used to train models.`],
          ['Medical documents', `We deliberately do NOT accept uploads of blood panels or medical documents yet. Until our counsel finalises retention obligations for health records, the intake collects lifestyle answers only — the most privacy-preserving default.`],
          ['Retention', `Active account data is retained while the account exists. Deleted accounts cascade-erase within 30 days, including backups rotation. AI telemetry is pseudonymous and pruned at 90 days.`],
          ['Breach notification', `Confirmed personal-data breaches are notified to affected controllers without undue delay and within 72 hours, per Article 33, with a documented incident runbook.`],
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
            Controllers are notified of sub-processor changes 30 days in advance with the right to object.
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
            Exercise any right from your profile settings or by emailing{' '}
            <a href="mailto:dpo@trophe.app" style={{ color: GOLD }}>dpo@trophe.app</a>.
            We respond within 30 days, usually much faster.
          </p>
        </section>

        <div style={{
          marginTop: 40, padding: '18px 20px', borderRadius: 14,
          border: `1px solid ${GOLD}40`, background: `${GOLD}0d`, fontSize: 13.5, lineHeight: 1.65, color: '#d6d3d1',
        }}>
          Running a clinic or multi-coach practice? We&rsquo;ll walk your DPO through
          this page, sign the DPA, and answer your security questionnaire —{' '}
          <a href="mailto:dpo@trophe.app" style={{ color: GOLD }}>dpo@trophe.app</a>.
        </div>

        <p style={{ color: '#57534e', fontSize: 11, marginTop: 40, fontFamily: 'monospace' }}>
          Last updated June 2026 · trophē — Precision Nutrition Coaching
        </p>
      </div>
    </div>
  );
}
