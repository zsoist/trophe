/**
 * Production search coverage for Spanish and Spanglish Colombian/Bogota foods.
 *
 * This intentionally exercises /api/food/search, because that is the fast path
 * users hit before logging common foods. Use EVAL_AUTH_TOKEN when the deployed
 * route requires auth.
 */

const baseUrl = process.env.EVAL_BASE_URL ?? 'https://trophe.app';
const authToken = process.env.EVAL_AUTH_TOKEN;

type Case = { id: string; q: string; expect: string };

const spanishFoods = [
  ['arepa', 'arepa'],
  ['arepa con queso', 'arepa'],
  ['arepa de choclo', 'arepa'],
  ['almojabana', 'almojabana'],
  ['almojábana', 'almojabana'],
  ['pandebono', 'pandebono'],
  ['buñuelo', 'bunuelo'],
  ['bunuelo colombiano', 'bunuelo'],
  ['empanada', 'empanada'],
  ['empanada de carne', 'empanada'],
  ['tamal colombiano', 'tamal'],
  ['tamal bogotano', 'tamal'],
  ['changua', 'changua'],
  ['changua con huevo', 'changua'],
  ['ajiaco', 'ajiaco'],
  ['ajiaco bogotano', 'ajiaco'],
  ['ajiaco santafereño', 'ajiaco'],
  ['caldo de costilla', 'caldo'],
  ['sancocho', 'sancocho'],
  ['sancocho de gallina', 'sancocho'],
  ['bandeja paisa', 'bandeja'],
  ['arroz con pollo', 'arroz'],
  ['calentado', 'calentado'],
  ['calentao', 'calentado'],
  ['frijoles rojos', 'frijoles'],
  ['frijoles cargamanto', 'frijoles'],
  ['patacon', 'patacon'],
  ['patacón', 'patacon'],
  ['platano maduro frito', 'platano'],
  ['plátano maduro', 'platano'],
  ['tajadas maduras', 'platano'],
  ['chicharron', 'chicharron'],
  ['chicharrón colombiano', 'chicharron'],
  ['lechona', 'lechona'],
  ['sobrebarriga', 'sobrebarriga'],
  ['carne desmechada', 'carne'],
  ['papa criolla', 'papa'],
  ['hogao', 'hogao'],
  ['aguapanela', 'aguapanela'],
  ['agua panela', 'aguapanela'],
  ['chocolate con queso', 'chocolate'],
  ['chocolate santafereño', 'chocolate'],
  ['jugo de lulo', 'lulo'],
  ['jugo de mora', 'mora'],
  ['oblea', 'oblea'],
  ['oblea con arequipe', 'oblea'],
  ['chocoramo', 'chocoramo'],
  ['arepa rellena de queso', 'arepa'],
  ['sopa de leche bogotana', 'changua'],
  ['plato de bandeja paisa', 'bandeja'],
] as const;

const spanglishFoods = [
  ['cheese arepa', 'arepa'],
  ['arepa with cheese', 'arepa'],
  ['sweet corn arepa', 'arepa'],
  ['colombian cheese bread', 'pandebono'],
  ['colombian cheese fritter', 'bunuelo'],
  ['colombian empanada', 'empanada'],
  ['bogota soup changua', 'changua'],
  ['colombian chicken potato soup', 'ajiaco'],
  ['beef rib soup', 'caldo'],
  ['colombian platter bandeja paisa', 'bandeja'],
  ['rice with chicken colombiano', 'arroz'],
  ['fried green plantain patacon', 'patacon'],
  ['fried sweet plantain tajadas', 'platano'],
  ['colombian hot chocolate', 'chocolate'],
  ['blackberry juice colombiano', 'mora'],
] as const;

const cases: Case[] = [
  ...spanishFoods.map(([q, expect], i) => ({ id: `es-${String(i + 1).padStart(2, '0')}`, q, expect })),
  ...spanglishFoods.map(([q, expect], i) => ({ id: `sp-${String(i + 1).padStart(2, '0')}`, q, expect })),
];

async function main() {
  const results = [];
  for (const c of cases) {
    const url = new URL('/api/food/search', baseUrl);
    url.searchParams.set('q', c.q);
    const start = Date.now();
    const res = await fetch(url, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    });
    const latencyMs = Date.now() - start;
    const body = await res.json().catch(() => ({})) as { foods?: Array<{ description?: string; name_es?: string }> };
    const haystack = JSON.stringify(body.foods?.slice(0, 3) ?? []).toLowerCase();
    const passed = res.ok && haystack.includes(c.expect);
    results.push({ ...c, passed, status: res.status, latencyMs, top: body.foods?.[0]?.description ?? null });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${c.id} ${c.q} -> ${body.foods?.[0]?.description ?? `HTTP ${res.status}`} (${latencyMs}ms)`);
  }

  const passed = results.filter((r) => r.passed).length;
  const p95 = results.map((r) => r.latencyMs).sort((a, b) => a - b)[Math.floor(results.length * 0.95)];
  console.log(`\nColombian search: ${passed}/${results.length} passed (${Math.round((passed / results.length) * 100)}%), p95=${p95}ms`);
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
