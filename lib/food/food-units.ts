// ═══════════════════════════════════════════════
// τροφή (Trophē) — Food Unit Dictionary
// Greek units from Kavdas nutrition plan + common serving sizes
// ═══════════════════════════════════════════════

export interface FoodUnit {
  name: string;
  grams: number;
}

export interface FoodEntry {
  name_en: string;
  name_el: string;
  name_es: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
  default_unit: string;
  default_grams: number;
  common_units: FoodUnit[];
  category: string;
}

// Greek measurement unit dictionary (from Kavdas plan)
export const GREEK_UNITS: Record<string, { en: string; grams_approx: number; description: string }> = {
  'κ.σ.': { en: 'tablespoon', grams_approx: 14, description: 'κουταλιά σούπας' },
  'κ.γ.': { en: 'teaspoon', grams_approx: 5, description: 'κουταλιά γλυκού' },
  'φλ': { en: 'cup', grams_approx: 100, description: 'φλιτζάνι (cooked grains ~100g)' },
  'γρ': { en: 'grams', grams_approx: 1, description: 'γραμμάρια' },
  'φέτα': { en: 'slice', grams_approx: 30, description: 'φέτα (bread ~30g, cheese ~20g)' },
  'παλάμη': { en: 'palm', grams_approx: 120, description: 'παλάμη (palm-sized portion of meat/fish)' },
  'γροθιά': { en: 'fistful', grams_approx: 75, description: 'γροθιά (fist-sized portion)' },
  'χούφτα': { en: 'handful', grams_approx: 30, description: 'χούφτα (handful, ~30g nuts/dried fruit)' },
  'scoop': { en: 'scoop', grams_approx: 30, description: 'protein powder scoop' },
};

// Common foods database — sourced from Kavdas plan + USDA reference values
// All nutritional values are per 100g unless noted
export const FOOD_DATABASE: FoodEntry[] = [
  // ═══ PROTEINS ═══
  {
    name_en: 'Egg, whole', name_el: 'Αυγό', name_es: 'Huevo',
    calories_per_100g: 143, protein_per_100g: 12.6, carbs_per_100g: 0.7, fat_per_100g: 9.5, fiber_per_100g: 0,
    default_unit: 'piece', default_grams: 50,
    common_units: [{ name: 'piece', grams: 50 }, { name: 'large', grams: 56 }],
    category: 'protein',
  },
  {
    name_en: 'Egg white', name_el: 'Ασπράδι αυγού', name_es: 'Clara de huevo',
    calories_per_100g: 52, protein_per_100g: 10.9, carbs_per_100g: 0.7, fat_per_100g: 0.2, fiber_per_100g: 0,
    default_unit: 'piece', default_grams: 33,
    common_units: [{ name: 'piece', grams: 33 }],
    category: 'protein',
  },
  {
    name_en: 'Chicken breast, grilled', name_el: 'Στήθος κοτόπουλο ψητό', name_es: 'Pechuga de pollo a la plancha',
    calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6, fiber_per_100g: 0,
    default_unit: 'palm', default_grams: 120,
    common_units: [{ name: 'palm', grams: 120 }, { name: 'large', grams: 175 }],
    category: 'protein',
  },
  {
    name_en: 'Beef patty, grilled', name_el: 'Μπιφτέκι μοσχαρίσιο ψητό', name_es: 'Hamburguesa de res a la plancha',
    calories_per_100g: 250, protein_per_100g: 26, carbs_per_100g: 0, fat_per_100g: 15, fiber_per_100g: 0,
    default_unit: 'piece', default_grams: 100,
    common_units: [{ name: 'piece', grams: 100 }],
    category: 'protein',
  },
  {
    name_en: 'Steak, grilled', name_el: 'Μπριζόλα ψητή', name_es: 'Bistec a la plancha',
    calories_per_100g: 271, protein_per_100g: 26, carbs_per_100g: 0, fat_per_100g: 18, fiber_per_100g: 0,
    default_unit: 'piece', default_grams: 150,
    common_units: [{ name: 'piece', grams: 150 }, { name: 'palm', grams: 120 }, { name: '200g', grams: 200 }],
    category: 'protein',
  },
  {
    name_en: 'Smoked salmon', name_el: 'Σολομός καπνιστός', name_es: 'Salmón ahumado',
    calories_per_100g: 117, protein_per_100g: 18, carbs_per_100g: 0, fat_per_100g: 4.3, fiber_per_100g: 0,
    default_unit: 'palm', default_grams: 120,
    common_units: [{ name: 'palm', grams: 120 }, { name: 'slice', grams: 30 }],
    category: 'protein',
  },
  {
    name_en: 'Salmon, grilled', name_el: 'Σολομός ψητός', name_es: 'Salmón a la plancha',
    calories_per_100g: 208, protein_per_100g: 20, carbs_per_100g: 0, fat_per_100g: 13, fiber_per_100g: 0,
    default_unit: 'palm', default_grams: 120,
    common_units: [{ name: 'palm', grams: 120 }, { name: 'large', grams: 150 }],
    category: 'protein',
  },
  {
    name_en: 'Chicken souvlaki', name_el: 'Καλαμάκι κοτόπουλο', name_es: 'Souvlaki de pollo',
    calories_per_100g: 160, protein_per_100g: 21, carbs_per_100g: 2, fat_per_100g: 7, fiber_per_100g: 0,
    default_unit: 'skewer', default_grams: 80,
    common_units: [{ name: 'skewer', grams: 80 }],
    category: 'protein',
  },
  {
    name_en: 'Protein powder', name_el: 'Πρωτεΐνη σκόνη', name_es: 'Proteína en polvo',
    calories_per_100g: 380, protein_per_100g: 75, carbs_per_100g: 10, fat_per_100g: 5, fiber_per_100g: 0,
    default_unit: 'scoop', default_grams: 30,
    common_units: [{ name: 'scoop', grams: 30 }, { name: 'half_scoop', grams: 15 }],
    category: 'protein',
  },

  // ═══ DAIRY ═══
  {
    name_en: 'Feta cheese', name_el: 'Φέτα τυρί', name_es: 'Queso feta',
    calories_per_100g: 264, protein_per_100g: 14, carbs_per_100g: 4, fat_per_100g: 21, fiber_per_100g: 0,
    default_unit: 'serving', default_grams: 30,
    common_units: [{ name: 'slice', grams: 20 }, { name: 'serving', grams: 30 }, { name: '60g', grams: 60 }],
    category: 'dairy',
  },
  {
    name_en: 'Feta light', name_el: 'Φέτα light', name_es: 'Queso feta light',
    calories_per_100g: 180, protein_per_100g: 18, carbs_per_100g: 4, fat_per_100g: 10, fiber_per_100g: 0,
    default_unit: 'serving', default_grams: 30,
    common_units: [{ name: 'serving', grams: 30 }, { name: '60g', grams: 60 }, { name: 'slice', grams: 20 }],
    category: 'dairy',
  },
  {
    name_en: 'Greek yogurt 2%', name_el: 'Γιαούρτι 2%', name_es: 'Yogur griego 2%',
    calories_per_100g: 73, protein_per_100g: 10, carbs_per_100g: 3.6, fat_per_100g: 2, fiber_per_100g: 0,
    default_unit: 'serving', default_grams: 150,
    common_units: [{ name: 'serving', grams: 150 }, { name: 'cup', grams: 200 }],
    category: 'dairy',
  },
  {
    name_en: 'Cottage cheese', name_el: 'Cottage', name_es: 'Requesón',
    calories_per_100g: 98, protein_per_100g: 11, carbs_per_100g: 3.4, fat_per_100g: 4.3, fiber_per_100g: 0,
    default_unit: 'serving', default_grams: 100,
    common_units: [{ name: 'serving', grams: 100 }, { name: 'half', grams: 50 }],
    category: 'dairy',
  },
  {
    name_en: 'Halloumi cheese', name_el: 'Χαλούμι', name_es: 'Queso halloumi',
    calories_per_100g: 320, protein_per_100g: 22, carbs_per_100g: 3, fat_per_100g: 25, fiber_per_100g: 0,
    default_unit: 'slice', default_grams: 30,
    common_units: [{ name: 'slice', grams: 30 }],
    category: 'dairy',
  },
  {
    name_en: 'Cheese slices', name_el: 'Φέτες τυρί', name_es: 'Lonchas de queso',
    calories_per_100g: 330, protein_per_100g: 22, carbs_per_100g: 2, fat_per_100g: 26, fiber_per_100g: 0,
    default_unit: 'slice', default_grams: 20,
    common_units: [{ name: 'slice', grams: 20 }],
    category: 'dairy',
  },
  {
    name_en: 'Philadelphia cream cheese', name_el: 'Φιλαδέλφεια', name_es: 'Queso crema Philadelphia',
    calories_per_100g: 342, protein_per_100g: 6, carbs_per_100g: 4, fat_per_100g: 34, fiber_per_100g: 0,
    default_unit: 'tbsp', default_grams: 14,
    common_units: [{ name: 'tbsp', grams: 14 }],
    category: 'dairy',
  },
  {
    name_en: 'Frozen yogurt', name_el: 'Παγωτό γιαούρτι', name_es: 'Yogur helado',
    calories_per_100g: 127, protein_per_100g: 3, carbs_per_100g: 22, fat_per_100g: 3, fiber_per_100g: 0,
    default_unit: 'ball', default_grams: 70,
    common_units: [{ name: 'ball', grams: 70 }],
    category: 'dairy',
  },
  {
    name_en: 'Milk', name_el: 'Γάλα', name_es: 'Leche',
    calories_per_100g: 42, protein_per_100g: 3.4, carbs_per_100g: 5, fat_per_100g: 1, fiber_per_100g: 0,
    default_unit: 'glass', default_grams: 200,
    common_units: [{ name: 'glass', grams: 200 }, { name: 'half_glass', grams: 100 }],
    category: 'dairy',
  },

  // ═══ CARBS / GRAINS ═══
  {
    name_en: 'Whole wheat bread', name_el: 'Ψωμί ολικής', name_es: 'Pan integral',
    calories_per_100g: 247, protein_per_100g: 13, carbs_per_100g: 41, fat_per_100g: 3.4, fiber_per_100g: 7,
    default_unit: 'slice', default_grams: 30,
    common_units: [{ name: 'slice', grams: 30 }],
    category: 'carb',
  },
  {
    name_en: 'White rice, cooked', name_el: 'Ρύζι λευκό μαγειρεμένο', name_es: 'Arroz blanco cocido',
    calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3, fiber_per_100g: 0.4,
    default_unit: 'serving', default_grams: 150,
    common_units: [{ name: 'serving', grams: 150 }, { name: 'φλ', grams: 100 }],
    category: 'carb',
  },
  {
    name_en: 'Quinoa, cooked', name_el: 'Κινόα μαγειρεμένη', name_es: 'Quinoa cocida',
    calories_per_100g: 120, protein_per_100g: 4.4, carbs_per_100g: 21, fat_per_100g: 1.9, fiber_per_100g: 2.8,
    default_unit: 'serving', default_grams: 150,
    common_units: [{ name: 'serving', grams: 150 }, { name: 'φλ', grams: 100 }],
    category: 'carb',
  },
  {
    name_en: 'Pasta, cooked', name_el: 'Μακαρόνια μαγειρεμένα', name_es: 'Pasta cocida',
    calories_per_100g: 131, protein_per_100g: 5, carbs_per_100g: 25, fat_per_100g: 1.1, fiber_per_100g: 1.8,
    default_unit: 'serving', default_grams: 150,
    common_units: [{ name: 'serving', grams: 150 }, { name: 'φλ', grams: 100 }],
    category: 'carb',
  },
  {
    name_en: 'Oats', name_el: 'Βρώμη', name_es: 'Avena',
    calories_per_100g: 389, protein_per_100g: 17, carbs_per_100g: 66, fat_per_100g: 7, fiber_per_100g: 11,
    default_unit: 'cup', default_grams: 40,
    common_units: [{ name: 'cup', grams: 40 }],
    category: 'carb',
  },
  {
    name_en: 'Potato, roasted', name_el: 'Πατάτα ψητή', name_es: 'Papa asada',
    calories_per_100g: 93, protein_per_100g: 2.5, carbs_per_100g: 21, fat_per_100g: 0.1, fiber_per_100g: 2.2,
    default_unit: 'fistful', default_grams: 75,
    common_units: [{ name: 'medium', grams: 150 }, { name: 'fistful', grams: 75 }],
    category: 'carb',
  },
  {
    name_en: 'Pita bread', name_el: 'Πίτα', name_es: 'Pan pita',
    calories_per_100g: 275, protein_per_100g: 9.1, carbs_per_100g: 55, fat_per_100g: 1.2, fiber_per_100g: 2.2,
    default_unit: 'piece', default_grams: 60,
    common_units: [{ name: 'piece', grams: 60 }],
    category: 'carb',
  },
  {
    name_en: 'Toast (2 slices whole wheat)', name_el: 'Τοστ', name_es: 'Tostada',
    calories_per_100g: 247, protein_per_100g: 13, carbs_per_100g: 41, fat_per_100g: 3.4, fiber_per_100g: 7,
    default_unit: 'serving', default_grams: 60,
    common_units: [{ name: 'serving', grams: 60 }],
    category: 'carb',
  },
  {
    name_en: 'Rusks, whole wheat', name_el: 'Παξιμάδια ολικής', name_es: 'Bizcocho integral',
    calories_per_100g: 380, protein_per_100g: 11, carbs_per_100g: 70, fat_per_100g: 5, fiber_per_100g: 6,
    default_unit: 'piece', default_grams: 40,
    common_units: [{ name: 'large', grams: 40 }, { name: 'piece', grams: 40 }],
    category: 'carb',
  },

  // ═══ FATS ═══
  {
    name_en: 'Olive oil', name_el: 'Ελαιόλαδο', name_es: 'Aceite de oliva',
    calories_per_100g: 884, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 100, fiber_per_100g: 0,
    default_unit: 'tbsp', default_grams: 14,
    common_units: [{ name: 'tbsp', grams: 14 }, { name: 'tsp', grams: 5 }],
    category: 'fat',
  },
  {
    name_en: 'Peanut butter', name_el: 'Φυστικοβούτυρο', name_es: 'Mantequilla de maní',
    calories_per_100g: 588, protein_per_100g: 25, carbs_per_100g: 20, fat_per_100g: 50, fiber_per_100g: 6,
    default_unit: 'tbsp', default_grams: 14,
    common_units: [{ name: 'tbsp', grams: 14 }, { name: 'tsp', grams: 5 }],
    category: 'fat',
  },
  {
    name_en: 'Butter', name_el: 'Βούτυρο', name_es: 'Mantequilla',
    calories_per_100g: 717, protein_per_100g: 0.9, carbs_per_100g: 0.1, fat_per_100g: 81, fiber_per_100g: 0,
    default_unit: 'tbsp', default_grams: 14,
    common_units: [{ name: 'tbsp', grams: 14 }, { name: 'tsp', grams: 5 }],
    category: 'fat',
  },
  {
    name_en: 'Avocado', name_el: 'Αβοκάντο', name_es: 'Aguacate',
    calories_per_100g: 160, protein_per_100g: 2, carbs_per_100g: 8.5, fat_per_100g: 15, fiber_per_100g: 7,
    default_unit: 'half', default_grams: 70,
    common_units: [{ name: 'half', grams: 70 }, { name: 'whole', grams: 140 }],
    category: 'fat',
  },
  {
    name_en: 'Mixed nuts', name_el: 'Ξηροί καρποί', name_es: 'Frutos secos',
    calories_per_100g: 607, protein_per_100g: 20, carbs_per_100g: 21, fat_per_100g: 54, fiber_per_100g: 7,
    default_unit: 'handful', default_grams: 30,
    common_units: [{ name: 'handful', grams: 30 }, { name: 'cup', grams: 140 }],
    category: 'fat',
  },
  {
    name_en: 'Dried fruits', name_el: 'Αποξηραμένα φρούτα', name_es: 'Frutas secas',
    calories_per_100g: 359, protein_per_100g: 3, carbs_per_100g: 83, fat_per_100g: 0.5, fiber_per_100g: 7,
    default_unit: 'handful', default_grams: 30,
    common_units: [{ name: 'handful', grams: 30 }, { name: 'cup', grams: 140 }],
    category: 'fat',
  },
  {
    name_en: 'Tahini', name_el: 'Ταχίνι', name_es: 'Tahini',
    calories_per_100g: 595, protein_per_100g: 17, carbs_per_100g: 21, fat_per_100g: 54, fiber_per_100g: 10,
    default_unit: 'tbsp', default_grams: 14,
    common_units: [{ name: 'tbsp', grams: 14 }],
    category: 'fat',
  },

  // ═══ FRUITS ═══
  {
    name_en: 'Banana', name_el: 'Μπανάνα', name_es: 'Plátano',
    calories_per_100g: 89, protein_per_100g: 1.1, carbs_per_100g: 23, fat_per_100g: 0.3, fiber_per_100g: 2.6,
    default_unit: 'piece', default_grams: 120,
    common_units: [{ name: 'piece', grams: 120 }],
    category: 'fruit',
  },
  {
    name_en: 'Apple', name_el: 'Μήλο', name_es: 'Manzana',
    calories_per_100g: 52, protein_per_100g: 0.3, carbs_per_100g: 14, fat_per_100g: 0.2, fiber_per_100g: 2.4,
    default_unit: 'piece', default_grams: 180,
    common_units: [{ name: 'piece', grams: 180 }],
    category: 'fruit',
  },
  {
    name_en: 'Orange', name_el: 'Πορτοκάλι', name_es: 'Naranja',
    calories_per_100g: 47, protein_per_100g: 0.9, carbs_per_100g: 12, fat_per_100g: 0.1, fiber_per_100g: 2.4,
    default_unit: 'piece', default_grams: 130,
    common_units: [{ name: 'piece', grams: 130 }],
    category: 'fruit',
  },
  {
    name_en: 'Fruit (generic)', name_el: 'Φρούτο', name_es: 'Fruta',
    calories_per_100g: 55, protein_per_100g: 0.7, carbs_per_100g: 14, fat_per_100g: 0.2, fiber_per_100g: 2,
    default_unit: 'piece', default_grams: 150,
    common_units: [{ name: 'piece', grams: 150 }],
    category: 'fruit',
  },

  // ═══ VEGETABLES ═══
  {
    name_en: 'Salad / roasted vegetables', name_el: 'Σαλάτα / ψητά λαχανικά', name_es: 'Ensalada / verduras asadas',
    calories_per_100g: 30, protein_per_100g: 1.5, carbs_per_100g: 5, fat_per_100g: 0.5, fiber_per_100g: 2.5,
    default_unit: 'serving', default_grams: 200,
    common_units: [{ name: 'serving', grams: 200 }],
    category: 'vegetable',
  },
  {
    name_en: 'Spinach', name_el: 'Σπανάκι', name_es: 'Espinaca',
    calories_per_100g: 23, protein_per_100g: 2.9, carbs_per_100g: 3.6, fat_per_100g: 0.4, fiber_per_100g: 2.2,
    default_unit: 'cup', default_grams: 30,
    common_units: [{ name: 'cup', grams: 30 }],
    category: 'vegetable',
  },
  {
    name_en: 'Broccoli', name_el: 'Μπρόκολο', name_es: 'Brócoli',
    calories_per_100g: 34, protein_per_100g: 2.8, carbs_per_100g: 7, fat_per_100g: 0.4, fiber_per_100g: 2.6,
    default_unit: 'cup', default_grams: 90,
    common_units: [{ name: 'cup', grams: 90 }],
    category: 'vegetable',
  },
  {
    name_en: 'Tomato', name_el: 'Ντομάτα', name_es: 'Tomate',
    calories_per_100g: 18, protein_per_100g: 0.9, carbs_per_100g: 3.9, fat_per_100g: 0.2, fiber_per_100g: 1.2,
    default_unit: 'piece', default_grams: 120,
    common_units: [{ name: 'piece', grams: 120 }],
    category: 'vegetable',
  },

  // ═══ LEGUMES ═══
  {
    name_en: 'Green beans (fasolakia)', name_el: 'Φασολάκια', name_es: 'Judías verdes',
    calories_per_100g: 35, protein_per_100g: 1.8, carbs_per_100g: 7, fat_per_100g: 0.1, fiber_per_100g: 3.4,
    default_unit: 'cup', default_grams: 125,
    common_units: [{ name: 'cup', grams: 125 }, { name: 'φλ', grams: 125 }],
    category: 'legume',
  },
  {
    name_en: 'Peas', name_el: 'Αρακάς', name_es: 'Guisantes',
    calories_per_100g: 81, protein_per_100g: 5.4, carbs_per_100g: 14, fat_per_100g: 0.4, fiber_per_100g: 5,
    default_unit: 'cup', default_grams: 130,
    common_units: [{ name: 'cup', grams: 130 }],
    category: 'legume',
  },
  {
    name_en: 'Hummus', name_el: 'Χούμους', name_es: 'Hummus',
    calories_per_100g: 166, protein_per_100g: 8, carbs_per_100g: 14, fat_per_100g: 10, fiber_per_100g: 6,
    default_unit: 'tbsp', default_grams: 14,
    common_units: [{ name: 'tbsp', grams: 14 }, { name: 'serving', grams: 50 }],
    category: 'legume',
  },

  // ═══ GREEK DISHES ═══
  {
    name_en: 'Briam (mixed roasted vegetables)', name_el: 'Μπριάμ', name_es: 'Verduras asadas griegas',
    calories_per_100g: 80, protein_per_100g: 1.5, carbs_per_100g: 10, fat_per_100g: 4, fiber_per_100g: 2.5,
    default_unit: 'serving', default_grams: 200,
    common_units: [{ name: 'serving', grams: 200 }],
    category: 'greek',
  },
  {
    name_en: 'Moussaka', name_el: 'Μουσακάς', name_es: 'Musaca',
    calories_per_100g: 140, protein_per_100g: 7, carbs_per_100g: 10, fat_per_100g: 8, fiber_per_100g: 1.5,
    default_unit: 'serving', default_grams: 200,
    common_units: [{ name: 'serving', grams: 200 }],
    category: 'greek',
  },
  {
    name_en: 'Pesto sauce', name_el: 'Πέστο', name_es: 'Pesto',
    calories_per_100g: 418, protein_per_100g: 6, carbs_per_100g: 6, fat_per_100g: 41, fiber_per_100g: 2,
    default_unit: 'tbsp', default_grams: 14,
    common_units: [{ name: 'tbsp', grams: 14 }],
    category: 'condiment',
  },
  {
    name_en: 'Greek salad (Ntakos)', name_el: 'Σαλάτα Ντάκος', name_es: 'Ensalada Dakos',
    calories_per_100g: 150, protein_per_100g: 5, carbs_per_100g: 18, fat_per_100g: 6, fiber_per_100g: 2,
    default_unit: 'serving', default_grams: 250,
    common_units: [{ name: 'serving', grams: 250 }],
    category: 'greek',
  },

  // ═══ BEVERAGES ═══
  {
    name_en: 'Coffee, black', name_el: 'Καφές σκέτος', name_es: 'Café negro',
    calories_per_100g: 2, protein_per_100g: 0.3, carbs_per_100g: 0, fat_per_100g: 0, fiber_per_100g: 0,
    default_unit: 'cup', default_grams: 240,
    common_units: [{ name: 'cup', grams: 240 }],
    category: 'beverage',
  },
  {
    name_en: 'Coffee with milk', name_el: 'Καφές με γάλα', name_es: 'Café con leche',
    calories_per_100g: 20, protein_per_100g: 1, carbs_per_100g: 2, fat_per_100g: 0.7, fiber_per_100g: 0,
    default_unit: 'cup', default_grams: 240,
    common_units: [{ name: 'cup', grams: 240 }],
    category: 'beverage',
  },

  // ═══ SNACKS / OTHER ═══
  {
    name_en: 'Protein bar', name_el: 'Μπάρα πρωτεΐνης', name_es: 'Barra de proteína',
    calories_per_100g: 350, protein_per_100g: 27, carbs_per_100g: 35, fat_per_100g: 12, fiber_per_100g: 5,
    default_unit: 'piece', default_grams: 55,
    common_units: [{ name: 'piece', grams: 55 }],
    category: 'snack',
  },
  {
    name_en: 'Dark chocolate (health)', name_el: 'Σοκολάτα υγείας', name_es: 'Chocolate negro',
    calories_per_100g: 546, protein_per_100g: 5, carbs_per_100g: 60, fat_per_100g: 31, fiber_per_100g: 7,
    default_unit: 'piece', default_grams: 20,
    common_units: [{ name: 'piece', grams: 20 }, { name: 'square', grams: 10 }],
    category: 'snack',
  },
  {
    name_en: 'Honey', name_el: 'Μέλι', name_es: 'Miel',
    calories_per_100g: 304, protein_per_100g: 0.3, carbs_per_100g: 82, fat_per_100g: 0, fiber_per_100g: 0,
    default_unit: 'tsp', default_grams: 7,
    common_units: [{ name: 'tsp', grams: 7 }, { name: 'tbsp', grams: 14 }],
    category: 'condiment',
  },
  {
    name_en: 'Tortilla / wrap', name_el: 'Τυλιχτό / πίτα', name_es: 'Tortilla / wrap',
    calories_per_100g: 310, protein_per_100g: 8, carbs_per_100g: 50, fat_per_100g: 8, fiber_per_100g: 3,
    default_unit: 'piece', default_grams: 65,
    common_units: [{ name: 'piece', grams: 65 }],
    category: 'carb',
  },
];

// Build a lookup prompt for the AI parser — includes all food names in all languages
export function buildFoodReferencePrompt(): string {
  const lines = FOOD_DATABASE.map(f => {
    const units = f.common_units.map(u => `${u.name}=${u.grams}g`).join(', ');
    return `- ${f.name_en} | ${f.name_el} | ${f.name_es} → per 100g: ${f.calories_per_100g}cal ${f.protein_per_100g}P ${f.carbs_per_100g}C ${f.fat_per_100g}F | units: ${units}`;
  });

  const unitLines = Object.entries(GREEK_UNITS).map(
    ([key, val]) => `- ${key} (${val.description}) = ${val.en} ≈ ${val.grams_approx}g`
  );

  return `## Food Reference Database\n${lines.join('\n')}\n\n## Greek Measurement Units\n${unitLines.join('\n')}`;
}
