import Link from 'next/link';
import {
  Zap, Camera, Mic, Target, Droplets, Shield,
  Dumbbell, Users, BarChart3, FlaskConical,
  ChevronRight, Globe, ArrowRight,
} from 'lucide-react';
import LanguageLinks from '@/components/landing/LanguageLinks';
import type { LandingLang } from '@/lib/landing-language';
import { ThemeModeProvider, ThemeModeToggle } from '@/components/shared/ThemeMode';

/* ═══════════════════════════════════════════════════════
   τροφή Landing Page
   Dark + gold · mobile-first · fast auth · light-mode ready
   ═══════════════════════════════════════════════════════ */

const copy: Record<LandingLang, {
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
    hero_tag: 'Precision Nutrition for Athletes',
    hero_h1: 'Track smarter.',
    hero_h1_accent: 'Eat better.',
    hero_sub: 'AI-powered food logging, personalized macro targets, and habit coaching — all in one app. Powered by science, built for athletes.',
    cta: 'Get Started Free',
    cta2: 'I\'m a Coach',
    features_tag: 'What you get today',
    features_title: 'Everything you need to master nutrition',
    how_tag: 'How it works',
    how_title: 'Three steps. That\'s it.',
    coming_tag: 'Coming soon',
    coming_title: 'The complete athlete experience',
    coming_sub: 'Training, workouts, and community — all integrated with your nutrition data.',
    numbers_tag: 'Built on evidence',
    bottom_h2: 'Your nutrition, finally solved.',
    bottom_sub: 'Join athletes who track smarter, not harder.',
    bottom_cta: 'Start Free',
  },
  es: {
    hero_tag: 'Nutrición de Precisión para Atletas',
    hero_h1: 'Rastrea inteligente.',
    hero_h1_accent: 'Come mejor.',
    hero_sub: 'Registro de comidas con IA, macros personalizados y coaching de hábitos — todo en una app. Basado en ciencia, hecho para atletas.',
    cta: 'Comenzar Gratis',
    cta2: 'Soy Coach',
    features_tag: 'Lo que obtienes hoy',
    features_title: 'Todo lo que necesitas para dominar tu nutrición',
    how_tag: 'Cómo funciona',
    how_title: 'Tres pasos. Eso es todo.',
    coming_tag: 'Próximamente',
    coming_title: 'La experiencia completa del atleta',
    coming_sub: 'Entrenamiento, rutinas y comunidad — todo integrado con tus datos de nutrición.',
    numbers_tag: 'Basado en evidencia',
    bottom_h2: 'Tu nutrición, por fin resuelta.',
    bottom_sub: 'Únete a los atletas que rastrean de forma inteligente.',
    bottom_cta: 'Comenzar Gratis',
  },
  el: {
    hero_tag: 'Διατροφή Ακριβείας για Αθλητές',
    hero_h1: 'Παρακολούθηση έξυπνα.',
    hero_h1_accent: 'Τρώτε καλύτερα.',
    hero_sub: 'Καταγραφή τροφίμων με AI, εξατομικευμένοι στόχοι μακροθρεπτικών και coaching συνηθειών — όλα σε μία εφαρμογή.',
    cta: 'Ξεκινήστε Δωρεάν',
    cta2: 'Είμαι Coach',
    features_tag: 'Τι αποκτάτε σήμερα',
    features_title: 'Ό,τι χρειάζεστε για να κατακτήσετε τη διατροφή',
    how_tag: 'Πώς λειτουργεί',
    how_title: 'Τρία βήματα. Αυτό είναι.',
    coming_tag: 'Σύντομα',
    coming_title: 'Η πλήρης αθλητική εμπειρία',
    coming_sub: 'Προπόνηση, ασκήσεις και κοινότητα — ενσωματωμένα με τα δεδομένα διατροφής σας.',
    numbers_tag: 'Βασισμένο σε επιστήμη',
    bottom_h2: 'Η διατροφή σας, επιτέλους λυμένη.',
    bottom_sub: 'Γίνετε μέλος αθλητών που παρακολουθούν έξυπνα.',
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
  { icon: Dumbbell,    title: { en: 'Training Programs', es: 'Programas de Entrenamiento', el: 'Προγράμματα Προπόνησης' }, desc: { en: 'Monitored & direct programs from certified coaches', es: 'Programas monitoreados y directos de coaches certificados', el: 'Παρακολουθούμενα προγράμματα από πιστοποιημένους coaches' } },
  { icon: Users,       title: { en: 'Community & Results', es: 'Comunidad y Resultados', el: 'Κοινότητα & Αποτελέσματα' }, desc: { en: 'Results database, athlete rankings, and community features', es: 'Base de resultados, ranking de atletas y comunidad', el: 'Βάση αποτελεσμάτων, κατάταξη αθλητών, κοινότητα' } },
  { icon: FlaskConical, title: { en: 'Ergometric Testing', es: 'Pruebas Ergométricas', el: 'Εργομετρικές Δοκιμές' }, desc: { en: 'Sport-specific performance assessment and tracking', es: 'Evaluación y seguimiento de rendimiento deportivo', el: 'Αξιολόγηση αθλητικής απόδοσης' } },
  { icon: BarChart3,   title: { en: 'Advanced Analytics', es: 'Analítica Avanzada', el: 'Προηγμένα Analytics' }, desc: { en: 'Deep macro trends, body composition, and performance correlation', es: 'Tendencias de macros, composición corporal y correlación de rendimiento', el: 'Τάσεις μάκρο, σύνθεση σώματος, συσχέτιση απόδοσης' } },
];

const steps = [
  { n: '01', title: { en: 'Sign up in seconds', es: 'Regístrate en segundos', el: 'Εγγραφή σε δευτερόλεπτα' }, desc: { en: 'Enter your stats. Get personalized macro targets instantly based on your body and goals.', es: 'Ingresa tus datos. Obtén macros personalizados al instante basados en tu cuerpo y metas.', el: 'Εισάγετε τα στατιστικά σας. Λάβετε εξατομικευμένους στόχους μάκρο αμέσως.' } },
  { n: '02', title: { en: 'Log meals your way', es: 'Registra comidas a tu manera', el: 'Καταγράψτε γεύματα' }, desc: { en: 'Text, photo, or voice — AI handles the rest. 350,000+ foods from USDA FoodData Central.', es: 'Texto, foto o voz — la IA hace el resto. 350,000+ alimentos de USDA FoodData Central.', el: 'Κείμενο, φωτογραφία ή φωνή — η AI κάνει τα υπόλοιπα. 350,000+ τρόφιμα.' } },
  { n: '03', title: { en: 'Build habits that stick', es: 'Construye hábitos que perduran', el: 'Χτίστε συνήθειες που μένουν' }, desc: { en: 'Your coach assigns one habit every 14 days. Small wins compound into lasting transformation.', es: 'Tu coach asigna un hábito cada 14 días. Pequeñas victorias se acumulan en transformación duradera.', el: 'Ο coach σας αναθέτει μία συνήθεια κάθε 14 μέρες.' } },
];

const evidenceSources = ['ISSN', 'ACSM', 'Mifflin-St Jeor', 'IOC', 'Precision Nutrition', 'USDA FDC'];

/* ─── App Preview Mockup ─── */
function AppPreview() {
  return (
    <div className="relative mx-auto w-[280px] sm:w-[320px]">
      {/* Phone frame */}
      <div className="rounded-[2rem] border-2 border-stone-700/40 bg-stone-950 p-2 shadow-2xl shadow-black/40">
        {/* Screen */}
        <div className="rounded-[1.5rem] overflow-hidden bg-stone-950">
          {/* Status bar */}
          <div className="flex justify-between items-center px-5 pt-3 pb-1 text-[9px] text-stone-500">
            <span>9:41</span>
            <div className="flex gap-1 items-center">
              <div className="w-3 h-2 border border-stone-600 rounded-sm relative">
                <div className="absolute inset-0.5 bg-green-500 rounded-xs" />
              </div>
            </div>
          </div>

          {/* App header */}
          <div className="px-4 pt-2 pb-3">
            <p className="text-[10px] text-stone-500 tracking-wider uppercase">Today</p>
            <div className="flex items-baseline justify-between mt-1">
              <p className="text-stone-200 text-sm font-semibold">Monday, Jun 9</p>
            </div>
          </div>

          {/* Macro bar */}
          <div className="mx-3 rounded-xl bg-stone-900/80 border border-stone-800/40 p-3 mb-3">
            <div className="grid grid-cols-5 gap-1 text-center">
              {[
                { v: '1,847', l: 'kcal', c: 'text-[#D4A853]' },
                { v: '142', l: 'Protein', c: 'text-red-400' },
                { v: '198', l: 'Carbs', c: 'text-blue-400' },
                { v: '67', l: 'Fat', c: 'text-purple-400' },
                { v: '24', l: 'Fiber', c: 'text-green-400' },
              ].map((m) => (
                <div key={m.l}>
                  <p className={`text-xs font-bold ${m.c}`}>{m.v}</p>
                  <p className="text-[7px] text-stone-600 mt-0.5">{m.l}</p>
                </div>
              ))}
            </div>
            {/* Progress bar — with a slow premium sheen */}
            <div className="mt-2 h-1 bg-stone-800 rounded-full overflow-hidden relative">
              <div className="h-full bg-gradient-to-r from-[#D4A853] to-[#E8C078] rounded-full" style={{ width: '72%' }} />
              <span aria-hidden className="mock-sheen" />
            </div>
            <p className="text-[8px] text-stone-600 mt-1 text-right">72% of daily target</p>
          </div>

          {/* Meal cards */}
          <div className="px-3 space-y-2 pb-3">
            {/* Logged meal */}
            <div className="rounded-xl bg-stone-900/60 border border-stone-800/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px]">&#9728;&#65039;</span>
                  <span className="text-stone-200 text-xs font-medium">Breakfast</span>
                </div>
                <span className="text-[#D4A853] text-[10px] font-semibold">487 kcal</span>
              </div>
              <div className="mt-1.5 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-stone-400">Greek yogurt with honey</span>
                  <span className="text-stone-500">220 kcal</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-stone-400">Granola mix (45g)</span>
                  <span className="text-stone-500">185 kcal</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-stone-400">Banana</span>
                  <span className="text-stone-500">82 kcal</span>
                </div>
              </div>
            </div>

            {/* Logged meal 2 */}
            <div className="rounded-xl bg-stone-900/60 border border-stone-800/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px]">&#127860;</span>
                  <span className="text-stone-200 text-xs font-medium">Lunch</span>
                </div>
                <span className="text-[#D4A853] text-[10px] font-semibold">724 kcal</span>
              </div>
              <div className="mt-1.5 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-stone-400">Grilled chicken breast</span>
                  <span className="text-stone-500">312 kcal</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-stone-400">Brown rice (180g)</span>
                  <span className="text-stone-500">234 kcal</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-stone-400">Mixed salad + olive oil</span>
                  <span className="text-stone-500">178 kcal</span>
                </div>
              </div>
            </div>

            {/* Upcoming meal */}
            <div className="rounded-xl bg-stone-900/30 border border-dashed border-stone-800/30 p-3 opacity-50">
              <div className="flex items-center gap-2">
                <span className="text-[10px]">&#127769;</span>
                <span className="text-stone-400 text-xs">Dinner — Tap to log</span>
              </div>
            </div>
          </div>

          {/* Bottom nav hint */}
          <div className="flex justify-around py-2 border-t border-stone-800/30 text-stone-600">
            <div className="text-center">
              <div className="w-4 h-4 mx-auto mb-0.5 rounded bg-stone-800/40" />
              <span className="text-[7px]">Home</span>
            </div>
            <div className="text-center">
              <div className="mock-log-tab w-4 h-4 mx-auto mb-0.5 rounded bg-[#D4A853]/20 border border-[#D4A853]/30" />
              <span className="text-[7px] text-[#D4A853]">Log</span>
            </div>
            <div className="text-center">
              <div className="w-4 h-4 mx-auto mb-0.5 rounded bg-stone-800/40" />
              <span className="text-[7px]">Progress</span>
            </div>
            <div className="text-center">
              <div className="w-4 h-4 mx-auto mb-0.5 rounded bg-stone-800/40" />
              <span className="text-[7px]">Me</span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating glow behind phone */}
      <div className="absolute -inset-8 -z-10 bg-[#D4A853]/[0.06] rounded-full blur-3xl" />
    </div>
  );
}

export default function LandingPage({ lang }: { lang: LandingLang }) {
  const t = copy[lang];

  return (
    <ThemeModeProvider>
    <div
      className="min-h-screen overflow-x-hidden bg-[var(--canvas)] text-[var(--content-primary)]"
      data-landing-lang
      lang={lang}
    >
      {/* ─── Navbar ─── */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--surface-overlay)]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:px-6">
          {/* Logo */}
          <span className="font-serif italic text-[#D4A853] text-xl tracking-tight select-none" aria-label="trophē">
            trophē
          </span>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language */}
            <div className="[&_nav]:border-[var(--border-default)] [&_nav]:bg-[var(--surface-2)] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:min-w-11 [&_a]:items-center [&_a]:justify-center [&_a]:text-xs [&_a]:text-[var(--content-muted)]">
              <LanguageLinks current={lang} />
            </div>
            <ThemeModeToggle />
            <Link
              href="/login"
              prefetch={false}
              className="hidden min-h-11 min-w-11 items-center justify-center px-2 text-sm font-medium text-[var(--content-secondary)] transition-colors hover:text-[var(--content-primary)] no-underline sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              href="/login?mode=signup"
              prefetch={false}
              className="btn-gold inline-flex min-h-11 items-center rounded-lg px-3 text-center text-xs no-underline sm:px-4"
            >
              {t.cta}
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-24 sm:pt-32 pb-8 sm:pb-12 px-6">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#D4A853] rounded-full opacity-[0.03] blur-[150px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-500 rounded-full opacity-[0.02] blur-[120px]" />
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
            {/* Left — Copy */}
            <div className="flex-1 text-center lg:text-left">
              {/* Eyebrow */}
              <p className="mb-6 text-xs uppercase tracking-[0.2em] text-[var(--action-primary)]">
                {t.hero_tag}
              </p>

              {/* Headline — serif display moment on the accent line (Latin-only
                  per design rule; Greek falls back to the sans weight) */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] mb-6">
                <span className="text-[var(--content-primary)]">{t.hero_h1}</span>
                <br />
                <span
                  className={lang !== 'el' ? 'display-hero text-[#D4A853]' : 'text-[#D4A853]'}
                >
                  {t.hero_h1_accent}
                </span>
              </h1>

              {/* Subline */}
              <p className="mx-auto mb-10 max-w-xl text-base leading-relaxed text-[var(--content-secondary)] sm:text-lg lg:mx-0">
                {t.hero_sub}
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <Link
                  href="/login?mode=signup"
                  prefetch={false}
                  className="btn-gold text-center text-base sm:text-lg px-8 py-3.5 no-underline flex items-center justify-center gap-2 group"
                >
                  {t.cta}
                  <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="/login"
                  prefetch={false}
                  className="btn-ghost text-center text-base sm:text-lg px-8 py-3.5 no-underline"
                >
                  {t.cta2}
                </Link>
              </div>
            </div>

            {/* Right — App Preview */}
            <div>
              <AppPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features (Live) ─── */}
      <section className="px-6 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--action-primary)]">
              {t.features_tag}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--content-primary)] sm:text-3xl lg:text-4xl">
              {t.features_title}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {features.map((f) => (
              <div
                key={f.title.en}
                className="glass scroll-reveal p-5 sm:p-6 group hover:border-[rgba(212,168,83,0.12)] transition-all duration-300"
              >
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] ${f.color}`}>
                  <f.icon size={20} />
                </div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--content-primary)]">{f.title[lang]}</h3>
                <p className="text-sm leading-relaxed text-[var(--content-muted)]">{f.desc[lang]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="border-t border-[var(--border-subtle)] px-6 py-16 sm:py-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--action-primary)]">
              {t.how_tag}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--content-primary)] sm:text-3xl">
              {t.how_title}
            </h2>
          </div>

          <div className="space-y-6">
            {steps.map((step) => (
              <div
                key={step.n}
                className="scroll-reveal flex gap-5 items-start"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#D4A853]/10 border border-[#D4A853]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-[#D4A853]">{step.n}</span>
                </div>
                <div className="pt-1">
                  <h3 className="mb-1 text-base font-semibold text-[var(--content-primary)]">{step.title[lang]}</h3>
                  <p className="text-sm leading-relaxed text-[var(--content-muted)]">{step.desc[lang]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Coming Soon ─── */}
      <section className="border-t border-[var(--border-subtle)] px-6 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--action-primary)]">
              {t.coming_tag}
            </p>
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-[var(--content-primary)] sm:text-3xl">
              {t.coming_title}
            </h2>
            <p className="mx-auto max-w-lg text-sm text-[var(--content-muted)]">
              {t.coming_sub}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {comingSoon.map((item) => (
              <div
                key={item.title.en}
                className="glass scroll-reveal p-5 relative overflow-hidden group"
              >
                {/* Coming soon badge */}
                <div className="absolute top-3 right-3">
                  <span className="rounded-full border border-[var(--border-focus)] bg-[var(--surface-2)] px-2 py-0.5 text-xs uppercase tracking-widest text-[var(--action-primary)]">
                    {t.coming_tag}
                  </span>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--content-muted)]">
                    <item.icon size={20} />
                  </div>
                  <div>
                    <h3 className="mb-1 text-sm font-semibold text-[var(--content-secondary)]">{item.title[lang]}</h3>
                    <p className="text-sm leading-relaxed text-[var(--content-muted)]">{item.desc[lang]}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Evidence / Numbers Bar — premium band ─── */}
      <section className="border-t border-[var(--border-subtle)] px-6 py-14">
        <div className="max-w-4xl mx-auto">
          <div className="evidence-band scroll-reveal">
            <p className="mb-5 text-center text-xs uppercase tracking-[0.2em] text-[var(--action-primary)]">
              {t.numbers_tag}
            </p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {evidenceSources.map((source) => (
                <span
                  key={source}
                  className="rounded-full border border-[var(--border-default)] bg-[var(--surface-1)] px-3.5 py-1.5 text-xs text-[var(--content-secondary)]"
                >
                  {source}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Bottom CTA ─── */}
      <section className="border-t border-[var(--border-subtle)] px-6 py-20 sm:py-28">
        <div className="max-w-xl mx-auto text-center">
          <div className="scroll-reveal">
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-[var(--content-primary)] sm:text-4xl">
              {t.bottom_h2}
            </h2>
            <p className="mb-10 text-sm text-[var(--content-muted)] sm:text-base">
              {t.bottom_sub}
            </p>
            <Link
              href="/login?mode=signup"
              prefetch={false}
              className="btn-gold text-center text-lg px-10 py-4 no-underline inline-flex items-center gap-2 group"
            >
              {t.bottom_cta}
              <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <p className="mt-8 font-[system-ui] text-xs uppercase tracking-wider text-[var(--content-muted)]">
              <Globe size={10} className="inline mr-1 -mt-px" />
              English · Español · Ελληνικά
            </p>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--canvas-subtle)] px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-serif italic text-[#D4A853] text-base select-none">trophē</span>
          <div className="flex items-center gap-5">
            <Link href="/pricing" prefetch={false} className="inline-flex min-h-11 items-center text-sm text-[var(--content-muted)] transition-colors hover:text-[var(--content-primary)] no-underline">
              Pricing
            </Link>
            <a href="/trust" className="inline-flex min-h-11 items-center text-sm text-[var(--content-muted)] transition-colors hover:text-[var(--content-primary)]">
              Trust &amp; Data Protection
            </a>
          </div>
          <p className="font-[system-ui] text-xs text-[var(--content-muted)]">
            &copy; 2026 Trophē
          </p>
        </div>
      </footer>
    </div>
    </ThemeModeProvider>
  );
}
