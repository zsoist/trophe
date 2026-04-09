'use client';

import { useEffect } from 'react';
import type { PosePoints } from '@/lib/form-analysis';
import { POSE_CONNECTIONS } from '@/lib/form-analysis';

interface PoseOverlayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  posePoints: PosePoints | null;
  referencePosePoints?: PosePoints | null;
  angles: {
    kneeAngle: number | null;
    torsoInclinationAbs: number | null;
    neckInclinationAbs: number | null;
  } | null;
  assessment?: string;
  assessmentColor?: string;
  width: number;
  height: number;
}

const POINT_RADIUS = 6;
const LINE_WIDTH = 3;
const USER_COLOR = '#22c55e';
const REFERENCE_COLOR = '#f97316';
const LABEL_FONT = '600 12px system-ui, -apple-system, sans-serif';
const BADGE_FONT = '700 14px system-ui, -apple-system, sans-serif';

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  points: PosePoints,
  color: string,
  w: number,
  h: number,
  alpha: number = 1.0
) {
  ctx.globalAlpha = alpha;

  // Draw connections
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';
  for (const [from, to] of POSE_CONNECTIONS) {
    const a = points[from];
    const b = points[to];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }

  // Draw joints
  const joints: (keyof PosePoints)[] = ['ear', 'shoulder', 'hip', 'knee', 'ankle'];
  for (const key of joints) {
    const pt = points[key];
    if (!pt) continue;
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.globalAlpha = 1.0;
}

function drawAngleLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number
) {
  ctx.font = LABEL_FONT;
  const metrics = ctx.measureText(text);
  const pad = 4;
  const bw = metrics.width + pad * 2;
  const bh = 18;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 4);
  ctx.fill();

  ctx.fillStyle = '#f5f5f4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

export default function PoseOverlay({
  canvasRef,
  posePoints,
  referencePosePoints,
  angles,
  assessment,
  assessmentColor,
  width,
  height,
}: PoseOverlayProps) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    // Draw reference skeleton first (behind user)
    if (referencePosePoints) {
      drawSkeleton(ctx, referencePosePoints, REFERENCE_COLOR, width, height, 0.5);
    }

    // Draw user skeleton
    if (posePoints) {
      drawSkeleton(ctx, posePoints, USER_COLOR, width, height, 1.0);

      // Draw angle labels at joint positions
      if (angles) {
        if (angles.kneeAngle !== null && posePoints.knee) {
          drawAngleLabel(
            ctx,
            `${Math.round(angles.kneeAngle)}°`,
            posePoints.knee.x * width + 30,
            posePoints.knee.y * height
          );
        }
        if (angles.torsoInclinationAbs !== null && posePoints.hip) {
          drawAngleLabel(
            ctx,
            `${Math.round(angles.torsoInclinationAbs)}°`,
            posePoints.hip.x * width + 30,
            posePoints.hip.y * height
          );
        }
        if (angles.neckInclinationAbs !== null && posePoints.shoulder) {
          drawAngleLabel(
            ctx,
            `${Math.round(angles.neckInclinationAbs)}°`,
            posePoints.shoulder.x * width + 30,
            posePoints.shoulder.y * height
          );
        }
      }
    }

    // Draw assessment badge in top-right
    if (assessment && assessmentColor) {
      ctx.font = BADGE_FONT;
      const text = assessment;
      const metrics = ctx.measureText(text);
      const pad = 10;
      const bw = metrics.width + pad * 2;
      const bh = 28;
      const bx = width - bw - 10;
      const by = 10;

      ctx.fillStyle = assessmentColor + '33';
      ctx.strokeStyle = assessmentColor + '66';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = assessmentColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + bw / 2, by + bh / 2);
    }
  }, [canvasRef, posePoints, referencePosePoints, angles, assessment, assessmentColor, width, height]);

  return null; // Canvas is rendered by parent, this component just draws on it
}
