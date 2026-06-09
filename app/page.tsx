'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  Zap, Camera, Mic, Target, Droplets, Shield,
  Dumbbell, Users, BarChart3, FlaskConical,
  ChevronRight, Globe, ArrowRight,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════
   τροφή Landing Page — by DailyNutraFit / AthletiKapp
   Premium dark + gold · mobile-first · fast auth
   ═══════════════════════════════════════════════════════ */

type Lang = 'en' | 'es' | 'el';

const copy: Record<Lang, {
  hero_tag: string;
  hero_h1: string;
  hero_h1_accent: string;
  hero_sub: string;
  cta: string;
  cta2: string;
  features_tag: string;
  features_title: string;
  how_tag: string;
  how_title: string;
  coming_tag: string;
  coming_title: string;
  coming_sub: string;
  numbers_tag: string;
  bottom_h2: string;
  bottom_sub: string;
  bottom_cta: string;
}> = {
  en: {
    hero_tag: 'The Nutrition Arm of DailyNutraFit',
    hero_h1: 'Track smarter.',
    hero_h1_accent: 'Eat better.',
    hero_sub: 'AI-powered food logging, personalized macro targets, and habit coaching — all in one premium app. Powered by science, built for athletes.',
    cta: 'Get Started Free',
    cta2: 'I\'m a Coach',
    features_tag: 'What you get today',
    features_title: 'Everything you need to master nutrition',
    how_tag: 'How it works',
    how_title: 'Three steps. That\'s it.',
    coming_tag: 'Coming soon',
    coming_title: 'The full AthletiKapp experience',
    coming_sub: 'Training, workouts, and community — all integrated with your nutrition data.',
    numbers_tag: 'Built on evidence',
    bottom_h2: 'Your nutrition, finally solved.',
    bottom_sub: 'Join DailyNutraFit athletes who track smarter, not harder.',
    bottom_cta: 'Start Free',
  },
  es: {
    hero_tag: 'El brazo de nutrición de DailyNutraFit',
    hero_h1: 'Rastrea inteligente.',
    hero_h1_accent: 'Come mejor.',
    hero_sub: 'Registro de comidas con IA, macros personalizados y coaching de hábitos — todo en una app premium. Basado en ciencia, hecho para atletas.',
    cta: 'Comenzar Gratis',
    cta2: 'Soy Coach',
    features_tag: 'Lo que obtienes hoy',
    features_title: 'Todo lo que necesitas para dominar tu nutrición',
    how_tag: 'Cómo funciona',
    how_title: 'Tres pasos. Eso es todo.',
    coming_tag: 'Próximamente',
    coming_title: 'La experiencia completa de AthletiKapp',
    coming_sub: 'Entrenamiento, rutinas y comunidad — todo integrado con tus datos de nutrición.',
    numbers_tag: 'Basado en evidencia',
    bottom_h2: 'Tu nutrición, por fin resuelta.',
    bottom_sub: 'Únete a los atletas de DailyNutraFit que rastrean de forma inteligente.',
    bottom_cta: 'Comenzar Gratis',
  },
  el: {
    hero_tag: 'Ο βραχίονας διατροφής του DailyNutraFit',
    hero_h1: 'Παρακολούθηση έξυπνα.',
    hero_h1_accent: 'Τρώτε καλύτερα.',
    hero_sub: 'Καταγραφή τροφίμων με AI, εξατομικευμένοι στόχοι μακροθρεπτικών και coaching συνηθειών — όλα σε μία premium εφαρμογή.',
    cta: 'Ξεκινήστε Δωρεάν',
    cta2: 'Είμαι Coach',
    features_tag: 'Τι αποκτάτε σήμερα',
    features_title: 'Ό,τι χρειάζεστε για να κατακτήσετε τη διατροφή',
    how_tag: 'Πώς λειτουργεί',
    how_title: 'Τρία βήματα. Αυτό είναι.',
    coming_tag: 'Σύντομα',
    coming_title: 'Η πλήρης εμπειρία AthletiKapp',
    coming_sub: 'Προπόνηση, ασκήσεις και κοινότητα — ενσωματωμένα με τα δεδομένα διατροφής σας.',
    numbers_tag: 'Βασισμένο σε επιστήμη',
    bottom_h2: 'Η διατροφή σας, επιτέλους λυμένη.',
    bottom_sub: 'Γίνετε μέλος των αθλητών DailyNutraFit.',
    bottom_cta: 'Ξεκινήστε Δωρεάν',
  },
};

const features = [
  { icon: Zap,        color: 'text-amber-400',  title: { en: 'AI Food Logging', es: 'Registro con IA', el: 'AI Καταγραφή' }, desc: { en: 'Type "chicken rice and salad" or snap a photo. AI identifies foods, estimates portions, and calculates macros in seconds.', es: 'Escribe "pollo arroz y ensalada" o toma una foto. La IA identifica alimentos y calcula macros en segundos.', el: 'Γράψτε "κοτόπουλο ρύζι σαλάτα" ή βγάλτε φωτογραφία. Η AI αναγνωρίζει τρόφιμα σε δευτερόλεπτα.' } },
  { icon: Camera,     color: 'text-blue-400',   title: { en: 'Photo Recognition', es: 'Reconocimiento Fotográfico', el: 'Αναγνώριση Φωτογραφίας' }, desc: { en: 'Point your camera at any plate. Our vision AI breaks down every item with calorie and macro estimates.', es: 'Apunta tu cámara a cualquier plato. Nuestra IA visual desglosa cada alimento.', el: 'Στρέψτε την κάμερα σε οποιοδήποτε πιάτο. Η AI αναλύει κάθε τρόφιμο.' } },
  { icon: Mic,        color: 'text-green-400',  title: { en: 'Voice Input', es: 'Entrada por Voz', el: 'Φωνητική Εισαγωγή' }, desc: { en: 'Say what you ate. Natural language processing handles portions, brands, and multi-item meals.', es: 'Di lo que comiste. El procesamiento de lenguaje natural maneja porciones y marcas.', el: 'Πείτε τι φάγατε. Η επεξεργασία φυσικής γλώσσας χειρίζεται μερίδες.' } },
  { icon: Target,     color: 'text-red-400',    title: { en: 'Personalized Macros', es: 'Macros Personalizados', el: 'Εξατομικευμένα Μάκρο' }, desc: { en: 'Mifflin-St Jeor BMR, ACSM activity multipliers, ISSN protein targets. Every number backed by research.', es: 'BMR Mifflin-St Jeor, multiplicadores ACSM, proteína ISSN. Cada número respaldado por ciencia.', el: 'BMR Mifflin-St Jeor, πολλαπλασιαστές ACSM, πρωτεΐνη ISSN. Κάθε αριθμός τεκμηριωμένος.' } },
  { icon: Droplets,   color: 'text-cyan-400',   title: { en: 'Water & Supplements', es: 'Agua y Suplementos', el: 'Νερό & Συμπληρώματα' }, desc: { en: 'Track hydration with visual progress. Follow evidence-based supplement protocols built by your coach.', es: 'Rastrea hidratación con progreso visual. Sigue protocolos de suplementos basados en evidencia.', el: 'Παρακολούθηση ενυδάτωσης. Ακολουθήστε πρωτόκολλα συμπληρωμάτων βασισμένα σε στοιχεία.' } },
  { icon: Shield,     color: 'text-purple-400', title: { en: 'Habit Coaching', es: 'Coaching de Hábitos', el: 'Coaching Συνηθειών' }, desc: { en: 'One habit every 14 days. Progressive scaffolding based on Precision Nutrition methodology.', es: 'Un hábito cada 14 días. Progresión basada en metodología Precision Nutrition.', el: 'Μία συνήθεια κάθε 14 μέρες. Προοδευτική ανάπτυξη βασισμένη στη μεθοδολογία Precision Nutrition.' } },
];

const comingSoon = [
  { icon: Dumbbell,    title: { en: 'Training Programs', es: 'Programas de Entrenamiento', el: 'Προγράμματα Προπόνησης' }, desc: { en: 'Monitored & direct programs from DailyNutraFit coaches', es: 'Programas monitoreados y directos de coaches DailyNutraFit', el: 'Παρακολουθούμενα προγράμματα από coaches DailyNutraFit' } },
  { icon: Users,       title: { en: 'Community & Results', es: 'Comunidad y Resultados', el: 'Κοινότητα & Αποτελέσματα' }, desc: { en: 'Results database, athlete rankings, and community features', es: 'Base de resultados, ranking de atletas y comunidad', el: 'Βάση αποτελεσμάτων, κατάταξη αθλητών, κοινότητα' } },
  { icon: FlaskConical, title: { en: 'Ergometric Testing', es: 'Pruebas Ergométricas', el: 'Εργομετρικές Δοκιμές' }, desc: { en: 'Sport-specific performance assessment and tracking', es: 'Evaluación y seguimiento de rendimiento deportivo', el: 'Αξιολόγηση αθλητικής απόδοσης' } },
  { icon: BarChart3,   title: { en: 'Advanced Analytics', es: 'Analítica Avanzada', el: 'Προηγμένα Analytics' }, desc: { en: 'Deep macro trends, body composition, and performance correlation', es: 'Tendencias de macros, composición corporal y correlación de rendimiento', el: 'Τάσεις μάκρο, σύνθεση σώματος, συσχέτιση απόδοσης' } },
];

const steps = [
  { n: '01', title: { en: 'Sign up in seconds', es: 'Regístrate en segundos', el: 'Εγγραφή σε δευτερόλεπτα' }, desc: { en: 'Enter your stats. Get personalized macro targets instantly based on your body and goals.', es: 'Ingresa tus datos. Obtén macros personalizados al instante basados en tu cuerpo y metas.', el: 'Εισάγετε τα στατιστικά σας. Λάβετε εξατομικευμένους στόχους μάκρο αμέσως.' } },
  { n: '02', title: { en: 'Log meals your way', es: 'Registra comidas a tu manera', el: 'Καταγράψτε γεύματα' }, desc: { en: 'Text, photo, or voice — AI handles the rest. 350,000+ foods from USDA FoodData Central.', es: 'Texto, foto o voz — la IA hace el resto. 350,000+ alimentos de USDA FoodData Central.', el: 'Κείμενο, φωτογραφία ή φωνή — η AI κάνει τα υπόλοιπα. 350,000+ τρόφιμα.' } },
  { n: '03', title: { en: 'Build habits that stick', es: 'Construye hábitos que perduran', el: 'Χτίστε συνήθειες που μένουν' }, desc: { en: 'Your coach assigns one habit every 14 days. Small wins compound into lasting transformation.', es: 'Tu coach asigna un hábito cada 14 días. Pequeñas victorias se acumulan en transformación duradera.', el: 'Ο coach σας αναθέτει μία συνήθεια κάθε 14 μέρες.' } },
];

const stats = [
  { value: '350K+', label: { en: 'Foods in database', es: 'Alimentos en base de datos', el: 'Τρόφιμα στη βάση' } },
  { value: 'AI', label: { en: 'Powered parsing', es: 'Análisis inteligente', el: 'Ανάλυση με AI' } },
  { value: '3', label: { en: 'Languages', es: 'Idiomas', el: 'Γλώσσες' } },
  { value: '14d', label: { en: 'Habit cycles', es: 'Ciclos de hábitos', el: 'Κύκλοι συνηθειών' } },
];

const evidenceSources = ['ISSN', 'ACSM', 'Mifflin-St Jeor', 'IOC', 'Precision Nutrition', 'USDA FDC'];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = copy[lang];

  return (
    <div className="min-h-screen bg-stone-950 overflow-x-hidden">
      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-stone-950/80 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Logo + Brand */}
          <div className="flex items-center gap-3">
            <span className="font-serif italic text-[#D4A853] text-xl tracking-tight select-none" aria-label="trophē">
              trophē
            </span>
            <span className="hidden sm:inline text-stone-600 text-[10px] font-mono tracking-widest uppercase">
              by DailyNutraFit
            </span>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language */}
            <div className="flex gap-0.5 bg-stone-900/60 rounded-full p-0.5 border border-stone-800/40">
              {(['en', 'es', 'el'] as const).map((code) => (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  className={`px-2 py-1 rounded-full text-[10px] font-medium uppercase transition-all ${
                    lang === code
                      ? 'bg-[#D4A853]/15 text-[#D4A853]'
                      : 'text-stone-600 hover:text-stone-400'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
            <Link
              href="/login"
              className="text-stone-400 hover:text-stone-200 text-xs font-medium transition-colors no-underline hidden sm:inline"
            >
              Log in
            </Link>
            <Link
              href="/login?mode=signup"
              className="btn-gold text-xs !py-2 !px-4 !rounded-lg no-underline"
            >
              {t.cta}
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-28 sm:pt-36 pb-20 sm:pb-28 px-6">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#D4A853] rounded-full opacity-[0.03] blur-[150px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-500 rounded-full opacity-[0.02] blur-[120px]" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          {/* Eyebrow — CSS animation, no hydration risk */}
          <p
            className="font-mono text-[10px] sm:text-xs tracking-[0.2em] uppercase text-[#D4A853]/70 mb-6 animate-[fadeUp_0.5s_ease-out_both]"
          >
            {t.hero_tag}
          </p>

          {/* Headline */}
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6 animate-[fadeUp_0.6s_0.1s_ease-out_both]"
          >
            <span className="text-stone-100">{t.hero_h1}</span>
            <br />
            <span className="text-[#D4A853]">{t.hero_h1_accent}</span>
          </h1>

          {/* Subline */}
          <p
            className="text-stone-400 text-base sm:text-lg max-w-xl mx-auto leading-relaxed mb-10 animate-[fadeUp_0.5s_0.25s_ease-out_both]"
          >
            {t.hero_sub}
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row gap-3 justify-center animate-[fadeUp_0.4s_0.4s_ease-out_both]"
          >
            <Link
              href="/login?mode=signup"
              className="btn-gold text-center text-base sm:text-lg px-8 py-3.5 no-underline flex items-center justify-center gap-2 group"
            >
              {t.cta}
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/login"
              className="btn-ghost text-center text-base sm:text-lg px-8 py-3.5 no-underline"
            >
              {t.cta2}
            </Link>
          </div>

          {/* Stats ribbon */}
          <div
            className="flex flex-wrap justify-center gap-6 sm:gap-10 mt-14 pt-8 border-t border-white/[0.04] animate-[fadeUp_0.5s_0.6s_ease-out_both]"
          >
            {stats.map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-xl sm:text-2xl font-bold text-[#D4A853]">{s.value}</p>
                <p className="text-[10px] sm:text-xs text-stone-500 mt-0.5">{s.label[lang]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features (Live) ─── */}
      <section className="px-6 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}
            className="text-center mb-12 sm:mb-16"
          >
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#D4A853]/60 mb-3">
              {t.features_tag}
            </p>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-stone-100 tracking-tight">
              {t.features_title}
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {features.map((f, i) => (
              <motion.div
                key={f.title.en}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                variants={fadeUp}
                className="glass p-5 sm:p-6 group hover:border-[rgba(212,168,83,0.12)] transition-all duration-300"
              >
                <div className={`w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 ${f.color}`}>
                  <f.icon size={20} />
                </div>
                <h3 className="text-stone-100 text-sm font-semibold mb-2">{f.title[lang]}</h3>
                <p className="text-stone-500 text-xs leading-relaxed">{f.desc[lang]}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="px-6 py-16 sm:py-24 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#D4A853]/60 mb-3">
              {t.how_tag}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-100 tracking-tight">
              {t.how_title}
            </h2>
          </motion.div>

          <div className="space-y-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.n}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-30px' }}
                variants={fadeUp}
                className="flex gap-5 items-start"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#D4A853]/10 border border-[#D4A853]/20 flex items-center justify-center flex-shrink-0">
                  <span className="font-mono text-sm font-bold text-[#D4A853]">{step.n}</span>
                </div>
                <div className="pt-1">
                  <h3 className="text-stone-100 text-base font-semibold mb-1">{step.title[lang]}</h3>
                  <p className="text-stone-500 text-sm leading-relaxed">{step.desc[lang]}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Coming Soon ─── */}
      <section className="px-6 py-16 sm:py-24 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#D4A853]/60 mb-3">
              {t.coming_tag}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-100 tracking-tight mb-3">
              {t.coming_title}
            </h2>
            <p className="text-stone-500 text-sm max-w-lg mx-auto">
              {t.coming_sub}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {comingSoon.map((item, i) => (
              <motion.div
                key={item.title.en}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-30px' }}
                variants={fadeUp}
                className="glass p-5 relative overflow-hidden group"
              >
                {/* Coming soon badge */}
                <div className="absolute top-3 right-3">
                  <span className="font-mono text-[8px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-[#D4A853]/10 text-[#D4A853]/60 border border-[#D4A853]/15">
                    {t.coming_tag}
                  </span>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center text-stone-600 flex-shrink-0">
                    <item.icon size={20} />
                  </div>
                  <div>
                    <h3 className="text-stone-300 text-sm font-semibold mb-1">{item.title[lang]}</h3>
                    <p className="text-stone-600 text-xs leading-relaxed">{item.desc[lang]}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Evidence / Numbers Bar ─── */}
      <section className="px-6 py-12 border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto text-center">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-stone-600 mb-6">
            {t.numbers_tag}
          </p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {evidenceSources.map((source) => (
              <span key={source} className="text-stone-500 text-xs sm:text-sm font-medium">
                {source}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Bottom CTA ─── */}
      <section className="px-6 py-20 sm:py-28 border-t border-white/[0.04]">
        <div className="max-w-xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-100 tracking-tight mb-4">
              {t.bottom_h2}
            </h2>
            <p className="text-stone-500 mb-10 text-sm sm:text-base">
              {t.bottom_sub}
            </p>
            <Link
              href="/login?mode=signup"
              className="btn-gold text-center text-lg px-10 py-4 no-underline inline-flex items-center gap-2 group"
            >
              {t.bottom_cta}
              <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <p className="text-stone-700 text-[10px] font-mono tracking-wider uppercase mt-8">
              <Globe size={10} className="inline mr-1 -mt-px" />
              English · Español · Ελληνικά
            </p>
          </motion.div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/[0.04] py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-serif italic text-[#D4A853] text-base select-none">trophē</span>
            <span className="text-stone-700 text-[9px] font-mono tracking-wider uppercase">
              by DailyNutraFit
            </span>
          </div>
          <div className="flex items-center gap-4 text-stone-600 text-xs">
            <a
              href="https://www.dailynutrafit.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-400 transition-colors"
            >
              DailyNutraFit.com
            </a>
            <span className="text-stone-800">·</span>
            <span>info@dailynutrafit.com</span>
          </div>
          <p className="text-stone-700 text-[10px]">
            2026 Trophē · Powered by AthletiKapp
          </p>
        </div>
      </footer>
    </div>
  );
}
