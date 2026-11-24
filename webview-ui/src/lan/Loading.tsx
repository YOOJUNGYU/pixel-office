/** A loading line: three pixel squares hopping in turn, then the text — so a slow load never looks frozen. */
export function Loading({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span
      role="status"
      data-loading
      className={`flex items-center gap-6 text-xs text-text-muted ${className}`}
    >
      <span className="loading-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {text}
    </span>
  );
}
