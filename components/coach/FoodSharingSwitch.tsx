'use client';

interface FoodSharingSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function FoodSharingSwitch({ checked, onChange }: FoodSharingSwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label="Share with assigned clients" onClick={() => onChange(!checked)} className={`relative min-h-11 min-w-11 rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${checked ? 'bg-[var(--action-primary)]' : 'bg-[var(--surface-2)]'}`}>
      <span aria-hidden="true" className={`block h-4 w-4 rounded-full bg-[var(--surface-1)] transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}
