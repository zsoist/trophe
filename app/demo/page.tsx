'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Brain, Target, Dumbbell, Utensils, BarChart3, Zap, Users, Camera, Flame, Sparkles } from 'lucide-react';
import Link from 'next/link';

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-stone-950">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-2xl mx-auto px-4 pt-8 pb-24"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/">
            <button className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <ArrowLeft size={20} className="text-stone-400" />
            </button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-stone-100 font-serif">τροφή</h1>
            <p className="text-xs text-[#D4A853] tracking-widest uppercase">Precision Nutrition Coaching Platform</p>
          </div>
        </div>

        {/* Hero */}
        <motion.div {...fadeUp} transition={{ delay: 0.1 }} className="glass-elevated p-6 mb-6 border border-[#D4A853]/20">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={18} className="gold-text" />
            <span className="text-xs text-[#D4A853] uppercase tracking-wider font-semibold">For Michael Kavdas — Exclusive Demo</span>
          </div>
          <h2 className="text-2xl font-bold text-stone-100 mb-3">
            The platform that replaces 3+ coaching tools
          </h2>
          <p className="text-stone-400 text-sm leading-relaxed">
            Trophē implements the Precision Nutrition methodology in software: progressive 14-day habits,
            AI-powered nutritional tracking, camera-based form analysis, and a coach dashboard with behavioral
            intelligence. All in one app, trilingual, with zero friction for the client.
          </p>
        </motion.div>

        {/* Credentials */}
        <motion.div {...fadeUp} transition={{ delay: 0.15 }} className="glass p-4 mb-6">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Demo Credentials</p>
          <div className="space-y-2">
            <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div>
                <p className="text-[10px] text-stone-500 mb-0.5">Coach Account</p>
                <p className="text-sm text-stone-200 font-medium">michael@kavdas.com</p>
              </div>
              <p className="text-xs text-stone-500 font-mono">trophe2026!</p>
            </div>
            <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div>
                <p className="text-[10px] text-stone-500 mb-0.5">Client Account (Nikos)</p>
                <p className="text-sm text-stone-200 font-medium">nikos@biorita.com</p>
              </div>
              <p className="text-xs text-stone-500 font-mono">trophe2026!</p>
            </div>
          </div>
          <div className="mt-3">
            <Link href="/login" className="btn-gold block w-full py-2.5 text-sm text-center font-semibold no-underline">
              Enter as Coach
            </Link>
          </div>
        </motion.div>

        {/* ═══ METHODOLOGY ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.2 }}>
          <SectionHeader icon={Brain} title="Scientific Foundation" subtitle="Evidence-based methodology" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="Precision Nutrition (PN) Methodology"
              body="Trophē implements PN's progressive habit system: one habit at a time, 14-day cycles, with daily check-ins. Based on behavior change research showing that adherence to a single habit is 3x higher than attempting multiple changes simultaneously. The coach assigns habits from a curated library — the client checks in with one tap."
            />
            <DetailBlock
              title="Mifflin-St Jeor Equation (BMR)"
              body="BMR = (10 × weight_kg) + (6.25 × height_cm) - (5 × age) + s, where s = +5 (males) or -161 (females). This equation has the lowest margin of error (±10%) among validated predictive equations (Frankenfield et al., 2005). TDEE is calculated by multiplying BMR by the activity factor (1.2 - 1.9)."
            />
            <DetailBlock
              title="Macronutrient Distribution (ISSN Position Stand)"
              body={`Protein: 1.6-2.2 g/kg for fat loss, 1.4-1.8 g/kg for muscle gain (Jäger et al., 2017). Optimal distribution: 20-40g per meal, spaced 3-5h apart to maximize muscle protein synthesis (MPS). Carbohydrates: calculated as the caloric remainder after protein and fat. Fat: minimum 0.5 g/kg for hormonal function.`}
            />
            <DetailBlock
              title="Form Check Assessment Thresholds"
              body={`The Form Check system uses angular comparison against a reference dataset:
• 0-3% deviation: "buen ejercicio" — technique within optimal range
• 4-8%: "aun se puede mejorar" — minor adjustments recommended
• 9-16%: "es necesario ajustar" — moderate biomechanical risk
• 17-25%: "realizar ajustes profundos" — technical intervention needed
• >25%: "riesgo de lesion" — stop and correct before continuing
Based on MediaPipe Pose analysis (33 landmarks, 30+ FPS in browser).`}
            />
          </div>
        </motion.div>

        {/* ═══ NUTRITION TRACKING ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.25 }}>
          <SectionHeader icon={Utensils} title="Nutritional Tracking" subtitle="85+ tracking features" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="Multimodal Data Input"
              body="5 logging methods: (1) Free text with NLP — Claude Haiku parses '3 eggs, toast, coffee with milk' into structured items with macros. (2) Photo — Haiku Vision image analysis identifies foods and estimates macros. (3) Clipboard paste. (4) Voice — Web Speech API transcribes and auto-parses. (5) Manual quick-add. Database: 126 local foods + USDA FoodData Central (350K+)."
            />
            <DetailBlock
              title="Meal Scoring System"
              body="Each meal receives an A/B/C/D grade based on: 40% macro balance (protein 20-35%, carbs 35-55%, fat 20-35%), 30% protein adequacy (vs 25g/meal MPS target), 30% food variety (>4 distinct items = 100%). The score is displayed as a badge on each meal slot."
            />
            <DetailBlock
              title="Real-Time Metrics"
              body="Daily targets with color coding (green/gold/red), animated progress rings (SVG), floating remaining calorie counter, consecutive day streaks, achievement badges (6 unlockable milestones), fiber tracking (target 25-38g/day), context-aware health tips rotating hourly with 21 evidence-based nutrition insights."
            />
            <DetailBlock
              title="Advanced Analytics"
              body="30-day trend chart (multi-line), GitHub-style calorie heatmap (8 weeks), 5-axis radar chart (P/C/F/Fiber/Water), speedometer calorie gauge, protein distribution per meal, food frequency ranking, day-of-week patterns, weekly adherence score (0-100%), monthly report card with overall grade."
            />
            <DetailBlock
              title="Eating Window Tracking"
              body="Automatic tracking of first and last meal of the day. Displays eating and fasting window with visual bar. Compatible with intermittent fasting protocols (16:8, 14:10). The coach can view each client's timing patterns."
            />
          </div>
        </motion.div>

        {/* ═══ FORM CHECK ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.3 }}>
          <SectionHeader icon={Camera} title="AI Form Check" subtitle="Browser-based biomechanical analysis" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="MediaPipe Pose in the Browser"
              body="Runs 100% client-side via WebAssembly — video NEVER leaves the device. 33 body landmarks in 3D, 30+ FPS on desktop, 25 FPS on mobile. Lite model (5MB) loaded from Google CDN. Zero API cost, zero network latency. Complete privacy."
            />
            <DetailBlock
              title="Variables of Interest (Bulgarian Split Squat)"
              body={`• Knee angle (knee_angle_deg): hip-knee-ankle, measured in sagittal plane
• Torso inclination (torso_inclination_abs_deg): shoulder-hip relative to vertical
• Neck inclination (neck_inclination_abs_deg): ear-shoulder relative to vertical
Smoothed with EMA (α=0.2 for angles, α=0.25 for points).
Rep detection via direction changes in knee angle time series.`}
            />
            <DetailBlock
              title="Reference Dataset"
              body="202 data points (101 per phase: descent and ascent) averaged from 5 reference repetitions. Each point includes angles normalized to 0-100% of the movement. Comparison is done by segment_type (baja_a_sube vs sube_a_baja), calculating mean_abs_pct_diff per variable."
            />
            <DetailBlock
              title="Extensibility"
              body="Architecture ready for multiple exercises. Adding a new exercise requires: (1) record reference videos, (2) process with the existing Python pipeline, (3) export average CSVs, (4) convert to TypeScript constants. The frontend adapts automatically."
            />
          </div>
        </motion.div>

        {/* ═══ WORKOUT MODULE ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.35 }}>
          <SectionHeader icon={Dumbbell} title="Workout Module" subtitle="Logging + PRs + Templates" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="Exercise Tracking"
              body="30 pre-loaded exercises (trilingual EN/ES/EL), 13 muscle groups, sets with weight/reps/RPE (1-10). Auto-detection of personal records by comparing against historical max. Pain flag system per exercise (body part + severity 1-5). Real-time session timer."
            />
            <DetailBlock
              title="Volume Dashboard"
              body="Weekly volume by muscle group (sets × weight), frequency alerts (when was each muscle last trained), 8-week volume trend, personal records board, cross-session exercise comparison."
            />
            <DetailBlock
              title="Coach Routine Templates"
              body="The coach creates templates with exercises, target sets, target reps, target RPE. Assigns them to clients. The client sees their assigned routine and can log directly against it. Difficulty levels: beginner/intermediate/advanced."
            />
          </div>
        </motion.div>

        {/* ═══ HABIT ENGINE ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.4 }}>
          <SectionHeader icon={Flame} title="Habit Engine" subtitle="PN methodology in software" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="14-Day Cycles"
              body="One habit at a time. Coach assigns → client checks in daily (one tap). After 14 consecutive days, the habit is marked as 'mastered' and the next one unlocks. This replicates the Precision Nutrition Level 1 protocol that Michael already uses manually."
            />
            <DetailBlock
              title="Behavioral Intelligence"
              body="Compliance heatmap (14 days), streak with badges (7, 14, 30 days), auto-progression on cycle completion, mood tracking per check-in (5 states), radar chart across 6 habit categories, mastery celebration with confetti. The coach sees behavioral signals: 🟢 on track, 🟡 at risk, 🔴 inactive."
            />
            <DetailBlock
              title="10 Pre-loaded Habits"
              body="Based on the PN pyramid: (1) Eat slowly, (2) Eat until 80% full, (3) Protein at every meal, (4) Vegetables at every meal, (5) Smart carbs, (6) Healthy fats, (7) Hydration, (8) Sleep hygiene, (9) Meal prep, (10) Mindful eating. All trilingual (EN/ES/EL)."
            />
          </div>
        </motion.div>

        {/* ═══ COACH DASHBOARD ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.45 }}>
          <SectionHeader icon={Users} title="Coach Dashboard" subtitle="Client management" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="Client Overview"
              body="Cards with real-time behavioral signals. Filters by status (on track/at risk/inactive), name search. Deep-dive per client: active habits, food log, workouts, coach notes, supplement history. Multi-client comparison table."
            />
            <DetailBlock
              title="Coach Tools"
              body="Assign habits, supplement protocols (stacks A/B/C/D with evidence level), routine templates, session notes (check-in/progression/concern/general), one-click exportable summary, custom food database (coach adds their own foods with verified macros)."
            />
            <DetailBlock
              title="Evidence-Based Supplementation"
              body="Protocols with marked evidence level (A: strong, B: moderate, C: emerging, D: theoretical). Compliance grid per supplement. The coach creates the stack, assigns it to the client, and sees daily adherence. Configurable timing (morning/afternoon/evening/with meals)."
            />
          </div>
        </motion.div>

        {/* ═══ TECH STACK ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.5 }}>
          <SectionHeader icon={Zap} title="Technical Stack" subtitle="System architecture" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="Frontend"
              body="Next.js 16 (App Router) + React 19 + TypeScript (strict mode). Tailwind CSS 4 with glass morphism. Framer Motion for animations. Lucide for iconography. 60 components, 20 pages, 25,500+ lines. Mobile-first (390x844)."
            />
            <DetailBlock
              title="Backend"
              body="Supabase: Auth + Postgres + Row Level Security (41 policies). 18 tables. USDA FoodData Central API (350K+ foods). Zero self-hosted server — fully serverless via Vercel."
            />
            <DetailBlock
              title="AI"
              body={`• Anthropic Claude Haiku 4.5: NLP food parsing + photo analysis (~$0.003/call)
• Google Gemini 2.0 Flash: meal suggestions (~$0.001/call)
• MediaPipe Pose (browser, WASM): form analysis (FREE, $0)
• Web Speech API: voice input (FREE, browser-native)
Estimated cost: ~$1.80/month for 20 calls/day.`}
            />
            <DetailBlock
              title="Internationalization"
              body="Full trilingual support: English, Español, Ελληνικά. 200+ translated strings. Auto language detection. Supports input in any language (the AI parses Greek, Spanish, and English)."
            />
          </div>
        </motion.div>

        {/* ═══ NUMBERS ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.55 }}>
          <SectionHeader icon={BarChart3} title="System Metrics" subtitle="Current state" />
          <div className="glass p-5 mb-6">
            <div className="grid grid-cols-3 gap-4">
              {[
                { n: '25,500+', label: 'Lines of code' },
                { n: '60', label: 'React components' },
                { n: '85+', label: 'Features shipped' },
                { n: '18', label: 'Supabase tables' },
                { n: '41', label: 'RLS policies' },
                { n: '126+', label: 'Foods in database' },
                { n: '30', label: 'Exercises (3 langs)' },
                { n: '10', label: 'PN habits' },
                { n: '0', label: 'TypeScript errors' },
              ].map(stat => (
                <div key={stat.label} className="text-center">
                  <p className="text-xl font-bold gold-text">{stat.n}</p>
                  <p className="text-[9px] text-stone-500 leading-tight">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ═══ VALUE PROPOSITION ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.6 }}>
          <SectionHeader icon={Target} title="Value Proposition" subtitle="For Daily Nutrafit / Athletikapp" />
          <div className="glass-elevated p-5 mb-6 border border-[#D4A853]/20 space-y-4">
            <DetailBlock
              title="What It Replaces"
              body="1. Spreadsheets for habit tracking → Automated habit engine with compliance heatmap. 2. MyFitnessPal for food logging → NLP + photo with per-meal quality scoring. 3. WhatsApp for coach-client communication → Integrated dashboard with notes and behavioral signals. 4. Training spreadsheets → Digital templates with auto-PR detection and AI form check."
            />
            <DetailBlock
              title="Competitive Advantage"
              body="No platform combines: PN habits + AI food tracking + camera form analysis + coach dashboard. Cronometer has micronutrients but no habits. MacroFactor has adaptive algorithms but no coaching. Trainerize has templates but no food AI. Trophē unifies everything."
            />
            <DetailBlock
              title="Business Model"
              body="SaaS per coach: each coach pays a monthly subscription to manage N clients. Clients use the app for free. The coach customizes habits, protocols, and templates. White-label possible in the future. AI cost is <$2/month per coach."
            />
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div {...fadeUp} transition={{ delay: 0.65 }} className="text-center">
          <Link href="/login">
            <button className="btn-gold px-8 py-4 text-base font-bold">
              Enter Trophē
            </button>
          </Link>
          <p className="text-xs text-stone-600 mt-3">
            michael@kavdas.com / trophe2026!
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <Icon size={18} className="gold-text" />
      <div>
        <h3 className="text-base font-bold text-stone-100">{title}</h3>
        <p className="text-[10px] text-stone-500 uppercase tracking-wider">{subtitle}</p>
      </div>
    </div>
  );
}

function DetailBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-stone-200 mb-1">{title}</h4>
      <p className="text-xs text-stone-400 leading-relaxed whitespace-pre-line">{body}</p>
    </div>
  );
}
