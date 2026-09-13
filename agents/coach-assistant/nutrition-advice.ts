import { z } from 'zod';
import { isParsedFoodItem, type ParsedFoodItem } from '@/agents/schemas/food-parse';
import { FOOD_DIET_PATTERNS } from '@/lib/food/preferences';

/** At most three comparable options, each with 1-4 foods. Both bounds are
 * deliberate: three serial native Food parses of ≤4 foods each stay inside the
 * existing shared phase ceiling (see ADVICE-INTEGRATION.md). */
export const MEAL_ADVICE_MAX_CHOICES=3;
export const MEAL_ADVICE_MAX_FOODS_PER_CHOICE=4;

export const mealAdviceFoodSchema=z.object({
  name:z.string().trim().min(2).max(100),
  grams:z.number().min(10).max(1000),
}).strict();
export type MealAdviceFood=z.infer<typeof mealAdviceFoodSchema>;

export const mealAdviceChoiceSchema=z.object({
  name:z.string().trim().min(2).max(100),
  foods:z.array(mealAdviceFoodSchema).min(1).max(MEAL_ADVICE_MAX_FOODS_PER_CHOICE),
}).strict();
export type MealAdviceChoice=z.infer<typeof mealAdviceChoiceSchema>;

/** One resolved option. `items` are Food's own parsed items — never model prose
 * and never a fabricated macro/account fact. */
export interface EstimatedMeal { name:string; items:ParsedFoodItem[]; }

/** The same authoritative patterns AG1 reads from `response.foodPreference.preferences`. */
export const MEAL_ADVICE_DIET_PATTERNS=FOOD_DIET_PATTERNS;
export type MealAdviceDietPattern=typeof FOOD_DIET_PATTERNS[number];

/** Optional consumer defense constraints. `dietPattern` is AG1's authoritative
 * `FoodPreferences['dietPattern']`; `null`/absent/unknown means "no preference",
 * so no restriction is invented. This is NOT an allergy or medical statement. */
export interface MealAdviceConstraints {
  /** Remaining original-turn time; never extends the request deadline. */
  timeoutMs?: number; dietPattern?:MealAdviceDietPattern|null; }

export type EstimateMealAdvice=(choices:MealAdviceChoice[],language:string,signal:AbortSignal,constraints?:MealAdviceConstraints)=>Promise<EstimatedMeal[]>;

export type MealAdviceLocale='en'|'es'|'el';

export function mealAdviceLocale(language:string):MealAdviceLocale {
  const value=(language??'').trim().toLowerCase();
  if(value.startsWith('el'))return 'el';
  if(value.startsWith('es'))return 'es';
  return 'en';
}

interface AdviceCopy { protein:string; carbs:string; fat:string; estimate:string; unavailable:string; dietUnavailable:string; }
const ADVICE_COPY:Record<MealAdviceLocale,AdviceCopy>={
  en:{protein:'protein',carbs:'carbs',fat:'fat',
    estimate:'Food estimates for comparing options; these are not logged foods.',
    unavailable:'I could not verify any of those options with Food right now, so there are no numbers to show. Nothing was logged.',
    dietUnavailable:'None of those options clearly fit the diet preference saved on your profile, so there are no numbers to show. Nothing was logged.'},
  es:{protein:'proteína',carbs:'carbohidratos',fat:'grasa',
    estimate:'Estimaciones de Food para comparar opciones; no son alimentos registrados.',
    unavailable:'No pude verificar ninguna de esas opciones con Food ahora mismo, así que no hay cifras que mostrar. No se registró nada.',
    dietUnavailable:'Ninguna de esas opciones encaja claramente con la dieta guardada en tu perfil, así que no hay cifras que mostrar. No se registró nada.'},
  el:{protein:'πρωτεΐνη',carbs:'υδατάνθρακες',fat:'λιπαρά',
    estimate:'Εκτιμήσεις από το Food για σύγκριση επιλογών; δεν είναι καταγεγραμμένα τρόφιμα.',
    unavailable:'Δεν μπόρεσα να επαληθεύσω καμία από αυτές τις επιλογές με το Food αυτή τη στιγμή, οπότε δεν υπάρχουν αριθμοί να δείξω. Δεν καταγράφηκε τίποτα.',
    dietUnavailable:'Καμία από αυτές τις επιλογές δεν ταιριάζει σαφώς με τη διατροφή που είναι αποθηκευμένη στο προφίλ σου, οπότε δεν υπάρχουν αριθμοί να δείξω. Δεν καταγράφηκε τίποτα.'},
};

/** Honest, non-success copy for the caller when no option could be verified. */
export function mealAdviceUnavailableMessage(language:string):string {
  return ADVICE_COPY[mealAdviceLocale(language)].unavailable;
}

/** Honest, non-success copy when every verified option was withheld for a clear
 * conflict with the saved diet pattern. Distinct from `mealAdviceUnavailableMessage`. */
export function mealAdviceDietUnavailableMessage(language:string):string {
  return ADVICE_COPY[mealAdviceLocale(language)].dietUnavailable;
}

function verifiedItems(items:unknown):ParsedFoodItem[] {
  return Array.isArray(items)?items.filter((item):item is ParsedFoodItem=>isParsedFoodItem(item)):[];
}

// ── Diet-pattern consumer defense ───────────────────────────────────────────
// Only UNAMBIGUOUS whole-word animal keywords are treated as a clear conflict.
// `classifyIngredient` is deliberately NOT used here: its substring matching maps
// 'eggplant' → egg and 'coconut milk' → dairy, which would withhold safe plant
// options. Plant homonyms ('milk', 'cream', 'butter' and their ES/EL equivalents)
// and hidden ingredients are left unflagged, so this is a name-level guard, NOT a
// semantic or allergy proof. Each group lists the clear ES and EL forms too:
// `food_name` is the canonical English name, but the known Food contract keeps
// some composite dishes in Spanish/Greek (e.g. food_name 'arroz con pollo'), so a
// localized or composite name must be inspected on par with the canonical one.
const DIET_MEAT_WORDS=['beef','pork','lamb','veal','goat','venison','steak','chicken','turkey','duck','goose','bacon','ham','sausage','salami','pepperoni','prosciutto','chorizo','meat','meatball','meatballs','mince','brisket','ribeye','tenderloin',
 'pollo','pavo','res','carne','cerdo','chancho','cochinillo','cordero','ternera','puerco','pato','jamón','jamon','salchicha','salchichas','tocino','conejo','bistec','lomo','albóndiga','albóndigas','milanesa',
 'κοτόπουλο','κοτοπουλο','μοσχάρι','μοσχαρι','χοιρινό','χοιρινο','αρνί','αρνι','κατσίκι','κατσικι','κρέας','κρεας','μπριζόλα','μπριζολα','λουκάνικο','λουκανικο','ζαμπόν','ζαμπον','πάπια','παπια','γαλοπούλα','γαλοπουλα','κιμάς','κιμας','σουβλάκι','σουβλακι','γύρος','γυρος','σαλάμι','σαλαμι','προσούτο','προσουτο'] as const;
const DIET_FISH_WORDS=['fish','salmon','tuna','cod','shrimp','prawn','prawns','crab','lobster','clam','clams','mussel','mussels','oyster','oysters','squid','octopus','sardine','sardines','anchovy','anchovies','tilapia','trout','bass','swordfish','mackerel','haddock','seafood','herring','catfish','perch','scallop','scallops','worcestershire',
 'pescado','marisco','mariscos','camarón','camaron','camarones','gamba','gambas','langostino','langostinos','atún','atun','salmón','salmon','sardina','sardinas','anchoa','anchoas','trucha','bacalao','pulpo','calamar','calamares','mejillón','mejillon','mejillones','almeja','almejas','ostión','ostion','ostiones','cangrejo','langosta','arenque','rodaballo',
 'ψάρι','ψαρι','ψάρια','ψαρια','σαρδέλα','σαρδελα','τόνος','τονος','σολομός','σολομος','γαρίδα','γαριδα','γαρίδες','γαριδες','χταπόδι','χταποδι','καλαμάρι','καλαμαρι','μύδι','μυδι','θαλασσινά','θαλασσινα','λαβράκι','λαβρακι','πέστροφα','πεστροφα','ρέγκα','ρεγκα'] as const;
const DIET_EGG_DAIRY_WORDS=['egg','eggs','omelet','omelette','cheese','cheddar','mozzarella','parmesan','brie','feta','gouda','yogurt','yoghurt','kefir','whey','casein','ghee','mascarpone','ricotta',
 'huevo','huevos','queso','yogur','requesón','requeson','cuajada',
 'αυγό','αυγο','αυγά','αυγα','τυρί','τυρι','γιαούρτι','γιαουρτι','ομελέτα','ομελετα'] as const;

const DIET_ANIMAL_WORDS:Record<MealAdviceDietPattern,readonly string[]>={
  omnivore:[],
  pescatarian:DIET_MEAT_WORDS,
  vegetarian:[...DIET_MEAT_WORDS,...DIET_FISH_WORDS],
  vegan:[...DIET_MEAT_WORDS,...DIET_FISH_WORDS,...DIET_EGG_DAIRY_WORDS],
};

function dietWords(dietPattern:MealAdviceDietPattern|null|undefined):readonly string[]|null {
  if(!dietPattern)return null;
  return DIET_ANIMAL_WORDS[dietPattern]??null;
}

/** Returns the given Food name when it is a CLEAR conflict with `dietPattern`,
 * otherwise null. `null`/absent/'omnivore' (and an unknown pattern) never invent
 * a restriction. Whole-word matching only — see the limitation note above. */
export function dietConflictingFoodName(name:string,dietPattern:MealAdviceDietPattern|null|undefined):string|null {
  const words=dietWords(dietPattern);
  if(!words||words.length===0)return null;
  const tokens=new Set((typeof name==='string'?name:'').toLowerCase().split(/[^\p{L}]+/u).filter(Boolean));
  if(tokens.size===0)return null;
  for(const word of words){if(tokens.has(word))return name;}
  return null;
}

/** True when an option contains no clear conflict with the requested pattern.
 * BOTH names are inspected: the canonical `food_name` (English, or a kept
 * composite form) AND the `name_localized` display form, so a localized label
 * can never smuggle a conflict past the canonical name. */
export function mealFitsDiet(items:ReadonlyArray<ParsedFoodItem>,dietPattern:MealAdviceDietPattern|null|undefined):boolean {
  if(!dietWords(dietPattern)?.length)return true;
  return !items.some(item=>dietConflictingFoodName(item.name_localized,dietPattern)!==null
    ||dietConflictingFoodName(item.food_name,dietPattern)!==null);
}

// Model-authored option titles are presentation-only and must never read as an
// invented macro/account fact, a logged receipt or an instruction. A title that
// trips this guard is replaced by the verified Food item names; the option is
// never dropped for its title alone. This is a display guard, not a semantic one.
const ADVICE_LABEL_UNSAFE=/[\d\r\n\t*_`<>\[\]{}@]|kcal|calorie|carbohydrate|\bcarbs?\b|\bprotein\b|\bfats?\b|grams?|\blog\b|\blogged\b|\bdiary\b|receipt|\brecord(ed)?\b|\bsaved?\b|\bate\b|consum|\bclick\b|\btap\b|\bvisit\b|\bdelete\b|\bbuy\b|\border\b|\benter\b|\bignore\b|\binstructions?\b|\bprompts?\b|\bsystem\b|\byou\b|\byour\b|https?:|www\./i;

function foodItemLabels(items:ReadonlyArray<ParsedFoodItem>):string {
  return items.map(item=>(item.name_localized||item.food_name).trim()).filter(Boolean).join(' + ');
}

/** The safe option label to render. Prefers the model title when it is plain, and
 * falls back to the verified Food item names when it is not. */
export function adviceOptionLabel(name:string,items:ReadonlyArray<ParsedFoodItem>):string {
  const title=typeof name==='string'?name.trim():'';
  if(title&&!ADVICE_LABEL_UNSAFE.test(title))return title;
  return foodItemLabels(items)||title;
}

/** Nutrition comes exclusively from Food's parsed items, never model prose.
 * Options whose items are not demonstrably valid Food items are omitted rather
 * than padded with example numbers; an all-invalid result renders as '' so the
 * caller cannot present an empty success. No macro is rounded into existence:
 * any non-finite sum drops that option. Nothing here writes or logs a food. */
export function renderMealAdvice(meals:ReadonlyArray<EstimatedMeal>,language:string):string {
  const locale=mealAdviceLocale(language);
  const copy=ADVICE_COPY[locale];
  const format=new Intl.NumberFormat(locale,{maximumFractionDigits:1});
  const lines:string[]=[];
  for(const meal of Array.isArray(meals)?meals:[]){
    const name=typeof meal?.name==='string'?meal.name.trim():'';
    const items=verifiedItems(meal?.items);
    if(!name||items.length===0)continue;
    const sum=(key:'calories'|'protein_g'|'carbs_g'|'fat_g')=>items.reduce((total,item)=>total+item[key],0);
    const totals=[sum('calories'),sum('protein_g'),sum('carbs_g'),sum('fat_g')];
    // An item can pass the shape check yet carry a poisoned aggregate; never
    // print NaN/Infinity as if it were a measured total.
    if(!totals.every(value=>typeof value==='number'&&Number.isFinite(value)))continue;
    const n=(value:number)=>format.format(value);
    const estimated=items.some(item=>item.source!=='local_db');
    // The option label is never trusted as data: a hostile/adversarial model title
    // is replaced by the verified Food item names (numbers still come from Food).
    const label=adviceOptionLabel(name,items);
    const foods=items.map(item=>`${item.name_localized||item.food_name} (${n(item.grams)} g)`).join(', ');
    lines.push(`${lines.length+1}. **${label}**: ${foods}. **${estimated?'≈':''}${n(totals[0])} kcal** · ${n(totals[1])} g ${copy.protein} · ${n(totals[2])} g ${copy.carbs} · ${n(totals[3])} g ${copy.fat}.`);
  }
  if(lines.length===0)return '';
  return `${lines.join('\n')}\n\n${copy.estimate}`;
}
