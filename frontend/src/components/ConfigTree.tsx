import { useMemo, useState } from 'react';
import type { JsonValue } from '../types';

type TreeProps = {
  value:          JsonValue;
  isDirtyPath:    (path: string[]) => boolean;
  onAddNode:      (path: string[]) => void;
  onDeleteNode:   (path: string[]) => void;
};

function isObject(v: JsonValue): v is Record<string, JsonValue> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function LeafValue({ value }: { value: JsonValue }) {
  return <span className="node-value">{String(value)}</span>;
}

type NodeProps = {
  name:         string;
  path:         string[];
  value:        JsonValue;
  isDirtyPath:  (path: string[]) => boolean;
  onAddNode:    (path: string[]) => void;
  onDeleteNode: (path: string[]) => void;
};

function ConfigNode({ name, path, value, isDirtyPath, onAddNode, onDeleteNode }: NodeProps) {
  const [expanded, setExpanded] = useState(path.length < 2);
  const dirty       = isDirtyPath(path);
  const hasChildren = isObject(value);
  const entries     = useMemo(() => (hasChildren ? Object.entries(value) : []), [hasChildren, value]);
  const childCount  = entries.length;

  return (
    <li className="node-item">
      <div className={`node-row${dirty ? ' is-dirty' : ''}`}>
        {hasChildren ? (
          <button
            className="node-toggle"
            onClick={() => setExpanded((x) => !x)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse node' : 'Expand node'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="node-spacer" aria-hidden="true">•</span>
        )}

        <span className="node-key">{name}</span>

        {hasChildren
          ? <span className="node-badge">{childCount} node{childCount === 1 ? '' : 's'}</span>
          : <LeafValue value={value} />
        }

        <div className="node-actions">
          <button
            className="mini-btn"
            onClick={() => onAddNode(path)}
            title="Add child node"
          >
            + Node
          </button>
          <button
            className="mini-btn danger"
            onClick={() => onDeleteNode(path)}
            title="Delete this node"
          >
            Delete
          </button>
        </div>
      </div>

      {hasChildren && expanded && childCount > 0 ? (
        <ul className="node-list">
          {entries.map(([key, child]) => (
            <ConfigNode
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

export function ConfigTree({ value, isDirtyPath, onAddNode, onDeleteNode }: TreeProps) {
  if (!isObject(value) || Object.keys(value).length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">◇</div>
        <h2>No configuration loaded</h2>
        <p>The response did not contain a usable configuration tree.</p>
      </div>
    );
  }

  return (
    <ul className="node-list root-tree">
      {Object.entries(value).map(([key, child]) => (
        <ConfigNode
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
