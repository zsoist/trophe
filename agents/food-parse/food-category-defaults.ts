/**
 * agents/food-parse/food-category-defaults.ts
 *
 * Category-aware macro defaults for ingredients that don't match
 * any food in the DB. Values are per 100g, sourced from USDA
 * category medians. Used by decompose.ts as a fallback instead
 * of the blanket 200 kcal/100g LLM estimation.
 */

export type FoodCategory =
  | 'vegetable' | 'fruit' | 'grain_cereal' | 'bread_baked' | 'legume'
  | 'meat_red' | 'meat_poultry' | 'fish_seafood' | 'dairy_cheese'
  | 'dairy_yogurt' | 'dairy_milk' | 'egg' | 'fat_oil' | 'nut_seed'
  | 'sauce_condiment' | 'sugar_sweet' | 'beverage' | 'generic';

export interface CategoryDefaults {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export const CATEGORY_DEFAULTS: Record<FoodCategory, CategoryDefaults> = {
  vegetable:       { kcal: 35,  protein: 2,   carbs: 6,    fat: 0.5,  fiber: 2.5 },
  fruit:           { kcal: 55,  protein: 0.8, carbs: 13,   fat: 0.3,  fiber: 2   },
  grain_cereal:    { kcal: 340, protein: 10,  carbs: 72,   fat: 2,    fiber: 4   },
  bread_baked:     { kcal: 265, protein: 9,   carbs: 49,   fat: 3.5,  fiber: 2.5 },
  legume:          { kcal: 130, protein: 9,   carbs: 22,   fat: 0.5,  fiber: 7   },
  meat_red:        { kcal: 250, protein: 26,  carbs: 0,    fat: 16,   fiber: 0   },
  meat_poultry:    { kcal: 190, protein: 27,  carbs: 0,    fat: 8,    fiber: 0   },
  fish_seafood:    { kcal: 130, protein: 22,  carbs: 0,    fat: 4,    fiber: 0   },
  dairy_cheese:    { kcal: 300, protein: 20,  carbs: 2,    fat: 24,   fiber: 0   },
  dairy_yogurt:    { kcal: 95,  protein: 5,   carbs: 12,   fat: 3,    fiber: 0   },
  dairy_milk:      { kcal: 62,  protein: 3.2, carbs: 4.8,  fat: 3.3,  fiber: 0   },
  egg:             { kcal: 155, protein: 13,  carbs: 1,    fat: 11,   fiber: 0   },
  fat_oil:         { kcal: 884, protein: 0,   carbs: 0,    fat: 100,  fiber: 0   },
  nut_seed:        { kcal: 600, protein: 18,  carbs: 15,   fat: 52,   fiber: 8   },
  sauce_condiment: { kcal: 80,  protein: 1.5, carbs: 10,   fat: 3.5,  fiber: 0.5 },
  sugar_sweet:     { kcal: 380, protein: 1,   carbs: 85,   fat: 3,    fiber: 0   },
  beverage:        { kcal: 40,  protein: 0,   carbs: 10,   fat: 0,    fiber: 0   },
  generic:         { kcal: 150, protein: 6,   carbs: 18,   fat: 6,    fiber: 2   },
};

// ── Keyword maps ────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Array<[FoodCategory, string[]]> = [
  ['fat_oil', [
    'oil', 'olive oil', 'butter', 'lard', 'ghee', 'margarine', 'shortening',
    'ελαιόλαδο', 'βούτυρο', 'λίπος', 'aceite', 'mantequilla', 'manteca',
  ]],
  ['meat_poultry', [
    'chicken', 'turkey', 'poultry', 'duck', 'hen', 'fowl',
    'κοτόπουλο', 'γαλοπούλα', 'πάπια', 'πουλερικό',
    'pollo', 'pavo', 'pato',
  ]],
  ['meat_red', [
    'beef', 'pork', 'lamb', 'veal', 'goat', 'venison', 'steak', 'ground meat',
    'βοδινό', 'χοιρινό', 'αρνί', 'μοσχάρι', 'κατσίκι', 'κρέας',
    'res', 'cerdo', 'cordero', 'ternera', 'carne',
  ]],
  ['fish_seafood', [
    'fish', 'salmon', 'tuna', 'cod', 'shrimp', 'prawn', 'crab', 'lobster',
    'clam', 'mussel', 'oyster', 'squid', 'octopus', 'sardine', 'anchovy',
    'tilapia', 'trout', 'bass', 'swordfish', 'mackerel', 'haddock', 'seafood',
    'ψάρι', 'σολομός', 'τόνος', 'γαρίδα', 'καλαμάρι', 'χταπόδι', 'μύδια',
    'pescado', 'salmón', 'atún', 'camarón', 'gamba', 'pulpo', 'calamar', 'mariscos',
  ]],
  ['egg', [
    'egg', 'eggs', 'egg white', 'egg yolk',
    'αυγό', 'αυγά',
    'huevo', 'huevos',
  ]],
  ['dairy_cheese', [
    'cheese', 'cheddar', 'mozzarella', 'parmesan', 'brie', 'feta', 'gouda',
    'τυρί', 'φέτα', 'κεφαλοτύρι', 'γραβιέρα', 'μοτσαρέλα',
    'queso', 'queso fresco',
  ]],
  ['dairy_yogurt', [
    'yogurt', 'yoghurt', 'greek yogurt', 'kefir',
    'γιαούρτι', 'κεφίρ',
    'yogur',
  ]],
  ['dairy_milk', [
    'milk', 'cream', 'half and half', 'whipping cream', 'heavy cream',
    'γάλα', 'κρέμα',
    'leche', 'crema', 'nata',
  ]],
  ['bread_baked', [
    'bread', 'pita', 'phyllo', 'tortilla', 'naan', 'baguette', 'ciabatta',
    'croissant', 'bagel', 'roll', 'flatbread', 'bun', 'sourdough',
    'ψωμί', 'πίτα', 'φύλλο',
    'pan', 'tortilla', 'bolillo',
  ]],
  ['grain_cereal', [
    'rice', 'pasta', 'noodle', 'oat', 'oats', 'quinoa', 'couscous', 'barley',
    'bulgur', 'millet', 'cornmeal', 'polenta', 'flour', 'cereal', 'wheat',
    'ρύζι', 'ζυμαρικά', 'βρώμη', 'αλεύρι', 'κινόα',
    'arroz', 'pasta', 'fideos', 'avena', 'harina', 'quinua',
  ]],
  // nut_seed MUST precede legume: classifyIngredient() is first-match substring,
  // and legume's 'pea' would otherwise swallow 'peanut'/'peanut butter' (a ~4.6x
  // calorie / ~100x fat underestimate). 'maní'/'cacahuate' likewise before 'soja'.
  ['nut_seed', [
    'peanut', 'almond', 'walnut', 'cashew', 'pistachio', 'pecan', 'hazelnut',
    'pine nut', 'chia', 'flax', 'sesame', 'sunflower seed', 'pumpkin seed',
    'nut', 'nuts', 'seed', 'seeds', 'tahini',
    'αμύγδαλο', 'καρύδι', 'φιστίκι', 'ταχίνι',
    'almendra', 'nuez', 'maní', 'cacahuate', 'semilla',
  ]],
  ['legume', [
    'bean', 'beans', 'lentil', 'lentils', 'chickpea', 'chickpeas', 'pea', 'peas',
    'soybean', 'tofu', 'tempeh', 'edamame', 'hummus',
    'φασόλι', 'φακές', 'ρεβίθια', 'μπιζέλια',
    'frijol', 'frijoles', 'lenteja', 'lentejas', 'garbanzo', 'soja',
  ]],
  ['vegetable', [
    'tomato', 'onion', 'garlic', 'pepper', 'carrot', 'potato', 'lettuce',
    'spinach', 'broccoli', 'cauliflower', 'zucchini', 'cucumber', 'celery',
    'cabbage', 'kale', 'eggplant', 'mushroom', 'corn', 'pumpkin', 'squash',
    'beet', 'turnip', 'radish', 'asparagus', 'artichoke', 'leek', 'scallion',
    'ντομάτα', 'κρεμμύδι', 'σκόρδο', 'πιπεριά', 'καρότο', 'πατάτα',
    'σπανάκι', 'μπρόκολο', 'κολοκύθι', 'αγγούρι', 'μανιτάρι', 'μελιτζάνα',
    'tomate', 'cebolla', 'ajo', 'pimiento', 'zanahoria', 'papa', 'patata',
    'espinaca', 'brócoli', 'calabacín', 'pepino', 'apio', 'champiñón', 'maíz',
  ]],
  ['fruit', [
    'apple', 'banana', 'orange', 'grape', 'strawberry', 'blueberry', 'mango',
    'pineapple', 'watermelon', 'peach', 'pear', 'cherry', 'plum', 'lemon',
    'lime', 'kiwi', 'papaya', 'avocado', 'coconut', 'fig', 'date', 'raisin',
    'μήλο', 'μπανάνα', 'πορτοκάλι', 'σταφύλι', 'φράουλα', 'ροδάκινο', 'αχλάδι',
    'manzana', 'plátano', 'naranja', 'uva', 'fresa', 'piña', 'durazno', 'pera',
    'limón', 'sandía', 'mango', 'coco', 'higo',
  ]],
  ['sauce_condiment', [
    'sauce', 'salsa', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'soy sauce',
    'vinegar', 'dressing', 'marinade', 'gravy', 'pesto', 'chutney', 'relish',
    'hot sauce', 'sriracha', 'ranch', 'bbq sauce',
    'σάλτσα', 'μουστάρδα', 'μαγιονέζα', 'ξύδι', 'πέστο',
    'salsa', 'mostaza', 'mayonesa', 'vinagre', 'aderezo',
  ]],
  ['sugar_sweet', [
    'sugar', 'honey', 'syrup', 'molasses', 'jam', 'jelly', 'chocolate',
    'candy', 'caramel', 'dulce',
    'ζάχαρη', 'μέλι', 'σιρόπι', 'σοκολάτα', 'μαρμελάδα',
    'azúcar', 'miel', 'jarabe', 'mermelada', 'chocolate', 'caramelo',
  ]],
  ['beverage', [
    'juice', 'soda', 'beer', 'wine', 'coffee', 'tea', 'smoothie', 'milkshake',
    'lemonade', 'cola', 'sprite', 'cocktail',
    'χυμός', 'μπύρα', 'κρασί', 'καφές', 'τσάι',
    'jugo', 'refresco', 'cerveza', 'vino', 'café', 'té',
  ]],
];

// ── Classification ──────────────────────────────────────────────────────────

/**
 * Classify an ingredient name into a food category using keyword matching.
 * Returns 'generic' if no keywords match.
 */
export function classifyIngredient(name: string): FoodCategory {
  const lower = name.toLowerCase().trim();

  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    for (const kw of keywords) {
      // Match as whole word or as substring when the name is short
      if (lower === kw || lower.includes(kw)) {
        return category;
      }
    }
  }

  return 'generic';
}

/**
 * Get macro defaults (per 100g) for an ingredient by classifying its name.
 */
export function getCategoryMacros(name: string): CategoryDefaults {
  return CATEGORY_DEFAULTS[classifyIngredient(name)];
}
