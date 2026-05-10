import { create } from 'zustand';
import type { AuthState, DraftOperation, JsonValue } from './types';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function pathKey(path: string[]) {
  return path.join('\u001f');
}

function isObject(v: JsonValue): v is Record<string, JsonValue> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function setAtPath(root: JsonValue, path: string[], value?: string): JsonValue {
  const next = clone(root);
  if (path.length === 0) return next;
  let cursor: any = next;
  for (let i = 0; i < path.length - 1; i++) {
    if (!isObject(cursor[path[i]] as JsonValue)) cursor[path[i]] = {};
    cursor = cursor[path[i]];
  }
  cursor[path[path.length - 1]] = value === undefined || value === '' ? {} : value;
  return next;
}

function deleteAtPath(root: JsonValue, path: string[]): JsonValue {
  const next = clone(root);
  if (path.length === 0) return next;
  const trail: [any, string][] = [];
  let cursor: any = next;
  for (let i = 0; i < path.length - 1; i++) {
    trail.push([cursor, path[i]]);
    cursor = cursor?.[path[i]];
    if (cursor == null) return next;
  }
  delete cursor[path[path.length - 1]];
  for (let i = trail.length - 1; i >= 0; i--) {
    const [parent, key] = trail[i];
    const child = parent[key];
    if (child && typeof child === 'object' && !Array.isArray(child) && Object.keys(child).length === 0) {
      delete parent[key];
    }
  }
  return next;
}

export type AppStore = {
  auth:             AuthState | null;
  config:           JsonValue | null;
  committedConfig:  JsonValue | null;
  draftOps:         DraftOperation[];
  dirtyKeys:        Set<string>;
  setAuth:          (auth: AuthState | null) => void;
  setConfig:        (config: JsonValue)      => void;
  queueSet:         (path: string[], value?: string) => void;
  queueDelete:      (path: string[])         => void;
  resetDraft:       ()                       => void;
  markCommitted:    (config: JsonValue)      => void;
  isDirtyPath:      (path: string[])         => boolean;
};

export const useAppStore = create<AppStore>((set, get) => ({
  auth:            null,
  config:          null,
  committedConfig: null,
  draftOps:        [],
  dirtyKeys:       new Set<string>(),

  setAuth: (auth) => set({ auth }),

  setConfig: (config) =>
    set({ config, committedConfig: clone(config), draftOps: [], dirtyKeys: new Set() }),

  queueSet: (path, value) => {
    const current = get().config;
    if (!current) return;
    const updated   = setAtPath(current, path, value);
    const op: DraftOperation = { id: crypto.randomUUID(), type: 'set', path, value };
    const dirtyKeys = new Set(get().dirtyKeys);
    for (let i = 1; i <= path.length; i++) dirtyKeys.add(pathKey(path.slice(0, i)));
    set({ config: updated, draftOps: [...get().draftOps, op], dirtyKeys });
  },

  queueDelete: (path) => {
    const current = get().config;
    if (!current) return;
    const updated   = deleteAtPath(current, path);
    const op: DraftOperation = { id: crypto.randomUUID(), type: 'delete', path };
    const dirtyKeys = new Set(get().dirtyKeys);
    for (let i = 1; i <= path.length; i++) dirtyKeys.add(pathKey(path.slice(0, i)));
    set({ config: updated, draftOps: [...get().draftOps, op], dirtyKeys });
  },

  resetDraft: () => {
    const base = get().committedConfig;
    set({ config: base ? clone(base) : null, draftOps: [], dirtyKeys: new Set() });
  },

  markCommitted: (config) =>
    set({ config: clone(config), committedConfig: clone(config), draftOps: [], dirtyKeys: new Set() }),

  isDirtyPath: (path) => get().dirtyKeys.has(pathKey(path)),
}));
