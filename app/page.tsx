'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

type Lang = 'en' | 'es' | 'el';

const LANGS: { code: Lang; flag: string; label: string }[] = [
  { code: 'en', flag: '🇬🇧', label: 'EN' },
  { code: 'es', flag: '🇪🇸', label: 'ES' },
  { code: 'el', flag: '🇬🇷', label: 'EL' },
];

const heroText: Record<Lang, { sub: string; tagline: string; desc: string; cta1: string; cta2: string }> = {
  en: {
    sub: 'Precision Nutrition Coaching',
    tagline: 'One habit. Two weeks. Transform.',
    desc: 'The coaching platform that enforces behavior change through progressive habit scaffolding. Built for Precision Nutrition certified coaches and their clients.',
    cta1: 'Get Started',
    cta2: "I'm a Coach",
  },
  es: {
    sub: 'Coaching de Nutrición de Precisión',
    tagline: 'Un hábito. Dos semanas. Transforma.',
    desc: 'La plataforma de coaching que impulsa el cambio de comportamiento a través de hábitos progresivos. Diseñada para coaches certificados en Precision Nutrition.',
    cta1: 'Comenzar',
    cta2: 'Soy Coach',
  },
  el: {
    sub: 'Coaching Διατροφής Ακριβείας',
    tagline: 'Μία συνήθεια. Δύο εβδομάδες. Μεταμόρφωση.',
    desc: 'Η πλατφόρμα coaching που επιβάλλει αλλαγή συμπεριφοράς μέσω προοδευτικής ανάπτυξης συνηθειών. Για πιστοποιημένους coaches Precision Nutrition.',
    cta1: 'Ξεκινήστε',
    cta2: 'Είμαι Coach',
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] as const },
  }),
};

const clientSteps = [
  { emoji: '📱', title: 'Sign up in seconds', desc: 'Create your account, enter your body stats, and get personalized macro targets calculated instantly using Mifflin-St Jeor + ISSN science.' },
  { emoji: '🎯', title: 'One habit at a time', desc: 'Your coach assigns ONE habit every 14 days. No overwhelm — just "Drink 3L water" or "Eat protein every meal." Check in daily with one tap.' },
  { emoji: '🔥', title: 'Build your streak', desc: 'Each day you complete your habit, your streak grows. After 14 days, the habit is locked in and your coach unlocks the next challenge.' },
  { emoji: '🍽️', title: 'Track meals (optional)', desc: 'Search 350,000+ foods via USDA, log meals with one tap, and see your macros fill up in real-time rings. Or snap a photo — AI estimates the macros.' },
  { emoji: '💧', title: 'Water & supplements', desc: 'Track hydration with a visual progress bar. Follow your coach\'s evidence-based supplement protocol with daily checklists.' },
  { emoji: '📊', title: 'See your progress', desc: 'Weight trends, completed habits, macro averages — all in one place. Your coach sees the same data and gives feedback.' },
];

const coachSteps = [
  { emoji: '📋', title: 'Client dashboard', desc: 'See all your clients at a glance. Green = on track, yellow = at risk, red = inactive. Smart alerts tell you who needs attention.' },
  { emoji: '🎯', title: 'Assign habits progressively', desc: 'Choose from 10 built-in templates or create custom habits. Assign one at a time, 14-day cycles. The app enforces the Precision Nutrition methodology.' },
  { emoji: '🔍', title: 'Deep-dive any client', desc: 'See their 14-day streak calendar, food log, weight chart, supplement compliance, mood trends — everything to coach effectively.' },
  { emoji: '💊', title: 'Build supplement protocols', desc: 'Create evidence-based supplement stacks with dosages, timing, and research level (A/B/C/D). Assign to clients with one click.' },
  { emoji: '📝', title: 'Session notes & progression', desc: 'Add timestamped coaching notes. When a client masters a habit, advance them to the next one. Track the full coaching lifecycle.' },
  { emoji: '🌍', title: 'Scale internationally', desc: 'Trilingual interface (English, Spanish, Greek). Custom food database shared with all clients. Coach 3x more clients with the same effort.' },
];

const features = [
  { emoji: '🧮', title: 'Evidence-Based Engine', desc: 'BMR, TDEE, macros calculated from Mifflin-St Jeor. Protein targets from ISSN. Hydration from body weight. Every number has a citation.' },
  { emoji: '🤖', title: 'AI-Powered', desc: 'Ask "What should I eat?" and get meal suggestions fitting your remaining macros. Snap a food photo for instant macro estimation.' },
  { emoji: '🔒', title: 'Private & Secure', desc: 'Row-level security on every table. Clients only see their own data. Coaches only see assigned clients. Supabase Postgres with encrypted auth.' },
  { emoji: '📱', title: 'Mobile-First', desc: 'Designed for phones. Dark premium theme, glass morphism, smooth animations. Works as a PWA — add to home screen for app-like experience.' },
];

export default function LandingPage() {
  const [activeRole, setActiveRole] = useState<'client' | 'coach'>('client');
  const [lang, setLang] = useState<Lang>('en');
  const t = heroText[lang];

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Language Switcher */}
      <div className="fixed top-0 left-0 right-0 z-[60] flex flex-col items-center">
        <div className="flex justify-center py-2">
          <div className="flex gap-1 bg-stone-900/80 backdrop-blur-lg rounded-full p-1 border border-stone-800/50 mt-2">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                  lang === l.code
                    ? 'bg-[#D4A853] text-stone-950'
                    : 'text-stone-500 hover:text-stone-300'
                }`}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="relative min-h-[85vh] flex items-center justify-center px-6 overflow-hidden pt-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#D4A853] rounded-full opacity-[0.03] blur-[120px]" />
        </div>

        <div className="relative max-w-2xl text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={lang}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
            >
              <p className="text-[#D4A853] text-sm font-medium tracking-[0.2em] uppercase mb-6">
                {t.sub}
              </p>

              <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
                <span className="text-[#D4A853]">τροφή</span>
              </h1>

              <p className="text-xl sm:text-2xl text-stone-300 mb-4 font-light">
                {t.tagline}
              </p>

              <p className="text-stone-500 mb-10 max-w-lg mx-auto leading-relaxed">
                {t.desc}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/login" className="btn-gold text-center text-lg px-8 py-3.5 no-underline">
                  {t.cta1}
                </Link>
                <Link href="/login" className="btn-ghost text-center text-lg px-8 py-3.5 no-underline">
                  {t.cta2}
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* How It Works — Role Switcher */}
      <section className="px-6 py-20 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
          viewport={{ once: true }} transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-100 mb-4">
            How It Works
          </h2>
          <p className="text-stone-500 mb-8">
            Two experiences, one platform. Choose your role to see the journey.
          </p>

          {/* Role Toggle */}
          <div className="inline-flex gap-1 bg-stone-900 rounded-2xl p-1.5">
            <button
              onClick={() => setActiveRole('client')}
              className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeRole === 'client'
                  ? 'bg-[#D4A853] text-stone-950 shadow-lg'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              🏃 I&apos;m a Client
            </button>
            <button
              onClick={() => setActiveRole('coach')}
              className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeRole === 'coach'
                  ? 'bg-[#D4A853] text-stone-950 shadow-lg'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              📋 I&apos;m a Coach
            </button>
          </div>
        </motion.div>

        {/* Steps */}
        <div className="space-y-4">
          {(activeRole === 'client' ? clientSteps : coachSteps).map((step, i) => (
            <motion.div
              key={`${activeRole}-${step.title}`}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-30px" }}
              variants={fadeUp}
              className="glass p-5 sm:p-6 flex gap-4 items-start hover:border-[rgba(212,168,83,0.15)] transition-all duration-300"
            >
              <div className="text-3xl flex-shrink-0 mt-0.5">{step.emoji}</div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[#D4A853] text-xs font-bold tracking-wider">STEP {i + 1}</span>
                  <h3 className="text-lg font-semibold text-stone-100">{step.title}</h3>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Platform Features */}
      <section className="px-6 py-20 max-w-5xl mx-auto">
        <motion.h2
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-3xl sm:text-4xl font-serif font-bold text-stone-100 text-center mb-4"
        >
          Built Different
        </motion.h2>
        <p className="text-stone-500 text-center mb-12 max-w-lg mx-auto">
          Not another calorie tracker. A complete coaching infrastructure.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-30px" }}
              variants={fadeUp}
              className="glass p-6 hover:border-[rgba(212,168,83,0.15)] transition-all duration-300"
            >
              <span className="text-2xl mb-3 block">{f.emoji}</span>
              <h3 className="text-base font-semibold text-stone-100 mb-2">{f.title}</h3>
              <p className="text-stone-400 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* The Science */}
      <section className="px-6 py-16 border-t border-stone-800">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-serif font-bold text-stone-100 mb-6">
            The Science Behind τροφή
          </h2>
          <div className="glass p-6 text-left space-y-3 text-sm text-stone-400 leading-relaxed">
            <p>
              <span className="text-[#D4A853] font-semibold">Habit engine:</span> Based on Precision Nutrition&apos;s validated framework — one habit every 14 days, progressive scaffolding, behavioral readiness assessment. Tested with 100,000+ clients.
            </p>
            <p>
              <span className="text-[#D4A853] font-semibold">Nutrition calculations:</span> BMR via Mifflin-St Jeor (most accurate for general population). TDEE multipliers from ACSM. Protein targets from ISSN position stands (1.6-2.2 g/kg/day). Hydration at 35ml/kg.
            </p>
            <p>
              <span className="text-[#D4A853] font-semibold">Supplement evidence:</span> Every supplement in our protocol builder is rated A (strong evidence) through D (weak). Based on IOC consensus, ISSN position stands, and systematic reviews.
            </p>
            <p>
              <span className="text-[#D4A853] font-semibold">Food data:</span> USDA FoodData Central — 350,000+ foods with verified nutritional data from the US Department of Agriculture.
            </p>
          </div>
        </div>
      </section>

      {/* Evidence Bar */}
      <section className="border-t border-stone-800 py-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-stone-600 text-xs tracking-wide uppercase mb-6">Built on evidence from</p>
          <div className="flex flex-wrap justify-center gap-6 text-stone-500 text-sm">
            {['ISSN Position Stands', 'ACSM Guidelines', 'IOC Consensus', 'Precision Nutrition', 'Mifflin-St Jeor', 'USDA FoodData Central'].map((s, i) => (
              <span key={i}>{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <div className="max-w-lg mx-auto">
          <h2 className="text-3xl font-serif font-bold text-stone-100 mb-4">
            Ready to transform your coaching?
          </h2>
          <p className="text-stone-500 mb-8">
            Join as a coach or client. Start your first habit cycle today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login" className="btn-gold text-center text-lg px-10 py-4 no-underline">
              Start Free
            </Link>
          </div>
          <p className="text-stone-600 text-xs mt-6">
            🇬🇧 English · 🇪🇸 Español · 🇬🇷 Ελληνικά
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-800 py-8 px-6 text-center text-stone-600 text-xs">
        <p>τροφή (Trophē) — &quot;nourishment&quot; in Greek</p>
        <p className="mt-1">2026 Trophē. Evidence-based nutrition coaching.</p>
      </footer>
    </div>
  );
}
