'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Brain, Target, Dumbbell, Utensils, BarChart3, Shield, Zap, Users, Camera, Flame, Trophy, Heart, Clock, TrendingUp, Sparkles } from 'lucide-react';
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

        {/* Hero Section */}
        <motion.div {...fadeUp} transition={{ delay: 0.1 }} className="glass-elevated p-6 mb-6 border border-[#D4A853]/20">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={18} className="gold-text" />
            <span className="text-xs text-[#D4A853] uppercase tracking-wider font-semibold">Para Michael Kavdas — Demo Exclusiva</span>
          </div>
          <h2 className="text-2xl font-bold text-stone-100 mb-3">
            La plataforma que reemplaza 3+ herramientas de coaching nutricional
          </h2>
          <p className="text-stone-400 text-sm leading-relaxed">
            Trophē implementa la metodología Precision Nutrition en software: hábitos progresivos de 14 días,
            tracking nutricional con IA, análisis de forma con cámara, y un dashboard de coach con inteligencia
            conductual. Todo en una sola app, trilingüe, con cero fricción para el cliente.
          </p>
        </motion.div>

        {/* Credentials */}
        <motion.div {...fadeUp} transition={{ delay: 0.15 }} className="glass p-4 mb-6">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Credenciales de Demo</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[10px] text-stone-500 mb-0.5">Coach</p>
              <p className="text-sm text-stone-200 font-medium">michael@kavdas.com</p>
              <p className="text-xs text-stone-500">trophe2026!</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[10px] text-stone-500 mb-0.5">Cliente (Nikos)</p>
              <p className="text-sm text-stone-200 font-medium">nikos@biorita.com</p>
              <p className="text-xs text-stone-500">trophe2026!</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Link href="/login" className="btn-gold flex-1 py-2.5 text-sm text-center font-semibold">
              Entrar como Coach
            </Link>
          </div>
        </motion.div>

        {/* ═══ METHODOLOGY ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.2 }}>
          <SectionHeader icon={Brain} title="Base Científica" subtitle="Fundamentación nutricional" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="Metodología Precision Nutrition (PN)"
              body="Trophē implementa el sistema de hábitos progresivos de PN: un hábito a la vez, ciclos de 14 días, con check-in diario. Esto se basa en la investigación de cambio conductual que muestra que la adherencia a un solo hábito es 3x mayor que intentar múltiples cambios simultáneos."
            />
            <DetailBlock
              title="Ecuación de Mifflin-St Jeor (BMR)"
              body="BMR = (10 × peso_kg) + (6.25 × altura_cm) - (5 × edad) + s, donde s = +5 (hombres) o -161 (mujeres). Esta ecuación tiene el menor margen de error (±10%) entre las ecuaciones predictivas validadas (Frankenfield et al., 2005). El TDEE se calcula multiplicando por el factor de actividad (1.2 - 1.9)."
            />
            <DetailBlock
              title="Distribución de Macros (ISSN Position Stand)"
              body={`Proteína: 1.6-2.2 g/kg para pérdida de grasa, 1.4-1.8 g/kg para ganancia muscular (Jäger et al., 2017). Distribución óptima: 20-40g por comida, espaciadas 3-5h para maximizar la síntesis proteica muscular (MPS). Carbohidratos: calculados como remanente calórico después de proteína y grasa. Grasa: mínimo 0.5 g/kg para función hormonal.`}
            />
            <DetailBlock
              title="Umbrales de Evaluación de Forma"
              body={`El sistema de Form Check usa comparación angular contra una referencia:
• 0-3% desviación: "Buen ejercicio" — técnica dentro del rango óptimo
• 4-8%: "Aún se puede mejorar" — ajustes menores recomendados
• 9-16%: "Es necesario ajustar" — riesgo biomecánico moderado
• 17-25%: "Realizar ajustes profundos" — intervención técnica necesaria
• >25%: "Riesgo de lesión" — detener y corregir antes de continuar
Basado en análisis de MediaPipe Pose (33 landmarks, 30+ FPS).`}
            />
          </div>
        </motion.div>

        {/* ═══ NUTRITION TRACKING ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.25 }}>
          <SectionHeader icon={Utensils} title="Tracking Nutricional" subtitle="85+ funciones de seguimiento" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="Entrada de Datos Multimodal"
              body="5 métodos de logging: (1) Texto libre con NLP — Claude Haiku parsea '3 huevos, tostada, café con leche' a items estructurados con macros. (2) Foto — análisis de imagen con Haiku Vision identifica alimentos y estima macros. (3) Pegar desde clipboard. (4) Voz — Web Speech API transcribe y auto-parsea. (5) Quick Add manual. Base de datos: 126 alimentos locales + USDA FoodData Central (350K+)."
            />
            <DetailBlock
              title="Sistema de Puntuación de Comidas"
              body="Cada comida recibe una nota A/B/C/D basada en: 40% balance de macros (proteína 20-35%, carbs 35-55%, grasa 20-35%), 30% adecuación proteica (vs 25g/comida target de MPS), 30% variedad alimentaria (>4 alimentos distintos = 100%). El score se muestra como badge en cada slot de comida."
            />
            <DetailBlock
              title="Métricas en Tiempo Real"
              body="Targets diarios con código de color (verde/dorado/rojo), rings de progreso animados (SVG), contador flotante de calorías restantes, racha de días consecutivos, sistema de badges (6 logros desbloqueables), fibra tracking (target 25-38g/día), tips contextuales que rotan cada hora con 21 consejos basados en evidencia."
            />
            <DetailBlock
              title="Analytics Avanzados"
              body="Gráfico de tendencias 30 días (multi-línea), heatmap tipo GitHub (8 semanas), radar de 5 ejes (P/C/F/Fibra/Agua), gauge de calorías estilo velocímetro, distribución de proteína por comida, ranking de alimentos frecuentes, patrones por día de semana, score de adherencia semanal (0-100%), reporte mensual con nota global."
            />
            <DetailBlock
              title="Ventana de Alimentación"
              body="Tracking automático de la primera y última comida del día. Muestra la ventana de alimentación y ayuno con barra visual. Compatible con protocolos de ayuno intermitente (16:8, 14:10). El coach puede ver los patrones de timing de cada cliente."
            />
          </div>
        </motion.div>

        {/* ═══ FORM CHECK ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.3 }}>
          <SectionHeader icon={Camera} title="AI Form Check" subtitle="Análisis biomecánico en navegador" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="MediaPipe Pose en el Navegador"
              body="Corre 100% client-side via WebAssembly — el video NUNCA sale del dispositivo. 33 landmarks corporales en 3D, 30+ FPS en desktop, 25 FPS en móvil. Modelo lite (5MB) se carga desde CDN de Google. Cero costo de API, cero latencia de red."
            />
            <DetailBlock
              title="Variables de Interés (Bulgarian Split Squat)"
              body={`• Ángulo de rodilla (knee_angle_deg): hip-knee-ankle, medido en plano sagital
• Inclinación del torso (torso_inclination_abs_deg): shoulder-hip respecto a vertical
• Inclinación del cuello (neck_inclination_abs_deg): ear-shoulder respecto a vertical
Suavizado con EMA (α=0.2 para ángulos, α=0.25 para puntos).
Detección de reps por cambios de dirección en ángulo de rodilla.`}
            />
            <DetailBlock
              title="Dataset de Referencia"
              body="202 puntos de datos (101 por fase: descenso y ascenso) promediados de 5 repeticiones de referencia. Cada punto incluye ángulos normalizados al 0-100% del movimiento. La comparación se hace por segment_type (baja_a_sube vs sube_a_baja), calculando mean_abs_pct_diff por variable."
            />
            <DetailBlock
              title="Extensibilidad"
              body="Arquitectura preparada para múltiples ejercicios. Agregar un nuevo ejercicio requiere: (1) grabar videos de referencia, (2) procesar con el pipeline Python existente, (3) exportar CSVs de promedios, (4) convertir a TypeScript constants. El frontend se adapta automáticamente."
            />
          </div>
        </motion.div>

        {/* ═══ WORKOUT MODULE ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.35 }}>
          <SectionHeader icon={Dumbbell} title="Módulo de Entrenamiento" subtitle="Logging + PRs + Templates" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="Tracking de Ejercicios"
              body="30 ejercicios pre-cargados (trilingüe EN/ES/EL), 13 grupos musculares, sets con peso/reps/RPE (1-10). Auto-detección de PRs comparando con histórico. Sistema de pain flags por ejercicio (parte del cuerpo + severidad 1-5). Timer de sesión en tiempo real."
            />
            <DetailBlock
              title="Dashboard de Volumen"
              body="Volumen semanal por grupo muscular (series × peso), alertas de frecuencia (cuándo fue la última vez que entrenaste cada músculo), tendencia de volumen semanal (8 semanas), tabla de PRs personales, comparación de ejercicios entre sesiones."
            />
            <DetailBlock
              title="Templates de Rutinas (Coach)"
              body="El coach crea templates con ejercicios, series target, reps target, RPE target. Los asigna a clientes. El cliente ve su rutina asignada y puede logear directamente contra ella. Niveles de dificultad: beginner/intermediate/advanced."
            />
          </div>
        </motion.div>

        {/* ═══ HABIT ENGINE ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.4 }}>
          <SectionHeader icon={Flame} title="Motor de Hábitos" subtitle="Metodología PN en software" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="Ciclos de 14 Días"
              body="Un hábito a la vez. El coach asigna → el cliente hace check-in diario (un tap). Después de 14 días consecutivos, el hábito se marca como 'mastered' y se desbloquea el siguiente. Esto replica el protocolo de Precision Nutrition Level 1 que Michael ya usa manualmente."
            />
            <DetailBlock
              title="Inteligencia Conductual"
              body="Heatmap de compliance (14 días), streak con badges (7, 14, 30 días), auto-progresión cuando se completa un ciclo, mood tracking por check-in (5 estados), radar chart de 6 categorías de hábitos, celebración de mastery con confetti. El coach ve señales conductuales: 🟢 on track, 🟡 at risk, 🔴 inactive."
            />
            <DetailBlock
              title="10 Hábitos Pre-cargados"
              body="Basados en la pirámide PN: (1) Comer despacio, (2) Comer hasta 80% lleno, (3) Proteína en cada comida, (4) Vegetales en cada comida, (5) Carbohidratos inteligentes, (6) Grasas saludables, (7) Hidratación, (8) Sleep hygiene, (9) Meal prep, (10) Mindful eating. Todos trilingüe (EN/ES/EL)."
            />
          </div>
        </motion.div>

        {/* ═══ COACH DASHBOARD ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.45 }}>
          <SectionHeader icon={Users} title="Dashboard de Coach" subtitle="Gestión de clientes" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="Vista de Clientes"
              body="Cards con señales conductuales en tiempo real. Filtros por estado (on track/at risk/inactive), búsqueda por nombre. Deep-dive por cliente: hábitos activos, food log, workouts, notas del coach, historial de suplementos. Tabla comparativa de múltiples clientes."
            />
            <DetailBlock
              title="Herramientas del Coach"
              body="Asignar hábitos, protocolos de suplementos (stacks A/B/C/D con nivel de evidencia), templates de rutinas, notas de sesión (check-in/progresión/concern/general), resumen exportable con un click, base de datos de alimentos custom (el coach agrega sus propios alimentos con macros verificados)."
            />
            <DetailBlock
              title="Suplementación Basada en Evidencia"
              body="Protocolos con nivel de evidencia marcado (A: fuerte, B: moderada, C: emergente, D: teórica). Grid de compliance por suplemento. El coach crea el stack, lo asigna al cliente, y ve la adherencia diaria. Timing configurable (mañana/tarde/noche/con comida)."
            />
          </div>
        </motion.div>

        {/* ═══ TECH STACK ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.5 }}>
          <SectionHeader icon={Zap} title="Stack Técnico" subtitle="Arquitectura del sistema" />
          <div className="glass p-5 mb-6 space-y-4">
            <DetailBlock
              title="Frontend"
              body="Next.js 16 (App Router) + React 19 + TypeScript (strict mode). Tailwind CSS 4 con glass morphism. Framer Motion para animaciones. Lucide para iconografía. 60 componentes, 19 páginas, 25,500+ líneas. Mobile-first (390x844)."
            />
            <DetailBlock
              title="Backend"
              body="Supabase: Auth + Postgres + Row Level Security (41 políticas). 18 tablas. API de USDA FoodData Central (350K+ alimentos). Zero servidor propio — todo serverless via Vercel."
            />
            <DetailBlock
              title="IA"
              body={`• Anthropic Claude Haiku 4.5: NLP food parsing + photo analysis (~$0.003/call)
• Google Gemini 2.0 Flash: meal suggestions (~$0.001/call)
• MediaPipe Pose (browser, WASM): form analysis (FREE, $0)
• Web Speech API: voice input (FREE, browser-native)
Costo estimado: ~$1.80/mes para 20 llamadas/día.`}
            />
            <DetailBlock
              title="Internacionalización"
              body="Trilingüe completo: English, Español, Ελληνικά. 200+ strings traducidos. Auto-detección de idioma. Soporta input en cualquier idioma (el AI parsea griego, español e inglés)."
            />
          </div>
        </motion.div>

        {/* ═══ NUMBERS ═══ */}
        <motion.div {...fadeUp} transition={{ delay: 0.55 }}>
          <SectionHeader icon={BarChart3} title="Métricas del Sistema" subtitle="Estado actual" />
          <div className="glass p-5 mb-6">
            <div className="grid grid-cols-3 gap-4">
              {[
                { n: '25,500+', label: 'Líneas de código' },
                { n: '60', label: 'Componentes React' },
                { n: '85+', label: 'Features shipped' },
                { n: '18', label: 'Tablas Supabase' },
                { n: '41', label: 'Políticas RLS' },
                { n: '126+', label: 'Alimentos en DB' },
                { n: '30', label: 'Ejercicios (3 idiomas)' },
                { n: '10', label: 'Hábitos PN' },
                { n: '0', label: 'Errores TypeScript' },
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
          <SectionHeader icon={Target} title="Propuesta de Valor" subtitle="Para Daily Nutrafit / Athletikapp" />
          <div className="glass-elevated p-5 mb-6 border border-[#D4A853]/20 space-y-4">
            <DetailBlock
              title="Lo que reemplaza"
              body="1. Spreadsheets para tracking de hábitos → Motor de hábitos automatizado con compliance heatmap. 2. MyFitnessPal para food logging → NLP + foto con puntuación de calidad por comida. 3. WhatsApp para comunicación coach-cliente → Dashboard integrado con notas y señales conductuales. 4. Planillas de entrenamiento → Templates digitales con auto-detección de PRs y form check con IA."
            />
            <DetailBlock
              title="Ventaja Competitiva"
              body="Ninguna plataforma combina: hábitos PN + food tracking con IA + análisis de forma con cámara + coach dashboard. Cronometer tiene micronutrientes pero no hábitos. MacroFactor tiene algoritmo adaptativo pero no coaching. Trainerize tiene templates pero no food AI. Trophē une todo."
            />
            <DetailBlock
              title="Modelo de Negocio"
              body="SaaS por coach: cada coach paga una suscripción mensual que le permite gestionar N clientes. Los clientes usan la app gratis. El coach personaliza hábitos, protocolos y templates. White-label posible en el futuro. El costo de IA es <$2/mes por coach."
            />
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div {...fadeUp} transition={{ delay: 0.65 }} className="text-center">
          <Link href="/login">
            <button className="btn-gold px-8 py-4 text-base font-bold">
              Entrar a Trophē
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

// ─── Reusable components ───

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
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
