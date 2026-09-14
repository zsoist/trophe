import type { CoachEvidence } from './contracts';
/** Localized presentation of bounded canonical quantities, never model arithmetic. */
export function nutritionFactText(fact:CoachEvidence,language:string):string {
 const es=language.startsWith('es'),el=language.startsWith('el');
 if(!es&&!el)return fact.statement;
 const n=String(fact.value),period=fact.window.days===1?(es?'En el día consultado':'Την επιλεγμένη ημέρα'):(es?'En el periodo consultado':'Στην επιλεγμένη περίοδο');
 const partial=fact.completeness==='partial'?(es?' (datos parciales)':' (μερικά δεδομένα)'):'';
 if(fact.id==='nutrition.calories')return es?`${period}: ${n} kcal registradas${partial}.`:`${period}: ${n} kcal καταγεγραμμένες${partial}.`;
 if(fact.id==='nutrition.protein')return es?`${period}: ${n} g de proteína registrados${partial}.`:`${period}: ${n} g πρωτεΐνης καταγεγραμμένα${partial}.`;
 if(fact.id==='nutrition.target.calories')return es?`Objetivo diario guardado: ${n} kcal.`:`Αποθηκευμένος ημερήσιος στόχος: ${n} kcal.`;
 if(fact.id==='nutrition.target.proteinG')return es?`Objetivo diario guardado de proteína: ${n} g.`:`Αποθηκευμένος ημερήσιος στόχος πρωτεΐνης: ${n} g.`;
 if(fact.id==='nutrition.days')return es?`Días con registros: ${n}.`:`Ημέρες με καταγραφές: ${n}.`;
 return fact.statement;
}
