'use client';

import type { KeyboardEvent } from 'react';
import { useMemo, useState } from 'react';
import type { AnatomyMuscleId, AnatomyView, MuscleActivation, MuscleRole } from '@/lib/workout/anatomy';

export interface MuscleAtlasProps {
  activations: MuscleActivation[];
  selected?: AnatomyMuscleId | null;
  onSelect: (id: AnatomyMuscleId) => void;
  compact?: boolean;
}

type Region = { d: string; view: AnatomyView };

/* A named, deterministic anatomy diagram — deliberately geometric rather than illustrative. */
const REGIONS: Record<AnatomyMuscleId, Region> = {
  'pectoralis-major': { view: 'front', d: 'M31 78h27v31H31z M62 78h27v31H62z' },
  'serratus-anterior': { view: 'front', d: 'M22 108h14v31H22z M84 108h14v31H84z' },
  'anterior-deltoid': { view: 'front', d: 'M18 67h14v30H18z M88 67h14v30H88z' },
  'middle-deltoid': { view: 'front', d: 'M12 75h12v33H12z M96 75h12v33H96z' },
  'posterior-deltoid': { view: 'back', d: 'M18 67h14v30H18z M88 67h14v30H88z' },
  'rotator-cuff': { view: 'back', d: 'M31 76h16v13H31z M73 76h16v13H73z' },
  'upper-trapezius': { view: 'back', d: 'M44 51h32v34H44z' },
  'lower-trapezius': { view: 'back', d: 'M47 86h26v38H47z' },
  'latissimus-dorsi': { view: 'back', d: 'M25 100h23v48H25z M72 100h23v48H72z' },
  rhomboids: { view: 'back', d: 'M48 86h24v29H48z' },
  'erector-spinae': { view: 'back', d: 'M53 119h14v49H53z' },
  'biceps-brachii': { view: 'front', d: 'M16 104h13v53H16z M91 104h13v53H91z' },
  'triceps-brachii': { view: 'back', d: 'M16 104h13v53H16z M91 104h13v53H91z' },
  brachialis: { view: 'front', d: 'M27 117h8v39H27z M85 117h8v39H85z' },
  'forearm-flexors': { view: 'front', d: 'M12 159h15v45H12z M93 159h15v45H93z' },
  'forearm-extensors': { view: 'back', d: 'M12 159h15v45H12z M93 159h15v45H93z' },
  'rectus-abdominis': { view: 'front', d: 'M46 111h28v61H46z' },
  obliques: { view: 'front', d: 'M31 122h14v44H31z M75 122h14v44H75z' },
  'gluteus-maximus': { view: 'back', d: 'M32 171h26v28H32z M62 171h26v28H62z' },
  'gluteus-medius': { view: 'back', d: 'M28 163h20v19H28z M72 163h20v19H72z' },
  quadriceps: { view: 'front', d: 'M35 173h20v75H35z M65 173h20v75H65z' },
  hamstrings: { view: 'back', d: 'M35 199h20v49H35z M65 199h20v49H65z' },
  adductors: { view: 'front', d: 'M50 177h10v71H50z M60 177h10v71H60z' },
  gastrocnemius: { view: 'back', d: 'M37 251h18v37H37z M65 251h18v37H65z' },
  soleus: { view: 'back', d: 'M40 278h15v19H40z M65 278h15v19H65z' },
  'tibialis-anterior': { view: 'front', d: 'M38 251h13v45H38z M69 251h13v45H69z' },
};

const ROLE_LABELS: Record<MuscleRole, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  stabilizer: 'Stabilizer',
};

function regionClass(role: MuscleRole, isSelected: boolean) {
  return `muscle-atlas__region muscle-atlas__region--${role}${isSelected ? ' muscle-atlas__region--selected' : ''}`;
}

function handleRegionKeyDown(event: KeyboardEvent<SVGGElement>, id: AnatomyMuscleId, onSelect: (id: AnatomyMuscleId) => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelect(id);
  }
}

export function MuscleAtlas({ activations, selected = null, onSelect, compact = false }: MuscleAtlasProps) {
  const [view, setView] = useState<AnatomyView>(() => activations.find((activation) => activation.id === selected)?.view ?? 'front');
  const visibleActivations = useMemo(() => activations.filter((activation) => activation.view === view), [activations, view]);

  return (
    <section className={`muscle-atlas${compact ? ' muscle-atlas--compact' : ''}`} aria-label="Muscle activation atlas">
      {!compact ? <div className="muscle-atlas__header">
        <div>
          <h2>Muscle focus</h2>
          <p>Choose a highlighted region to inspect its role.</p>
        </div>
        <div className="muscle-atlas__views" aria-label="Anatomy view">
          {(['front', 'back'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={view === candidate}
              aria-label={`Show ${candidate} anatomy`}
              onClick={() => setView(candidate)}
            >
              {candidate === 'front' ? 'Front' : 'Back'}
            </button>
          ))}
        </div>
      </div> : <div className="muscle-atlas__views muscle-atlas__views--compact" aria-label="Anatomy view">
        {(['front', 'back'] as const).map((candidate) => (
          <button key={candidate} type="button" aria-pressed={view === candidate} aria-label={`Show ${candidate} anatomy`} onClick={() => setView(candidate)}>
            {candidate === 'front' ? 'Front' : 'Back'}
          </button>
        ))}
      </div>}

      <div className="muscle-atlas__figure-wrap">
        <svg className="muscle-atlas__figure" viewBox="0 0 120 306" role="group" aria-label={`${view === 'front' ? 'Front' : 'Back'} anatomy map`}>
          <path className="muscle-atlas__frame" d="M51 13h18v24l10 14 18 12-5 44-12 52-8 42 13 49-6 56H41l-6-56 13-49-8-42-12-52-5-44 18-12 10-14z" />
          <path className="muscle-atlas__axis" d="M60 39v258" />
          {visibleActivations.map((activation) => {
            const region = REGIONS[activation.id];
            return (
              <g
                key={activation.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected === activation.id}
                aria-label={`${activation.label}, ${ROLE_LABELS[activation.role]} muscle`}
                className={regionClass(activation.role, selected === activation.id)}
                onClick={() => onSelect(activation.id)}
                onFocus={() => onSelect(activation.id)}
                onKeyDown={(event) => handleRegionKeyDown(event, activation.id, onSelect)}
              >
                <path d={region.d} />
              </g>
            );
          })}
        </svg>
      </div>

      <ul className="muscle-atlas__roles" aria-label="Highlighted muscle roles">
        {activations.map((activation) => (
          <li key={activation.id} className={selected === activation.id ? 'is-selected' : ''}>
            <span className={`muscle-atlas__swatch muscle-atlas__swatch--${activation.role}`} aria-hidden="true" />
            <span>{activation.label}</span>
            <strong>{ROLE_LABELS[activation.role]}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default MuscleAtlas;
