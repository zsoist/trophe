/**
 * scripts/ingest/seed-greek-colombian.ts — curated Greek + Colombian dishes.
 *
 * ~95 staple dishes with per-100g macros derived from USDA/CIQUAL/HHF
 * references, native-language aliases (el/es) and serving conversions.
 * source='custom', source_id 'gr-*' / 'co-*'. Idempotent.
 *
 * Usage: npx tsx scripts/ingest/seed-greek-colombian.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

interface Seed {
  id: string;            // source_id
  en: string;            // name_en
  el?: string;           // name_el
  es?: string;           // name_es
  kcal: number; p: number; c: number; f: number;  // per 100g
  fiber?: number;
  serving: number;       // default serving grams
  region: string[];
  aliases: Array<[string, string]>;  // [lang, alias]
  units?: Array<[string, number]>;   // [unit, grams]
}

const GREEK: Seed[] = [
  { id: 'gr-moussaka', en: 'Moussaka', el: 'Μουσακάς', kcal: 132, p: 5.8, c: 9, f: 8.4, serving: 300, region: ['GR'], aliases: [['el','μουσακάς'],['el','μουσακα'],['en','moussaka'],['en','mousaka']], units: [['piece',300],['serving',300]] },
  { id: 'gr-pastitsio', en: 'Pastitsio', el: 'Παστίτσιο', kcal: 160, p: 8, c: 14, f: 8, serving: 300, region: ['GR'], aliases: [['el','παστίτσιο'],['el','παστιτσιο'],['en','pastitsio']], units: [['piece',300],['serving',300]] },
  { id: 'gr-gemista', en: 'Gemista (stuffed vegetables with rice)', el: 'Γεμιστά', kcal: 95, p: 2, c: 12, f: 4.5, serving: 350, region: ['GR'], aliases: [['el','γεμιστά'],['el','γεμιστα'],['en','gemista'],['en','stuffed tomatoes with rice']], units: [['piece',175],['serving',350]] },
  { id: 'gr-dolmades', en: 'Dolmades (stuffed grape leaves)', el: 'Ντολμάδες', kcal: 150, p: 3.5, c: 15, f: 8.5, serving: 180, region: ['GR'], aliases: [['el','ντολμάδες'],['el','ντολμαδάκια'],['en','dolmades'],['en','dolmadakia'],['en','stuffed grape leaves']], units: [['piece',30],['serving',180]] },
  { id: 'gr-spanakopita', en: 'Spanakopita (spinach pie)', el: 'Σπανακόπιτα', kcal: 230, p: 7, c: 22, f: 13, serving: 150, region: ['GR'], aliases: [['el','σπανακόπιτα'],['el','σπανακοπιτα'],['en','spanakopita'],['en','spinach pie']], units: [['piece',150],['slice',150]] },
  { id: 'gr-tiropita', en: 'Tiropita (cheese pie)', el: 'Τυρόπιτα', kcal: 290, p: 9, c: 25, f: 17.5, serving: 140, region: ['GR'], aliases: [['el','τυρόπιτα'],['el','τυροπιτα'],['en','tiropita'],['en','cheese pie greek']], units: [['piece',140],['slice',140]] },
  { id: 'gr-gyros-pita', en: 'Gyros pita wrap (pork)', el: 'Γύρος πίτα', kcal: 217, p: 12, c: 20, f: 10.5, serving: 330, region: ['GR'], aliases: [['el','γύρος πίτα'],['el','γυρος πιτα χοιρινό'],['en','gyros pita'],['en','gyro wrap']], units: [['piece',330],['serving',330]] },
  { id: 'gr-souvlaki-chicken', en: 'Souvlaki chicken skewer', el: 'Σουβλάκι κοτόπουλο', kcal: 165, p: 25, c: 2, f: 6.5, serving: 100, region: ['GR'], aliases: [['el','σουβλάκι κοτόπουλο'],['en','chicken souvlaki'],['en','souvlaki skewer chicken']], units: [['piece',100],['serving',200]] },
  { id: 'gr-horiatiki', en: 'Greek village salad (horiatiki)', el: 'Χωριάτικη σαλάτα', kcal: 105, p: 2.5, c: 4.5, f: 9, serving: 320, region: ['GR'], aliases: [['el','χωριάτικη'],['el','χωριάτικη σαλάτα'],['en','horiatiki'],['en','greek village salad']], units: [['serving',320],['bowl',320]] },
  { id: 'gr-fasolada', en: 'Fasolada (Greek bean soup)', el: 'Φασολάδα', kcal: 90, p: 4.5, c: 12, f: 2.8, fiber: 4, serving: 350, region: ['GR'], aliases: [['el','φασολάδα'],['el','φασολαδα'],['en','fasolada'],['en','greek bean soup']], units: [['bowl',350],['serving',350]] },
  { id: 'gr-keftedes', en: 'Keftedes (Greek meatballs)', el: 'Κεφτέδες', kcal: 230, p: 14, c: 9, f: 15, serving: 150, region: ['GR'], aliases: [['el','κεφτέδες'],['el','κεφτεδάκια'],['en','keftedes'],['en','greek meatballs']], units: [['piece',30],['serving',150]] },
  { id: 'gr-soutzoukakia', en: 'Soutzoukakia (meatballs in tomato sauce)', el: 'Σουτζουκάκια', kcal: 180, p: 11, c: 7, f: 12, serving: 250, region: ['GR'], aliases: [['el','σουτζουκάκια'],['en','soutzoukakia']], units: [['piece',60],['serving',250]] },
  { id: 'gr-stifado', en: 'Stifado (beef and onion stew)', el: 'Στιφάδο', kcal: 130, p: 12, c: 6, f: 6.5, serving: 350, region: ['GR'], aliases: [['el','στιφάδο'],['el','στιφαδο'],['en','stifado']], units: [['serving',350],['bowl',350]] },
  { id: 'gr-kleftiko', en: 'Lamb kleftiko', el: 'Κλέφτικο', kcal: 190, p: 17, c: 2, f: 13, serving: 300, region: ['GR'], aliases: [['el','κλέφτικο'],['el','αρνί κλέφτικο'],['en','kleftiko'],['en','lamb kleftiko']], units: [['serving',300]] },
  { id: 'gr-kokkinisto', en: 'Kokkinisto (beef in red sauce)', el: 'Κοκκινιστό', kcal: 140, p: 13, c: 6, f: 7, serving: 350, region: ['GR'], aliases: [['el','κοκκινιστό'],['el','μοσχάρι κοκκινιστό'],['en','kokkinisto']], units: [['serving',350]] },
  { id: 'gr-briam', en: 'Briam (Greek roasted vegetables)', el: 'Μπριάμ', kcal: 80, p: 1.5, c: 8, f: 4.5, fiber: 2.5, serving: 300, region: ['GR'], aliases: [['el','μπριάμ'],['el','μπριαμ'],['en','briam']], units: [['serving',300]] },
  { id: 'gr-imam', en: 'Imam baildi (stuffed eggplant)', el: 'Ιμάμ μπαϊλντί', kcal: 95, p: 1.5, c: 9, f: 6, serving: 280, region: ['GR'], aliases: [['el','ιμάμ'],['el','ιμάμ μπαϊλντί'],['en','imam baildi'],['en','imam bayildi']], units: [['piece',280],['serving',280]] },
  { id: 'gr-saganaki', en: 'Saganaki (fried cheese)', el: 'Σαγανάκι', kcal: 350, p: 17, c: 8, f: 28, serving: 100, region: ['GR'], aliases: [['el','σαγανάκι'],['el','σαγανακι'],['en','saganaki'],['en','fried cheese greek']], units: [['piece',100],['serving',100]] },
  { id: 'gr-taramasalata', en: 'Taramasalata', el: 'Ταραμοσαλάτα', kcal: 510, p: 3, c: 8, f: 52, serving: 50, region: ['GR'], aliases: [['el','ταραμοσαλάτα'],['el','ταραμάς'],['en','taramasalata'],['en','tarama']], units: [['tablespoon',25],['serving',50]] },
  { id: 'gr-melitzanosalata', en: 'Melitzanosalata (eggplant dip)', el: 'Μελιτζανοσαλάτα', kcal: 110, p: 1.5, c: 6, f: 9, serving: 60, region: ['GR'], aliases: [['el','μελιτζανοσαλάτα'],['en','melitzanosalata'],['en','eggplant dip greek']], units: [['tablespoon',30],['serving',60]] },
  { id: 'gr-skordalia', en: 'Skordalia (garlic potato dip)', el: 'Σκορδαλιά', kcal: 220, p: 2.5, c: 15, f: 17, serving: 60, region: ['GR'], aliases: [['el','σκορδαλιά'],['en','skordalia']], units: [['tablespoon',30],['serving',60]] },
  { id: 'gr-tirokafteri', en: 'Tirokafteri (spicy feta dip)', el: 'Τυροκαφτερή', kcal: 250, p: 8, c: 4, f: 22, serving: 60, region: ['GR'], aliases: [['el','τυροκαφτερή'],['el','χτυπητή'],['en','tirokafteri'],['en','htipiti']], units: [['tablespoon',30],['serving',60]] },
  { id: 'gr-loukoumades', en: 'Loukoumades (honey dough balls)', el: 'Λουκουμάδες', kcal: 330, p: 4, c: 45, f: 15, serving: 150, region: ['GR'], aliases: [['el','λουκουμάδες'],['el','λουκουμαδες'],['en','loukoumades']], units: [['piece',25],['serving',150]] },
  { id: 'gr-baklava', en: 'Baklava', el: 'Μπακλαβάς', kcal: 430, p: 5, c: 52, f: 23, serving: 90, region: ['GR'], aliases: [['el','μπακλαβάς'],['el','μπακλαβας'],['en','baklava']], units: [['piece',90],['slice',90]] },
  { id: 'gr-galaktoboureko', en: 'Galaktoboureko (custard pastry)', el: 'Γαλακτομπούρεκο', kcal: 280, p: 5, c: 35, f: 14, serving: 130, region: ['GR'], aliases: [['el','γαλακτομπούρεκο'],['en','galaktoboureko']], units: [['piece',130],['slice',130]] },
  { id: 'gr-kataifi', en: 'Kataifi (shredded pastry with nuts)', el: 'Κανταΐφι', kcal: 400, p: 5, c: 50, f: 20, serving: 100, region: ['GR'], aliases: [['el','κανταΐφι'],['el','καταΐφι'],['en','kataifi']], units: [['piece',100]] },
  { id: 'gr-bougatsa', en: 'Bougatsa (custard phyllo pastry)', el: 'Μπουγάτσα', kcal: 270, p: 6, c: 32, f: 13, serving: 150, region: ['GR'], aliases: [['el','μπουγάτσα'],['el','μπουγατσα'],['en','bougatsa']], units: [['piece',150],['serving',150]] },
  { id: 'gr-halva', en: 'Halva (semolina)', el: 'Χαλβάς', kcal: 470, p: 7, c: 60, f: 22, serving: 80, region: ['GR'], aliases: [['el','χαλβάς'],['el','χαλβας'],['en','halva'],['en','halvas']], units: [['piece',80],['slice',80]] },
  { id: 'gr-koulouri', en: 'Koulouri (sesame bread ring)', el: 'Κουλούρι', kcal: 290, p: 9, c: 53, f: 5, serving: 90, region: ['GR'], aliases: [['el','κουλούρι'],['el','κουλούρι Θεσσαλονίκης'],['en','koulouri'],['en','sesame bread ring']], units: [['piece',90]] },
  { id: 'gr-paximadi', en: 'Paximadi (barley rusk)', el: 'Παξιμάδι', kcal: 380, p: 10, c: 70, f: 6, fiber: 8, serving: 50, region: ['GR'], aliases: [['el','παξιμάδι'],['el','παξιμαδι'],['en','paximadi'],['en','barley rusk'],['en','dakos rusk']], units: [['piece',50]] },
  { id: 'gr-frappe', en: 'Frappe coffee (with milk and sugar)', el: 'Φραπέ', kcal: 45, p: 1.5, c: 6, f: 1.8, serving: 250, region: ['GR'], aliases: [['el','φραπέ'],['el','φραπες'],['en','frappe'],['en','greek frappe']], units: [['glass',250],['serving',250]] },
  { id: 'gr-freddo', en: 'Freddo espresso', el: 'Φρέντο εσπρέσο', kcal: 15, p: 0.3, c: 2.5, f: 0.3, serving: 200, region: ['GR'], aliases: [['el','φρέντο'],['el','φρέντο εσπρέσο'],['en','freddo espresso']], units: [['glass',200],['serving',200]] },
  { id: 'gr-graviera', en: 'Graviera cheese', el: 'Γραβιέρα', kcal: 400, p: 25, c: 2, f: 32, serving: 30, region: ['GR'], aliases: [['el','γραβιέρα'],['el','γραβιερα'],['en','graviera']], units: [['slice',30],['piece',30]] },
  { id: 'gr-kasseri', en: 'Kasseri cheese', el: 'Κασέρι', kcal: 350, p: 24, c: 2, f: 28, serving: 30, region: ['GR'], aliases: [['el','κασέρι'],['el','κασερι'],['en','kasseri']], units: [['slice',30],['piece',30]] },
  { id: 'gr-manouri', en: 'Manouri cheese', el: 'Μανούρι', kcal: 340, p: 11, c: 2, f: 32, serving: 40, region: ['GR'], aliases: [['el','μανούρι'],['en','manouri']], units: [['slice',40]] },
  { id: 'gr-mizithra', en: 'Mizithra cheese (fresh)', el: 'Μυζήθρα', kcal: 250, p: 16, c: 3, f: 19, serving: 40, region: ['GR'], aliases: [['el','μυζήθρα'],['el','μυζηθρα'],['en','mizithra'],['en','myzithra']], units: [['slice',40],['tablespoon',15]] },
  { id: 'gr-kefalotyri', en: 'Kefalotyri cheese', el: 'Κεφαλοτύρι', kcal: 390, p: 26, c: 2, f: 31, serving: 30, region: ['GR'], aliases: [['el','κεφαλοτύρι'],['en','kefalotyri']], units: [['slice',30]] },
  { id: 'gr-horta', en: 'Horta (boiled wild greens with oil)', el: 'Χόρτα', kcal: 55, p: 2, c: 4, f: 3.5, fiber: 3, serving: 250, region: ['GR'], aliases: [['el','χόρτα'],['el','χορτα βραστά'],['en','horta'],['en','boiled greens greek']], units: [['serving',250]] },
  { id: 'gr-gigantes', en: 'Gigantes plaki (baked giant beans)', el: 'Γίγαντες', kcal: 130, p: 5.5, c: 14, f: 6, fiber: 5, serving: 280, region: ['GR'], aliases: [['el','γίγαντες'],['el','γιγαντες πλακί'],['en','gigantes'],['en','giant baked beans']], units: [['serving',280]] },
  { id: 'gr-kalamarakia', en: 'Kalamarakia (fried calamari)', el: 'Καλαμαράκια τηγανητά', kcal: 175, p: 12, c: 12, f: 9, serving: 200, region: ['GR'], aliases: [['el','καλαμαράκια'],['el','καλαμαράκια τηγανητά'],['en','fried calamari'],['en','kalamarakia']], units: [['serving',200]] },
  { id: 'gr-trahanas', en: 'Trahana soup', el: 'Τραχανάς', kcal: 110, p: 4, c: 18, f: 2.5, serving: 300, region: ['GR'], aliases: [['el','τραχανάς'],['el','τραχανας'],['en','trahana'],['en','trahanas']], units: [['bowl',300]] },
  { id: 'gr-avgolemono', en: 'Avgolemono soup (chicken egg-lemon)', el: 'Αυγολέμονο', kcal: 75, p: 5, c: 8, f: 2.5, serving: 350, region: ['GR'], aliases: [['el','αυγολέμονο'],['el','κοτόσουπα αυγολέμονο'],['en','avgolemono'],['en','egg lemon soup']], units: [['bowl',350]] },
  { id: 'gr-revithada', en: 'Revithada (chickpea stew)', el: 'Ρεβιθάδα', kcal: 115, p: 5.5, c: 16, f: 3.5, fiber: 4.5, serving: 320, region: ['GR'], aliases: [['el','ρεβιθάδα'],['el','ρεβίθια'],['en','revithada'],['en','greek chickpea stew']], units: [['bowl',320]] },
  { id: 'gr-papoutsakia', en: 'Papoutsakia (stuffed eggplant with mince)', el: 'Παπουτσάκια', kcal: 135, p: 7, c: 8, f: 8.5, serving: 300, region: ['GR'], aliases: [['el','παπουτσάκια'],['en','papoutsakia']], units: [['piece',150],['serving',300]] },
  { id: 'gr-bifteki', en: 'Bifteki (Greek grilled burger patty)', el: 'Μπιφτέκι', kcal: 215, p: 17, c: 5, f: 14, serving: 150, region: ['GR'], aliases: [['el','μπιφτέκι'],['el','μπιφτεκι'],['en','bifteki']], units: [['piece',150]] },
  { id: 'gr-pita-bread', en: 'Pita bread (Greek, for souvlaki)', el: 'Πίτα', kcal: 275, p: 9, c: 50, f: 4.5, serving: 70, region: ['GR'], aliases: [['el','πίτα σουβλάκι'],['en','greek pita'],['en','souvlaki pita']], units: [['piece',70]] },
];

const COLOMBIAN: Seed[] = [
  { id: 'co-bandeja-paisa', en: 'Bandeja paisa', es: 'Bandeja paisa', kcal: 185, p: 10, c: 14, f: 10, serving: 650, region: ['CO'], aliases: [['es','bandeja paisa'],['en','bandeja paisa']], units: [['serving',650],['piece',650]] },
  { id: 'co-sancocho', en: 'Sancocho (Colombian stew)', es: 'Sancocho', kcal: 85, p: 5, c: 9, f: 3, serving: 450, region: ['CO'], aliases: [['es','sancocho'],['es','sancocho de gallina'],['en','sancocho']], units: [['bowl',450],['serving',450]] },
  { id: 'co-arepa-blanca', en: 'Arepa (white corn)', es: 'Arepa blanca', kcal: 220, p: 4.5, c: 45, f: 2.5, serving: 75, region: ['CO'], aliases: [['es','arepa'],['es','arepa blanca'],['en','arepa']], units: [['piece',75]] },
  { id: 'co-arepa-queso', en: 'Arepa con queso', es: 'Arepa con queso', kcal: 260, p: 8, c: 38, f: 8.5, serving: 100, region: ['CO'], aliases: [['es','arepa con queso'],['es','arepa de queso'],['en','cheese arepa']], units: [['piece',100]] },
  { id: 'co-arepa-huevo', en: 'Arepa de huevo (fried egg arepa)', es: 'Arepa de huevo', kcal: 290, p: 9, c: 28, f: 16, serving: 120, region: ['CO'], aliases: [['es','arepa de huevo'],['es','arepa e huevo'],['en','egg arepa']], units: [['piece',120]] },
  { id: 'co-empanada', en: 'Empanada colombiana (fried)', es: 'Empanada colombiana', kcal: 280, p: 8, c: 30, f: 14, serving: 80, region: ['CO'], aliases: [['es','empanada colombiana'],['es','empanada de carne'],['en','colombian empanada']], units: [['piece',80]] },
  { id: 'co-tamal', en: 'Tamal tolimense', es: 'Tamal tolimense', kcal: 140, p: 6, c: 14, f: 6.5, serving: 400, region: ['CO'], aliases: [['es','tamal'],['es','tamal tolimense'],['en','colombian tamal']], units: [['piece',400]] },
  { id: 'co-lechona', en: 'Lechona (stuffed roast pork with rice)', es: 'Lechona', kcal: 250, p: 16, c: 12, f: 15, serving: 250, region: ['CO'], aliases: [['es','lechona'],['es','lechona tolimense'],['en','lechona']], units: [['serving',250]] },
  { id: 'co-chicharron', en: 'Chicharrón (fried pork belly)', es: 'Chicharrón', kcal: 540, p: 25, c: 1, f: 48, serving: 80, region: ['CO'], aliases: [['es','chicharrón'],['es','chicharron'],['en','pork crackling'],['en','chicharron']], units: [['piece',40],['serving',80]] },
  { id: 'co-frijoles', en: 'Frijoles antioqueños (Colombian beans)', es: 'Frijoles antioqueños', kcal: 120, p: 6.5, c: 15, f: 4, fiber: 5, serving: 300, region: ['CO'], aliases: [['es','frijoles antioqueños'],['es','frijoles con garra'],['en','colombian beans']], units: [['bowl',300],['serving',300]] },
  { id: 'co-hogao', en: 'Hogao (Colombian tomato-onion sauce)', es: 'Hogao', kcal: 90, p: 1.5, c: 8, f: 6, serving: 50, region: ['CO'], aliases: [['es','hogao'],['en','hogao']], units: [['tablespoon',25],['serving',50]] },
  { id: 'co-arroz-coco', en: 'Arroz con coco (coconut rice)', es: 'Arroz con coco', kcal: 190, p: 3.5, c: 30, f: 6.5, serving: 150, region: ['CO'], aliases: [['es','arroz con coco'],['en','coconut rice colombian']], units: [['serving',150],['cup',150]] },
  { id: 'co-changua', en: 'Changua (milk and egg soup)', es: 'Changua', kcal: 55, p: 3.5, c: 5, f: 2.5, serving: 350, region: ['CO'], aliases: [['es','changua'],['en','changua']], units: [['bowl',350]] },
  { id: 'co-caldo-costilla', en: 'Caldo de costilla (rib broth)', es: 'Caldo de costilla', kcal: 60, p: 5, c: 3, f: 3, serving: 400, region: ['CO'], aliases: [['es','caldo de costilla'],['en','rib broth']], units: [['bowl',400]] },
  { id: 'co-mondongo', en: 'Mondongo (tripe soup)', es: 'Mondongo', kcal: 90, p: 8, c: 6, f: 4, serving: 450, region: ['CO'], aliases: [['es','mondongo'],['en','mondongo'],['en','tripe soup colombian']], units: [['bowl',450]] },
  { id: 'co-cazuela-mariscos', en: 'Cazuela de mariscos (seafood casserole)', es: 'Cazuela de mariscos', kcal: 110, p: 9, c: 7, f: 5.5, serving: 400, region: ['CO'], aliases: [['es','cazuela de mariscos'],['en','seafood casserole colombian']], units: [['bowl',400],['serving',400]] },
  { id: 'co-arroz-atollado', en: 'Arroz atollado', es: 'Arroz atollado', kcal: 160, p: 7, c: 20, f: 5.5, serving: 350, region: ['CO'], aliases: [['es','arroz atollado'],['en','arroz atollado']], units: [['serving',350]] },
  { id: 'co-bunuelo', en: 'Buñuelo colombiano', es: 'Buñuelo', kcal: 330, p: 7, c: 35, f: 18, serving: 60, region: ['CO'], aliases: [['es','buñuelo'],['es','buñuelos'],['en','bunuelo']], units: [['piece',60]] },
  { id: 'co-almojabana', en: 'Almojábana (cheese bread)', es: 'Almojábana', kcal: 280, p: 9, c: 32, f: 12, serving: 65, region: ['CO'], aliases: [['es','almojábana'],['es','almojabana'],['en','almojabana']], units: [['piece',65]] },
  { id: 'co-avena', en: 'Avena colombiana (oat drink)', es: 'Avena colombiana', kcal: 75, p: 2.5, c: 13, f: 1.5, serving: 300, region: ['CO'], aliases: [['es','avena colombiana'],['es','avena fría'],['en','colombian oat drink']], units: [['glass',300]] },
  { id: 'co-lulada', en: 'Lulada (lulo fruit drink)', es: 'Lulada', kcal: 70, p: 0.5, c: 17, f: 0.2, serving: 350, region: ['CO'], aliases: [['es','lulada'],['en','lulada']], units: [['glass',350]] },
  { id: 'co-champus', en: 'Champús (corn fruit drink)', es: 'Champús', kcal: 95, p: 1, c: 22, f: 0.5, serving: 300, region: ['CO'], aliases: [['es','champús'],['es','champus'],['en','champus']], units: [['glass',300]] },
  { id: 'co-jugo-lulo', en: 'Lulo juice', es: 'Jugo de lulo', kcal: 45, p: 0.5, c: 10, f: 0.2, serving: 300, region: ['CO'], aliases: [['es','jugo de lulo'],['en','lulo juice']], units: [['glass',300]] },
  { id: 'co-arequipe', en: 'Arequipe (dulce de leche)', es: 'Arequipe', kcal: 320, p: 6, c: 55, f: 8, serving: 30, region: ['CO'], aliases: [['es','arequipe'],['es','dulce de leche'],['en','arequipe'],['en','dulce de leche']], units: [['tablespoon',20],['serving',30]] },
  { id: 'co-obleas', en: 'Obleas con arequipe (wafer sandwich)', es: 'Obleas con arequipe', kcal: 350, p: 5, c: 65, f: 8, serving: 50, region: ['CO'], aliases: [['es','obleas'],['es','oblea con arequipe'],['en','obleas']], units: [['piece',50]] },
  { id: 'co-natilla', en: 'Natilla colombiana', es: 'Natilla', kcal: 180, p: 3, c: 30, f: 5, serving: 120, region: ['CO'], aliases: [['es','natilla'],['en','natilla']], units: [['piece',120],['slice',120]] },
  { id: 'co-pernil', en: 'Pernil de cerdo (roast pork leg)', es: 'Pernil de cerdo', kcal: 230, p: 22, c: 2, f: 15, serving: 180, region: ['CO'], aliases: [['es','pernil de cerdo'],['es','pernil'],['en','roast pork leg']], units: [['serving',180]] },
  { id: 'co-carne-polvo', en: 'Carne en polvo (powdered beef)', es: 'Carne en polvo', kcal: 200, p: 28, c: 3, f: 9, serving: 100, region: ['CO'], aliases: [['es','carne en polvo'],['en','powdered beef colombian']], units: [['serving',100]] },
  { id: 'co-sobrebarriga', en: 'Sobrebarriga (flank steak stew)', es: 'Sobrebarriga', kcal: 180, p: 20, c: 2, f: 11, serving: 200, region: ['CO'], aliases: [['es','sobrebarriga'],['en','sobrebarriga']], units: [['serving',200]] },
  { id: 'co-aji', en: 'Ají colombiano (Colombian salsa)', es: 'Ají colombiano', kcal: 45, p: 1.5, c: 8, f: 1, serving: 30, region: ['CO'], aliases: [['es','ají'],['es','aji colombiano'],['en','colombian aji']], units: [['tablespoon',15]] },
  { id: 'co-sudado-pollo', en: 'Sudado de pollo (chicken stew)', es: 'Sudado de pollo', kcal: 110, p: 10, c: 8, f: 4, serving: 350, region: ['CO'], aliases: [['es','sudado de pollo'],['en','colombian chicken stew']], units: [['serving',350]] },
  { id: 'co-sudado-res', en: 'Sudado de res (beef stew)', es: 'Sudado de res', kcal: 120, p: 11, c: 8, f: 5, serving: 350, region: ['CO'], aliases: [['es','sudado de res'],['es','sudado de carne'],['en','colombian beef stew']], units: [['serving',350]] },
  { id: 'co-pescado-frito', en: 'Pescado frito (fried whole fish)', es: 'Pescado frito', kcal: 220, p: 20, c: 8, f: 12, serving: 250, region: ['CO'], aliases: [['es','pescado frito'],['es','mojarra frita'],['en','fried whole fish']], units: [['piece',250],['serving',250]] },
  { id: 'co-calentado', en: 'Calentado (refried rice and beans breakfast)', es: 'Calentado', kcal: 165, p: 7, c: 20, f: 7, serving: 350, region: ['CO'], aliases: [['es','calentado'],['es','calentao'],['en','calentado']], units: [['serving',350]] },
  { id: 'co-huevos-pericos', en: 'Huevos pericos (scrambled eggs with tomato and onion)', es: 'Huevos pericos', kcal: 155, p: 10, c: 4, f: 11, serving: 150, region: ['CO'], aliases: [['es','huevos pericos'],['en','huevos pericos']], units: [['serving',150]] },
  { id: 'co-chocolate-santafereno', en: 'Chocolate santafereño (hot chocolate with cheese)', es: 'Chocolate santafereño', kcal: 90, p: 3, c: 12, f: 3.5, serving: 250, region: ['CO'], aliases: [['es','chocolate santafereño'],['es','chocolate con queso'],['en','colombian hot chocolate']], units: [['cup',250]] },
  { id: 'co-mazamorra', en: 'Mazamorra (corn in milk)', es: 'Mazamorra', kcal: 85, p: 2.5, c: 16, f: 1.5, serving: 300, region: ['CO'], aliases: [['es','mazamorra'],['en','mazamorra']], units: [['bowl',300]] },
  { id: 'co-salchipapas', en: 'Salchipapas (fries with sausage)', es: 'Salchipapas', kcal: 290, p: 8, c: 28, f: 17, serving: 300, region: ['CO'], aliases: [['es','salchipapas'],['en','salchipapas']], units: [['serving',300]] },
  { id: 'co-chuzo', en: 'Chuzo de carne (meat skewer)', es: 'Chuzo de carne', kcal: 190, p: 22, c: 4, f: 10, serving: 130, region: ['CO'], aliases: [['es','chuzo'],['es','chuzo de carne'],['en','colombian meat skewer']], units: [['piece',130]] },
  { id: 'co-papa-criolla', en: 'Papa criolla (fried creole potatoes)', es: 'Papa criolla', kcal: 165, p: 2.5, c: 26, f: 6, serving: 150, region: ['CO'], aliases: [['es','papa criolla'],['es','papas criollas'],['en','creole potatoes']], units: [['serving',150]] },
];

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: dbUrl, max: 5 });
  const db = drizzle(pool);

  let inserted = 0, aliases = 0, units = 0, skipped = 0;

  for (const s of [...GREEK, ...COLOMBIAN]) {
    try {
      const res = await db.execute<{ id: string }>(sql`
        INSERT INTO foods (
          source, source_id, data_quality, name_en, name_el, name_es, region,
          kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g,
          default_serving_grams, default_serving_unit, macro_confidence, provenance_notes
        ) VALUES (
          -- 'label' not 'estimated' (2026-07-02): these are curated, source-derived
          -- dishes. At 'estimated' (quality 0) they ranked BELOW crowdsourced OFF
          -- rows (1) — an OFF frozen "Moussaka" beat the curated Moussaka on ties.
          'custom', ${s.id}, 'label', ${s.en}, ${s.el ?? null}, ${s.es ?? null}, ${sql.raw(`ARRAY[${s.region.map(r => `'${r}'`).join(',')}]`)},
          ${s.kcal}, ${s.p}, ${s.c}, ${s.f}, ${s.fiber ?? null},
          ${s.serving}, 'serving', 0.85, ${'Curated regional dish, USDA/CIQUAL-derived'}
        )
        ON CONFLICT (source, source_id) DO UPDATE SET
          kcal_per_100g = EXCLUDED.kcal_per_100g,
          protein_per_100g = EXCLUDED.protein_per_100g,
          carb_per_100g = EXCLUDED.carb_per_100g,
          fat_per_100g = EXCLUDED.fat_per_100g
        RETURNING id
      `);
      const foodId = res.rows[0]?.id;
      if (!foodId) { skipped++; continue; }
      inserted++;

      for (const [lang, alias] of s.aliases) {
        try {
          await db.execute(sql`
            INSERT INTO food_aliases (food_id, lang, alias, preferred)
            VALUES (${foodId}, ${lang}, ${alias.toLowerCase()}, false)
            ON CONFLICT DO NOTHING`);
          aliases++;
        } catch { /* non-fatal */ }
      }
      for (const [unit, grams] of s.units ?? []) {
        try {
          await db.execute(sql`
            INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
            VALUES (${foodId}, ${unit}, ${grams}, 'manual')
            ON CONFLICT DO NOTHING`);
          units++;
        } catch { /* non-fatal */ }
      }
    } catch (err: any) {
      console.error(`[seed] ❌ ${s.id}: ${err.message}`);
    }
  }

  console.log(`[seed] ✅ ${inserted} foods (${GREEK.length} GR + ${COLOMBIAN.length} CO defined), ${aliases} aliases, ${units} units, ${skipped} skipped`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
