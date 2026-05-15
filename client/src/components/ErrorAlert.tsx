interface Props {
  message: string;
  onDismiss?: () => void;
}

const ErrorAlert = ({ message, onDismiss }: Props) => (
  <div
    className="relative pl-4 pr-4 py-3 flex items-start justify-between gap-4 bg-[#fdf2f2] rounded-md overflow-hidden"
    role="alert"
  >
    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-destructive rounded-l-md" />
    <div className="text-sm leading-snug">
      <span className="font-semibold text-destructive mr-1.5">Error.</span>
      <span className="text-[hsl(0,20%,25%)]">{message}</span>
    </div>
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="text-xs text-muted-foreground underline underline-offset-2 shrink-0 hover:text-foreground transition-colors duration-150"
        aria-label="Dismiss"
      >
        Dismiss
      </button>
    )}
  </div>
);

export default ErrorAlert;
