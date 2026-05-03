/* global React */
/* Variants 01 (Thread) and 02 (Letter) */

const { useState: useS1, useEffect: useE1, useRef: useR1, useMemo: useM1 } = React;

// ═══════════════════════════════════════════════════════════════════
// 01 — THE THREAD
// You physically pull a continuous line from yesterday to today.
// Past days are static line segments with coach notes pinned to them.
// ═══════════════════════════════════════════════════════════════════
function Thread() {
  const T = window.TOK;
  // Each day has a value 0-1 (compliance strength). null = not yet done. -1 = skipped.
  const history = [0.85, 0.9, 0.7, 0.95, 0.6, 0.82, 0.4, 0.88];
  const [today, setToday] = useS1(null); // 0-1 or -1 (skipped)
  const [pulling, setPulling] = useS1(false);
  const [pullVal, setPullVal] = useS1(0);
  const areaRef = useR1(null);
  const dragRef = useR1({ active: false, startY: 0 });

  const W = 336;
  const H = 280;
  const slotW = W / 14;

  const coachNotes = {
    2: { text: 'tough meeting day', color: T.ink4 },
    6: { text: 'you crushed this', color: T.accent },
  };

  const onDown = (e) => {
    if (today !== null) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = { active: true, startY: y };
    setPulling(true);
  };
  const onMove = (e) => {
    if (!dragRef.current.active) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const dy = dragRef.current.startY - y;
    setPullVal(Math.max(0, Math.min(1, dy / 180)));
  };
  const onUp = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setPulling(false);
    if (pullVal > 0.05) {
      setToday(pullVal);
      if (navigator.vibrate) navigator.vibrate([8, 16, 8]);
    } else {
      setPullVal(0);
    }
  };

  // Build path
  const valY = (v) => v === -1 ? H - 20 : H - 30 - v * (H - 60);
  const pts = [];
  history.forEach((v, i) => pts.push([slotW * (i + 0.5), valY(v)]));
  if (today !== null) pts.push([slotW * 8.5, valY(today)]);
  else if (pulling || pullVal > 0) pts.push([slotW * 8.5, valY(pullVal)]);

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.paper }}>
      <window.VariantHeader eye="Day IX · The Thread" title="Pull your line."/>

      {/* Canvas */}
      <div
        ref={areaRef}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        style={{
          position: 'relative', height: H, margin: '0 18px',
          cursor: today === null ? 'ns-resize' : 'default',
          touchAction: 'none', userSelect: 'none',
        }}
      >
        {/* Baseline */}
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
          {/* faint horizon lines */}
          {[0.25, 0.5, 0.75].map((f, i) => (
            <line key={i} x1={0} x2={W} y1={H - 30 - f * (H - 60)} y2={H - 30 - f * (H - 60)}
              stroke={T.hair} strokeWidth={0.5} strokeDasharray="2 4"/>
          ))}
          {/* axis */}
          <line x1={0} x2={W} y1={H - 20} y2={H - 20} stroke={T.hairStrong} strokeWidth={0.5}/>
          {/* Day ticks */}
          {Array.from({length:14}).map((_,i) => (
            <g key={i}>
              <text x={slotW*(i+0.5)} y={H - 6} fontFamily={T.mono} fontSize={7}
                fill={i === 8 ? T.accent : T.ink4} textAnchor="middle"
                fontWeight={i === 8 ? 600 : 400}>{i+1}</text>
            </g>
          ))}
          {/* the thread itself */}
          <path d={pathD} fill="none" stroke={T.ink} strokeWidth={1.5}
            strokeLinecap="round" strokeLinejoin="round"/>
          {/* dots on past points */}
          {history.map((v, i) => (
            <circle key={i} cx={slotW*(i+0.5)} cy={valY(v)} r={2.5} fill={T.ink}/>
          ))}
          {/* today's point */}
          {(today !== null || pullVal > 0) && (
            <>
              <circle cx={slotW*8.5} cy={valY(today !== null ? today : pullVal)} r={5}
                fill={T.accent} stroke={T.paper} strokeWidth={1.5}/>
              {/* Dashed continuation to the right (future) */}
              <line x1={slotW*8.5} x2={W} y1={valY(today !== null ? today : pullVal)}
                y2={valY(today !== null ? today : pullVal)}
                stroke={T.hairStrong} strokeWidth={0.5} strokeDasharray="2 3"/>
            </>
          )}
          {/* Today indicator (bare) when untouched */}
          {today === null && pullVal === 0 && !pulling && (
            <g>
              <circle cx={slotW*8.5} cy={H - 20} r={4} fill="none"
                stroke={T.accent} strokeWidth={1}/>
              <line x1={slotW*8.5} x2={slotW*8.5} y1={H-45} y2={H-28}
                stroke={T.accent} strokeWidth={0.5} strokeDasharray="1 2"/>
              <text x={slotW*8.5} y={H-55} fontFamily={T.mono} fontSize={7}
                fill={T.accent} textAnchor="middle" letterSpacing="1">PULL ↑</text>
            </g>
          )}
        </svg>

        {/* Coach notes pinned to past days */}
        {Object.entries(coachNotes).map(([day, note]) => {
          const d = Number(day);
          return (
            <div key={day} style={{
              position: 'absolute',
              left: (slotW*(d+0.5) / W) * 100 + '%',
              top: ((valY(history[d]) - 18) / H) * 100 + '%',
              transform: 'translate(-50%, -100%)',
              fontFamily: T.script, fontSize: 11, color: note.color,
              whiteSpace: 'nowrap', pointerEvents: 'none',
              lineHeight: 1,
            }}>
              <div style={{
                background: 'rgba(250,247,240,0.95)', padding: '3px 7px',
                borderRadius: 3, border: `0.5px solid ${T.hair}`,
              }}>{note.text}</div>
            </div>
          );
        })}
      </div>

      {/* Readout */}
      <div style={{ padding: '14px 22px 6px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '0.18em',
            color: T.ink3, textTransform: 'uppercase' }}>Today</div>
          <div style={{ fontFamily: T.serif, fontSize: 28, fontWeight: 500,
            color: today !== null ? T.accent : T.ink, lineHeight: 1, marginTop: 2 }}>
            {today === null ? (pullVal > 0 ? `${Math.round(pullVal * 100)}%` : '—') : `${Math.round(today * 100)}%`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '0.18em',
            color: T.ink3, textTransform: 'uppercase' }}>Avg · 8 days</div>
          <div style={{ fontFamily: T.serif, fontSize: 16, color: T.ink2 }}>76%</div>
        </div>
      </div>

      {/* Coach line */}
      <div style={{ padding: '6px 22px 14px', borderTop: `0.5px solid ${T.hair}`,
        margin: '10px 18px 0' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 26, height: 26, borderRadius: 13, background: T.accentSoft,
            border: `0.5px solid ${T.accent}`, color: T.accent, fontFamily: T.serif,
            fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, flexShrink: 0, marginTop: 10 }}>M</div>
          <div style={{ flex: 1, marginTop: 8 }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: T.ink3,
              letterSpacing: '0.16em', textTransform: 'uppercase' }}>Michael · reading live</div>
            <div style={{ fontFamily: T.serif, fontSize: 13, color: T.ink,
              fontStyle: 'italic', marginTop: 2, lineHeight: 1.45 }}>
              {today === null
                ? '"I\'ll see your line as you draw it. Pull down for days it was hard."'
                : today < 0.4
                ? '"Noted. Let\'s talk tomorrow — what did the morning look like?"'
                : '"Strong line. Keep the momentum."'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 02 — THE LETTER
// The coach writes you a letter every few days. The check-in is a
// tap-reply embedded in the prose.
// ═══════════════════════════════════════════════════════════════════
function Letter() {
  const T = window.TOK;
  const [answer, setAnswer] = useS1(null); // 'full' | 'half' | 'miss'
  const [revealed, setRevealed] = useS1(false);

  useE1(() => {
    const t = setTimeout(() => setRevealed(true), 200);
    return () => clearTimeout(t);
  }, []);

  const opts = [
    { k: 'full', label: 'yes', tone: T.green },
    { k: 'half', label: 'half', tone: T.gold },
    { k: 'miss', label: 'not today', tone: T.red },
  ];

  const coachReply = {
    full: "Beautiful. You're the kind of client who makes the next habit easy to design.",
    half: "Half counts, more than you think. The body doesn't keep a perfect ledger — it keeps a pattern.",
    miss: "Missed is data. Tell me in one line what happened — no need to explain, just describe.",
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', background: '#f6f1e5',
      backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, rgba(15,13,10,0.04) 27px, rgba(15,13,10,0.04) 28px)' }}>
      <div style={{ padding: '16px 26px 28px' }}>
        {/* Date + dateline */}
        <div style={{ fontFamily: T.serif, fontSize: 11, fontStyle: 'italic',
          color: T.ink3, marginBottom: 4, textAlign: 'right' }}>
          Athens · 18 April, evening
        </div>
        <div style={{ fontFamily: T.serif, fontSize: 22, fontWeight: 500,
          letterSpacing: '-0.01em', color: T.ink, marginBottom: 18,
          fontStyle: 'italic' }}>
          Dear Nikos,
        </div>

        <div style={{ fontFamily: T.serif, fontSize: 15, lineHeight: 1.75,
          color: T.ink, letterSpacing: '0.005em' }}>
          <p style={{ margin: '0 0 14px', textIndent: 20 }}>
            We&apos;re nine days into the water cycle, and I want to say something that I don&apos;t always tell clients in the first week: the second week is different. The novelty wears off. The body becomes bored of being well-cared-for. This is where the habit is actually formed.
          </p>

          <p style={{ margin: '0 0 14px', opacity: revealed ? 1 : 0,
            transition: 'opacity 0.8s', transitionDelay: '0.3s' }}>
            I have one question tonight, and then the rest of the letter.{' '}
            <span style={{
              display: 'inline-block',
              padding: '0 2px',
              borderBottom: answer ? `2px solid ${opts.find(o => o.k === answer).tone}` : `2px dashed ${T.accent}`,
              color: answer ? opts.find(o => o.k === answer).tone : T.accent,
              fontStyle: 'italic', fontWeight: 500,
            }}>
              Did you drink three liters today?
            </span>
          </p>

          {/* Inline answer chips */}
          {!answer && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 18,
              opacity: revealed ? 1 : 0, transition: 'opacity 0.5s',
              transitionDelay: '0.8s' }}>
              {opts.map(o => (
                <button key={o.k} onClick={() => setAnswer(o.k)} style={{
                  padding: '8px 16px', borderRadius: 999,
                  background: 'transparent', border: `1px solid ${T.hairStrong}`,
                  fontFamily: T.serif, fontSize: 14, fontStyle: 'italic',
                  color: T.ink2, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = o.tone; e.currentTarget.style.color = o.tone; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = T.hairStrong; e.currentTarget.style.color = T.ink2; }}>
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {answer && (
            <>
              <p style={{ margin: '0 0 14px', animation: 'fade-in-up 0.6s' }}>
                Thank you. <em style={{ color: opts.find(o => o.k === answer).tone }}>{coachReply[answer]}</em>
              </p>
              <p style={{ margin: '0 0 14px', animation: 'fade-in-up 0.6s', animationDelay: '0.3s', animationFillMode: 'backwards' }}>
                Here&apos;s what I&apos;m watching for this week: not whether you hit three liters every single day, but whether your worst day looks like your average day from last week. That&apos;s the shape of a habit becoming yours.
              </p>
              <p style={{ margin: '0 0 14px', animation: 'fade-in-up 0.6s', animationDelay: '0.6s', animationFillMode: 'backwards' }}>
                Five days left in the cycle. We&apos;ll talk Monday.
              </p>
              <div style={{ marginTop: 20, fontFamily: T.script, fontSize: 26,
                color: T.accent, animation: 'fade-in-up 0.6s', animationDelay: '0.9s', animationFillMode: 'backwards' }}>
                — Michael
              </div>

              {/* The cycle grid — small, book-margin style */}
              <div style={{ marginTop: 28, padding: '14px 18px',
                background: 'rgba(15,13,10,0.03)', borderLeft: `2px solid ${T.accent}`,
                animation: 'fade-in-up 0.6s', animationDelay: '1.1s', animationFillMode: 'backwards' }}>
                <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '0.2em',
                  color: T.ink3, textTransform: 'uppercase', marginBottom: 8 }}>The cycle · 14 days</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14,1fr)', gap: 2 }}>
                  {Array.from({length: 14}).map((_, i) => {
                    const pastStates = ['full','full','half','full','full','full','miss','full'];
                    const state = i < 8 ? pastStates[i] : i === 8 ? answer : null;
                    return (
                      <div key={i} style={{
                        aspectRatio: '1',
                        background: state === 'full' ? T.accent :
                          state === 'half' ? T.gold :
                          state === 'miss' ? T.red :
                          'transparent',
                        opacity: state === 'miss' ? 0.5 : 1,
                        border: state === null ? `0.5px solid ${T.hair}` : 'none',
                        borderRadius: 1,
                      }}/>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes fade-in-up { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }`}</style>
    </div>
  );
}

window.Thread = Thread;
window.Letter = Letter;
