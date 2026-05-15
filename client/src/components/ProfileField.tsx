const ProfileField = ({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) => (
  <label className={`block space-y-2 ${className ?? ''}`}>
    <span className="fb-section-title block">{label}</span>
    {children}
    {error && <p className="text-xs text-red-500 mt-1">⚠ {error}</p>}
  </label>
);

export default ProfileField;
