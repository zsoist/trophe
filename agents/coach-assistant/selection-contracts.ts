/** Lightweight browser hints only. The server validates catalogue membership. */
export const COACH_ANATOMY_GROUP_IDS=['chest','back','shoulders','arms','biceps','triceps','legs','glutes','core','neck'] as const;
export interface CoachAnatomyHint {group:typeof COACH_ANATOMY_GROUP_IDS[number];subgroup?:string;legRegion?:'all'|'upper'|'lower';version?:string}
export interface CoachSelectionSnapshot {
 kind:'anatomy'|'exercise'|'plan';id:string;version:string;label:string;contextOnly:true;
 provenance:'curated_catalogue'|'authorized_active_plan'|'curated_database_exercise';
 relations:Array<{kind:'catalogue_exercise'|'muscle'|'source_concept';id:string;label?:string;match:'parent'|'exact'|'group';role?:'primary'|'secondary'|'stabilizer'}>;
 limitations:string[];
}
