'use client';

import { memo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useI18n } from '@/lib/i18n';

interface MacroFoodIdeasProps {
  consumed: { protein: number; carbs: number; fat: number; fiber: number };
  targets:  { protein: number; carbs: number; fat: number; fiber: number };
}

interface FoodIdea {
  name:       string;
  amount:     string;
  macroValue: number;
  unit:       string;
  // Rich detail fields
  calories:   number;
  protein:    number;
  carbs:      number;
  fat:        number;
  fiber:      number;
  funFact:    string;
  recipe:     string;
  prepTime:   string;
}

const PROTEIN_IDEAS: FoodIdea[] = [
  { name: 'Greek yogurt',   amount: '200g',        macroValue: 20, unit: 'g protein',  calories: 146, protein: 20, carbs: 8,  fat: 4,  fiber: 0, funFact: 'Strained 3× more than regular yogurt — packs twice the protein per gram.', recipe: 'Mix with honey + walnuts + cinnamon for a quick high-protein breakfast bowl.', prepTime: '2 min' },
  { name: 'Chicken breast',  amount: '150g cooked', macroValue: 46, unit: 'g protein',  calories: 248, protein: 46, carbs: 0,  fat: 5,  fiber: 0, funFact: 'One of the highest protein-to-calorie ratios of any whole food (~1g protein per 5 kcal).', recipe: 'Season with paprika + garlic, air-fry 12 min at 200°C. Slice over greens.', prepTime: '15 min' },
  { name: 'Eggs (2)',        amount: '2 large',      macroValue: 12, unit: 'g protein',  calories: 155, protein: 12, carbs: 1,  fat: 11, fiber: 0, funFact: 'Egg white protein (albumin) is used as the gold standard — 100% bioavailability score.', recipe: 'Soft-scramble with butter + fresh herbs. Done in 3 min flat.', prepTime: '3 min' },
  { name: 'Tuna can',        amount: '120g drained', macroValue: 30, unit: 'g protein',  calories: 132, protein: 30, carbs: 0,  fat: 1,  fiber: 0, funFact: 'Per calorie, canned tuna in water is one of the leanest protein sources on the planet.', recipe: 'Mix with avocado, lime juice + chili flakes for a no-cook high-protein bowl.', prepTime: '3 min' },
  { name: 'Cottage cheese',  amount: '150g',         macroValue: 17, unit: 'g protein',  calories: 111, protein: 17, carbs: 4,  fat: 3,  fiber: 0, funFact: 'Casein-rich = digests slowly, making it ideal as a night-time protein to feed muscles overnight.', recipe: 'Top with sliced peaches and a drizzle of honey. Or blend smooth into cheesecake batter.', prepTime: '1 min' },
  { name: 'Lentils',         amount: '200g cooked',  macroValue: 18, unit: 'g protein',  calories: 230, protein: 18, carbs: 40, fat: 1,  fiber: 16, funFact: 'Double win: 18g protein + 16g fiber per serving — one of the best plant-based combos.', recipe: 'Sauté onion + cumin + tomato. Add lentils, simmer 5 min. Serve with rice.', prepTime: '20 min' },
  { name: 'Whey shake',      amount: '1 scoop (30g)', macroValue: 25, unit: 'g protein', calories: 120, protein: 25, carbs: 3,  fat: 2,  fiber: 0, funFact: 'Fastest-absorbing protein — leucine triggers muscle protein synthesis within 30 min.', recipe: 'Blend with banana, oat milk + ice for a creamy post-workout shake.', prepTime: '2 min' },
  { name: 'Salmon fillet',   amount: '150g baked',   macroValue: 34, unit: 'g protein',  calories: 280, protein: 34, carbs: 0,  fat: 14, fiber: 0, funFact: 'Omega-3 EPA+DHA in salmon reduce muscle soreness and improve recovery time.', recipe: 'Season with dijon + dill + lemon. Bake 12 min at 200°C. Rest 2 min.', prepTime: '15 min' },
];

const FIBER_IDEAS: FoodIdea[] = [
  { name: 'Oats',         amount: '50g dry',      macroValue: 5,  unit: 'g fiber', calories: 190, protein: 6,  carbs: 34, fat: 3, fiber: 5,  funFact: 'Beta-glucan fiber in oats lowers LDL cholesterol by up to 10% with daily use.', recipe: 'Cook with milk, top with banana + chia seeds + a pinch of sea salt.', prepTime: '5 min' },
  { name: 'Chia seeds',   amount: '2 tbsp (20g)',  macroValue: 10, unit: 'g fiber', calories: 97,  protein: 3,  carbs: 9,  fat: 6, fiber: 10, funFact: 'They absorb 10× their weight in water — that gel slows digestion and keeps you full longer.', recipe: 'Mix 3 tbsp chia + 250ml oat milk + vanilla. Refrigerate overnight. Add mango.', prepTime: '5 min + overnight' },
  { name: 'Broccoli',     amount: '200g steamed',  macroValue: 5,  unit: 'g fiber', calories: 68,  protein: 6,  carbs: 11, fat: 1, fiber: 5,  funFact: 'Also contains sulforaphane, one of the most studied anti-cancer phytonutrients.', recipe: 'Steam 4 min. Toss with sesame oil, soy sauce + chili flakes. Finish with sesame seeds.', prepTime: '8 min' },
  { name: 'Apple',        amount: '1 medium',      macroValue: 4,  unit: 'g fiber', calories: 95,  protein: 0,  carbs: 25, fat: 0, fiber: 4,  funFact: 'Half the fiber is pectin — a prebiotic that feeds your beneficial gut bacteria.', recipe: 'Core + slice, dip in almond butter. Or bake 20 min with cinnamon + coconut sugar.', prepTime: '1 min' },
  { name: 'Black beans',  amount: '150g cooked',   macroValue: 10, unit: 'g fiber', calories: 170, protein: 10, carbs: 31, fat: 1, fiber: 10, funFact: 'The dark pigment = anthocyanins — powerful antioxidants linked to heart and brain health.', recipe: 'Mash with lime, cumin + cilantro for quick tacos, or blend into a black bean hummus.', prepTime: '5 min (canned)' },
  { name: 'Avocado',      amount: '½ medium',      macroValue: 5,  unit: 'g fiber', calories: 120, protein: 1,  carbs: 7,  fat: 11, fiber: 5, funFact: 'One of the only fruits with significant healthy fat AND fiber — rare combination.', recipe: 'Mash onto toast with flaky salt, chili, lemon. Top with poached egg.', prepTime: '3 min' },
  { name: 'Sweet potato', amount: '200g baked',    macroValue: 6,  unit: 'g fiber', calories: 172, protein: 4,  carbs: 40, fat: 0, fiber: 6,  funFact: 'One of the highest vitamin A foods — 200g covers 4× your daily needs.', recipe: 'Microwave 5 min, halve, stuff with Greek yogurt + chili + lime.', prepTime: '7 min' },
  { name: 'Almonds',      amount: '30g',           macroValue: 4,  unit: 'g fiber', calories: 173, protein: 6,  carbs: 6,  fat: 15, fiber: 4, funFact: 'Despite being high in fat, almonds are associated with *reduced* body fat — likely due to satiety effect.', recipe: 'Toast in a dry pan 3 min with rosemary + sea salt. Snack game changer.', prepTime: '4 min' },
];

const FAT_IDEAS: FoodIdea[] = [
  { name: 'Olive oil',       amount: '1 tbsp (15ml)', macroValue: 14, unit: 'g fat', calories: 119, protein: 0, carbs: 0,  fat: 14, fiber: 0, funFact: 'Extra virgin olive oil contains oleocanthal — acts like ibuprofen as a natural anti-inflammatory.', recipe: 'Finish any dish with a drizzle cold. Or blend with lemon + garlic as dressing.', prepTime: '1 min' },
  { name: 'Avocado',         amount: '½ medium',      macroValue: 12, unit: 'g fat', calories: 120, protein: 1, carbs: 7,  fat: 11, fiber: 5, funFact: 'Monounsaturated fat helps your body absorb fat-soluble vitamins (A, D, E, K) from other foods.', recipe: 'Slice thin over salmon, drizzle with tamari + sesame oil.', prepTime: '2 min' },
  { name: 'Almonds',         amount: '30g',           macroValue: 15, unit: 'g fat', calories: 173, protein: 6, carbs: 6,  fat: 15, fiber: 4, funFact: '90% of the fat in almonds is mono or polyunsaturated — the kind that supports heart health.', recipe: 'Blend into almond butter: 2 cups almonds, pinch salt, food processor 10 min.', prepTime: '10 min' },
  { name: 'Peanut butter',   amount: '2 tbsp (32g)',  macroValue: 16, unit: 'g fat', calories: 188, protein: 8, carbs: 7,  fat: 16, fiber: 2, funFact: 'Resveratrol (same as red wine) is found in peanuts — linked to longevity pathways.', recipe: 'Stir into overnight oats, or spread on banana + drizzle with honey.', prepTime: '1 min' },
  { name: 'Walnuts',         amount: '30g',           macroValue: 20, unit: 'g fat', calories: 196, protein: 5, carbs: 4,  fat: 20, fiber: 2, funFact: 'Highest plant source of ALA omega-3 — critical for brain membrane structure.', recipe: 'Toast, chop, add to oatmeal or a kale + pear + blue cheese salad.', prepTime: '5 min' },
  { name: 'Salmon',          amount: '150g',          macroValue: 18, unit: 'g fat', calories: 280, protein: 34, carbs: 0, fat: 14, fiber: 0, funFact: 'EPA+DHA reduce inflammation markers (CRP) more effectively than many supplements.', recipe: 'Pan-sear skin-side 4 min, flip 2 min. Squeeze lemon. Done.', prepTime: '10 min' },
  { name: 'Dark chocolate',  amount: '30g (85%+)',    macroValue: 14, unit: 'g fat', calories: 171, protein: 2, carbs: 13, fat: 14, fiber: 3, funFact: 'Flavanols in dark chocolate improve blood flow to the brain within 2 hours of eating.', recipe: 'Break over Greek yogurt with raspberries + flaky sea salt for a quick dessert.', prepTime: '1 min' },
  { name: 'Egg yolks (2)',   amount: '2 yolks',       macroValue: 10, unit: 'g fat', calories: 109, protein: 5, carbs: 1,  fat: 9,  fiber: 0, funFact: 'The yolk contains 100% of the egg\'s choline — essential for memory and liver health.', recipe: 'Soft-boil 6 min 30 sec, serve on ramen or rye toast with smoked salmon.', prepTime: '8 min' },
];

const CARB_IDEAS: FoodIdea[] = [
  { name: 'Brown rice',       amount: '200g cooked',  macroValue: 46, unit: 'g carbs', calories: 216, protein: 4, carbs: 46, fat: 2, fiber: 3,  funFact: 'Resistant starch in cooled brown rice acts like fiber — feed gut bacteria and reduce blood sugar spike.', recipe: 'Cook + cool. Reheat next day for max resistant starch. Pair with stir-fry.', prepTime: '25 min' },
  { name: 'Banana',           amount: '1 medium',     macroValue: 27, unit: 'g carbs', calories: 105, protein: 1, carbs: 27, fat: 0, fiber: 3,  funFact: 'Pre-workout winner — the fructose:glucose ratio is perfect for sustained energy without crash.', recipe: 'Frozen + blended = 1-ingredient "nice cream". Add PB for a pro snack.', prepTime: '1 min' },
  { name: 'Oats',             amount: '50g dry',      macroValue: 34, unit: 'g carbs', calories: 190, protein: 6, carbs: 34, fat: 3, fiber: 5,  funFact: 'Low glycemic index (55) despite being a grain — keeps blood sugar stable for 3+ hours.', recipe: 'Overnight oats: oats + chia + milk + yogurt + fruit. Zero cooking required.', prepTime: '5 min + overnight' },
  { name: 'Sweet potato',     amount: '200g baked',   macroValue: 40, unit: 'g carbs', calories: 172, protein: 4, carbs: 40, fat: 0, fiber: 6,  funFact: 'GI drops significantly when eaten with fat or protein — a carb source that plays well with others.', recipe: 'Cube, toss in olive oil + smoked paprika, roast 25 min at 200°C.', prepTime: '30 min' },
  { name: 'Pasta',            amount: '200g cooked',  macroValue: 50, unit: 'g carbs', calories: 264, protein: 9, carbs: 50, fat: 1, fiber: 2,  funFact: 'Al dente pasta has a lower GI than overcooked — cooking time literally changes how your body processes it.', recipe: 'Aglio e olio: spaghetti + garlic + EVOO + chili + parsley. 10 min total.', prepTime: '12 min' },
  { name: 'Bread (2 slices)', amount: '2 slices',     macroValue: 26, unit: 'g carbs', calories: 160, protein: 6, carbs: 26, fat: 2, fiber: 2,  funFact: 'Sourdough bread has a 30% lower glycemic response than regular white bread — fermentation changes the starch.', recipe: 'Toast, top with ricotta + sliced figs + honey + black pepper.', prepTime: '3 min' },
  { name: 'Quinoa',           amount: '200g cooked',  macroValue: 40, unit: 'g carbs', calories: 222, protein: 8, carbs: 40, fat: 4, fiber: 5,  funFact: 'Complete protein — contains all 9 essential amino acids. Rare for a grain.', recipe: 'Cook in vegetable broth. Fluff with fork. Add roasted veggies + tahini dressing.', prepTime: '15 min' },
  { name: 'Honey',            amount: '1 tbsp (21g)', macroValue: 17, unit: 'g carbs', calories: 64,  protein: 0, carbs: 17, fat: 0, fiber: 0,  funFact: 'Fructose + glucose split means faster energy than pure glucose — popular in endurance sports.', recipe: 'Drizzle on Greek yogurt, add walnuts + cinnamon for a 2-minute recovery meal.', prepTime: '1 min' },
];

interface CategoryProps {
  title:     string;
  icon:      IconName;
  color:     string;
  remaining: number;
  unit:      string;
  ideas:     FoodIdea[];
  onSelect:  (idea: FoodIdea) => void;
}

function MacroCategory({ title, icon, color, remaining, unit, ideas, onSelect }: CategoryProps) {
  const relevant = ideas
    .filter(f => f.macroValue <= remaining * 1.3)
    .slice(0, 4);

  if (remaining <= 0 || relevant.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium flex items-center gap-1 ${color}`}>
          <Icon name={icon} size={13} />
          {title}
        </span>
        <span className={`text-[10px] ${color}`}>
          {Math.round(remaining)}{unit} to go
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {relevant.map(idea => (
          <button
            key={idea.name}
            onClick={() => onSelect(idea)}
            className="flex-shrink-0 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.14] hover:bg-white/[0.07] active:scale-95 transition-all text-left"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-stone-300 whitespace-nowrap">{idea.name}</span>
            </div>
            <div className={`text-[10px] text-stone-500 mt-0.5`}>
              {idea.amount} · <span className={color}>{idea.macroValue}{unit}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── WOAH Detail Modal ───────────────────────────────────────────────────────

interface FoodDetailModalProps {
  idea:    FoodIdea;
  color:   string;
  icon:    IconName;
  onClose: () => void;
}

function MacroBar({ label, value, unit, color, max }: { label: string; value: number; unit: string; color: string; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-stone-500">{label}</span>
        <span className="text-[10px] font-semibold text-stone-300">{value}{unit}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function FoodDetailModal({ idea, color, icon, onClose }: FoodDetailModalProps) {
  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const maxMacro = Math.max(idea.carbs, idea.protein, idea.fat, idea.fiber || 1);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl overflow-hidden"
        style={{
          background: 'var(--bg-1,#1c1917)',
          border: '1px solid var(--line-2,rgba(255,255,255,0.08))',
          borderBottom: 'none',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/10" />
        </div>

        {/* Hero area */}
        <div className="px-5 pt-2 pb-4 relative overflow-hidden">
          {/* Background glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 30% 0%, ${color}18 0%, transparent 65%)`,
            }}
          />

          <div className="flex items-start justify-between relative">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: `${color}22`, border: `1px solid ${color}44` }}
                >
                  <Icon name={icon} size={16} style={{ color }} />
                </div>
                <h2 className="text-xl font-bold text-stone-100">{idea.name}</h2>
              </div>
              <p className="text-stone-500 text-xs">{idea.amount}</p>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X size={14} className="text-stone-400" />
            </button>
          </div>

          {/* Calories hero */}
          <div
            className="mt-4 rounded-2xl p-4 flex items-center justify-between"
            style={{ background: `${color}12`, border: `1px solid ${color}22` }}
          >
            <div>
              <p className="text-3xl font-bold" style={{ color }}>{idea.calories}</p>
              <p className="text-stone-500 text-xs mt-0.5">calories</p>
            </div>
            <div className="text-right">
              <p className="text-stone-300 font-semibold text-lg" style={{ color }}>{idea.macroValue}{idea.unit.split(' ')[0]}</p>
              <p className="text-stone-500 text-xs mt-0.5">{idea.unit}</p>
            </div>
          </div>
        </div>

        {/* Macro breakdown */}
        <div className="px-5 pb-4">
          <p className="text-[10px] text-stone-600 uppercase tracking-wider font-semibold mb-3">Nutrition per serving</p>
          <div className="space-y-2.5">
            <MacroBar label="Protein"  value={idea.protein} unit="g" color="#f87171" max={maxMacro} />
            <MacroBar label="Carbs"    value={idea.carbs}   unit="g" color="#60a5fa" max={maxMacro} />
            <MacroBar label="Fat"      value={idea.fat}     unit="g" color="#c084fc" max={maxMacro} />
            {idea.fiber > 0 && (
              <MacroBar label="Fiber"  value={idea.fiber}   unit="g" color="#34d399" max={maxMacro} />
            )}
          </div>
        </div>

        {/* Fun fact */}
        <div className="mx-5 mb-4 rounded-2xl p-4" style={{ background: 'var(--bg-2,rgba(255,255,255,0.04))', border: '1px solid var(--line,rgba(255,255,255,0.06))' }}>
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <Icon name="i-sparkle" size={12} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-1">Fun fact</p>
              <p className="text-stone-300 text-xs leading-relaxed">{idea.funFact}</p>
            </div>
          </div>
        </div>

        {/* Quick recipe */}
        <div className="mx-5 mb-6 rounded-2xl p-4" style={{ background: `${color}08`, border: `1px solid ${color}1a` }}>
          <div className="flex items-start gap-2.5">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: `${color}22` }}
            >
              <Icon name="i-bowl" size={12} style={{ color }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>Quick recipe</p>
                <span className="text-[9px] text-stone-600 bg-white/5 px-2 py-0.5 rounded-full">{idea.prepTime}</span>
              </div>
              <p className="text-stone-300 text-xs leading-relaxed">{idea.recipe}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface CategoryConfig {
  title:    string;
  icon:     IconName;
  color:    string;
  colorHex: string;
  unit:     string;
  field:    keyof typeof placeholderConsumed;
  ideas:    FoodIdea[];
}

const placeholderConsumed = { protein: 0, carbs: 0, fat: 0, fiber: 0 };

const CATEGORIES: CategoryConfig[] = [
  { title: 'Protein',      icon: 'i-dumbbell', color: 'text-red-400',    colorHex: '#f87171', unit: 'g', field: 'protein', ideas: PROTEIN_IDEAS },
  { title: 'Fiber',        icon: 'i-leaf',     color: 'text-green-400',  colorHex: '#4ade80', unit: 'g', field: 'fiber',   ideas: FIBER_IDEAS   },
  { title: 'Healthy Fats', icon: 'i-drop',     color: 'text-purple-400', colorHex: '#c084fc', unit: 'g', field: 'fat',     ideas: FAT_IDEAS     },
  { title: 'Carbs',        icon: 'i-zap',      color: 'text-blue-400',   colorHex: '#60a5fa', unit: 'g', field: 'carbs',   ideas: CARB_IDEAS    },
];

export default memo(function MacroFoodIdeas({ consumed, targets }: MacroFoodIdeasProps) {
  const { t } = useI18n();
  const [expanded, setExpanded]   = useState(false);
  const [selected, setSelected]   = useState<{ idea: FoodIdea; cat: CategoryConfig } | null>(null);

  const remaining = {
    protein: (targets.protein || 0) - (consumed.protein || 0),
    carbs:   (targets.carbs   || 0) - (consumed.carbs   || 0),
    fat:     (targets.fat     || 0) - (consumed.fat     || 0),
    fiber:   (targets.fiber   || 0) - (consumed.fiber   || 0),
  };

  const hasGaps = remaining.protein > 10 || remaining.fiber > 5 || remaining.fat > 5 || remaining.carbs > 20;
  if (!hasGaps) return null;

  return (
    <>
      <div className="glass p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between"
        >
          <span className="text-sm font-medium text-stone-200 flex items-center gap-1.5">
            <Icon name="i-sparkle" size={14} className="text-[var(--gold-300)]" />
            {t('ideas.title')}
          </span>
          {expanded
            ? <ChevronUp size={14} className="text-stone-500" />
            : <ChevronDown size={14} className="text-stone-500" />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 space-y-4 overflow-hidden"
            >
              {CATEGORIES.map(cat => (
                <MacroCategory
                  key={cat.field}
                  title={cat.title}
                  icon={cat.icon}
                  color={cat.color}
                  remaining={remaining[cat.field]}
                  unit={cat.unit}
                  ideas={cat.ideas}
                  onSelect={idea => setSelected({ idea, cat })}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* WOAH Detail Modal */}
      <AnimatePresence>
        {selected && (
          <FoodDetailModal
            idea={selected.idea}
            color={selected.cat.colorHex}
            icon={selected.cat.icon}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
});
