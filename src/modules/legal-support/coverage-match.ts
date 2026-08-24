import type { Prisma } from '../../generated/prisma/client';

export type LegalSupportGeoQuery = {
  districtId: string;
  cityId?: string;
  areaId?: string;
};

export function coverageWhere(
  query: LegalSupportGeoQuery,
): Prisma.GeoCoverageWhereInput {
  const matches: Prisma.GeoCoverageWhereInput[] = [
    { districtId: query.districtId, cityId: null, areaId: null },
  ];
  if (query.cityId) {
    matches.push({
      districtId: query.districtId,
      cityId: query.cityId,
      areaId: null,
    });
  }
  if (query.areaId) {
    matches.push({
      districtId: query.districtId,
      areaId: query.areaId,
    });
  }
  return { OR: matches };
}
