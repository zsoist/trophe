'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calculator } from 'lucide-react';

type CalcSex = 'male' | 'female';

interface ZoneInfo {
  label: string;
  color: string;
  bgColor: string;
}

function getZone(bf: number, sex: CalcSex): ZoneInfo {
  if (sex === 'male') {
    if (bf < 10) return { label: 'Athletic', color: '#22c55e', bgColor: 'rgba(34,197,94,0.15)' };
    if (bf < 20) return { label: 'Fit', color: '#D4A853', bgColor: 'rgba(212,168,83,0.15)' };
    if (bf < 25) return { label: 'Average', color: '#3b82f6', bgColor: 'rgba(59,130,246,0.15)' };
    if (bf < 30) return { label: 'Above Average', color: '#f59e0b', bgColor: 'rgba(245,158,11,0.15)' };
    return { label: 'High', color: '#ef4444', bgColor: 'rgba(239,68,68,0.15)' };
  } else {
    if (bf < 18) return { label: 'Athletic', color: '#22c55e', bgColor: 'rgba(34,197,94,0.15)' };
    if (bf < 25) return { label: 'Fit', color: '#D4A853', bgColor: 'rgba(212,168,83,0.15)' };
    if (bf < 32) return { label: 'Average', color: '#3b82f6', bgColor: 'rgba(59,130,246,0.15)' };
    if (bf < 38) return { label: 'Above Average', color: '#f59e0b', bgColor: 'rgba(245,158,11,0.15)' };
    return { label: 'High', color: '#ef4444', bgColor: 'rgba(239,68,68,0.15)' };
  }
}

function GaugeArc({ value, sex }: { value: number; sex: CalcSex }) {
  // Gauge from 5% to 45%
  const minBf = 5;
  const maxBf = 45;
  const pct = Math.min(Math.max((value - minBf) / (maxBf - minBf), 0), 1);

  const zone = getZone(value, sex);

  // SVG arc
  const cx = 120;
  const cy = 110;
  const r = 80;

  // Zone boundaries for the arc background
  const zones = sex === 'male'
    ? [
        { end: 10, color: '#22c55e' },
        { end: 20, color: '#D4A853' },
        { end: 25, color: '#3b82f6' },
        { end: 30, color: '#f59e0b' },
        { end: 45, color: '#ef4444' },
      ]
    : [
        { end: 18, color: '#22c55e' },
        { end: 25, color: '#D4A853' },
        { end: 32, color: '#3b82f6' },
        { end: 38, color: '#f59e0b' },
        { end: 45, color: '#ef4444' },
      ];

  function arcPath(startPct: number, endPct: number) {
    const startAngle = (-90 + startPct * 180) * (Math.PI / 180);
    const endAngle = (-90 + endPct * 180) * (Math.PI / 180);
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = endPct - startPct > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  let prevEnd = 0;

  // Needle position
  const needleAngle = (-90 + pct * 180) * (Math.PI / 180);
  const needleX = cx + (r - 15) * Math.cos(needleAngle);
  const needleY = cy + (r - 15) * Math.sin(needleAngle);

  return (
    <div className="flex flex-col items-center">
      <svg width="240" height="140" viewBox="0 0 240 140">
        {/* Arc zones */}
        {zones.map((z, i) => {
          const startPct = prevEnd === 0 ? 0 : (prevEnd - minBf) / (maxBf - minBf);
          const endPct = (z.end - minBf) / (maxBf - minBf);
          prevEnd = z.end;
          return (
            <path
              key={i}
              d={arcPath(startPct, endPct)}
              fill="none"
              stroke={z.color}
              strokeWidth={10}
              strokeLinecap="round"
              opacity={0.25}
            />
          );
        })}

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke={zone.color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={4} fill={zone.color} />

        {/* Labels */}
        <text x={cx - r - 5} y={cy + 16} fill="#78716c" fontSize="9" textAnchor="end">{minBf}%</text>
        <text x={cx + r + 5} y={cy + 16} fill="#78716c" fontSize="9" textAnchor="start">{maxBf}%</text>
      </svg>

      {/* Value display */}
      <div className="flex flex-col items-center -mt-8">
        <span className="text-2xl font-bold text-stone-100">{value.toFixed(1)}%</span>
        <span
          className="text-xs font-medium px-2.5 py-0.5 rounded-full mt-1"
          style={{ color: zone.color, backgroundColor: zone.bgColor }}
        >
          {zone.label}
        </span>
      </div>
    </div>
  );
}

export default function BodyCompCalculator({ sex: initialSex }: { sex?: CalcSex }) {
  const [sex, setSex] = useState<CalcSex>(initialSex || 'male');
  const [waist, setWaist] = useState('');
  const [neck, setNeck] = useState('');
  const [hip, setHip] = useState('');
  const [height, setHeight] = useState('');
  const [result, setResult] = useState<number | null>(null);

  function calculate() {
    const w = parseFloat(waist);
    const n = parseFloat(neck);
    const h = parseFloat(height);
    const hp = parseFloat(hip);

    if (!w || !n || !h || w <= n) return;
    if (sex === 'female' && (!hp || w + hp <= n)) return;

    let bf: number;
    if (sex === 'male') {
      bf = 86.010 * Math.log10(w - n) - 70.041 * Math.log10(h) + 36.76;
    } else {
      bf = 163.205 * Math.log10(w + hp - n) - 97.684 * Math.log10(h) - 78.387;
    }

    // Clamp to reasonable range
    bf = Math.max(3, Math.min(55, bf));
    setResult(bf);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="glass p-5 mb-4"
      style={{ borderColor: 'rgba(212, 168, 83, 0.15)', borderWidth: 1 }}
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
        <Calculator size={14} className="text-[#D4A853]" />
        Body Fat Estimate (Navy Method)
      </h3>

      {/* Sex toggle */}
      <div className="flex gap-2 mb-4">
        {(['male', 'female'] as CalcSex[]).map((s) => (
          <button
            key={s}
            onClick={() => { setSex(s); setResult(null); }}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
              sex === s
                ? 'border-[#D4A853]/40 text-[#D4A853] bg-white/5'
                : 'border-white/5 text-stone-400'
            }`}
          >
            {s === 'male' ? 'Male' : 'Female'}
          </button>
        ))}
      </div>

      {/* Input fields */}
      <div className={`grid ${sex === 'female' ? 'grid-cols-2' : 'grid-cols-3'} gap-2 mb-3`}>
        <div>
          <label className="text-stone-500 text-[10px] uppercase tracking-wider">Waist (cm)</label>
          <input
            type="number"
            step="0.5"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
            className="input-dark text-sm mt-1"
            placeholder="85"
          />
        </div>
        <div>
          <label className="text-stone-500 text-[10px] uppercase tracking-wider">Neck (cm)</label>
          <input
            type="number"
            step="0.5"
            value={neck}
            onChange={(e) => setNeck(e.target.value)}
            className="input-dark text-sm mt-1"
            placeholder="38"
          />
        </div>
        {sex === 'female' && (
          <div>
            <label className="text-stone-500 text-[10px] uppercase tracking-wider">Hip (cm)</label>
            <input
              type="number"
              step="0.5"
              value={hip}
              onChange={(e) => setHip(e.target.value)}
              className="input-dark text-sm mt-1"
              placeholder="95"
            />
          </div>
        )}
        <div>
          <label className="text-stone-500 text-[10px] uppercase tracking-wider">Height (cm)</label>
          <input
            type="number"
            step="0.5"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="input-dark text-sm mt-1"
            placeholder="175"
          />
        </div>
      </div>

      <button
        onClick={calculate}
        disabled={!waist || !neck || !height || (sex === 'female' && !hip)}
        className="btn-gold w-full text-sm py-2.5 mb-4 disabled:opacity-40"
      >
        Calculate
      </button>

      {/* Result */}
      {result !== null && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <GaugeArc value={result} sex={sex} />
          <p className="text-stone-600 text-[10px] text-center mt-3">
            This is an estimate. For accurate measurement, consult your coach.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
