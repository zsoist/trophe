/* global React */

// ═══════════════════════════════════════════════════════════════════
//  AFTER — Food log, radically simplified
// ═══════════════════════════════════════════════════════════════════
function AfterFoodLog({ d }) {
  const editorial = d.name.startsWith('Editorial');

  return (
    <div style={{ overflow: 'auto', height: 'calc(100% - 44px)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '4px 24px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <button style={{ color: d.textMuted, background: 'none', border: 'none', fontSize: 18, padding: 0, cursor: 'pointer' }}>‹</button>
          <div style={{ fontFamily: d.mono, fontSize: 10, letterSpacing: '0.16em',
            color: d.textMuted, textTransform: 'uppercase' }}>Today · Fri Apr 18</div>
          <button style={{ color: d.textFaint, background: 'none', border: 'none', fontSize: 18, padding: 0, cursor: 'pointer' }}>›</button>
        </div>
        <div style={{ fontFamily: d.serif, fontSize: 28, fontWeight: editorial ? 500 : 600,
          letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: 8 }}>
          {editorial ? <><em>Track</em> your food</> : 'Food'}
        </div>
      </div>

      {/* Week strip — cleaner, just dots */}
      <div style={{ padding: '0 24px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0 }}>
          {['M','T','W','T','F','S','S'].map((day,i) => {
            const isToday = i === 4;
            const isPast = i < 4;
            return (
              <div key={i} style={{ textAlign: 'center', padding: '8px 0', position: 'relative' }}>
                <div style={{ fontFamily: d.mono, fontSize: 9, color: d.textFaint,
                  letterSpacing: '0.1em' }}>{day}</div>
                <div style={{ fontFamily: d.serif, fontSize: 16, fontWeight: 600,
                  color: isToday ? d.accent : d.text, marginTop: 4 }}>{12+i}</div>
                <div style={{ marginTop: 4, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: 4, height: 4, borderRadius: 2,
                    background: isToday ? d.accent : isPast ? d.text : d.border }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main calorie readout — editorial-scale */}
      <div style={{ padding: '0 24px 24px', borderBottom: `${d.hairline} solid ${d.border}` }}>
        <div style={{ fontFamily: d.mono, fontSize: 10, letterSpacing: '0.16em',
          color: d.textMuted, textTransform: 'uppercase' }}>Calories</div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: d.serif, fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1 }}>1,584</span>
          <span style={{ fontFamily: d.sans, fontSize: 14, color: d.textMuted }}>/ 2,200</span>
        </div>
        <div style={{ marginTop: 14, height: 3, background: d.border, borderRadius: 2, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '72%',
            background: d.accent, borderRadius: 2 }}/>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[['P','112','165'],['C','184','220'],['F','48','70'],['Fi','22','30']].map(([l,v,t]) => (
            <div key={l}>
              <div style={{ fontFamily: d.mono, fontSize: 9, color: d.textFaint,
                letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {l === 'P' ? 'Protein' : l === 'C' ? 'Carbs' : l === 'F' ? 'Fat' : 'Fiber'}
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ fontFamily: d.serif, fontSize: 18, fontWeight: 600 }}>{v}</span>
                <span style={{ fontFamily: d.mono, fontSize: 9, color: d.textFaint, marginLeft: 2 }}>/{t}</span>
              </div>
              <div style={{ marginTop: 4, height: 2, background: d.border }}>
                <div style={{ width: `${Math.min(Number(v)/Number(t),1)*100}%`, height: '100%', background: d.text }}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Meals — large, deliberate rows */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ fontFamily: d.mono, fontSize: 10, letterSpacing: '0.16em',
          color: d.textMuted, textTransform: 'uppercase', marginBottom: 14 }}>Meals</div>

        {[
          ['Breakfast','07:12','Greek yogurt, honey, blueberries','320','done'],
          ['Lunch','13:24','Chicken bowl, tahini, quinoa','520','done'],
          ['Dinner','—','In progress','744','progress'],
        ].map(([meal,time,desc,cal,st],i) => (
          <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 0',
            borderBottom: `${d.hairline} solid ${d.border}`, alignItems: 'flex-start' }}>
            <div style={{ width: 44, flexShrink: 0 }}>
              <div style={{ fontFamily: d.mono, fontSize: 10, color: d.textMuted }}>{time}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: d.serif, fontSize: 16, fontWeight: 500,
                letterSpacing: '-0.01em' }}>{meal}</div>
              <div style={{ fontFamily: d.sans, fontSize: 12, color: d.textMuted, marginTop: 2 }}>{desc}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: d.serif, fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{cal}</div>
              <div style={{ fontFamily: d.mono, fontSize: 9, color: d.textFaint }}>kcal</div>
            </div>
          </div>
        ))}

        {/* Add meal — one clear affordance */}
        <button style={{ width: '100%', padding: '18px 0', marginTop: 16,
          background: 'transparent', border: `${d.hairline} dashed ${d.borderStrong}`,
          borderRadius: d.radius, color: d.textMuted, fontFamily: d.sans, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
          <span style={{ fontSize: 16 }}>+</span> Add a meal
        </button>
      </div>

      {/* Input affordances — ONE clear CTA, secondary tucked below */}
      <div style={{ position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8, zIndex: 20 }}>
        <button style={{
          padding: '14px 24px', borderRadius: 999, border: 'none',
          background: d.text, color: d.bg, fontFamily: d.sans, fontSize: 13, fontWeight: 600,
          boxShadow: '0 6px 20px rgba(0,0,0,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M7 2l-3 3M7 2l3 3" stroke={d.bg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 7 7)"/>
          </svg>
          Describe what you ate
        </button>
      </div>

      {/* Detail-on-demand cue */}
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <button style={{ fontFamily: d.mono, fontSize: 10, letterSpacing: '0.16em',
          color: d.textFaint, textTransform: 'uppercase',
          background: 'none', border: 'none', cursor: 'pointer' }}>
          View insights & trends ↓
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  AFTER — Coach dashboard
// ═══════════════════════════════════════════════════════════════════
function AfterCoach({ d }) {
  const editorial = d.name.startsWith('Editorial');

  const clients = [
    ['Nikos Papadakis',  'Water 3L daily',        9, 14, 'on-track', '2h ago'],
    ['Daniel Reyes',     'Protein every meal',   12, 14, 'ready',    '45m ago'],
    ['Daniela Torres',   'Walk 10k steps',        1, 14, 'at-risk',  'Yesterday'],
    ['Dimitra Kavdas',   'Sleep 8 hours',        '—', 14, 'inactive','3 days'],
    ['Ana Martin',       'No sugar after 6pm',    5, 14, 'on-track', '1h ago'],
    ['James Okoye',      'Breakfast daily',      11, 14, 'on-track', '30m ago'],
  ];

  return (
    <div style={{ overflow: 'auto', height: 'calc(100% - 44px)', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: '4px 20px 16px', borderBottom: `${d.hairline} solid ${d.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontFamily: d.serif, fontSize: 14, fontWeight: 600,
            fontStyle: editorial ? 'italic' : 'normal', color: d.accent }}>τροφή</div>
          <div style={{ fontFamily: d.mono, fontSize: 9, color: d.textMuted, letterSpacing: '0.1em' }}>COACH · MK</div>
        </div>
        <div style={{ fontFamily: d.serif, fontSize: 24, fontWeight: editorial ? 500 : 600,
          letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          6 clients.<br/>
          <span style={{ color: d.accent, fontStyle: editorial ? 'italic' : 'normal' }}>2 need you</span> today.
        </div>
      </div>

      {/* Action queue — not a dashboard, a queue */}
      <div style={{ padding: '20px 20px 12px' }}>
        <div style={{ fontFamily: d.mono, fontSize: 10, letterSpacing: '0.16em',
          color: d.textMuted, textTransform: 'uppercase', marginBottom: 12 }}>Needs attention</div>

        {/* At-risk client */}
        <div style={{ padding: '16px 18px', background: d.surface,
          border: `${d.hairline} solid ${d.borderStrong}`,
          borderLeft: `3px solid ${d.bad}`,
          borderRadius: d.radius, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontFamily: d.serif, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>Daniela Torres</div>
              <div style={{ fontFamily: d.sans, fontSize: 11, color: d.textMuted, marginTop: 2 }}>Walk 10k steps · Day 1 of 14</div>
            </div>
            <div style={{ fontFamily: d.mono, fontSize: 9, color: d.bad,
              letterSpacing: '0.16em', textTransform: 'uppercase' }}>At risk</div>
          </div>
          {/* 14-dot */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14,1fr)', gap: 3, marginBottom: 10 }}>
            {Array.from({length:14}).map((_,i) => (
              <div key={i} style={{ aspectRatio:'1', borderRadius: d.radius > 8 ? 3 : 1,
                background: i === 0 ? d.accent : i < 2 ? d.accentSoft : d.border }}/>
            ))}
          </div>
          <div style={{ fontFamily: d.serif, fontSize: 13, color: d.text, fontStyle: editorial ? 'italic' : 'normal',
            lineHeight: 1.5, marginBottom: 10 }}>
            {editorial && '"'}Missed 5 of last 7 days. Mood dropped to 2.8/5.{editorial && '"'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ flex: 1, padding: '10px', border: 'none', borderRadius: d.radius,
              background: d.text, color: d.bg, fontFamily: d.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Message Daniela
            </button>
            <button style={{ padding: '10px 14px', border: `${d.hairline} solid ${d.borderStrong}`,
              background: 'transparent', color: d.textMuted, borderRadius: d.radius,
              fontFamily: d.sans, fontSize: 12, cursor: 'pointer' }}>
              Adjust
            </button>
          </div>
        </div>

        {/* Ready-for-next client */}
        <div style={{ padding: '16px 18px', background: d.surface,
          border: `${d.hairline} solid ${d.borderStrong}`,
          borderLeft: `3px solid ${d.accent}`,
          borderRadius: d.radius }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontFamily: d.serif, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>Daniel Reyes</div>
              <div style={{ fontFamily: d.sans, fontSize: 11, color: d.textMuted, marginTop: 2 }}>Protein every meal · Day 12 of 14</div>
            </div>
            <div style={{ fontFamily: d.mono, fontSize: 9, color: d.accent,
              letterSpacing: '0.16em', textTransform: 'uppercase' }}>Ready for next</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14,1fr)', gap: 3, marginBottom: 10 }}>
            {Array.from({length:14}).map((_,i) => (
              <div key={i} style={{ aspectRatio:'1', borderRadius: d.radius > 8 ? 3 : 1,
                background: i < 12 ? d.accent : i === 12 ? 'transparent' : d.accentSoft,
                border: i === 12 ? `1.5px solid ${d.accent}` : 'none' }}/>
            ))}
          </div>
          <div style={{ fontFamily: d.serif, fontSize: 13, color: d.text, fontStyle: editorial ? 'italic' : 'normal',
            lineHeight: 1.5, marginBottom: 10 }}>
            {editorial && '"'}Nailed 12/14 days. Time to layer the next habit.{editorial && '"'}
          </div>
          <button style={{ width: '100%', padding: '10px', border: 'none', borderRadius: d.radius,
            background: d.accent, color: d.bg, fontFamily: d.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Design next habit →
          </button>
        </div>
      </div>

      {/* Quiet list: everyone else */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontFamily: d.mono, fontSize: 10, letterSpacing: '0.16em',
          color: d.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>On track · 4</div>

        {clients.filter(c => c[4] === 'on-track').map(([name, habit, day, total, _, last]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 0', borderBottom: `${d.hairline} solid ${d.border}` }}>
            <div style={{ width: 30, height: 30, borderRadius: 15,
              border: `${d.hairline} solid ${d.borderStrong}`,
              background: d.accentSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: d.serif, fontSize: 12, fontWeight: 600, color: d.accent }}>{name[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: d.sans, fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em' }}>{name}</div>
              <div style={{ fontFamily: d.sans, fontSize: 11, color: d.textMuted,
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{habit}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: d.mono, fontSize: 11, color: d.text, fontVariantNumeric: 'tabular-nums' }}>
                {day}<span style={{ color: d.textFaint }}>/{total}</span>
              </div>
              <div style={{ fontFamily: d.mono, fontSize: 9, color: d.textFaint }}>{last}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.AfterFoodLog = AfterFoodLog;
window.AfterCoach = AfterCoach;
