# Wave 3 — Tier 3 Gaps: Colombian Chains & Regional Beverages

Status: **DOCUMENTED** (no USDA data available, deferred to manual seed)

---

## Context

Wave 3 seeded 23 high-volume branded foods from USDA FDC (15 fast food + 8 beverages).
These are US-centric chains with USDA lab-verified data. Colombian-only chains and
regional beverages have NO USDA/OpenFoodFacts coverage and require manual nutrition
data from official chain menus or Colombian ICBF tables.

---

## Tier 3 Items (no USDA data)

### Crepes & Waffles (Colombian chain)
| Item | Estimated kcal | Proxy available? |
|------|---------------|-----------------|
| Crepe de pollo | ~350-450 | Partial (generic crepe + chicken fill) |
| Crepe de champiñones | ~300-400 | Partial (generic crepe + mushroom) |
| Waffle con helado | ~500-700 | Partial (waffle + ice cream) |

**Data source needed**: Official Crepes & Waffles nutrition PDF or menu scrape.

### El Corral (Colombian burger chain)
| Item | Estimated kcal | Proxy available? |
|------|---------------|-----------------|
| Hamburguesa Corral | ~600-700 | Yes: USDA generic hamburger (FDC 170693) + weight adj |
| Hamburguesa BBQ | ~700-800 | Yes: USDA hamburger + BBQ sauce weight |
| Todoterreno | ~900-1100 | Partial (large burger, multiple patties) |

**Data source needed**: El Corral website nutrition section or food scale verification.

### Frisby (Colombian fried chicken)
| Item | Estimated kcal | Proxy available? |
|------|---------------|-----------------|
| Combo personal (2pc + papas) | ~800-1000 | Yes: KFC data + 10% local prep adjustment |
| Alitas BBQ | ~400-500 | Yes: USDA chicken wings BBQ (FDC 170192) |

**Data source needed**: Frisby official nutrition info.

### Postobón (Colombian sodas)
| Item | Est. kcal/100ml | Proxy available? |
|------|----------------|-----------------|
| Colombiana | ~41 | Yes: similar to Fanta (45 kcal/100ml) |
| Manzana | ~41 | Yes: similar to Fanta |
| Uva | ~41 | Yes: similar to Fanta |

**Note**: Corona beer and Postobón Colombiana were originally in Wave 3 but dropped
because USDA proxies were misleading (e.g., "Corona Extra" FDC entry is US-market
specific, may not match Colombian serving sizes/ABV).

### Juan Valdez (Colombian coffee chain)
| Item | Est. kcal | Proxy available? |
|------|----------|-----------------|
| Café latte | ~200-250 (grande) | Yes: Starbucks latte (53 kcal/100ml) |
| Cappuccino | ~150-200 (grande) | Partial: less milk than latte |
| Arequipe latte | ~300-400 (grande) | Partial: latte + dulce de leche (~50 kcal/tbsp) |

**Data source needed**: Juan Valdez nutrition PDF.

---

## Resolution Path

1. **Short-term proxy** (Week 1): Use closest USDA match + weight adjustment factor.
   Add with `data_quality = 'estimated'` and `macro_confidence = 0.6`.

2. **Medium-term manual** (Month 1): Request official nutrition data from each chain.
   Colombian law (Resolución 810/2021) requires restaurants >5 locations to provide
   nutritional information upon request.

3. **Long-term automated** (Phase 10): OpenFoodFacts Colombia category + community
   contributions. Monitor `off.openfoodfacts.org/country/colombia` for new entries.

---

## How to Add These Items

Use the same pattern as Wave 3:
```bash
# 1. Add to scripts/data/wave3-branded-foods-list.ts (TIER3_GAPS array)
# 2. Create manual seed SQL in drizzle/0009_tier3_colombian_foods.sql
# 3. Run against local DB: psql trophe_dev < drizzle/0009_...
# 4. Run against production: Supabase MCP execute_sql
# 5. Verify: SELECT from foods WHERE canonical_food_key LIKE 'elcorral_%'
```

Key fields for manual entries:
- `source = 'manual'`
- `data_quality = 'estimated'` (until lab-verified)
- `macro_confidence = 0.6` (proxy) or `0.8` (official menu data)
- `provenance_notes = 'Proxy: USDA FDC XXXXX + 10% local adjustment'`
