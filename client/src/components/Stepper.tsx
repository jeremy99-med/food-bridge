interface Props {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
}

const Stepper = ({ value, onChange, min = 0, max = 99, label }: Props) => {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="flex items-center justify-between border border-foreground px-4 h-12">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={dec}
          className="w-8 h-8 border border-foreground text-lg leading-none flex items-center justify-center hover:bg-foreground hover:text-background active:scale-90 transition-all duration-150 ease-out select-none"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums transition-opacity duration-150">{value}</span>
        <button
          type="button"
          onClick={inc}
          className="w-8 h-8 border border-foreground text-lg leading-none flex items-center justify-center hover:bg-foreground hover:text-background active:scale-90 transition-all duration-150 ease-out select-none"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
};

export default Stepper;
