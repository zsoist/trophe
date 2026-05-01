/* global React */
/* Shared tokens & helpers for the 6 check-in variants */

const TOK = {
  bg: '#f2ede3',
  paper: '#faf7f0',
  ink: '#0f0d0a',
  ink2: '#3a342c',
  ink3: '#6b6359',
  ink4: '#9c9388',
  hair: 'rgba(15,13,10,0.1)',
  hairStrong: 'rgba(15,13,10,0.22)',
  accent: '#7a2e1f',
  accentSoft: 'rgba(122,46,31,0.1)',
  red: '#a8371a',
  green: '#3f6b3a',
  gold: '#a8811a',
  night: '#0b0a14',
  nightAccent: '#e4c87c',
  tide: '#1e4a5c',
  tideAccent: '#7fb8c9',
  serif: "'EB Garamond', Georgia, serif",
  sans: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
  script: "'Caveat', cursive",
};

// Phone frame
function Phone({ children, width = 380, height = 780, bg = TOK.paper }) {
  return (
    <div style={{
      width, height, background: '#0a0a0a', borderRadius: 46, padding: 8,
      boxShadow: '0 50px 100px -20px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.1)',
      flexShrink: 0,
    }}>
      <div style={{
        width: '100%', height: '100%', background: bg, borderRadius: 38,
        overflow: 'hidden', position: 'relative',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ height: 46, flexShrink: 0, position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            width: 108, height: 30, background: '#0a0a0a', borderRadius: 15,
          }}/>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Variant header (shown inside each phone)
function VariantHeader({ eye, title, color = TOK.ink }) {
  return (
    <div style={{ padding: '8px 22px 16px' }}>
      <div style={{ fontFamily: TOK.mono, fontSize: 9, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: TOK.ink3 }}>{eye}</div>
      <div style={{ fontFamily: TOK.serif, fontSize: 22, fontWeight: 500,
        letterSpacing: '-0.01em', color, marginTop: 2 }}>{title}</div>
    </div>
  );
}

// Roman numerals helper
function toRoman(n) {
  const m = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV'];
  return m[n] || String(n);
}

window.TOK = TOK;
window.Phone = Phone;
window.VariantHeader = VariantHeader;
window.toRoman = toRoman;
