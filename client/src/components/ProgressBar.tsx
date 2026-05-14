interface Props {
  current: number;
  total: number;
}

const ProgressBar = ({ current, total }: Props) => (
  <div className="w-full space-y-2.5">
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-[3px] flex-1 rounded-full transition-all duration-[400ms] ease-out"
          style={{
            background: i < current ? 'var(--color-foreground)' : 'var(--color-track)',
            opacity: i === current - 1 ? 1 : i < current ? 0.55 : 1,
            transform: i === current - 1 ? 'scaleY(1.4)' : 'scaleY(1)',
            transformOrigin: 'bottom',
          }}
        />
      ))}
    </div>
    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      Step {current} of {total}
    </p>
  </div>
);

export default ProgressBar;
