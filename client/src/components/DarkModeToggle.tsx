interface Props {
  dark: boolean;
  onToggle: () => void;
}

export function DarkModeToggle({ dark, onToggle }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Toggle dark mode"
      onClick={onToggle}
      style={{
        width: 34,
        height: 19,
        borderRadius: 999,
        background: dark ? '#0a3420' : '#daeade',
        border: '1.5px solid',
        borderColor: dark ? '#2a6e47' : '#b5d4bc',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.22s, border-color 0.22s',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: dark ? 18 : 2,
          width: 11,
          height: 11,
          borderRadius: '50%',
          background: dark ? '#f7faf8' : '#0f4c2b',
          transition: 'left 0.22s, background 0.22s',
          display: 'block',
        }}
      />
    </button>
  );
}
