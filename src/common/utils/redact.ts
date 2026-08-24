import { DEFAULT_REDACT_KEYS } from '../constants/redact';

const REDACTED = '[Redacted]';

function keySet(extra: string[] = []): Set<string> {
  return new Set(
    [...DEFAULT_REDACT_KEYS, ...extra]
      .map((key) => key.trim())
      .filter((key) => key.length > 0)
      .map((key) => key.toLowerCase()),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function redactSensitive(
  value: unknown,
  extraKeys: string[] = [],
): unknown {
  const forbidden = keySet(extraKeys);
  return redactValue(value, forbidden);
}

function redactValue(value: unknown, forbidden: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, forbidden));
  }
  if (!isRecord(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (forbidden.has(key.toLowerCase())) {
      result[key] = REDACTED;
      continue;
    }
    result[key] = redactValue(nested, forbidden);
  }
  return result;
}

export function buildPinoRedactPaths(extraKeys: string[] = []): string[] {
  const keys = [...new Set([...DEFAULT_REDACT_KEYS, ...extraKeys])].filter(
    (key) => key.trim().length > 0,
  );

  const paths = new Set<string>();
  for (const key of keys) {
    paths.add(key);
    paths.add(`*.${key}`);
    paths.add(`req.headers.${key.toLowerCase()}`);
    paths.add(`req.body.${key}`);
  }
  return [...paths];
}
