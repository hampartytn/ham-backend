import { coverageWhere } from './coverage-match';

describe('coverageWhere', () => {
  const districtId = 'district-1';
  const cityId = 'city-1';
  const areaId = 'area-1';

  it('matches district-wide rows for a district search', () => {
    expect(coverageWhere({ districtId })).toEqual({
      OR: [{ districtId, cityId: null, areaId: null }],
    });
  });

  it('includes district-wide and city-wide rows for a city search', () => {
    expect(coverageWhere({ districtId, cityId })).toEqual({
      OR: [
        { districtId, cityId: null, areaId: null },
        { districtId, cityId, areaId: null },
      ],
    });
  });

  it('includes district-wide, city-wide, and area rows for an area search', () => {
    const where = coverageWhere({ districtId, cityId, areaId });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { districtId, cityId: null, areaId: null },
        { districtId, cityId, areaId: null },
        { districtId, areaId },
      ]),
    );
  });
});
