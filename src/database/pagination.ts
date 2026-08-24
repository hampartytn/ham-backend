export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export type OffsetPagination = {
  page: number;
  limit: number;
  skip: number;
  take: number;
};

export function offsetPagination(
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT,
): OffsetPagination {
  const safePage = Number.isFinite(page)
    ? Math.max(1, Math.trunc(page))
    : DEFAULT_PAGE;
  const safeLimit = Number.isFinite(limit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)))
    : DEFAULT_LIMIT;

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
  };
}

export function offsetFromQuery(query: {
  page?: unknown;
  limit?: unknown;
}): OffsetPagination {
  return offsetPagination(
    typeof query.page === 'number' ? query.page : DEFAULT_PAGE,
    typeof query.limit === 'number' ? query.limit : DEFAULT_LIMIT,
  );
}
