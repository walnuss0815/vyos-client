import { useMemo, useState } from 'react';
import type { JsonValue } from '../types';

type Props = {
  value: JsonValue;
  isDirtyPath: (path: string[]) => boolean;
  onAddNode: (path: string[], mode: 'branch' | 'leaf') => void;
  onDeleteNode: (path: string[]) => void;
};

function isObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ScalarValue({ value }: { value: JsonValue }) {
  return <span className="tree-value">{String(value)}</span>;
}

function Branch({
  name,
  path,
  value,
  isDirtyPath,
  onAddNode,
  onDeleteNode
}: {
  name: string;
  path: string[];
  value: JsonValue;
  isDirtyPath: (path: string[]) => boolean;
  onAddNode: (path: string[], mode: 'branch' | 'leaf') => void;
  onDeleteNode: (path: string[]) => void;
}) {
  const [open, setOpen] = useState(path.length < 2);
  const dirty = isDirtyPath(path);
  const branch = isObject(value);
  const entries = useMemo(() => (branch ? Object.entries(value) : []), [branch, value]);

  return (
    <li className="tree-item">
      <div className={`tree-row ${dirty ? 'is-dirty' : ''}`}>
        {branch ? (
          <button className="tree-toggle" onClick={() => setOpen((current) => !current)} aria-label={open ? 'Zuklappen' : 'Aufklappen'}>
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-spacer" aria-hidden="true">•</span>
        )}
        <span className="tree-key">{name}</span>
        {!branch ? <ScalarValue value={value} /> : <span className="tree-pill">{entries.length} Einträge</span>}
        <div className="tree-actions">
          {branch ? <button className="mini-btn" onClick={() => onAddNode(path, 'branch')}>+ Ast</button> : null}
          <button className="mini-btn" onClick={() => onAddNode(path, 'leaf')}>+ Blatt</button>
          <button className="mini-btn danger" onClick={() => onDeleteNode(path)}>Löschen</button>
        </div>
      </div>
      {branch && open && entries.length > 0 ? (
        <ul className="tree-list">
          {entries.map(([key, child]) => (
            <Branch
              key={key}
              name={key}
              path={[...path, key]}
              value={child}
              isDirtyPath={isDirtyPath}
              onAddNode={onAddNode}
              onDeleteNode={onDeleteNode}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ConfigTree({ value, isDirtyPath, onAddNode, onDeleteNode }: Props) {
  if (!isObject(value) || Object.keys(value).length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">◇</div>
        <h2>Keine Konfiguration geladen</h2>
        <p>Die aktuelle Antwort enthält keine verwertbare Konfigurationsstruktur.</p>
      </div>
    );
  }

  return (
    <ul className="tree-list root-tree">
      {Object.entries(value).map(([key, child]) => (
        <Branch
          key={key}
          name={key}
          path={[key]}
          value={child}
          isDirtyPath={isDirtyPath}
          onAddNode={onAddNode}
          onDeleteNode={onDeleteNode}
        />
      ))}
    </ul>
  );
}
