'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2, AlertCircle, CircleDot } from 'lucide-react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import PoseOverlay from '@/components/workout/PoseOverlay';
import {
  extractPosePoints,
  computeAngles,
  ema,
  emaPoint,
  detectDirectionChanges,
  countReps,
  compareSegmentToReference,
  classifyDifference,
  scoreFormAnalysis,
  formAssessmentKey,
  ALPHA_POINTS,
  ALPHA_ANGLE,
  type PosePoints,
  type FrameAngles,
  type DirectionChange,
  type RepScore,
  type FormAnalysisResult,
} from '@/lib/fitness/form-analysis';
import { EXERCISE_REFERENCES } from '@/lib/fitness/exercise-references';
import { useI18n } from '@/lib/i18n';

interface FormCheckProps {
  exercise: string;
  side: 'right' | 'left';
  onComplete: (result: FormAnalysisResult) => void;
  onBack: () => void;
}

type LoadingState = 'init' | 'loading_model' | 'requesting_camera' | 'ready' | 'recording' | 'error';

export default function FormCheck({ exercise, side, onComplete, onBack }: FormCheckProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const lastTimestampRef = useRef<number>(-1);

  const [state, setState] = useState<LoadingState>('init');
  const [errorKey, setErrorKey] = useState('formCheck.init_error');
  const [loadingKey, setLoadingKey] = useState('formCheck.loading_model');

  // Detection state
  const [currentPosePoints, setCurrentPosePoints] = useState<PosePoints | null>(null);
  const [currentAngles, setCurrentAngles] = useState<{
    kneeAngle: number | null;
    torsoInclinationAbs: number | null;
    neckInclinationAbs: number | null;
  } | null>(null);
  const [currentAssessment, setCurrentAssessment] = useState<string>('');
  const [currentAssessmentColor, setCurrentAssessmentColor] = useState<string>('');
  const [repCount, setRepCount] = useState(0);
  const [videoSize, setVideoSize] = useState({ width: 640, height: 480 });

  // Frame collection
  const framesRef = useRef<FrameAngles[]>([]);
  const smoothedPointsRef = useRef<PosePoints | null>(null);
  const smoothedAnglesRef = useRef<{
    kneeAngle: number | null;
    torsoInclinationAbs: number | null;
    neckInclinationAbs: number | null;
  } | null>(null);
  const frameCountRef = useRef(0);
  const directionChangesRef = useRef<DirectionChange[]>([]);

  const reference = EXERCISE_REFERENCES[exercise];

  // ─── Initialize MediaPipe ───
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setState('loading_model');
        setLoadingKey('formCheck.loading_model');

        const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

        if (cancelled) return;

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
        );

        if (cancelled) return;

        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        });

        if (cancelled) return;
        poseLandmarkerRef.current = poseLandmarker;

        // Request camera
        setState('requesting_camera');
        setLoadingKey('formCheck.requesting_camera');

        let stream: MediaStream;
        try {
          // Try back camera first (mobile)
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment',
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          });
        } catch {
          // Fallback to front camera (desktop/laptop)
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();

        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        setVideoSize({ width: w, height: h });

        setState('ready');
      } catch (error: unknown) {
        if (cancelled) return;
        console.error('FormCheck init error:', error);
        setState('error');
        const message = error instanceof Error ? error.message : '';
        const name = error instanceof Error ? error.name : '';
        if (name === 'NotAllowedError') {
          setErrorKey('formCheck.camera_denied');
        } else if (name === 'NotFoundError' || name === 'NotReadableError') {
          setErrorKey('formCheck.camera_unavailable');
        } else if (message.includes('wasm') || message.includes('fetch')) {
          setErrorKey('formCheck.model_error');
        } else {
          setErrorKey('formCheck.init_error');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close();
      }
    };
  }, []);

  // ─── Detection loop ───
  const detectLoop = useCallback(function runDetection() {
    const video = videoRef.current;
    const poseLandmarker = poseLandmarkerRef.current;

    if (!video || !poseLandmarker || video.readyState < 4) {
      animationFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const now = performance.now();
    if (now === lastTimestampRef.current) {
      animationFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }
    lastTimestampRef.current = now;

    try {
      const results = poseLandmarker.detectForVideo(video, now);

      if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0];
        const rawPoints = extractPosePoints(landmarks, side);

        // EMA smoothing on points
        const prevPoints = smoothedPointsRef.current;
        const smoothed: PosePoints = {
          ear: rawPoints.ear
            ? emaPoint(rawPoints.ear, prevPoints?.ear ?? null, ALPHA_POINTS)
            : null,
          shoulder: rawPoints.shoulder
            ? emaPoint(rawPoints.shoulder, prevPoints?.shoulder ?? null, ALPHA_POINTS)
            : null,
          hip: rawPoints.hip
            ? emaPoint(rawPoints.hip, prevPoints?.hip ?? null, ALPHA_POINTS)
            : null,
          knee: rawPoints.knee
            ? emaPoint(rawPoints.knee, prevPoints?.knee ?? null, ALPHA_POINTS)
            : null,
          ankle: rawPoints.ankle
            ? emaPoint(rawPoints.ankle, prevPoints?.ankle ?? null, ALPHA_POINTS)
            : null,
        };
        smoothedPointsRef.current = smoothed;

        // Compute angles
        const rawAngles = computeAngles(smoothed);

        // EMA smoothing on angles
        const prevAngles = smoothedAnglesRef.current;
        const smoothedAng = {
          kneeAngle:
            rawAngles.kneeAngle !== null
              ? ema(rawAngles.kneeAngle, prevAngles?.kneeAngle ?? null, ALPHA_ANGLE)
              : null,
          torsoInclinationAbs:
            rawAngles.torsoInclinationAbs !== null
              ? ema(rawAngles.torsoInclinationAbs, prevAngles?.torsoInclinationAbs ?? null, ALPHA_ANGLE)
              : null,
          neckInclinationAbs:
            rawAngles.neckInclinationAbs !== null
              ? ema(rawAngles.neckInclinationAbs, prevAngles?.neckInclinationAbs ?? null, ALPHA_ANGLE)
              : null,
        };
        smoothedAnglesRef.current = smoothedAng;

        // Store frame
        const frameNum = frameCountRef.current++;
        const frame: FrameAngles = {
          frame: frameNum,
          timestamp: now,
          kneeAngle: smoothedAng.kneeAngle,
          torsoInclinationAbs: smoothedAng.torsoInclinationAbs,
          neckInclinationAbs: smoothedAng.neckInclinationAbs,
          posePoints: smoothed,
        };
        framesRef.current.push(frame);

        // Detect direction changes and count reps
        const changes = detectDirectionChanges(framesRef.current);
        directionChangesRef.current = changes;
        const reps = countReps(changes);
        setRepCount(reps);

        // Live assessment based on current knee angle vs reference midpoint
        if (smoothedAng.kneeAngle !== null && reference) {
          const refMidKnee =
            reference.descent[50].knee;
          const diffPct = Math.abs(
            ((smoothedAng.kneeAngle - refMidKnee) / refMidKnee) * 100
          );
          const classification = classifyDifference(diffPct);
          setCurrentAssessment(classification.label);
          setCurrentAssessmentColor(classification.color);
        }

        // Update state for overlay
        setCurrentPosePoints(smoothed);
        setCurrentAngles(smoothedAng);
      }
    } catch {
      // Detection errors are non-fatal, just skip frame
    }

    animationFrameRef.current = requestAnimationFrame(runDetection);
  }, [side, reference]);

  // ─── Start recording ───
  const startRecording = useCallback(() => {
    framesRef.current = [];
    smoothedPointsRef.current = null;
    smoothedAnglesRef.current = null;
    frameCountRef.current = 0;
    directionChangesRef.current = [];
    setRepCount(0);
    setState('recording');
    animationFrameRef.current = requestAnimationFrame(detectLoop);
  }, [detectLoop]);

  // ─── Finish and analyze ───
  const finishRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const frames = framesRef.current;
    const changes = directionChangesRef.current;

    if (!reference || frames.length === 0) {
      onComplete(scoreFormAnalysis([]));
      return;
    }

    // Segment frames into reps using direction changes
    const repScores: RepScore[] = [];
    let repNum = 0;

    for (let i = 0; i < changes.length; i++) {
      const startFrame = i === 0 ? 0 : changes[i - 1].frame;
      const endFrame = changes[i].frame;
      const segmentFrames = frames.filter(
        (f) => f.frame >= startFrame && f.frame <= endFrame
      );

      if (segmentFrames.length < 3) continue;

      const segmentType = changes[i].direction === 'baja_a_sube' ? 'ascent' : 'descent';
      const refData = segmentType === 'descent' ? reference.descent : reference.ascent;

      const segmentAngles = segmentFrames
        .filter(
          (f) =>
            f.kneeAngle !== null &&
            f.torsoInclinationAbs !== null &&
            f.neckInclinationAbs !== null
        )
        .map((f) => ({
          kneeAngle: f.kneeAngle!,
          torsoAbs: f.torsoInclinationAbs!,
          neckAbs: f.neckInclinationAbs!,
        }));

      const refAvgs = refData.map((r) => ({
        knee: r.knee,
        torso: r.torso,
        neck: r.neck,
      }));

      const comparison = compareSegmentToReference(segmentAngles, refAvgs);
      if (!comparison) continue;

      const maxDiff = Math.max(
        comparison.knee.diffPct,
        comparison.torso.diffPct,
        comparison.neck.diffPct
      );
      const classification = classifyDifference(maxDiff);

      if (changes[i].direction === 'baja_a_sube') {
        repNum++;
      }

      repScores.push({
        rep: repNum || 1,
        segmentType,
        score: classification.score,
        assessment: classification.label,
        assessmentColor: classification.color,
        angles: comparison,
      });
    }

    const result = scoreFormAnalysis(repScores);
    onComplete(result);
  }, [reference, onComplete]);

  // ─── Render states ───
  const isLoading = state === 'init' || state === 'loading_model' || state === 'requesting_camera';

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 z-10">
        <button onClick={onBack} className="p-2 rounded-xl min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
          <ArrowLeft size={20} className="text-[var(--content-secondary)]" />
        </button>

        <div className="flex items-center gap-2">
          {state === 'recording' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger-border)' }}
            >
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                className="w-2 h-2 rounded-full bg-[var(--status-danger-fg)]"
              />
              <span className="text-xs font-medium text-[var(--status-danger-fg)]">{t('formCheck.recording')}</span>
            </motion.div>
          )}
        </div>

        {state === 'recording' && (
          <button
            onClick={finishRecording}
            className="px-4 py-2 rounded-xl text-sm font-semibold min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            style={{ background: 'color-mix(in srgb, var(--action-primary) 20%, transparent)', color: 'var(--action-primary)', border: '1px solid color-mix(in srgb, var(--action-primary) 30%, transparent)' }}
          >
            {t('formCheck.finish')}
          </button>
        )}

        {state === 'ready' && <div className="w-20" />}
      </div>

      {/* Camera feed + overlay */}
      <div data-theme-exempt="media-canvas" className="relative flex-1 overflow-hidden bg-[var(--surface-overlay)]">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ transform: 'scaleX(-1)' }}
        />
        <PoseOverlay
          canvasRef={canvasRef}
          posePoints={currentPosePoints}
          angles={currentAngles}
          assessment={currentAssessment ? t(formAssessmentKey(currentAssessment)) : ''}
          assessmentColor={currentAssessmentColor}
          width={videoSize.width}
          height={videoSize.height}
        />

        {/* Loading overlay */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-20"
              style={{ background: 'rgba(10,10,10,0.9)' }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
              >
                <Loader2 size={40} className="gold-text" />
              </motion.div>
              <p className="text-sm text-[var(--content-secondary)] mt-4">{t(loadingKey)}</p>
              <p className="text-xs text-[var(--content-muted)] mt-1">{t('formCheck.first_load')}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error overlay */}
        <AnimatePresence>
          {state === 'error' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-20 px-8"
              style={{ background: 'rgba(10,10,10,0.95)' }}
            >
              <AlertCircle size={40} className="text-[var(--status-danger-fg)] mb-4" />
              <p className="text-sm text-[var(--content-secondary)] text-center mb-4">{t(errorKey)}</p>
              <button
                onClick={onBack}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', color: 'var(--content-secondary)' }}
              >
                {t('formCheck.back')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="px-4 py-4 z-10">
        {/* Live stats when recording */}
        {state === 'recording' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-around mb-4 glass p-3 rounded-2xl"
          >
            <div className="text-center">
              <p className="text-2xl font-bold gold-text tabular-nums">{repCount}</p>
              <p className="text-xs text-[var(--content-muted)] uppercase tracking-wider">{t('formCheck.reps')}</p>
            </div>
            <div className="w-px h-8 bg-[var(--surface-2)]" />
            <div className="text-center">
              <p className="text-2xl font-bold text-[var(--content-primary)] tabular-nums">
                {currentAngles && currentAngles.kneeAngle !== null
                  ? `${Math.round(currentAngles.kneeAngle)}°`
                  : '--'}
              </p>
              <p className="text-xs text-[var(--content-muted)] uppercase tracking-wider">{t('formCheck.knee')}</p>
            </div>
            <div className="w-px h-8 bg-[var(--surface-2)]" />
            <div className="text-center min-w-0">
              <p
                className="text-xs font-semibold truncate capitalize"
                style={{ color: currentAssessmentColor || 'var(--content-muted)' }}
              >
                {currentAssessment ? t(formAssessmentKey(currentAssessment)) : '--'}
              </p>
              <p className="text-xs text-[var(--content-muted)] uppercase tracking-wider">{t('formCheck.status')}</p>
            </div>
          </motion.div>
        )}

        {/* Start button */}
        {state === 'ready' && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={startRecording}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 text-base font-bold btn-gold min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <CircleDot size={20} />
            {t('formCheck.start_recording')}
          </motion.button>
        )}
      </div>
    </div>
  );
}
