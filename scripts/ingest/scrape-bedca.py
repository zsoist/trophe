#!/usr/bin/env python3
"""
Scrape BEDCA (Base de Datos Española de Composición de Alimentos) via pybedca.
Outputs CSV at data/bedca_2024.csv with columns:
  code, name_es, name_en, kcal_100g, protein_100g, carbs_100g, fat_100g,
  fiber_100g, sodium_mg_100g

Usage:
  pip3 install pybedca
  python3 scripts/ingest/scrape-bedca.py
"""

import csv
import sys
import time
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, '/opt/homebrew/lib/python3.14/site-packages')

from pybedca import BedcaClient

OUT = Path(__file__).resolve().parents[2] / 'data' / 'bedca_2024.csv'

def safe_float(val, attr='_value_in_grams'):
    if val is None:
        return ''
    try:
        raw = getattr(val.value, attr, None)
        if raw is None:
            return ''
        return round(float(raw), 2)
    except Exception:
        return ''


def main():
    client = BedcaClient()
    previews = client.get_all_foods()
    print(f'[bedca] {len(previews)} foods found')

    rows = []
    errors = 0

    for i, preview in enumerate(previews):
        try:
            food = client.get_food_by_id(preview.id)
            n = food.nutrients

            kcal = safe_float(n.energy, '_value_in_kcal')
            protein = safe_float(n.protein)
            carbs = safe_float(n.carbohydrate)
            fat = safe_float(n.fat)
            fiber = safe_float(n.fiber)
            sodium_g = safe_float(n.sodium)
            sodium_mg = round(float(sodium_g) * 1000, 1) if sodium_g != '' else ''

            if kcal == '' or protein == '' or carbs == '' or fat == '':
                continue

            rows.append({
                'code': preview.id,
                'name_es': food.name_es,
                'name_en': food.name_en or '',
                'kcal_100g': kcal,
                'protein_100g': protein,
                'carbs_100g': carbs,
                'fat_100g': fat,
                'fiber_100g': fiber,
                'sodium_mg_100g': sodium_mg,
            })
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f'[bedca] ⚠ {preview.id} "{preview.name_es}": {e}')

        if (i + 1) % 50 == 0:
            print(f'[bedca]   {i+1}/{len(previews)} scraped, {len(rows)} valid, {errors} errors')
        time.sleep(0.15)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'code', 'name_es', 'name_en', 'kcal_100g', 'protein_100g',
            'carbs_100g', 'fat_100g', 'fiber_100g', 'sodium_mg_100g',
        ])
        writer.writeheader()
        writer.writerows(rows)

    print(f'[bedca] ✅ {len(rows)} foods written to {OUT}')
    print(f'[bedca]    {errors} errors, {len(previews) - len(rows) - errors} skipped (missing macros)')


if __name__ == '__main__':
    main()
