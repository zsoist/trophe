-- USDA SR Legacy does not expose brand_owner for restaurant foods. The Wave 3
-- seed therefore wrote NULL even though these are explicitly branded products.
-- Backfill only known branded keys; generic fast-food rows stay unbranded.
UPDATE foods AS food
SET brand = brands.brand
FROM (
  VALUES
    ('mcdonalds_big_mac', 'McDonald''s'),
    ('mcdonalds_chicken_mcnuggets', 'McDonald''s'),
    ('mcdonalds_french_fries_large', 'McDonald''s'),
    ('mcdonalds_cheeseburger', 'McDonald''s'),
    ('mcdonalds_egg_mcmuffin', 'McDonald''s'),
    ('burger_king_whopper', 'Burger King'),
    ('burger_king_whopper_cheese', 'Burger King'),
    ('kfc_popcorn_chicken', 'KFC'),
    ('kfc_crispy_strips', 'KFC'),
    ('chickfila_chicken_sandwich', 'Chick-fil-A'),
    ('chickfila_chicken_strips', 'Chick-fil-A'),
    ('subway_turkey_breast_sub', 'Subway'),
    ('subway_meatball_sub', 'Subway'),
    ('chicken_nuggets_fast_food', 'Wendy''s')
) AS brands(canonical_food_key, brand)
WHERE food.canonical_food_key = brands.canonical_food_key
  AND NULLIF(BTRIM(food.brand), '') IS NULL;
