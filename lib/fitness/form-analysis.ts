// Form Analysis — TypeScript port of gym_input.py biomechanics math
// Ported from: github.com/dgsz250700/gym-analysis
// Original: Python + MediaPipe Pose → angle calculations → rep segmentation → scoring

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

export interface Point2D {
  x: number;
  y: number;
}

export interface PosePoints {
  ear: Point2D | null;
  shoulder: Point2D | null;
  hip: Point2D | null;
  knee: Point2D | null;
  ankle: Point2D | null;
}

export interface FrameAngles {
  frame: number;
  timestamp: number;
  kneeAngle: number | null;
  torsoInclinationAbs: number | null;
  neckInclinationAbs: number | null;
  posePoints: PosePoints;
}

export interface DirectionChange {
  frame: number;
  timestamp: number;
  kneeAngle: number;
  direction: 'baja_a_sube' | 'sube_a_baja';
}

export interface RepScore {
  rep: number;
  segmentType: string;
  score: number; // 0-100
  assessment: string; // Spanish label
  assessmentColor: string;
  angles: {
    knee: { avg: number; refAvg: number; diffPct: number };
    torso: { avg: number; refAvg: number; diffPct: number };
    neck: { avg: number; refAvg: number; diffPct: number };
  };
}

export interface FormAnalysisResult {
  repsAnalyzed: number;
  overallScore: number;
  overallAssessment: string;
  assessmentColor: string;
  repScores: RepScore[];
}

// ═══════════════════════════════════════════════
// CONSTANTS (matching gym_input.py)
// ═══════════════════════════════════════════════

export const ALPHA_POINTS = 0.25;
export const ALPHA_ANGLE = 0.2;
export const MIN_VISIBILITY = 0.6;
export const ANGLE_CHANGE_THRESHOLD = 0.5;

// MediaPipe landmark indices for right side (matching gym_input.py get_indices)
export const LANDMARK_INDICES = {
  right: { ear: 8, shoulder: 12, hip: 24, knee: 26, ankle: 28 },
  left: { ear: 7, shoulder: 11, hip: 23, knee: 25, ankle: 27 },
} as const;

export const POSE_CONNECTIONS: [keyof PosePoints, keyof PosePoints][] = [
  ['ear', 'shoulder'],
  ['shoulder', 'hip'],
  ['hip', 'knee'],
  ['knee', 'ankle'],
];

// Assessment thresholds (matching classify_difference in gym_input.py)
const ASSESSMENT_THRESHOLDS = [
  { max: 3, label: 'buen ejercicio', color: '#22c55e', score: 95 },
  { max: 8, label: 'aun se puede mejorar', color: '#D4A853', score: 75 },
  { max: 16, label: 'es necesario ajustar', color: '#f59e0b', score: 55 },
  { max: 25, label: 'realizar ajustes profundos', color: '#f97316', score: 35 },
  { max: Infinity, label: 'riesgo de lesion', color: '#ef4444', score: 15 },
] as const;

// ═══════════════════════════════════════════════
// CORE MATH (direct port from gym_input.py)
// ═══════════════════════════════════════════════

/** Exponential moving average — matches ema() in gym_input.py */
export function ema(actual: number, previous: number | null, alpha: number): number {
  if (previous === null) return actual;
  return alpha * actual + (1 - alpha) * previous;
}

/** EMA for 2D points — matches ema_point() */
export function emaPoint(actual: Point2D, previous: Point2D | null, alpha: number): Point2D {
  if (!previous) return actual;
  return {
    x: ema(actual.x, previous.x, alpha),
    y: ema(actual.y, previous.y, alpha),
  };
}

/** Angle between three 2D points — matches calculate_angle() in gym_input.py */
export function calculateAngle(a: Point2D, b: Point2D, c: Point2D): number | null {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };

  const magAB = Math.hypot(ab.x, ab.y);
  const magCB = Math.hypot(cb.x, cb.y);
  if (magAB === 0 || magCB === 0) return null;

  let cosTheta = (ab.x * cb.x + ab.y * cb.y) / (magAB * magCB);
  cosTheta = Math.max(-1.0, Math.min(1.0, cosTheta));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

/** Vertical inclination — matches calculate_vertical_inclination() */
export function calculateVerticalInclination(
  top: Point2D,
  bottom: Point2D
): { signed: number; abs: number } | null {
  const dx = top.x - bottom.x;
  const dy = top.y - bottom.y;
  if (dx === 0 && dy === 0) return null;

  const signedAngle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return { signed: signedAngle, abs: Math.abs(signedAngle) };
}

/** Extract pose points from MediaPipe landmarks — matches get_indices() + processing */
export function extractPosePoints(
  landmarks: { x: number; y: number; z: number; visibility: number }[],
  side: 'right' | 'left' = 'right'
): PosePoints {
  const idx = LANDMARK_INDICES[side];
  const get = (i: number): Point2D | null => {
    const lm = landmarks[i];
    if (!lm || lm.visibility < MIN_VISIBILITY) return null;
    return { x: lm.x, y: lm.y };
  };

  return {
    ear: get(idx.ear),
    shoulder: get(idx.shoulder),
    hip: get(idx.hip),
    knee: get(idx.knee),
    ankle: get(idx.ankle),
  };
}

/** Compute all angles from pose points */
export function computeAngles(points: PosePoints): {
  kneeAngle: number | null;
  torsoInclinationAbs: number | null;
  neckInclinationAbs: number | null;
} {
  const kneeAngle = points.hip && points.knee && points.ankle
    ? calculateAngle(points.hip, points.knee, points.ankle)
    : null;

  const torsoInc = points.shoulder && points.hip
    ? calculateVerticalInclination(points.shoulder, points.hip)
    : null;

  const neckInc = points.ear && points.shoulder
    ? calculateVerticalInclination(points.ear, points.shoulder)
    : null;

  return {
    kneeAngle,
    torsoInclinationAbs: torsoInc?.abs ?? null,
    neckInclinationAbs: neckInc?.abs ?? null,
  };
}

// ═══════════════════════════════════════════════
// REP DETECTION (direction changes from knee angle)
// ═══════════════════════════════════════════════

/** Detect knee direction changes — matches direction change detection in gym_input.py */
export function detectDirectionChanges(
  frames: FrameAngles[],
  threshold: number = ANGLE_CHANGE_THRESHOLD
): DirectionChange[] {
  const changes: DirectionChange[] = [];
  let prevAngle: number | null = null;
  let prevDirection: 'up' | 'down' | null = null;

  for (const frame of frames) {
    if (frame.kneeAngle === null) continue;

    if (prevAngle !== null) {
      const delta = frame.kneeAngle - prevAngle;
      if (Math.abs(delta) >= threshold) {
        const currentDirection = delta > 0 ? 'up' : 'down';
        if (prevDirection !== null && currentDirection !== prevDirection) {
          changes.push({
            frame: frame.frame,
            timestamp: frame.timestamp,
            kneeAngle: frame.kneeAngle,
            direction: currentDirection === 'up' ? 'baja_a_sube' : 'sube_a_baja',
          });
        }
        prevDirection = currentDirection;
      }
    }
    prevAngle = frame.kneeAngle;
  }

  return changes;
}

/** Count completed reps from direction changes */
export function countReps(changes: DirectionChange[]): number {
  // A full rep = one descent + one ascent (baja_a_sube)
  return changes.filter(c => c.direction === 'baja_a_sube').length;
}

// ═══════════════════════════════════════════════
// ASSESSMENT & SCORING
// ═══════════════════════════════════════════════

/** Classify deviation — matches classify_difference() in gym_input.py */
export function classifyDifference(absDiffPct: number): {
  label: string;
  color: string;
  score: number;
} {
  for (const threshold of ASSESSMENT_THRESHOLDS) {
    if (absDiffPct <= threshold.max) {
      return { label: threshold.label, color: threshold.color, score: threshold.score };
    }
  }
  return { label: 'riesgo de lesion', color: '#ef4444', score: 15 };
}

/** Get worst assessment from multiple labels — matches assessment_priority() */
export function worstAssessment(labels: string[]): string {
  const priority: Record<string, number> = {
    'buen ejercicio': 0,
    'aun se puede mejorar': 1,
    'es necesario ajustar': 2,
    'realizar ajustes profundos': 3,
    'riesgo de lesion': 4,
  };

  let worst = 'buen ejercicio';
  let worstPriority = 0;

  for (const label of labels) {
    const p = priority[label] ?? -1;
    if (p > worstPriority) {
      worst = label;
      worstPriority = p;
    }
  }

  return worst;
}

/** Compare a set of frame angles against reference averages for one segment */
export function compareSegmentToReference(
  segmentAngles: { kneeAngle: number; torsoAbs: number; neckAbs: number }[],
  referenceAvgs: { knee: number; torso: number; neck: number }[]
): RepScore['angles'] | null {
  if (segmentAngles.length === 0 || referenceAvgs.length === 0) return null;

  // Average the segment's angles
  const avgKnee = segmentAngles.reduce((s, a) => s + a.kneeAngle, 0) / segmentAngles.length;
  const avgTorso = segmentAngles.reduce((s, a) => s + a.torsoAbs, 0) / segmentAngles.length;
  const avgNeck = segmentAngles.reduce((s, a) => s + a.neckAbs, 0) / segmentAngles.length;

  // Average the reference
  const refKnee = referenceAvgs.reduce((s, a) => s + a.knee, 0) / referenceAvgs.length;
  const refTorso = referenceAvgs.reduce((s, a) => s + a.torso, 0) / referenceAvgs.length;
  const refNeck = referenceAvgs.reduce((s, a) => s + a.neck, 0) / referenceAvgs.length;

  const pctDiff = (val: number, ref: number) => ref > 0 ? Math.abs((val - ref) / ref) * 100 : 0;

  return {
    knee: { avg: avgKnee, refAvg: refKnee, diffPct: pctDiff(avgKnee, refKnee) },
    torso: { avg: avgTorso, refAvg: refTorso, diffPct: pctDiff(avgTorso, refTorso) },
    neck: { avg: avgNeck, refAvg: refNeck, diffPct: pctDiff(avgNeck, refNeck) },
  };
}

/** Score a full form analysis session */
export function scoreFormAnalysis(repScores: RepScore[]): FormAnalysisResult {
  if (repScores.length === 0) {
    return {
      repsAnalyzed: 0,
      overallScore: 0,
      overallAssessment: 'Sin datos',
      assessmentColor: '#78716c',
      repScores: [],
    };
  }

  const overallScore = Math.round(repScores.reduce((s, r) => s + r.score, 0) / repScores.length);
  const worstLabel = worstAssessment(repScores.map(r => r.assessment));
  const overallColor = ASSESSMENT_THRESHOLDS.find(t => t.label === worstLabel)?.color ?? '#78716c';

  return {
    repsAnalyzed: repScores.length,
    overallScore,
    overallAssessment: worstLabel,
    assessmentColor: overallColor,
    repScores,
  };
}
