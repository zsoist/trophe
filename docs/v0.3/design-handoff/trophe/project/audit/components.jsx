/* global React */
const { useState, useEffect, useMemo } = React;

// ═══════════════════════════════════════════════════════════════════
//  Design tokens — three directions, toggle via Tweaks
// ═══════════════════════════════════════════════════════════════════
const DIRECTIONS = {
  current: {
    name: 'As-Is (Dark + Gold)',
    bg: '#0a0a0a',
    surface: 'rgba(26,26,26,0.7)',
    surfaceSolid: '#141414',
    border: 'rgba(255,255,255,0.06)',
    borderStrong: 'rgba(255,255,255,0.12)',
    text: '#f5f5f4',
    textMuted: '#a8a29e',
    textFaint: '#78716c',
    accent: '#D4A853',
    accentSoft: 'rgba(212,168,83,0.12)',
    good: '#22c55e',
    warn: '#f59e0b',
    bad: '#ef4444',
    serif: "'Playfair Display', Georgia, serif",
    sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    radius: 16,
    hairline: '0.5px',
  },
  editorial: {
    name: 'Editorial (Paper + Ink)',
    bg: '#f4f1ea',
    surface: '#ffffff',
    surfaceSolid: '#ffffff',
    border: 'rgba(25,23,20,0.08)',
    borderStrong: 'rgba(25,23,20,0.18)',
    text: '#191714',
    textMuted: '#58524a',
    textFaint: '#8a8277',
    accent: '#7a2e1f',
    accentSoft: 'rgba(122,46,31,0.08)',
    good: '#3f6b3a',
    warn: '#a86a1a',
    bad: '#a8371a',
    serif: "'EB Garamond', 'Playfair Display', Georgia, serif",
    sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    radius: 4,
    hairline: '1px',
  },
  precision: {
    name: 'Precision (Instrument)',
    bg: '#fafaf9',
    surface: '#ffffff',
    surfaceSolid: '#ffffff',
    border: 'rgba(15,15,15,0.08)',
    borderStrong: 'rgba(15,15,15,0.22)',
    text: '#0f0f0f',
    textMuted: '#5a5a5a',
    textFaint: '#8a8a8a',
    accent: '#0f0f0f',
    accentSoft: 'rgba(15,15,15,0.06)',
    good: '#1a6a1a',
    warn: '#b07a00',
    bad: '#b01a1a',
    serif: "'Inter', system-ui, sans-serif",
    sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    radius: 2,
    hairline: '1px',
  },
};

// ═══════════════════════════════════════════════════════════════════
//  Phone frame — iOS-ish, 390×844
// ═══════════════════════════════════════════════════════════════════
function Phone({ label, sub, children, tone = 'before', direction }) {
  const d = direction || DIRECTIONS.current;
  const toneColor = tone === 'after' ? d.accent : '#a8a29e';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
      <div>
        <div style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: toneColor, marginBottom: 4,
        }}>
          {tone === 'before' ? '— Current —' : '— Proposed —'}
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: '#0f0f0f' }}>{label}</div>
        {sub && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#6b6b6b', marginTop: 2, maxWidth: 320 }}>{sub}</div>}
      </div>
      <div style={{
        width: 360, height: 740,
        background: '#111',
        borderRadius: 44,
        padding: 8,
        boxShadow: tone === 'after'
          ? '0 40px 80px -20px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.08)'
          : '0 20px 40px -12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.08)',
      }}>
        <div style={{
          width: '100%', height: '100%',
          background: d.bg,
          borderRadius: 36, overflow: 'hidden',
          position: 'relative',
          fontFamily: d.sans, color: d.text,
        }}>
          {/* Status bar */}
          <div style={{
            height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            padding: '0 24px 8px', fontSize: 13, fontWeight: 600, position: 'relative', zIndex: 10,
            color: d.text, fontFamily: d.sans,
          }}>
            <span>9:41</span>
            <div style={{
              position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              width: 100, height: 28, background: '#000', borderRadius: 14,
            }}/>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <svg width="16" height="10" viewBox="0 0 16 10"><path d="M1 8h1V4H1zM5 8h1V2H5zM9 8h1V0H9zM13 8h1V-1h-1z" fill="currentColor"/></svg>
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M7 1.5a9 9 0 016.3 2.5l-1 1A7.6 7.6 0 007 3 7.6 7.6 0 001.7 5L.7 4A9 9 0 017 1.5zm0 3a6 6 0 014.2 1.7l-1 1A4.6 4.6 0 007 6a4.6 4.6 0 00-3.2 1.3l-1-1A6 6 0 017 4.5zm0 3a3 3 0 012.1.9L8 9.5 7 10l-1-.5-1.1-1.1A3 3 0 017 7.5z" fill="currentColor"/></svg>
              <div style={{ width: 24, height: 11, border: `1px solid currentColor`, borderRadius: 3, padding: 1, position: 'relative' }}>
                <div style={{ width: '85%', height: '100%', background: 'currentColor', borderRadius: 1 }}/>
                <div style={{ position: 'absolute', right: -3, top: 3, width: 2, height: 3, background: 'currentColor', borderRadius: '0 1px 1px 0' }}/>
              </div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  BEFORE — Current client dashboard (reconstructed from source)
// ═══════════════════════════════════════════════════════════════════
function BeforeClientDashboard() {
  const gold = '#D4A853';
  return (
    <div style={{ padding: '24px 20px 80px', overflow: 'auto', height: 'calc(100% - 44px)' }}>
      {/* Greeting */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 24, background: 'linear-gradient(135deg,#D4A853,#B8923E)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 700, fontSize: 18 }}>N</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Good morning, Nikos ☀️</div>
          <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 2 }}>Friday, April 18</div>
          <div style={{ fontSize: 11, color: '#78716c', fontStyle: 'italic', marginTop: 2 }}>Consistency beats perfection</div>
        </div>
      </div>
      <div style={{
        display: 'inline-flex', gap: 6, alignItems: 'center', padding: '6px 12px',
        borderRadius: 999, background: 'rgba(212,168,83,0.1)', border: '1px solid rgba(212,168,83,0.2)', marginBottom: 16,
      }}>
        <span>🔥</span>
        <span style={{ color: gold, fontSize: 11, fontWeight: 600 }}>9 day streak</span>
      </div>

      {/* Today's progress glass card */}
      <div style={{
        background: 'rgba(26,26,26,0.7)', border: '1px solid rgba(212,168,83,0.3)',
        borderRadius: 16, padding: 20, marginBottom: 14, backdropFilter: 'blur(20px)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', color: '#d6d3d1', textTransform: 'uppercase', marginBottom: 16 }}>Today&apos;s Progress</div>
        {/* Calorie ring */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{ position: 'relative', width: 140, height: 140 }}>
            <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="70" cy="70" r="62" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10"/>
              <circle cx="70" cy="70" r="62" fill="none" stroke={gold} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={2*Math.PI*62} strokeDashoffset={2*Math.PI*62*(1-0.72)} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>1,584</div>
              <div style={{ fontSize: 10, color: '#a8a29e' }}>of 2,200 kcal</div>
              <div style={{ fontSize: 9, color: '#78716c', marginTop: 2 }}>616 left</div>
            </div>
          </div>
        </div>
        {/* Macro bars */}
        {[
          { l: 'Protein', v: 112, t: 165, c: '#ef4444' },
          { l: 'Carbs', v: 184, t: 220, c: '#3b82f6' },
          { l: 'Fat', v: 48, t: 70, c: '#a855f7' },
          { l: 'Fiber', v: 22, t: 30, c: '#22c55e' },
        ].map((m) => (
          <div key={m.l} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#a8a29e', width: 48, textAlign: 'right' }}>{m.l}</span>
            <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(m.v/m.t)*100}%`, background: m.c, borderRadius: 999 }}/>
            </div>
            <span style={{ fontSize: 10, color: '#a8a29e', width: 68, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {m.v}g / {m.t}g
            </span>
          </div>
        ))}
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#78716c' }}>3 of 5 meals logged</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {[1,1,1,0,0].map((on,i) => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: 4,
                background: on ? gold : 'rgba(255,255,255,0.1)' }}/>
            ))}
          </div>
        </div>
      </div>

      {/* Active habit */}
      <div style={{ background: 'rgba(26,26,26,0.7)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16, padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>💧</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Drink 3L of water daily</div>
            <div style={{ fontSize: 10, color: '#78716c' }}>Day 9 of 14</div>
          </div>
          <div style={{ fontSize: 10, color: gold }}>Best: 14</div>
        </div>
        <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: '100%', width: '64%',
            background: 'linear-gradient(90deg,#B8923E,#D4A853,#E8C878)', borderRadius: 999 }}/>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#B8923E,#D4A853)',
            color: '#0a0a0a', borderRadius: 12, fontSize: 12, fontWeight: 600, border: 'none' }}>✓ Done</button>
          <button style={{ flex: 1, padding: '10px', background: 'transparent', color: '#a8a29e',
            border: '1px solid #2a2a2a', borderRadius: 12, fontSize: 12 }}>✗ Not today</button>
        </div>
      </div>

      {/* Quick actions 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[['🍽️','Log Food'], ['💪','Workout'], ['💧','Water'], ['📊','Progress']].map(([e,l]) => (
          <div key={l} style={{ background: 'rgba(26,26,26,0.7)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 22 }}>{e}</span>
            <span style={{ fontSize: 11, color: '#d6d3d1', fontWeight: 500 }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Water tracker */}
      <div style={{ background: 'rgba(26,26,26,0.7)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#d6d3d1', fontWeight: 500 }}>💧 6/10 glasses</div>
          <button style={{ padding: '5px 10px', border: '1px solid #2a2a2a', borderRadius: 10,
            fontSize: 10, color: '#a8a29e', background: 'transparent' }}>+ Add</button>
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
          {Array.from({ length: 10 }).map((_,i) => (
            <div key={i} style={{ flex: 1, height: 7, borderRadius: 999,
              background: i<6 ? '#60a5fa' : 'rgba(255,255,255,0.06)' }}/>
          ))}
        </div>
      </div>

      {/* Health tip */}
      <div style={{ background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.2)',
        borderRadius: 16, padding: 14 }}>
        <div style={{ fontSize: 10, color: gold, fontWeight: 600, letterSpacing: '0.1em' }}>DID YOU KNOW</div>
        <div style={{ fontSize: 12, color: '#d6d3d1', marginTop: 4, lineHeight: 1.5 }}>
          💪 Spreading protein across 4+ meals improves absorption vs loading it all at dinner.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  BEFORE — Current food log (simplified but faithful)
// ═══════════════════════════════════════════════════════════════════
function BeforeFoodLog() {
  const gold = '#D4A853';
  return (
    <div style={{ padding: '16px 16px 80px', overflow: 'auto', height: 'calc(100% - 44px)', fontSize: 12 }}>
      {/* Date nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button style={{ color: '#a8a29e', background: 'none', border: 'none' }}>‹</button>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Today · Fri Apr 18</div>
        <button style={{ color: '#a8a29e', background: 'none', border: 'none' }}>›</button>
      </div>
      {/* Week strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 10 }}>
        {['M','T','W','T','F','S','S'].map((d,i) => (
          <div key={i} style={{
            textAlign: 'center', padding: '6px 2px', borderRadius: 10, fontSize: 10,
            background: i===4 ? 'rgba(212,168,83,0.15)' : 'rgba(255,255,255,0.03)',
            border: i===4 ? `1px solid ${gold}` : '1px solid rgba(255,255,255,0.05)',
            color: i===4 ? gold : '#a8a29e',
          }}>
            <div>{d}</div>
            <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>{12+i}</div>
            <div style={{ fontSize: 8, marginTop: 2, opacity: 0.6 }}>{1400 + i*100}</div>
          </div>
        ))}
      </div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Track Food</div>
          <button style={{ fontSize: 9, color: '#a8a29e', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8, padding: '3px 6px', background: 'none' }}>⚙ Customize</button>
          <div style={{ fontSize: 10, color: '#f97316', padding: '2px 6px',
            background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 999 }}>🔥 9</div>
        </div>
        <div style={{ fontSize: 10, color: '#78716c' }}>3 of 5</div>
      </div>
      {/* View toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {['Macros','Gauge','Radar'].map((v,i) => (
          <button key={v} style={{
            padding: '3px 9px', borderRadius: 999, fontSize: 9,
            background: i===0 ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: i===0 ? '#d6d3d1' : '#78716c', border: 'none',
          }}>{v}</button>
        ))}
      </div>
      {/* Macro totals */}
      <div style={{ background: 'rgba(26,26,26,0.7)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16, padding: 12, marginBottom: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, textAlign: 'center' }}>
          {[
            ['1584',' / 2200','kcal', gold],
            ['112g',' / 165g','Protein','#f87171'],
            ['184g',' / 220g','Carbs','#60a5fa'],
            ['48g',' / 70g','Fat','#a78bfa'],
            ['22g',' / 30g','Fiber','#22c55e'],
          ].map(([v,t,l,c]) => (
            <div key={l}>
              <div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
              <div style={{ fontSize: 8, color: '#78716c' }}>{t}</div>
              <div style={{ fontSize: 9, color: '#a8a29e' }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
          {['Cal','P','C','F'].map((l,i) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <svg width="28" height="28" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="14" cy="14" r="11" fill="none" stroke="#2a2a2a" strokeWidth="3"/>
                  <circle cx="14" cy="14" r="11" fill="none" stroke={gold} strokeWidth="3"
                    strokeDasharray={69} strokeDashoffset={69*(1-[0.72,0.68,0.84,0.69][i])} strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 8, color: '#78716c' }}>{[72,68,84,69][i]}%</span>
              </div>
              <span style={{ fontSize: 7, color: '#78716c' }}>{l}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 9, color: '#78716c' }}>Sugar est: ~64g / 36g limit ⓘ</div>
      </div>
      {/* Favorites chips */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 8, color: '#78716c', marginBottom: 4 }}>★ FAVORITES</div>
        <div style={{ display: 'flex', gap: 5, overflow: 'hidden' }}>
          {['Greek yogurt · 150','Eggs (2) · 140','Chicken breast · 185','Rice bowl · 320'].map((f) => (
            <div key={f} style={{ flexShrink: 0, padding: '4px 8px', borderRadius: 999, fontSize: 9,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#d6d3d1' }}>{f}</div>
          ))}
        </div>
      </div>
      {/* Health tip */}
      <div style={{ background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.2)',
        borderRadius: 12, padding: 8, marginBottom: 10, fontSize: 10, color: gold }}>
        💪 53g protein to go — chicken (31g/150g), eggs (6g each), Greek yogurt (15g)
      </div>
      {/* Meal slots */}
      {[['🌅','Breakfast','Greek yogurt + berries','320',true],
        ['🍎','Morning Snack','Empty','',false],
        ['☀️','Lunch','Chicken bowl','520',true],
        ['🥜','Afternoon Snack','Empty','',false],
        ['🌙','Dinner','In progress','744',true]].map(([e,n,d,c,filled]) => (
        <div key={n} style={{ background: 'rgba(26,26,26,0.7)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14, padding: 10, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{e}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{n}</div>
              <div style={{ fontSize: 9, color: '#78716c', marginTop: 1 }}>{d}</div>
            </div>
            {filled ? <span style={{ fontSize: 11, color: gold }}>{c}</span> :
              <span style={{ fontSize: 9, color: '#78716c' }}>+ Add</span>}
          </div>
        </div>
      ))}
      {/* Analytics hint */}
      <div style={{ marginTop: 12, fontSize: 10, color: '#78716c', fontStyle: 'italic', textAlign: 'center' }}>
        + Daily Insights · Weekly Summary · Meal Timeline · Fasting Timer · Protein Distribution · Nutrient Density · Photo Gallery · 7 more analytics charts ↓
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  BEFORE — Coach dashboard (simplified)
// ═══════════════════════════════════════════════════════════════════
function BeforeCoach() {
  const gold = '#D4A853';
  const card = { background: 'rgba(26,26,26,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 10 };
  return (
    <div style={{ padding: '16px 14px 40px', overflow: 'auto', height: 'calc(100% - 44px)', fontSize: 11 }}>
      {/* Nav */}
      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(26,26,26,0.7)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, marginBottom: 12, overflow: 'auto' }}>
        {['Clients','Habits','Protocols','Foods','Templates'].map((n,i) => (
          <div key={n} style={{ padding: '6px 10px', borderRadius: 10, fontSize: 10, whiteSpace: 'nowrap',
            background: i===0 ? 'rgba(212,168,83,0.15)' : 'transparent',
            color: i===0 ? gold : '#a8a29e' }}>{n}</div>
        ))}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Good morning, Michael</div>
      <div style={{ fontSize: 10, color: '#78716c', marginBottom: 12 }}>2 clients need attention</div>
      {/* Pulse cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 10 }}>
        {[['6','Clients'],['72%','Avg'],['41','Meals'],['2','Risk']].map(([v,l]) => (
          <div key={l} style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: gold }}>{v}</div>
            <div style={{ fontSize: 8, color: '#78716c' }}>{l}</div>
          </div>
        ))}
      </div>
      {/* Streak banner */}
      <div style={{ ...card, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🔥</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600 }}>7-day coaching streak</div>
          <div style={{ fontSize: 9, color: '#78716c' }}>Keep it going!</div>
        </div>
      </div>
      {/* Weekly summary */}
      <div style={{ background: 'rgba(26,26,26,0.7)', border: '1px solid rgba(212,168,83,0.3)',
        borderRadius: 14, padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600 }}>📅 Weekly Summary</div>
          <div style={{ fontSize: 9, color: '#78716c' }}>Apr 14 - Apr 20</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, textAlign: 'center' }}>
          {[['6','Active'],['72%','Avg Streak'],['1','Ready'],['2','Attention']].map(([v,l]) => (
            <div key={l}>
              <div style={{ fontSize: 14, fontWeight: 700, color: gold }}>{v}</div>
              <div style={{ fontSize: 7, color: '#78716c', textTransform: 'uppercase' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>
        {[['6','Total','#f5f5f4'],['4','On Track','#22c55e'],['2','At Risk','#ef4444']].map(([v,l,c]) => (
          <div key={l} style={card}>
            <div style={{ fontSize: 18, fontWeight: 700, color: c, textAlign: 'center' }}>{v}</div>
            <div style={{ fontSize: 9, color: '#78716c', textAlign: 'center' }}>{l}</div>
          </div>
        ))}
      </div>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 10, overflow: 'auto' }}>
        {['All 6','On Track 4','At Risk 2','Inactive 1'].map((p,i) => (
          <div key={p} style={{ padding: '4px 8px', borderRadius: 999, fontSize: 9, whiteSpace: 'nowrap',
            background: i===0 ? 'rgba(212,168,83,0.1)' : 'transparent',
            color: i===0 ? gold : '#a8a29e',
            border: i===0 ? '1px solid rgba(212,168,83,0.4)' : '1px solid rgba(255,255,255,0.1)' }}>{p}</div>
        ))}
      </div>
      {/* Client cards */}
      {[
        ['Nikos Papadakis','💧 Drink 3L water','9/14d','green'],
        ['Daniel Reyes','🥗 Protein every meal','12/14d','green',true],
        ['Daniela Torres','🚶 10k steps','1/14d','yellow'],
        ['Dimitra Kavdas','😴 Sleep 8 hours','—','red'],
      ].map(([n,h,s,st,ready]) => (
        <div key={n} style={{ ...card, marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: 14,
              background: 'linear-gradient(135deg,#D4A853,#B8923E)', color: '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{n[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{n}</span>
                {ready && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 999,
                  background: 'rgba(212,168,83,0.15)', color: gold }}>READY</span>}
              </div>
              <div style={{ fontSize: 9, color: '#a8a29e', marginTop: 1 }}>{h}</div>
              <div style={{ fontSize: 8, color: '#78716c', marginTop: 2 }}>Mood: 4.2/5 · Checked in today</div>
            </div>
            <div style={{ fontSize: 9, color: '#78716c' }}>{s}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  AFTER — Redesigned client dashboard (direction-aware)
// ═══════════════════════════════════════════════════════════════════
function AfterClientDashboard({ d }) {
  const editorial = d.name.startsWith('Editorial');
  const precision = d.name.startsWith('Precision');
  const dark = d.name.startsWith('As-Is');

  return (
    <div style={{ padding: 0, overflow: 'auto', height: 'calc(100% - 44px)' }}>
      {/* Header */}
      <div style={{ padding: '8px 24px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontFamily: d.mono, fontSize: 10, letterSpacing: '0.18em',
              color: d.textMuted, textTransform: 'uppercase' }}>Fri · Apr 18 · Day 9</div>
            <div style={{ fontFamily: d.serif, fontSize: 32, fontWeight: editorial ? 500 : 600,
              letterSpacing: '-0.02em', marginTop: 4, lineHeight: 1.1 }}>
              {editorial ? (
                <>Good morning,<br/><span style={{ fontStyle: 'italic', color: d.accent }}>Nikos</span>.</>
              ) : (
                <>Good morning,<br/>Nikos.</>
              )}
            </div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 20,
            background: d.accentSoft, border: `${d.hairline} solid ${d.borderStrong}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: d.serif, fontSize: 15, color: d.accent, fontWeight: 600 }}>N</div>
        </div>
      </div>

      {/* HERO: The habit — the moat, at the top */}
      <div style={{ margin: '0 16px 16px', padding: '20px',
        background: d.surface, border: `${d.hairline} solid ${d.border}`,
        borderRadius: d.radius, position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: d.mono, fontSize: 10, letterSpacing: '0.16em',
              color: d.textMuted, textTransform: 'uppercase' }}>This cycle&apos;s habit</div>
            <div style={{ fontFamily: d.serif, fontSize: 22, fontWeight: 500, marginTop: 6,
              letterSpacing: '-0.01em', lineHeight: 1.2, fontStyle: editorial ? 'italic' : 'normal' }}>
              Drink 3L of water daily
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: d.mono, fontSize: 10, color: d.textMuted, letterSpacing: '0.1em' }}>DAY</div>
            <div style={{ fontFamily: d.serif, fontSize: 36, fontWeight: 600, color: d.accent, lineHeight: 1, marginTop: 2 }}>09</div>
            <div style={{ fontFamily: d.mono, fontSize: 9, color: d.textFaint, marginTop: 2 }}>of 14</div>
          </div>
        </div>

        {/* 14-dot compliance — the ACTUAL PN methodology made visible */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14,1fr)', gap: 4, marginBottom: 14 }}>
          {Array.from({ length: 14 }).map((_,i) => {
            const done = i < 8;
            const today = i === 8;
            const future = i > 8;
            return (
              <div key={i} style={{
                aspectRatio: '1',
                borderRadius: d.radius > 8 ? 4 : 2,
                background: done ? d.accent : today ? 'transparent' : d.accentSoft,
                border: today ? `1.5px solid ${d.accent}` : `${d.hairline} solid ${future ? d.border : 'transparent'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: d.mono, fontSize: 8, color: today ? d.accent : d.bg, fontWeight: 600,
              }}>{today ? '·' : ''}</div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ flex: 2, padding: '14px 0', borderRadius: d.radius, border: 'none',
            background: d.accent, color: d.bg, fontFamily: d.sans, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', cursor: 'pointer' }}>
            Check in today
          </button>
          <button style={{ flex: 1, padding: '14px 0', borderRadius: d.radius,
            background: 'transparent', color: d.textMuted,
            border: `${d.hairline} solid ${d.borderStrong}`, fontFamily: d.sans, fontSize: 13, cursor: 'pointer' }}>
            Skip
          </button>
        </div>
      </div>

      {/* Nutrition — one line, quietly */}
      <div style={{ margin: '0 16px 16px', padding: '18px 20px',
        background: d.surface, border: `${d.hairline} solid ${d.border}`, borderRadius: d.radius }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ fontFamily: d.mono, fontSize: 10, letterSpacing: '0.16em',
            color: d.textMuted, textTransform: 'uppercase' }}>Nutrition</div>
          <div style={{ fontFamily: d.mono, fontSize: 10, color: d.textFaint }}>3 of 5 meals</div>
        </div>

        {/* Single horizontal calorie bar with tick marks */}
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div>
              <span style={{ fontFamily: d.serif, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>1,584</span>
              <span style={{ fontFamily: d.sans, fontSize: 12, color: d.textMuted, marginLeft: 6 }}>/ 2,200 kcal</span>
            </div>
            <div style={{ fontFamily: d.mono, fontSize: 10, color: d.textMuted }}>616 left</div>
          </div>
          <div style={{ height: 2, background: d.border, borderRadius: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '72%',
              background: d.accent, borderRadius: 1 }}/>
          </div>
        </div>

        {/* Macros — minimal horizontal list */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            ['Protein','112','165'],
            ['Carbs','184','220'],
            ['Fat','48','70'],
            ['Fiber','22','30'],
          ].map(([l,v,t]) => {
            const pct = Math.min(Number(v)/Number(t), 1);
            return (
              <div key={l}>
                <div style={{ fontFamily: d.mono, fontSize: 9, color: d.textFaint, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{l}</div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontFamily: d.serif, fontSize: 17, fontWeight: 600 }}>{v}</span>
                  <span style={{ fontFamily: d.mono, fontSize: 9, color: d.textFaint }}>/{t}g</span>
                </div>
                <div style={{ marginTop: 6, height: 2, background: d.border, borderRadius: 1 }}>
                  <div style={{ width: `${pct*100}%`, height: '100%',
                    background: pct > 0.9 ? d.good : d.text, borderRadius: 1 }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Meal strip — next action is obvious */}
      <div style={{ margin: '0 16px 16px' }}>
        <div style={{ fontFamily: d.mono, fontSize: 10, letterSpacing: '0.16em',
          color: d.textMuted, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 4 }}>Today&apos;s meals</div>

        {[
          ['Breakfast','Greek yogurt, honey, berries','320 kcal', 'done'],
          ['Snack','·','—', 'skip'],
          ['Lunch','Chicken bowl, tahini','520 kcal', 'done'],
          ['Snack','·','—', 'empty'],
          ['Dinner','Logging...','744 kcal', 'progress'],
        ].map(([meal,desc,cal,state],i) => {
          const isDone = state === 'done';
          const isEmpty = state === 'empty';
          const isProgress = state === 'progress';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 0',
              borderBottom: i < 4 ? `${d.hairline} solid ${d.border}` : 'none' }}>
              <div style={{ width: 18, height: 18, borderRadius: 4,
                border: `${d.hairline} solid ${isDone ? d.accent : d.borderStrong}`,
                background: isDone ? d.accent : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0 }}>
                {isDone && <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2 2 4-4" stroke={d.bg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>}
                {isProgress && <div style={{ width: 6, height: 6, borderRadius: '50%', background: d.accent }}/>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: d.sans, fontSize: 14, fontWeight: 500,
                  color: isEmpty ? d.textFaint : d.text }}>{meal}</div>
                <div style={{ fontFamily: d.sans, fontSize: 11, color: d.textMuted,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{desc}</div>
              </div>
              <div style={{ fontFamily: d.mono, fontSize: 11, color: d.textMuted, fontVariantNumeric: 'tabular-nums' }}>{cal}</div>
            </div>
          );
        })}
      </div>

      {/* Water — simple */}
      <div style={{ margin: '0 16px 16px', padding: '14px 20px',
        background: d.surface, border: `${d.hairline} solid ${d.border}`, borderRadius: d.radius,
        display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontFamily: d.mono, fontSize: 10, color: d.textMuted, letterSpacing: '0.1em' }}>WATER</div>
        <div style={{ flex: 1, display: 'flex', gap: 3 }}>
          {Array.from({ length: 10 }).map((_,i) => (
            <div key={i} style={{ flex: 1, height: 18, borderRadius: 1,
              background: i < 6 ? d.text : d.border }}/>
          ))}
        </div>
        <div style={{ fontFamily: d.mono, fontSize: 11, color: d.text, fontVariantNumeric: 'tabular-nums' }}>6/10</div>
        <button style={{ width: 28, height: 28, borderRadius: d.radius,
          border: `${d.hairline} solid ${d.borderStrong}`, background: 'transparent',
          color: d.text, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>

      {/* Coach note — quiet, present */}
      <div style={{ margin: '0 16px 24px', padding: '14px 18px',
        background: d.accentSoft, border: `${d.hairline} solid ${d.accent}`,
        borderRadius: d.radius, borderLeftWidth: 2, borderLeftStyle: 'solid', borderLeftColor: d.accent }}>
        <div style={{ fontFamily: d.mono, fontSize: 9, color: d.accent,
          letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 4 }}>From Michael, your coach</div>
        <div style={{ fontFamily: d.serif, fontSize: 14, lineHeight: 1.5, color: d.text,
          fontStyle: editorial ? 'italic' : 'normal' }}>
          {editorial ? '"' : ''}Great consistency this week. If water is easy by Monday, we&apos;ll layer protein next.{editorial ? '"' : ''}
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'sticky', bottom: 0, background: d.bg,
        borderTop: `${d.hairline} solid ${d.border}`,
        padding: '10px 0 28px', display: 'flex', justifyContent: 'space-around' }}>
        {['Today','Food','Train','Body','You'].map((n,i) => (
          <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            color: i===0 ? d.accent : d.textMuted }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              {i===0 && <path d="M3 8l7-5 7 5v8a1 1 0 01-1 1h-3v-5H7v5H4a1 1 0 01-1-1V8z" stroke="currentColor" strokeWidth="1.4"/>}
              {i===1 && <><rect x="4" y="3" width="12" height="14" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.4"/></>}
              {i===2 && <path d="M3 10h2l2-4 3 8 3-8 2 4h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>}
              {i===3 && <><circle cx="10" cy="6" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 17c0-3 2-6 5-6s5 3 5 6" stroke="currentColor" strokeWidth="1.4"/></>}
              {i===4 && <><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 16c1-2 3-3 5-3s4 1 5 3" stroke="currentColor" strokeWidth="1.4"/></>}
            </svg>
            <div style={{ fontFamily: d.mono, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{n}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.DIRECTIONS = DIRECTIONS;
window.Phone = Phone;
window.BeforeClientDashboard = BeforeClientDashboard;
window.BeforeFoodLog = BeforeFoodLog;
window.BeforeCoach = BeforeCoach;
window.AfterClientDashboard = AfterClientDashboard;
