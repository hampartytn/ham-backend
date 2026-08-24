import { offsetFromQuery, offsetPagination } from './pagination';

describe('offsetPagination', () => {
  it('applies defaults and a max page size', () => {
    expect(offsetPagination()).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    });
    expect(offsetPagination(2, 200).limit).toBe(50);
    expect(offsetPagination(2, 10)).toEqual({
      page: 2,
      limit: 10,
      skip: 10,
      take: 10,
    });
  });

  it('reads page and limit from a query object', () => {
    expect(offsetFromQuery({})).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    });
    expect(offsetFromQuery({ page: 3, limit: 10 })).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
      take: 10,
    });
  });
});

describe('offsetPagination', () => {
  it('applies defaults and a max page size', () => {
    expect(offsetPagination()).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    });
    expect(offsetPagination(2, 200).limit).toBe(50);
    expect(offsetPagination(2, 10)).toEqual({
      page: 2,
      limit: 10,
      skip: 10,
      take: 10,
    });
  });
});
