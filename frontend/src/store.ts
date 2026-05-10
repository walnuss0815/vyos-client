import { create } from 'zustand';
import type { AuthState, DraftOperation, JsonValue } from './types';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function pathToKey(path: string[]) {
  return path.join('\u001f');
}

function isObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setAtPath(target: JsonValue, path: string[], input?: string): JsonValue {
  const root = clone(target);
  if (path.length === 0) return root;

  let cursor: any = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (!isObject(cursor[segment] as JsonValue)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }

  const last = path[path.length - 1];
  cursor[last] = input === undefined || input === '' ? {} : input;
  return root;
}

function deleteAtPath(target: JsonValue, path: string[]): JsonValue {
  const root = clone(target);
  if (path.length === 0) return root;

  const trail: any[] = [];
  let cursor: any = root;

  for (let index = 0; index < path.length - 1; index += 1) {
    trail.push([cursor, path[index]]);
    cursor = cursor?.[path[index]];
    if (cursor === undefined || cursor === null) return root;
  }

  delete cursor[path[path.length - 1]];

  for (let index = trail.length - 1; index >= 0; index -= 1) {
    const [parent, key] = trail[index];
    const value = parent[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      delete parent[key];
    }
  }

  return root;
}

export type AppStore = {
  auth: AuthState | null;
  config: JsonValue | null;
  committedConfig: JsonValue | null;
  draftOps: DraftOperation[];
  setAuth: (auth: AuthState | null) => void;
  setConfig: (config: JsonValue) => void;
  queueSet: (path: string[], value?: string) => void;
  queueDelete: (path: string[]) => void;
  resetDraft: () => void;
  markCommitted: (config: JsonValue) => void;
  dirtyKeys: Set<string>;
  isDirtyPath: (path: string[]) => boolean;
};

export const useAppStore = create<AppStore>((set, get) => ({
  auth: null,
  config: null,
  committedConfig: null,
  draftOps: [],
  dirtyKeys: new Set<string>(),
  setAuth: (auth) => set({ auth }),
  setConfig: (config) => set({ config, committedConfig: clone(config), draftOps: [], dirtyKeys: new Set<string>() }),
  queueSet: (path, value) => {
    const current = get().config;
    if (!current) return;
    const updated = setAtPath(current, path, value);
    const op: DraftOperation = { id: crypto.randomUUID(), type: 'set', path, value };
    const dirtyKeys = new Set(get().dirtyKeys);
    for (let index = 1; index <= path.length; index += 1) {
      dirtyKeys.add(pathToKey(path.slice(0, index)));
    }
    set({ config: updated, draftOps: [...get().draftOps, op], dirtyKeys });
  },
  queueDelete: (path) => {
    const current = get().config;
    if (!current) return;
    const updated = deleteAtPath(current, path);
    const op: DraftOperation = { id: crypto.randomUUID(), type: 'delete', path };
    const dirtyKeys = new Set(get().dirtyKeys);
    for (let index = 1; index <= path.length; index += 1) {
      dirtyKeys.add(pathToKey(path.slice(0, index)));
    }
    set({ config: updated, draftOps: [...get().draftOps, op], dirtyKeys });
  },
  resetDraft: () => {
    const committedConfig = get().committedConfig;
    set({ config: committedConfig ? clone(committedConfig) : null, draftOps: [], dirtyKeys: new Set<string>() });
  },
  markCommitted: (config) => set({ config: clone(config), committedConfig: clone(config), draftOps: [], dirtyKeys: new Set<string>() }),
  isDirtyPath: (path) => get().dirtyKeys.has(pathToKey(path))
}));
