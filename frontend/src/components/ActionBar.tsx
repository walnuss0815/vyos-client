type Props = {
  pendingCount: number;
  busy:         boolean;
  onCommit:     () => Promise<void>;
  onSave:       () => Promise<void>;
  onReset:      () => void;
};

export function ActionBar({ pendingCount, busy, onCommit, onSave, onReset }: Props) {
  return (
    <div className="action-bar" role="region" aria-label="Configuration actions">
      <div>
        <p className="eyebrow">Draft status</p>
        <strong>
          {pendingCount} pending change{pendingCount === 1 ? '' : 's'}
        </strong>
      </div>
      <div className="action-group">
        <button
          className="btn btn-ghost"
          onClick={onReset}
          disabled={busy || pendingCount === 0}
          title="Discard all local draft changes"
        >
          Reset
        </button>
        <button
          className="btn btn-secondary"
          onClick={onCommit}
          disabled={busy || pendingCount === 0}
          title="Apply pending changes to the running configuration"
        >
          Commit
        </button>
        <button
          className="btn btn-primary"
          onClick={onSave}
          disabled={busy}
          title="Persist the running configuration to disk"
        >
          Save
        </button>
      </div>
    </div>
  );
}
