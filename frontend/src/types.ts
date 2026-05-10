export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue; }

export type ConfigureCommand = {
  op: 'set' | 'delete' | 'comment';
  path: string[];
};

export type DraftOperation = {
  id: string;
  type: 'set' | 'delete';
  path: string[];
  value?: string;
};

export type AuthState = {
  token: string;
  user: string;
  expiresIn: string;
};

export type TreeNodeData = {
  key: string;
  path: string[];
  value: JsonValue;
  isDirty: boolean;
};
