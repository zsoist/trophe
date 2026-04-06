'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] as const },
  }),
};

const features = [
  { emoji: '🎯', title: 'One Habit at a Time', desc: '14-day cycles based on Precision Nutrition science. No overwhelm, just progress.' },
  { emoji: '📊', title: 'Smart Coaching Dashboard', desc: 'Real-time behavioral intelligence. See who needs support, who is ready to progress.' },
  { emoji: '🍽️', title: 'Full Nutrition Tracking', desc: 'USDA-powered food search. Macros, hydration, supplements — all in one place.' },
  { emoji: '🤖', title: 'AI-Powered Insights', desc: 'Photo food analysis, meal suggestions based on remaining macros, coaching alerts.' },
  { emoji: '💊', title: 'Supplement Protocols', desc: 'Evidence-based protocols with compliance tracking. Each supplement rated by research level.' },
  { emoji: '🌍', title: 'Trilingual', desc: 'English, Español, Ελληνικά. Built for international coaching from day one.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-stone-950">
      {/* Hero */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-6 overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#D4A853] rounded-full opacity-[0.03] blur-[120px]" />
        </div>

        <div className="relative max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-[#D4A853] text-sm font-medium tracking-[0.2em] uppercase mb-6"
          >
            Precision Nutrition Coaching
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.34, 1.56, 0.64, 1] as const }}
            className="font-serif text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
          >
            <span className="text-[#D4A853]">τροφή</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-xl sm:text-2xl text-stone-300 mb-4 font-light"
          >
            One habit. Two weeks. Transform.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-stone-500 mb-10 max-w-md mx-auto"
          >
            The coaching platform that enforces behavior change through progressive habit scaffolding. Built for professionals, powered by science.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link href="/login" className="btn-gold text-center text-lg px-8 py-3.5 no-underline">
              Get Started
            </Link>
            <Link href="/login" className="btn-ghost text-center text-lg px-8 py-3.5 no-underline">
              I&apos;m a Coach
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-24 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeUp}
              className="glass p-6 hover:border-[rgba(212,168,83,0.2)] transition-all duration-300"
            >
              <span className="text-3xl mb-4 block">{f.emoji}</span>
              <h3 className="text-lg font-semibold text-stone-100 mb-2">{f.title}</h3>
              <p className="text-stone-400 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Evidence Bar */}
      <section className="border-t border-stone-800 py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-stone-500 text-sm tracking-wide uppercase mb-8">
            Built on evidence from
          </p>
          <div className="flex flex-wrap justify-center gap-8 text-stone-600 text-sm">
            <span>ISSN Position Stands</span>
            <span className="text-stone-700">|</span>
            <span>ACSM Guidelines</span>
            <span className="text-stone-700">|</span>
            <span>IOC Consensus</span>
            <span className="text-stone-700">|</span>
            <span>Precision Nutrition</span>
            <span className="text-stone-700">|</span>
            <span>Mifflin-St Jeor</span>
          </div>
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
