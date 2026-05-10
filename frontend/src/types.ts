export type JsonPrimitive = string | number | boolean | null;
export type JsonValue     = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue; }

export type ConfigureCommand = {
  op:   'set' | 'delete' | 'comment';
  path: string[];
};

/** A pending local change that has not yet been committed to VyOS */
export type DraftOperation = {
  id:     string;
  type:   'set' | 'delete';
  path:   string[];
  value?: string;
};

export type AuthState = {
  token:     string;
  user:      string;
  expiresIn: string;
};

/** Describes a single node in the configuration tree */
export type ConfigNode = {
  key:     string;
  path:    string[];
  value:   JsonValue;
  isDirty: boolean;
};
