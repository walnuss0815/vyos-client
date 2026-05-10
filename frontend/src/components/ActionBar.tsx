type Props = {
  dirtyCount: number;
  busy: boolean;
  onCommit: () => Promise<void>;
  onSave: () => Promise<void>;
  onReset: () => void;
};

export function ActionBar({ dirtyCount, busy, onCommit, onSave, onReset }: Props) {
  return (
    <div className="action-bar" role="region" aria-label="Aktionen für Konfigurationsänderungen">
      <div>
        <p className="eyebrow">Draft Status</p>
        <strong>{dirtyCount} offene Änderung{dirtyCount === 1 ? '' : 'en'}</strong>
      </div>
      <div className="action-group">
        <button className="btn btn-ghost" onClick={onReset} disabled={busy || dirtyCount === 0}>Reset</button>
        <button className="btn btn-secondary" onClick={onCommit} disabled={busy || dirtyCount === 0}>Commit</button>
        <button className="btn btn-primary" onClick={onSave} disabled={busy}>Save</button>
      </div>
    </div>
  );
}
