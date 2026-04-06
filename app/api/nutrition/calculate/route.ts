import { NextRequest, NextResponse } from 'next/server';
import { calculateFullProfile } from '@/lib/nutrition-engine';
import type { Sex, ActivityLevel, Goal } from '@/lib/types';

const VALID_SEX: Sex[] = ['male', 'female'];
const VALID_ACTIVITY: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const VALID_GOAL: Goal[] = ['fat_loss', 'muscle_gain', 'maintenance', 'recomp', 'endurance', 'health'];

interface CalculateRequest {
  weight_kg: number;
  height_cm: number;
  age: number;
  sex: Sex;
  activity_level: ActivityLevel;
  goal: Goal;
}

function validateInput(body: unknown): { valid: true; data: CalculateRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.weight_kg !== 'number' || b.weight_kg < 20 || b.weight_kg > 300) {
    return { valid: false, error: 'weight_kg must be a number between 20 and 300' };
  }
  if (typeof b.height_cm !== 'number' || b.height_cm < 100 || b.height_cm > 250) {
    return { valid: false, error: 'height_cm must be a number between 100 and 250' };
  }
  if (typeof b.age !== 'number' || b.age < 13 || b.age > 120 || !Number.isInteger(b.age)) {
    return { valid: false, error: 'age must be an integer between 13 and 120' };
  }
  if (!VALID_SEX.includes(b.sex as Sex)) {
    return { valid: false, error: `sex must be one of: ${VALID_SEX.join(', ')}` };
  }
  if (!VALID_ACTIVITY.includes(b.activity_level as ActivityLevel)) {
    return { valid: false, error: `activity_level must be one of: ${VALID_ACTIVITY.join(', ')}` };
  }
  if (!VALID_GOAL.includes(b.goal as Goal)) {
    return { valid: false, error: `goal must be one of: ${VALID_GOAL.join(', ')}` };
  }

  return { valid: true, data: b as unknown as CalculateRequest };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateInput(body);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 },
      );
    }

    const { weight_kg, height_cm, age, sex, activity_level, goal } = validation.data;

    const profile = calculateFullProfile(
      weight_kg,
      height_cm,
      age,
      sex,
      activity_level,
      goal,
    );

    return NextResponse.json({
      bmr: profile.bmr,
      tdee: profile.tdee,
      calories: profile.calories,
      protein_g: profile.protein_g,
      carbs_g: profile.carbs_g,
      fat_g: profile.fat_g,
      fiber_g: profile.fiber_g,
      water_ml: profile.water_ml,
    });
  } catch (error) {
    console.error('Nutrition calculation error:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }
}
