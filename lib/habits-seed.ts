// ═══════════════════════════════════════════════
// τροφή (Trophē) — Evidence-Based Habit Templates
// Based on Precision Nutrition's 14-skill framework
// Each habit follows the PN "One Habit" philosophy:
//   - Simple enough to do daily
//   - 14-day cycle for mastery
//   - Progressive difficulty
// ═══════════════════════════════════════════════

import type { HabitCategory, HabitDifficulty } from './types';

export interface HabitTemplate {
  name_en: string;
  name_es: string;
  name_el: string;
  description_en: string;
  description_es: string;
  description_el: string;
  emoji: string;
  category: HabitCategory;
  difficulty: HabitDifficulty;
  target_value: number;
  target_unit: string;
  cycle_days: number;
  suggested_order: number;
}

export const HABIT_TEMPLATES: HabitTemplate[] = [
  {
    name_en: 'Drink enough water daily',
    name_es: 'Beber suficiente agua diariamente',
    name_el: 'Πίνε αρκετό νερό καθημερινά',
    description_en: 'Aim for at least 3 liters of water throughout the day. Carry a bottle with you.',
    description_es: 'Apunta a al menos 3 litros de agua durante el día. Lleva una botella contigo.',
    description_el: 'Στοχεύστε τουλάχιστον 3 λίτρα νερό κατά τη διάρκεια της ημέρας.',
    emoji: '💧',
    category: 'hydration',
    difficulty: 'beginner',
    target_value: 3,
    target_unit: 'liters',
    cycle_days: 14,
    suggested_order: 1,
  },
  {
    name_en: 'Eat protein at every meal',
    name_es: 'Comer proteína en cada comida',
    name_el: 'Φάε πρωτεΐνη σε κάθε γεύμα',
    description_en: 'Include a palm-sized portion of protein (chicken, fish, eggs, legumes) at every meal.',
    description_es: 'Incluye una porción del tamaño de tu palma de proteína en cada comida.',
    description_el: 'Συμπεριλάβετε μια μερίδα πρωτεΐνης σε κάθε γεύμα.',
    emoji: '🥩',
    category: 'nutrition',
    difficulty: 'beginner',
    target_value: 1.6,
    target_unit: 'g/kg',
    cycle_days: 14,
    suggested_order: 2,
  },
  {
    name_en: 'Eat 5 servings of vegetables',
    name_es: 'Comer 5 porciones de vegetales',
    name_el: 'Φάε 5 μερίδες λαχανικών',
    description_en: 'Include vegetables at lunch and dinner. A serving is about 1 cup raw or ½ cup cooked.',
    description_es: 'Incluye verduras en almuerzo y cena. Una porción es 1 taza cruda o ½ taza cocida.',
    description_el: 'Βάλε λαχανικά στο μεσημεριανό και το βραδινό.',
    emoji: '🥬',
    category: 'nutrition',
    difficulty: 'beginner',
    target_value: 5,
    target_unit: 'servings',
    cycle_days: 14,
    suggested_order: 3,
  },
  {
    name_en: 'Sleep 7-9 hours',
    name_es: 'Dormir 7-9 horas',
    name_el: 'Κοιμήσου 7-9 ώρες',
    description_en: 'Aim for 7-9 hours of quality sleep. Set a consistent bedtime and avoid screens 1h before.',
    description_es: 'Apunta a 7-9 horas de sueño de calidad. Fija una hora de dormir consistente.',
    description_el: 'Στοχεύστε 7-9 ώρες ποιοτικού ύπνου.',
    emoji: '😴',
    category: 'sleep',
    difficulty: 'beginner',
    target_value: 7.5,
    target_unit: 'hours',
    cycle_days: 14,
    suggested_order: 4,
  },
  {
    name_en: 'Eat slowly (20 min meals)',
    name_es: 'Comer despacio (20 min por comida)',
    name_el: 'Φάε αργά (20 λεπτά γεύματα)',
    description_en: 'Take at least 20 minutes per meal. Put your fork down between bites. Notice hunger signals.',
    description_es: 'Toma al menos 20 minutos por comida. Deja el tenedor entre bocados.',
    description_el: 'Αφιερώστε τουλάχιστον 20 λεπτά ανά γεύμα.',
    emoji: '🍽️',
    category: 'mindset',
    difficulty: 'intermediate',
    target_value: 20,
    target_unit: 'minutes',
    cycle_days: 14,
    suggested_order: 5,
  },
  {
    name_en: 'Prepare meals in advance',
    name_es: 'Preparar comidas con anticipación',
    name_el: 'Προετοίμασε γεύματα εκ των προτέρων',
    description_en: 'Prep at least 3 meals ahead of time. Cook proteins and carbs in bulk on weekends.',
    description_es: 'Prepara al menos 3 comidas con anticipación. Cocina proteínas y carbohidratos el fin de semana.',
    description_el: 'Προετοιμάστε τουλάχιστον 3 γεύματα εκ των προτέρων.',
    emoji: '🍱',
    category: 'nutrition',
    difficulty: 'intermediate',
    target_value: 3,
    target_unit: 'meals',
    cycle_days: 14,
    suggested_order: 6,
  },
  {
    name_en: 'Walk 8000+ steps',
    name_es: 'Caminar 8000+ pasos',
    name_el: 'Περπάτησε 8000+ βήματα',
    description_en: 'NEAT (non-exercise activity) is crucial. Walk after meals, take stairs, stand more.',
    description_es: 'El NEAT es crucial. Camina después de comer, usa escaleras, párate más.',
    description_el: 'Η καθημερινή κίνηση είναι κρίσιμη. Περπάτα μετά τα γεύματα.',
    emoji: '🚶',
    category: 'movement',
    difficulty: 'beginner',
    target_value: 8000,
    target_unit: 'steps',
    cycle_days: 14,
    suggested_order: 7,
  },
  {
    name_en: 'Eat without screens',
    name_es: 'Comer sin pantallas',
    name_el: 'Φάε χωρίς οθόνες',
    description_en: 'At least one meal per day without phone, TV, or computer. Focus on your food.',
    description_es: 'Al menos una comida al día sin celular, TV o computadora.',
    description_el: 'Τουλάχιστον ένα γεύμα χωρίς κινητό, TV ή υπολογιστή.',
    emoji: '📵',
    category: 'mindset',
    difficulty: 'intermediate',
    target_value: 1,
    target_unit: 'meals',
    cycle_days: 14,
    suggested_order: 8,
  },
  {
    name_en: 'Include healthy fats daily',
    name_es: 'Incluir grasas saludables diariamente',
    name_el: 'Συμπερίλαβε υγιεινά λιπαρά καθημερινά',
    description_en: 'Add avocado, olive oil, nuts, or fatty fish to at least one meal. Supports hormones and satiety.',
    description_es: 'Agrega aguacate, aceite de oliva, frutos secos o pescado graso a al menos una comida.',
    description_el: 'Πρόσθεσε αβοκάντο, ελαιόλαδο, ξηρούς καρπούς ή λιπαρά ψάρια.',
    emoji: '🥑',
    category: 'nutrition',
    difficulty: 'beginner',
    target_value: 0.8,
    target_unit: 'g/kg',
    cycle_days: 14,
    suggested_order: 9,
  },
  {
    name_en: 'Practice 5-min breathing',
    name_es: 'Practicar 5 min de respiración',
    name_el: 'Κάνε 5 λεπτά αναπνοές',
    description_en: 'Spend 5 minutes on deep breathing or meditation. Reduces cortisol and improves recovery.',
    description_es: 'Dedica 5 minutos a respiración profunda o meditación. Reduce cortisol y mejora recuperación.',
    description_el: 'Αφιερώστε 5 λεπτά σε βαθιά αναπνοή ή διαλογισμό.',
    emoji: '🧘',
    category: 'recovery',
    difficulty: 'beginner',
    target_value: 5,
    target_unit: 'minutes',
    cycle_days: 14,
    suggested_order: 10,
  },
];
