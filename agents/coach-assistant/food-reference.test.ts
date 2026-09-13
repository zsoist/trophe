import {expect,it,vi} from 'vitest';
import {createCoachCapabilityRegistry,capabilityChoiceSchema} from './capability-registry';
import {
  makeFoodReferenceLookup,parseFoodPortions,renderFoodReferenceFollowUp,renderFoodReferences,
  resolveFoodReferences,resolveLanguage,foodReferenceSchema,type FoodReference,
} from './food-reference';
import {runConversation} from './conversation';
import {fixtureRepository} from './fixtures';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

const option=(over:Partial<FoodReference>={}):FoodReference=>foodReferenceSchema.parse({
  referenceId:'chicken breast, cooked|usda|cooked',name:'Chicken breast, cooked',source:'usda',
  quality:'lab_verified',preparation:'cooked',kcalPer100g:165,proteinPer100g:31,conversions:[],...over,
});
const chicken=option();
const rice=option({referenceId:'rice, white, cooked|usda|cooked',name:'Rice, white, cooked',kcalPer100g:130,proteinPer100g:2.7});

// ── Acceptance: schema→registry→render→conversation seam ──────────────────────
it('returns bounded catalogue references with deterministic user-portion arithmetic and no second model call',async()=>{
  const repository=fixtureRepository({nutrition:[],workouts:[],plans:[]});repository.authorize=async()=>({actorId:id(1),subjectId:id(1),organizationId:id(2),timezone:'UTC',language:'en'});
  const lookup=vi.fn(async()=>chicken);
  const provider=vi.fn(async()=>({output:{tool:'food.reference',args:{queries:['chicken breast']}},usage:{inputTokens:100,outputTokens:50},rawStatus:200,latencyMs:1}));
  const result=await runConversation({version:'coach-assistant.v2',conversationId:id(3),turnId:id(4),message:'Protein in 150 g of chicken breast?'},{actorId:id(1),repository,mode:'model',offlineCandidateEvaluation:true,offlineConversationProvider:provider,capabilityRegistry:createCoachCapabilityRegistry({foodReference:lookup}),signal:new AbortController().signal,now:new Date('2026-09-12T12:00:00Z')});
  expect(result.ok,JSON.stringify(result.error)).toBe(true);expect(provider).toHaveBeenCalledTimes(1);expect(lookup).toHaveBeenCalledTimes(1);
  expect(result.output?.answer).toContain('247.5 kcal · 46.5 g protein');expect(result.output?.answer).toContain('not logged intake');
  expect(result.receipts).toEqual([]);expect(result.proposals).toEqual([]);
});

// ── Portion binding across multiple foods ─────────────────────────────────────
it('binds one amount per food only when the pairing is unambiguous',()=>{
  const forward=renderFoodReferences({options:[chicken,rice]},false,'150 g chicken breast and 200 g rice');
  expect(forward).toContain('247.5 kcal · 46.5 g protein');
  expect(forward).toContain('260 kcal · 5.4 g protein');
  const reversed=renderFoodReferences({options:[chicken,rice]},false,'200 g rice and 150 g chicken breast');
  expect(reversed).toContain('247.5 kcal · 46.5 g protein');
  expect(reversed).toContain('260 kcal · 5.4 g protein');
});

it('never attaches a single amount to one of several foods',()=>{
  const mixed=renderFoodReferences({options:[chicken,rice]},false,'200 g chicken breast and rice');
  expect(mixed).not.toContain('you stated');
  expect(mixed).toContain('one portion per food');
  expect(mixed).toContain('Chicken breast, cooked');
  expect(renderFoodReferences({options:[chicken]},false,'100 g or 200 g')).not.toContain('you stated');
  expect(renderFoodReferences({options:[chicken,rice]},false,'200 g')).not.toContain('you stated');
});

it('renders in the language of the latest question, not the stored profile',()=>{
  expect(renderFoodReferences({options:[chicken]},false,'¿Cuánta proteína en 150 gramos de pollo?')).toContain('46.5 g proteína');
  expect(renderFoodReferences({options:[chicken]},true,'Protein in 150 g of chicken breast?')).toContain('46.5 g protein');
});

// ── Honest clarification instead of fabricated macros ────────────────────────
it('clarifies a missing unit conversion and never invents grams for eggs or cups',()=>{
  const eggs=renderFoodReferences({options:[chicken]},false,'2 eggs');
  expect(eggs).not.toContain('you stated');
  expect(eggs).toContain('do not have a validated "piece" to grams conversion');
  expect(eggs).not.toContain('For the piece');
  const cups=renderFoodReferences({options:[chicken]},true,'1 taza de pollo');
  expect(cups).not.toContain('que indicas');
  expect(cups).toContain('conversión validada de "cup"');
});

it('clarifies an ambiguous preparation instead of scaling the wrong food',()=>{
  const raw=renderFoodReferences({options:[chicken]},false,'150 g of raw chicken breast');
  expect(raw).not.toContain('you stated');
  expect(raw).toContain('You mentioned "raw"');
  expect(raw).toContain('Confirm the preparation');
});

it('reports a catalogue miss without macros',()=>{
  expect(renderFoodReferences({options:[]},false)).toContain('No matching food reference');
  expect(renderFoodReferences({options:[]},true)).toContain('No encontré');
});

// ── Follow-up contract ────────────────────────────────────────────────────────
it('scales a portion-only follow-up only for a single validated option',()=>{
  const answer=renderFoodReferenceFollowUp([chicken],false,'200 g');
  expect(answer).toContain('330 kcal · 62 g protein');
  expect(answer).toContain('not logged intake');
});

it('asks for clarification when a follow-up could refer to several prior options',()=>{
  const answer=renderFoodReferenceFollowUp([chicken,rice],false,'200 g');
  expect(answer).not.toBeNull();
  expect(answer).not.toContain('you stated');
  expect(answer).toContain('one portion per food');
});

it('does not treat a non-portion or empty context as a follow-up',()=>{
  expect(renderFoodReferenceFollowUp([chicken],false,'which is healthier?')).toBeNull();
  expect(renderFoodReferenceFollowUp([],false,'200 g')).toBeNull();
  expect(renderFoodReferenceFollowUp([{name:'bad'}],false,'200 g')).toBeNull();
});

// ── Lookup seam: provenance and validated conversions ────────────────────────
it('attaches only validated food_unit_conversions rows and fails closed',async()=>{
  const row={food:{id:'chicken-row',nameEn:'Chicken breast, cooked',source:'usda',dataQuality:'lab_verified',kcalPer100g:165,proteinPer100g:31}};
  const resolver=vi.fn(async({unit}:{unit:string})=>unit==='cup'?{...row,conversionId:'conv-cup',gramsPerUnit:158}:{...row,conversionId:null,gramsPerUnit:100});
  const lookup=makeFoodReferenceLookup(resolver);
  const signal=new AbortController().signal;
  const withCup=await lookup('chicken','1 cup of chicken',signal);
  expect(withCup?.conversions).toEqual([{unit:'cup',gramsPerUnit:158,conversionId:'conv-cup'}]);
  expect(withCup?.referenceId).toBe('chicken breast, cooked|usda|cooked');
  const missing=await lookup('chicken','2 eggs',signal);
  expect(missing?.conversions).toEqual([]);
  const absent=makeFoodReferenceLookup(async()=>null);
  expect(await absent('chicken','150 g',signal)).toBeNull();
  const aborted=new AbortController();aborted.abort();
  await expect(lookup('chicken','150 g',aborted.signal)).rejects.toThrow();
});

// ── Parsing edge cases ────────────────────────────────────────────────────────
it('parses bounded explicit portions and ignores unusable amounts',()=>{
  expect(parseFoodPortions('150 g')).toEqual([expect.objectContaining({grams:150,kind:'mass',label:'150 g',index:0})]);
  expect(parseFoodPortions('1,5 kg')[0]).toMatchObject({grams:1500,label:'1500 g'});
  expect(parseFoodPortions('200g')[0]).toMatchObject({grams:200});
  expect(parseFoodPortions('100 g or 200 g')).toHaveLength(2);
  expect(parseFoodPortions('2 eggs and 1 cup of milk').map(p=>p.unit)).toEqual(['piece','cup']);
  expect(parseFoodPortions('no amounts here')).toEqual([]);
  expect(parseFoodPortions('20000 g')).toEqual([]);
});

it('resolves language from the latest question with a profile fallback',()=>{
  expect(resolveLanguage('150 gramos',false)).toBe(true);
  expect(resolveLanguage('150 g',true)).toBe(true);
  expect(resolveLanguage('Protein in 150 g',true)).toBe(false);
});

it('resolves deterministic macros and issues from raw options',()=>{
  const [resolved]=resolveFoodReferences([chicken],'150 g of chicken breast');
  expect(resolved.grams).toBe(150);expect(resolved.basis).toBe('measured_mass');
  const [ambiguous]=resolveFoodReferences([chicken,rice],'200 g chicken breast and rice');
  expect(ambiguous.grams).toBeNull();expect(ambiguous.issue).toBe('ambiguous_portion');
});

// ── Fail-closed on invalid catalogue nutrition / invented args ───────────────
it('fails closed on invalid catalogue nutrition',()=>{
  expect(renderFoodReferences({options:[{...chicken,proteinPer100g:NaN}]},false)).toBe('');
  expect(renderFoodReferences({options:[chicken],extra:true},false)).toBe('');
  expect(renderFoodReferences({options:[chicken,rice,chicken]},false)).toBe('');
});

it.each([{tool:'food.reference',args:{queries:['a','b','c']}},{tool:'food.reference',args:{queries:['chicken'],grams:100}},{tool:'food.reference',args:{queries:['chicken'],url:'https://example.com'}}])('rejects unbounded or invented tool arguments',choice=>{
  expect(capabilityChoiceSchema.safeParse(choice).success).toBe(false);
});

// ── Fix001: complete numeric tokens, never partial-match scaling ─────────────
it('parses a complete signed/fractional/decimal token or rejects it whole',()=>{
  expect(parseFoodPortions('-150 g')).toEqual([]);
  expect(parseFoodPortions('+150 g')[0]).toMatchObject({value:150,grams:150});
  expect(parseFoodPortions('1/2 cup')[0]).toMatchObject({value:0.5,unit:'cup',label:'0.5 cup'});
  expect(parseFoodPortions('1 1/2 cups')[0]).toMatchObject({value:1.5,unit:'cup'});
  expect(parseFoodPortions('.5 kg')[0]).toMatchObject({value:0.5,grams:500,label:'500 g'});
  expect(parseFoodPortions('1,5 kg')[0]).toMatchObject({grams:1500});
  expect(parseFoodPortions('200g and 2cups').map(p=>p.unit)).toEqual(['g','cup']);
});

it('refuses to guess a thousands-vs-decimal separator and clarifies instead',()=>{
  expect(parseFoodPortions('1,500 g')).toEqual([]);
  expect(parseFoodPortions('1.500 kg')).toEqual([]);
  const [ambiguous]=resolveFoodReferences([chicken],'1,500 g of chicken breast');
  expect(ambiguous.grams).toBeNull();expect(ambiguous.issue).toBe('ambiguous_syntax');
  expect(renderFoodReferences({options:[chicken]},true,'1,500 g de pollo')).toContain('ambigua');
});

it('does not silently drop a bare multiplier glued to a portion',()=>{
  expect(parseFoodPortions('2 200 g')).toEqual([]);
  expect(resolveFoodReferences([chicken],'2 200 g chicken breast')[0].grams).toBeNull();
});

// ── Fix002: follow-up is strictly portion-only ───────────────────────────────
it('never reuses the prior food for a new food, negation or intake follow-up',()=>{
  expect(renderFoodReferenceFollowUp([chicken],false,'200 g rice')).toBeNull();
  expect(renderFoodReferenceFollowUp([chicken],false,'Do not use 200 g')).toBeNull();
  expect(renderFoodReferenceFollowUp([chicken],false,'I ate 200 g chicken')).toBeNull();
  expect(renderFoodReferenceFollowUp([chicken],false,'why 200 g?')).toBeNull();
});

it.each(['and for 200 g?','y para 200g?','200 g'])('keeps a genuine bare-portion follow-up: %s',text=>{
  const answer=renderFoodReferenceFollowUp([chicken],text.startsWith('y'),text);
  expect(answer).toContain('330 kcal · 62 g');
});

// ── Fix003: converted masses obey the same finite bounded contract ───────────
const cupChicken=option({conversions:[{unit:'cup',gramsPerUnit:150,conversionId:'conv-cup-150'}]});
it('bounds converted masses and rejects overflow/zero/negative quantities',()=>{
  expect(resolveFoodReferences([cupChicken],'0.5 cup chicken')[0].grams).toBe(75);
  const huge=resolveFoodReferences([cupChicken],'100000 cup chicken')[0];
  expect(huge.grams).toBeNull();expect(huge.issue).toBe('invalid_quantity');
  expect(resolveFoodReferences([cupChicken],'-1 cup chicken')[0].grams).toBeNull();
  expect(resolveFoodReferences([cupChicken],'0 cup chicken')[0].grams).toBeNull();
  expect(resolveFoodReferences([chicken],'20000 g chicken')[0].grams).toBeNull();
});

it('preserves the real conversion row id and never fabricates provenance',async()=>{
  const row={food:{id:'rice-row',nameEn:'Rice, white, cooked',source:'usda',dataQuality:'verified',kcalPer100g:130,proteinPer100g:2.7}};
  const lookup=makeFoodReferenceLookup(async({unit})=>unit==='cup'?{...row,conversionId:'row-42',gramsPerUnit:158}:{...row,conversionId:null,gramsPerUnit:130});
  const option=await lookup('rice','1 cup of rice',new AbortController().signal);
  expect(option?.conversions).toEqual([{unit:'cup',gramsPerUnit:158,conversionId:'row-42'}]);
});

// ── Spanish (primary user): no silent binding to English-only catalogue rows ──
it('surfaces a Spanish preparation conflict instead of scaling the English match',()=>{
  const [resolved]=resolveFoodReferences([chicken],'¿Cuánta proteína en 150 g de pollo crudo?');
  expect(resolved.grams).toBeNull();expect(resolved.issue).toBe('needs_preparation');
  const rendered=renderFoodReferences({options:[chicken]},true,'¿Cuánta proteína en 150 g de pollo crudo?');
  expect(rendered).not.toContain('que indicas');
  expect(rendered).toContain('"crudo"');
  expect(rendered).toContain('Confirma la preparación');
});

it('does not bind Spanish portions to English-only food names when several options are offered',()=>{
  const resolutions=resolveFoodReferences([chicken,rice],'150 g de pollo y 200 g de arroz');
  expect(resolutions.map(r=>r.grams)).toEqual([null,null]);
  expect(resolutions.every(r=>r.issue==='ambiguous_portion')).toBe(true);
  const rendered=renderFoodReferences({options:[chicken,rice]},true,'150 g de pollo y 200 g de arroz');
  expect(rendered).not.toContain('que indicas');
  expect(rendered).toContain('una porción por alimento');
});

it('still scales a Spanish preparation that matches the catalogue',()=>{
  const cooked=option({referenceId:'pollo cocido|usda|cooked',name:'Chicken, cooked',preparation:'cooked'});
  const [resolved]=resolveFoodReferences([cooked],'150 g de pollo cocido');
  expect(resolved.grams).toBe(150);expect(resolved.issue).toBeNull();
});
