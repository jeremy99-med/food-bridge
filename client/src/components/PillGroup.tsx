interface Props {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
  center?: boolean;
}

const PillGroup = ({ options, selected, onChange, multi = true, center = false }: Props) => {
  const toggle = (opt: string) => {
    if (multi) {
      onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);
    } else {
      onChange([opt]);
    }
  };
  return (
    <div className={`flex flex-wrap gap-2${center ? ' justify-center' : ''}`}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className="fb-pill"
          data-active={selected.includes(o)}
          onClick={() => toggle(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
};

export default PillGroup;
