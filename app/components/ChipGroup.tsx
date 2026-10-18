"use client";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export function ChipGroup<T extends string>({
  options,
  selected,
  onToggle,
  ariaLabel,
}: {
  options: ChipOption<T>[];
  selected: T[];
  onToggle: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="chips" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={`chip${active ? " active" : ""}`}
            onClick={() => onToggle(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
