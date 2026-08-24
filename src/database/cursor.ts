export type JobFeedCursor = {
  publishedAt: Date;
  id: string;
};

export function encodeJobCursor(publishedAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ p: publishedAt.toISOString(), i: id }),
    'utf8',
  ).toString('base64url');
}

export function decodeJobCursor(cursor: string): JobFeedCursor | undefined {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { p?: unknown; i?: unknown };
    if (typeof parsed.p !== 'string' || typeof parsed.i !== 'string') {
      return undefined;
    }
    const publishedAt = new Date(parsed.p);
    if (Number.isNaN(publishedAt.getTime()) || parsed.i.length === 0) {
      return undefined;
    }
    return { publishedAt, id: parsed.i };
  } catch {
    return undefined;
  }
}
