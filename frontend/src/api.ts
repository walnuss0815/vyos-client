import { z } from 'zod';
import type { AuthState, ConfigureCommand, JsonValue } from './types';

const loginSchema = z.object({
  token:     z.string(),
  user:      z.string(),
  expiresIn: z.string(),
});

async function request<T>(url: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error((data as any).error ?? (data as any).message ?? 'Unknown error');
  }

  return data as T;
}

export async function login(username: string, password: string): Promise<AuthState> {
  const data = await request('/auth/login', {
    method: 'POST',
    body:   JSON.stringify({ username, password }),
  });
  return loginSchema.parse(data);
}

export async function verifyToken(token: string) {
  return request<{ valid: boolean; user: string }>('/auth/verify', { method: 'GET' }, token);
}

export async function fetchInfo(token: string) {
  return request<Record<string, unknown>>('/api/info', { method: 'GET' }, token);
}

function extractConfig(payload: unknown): JsonValue {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>;
    if (p.data  !== undefined) return p.data  as JsonValue;
    if (p.result !== undefined) return p.result as JsonValue;
    if (p.config !== undefined) return p.config as JsonValue;
  }
  return payload as JsonValue;
}

export async function fetchConfig(token: string): Promise<JsonValue> {
  const payload = await request<unknown>('/api/retrieve', {
    method: 'POST',
    body:   JSON.stringify({ op: 'showConfig', path: [] }),
  }, token);
  return extractConfig(payload);
}

export async function commitDraft(token: string, commands: ConfigureCommand[]) {
  return request('/api/configure', {
    method: 'POST',
    body:   JSON.stringify({ commands }),
  }, token);
}

export async function saveRunningConfig(token: string) {
  return request('/api/save', {
    method: 'POST',
    body:   JSON.stringify({}),
  }, token);
}
