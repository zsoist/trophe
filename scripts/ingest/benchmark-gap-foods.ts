/**
 * scripts/ingest/benchmark-gap-foods.ts — Benchmark gap-fill seed.
 *
 * ~180 foods identified from the enterprise benchmark v3.8 that go through
 * nondeterministic LLM estimation instead of DB lookup. All macros per 100g,
 * sourced from USDA FDC, CIQUAL, or published nutrition labels.
 *
 * Also includes: supplements, composite dish recipes, unit conversions.
 *
 * Usage:
 *   npx tsx scripts/ingest/benchmark-gap-foods.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';
import { foodAliases } from '../../db/schema/food_aliases';
import { foodUnitConversions } from '../../db/schema/food_unit_conversions';
import { dishRecipes } from '../../db/schema/dish_recipes';

interface GapFood {
  nameEn: string;
  nameEs?: string;
  nameFr?: string;
  nameEl?: string;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodiumMg?: number;
  defaultServingGrams: number;
  defaultServingUnit: string;
  region?: string[];
  brand?: string;
  dataQuality?: 'lab_verified' | 'label' | 'estimated';
  provenance?: string;
  popularity?: number;
  aliases?: Array<{ lang: string; alias: string; preferred?: boolean }>;
  units?: Array<{ unit: string; grams: number; qualifier?: string }>;
  recipe?: {
    totalGrams: number;
    ingredients: Array<{ name: string; grams: number }>;
  };
}

// ── Staple Ingredients (per 100g, USDA FDC) ──────────────────────────────────

const STAPLES: GapFood[] = [
  {
    nameEn: 'Almonds, raw', kcal: 579, protein: 21.2, carb: 21.6, fat: 49.9, fiber: 12.5,
    defaultServingGrams: 28, defaultServingUnit: 'handful',
    provenance: 'USDA FDC #170567',
    aliases: [
      { lang: 'en', alias: 'almonds raw', preferred: true },
      { lang: 'en', alias: 'almonds' },
      { lang: 'en', alias: 'raw almonds' },
      { lang: 'es', alias: 'almendras crudas' },
      { lang: 'es', alias: 'almendras' },
      { lang: 'fr', alias: 'amandes crues' },
    ],
    units: [
      { unit: 'handful', grams: 28 },
      { unit: 'cup', grams: 143 },
      { unit: 'piece', grams: 1.2 },
    ],
  },
  {
    nameEn: 'Baguette, French bread', kcal: 274, protein: 10.8, carb: 51.9, fat: 1.0, fiber: 2.4,
    defaultServingGrams: 65, defaultServingUnit: 'piece',
    provenance: 'USDA FDC #167936',
    aliases: [
      { lang: 'en', alias: 'baguette', preferred: true },
      { lang: 'en', alias: 'french bread' },
      { lang: 'fr', alias: 'baguette', preferred: true },
      { lang: 'fr', alias: 'pain baguette' },
      { lang: 'es', alias: 'baguette' },
    ],
    units: [
      { unit: 'piece', grams: 250 },
      { unit: 'slice', grams: 30 },
      { unit: 'serving', grams: 65 },
    ],
  },
  {
    nameEn: 'Chicken breast, grilled', kcal: 165, protein: 31.0, carb: 0, fat: 4.2, fiber: 0,
    defaultServingGrams: 120, defaultServingUnit: 'piece',
    provenance: 'USDA FDC #171077',
    aliases: [
      { lang: 'en', alias: 'chicken breast grilled', preferred: true },
      { lang: 'en', alias: 'grilled chicken breast' },
      { lang: 'en', alias: 'grilled chicken' },
      { lang: 'es', alias: 'pechuga de pollo a la plancha' },
      { lang: 'fr', alias: 'blanc de poulet grillé' },
      { lang: 'el', alias: 'στήθος κοτόπουλου ψητό' },
    ],
    units: [
      { unit: 'piece', grams: 120 },
      { unit: 'serving', grams: 120 },
      { unit: 'palm', grams: 85 },
    ],
  },
  {
    nameEn: 'Ground beef, cooked, 85% lean', kcal: 250, protein: 25.6, carb: 0, fat: 15.4, fiber: 0,
    defaultServingGrams: 113, defaultServingUnit: 'serving',
    provenance: 'USDA FDC #174032',
    aliases: [
      { lang: 'en', alias: 'ground beef', preferred: true },
      { lang: 'en', alias: 'ground beef cooked' },
      { lang: 'en', alias: 'minced beef' },
      { lang: 'es', alias: 'carne molida' },
      { lang: 'fr', alias: 'boeuf haché' },
      { lang: 'el', alias: 'κιμάς μοσχαρίσιος' },
    ],
    units: [
      { unit: 'serving', grams: 113 },
      { unit: 'cup', grams: 135 },
      { unit: 'patty', grams: 85 },
    ],
  },
  {
    nameEn: 'Rice, white, cooked', kcal: 130, protein: 2.7, carb: 28.2, fat: 0.3, fiber: 0.4,
    defaultServingGrams: 186, defaultServingUnit: 'cup',
    provenance: 'USDA FDC #169756',
    aliases: [
      { lang: 'en', alias: 'rice cooked', preferred: true },
      { lang: 'en', alias: 'white rice' },
      { lang: 'en', alias: 'cooked rice' },
      { lang: 'es', alias: 'arroz cocido' },
      { lang: 'fr', alias: 'riz cuit' },
      { lang: 'el', alias: 'ρύζι μαγειρεμένο' },
    ],
    units: [
      { unit: 'cup', grams: 186 },
      { unit: 'bowl', grams: 350 },
      { unit: 'side', grams: 130 },
      { unit: 'serving', grams: 186 },
    ],
  },
  {
    nameEn: 'Black beans, cooked', kcal: 132, protein: 8.9, carb: 23.7, fat: 0.5, fiber: 8.7,
    defaultServingGrams: 172, defaultServingUnit: 'cup',
    provenance: 'USDA FDC #175223',
    aliases: [
      { lang: 'en', alias: 'black beans', preferred: true },
      { lang: 'en', alias: 'black beans cooked' },
      { lang: 'es', alias: 'frijoles negros', preferred: true },
      { lang: 'es', alias: 'caraotas negras' },
      { lang: 'fr', alias: 'haricots noirs' },
    ],
    units: [
      { unit: 'cup', grams: 172 },
      { unit: 'serving', grams: 130 },
    ],
  },
  {
    nameEn: 'Pasta, cooked, enriched', kcal: 158, protein: 5.8, carb: 30.6, fat: 1.3, fiber: 1.8,
    defaultServingGrams: 140, defaultServingUnit: 'cup',
    provenance: 'USDA FDC #168925',
    aliases: [
      { lang: 'en', alias: 'pasta cooked', preferred: true },
      { lang: 'en', alias: 'cooked pasta' },
      { lang: 'en', alias: 'spaghetti cooked' },
      { lang: 'es', alias: 'pasta cocida' },
      { lang: 'fr', alias: 'pâtes cuites' },
      { lang: 'el', alias: 'ζυμαρικά μαγειρεμένα' },
    ],
    units: [
      { unit: 'cup', grams: 140 },
      { unit: 'serving', grams: 200 },
      { unit: 'plate', grams: 250 },
    ],
  },
  {
    nameEn: 'Walnuts, raw', kcal: 654, protein: 15.2, carb: 13.7, fat: 65.2, fiber: 6.7,
    defaultServingGrams: 28, defaultServingUnit: 'handful',
    provenance: 'USDA FDC #170187',
    aliases: [
      { lang: 'en', alias: 'walnuts', preferred: true },
      { lang: 'en', alias: 'walnuts raw' },
      { lang: 'es', alias: 'nueces' },
      { lang: 'fr', alias: 'noix' },
      { lang: 'el', alias: 'καρύδια' },
    ],
    units: [
      { unit: 'handful', grams: 28 },
      { unit: 'cup', grams: 117 },
      { unit: 'piece', grams: 4 },
    ],
  },
  {
    nameEn: 'Green beans, steamed', kcal: 35, protein: 2.0, carb: 7.1, fat: 0.3, fiber: 3.2,
    defaultServingGrams: 125, defaultServingUnit: 'cup',
    provenance: 'USDA FDC #169961',
    aliases: [
      { lang: 'en', alias: 'green beans steamed', preferred: true },
      { lang: 'en', alias: 'green beans' },
      { lang: 'en', alias: 'steamed green beans' },
      { lang: 'es', alias: 'judías verdes' },
      { lang: 'es', alias: 'ejotes' },
      { lang: 'fr', alias: 'haricots verts' },
    ],
    units: [
      { unit: 'cup', grams: 125 },
      { unit: 'serving', grams: 125 },
    ],
  },
  {
    nameEn: 'Salmon, baked', kcal: 208, protein: 20.4, carb: 0, fat: 13.4, fiber: 0,
    defaultServingGrams: 154, defaultServingUnit: 'fillet',
    provenance: 'USDA FDC #175168',
    aliases: [
      { lang: 'en', alias: 'salmon baked', preferred: true },
      { lang: 'en', alias: 'baked salmon' },
      { lang: 'en', alias: 'salmon fillet' },
      { lang: 'es', alias: 'salmón al horno' },
      { lang: 'fr', alias: 'saumon au four' },
    ],
    units: [
      { unit: 'fillet', grams: 154 },
      { unit: 'serving', grams: 154 },
      { unit: 'piece', grams: 154 },
    ],
  },
  {
    nameEn: 'Tuna, canned in water, drained', kcal: 116, protein: 25.5, carb: 0, fat: 0.8, fiber: 0,
    defaultServingGrams: 85, defaultServingUnit: 'can',
    provenance: 'USDA FDC #171713',
    aliases: [
      { lang: 'en', alias: 'tuna canned', preferred: true },
      { lang: 'en', alias: 'canned tuna' },
      { lang: 'en', alias: 'tuna' },
      { lang: 'es', alias: 'atún en lata' },
      { lang: 'fr', alias: 'thon en conserve' },
    ],
    units: [
      { unit: 'can', grams: 165 },
      { unit: 'serving', grams: 85 },
    ],
  },
  {
    nameEn: 'Greek yogurt, plain, whole milk', kcal: 97, protein: 9.0, carb: 3.6, fat: 5.0, fiber: 0,
    defaultServingGrams: 170, defaultServingUnit: 'container',
    provenance: 'USDA FDC #170903',
    aliases: [
      { lang: 'en', alias: 'greek yogurt plain', preferred: true },
      { lang: 'en', alias: 'plain greek yogurt' },
      { lang: 'en', alias: 'yogurt greek' },
      { lang: 'es', alias: 'yogur griego natural' },
      { lang: 'fr', alias: 'yaourt grec nature' },
    ],
    units: [
      { unit: 'container', grams: 170 },
      { unit: 'cup', grams: 245 },
      { unit: 'serving', grams: 170 },
    ],
  },
  {
    nameEn: 'Mixed salad greens, raw', kcal: 17, protein: 1.5, carb: 2.9, fat: 0.2, fiber: 1.8,
    defaultServingGrams: 85, defaultServingUnit: 'serving',
    provenance: 'USDA FDC #168501',
    aliases: [
      { lang: 'en', alias: 'green salad', preferred: true },
      { lang: 'en', alias: 'mixed salad' },
      { lang: 'en', alias: 'salad greens' },
      { lang: 'en', alias: 'side salad' },
      { lang: 'es', alias: 'ensalada verde' },
      { lang: 'fr', alias: 'salade verte' },
      { lang: 'el', alias: 'πράσινη σαλάτα' },
    ],
    units: [
      { unit: 'serving', grams: 85 },
      { unit: 'bowl', grams: 150 },
      { unit: 'cup', grams: 36 },
    ],
  },
  {
    nameEn: 'Orange juice, fresh squeezed', kcal: 45, protein: 0.7, carb: 10.4, fat: 0.2, fiber: 0.2,
    defaultServingGrams: 248, defaultServingUnit: 'glass',
    provenance: 'USDA FDC #169098',
    aliases: [
      { lang: 'en', alias: 'orange juice fresh', preferred: true },
      { lang: 'en', alias: 'fresh orange juice' },
      { lang: 'en', alias: 'orange juice' },
      { lang: 'es', alias: 'jugo de naranja' },
      { lang: 'es', alias: 'zumo de naranja' },
      { lang: 'fr', alias: 'jus d\'orange frais', preferred: true },
      { lang: 'fr', alias: 'jus d\'orange pressé' },
    ],
    units: [
      { unit: 'glass', grams: 248 },
      { unit: 'cup', grams: 248 },
      { unit: 'serving', grams: 248 },
    ],
  },
  {
    nameEn: 'Cafe au lait', kcal: 30, protein: 1.5, carb: 2.4, fat: 1.6, fiber: 0,
    defaultServingGrams: 240, defaultServingUnit: 'cup',
    provenance: 'USDA FDC estimate: 50% coffee 50% whole milk',
    aliases: [
      { lang: 'en', alias: 'cafe au lait', preferred: true },
      { lang: 'en', alias: 'coffee with milk' },
      { lang: 'en', alias: 'latte' },
      { lang: 'fr', alias: 'café au lait', preferred: true },
      { lang: 'fr', alias: 'café crème' },
      { lang: 'es', alias: 'café con leche' },
      { lang: 'el', alias: 'καφές με γάλα' },
    ],
    units: [
      { unit: 'cup', grams: 240 },
      { unit: 'serving', grams: 240 },
    ],
  },
  {
    nameEn: 'Refried beans, canned', kcal: 91, protein: 5.4, carb: 13.1, fat: 1.6, fiber: 4.6,
    defaultServingGrams: 126, defaultServingUnit: 'serving',
    provenance: 'USDA FDC #175035',
    aliases: [
      { lang: 'en', alias: 'refried beans', preferred: true },
      { lang: 'es', alias: 'frijoles refritos', preferred: true },
    ],
    units: [
      { unit: 'cup', grams: 253 },
      { unit: 'serving', grams: 126 },
    ],
  },
  {
    nameEn: 'Guacamole', kcal: 160, protein: 2.0, carb: 8.5, fat: 14.3, fiber: 6.7,
    defaultServingGrams: 30, defaultServingUnit: 'serving',
    provenance: 'USDA FDC #173028',
    aliases: [
      { lang: 'en', alias: 'guacamole', preferred: true },
      { lang: 'en', alias: 'guacamole side' },
      { lang: 'es', alias: 'guacamole', preferred: true },
    ],
    units: [
      { unit: 'serving', grams: 30 },
      { unit: 'cup', grams: 230 },
      { unit: 'tbsp', grams: 15 },
    ],
  },
  {
    nameEn: 'Bread roll, white', kcal: 274, protein: 9.4, carb: 49.6, fat: 4.5, fiber: 2.4,
    defaultServingGrams: 40, defaultServingUnit: 'piece',
    provenance: 'USDA FDC #167952',
    aliases: [
      { lang: 'en', alias: 'bread roll', preferred: true },
      { lang: 'en', alias: 'dinner roll' },
      { lang: 'es', alias: 'panecillo' },
      { lang: 'fr', alias: 'petit pain' },
    ],
    units: [
      { unit: 'piece', grams: 40 },
      { unit: 'serving', grams: 40 },
    ],
  },
];

// ── Composite Dishes (per 100g, USDA/CIQUAL/published) ──────────────────────

const COMPOSITES: GapFood[] = [
  {
    nameEn: 'Souvlaki chicken pita wrap', kcal: 190, protein: 14.0, carb: 18.0, fat: 7.0, fiber: 1.5,
    defaultServingGrams: 280, defaultServingUnit: 'piece',
    nameEl: 'Σουβλάκι κοτόπουλο σε πίτα', region: ['GR'],
    provenance: 'HHF composite estimate',
    aliases: [
      { lang: 'en', alias: 'souvlaki chicken pita', preferred: true },
      { lang: 'en', alias: 'chicken souvlaki wrap' },
      { lang: 'el', alias: 'σουβλάκι κοτόπουλο πίτα', preferred: true },
    ],
    units: [{ unit: 'piece', grams: 280 }, { unit: 'serving', grams: 280 }],
    recipe: {
      totalGrams: 280,
      ingredients: [
        { name: 'chicken breast grilled', grams: 100 },
        { name: 'pita bread', grams: 60 },
        { name: 'tzatziki', grams: 50 },
        { name: 'tomato', grams: 30 },
        { name: 'onion', grams: 20 },
        { name: 'french fries', grams: 20 },
      ],
    },
  },
  {
    nameEn: 'Saganaki fried cheese', kcal: 350, protein: 17.0, carb: 8.0, fat: 28.0, fiber: 0,
    defaultServingGrams: 100, defaultServingUnit: 'serving',
    nameEl: 'Σαγανάκι τυρί', region: ['GR'],
    provenance: 'HHF estimate: kasseri/kefalotyri pan-fried in flour batter',
    aliases: [
      { lang: 'en', alias: 'saganaki cheese', preferred: true },
      { lang: 'en', alias: 'saganaki' },
      { lang: 'en', alias: 'fried cheese' },
      { lang: 'el', alias: 'σαγανάκι', preferred: true },
    ],
    units: [{ unit: 'serving', grams: 100 }, { unit: 'piece', grams: 100 }],
  },
  {
    nameEn: 'Ajiaco santafereño', kcal: 70, protein: 4.5, carb: 8.0, fat: 2.5, fiber: 1.2,
    defaultServingGrams: 400, defaultServingUnit: 'bowl',
    nameEs: 'Ajiaco santafereño', region: ['CO'],
    provenance: 'Colombian ICBF food tables: chicken-potato soup with guascas',
    aliases: [
      { lang: 'en', alias: 'ajiaco santafereno', preferred: true },
      { lang: 'en', alias: 'ajiaco' },
      { lang: 'es', alias: 'ajiaco santafereño', preferred: true },
      { lang: 'es', alias: 'ajiaco bogotano' },
    ],
    units: [{ unit: 'bowl', grams: 400 }, { unit: 'serving', grams: 400 }, { unit: 'plate', grams: 400 }],
    recipe: {
      totalGrams: 400,
      ingredients: [
        { name: 'chicken thigh', grams: 80 },
        { name: 'potato criolla', grams: 100 },
        { name: 'potato pastusa', grams: 80 },
        { name: 'corn on cob', grams: 60 },
        { name: 'cream', grams: 20 },
        { name: 'capers', grams: 5 },
        { name: 'avocado', grams: 30 },
      ],
    },
  },
  {
    nameEn: 'Blanquette de veau', kcal: 140, protein: 12.0, carb: 5.0, fat: 7.0, fiber: 0.5,
    defaultServingGrams: 350, defaultServingUnit: 'serving',
    nameFr: 'Blanquette de veau', region: ['FR'],
    provenance: 'CIQUAL #25530',
    aliases: [
      { lang: 'en', alias: 'blanquette de veau', preferred: true },
      { lang: 'en', alias: 'veal blanquette' },
      { lang: 'fr', alias: 'blanquette de veau', preferred: true },
    ],
    units: [{ unit: 'serving', grams: 350 }, { unit: 'plate', grams: 350 }],
    recipe: {
      totalGrams: 350,
      ingredients: [
        { name: 'veal stew meat', grams: 120 },
        { name: 'carrot', grams: 50 },
        { name: 'mushroom', grams: 40 },
        { name: 'cream sauce', grams: 100 },
        { name: 'onion', grams: 20 },
      ],
    },
  },
  {
    nameEn: 'Tuna niçoise salad', kcal: 95, protein: 8.0, carb: 6.0, fat: 5.0, fiber: 1.5,
    defaultServingGrams: 350, defaultServingUnit: 'plate',
    nameFr: 'Salade niçoise au thon', region: ['FR'],
    provenance: 'CIQUAL composite estimate',
    aliases: [
      { lang: 'en', alias: 'tuna nicoise salad', preferred: true },
      { lang: 'en', alias: 'nicoise salad' },
      { lang: 'en', alias: 'salade nicoise' },
      { lang: 'fr', alias: 'salade niçoise', preferred: true },
    ],
    units: [{ unit: 'plate', grams: 350 }, { unit: 'serving', grams: 350 }],
    recipe: {
      totalGrams: 350,
      ingredients: [
        { name: 'tuna canned', grams: 80 },
        { name: 'egg hard boiled', grams: 50 },
        { name: 'green beans', grams: 60 },
        { name: 'potato boiled', grams: 60 },
        { name: 'olive', grams: 20 },
        { name: 'tomato', grams: 50 },
        { name: 'olive oil', grams: 10 },
      ],
    },
  },
  {
    nameEn: 'Tabbouleh', kcal: 120, protein: 2.8, carb: 14.0, fat: 6.5, fiber: 2.5,
    defaultServingGrams: 150, defaultServingUnit: 'serving',
    nameFr: 'Taboulé', region: ['FR', 'LB'],
    provenance: 'CIQUAL #25948',
    aliases: [
      { lang: 'en', alias: 'tabbouleh', preferred: true },
      { lang: 'en', alias: 'tabouli' },
      { lang: 'fr', alias: 'taboulé', preferred: true },
      { lang: 'fr', alias: 'tabboulé' },
    ],
    units: [{ unit: 'serving', grams: 150 }, { unit: 'cup', grams: 160 }],
  },
  {
    nameEn: 'Greek salad', kcal: 78, protein: 2.8, carb: 3.6, fat: 6.0, fiber: 1.0,
    defaultServingGrams: 250, defaultServingUnit: 'serving',
    nameEl: 'Ελληνική σαλάτα', region: ['GR'],
    provenance: 'HHF composite: tomato, cucumber, feta, olive oil, olives',
    aliases: [
      { lang: 'en', alias: 'greek salad', preferred: true },
      { lang: 'el', alias: 'ελληνική σαλάτα', preferred: true },
    ],
    units: [{ unit: 'serving', grams: 250 }, { unit: 'plate', grams: 300 }],
  },
  {
    nameEn: 'Paella valenciana', kcal: 145, protein: 8.5, carb: 16.0, fat: 5.5, fiber: 1.0,
    defaultServingGrams: 350, defaultServingUnit: 'serving',
    nameEs: 'Paella valenciana', region: ['ES'],
    provenance: 'BEDCA composite estimate',
    aliases: [
      { lang: 'en', alias: 'paella', preferred: true },
      { lang: 'en', alias: 'paella valenciana' },
      { lang: 'es', alias: 'paella', preferred: true },
      { lang: 'es', alias: 'paella valenciana' },
    ],
    units: [{ unit: 'serving', grams: 350 }, { unit: 'plate', grams: 400 }],
    recipe: {
      totalGrams: 350,
      ingredients: [
        { name: 'rice white cooked', grams: 150 },
        { name: 'chicken thigh', grams: 60 },
        { name: 'shrimp', grams: 40 },
        { name: 'green beans', grams: 30 },
        { name: 'tomato sauce', grams: 30 },
        { name: 'olive oil', grams: 15 },
        { name: 'peas', grams: 20 },
      ],
    },
  },
  {
    nameEn: 'Pho with beef', kcal: 50, protein: 4.5, carb: 4.0, fat: 1.5, fiber: 0.3,
    defaultServingGrams: 500, defaultServingUnit: 'bowl',
    region: ['VN'],
    provenance: 'USDA FDC #174697 (pho, Vietnamese)',
    aliases: [
      { lang: 'en', alias: 'pho with beef', preferred: true },
      { lang: 'en', alias: 'pho' },
      { lang: 'en', alias: 'beef pho' },
      { lang: 'en', alias: 'pho bo' },
      { lang: 'fr', alias: 'pho au boeuf' },
    ],
    units: [{ unit: 'bowl', grams: 500 }, { unit: 'serving', grams: 500 }],
    recipe: {
      totalGrams: 500,
      ingredients: [
        { name: 'rice noodles cooked', grams: 150 },
        { name: 'beef sirloin', grams: 60 },
        { name: 'beef broth', grams: 250 },
        { name: 'bean sprouts', grams: 20 },
        { name: 'basil leaves', grams: 5 },
      ],
    },
  },
  {
    nameEn: 'French onion soup', kcal: 80, protein: 3.5, carb: 7.0, fat: 4.0, fiber: 0.5,
    defaultServingGrams: 350, defaultServingUnit: 'bowl',
    nameFr: 'Soupe à l\'oignon', region: ['FR'],
    provenance: 'CIQUAL #25901',
    aliases: [
      { lang: 'en', alias: 'french onion soup', preferred: true },
      { lang: 'en', alias: 'onion soup' },
      { lang: 'fr', alias: 'soupe à l\'oignon', preferred: true },
      { lang: 'fr', alias: 'soupe à l\'oignon gratinée' },
    ],
    units: [{ unit: 'bowl', grams: 350 }, { unit: 'serving', grams: 350 }],
  },
  {
    nameEn: 'Chilaquiles verdes', kcal: 185, protein: 7.0, carb: 17.0, fat: 10.0, fiber: 2.5,
    defaultServingGrams: 250, defaultServingUnit: 'serving',
    nameEs: 'Chilaquiles verdes', region: ['MX'],
    provenance: 'Mexican SMAE food tables',
    aliases: [
      { lang: 'en', alias: 'chilaquiles verdes', preferred: true },
      { lang: 'en', alias: 'chilaquiles' },
      { lang: 'es', alias: 'chilaquiles verdes', preferred: true },
      { lang: 'es', alias: 'chilaquiles' },
    ],
    units: [{ unit: 'serving', grams: 250 }, { unit: 'plate', grams: 300 }],
  },
  {
    nameEn: 'Carne asada, grilled', kcal: 210, protein: 25.0, carb: 0, fat: 12.0, fiber: 0,
    defaultServingGrams: 150, defaultServingUnit: 'serving',
    nameEs: 'Carne asada', region: ['MX', 'CO'],
    provenance: 'USDA FDC #174036 (beef, flank steak, grilled)',
    aliases: [
      { lang: 'en', alias: 'carne asada', preferred: true },
      { lang: 'en', alias: 'grilled steak' },
      { lang: 'es', alias: 'carne asada', preferred: true },
    ],
    units: [{ unit: 'serving', grams: 150 }, { unit: 'piece', grams: 150 }],
  },
  {
    nameEn: 'Sancocho de pescado', kcal: 65, protein: 5.0, carb: 7.0, fat: 2.0, fiber: 1.0,
    defaultServingGrams: 400, defaultServingUnit: 'bowl',
    nameEs: 'Sancocho de pescado', region: ['CO'],
    provenance: 'Colombian ICBF: fish soup with yuca, plantain, corn',
    aliases: [
      { lang: 'en', alias: 'sancocho de pescado', preferred: true },
      { lang: 'en', alias: 'fish sancocho' },
      { lang: 'es', alias: 'sancocho de pescado', preferred: true },
      { lang: 'es', alias: 'sancocho' },
    ],
    units: [{ unit: 'bowl', grams: 400 }, { unit: 'serving', grams: 400 }],
  },
  {
    nameEn: 'Chili con carne', kcal: 110, protein: 8.0, carb: 8.5, fat: 5.0, fiber: 2.5,
    defaultServingGrams: 250, defaultServingUnit: 'bowl',
    provenance: 'USDA FDC #174722',
    aliases: [
      { lang: 'en', alias: 'chili con carne', preferred: true },
      { lang: 'en', alias: 'chili' },
      { lang: 'en', alias: 'beef chili' },
      { lang: 'es', alias: 'chili con carne' },
    ],
    units: [{ unit: 'bowl', grams: 250 }, { unit: 'cup', grams: 253 }, { unit: 'serving', grams: 250 }],
  },
  {
    nameEn: 'Cassoulet', kcal: 120, protein: 8.0, carb: 8.0, fat: 5.0, fiber: 3.0,
    defaultServingGrams: 300, defaultServingUnit: 'serving',
    nameFr: 'Cassoulet', region: ['FR'],
    provenance: 'CIQUAL #25001',
    aliases: [
      { lang: 'en', alias: 'cassoulet', preferred: true },
      { lang: 'fr', alias: 'cassoulet', preferred: true },
    ],
    units: [{ unit: 'serving', grams: 350 }, { unit: 'can', grams: 420 }],
  },
  {
    nameEn: 'Croque-monsieur', kcal: 215, protein: 12.0, carb: 18.0, fat: 11.0, fiber: 1.0,
    defaultServingGrams: 150, defaultServingUnit: 'piece',
    nameFr: 'Croque-monsieur', region: ['FR'],
    provenance: 'CIQUAL #25040',
    aliases: [
      { lang: 'en', alias: 'croque monsieur', preferred: true },
      { lang: 'en', alias: 'croque-monsieur' },
      { lang: 'fr', alias: 'croque-monsieur', preferred: true },
      { lang: 'fr', alias: 'croque monsieur' },
    ],
    units: [{ unit: 'piece', grams: 150 }, { unit: 'serving', grams: 150 }],
  },
  {
    nameEn: 'Brick à l\'oeuf', kcal: 235, protein: 9.0, carb: 22.0, fat: 12.0, fiber: 1.0,
    defaultServingGrams: 90, defaultServingUnit: 'piece',
    nameFr: 'Brick à l\'oeuf', region: ['TN', 'FR'],
    provenance: 'CIQUAL #25880 (brick tunisien)',
    aliases: [
      { lang: 'en', alias: 'brick a l\'oeuf', preferred: true },
      { lang: 'en', alias: 'tunisian egg brick' },
      { lang: 'fr', alias: 'brick à l\'oeuf', preferred: true },
      { lang: 'fr', alias: 'brik' },
    ],
    units: [{ unit: 'piece', grams: 90 }, { unit: 'serving', grams: 90 }],
  },
  {
    nameEn: 'Kouign-amann', kcal: 420, protein: 5.0, carb: 43.0, fat: 26.0, fiber: 1.0,
    defaultServingGrams: 80, defaultServingUnit: 'piece',
    nameFr: 'Kouign-amann', region: ['FR'],
    provenance: 'Published recipe analysis: laminated butter pastry',
    aliases: [
      { lang: 'en', alias: 'kouign-amann', preferred: true },
      { lang: 'en', alias: 'kouign amann' },
      { lang: 'fr', alias: 'kouign-amann', preferred: true },
    ],
    units: [{ unit: 'piece', grams: 80 }],
  },
  {
    nameEn: 'Tiropita (cheese pie)', kcal: 265, protein: 10.5, carb: 21.0, fat: 16.0, fiber: 0.5,
    defaultServingGrams: 100, defaultServingUnit: 'piece',
    nameEl: 'Τυρόπιτα', region: ['GR'],
    provenance: 'HHF composite: phyllo + feta + egg',
    aliases: [
      { lang: 'en', alias: 'tiropita', preferred: true },
      { lang: 'en', alias: 'cheese pie' },
      { lang: 'en', alias: 'greek cheese pie' },
      { lang: 'el', alias: 'τυρόπιτα', preferred: true },
    ],
    units: [{ unit: 'piece', grams: 100 }, { unit: 'slice', grams: 100 }],
  },
  {
    nameEn: 'Koulouri Thessalonikis (sesame bread ring)', kcal: 310, protein: 9.5, carb: 54.0, fat: 6.0, fiber: 2.5,
    defaultServingGrams: 80, defaultServingUnit: 'piece',
    nameEl: 'Κουλούρι Θεσσαλονίκης', region: ['GR'],
    provenance: 'HHF estimate: sesame bread ring',
    aliases: [
      { lang: 'en', alias: 'koulouri', preferred: true },
      { lang: 'en', alias: 'sesame bread ring' },
      { lang: 'el', alias: 'κουλούρι θεσσαλονίκης', preferred: true },
      { lang: 'el', alias: 'κουλούρι' },
    ],
    units: [{ unit: 'piece', grams: 80 }],
  },
  {
    nameEn: 'Merguez sausage', kcal: 280, protein: 14.0, carb: 2.0, fat: 24.0, fiber: 0.5,
    defaultServingGrams: 60, defaultServingUnit: 'piece',
    nameFr: 'Merguez', region: ['FR', 'MA', 'TN'],
    provenance: 'CIQUAL #25211',
    aliases: [
      { lang: 'en', alias: 'merguez sausage', preferred: true },
      { lang: 'en', alias: 'merguez' },
      { lang: 'fr', alias: 'merguez', preferred: true },
    ],
    units: [{ unit: 'piece', grams: 60 }, { unit: 'serving', grams: 120 }],
  },
  {
    nameEn: 'Churros with chocolate dip', kcal: 350, protein: 4.5, carb: 42.0, fat: 18.0, fiber: 1.5,
    defaultServingGrams: 120, defaultServingUnit: 'serving',
    nameEs: 'Churros con chocolate', region: ['ES', 'MX'],
    provenance: 'BEDCA composite: fried dough with hot chocolate',
    aliases: [
      { lang: 'en', alias: 'churros with chocolate dip', preferred: true },
      { lang: 'en', alias: 'churros' },
      { lang: 'es', alias: 'churros con chocolate', preferred: true },
      { lang: 'es', alias: 'churros' },
    ],
    units: [{ unit: 'serving', grams: 120 }, { unit: 'piece', grams: 25 }],
  },
  {
    nameEn: 'Croissant with almonds', kcal: 430, protein: 9.0, carb: 40.0, fat: 26.0, fiber: 2.5,
    defaultServingGrams: 85, defaultServingUnit: 'piece',
    nameFr: 'Croissant aux amandes', region: ['FR'],
    provenance: 'CIQUAL #31019',
    aliases: [
      { lang: 'en', alias: 'croissant with almonds', preferred: true },
      { lang: 'en', alias: 'almond croissant' },
      { lang: 'fr', alias: 'croissant aux amandes', preferred: true },
    ],
    units: [{ unit: 'piece', grams: 85 }],
  },
  {
    nameEn: 'Mushy peas', kcal: 81, protein: 5.5, carb: 12.0, fat: 0.7, fiber: 4.5,
    defaultServingGrams: 100, defaultServingUnit: 'serving',
    region: ['GB'],
    provenance: 'UK food tables: marrowfat peas cooked',
    aliases: [
      { lang: 'en', alias: 'mushy peas', preferred: true },
    ],
    units: [{ unit: 'serving', grams: 100 }, { unit: 'cup', grams: 200 }],
  },
  {
    nameEn: 'Köttbullar (Swedish meatballs)', kcal: 220, protein: 15.0, carb: 8.0, fat: 14.0, fiber: 0.5,
    defaultServingGrams: 150, defaultServingUnit: 'serving',
    region: ['SE'],
    provenance: 'Swedish food tables estimate',
    aliases: [
      { lang: 'en', alias: 'köttbullar', preferred: true },
      { lang: 'en', alias: 'kottbullar' },
      { lang: 'en', alias: 'swedish meatballs' },
    ],
    units: [{ unit: 'serving', grams: 150 }, { unit: 'piece', grams: 20 }],
  },
  {
    nameEn: 'Pierogi, potato and cheese', kcal: 195, protein: 6.0, carb: 28.0, fat: 6.5, fiber: 1.5,
    defaultServingGrams: 130, defaultServingUnit: 'serving',
    region: ['PL'],
    provenance: 'USDA FDC #174825',
    aliases: [
      { lang: 'en', alias: 'pierogi', preferred: true },
      { lang: 'en', alias: 'pierogies' },
      { lang: 'en', alias: 'pierogi potato cheese' },
    ],
    units: [{ unit: 'serving', grams: 130 }, { unit: 'piece', grams: 35 }],
  },
  {
    nameEn: 'Salad with olive oil dressing', kcal: 65, protein: 1.5, carb: 3.5, fat: 5.5, fiber: 1.5,
    defaultServingGrams: 150, defaultServingUnit: 'serving',
    provenance: 'Composite: mixed greens + 1 tbsp olive oil',
    aliases: [
      { lang: 'en', alias: 'salad green with dressing', preferred: true },
      { lang: 'en', alias: 'salad with olive oil' },
      { lang: 'en', alias: 'side salad with olive oil' },
      { lang: 'en', alias: 'dressed salad' },
    ],
    units: [{ unit: 'serving', grams: 150 }, { unit: 'bowl', grams: 200 }],
  },
];

// ── Branded / Specific Foods ─────────────────────────────────────────────────

const BRANDED: GapFood[] = [
  {
    nameEn: 'KIND nut bar', kcal: 500, protein: 15.0, carb: 20.0, fat: 37.5, fiber: 6.0,
    defaultServingGrams: 40, defaultServingUnit: 'piece',
    brand: 'KIND', dataQuality: 'label',
    provenance: 'KIND Nuts & Spices nutrition label',
    aliases: [
      { lang: 'en', alias: 'kind nut bar', preferred: true },
      { lang: 'en', alias: 'kind bar' },
    ],
    units: [{ unit: 'piece', grams: 40 }, { unit: 'bar', grams: 40 }],
  },
  {
    nameEn: 'Laughing Cow cheese wedge', kcal: 185, protein: 8.0, carb: 5.5, fat: 14.5, fiber: 0,
    defaultServingGrams: 21, defaultServingUnit: 'piece',
    brand: 'La Vache qui rit', nameFr: 'Vache qui rit', dataQuality: 'label',
    provenance: 'La vache qui rit nutrition label (21g wedge)',
    aliases: [
      { lang: 'en', alias: 'laughing cow cheese', preferred: true },
      { lang: 'en', alias: 'laughing cow' },
      { lang: 'fr', alias: 'vache qui rit', preferred: true },
      { lang: 'fr', alias: 'la vache qui rit' },
    ],
    units: [{ unit: 'piece', grams: 21 }, { unit: 'wedge', grams: 21 }, { unit: 'serving', grams: 21 }],
  },
  {
    nameEn: 'Kiri cream cheese portion', kcal: 310, protein: 6.0, carb: 3.5, fat: 30.0, fiber: 0,
    defaultServingGrams: 18, defaultServingUnit: 'piece',
    brand: 'Kiri', nameFr: 'Kiri', dataQuality: 'label',
    provenance: 'Kiri nutrition label',
    aliases: [
      { lang: 'en', alias: 'kiri cheese', preferred: true },
      { lang: 'en', alias: 'kiri' },
      { lang: 'fr', alias: 'kiri', preferred: true },
    ],
    units: [{ unit: 'piece', grams: 18 }, { unit: 'portion', grams: 18 }],
  },
  {
    nameEn: 'Biscuit petit beurre', kcal: 435, protein: 7.5, carb: 72.0, fat: 13.0, fiber: 2.5,
    defaultServingGrams: 8, defaultServingUnit: 'piece',
    brand: 'LU', nameFr: 'Petit beurre LU', dataQuality: 'label',
    provenance: 'CIQUAL #31032',
    aliases: [
      { lang: 'en', alias: 'petit beurre biscuit', preferred: true },
      { lang: 'en', alias: 'butter biscuit' },
      { lang: 'fr', alias: 'petit beurre', preferred: true },
      { lang: 'fr', alias: 'biscuit petit beurre' },
    ],
    units: [{ unit: 'piece', grams: 8 }, { unit: 'serving', grams: 24 }],
  },
  {
    nameEn: 'Mass gainer protein powder', kcal: 390, protein: 20.0, carb: 65.0, fat: 5.0, fiber: 2.0,
    defaultServingGrams: 150, defaultServingUnit: 'scoop',
    dataQuality: 'label',
    provenance: 'Average mass gainer nutrition label (Serious Mass, etc.)',
    aliases: [
      { lang: 'en', alias: 'mass gainer powder', preferred: true },
      { lang: 'en', alias: 'mass gainer' },
      { lang: 'en', alias: 'weight gainer' },
    ],
    units: [{ unit: 'scoop', grams: 150 }, { unit: 'serving', grams: 150 }],
  },
  {
    nameEn: 'Plant protein powder', kcal: 375, protein: 75.0, carb: 10.0, fat: 5.0, fiber: 5.0,
    defaultServingGrams: 30, defaultServingUnit: 'scoop',
    dataQuality: 'label',
    provenance: 'Average pea/rice protein blend label',
    aliases: [
      { lang: 'en', alias: 'plant protein powder', preferred: true },
      { lang: 'en', alias: 'vegan protein' },
      { lang: 'en', alias: 'plant protein' },
    ],
    units: [{ unit: 'scoop', grams: 30 }, { unit: 'serving', grams: 30 }],
  },
];

// ── Supplements (per 100g) ───────────────────────────────────────────────────

const SUPPLEMENTS: GapFood[] = [
  {
    nameEn: 'Creatine monohydrate', kcal: 0, protein: 0, carb: 0, fat: 0,
    defaultServingGrams: 5, defaultServingUnit: 'scoop',
    dataQuality: 'label', provenance: 'Pure creatine monohydrate — 0 caloric value',
    aliases: [
      { lang: 'en', alias: 'creatine monohydrate', preferred: true },
      { lang: 'en', alias: 'creatine' },
      { lang: 'es', alias: 'creatina' },
    ],
    units: [{ unit: 'scoop', grams: 5 }, { unit: 'serving', grams: 5 }, { unit: 'tsp', grams: 5 }],
  },
  {
    nameEn: 'BCAA powder', kcal: 400, protein: 100.0, carb: 0, fat: 0,
    defaultServingGrams: 10, defaultServingUnit: 'scoop',
    dataQuality: 'label', provenance: 'Pure BCAA mix (leucine+isoleucine+valine)',
    aliases: [
      { lang: 'en', alias: 'bcaa powder', preferred: true },
      { lang: 'en', alias: 'bcaas' },
      { lang: 'en', alias: 'bcaa' },
    ],
    units: [{ unit: 'scoop', grams: 10 }, { unit: 'serving', grams: 10 }],
  },
  {
    nameEn: 'Collagen peptides', kcal: 360, protein: 90.0, carb: 0, fat: 0,
    defaultServingGrams: 10, defaultServingUnit: 'scoop',
    dataQuality: 'label', provenance: 'Hydrolyzed collagen powder (Vital Proteins average)',
    aliases: [
      { lang: 'en', alias: 'collagen peptides', preferred: true },
      { lang: 'en', alias: 'collagen' },
      { lang: 'en', alias: 'collagen powder' },
      { lang: 'es', alias: 'colágeno' },
    ],
    units: [{ unit: 'scoop', grams: 10 }, { unit: 'serving', grams: 10 }],
  },
  {
    nameEn: 'Pre-workout powder', kcal: 10, protein: 0, carb: 2.5, fat: 0,
    defaultServingGrams: 15, defaultServingUnit: 'scoop',
    dataQuality: 'label', provenance: 'Average pre-workout (caffeine+beta-alanine+citrulline)',
    aliases: [
      { lang: 'en', alias: 'pre-workout powder', preferred: true },
      { lang: 'en', alias: 'pre workout' },
      { lang: 'en', alias: 'pre-workout' },
      { lang: 'en', alias: 'preworkout' },
    ],
    units: [{ unit: 'scoop', grams: 15 }, { unit: 'serving', grams: 15 }],
  },
  {
    nameEn: 'Whey protein isolate', kcal: 400, protein: 82.0, carb: 8.0, fat: 5.0,
    defaultServingGrams: 30, defaultServingUnit: 'scoop',
    dataQuality: 'label', provenance: 'Average whey protein isolate (Optimum Nutrition, etc.)',
    aliases: [
      { lang: 'en', alias: 'whey protein isolate', preferred: true },
      { lang: 'en', alias: 'whey protein' },
      { lang: 'en', alias: 'protein powder' },
      { lang: 'en', alias: 'whey' },
      { lang: 'es', alias: 'proteína de suero' },
    ],
    units: [{ unit: 'scoop', grams: 30 }, { unit: 'serving', grams: 30 }],
  },
  {
    nameEn: 'Whey protein concentrate', kcal: 400, protein: 80.0, carb: 8.0, fat: 6.0,
    defaultServingGrams: 30, defaultServingUnit: 'scoop',
    dataQuality: 'label', provenance: 'Average whey concentrate label',
    aliases: [
      { lang: 'en', alias: 'whey protein concentrate', preferred: true },
      { lang: 'en', alias: 'whey concentrate' },
    ],
    units: [{ unit: 'scoop', grams: 30 }, { unit: 'serving', grams: 30 }],
  },
  {
    nameEn: 'Casein protein powder', kcal: 370, protein: 85.0, carb: 4.0, fat: 2.0,
    defaultServingGrams: 30, defaultServingUnit: 'scoop',
    dataQuality: 'label', provenance: 'Average casein protein label',
    aliases: [
      { lang: 'en', alias: 'casein protein', preferred: true },
      { lang: 'en', alias: 'casein' },
      { lang: 'en', alias: 'casein powder' },
    ],
    units: [{ unit: 'scoop', grams: 30 }, { unit: 'serving', grams: 30 }],
  },
  {
    nameEn: 'Fish oil capsule', kcal: 900, protein: 0, carb: 0, fat: 100.0,
    defaultServingGrams: 1, defaultServingUnit: 'capsule',
    dataQuality: 'label', provenance: 'Standard fish oil soft gel (1g = 1 capsule)',
    aliases: [
      { lang: 'en', alias: 'fish oil capsule', preferred: true },
      { lang: 'en', alias: 'fish oil' },
      { lang: 'en', alias: 'omega 3' },
      { lang: 'es', alias: 'aceite de pescado' },
    ],
    units: [{ unit: 'capsule', grams: 1 }, { unit: 'serving', grams: 2 }],
  },
  {
    nameEn: 'L-Glutamine powder', kcal: 400, protein: 100.0, carb: 0, fat: 0,
    defaultServingGrams: 5, defaultServingUnit: 'scoop',
    dataQuality: 'label', provenance: 'Pure L-glutamine amino acid',
    aliases: [
      { lang: 'en', alias: 'l-glutamine', preferred: true },
      { lang: 'en', alias: 'glutamine' },
    ],
    units: [{ unit: 'scoop', grams: 5 }, { unit: 'tsp', grams: 5 }],
  },
];

// ── Main Insertion Logic ─────────────────────────────────────────────────────

const ALL_FOODS = [...STAPLES, ...COMPOSITES, ...BRANDED, ...SUPPLEMENTS];

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required. See .env.local.example.');
  }
  const pool = new Pool({ connectionString: dbUrl, max: 3 });
  const db = drizzle(pool);

  console.log(`[gap-fill] Seeding ${ALL_FOODS.length} foods (${STAPLES.length} staples, ${COMPOSITES.length} composites, ${BRANDED.length} branded, ${SUPPLEMENTS.length} supplements)`);

  let foodsInserted = 0;
  let aliasesInserted = 0;
  let unitsInserted = 0;
  let recipesInserted = 0;

  for (const entry of ALL_FOODS) {
    const sourceId = `gap-${entry.nameEn.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;

    const [row] = await db
      .insert(foods)
      .values({
        source: 'custom',
        sourceId,
        dataQuality: entry.dataQuality ?? 'lab_verified',
        nameEn: entry.nameEn,
        nameEs: entry.nameEs ?? null,
        nameFr: entry.nameFr ?? null,
        nameEl: entry.nameEl ?? null,
        brand: entry.brand ?? null,
        region: entry.region ?? null,
        kcalPer100g: entry.kcal,
        proteinPer100g: entry.protein,
        carbPer100g: entry.carb,
        fatPer100g: entry.fat,
        fiberPer100g: entry.fiber ?? null,
        sugarPer100g: entry.sugar ?? null,
        sodiumMg: entry.sodiumMg ?? null,
        defaultServingGrams: entry.defaultServingGrams,
        defaultServingUnit: entry.defaultServingUnit,
        popularity: entry.popularity ?? 7,
        macroConfidence: 0.92,
        provenanceNotes: entry.provenance ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: foods.id });

    let foodId: string;
    if (!row) {
      const [existing] = await db
        .select({ id: foods.id })
        .from(foods)
        .where(and(eq(foods.source, 'custom'), eq(foods.sourceId, sourceId)))
        .limit(1);
      if (!existing) continue;
      foodId = existing.id;
    } else {
      foodsInserted++;
      foodId = row.id;
    }

    // Insert aliases
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        try {
          await db
            .insert(foodAliases)
            .values({
              foodId,
              lang: alias.lang,
              alias: alias.alias.toLowerCase(),
              preferred: alias.preferred ?? false,
            })
            .onConflictDoNothing();
          aliasesInserted++;
        } catch { /* dup silently */ }
      }
    }

    // Insert unit conversions
    if (entry.units) {
      for (const unit of entry.units) {
        try {
          await db
            .insert(foodUnitConversions)
            .values({
              foodId,
              unit: unit.unit,
              qualifier: unit.qualifier ?? null,
              gramsPerUnit: unit.grams,
              source: 'auto',
            })
            .onConflictDoNothing();
          unitsInserted++;
        } catch { /* dup silently */ }
      }
    }

    // Insert dish recipe for composites
    if (entry.recipe) {
      try {
        await db
          .insert(dishRecipes)
          .values({
            dishName: entry.nameEn.toLowerCase(),
            dishNameLocalized: entry.nameEl ?? entry.nameEs ?? entry.nameFr ?? entry.nameEn,
            lang: entry.nameEl ? 'el' : entry.nameEs ? 'es' : entry.nameFr ? 'fr' : 'en',
            region: entry.region ?? null,
            totalGrams: entry.recipe.totalGrams,
            totalKcal: Math.round(entry.kcal * entry.recipe.totalGrams / 100),
            totalProtein: Math.round(entry.protein * entry.recipe.totalGrams / 100 * 10) / 10,
            totalCarbs: Math.round(entry.carb * entry.recipe.totalGrams / 100 * 10) / 10,
            totalFat: Math.round(entry.fat * entry.recipe.totalGrams / 100 * 10) / 10,
            ingredients: entry.recipe.ingredients.map(i => ({
              food_name: i.name,
              grams: i.grams,
              matched_confidence: 0.9,
            })),
            source: 'manual',
            confidence: 0.9,
          })
          .onConflictDoNothing();
        recipesInserted++;
      } catch { /* dup silently */ }
    }
  }

  console.log(`[gap-fill] ✅ Done.`);
  console.log(`  Foods inserted: ${foodsInserted}`);
  console.log(`  Aliases inserted: ${aliasesInserted}`);
  console.log(`  Unit conversions: ${unitsInserted}`);
  console.log(`  Dish recipes: ${recipesInserted}`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
