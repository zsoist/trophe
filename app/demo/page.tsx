'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Brain, Target, Dumbbell, Utensils, BarChart3, Zap, Users, Camera,
  Flame, Sparkles, Heart, Shield, TrendingUp, Eye, Mic, Search, Star,
  Lock, Calendar, Trophy, Lightbulb, Layers, Globe, ChevronDown, ChevronUp,
  CheckCircle2, Clock, Smartphone, Wifi,
} from 'lucide-react';
import Link from 'next/link';

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-30px' },
  transition: { duration: 0.5, delay },
});

// Animated counter
function Counter({ value, suffix = '', delay = 0 }: { value: number; suffix?: string; delay?: number }) {
  const [display, setDisplay] = useState(0);
  return (
    <motion.span
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      onViewportEnter={() => {
        let start = 0;
        const step = Math.ceil(value / 40);
        const timer = setInterval(() => {
          start += step;
          if (start >= value) { start = value; clearInterval(timer); }
          setDisplay(start);
        }, 30);
      }}
      className="tabular-nums"
    >
      {display.toLocaleString()}{suffix}
    </motion.span>
  );
}

// Feature chip
function Chip({ icon: Icon, label, color = '#D4A853' }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: `${color}15`, color, border: `1px solid ${color}25` }}>
      <Icon size={12} />
      {label}
    </div>
  );
}

// Progress bar
function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-stone-400">{label}</span>
        <span style={{ color }} className="font-bold">{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${(value / max) * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// Expandable section
function Section({ icon: Icon, title, subtitle, children, defaultOpen = false }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.div {...fade(0.1)} className="mb-4">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 glass rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,168,83,0.15)' }}>
            <Icon size={20} className="gold-text" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-stone-100">{title}</h3>
            <p className="text-[10px] text-stone-500 uppercase tracking-wider">{subtitle}</p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-stone-500" /> : <ChevronDown size={16} className="text-stone-500" />}
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-1 glass rounded-xl p-5 space-y-4 overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </motion.div>
  );
}

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-24">

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <button className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <ArrowLeft size={18} className="text-stone-400" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-stone-100 font-serif">τροφή</h1>
            <p className="text-[10px] text-[#D4A853] tracking-widest uppercase">Precision Nutrition Coaching</p>
          </div>
        </div>

        {/* ═══ HERO — THE STORY ═══ */}
        <motion.div {...fade(0)} className="glass-elevated p-5 mb-6 border border-[#D4A853]/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4A853] rounded-full opacity-[0.05] blur-[60px]" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="gold-text" />
              <span className="text-[10px] text-[#D4A853] uppercase tracking-wider font-bold">Demo — April 2026</span>
            </div>
            <h2 className="text-xl font-bold text-stone-100 mb-2 leading-tight">
              What is Trophē
            </h2>
            <p className="text-xs text-stone-400 leading-relaxed">
              A coaching platform that puts the Precision Nutrition habit methodology into software.
              Clients log food via text, photo, or voice in any language. The coach sees behavioral signals,
              assigns habits one at a time, and monitors compliance — all from one dashboard.
              It also includes workout tracking with AI-powered camera form analysis.
            </p>
          </div>
        </motion.div>

        {/* ═══ LIVE METRICS ═══ */}
        <motion.div {...fade(0.1)} className="grid grid-cols-4 gap-2 mb-6">
          {[
            { n: 85, suffix: '+', label: 'Features', icon: Zap },
            { n: 3, suffix: '', label: 'Languages', icon: Globe },
            { label: 'AI Camera', icon: Camera, text: true },
            { label: 'NLP Food', icon: Mic, text: true },
          ].map((stat) => (
            <div key={stat.label} className="glass p-3 text-center">
              <stat.icon size={14} className="gold-text mx-auto mb-1" />
              {'text' in stat ? (
                <p className="text-[10px] font-bold gold-text mt-1">{stat.label}</p>
              ) : (
                <>
                  <p className="text-lg font-bold gold-text"><Counter value={(stat as any).n} suffix={(stat as any).suffix} /></p>
                  <p className="text-[8px] text-stone-500 uppercase">{stat.label}</p>
                </>
              )}
            </div>
          ))}
        </motion.div>

        {/* ═══ CREDENTIALS ═══ */}
        <motion.div {...fade(0.15)} className="glass p-4 mb-6">
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[#D4A853]/20 flex items-center justify-center">
                  <Users size={12} className="gold-text" />
                </div>
                <div>
                  <p className="text-[9px] text-stone-500">Coach</p>
                  <p className="text-xs text-stone-200 font-medium">michael@kavdas.com</p>
                </div>
              </div>
              <code className="text-[10px] text-stone-500 bg-white/[0.04] px-2 py-0.5 rounded">trophe2026!</code>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Heart size={12} className="text-green-400" />
                </div>
                <div>
                  <p className="text-[9px] text-stone-500">Client (Nikos)</p>
                  <p className="text-xs text-stone-200 font-medium">nikos@biorita.com</p>
                </div>
              </div>
              <code className="text-[10px] text-stone-500 bg-white/[0.04] px-2 py-0.5 rounded">trophe2026!</code>
            </div>
          </div>
          <Link href="/login" className="btn-gold block w-full py-3 text-sm text-center font-bold no-underline">
            Enter as Coach →
          </Link>
        </motion.div>

        {/* ═══ NARRATIVE: THE PROBLEM ═══ */}
        <motion.div {...fade(0.1)} className="mb-6">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-2 px-1">The Problem</p>
          <div className="glass p-4 space-y-2">
            {[
              'Habit tracking lives in spreadsheets that clients forget to update',
              'Food logging requires MyFitnessPal — no coaching integration',
              'Form feedback happens via WhatsApp videos — no data, no tracking',
              'You manage 3+ tools and still miss when a client is struggling',
            ].map((problem, i) => (
              <motion.div key={i} {...fade(i * 0.05)} className="flex items-start gap-2">
                <span className="text-red-400 text-xs mt-0.5">✗</span>
                <p className="text-xs text-stone-400">{problem}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ═══ NARRATIVE: THE SOLUTION ═══ */}
        <motion.div {...fade(0.1)} className="mb-6">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-2 px-1">The Solution</p>
          <div className="glass-elevated p-4 border border-[#D4A853]/10 space-y-2">
            {[
              'One habit at a time, 14-day cycles — the PN methodology automated',
              'AI food tracking: type, speak, or photograph — in Greek, Spanish, or English',
              'Camera-based form analysis with real-time scoring — in the browser',
              'Coach dashboard with behavioral signals: 🟢 🟡 🔴 — see who needs you',
            ].map((solution, i) => (
              <motion.div key={i} {...fade(i * 0.05)} className="flex items-start gap-2">
                <CheckCircle2 size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-stone-300">{solution}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ═══ FEATURE GRID ═══ */}
        <motion.div {...fade(0.1)} className="mb-6">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-3 px-1">85+ Features Including</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip icon={Utensils} label="NLP Food Parse" />
            <Chip icon={Camera} label="Photo Analysis" />
            <Chip icon={Mic} label="Voice Input" />
            <Chip icon={Search} label="350K+ Foods" />
            <Chip icon={Star} label="Meal Scoring A/B/C/D" />
            <Chip icon={Flame} label="Streak Counter" />
            <Chip icon={Trophy} label="6 Badges" />
            <Chip icon={Calendar} label="Calendar View" />
            <Chip icon={BarChart3} label="30-Day Trends" />
            <Chip icon={TrendingUp} label="Weekly Adherence" />
            <Chip icon={Clock} label="Fasting Timer" />
            <Chip icon={Eye} label="AI Form Check" color="#22c55e" />
            <Chip icon={Dumbbell} label="PR Detection" color="#22c55e" />
            <Chip icon={Users} label="Coach Dashboard" color="#3b82f6" />
            <Chip icon={Lock} label="41 RLS Policies" color="#3b82f6" />
            <Chip icon={Globe} label="EN/ES/EL" color="#a855f7" />
            <Chip icon={Lightbulb} label="Daily Insights" />
            <Chip icon={Heart} label="Pain Flags" color="#ef4444" />
            <Chip icon={Shield} label="Evidence Protocols" />
            <Chip icon={Wifi} label="Works Offline" color="#22c55e" />
          </div>
        </motion.div>

        {/* ═══ CAPABILITY DEEP DIVES ═══ */}
        <p className="text-xs text-stone-500 uppercase tracking-wider mb-3 px-1">Deep Dive</p>

        <Section icon={Brain} title="Scientific Foundation" subtitle="Evidence-based methodology" defaultOpen>
          <DetailBlock
            title="Mifflin-St Jeor (BMR)"
            body="BMR = (10 × weight_kg) + (6.25 × height_cm) - (5 × age) + s. Lowest error margin (±10%) among validated equations."
          />
          <DetailBlock
            title="ISSN Protein Targets"
            body="1.6-2.2 g/kg for fat loss. 20-40g per meal, spaced 3-5h for optimal MPS. Carbs as remainder after P+F."
          />
          <ProgressBar label="Protein accuracy vs ISSN guidelines" value={95} max={100} color="#f87171" />
          <ProgressBar label="BMR accuracy vs calorimetry" value={90} max={100} color="#D4A853" />
        </Section>

        <Section icon={Utensils} title="Nutrition Tracking" subtitle="5 input methods, 85+ features">
          <div className="grid grid-cols-5 gap-1 mb-3">
            {[
              { icon: '⌨️', label: 'Text' },
              { icon: '📸', label: 'Photo' },
              { icon: '🎤', label: 'Voice' },
              { icon: '📋', label: 'Paste' },
              { icon: '✏️', label: 'Manual' },
            ].map(m => (
              <div key={m.label} className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="text-lg block">{m.icon}</span>
                <span className="text-[8px] text-stone-500">{m.label}</span>
              </div>
            ))}
          </div>
          <DetailBlock title="AI Food Parser" body="Claude Haiku parses free text in EN/ES/EL. '3 αυγά, τοστ, ελληνικός καφές' → structured items with macros. ~$0.003/call." />
          <DetailBlock title="Meal Quality Score" body="Each meal: A/B/C/D. 40% macro balance + 30% protein adequacy + 30% variety. Score badge on every meal card." />
          <DetailBlock title="Analytics Suite" body="30-day trends, calorie heatmap, radar chart, gauge, protein distribution, food frequency, day patterns, monthly report." />
        </Section>

        <Section icon={Camera} title="AI Form Check" subtitle="Browser-based biomechanics">
          <div className="flex items-center gap-3 p-3 rounded-lg mb-3" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <Wifi size={16} className="text-green-400" />
            <div>
              <p className="text-xs text-green-300 font-medium">100% Client-Side</p>
              <p className="text-[10px] text-stone-500">Video never leaves device. Zero API cost. Works offline.</p>
            </div>
          </div>
          <DetailBlock title="33 Body Landmarks" body="MediaPipe Pose via WebAssembly. 30+ FPS desktop, 25 FPS mobile. Knee angle, torso inclination, neck inclination." />
          <DetailBlock title="5-Tier Assessment" body={`0-3%: "buen ejercicio" (green)\n4-8%: "aun se puede mejorar" (gold)\n9-16%: "es necesario ajustar" (amber)\n17-25%: "realizar ajustes profundos" (orange)\n>25%: "riesgo de lesion" (red)`} />
          <DetailBlock title="Reference Dataset" body="202 data points from 5 reference reps. Normalized 0-100% per phase. Comparison by segment_type." />
        </Section>

        <Section icon={Flame} title="Habit Engine" subtitle="PN methodology in software">
          <DetailBlock title="14-Day Cycles" body="One habit → daily check-in (one tap) → 14 days → mastered → next habit. Replicates your PN L1 protocol." />
          <DetailBlock title="10 PN Habits" body="Eat slowly, 80% full, protein every meal, vegetables, smart carbs, healthy fats, hydration, sleep, meal prep, mindful eating." />
          <div className="flex flex-wrap gap-1">
            {['🐢 Eat Slowly', '🥩 Protein', '🥦 Vegetables', '💧 Hydration', '😴 Sleep', '🧘 Mindful'].map(h => (
              <span key={h} className="text-[10px] px-2 py-1 rounded-full bg-white/[0.05] text-stone-400">{h}</span>
            ))}
          </div>
        </Section>

        <Section icon={Dumbbell} title="Workout Module" subtitle="Logging + PRs + Templates">
          <DetailBlock title="30 Exercises" body="Trilingual (EN/ES/EL). 13 muscle groups. Sets with weight/reps/RPE. Auto PR detection. Pain flag system." />
          <DetailBlock title="Coach Templates" body="Create routines, assign to clients. Target sets/reps/RPE. Difficulty levels. Clients log against the template." />
        </Section>

        <Section icon={Users} title="Coach Dashboard" subtitle="Behavioral intelligence">
          <DetailBlock title="Client Overview" body="Real-time signals: 🟢 on track, 🟡 at risk, 🔴 inactive. Deep-dive per client. Multi-client comparison." />
          <DetailBlock title="Evidence-Based Supplements" body="Protocols with evidence level (A/B/C/D). Compliance grid. Coach creates stacks, assigns, monitors adherence." />
        </Section>

        <Section icon={Zap} title="Technical Architecture" subtitle="Zero-server, fully serverless">
          <div className="space-y-2">
            <ProgressBar label="TypeScript strict compliance" value={100} max={100} color="#22c55e" />
            <ProgressBar label="RLS policy coverage" value={41} max={41} color="#3b82f6" />
            <ProgressBar label="Trilingual coverage" value={200} max={200} color="#a855f7" />
          </div>
          <DetailBlock title="Stack" body="Next.js 16 + React 19 + Supabase + Tailwind 4. Vercel serverless. Claude Haiku + Gemini Flash + MediaPipe WASM." />
          <DetailBlock title="AI Cost" body="~$1.80/month for 20 calls/day. Photo analysis ~$0.005/call. Text parsing ~$0.003/call. Form check: $0 (browser)." />
        </Section>

        {/* ═══ COMPETITIVE EDGE ═══ */}
        <motion.div {...fade(0.1)} className="mb-6">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-3 px-1">What Trophē Bundles</p>
          <div className="glass p-4">
            <p className="text-[11px] text-stone-400 mb-3">Capabilities that typically require separate tools:</p>
            <div className="space-y-2">
              {[
                { feature: 'Habit coaching (14-day cycles, compliance tracking)', alt: 'Spreadsheets / manual follow-up' },
                { feature: 'Food tracking with AI (text, photo, voice — trilingual)', alt: 'MyFitnessPal / Cronometer' },
                { feature: 'Exercise form analysis with camera', alt: 'WhatsApp video review' },
                { feature: 'Workout logging with PR detection', alt: 'Training spreadsheets / Trainerize' },
                { feature: 'Coach dashboard with behavioral signals', alt: 'Manual client check-ins' },
                { feature: 'Supplement protocols with evidence levels', alt: 'PDF protocols / email' },
              ].map((row, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
                  <CheckCircle2 size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[11px] text-stone-200">{row.feature}</p>
                    <p className="text-[9px] text-stone-600">Replaces: {row.alt}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ═══ BUSINESS MODEL ═══ */}
        <motion.div {...fade(0.1)} className="glass p-4 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Target size={14} className="gold-text" />
            <span className="text-xs text-stone-300 font-bold">Business Model</span>
          </div>
          <p className="text-xs text-stone-400 leading-relaxed">
            SaaS per coach. Each coach pays monthly to manage N clients. Clients use the app free.
            AI cost is under $2/month per coach. White-label ready.
          </p>
        </motion.div>

        {/* ═══ CTA ═══ */}
        <motion.div {...fade(0.1)} className="text-center">
          <Link href="/login">
            <button className="btn-gold px-10 py-4 text-base font-bold">
              Enter Trophē →
            </button>
          </Link>
          <p className="text-[10px] text-stone-600 mt-3 font-mono">
            michael@kavdas.com / trophe2026!
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function DetailBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-stone-200 mb-0.5">{title}</h4>
      <p className="text-[11px] text-stone-400 leading-relaxed whitespace-pre-line">{body}</p>
    </div>
  );
}
